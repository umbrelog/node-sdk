import { buildInteractionMetadata } from '../interactions/context';
import type { FileTransferReport, MessagingLifecycleReport } from './lifecycle-types';
import { TrafficRollup } from './rollup';
import type { ResolvedTrafficThresholds } from './thresholds';
import type {
  TrafficCategory,
  TrafficConfig,
  TrafficRawEvent,
  TrafficSdkConfig,
} from './types';
import { resolveTrafficThresholds } from './thresholds';
import { enqueueTrafficBatch } from './transport';

export type TrafficRegistry = {
  recordHttp: (args: HttpObservation) => void;
  recordDatabase: (args: DatabaseObservation) => void;
  recordMessaging: (args: MessagingObservation) => void;
  recordMessagingLifecycle: (report: MessagingLifecycleReport) => void;
  recordFile: (args: FileObservation) => void;
  recordFileTransfer: (report: FileTransferReport) => void;
  shutdown: () => void;
};

export type HttpObservation = {
  direction: 'inbound' | 'outbound';
  provider: string;
  fingerprint: string;
  method?: string;
  status_code?: number;
  duration_ms: number;
  occurred_at?: number;
  retry?: boolean;
  timeout?: boolean;
  dependency?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type DatabaseObservation = {
  provider: 'postgresql' | 'mysql' | string;
  fingerprint: string;
  database_id?: string;
  duration_ms: number;
  occurred_at?: number;
  error?: boolean;
  retry?: boolean;
  timeout?: boolean;
  metadata?: Record<string, string | number | boolean>;
};

export type MessagingObservation = {
  provider: string;
  fingerprint: string;
  direction: 'publish' | 'consume';
  duration_ms: number;
  occurred_at?: number;
  retry?: boolean;
  timeout?: boolean;
  error?: boolean;
  dead_letter?: boolean;
  lag_spike?: boolean;
  metadata?: Record<string, string | number | boolean>;
};

export type FileObservation = {
  provider: string;
  fingerprint: string;
  duration_ms: number;
  file_size_bytes?: number;
  occurred_at?: number;
  error?: boolean;
  retry?: boolean;
  timeout?: boolean;
  status_code?: number;
  operation?: 'upload' | 'download';
  metadata?: Record<string, string | number | boolean>;
};

let activeRegistry: TrafficRegistry | null = null;

export function getTrafficRegistry(): TrafficRegistry | null {
  return activeRegistry;
}

function shouldPersistHttp(
  obs: HttpObservation,
  thresholds: ResolvedTrafficThresholds,
  cfg: TrafficConfig['http'],
): boolean {
  if (obs.timeout && cfg?.captureTimeouts !== false) return true;
  if (obs.retry && cfg?.captureRetries) return true;
  if ((obs.status_code ?? 0) >= 500 && cfg?.captureFailures !== false) return true;
  if (obs.duration_ms >= thresholds.httpSlowMs) return true;
  return false;
}

function shouldPersistDb(
  obs: DatabaseObservation,
  thresholds: ResolvedTrafficThresholds,
  cfg: TrafficConfig['database'],
): boolean {
  if (obs.timeout && cfg?.captureTimeouts !== false) return true;
  if (obs.retry && cfg?.captureRetries) return true;
  if (obs.error && cfg?.captureErrors !== false) return true;
  if (obs.duration_ms >= thresholds.dbSlowMs) return true;
  return false;
}

function shouldPersistMessaging(
  obs: MessagingObservation,
  thresholds: ResolvedTrafficThresholds,
  cfg: TrafficConfig['messaging'],
): boolean {
  if (obs.dead_letter && cfg?.captureDLQ) return true;
  if (obs.lag_spike) return true;
  if (obs.retry && cfg?.captureRetries) return true;
  if (obs.error) return true;
  const slowMs =
    obs.direction === 'consume'
      ? thresholds.messagingConsumerSlowMs
      : thresholds.messagingPublishSlowMs;
  if (obs.duration_ms >= slowMs) return true;
  return false;
}

function shouldPersistMessagingLifecycle(
  report: MessagingLifecycleReport,
  thresholds: ResolvedTrafficThresholds,
  cfg: TrafficConfig['messaging'],
): boolean {
  if (report.dlq && cfg?.captureDLQ) return true;
  if (report.rebalance && cfg?.captureRebalances) return true;
  if (report.commit_failed && cfg?.captureCommitFailures) return true;
  if (report.nack) return true;
  if (report.handler_error) return true;
  if (report.ack_blocked) return true;
  if ((report.retry_count ?? 0) > 0 && cfg?.captureRetries) return true;
  if (report.lag_ms != null && report.lag_ms >= thresholds.messagingConsumerSlowMs) return true;
  if (report.processing_duration_ms >= thresholds.messagingConsumerSlowMs) return true;
  const ackMs = report.ack_duration_ms ?? 0;
  if (ackMs >= thresholds.messagingAckSlowMs) return true;
  const commitMs = report.commit_duration_ms ?? 0;
  if (commitMs >= thresholds.messagingCommitSlowMs) return true;
  if (ackMs > 0 && ackMs > report.processing_duration_ms * 3) return true;
  return false;
}

function shouldPersistFileTransfer(
  report: FileTransferReport,
  thresholds: ResolvedTrafficThresholds,
  cfg: TrafficConfig['files'],
): boolean {
  if (report.operation === 'download') {
    if (cfg?.captureAnomalousDownloads === false) return false;
    if (report.error || report.timeout || (report.retry_count ?? 0) > 0) return true;
    const slowMs =
      report.operation === 'download' ? thresholds.fileDownloadSlowMs : thresholds.fileSlowMs;
    return report.duration_ms >= slowMs;
  }
  if (report.error || report.timeout || report.partial_failure) return true;
  if ((report.retry_count ?? 0) > 0 && cfg?.captureUploadRetries !== false) return true;
  if (report.duration_ms >= thresholds.fileSlowMs) return true;
  return false;
}

export function createTrafficRegistry(config: TrafficSdkConfig): TrafficRegistry {
  const trafficCfg = config.traffic ?? {};
  const thresholds = resolveTrafficThresholds(trafficCfg, config.debug);
  const rollup = new TrafficRollup();
  const pendingEvents: TrafficRawEvent[] = [];
  const MAX_EVENTS = 128;

  const transportConfig = {
    apiKey: config.apiKey,
    service: config.service,
    env: config.env ?? '',
    baseUrl: config.baseUrl,
    debug: config.debug,
  };

  const flush = (): void => {
    const aggregates = [...rollup.flushReady(), ...rollup.flushAll()];
    const events = pendingEvents.splice(0, pendingEvents.length);
    if (aggregates.length === 0 && events.length === 0) return;
    enqueueTrafficBatch(transportConfig, { aggregates, events });
  };

  const interval = setInterval(flush, 30_000);
  if (typeof interval === 'object' && 'unref' in interval) {
    (interval as NodeJS.Timeout).unref();
  }

  const pushEvent = (event: TrafficRawEvent): void => {
    pendingEvents.push(event);
    if (pendingEvents.length > MAX_EVENTS) {
      pendingEvents.splice(0, pendingEvents.length - MAX_EVENTS);
    }
  };

  const record = (
    category: TrafficCategory,
    obs: {
      direction?: string;
      provider: string;
      fingerprint: string;
      method?: string;
      status_code?: number;
      duration_ms: number;
      processing_duration_ms?: number;
      ack_duration_ms?: number;
      commit_duration_ms?: number;
      occurred_at: number;
      database_id?: string;
      dependency?: string;
      consumer_group?: string;
      file_size_bytes?: number;
      lifecycle_phase?: string;
      secondary_duration_ms?: number;
      file_operation?: 'upload' | 'download';
      dlq?: boolean;
      nack?: boolean;
      is_slow: boolean;
      is_error: boolean;
      is_retry: boolean;
      is_timeout: boolean;
      is_query: boolean;
      is_dlq?: boolean;
      is_nack?: boolean;
      is_commit_failure?: boolean;
      is_rebalance?: boolean;
      is_lag_spike?: boolean;
      retry_increment?: number;
      persist: boolean;
      metadata?: Record<string, string | number | boolean>;
    },
  ): void => {
    rollup.record({
      category,
      direction: obs.direction,
      provider: obs.provider,
      fingerprint: obs.fingerprint,
      method: obs.method,
      database_id: obs.database_id,
      dependency: obs.dependency,
      consumer_group: obs.consumer_group,
      duration_ms: obs.duration_ms,
      processing_duration_ms: obs.processing_duration_ms,
      ack_duration_ms: obs.ack_duration_ms,
      commit_duration_ms: obs.commit_duration_ms,
      occurred_at: obs.occurred_at,
      is_slow: obs.is_slow,
      is_error: obs.is_error,
      is_retry: obs.is_retry,
      is_timeout: obs.is_timeout,
      is_query: obs.is_query,
      is_dlq: obs.is_dlq,
      is_nack: obs.is_nack,
      is_commit_failure: obs.is_commit_failure,
      is_rebalance: obs.is_rebalance,
      is_lag_spike: obs.is_lag_spike,
      retry_increment: obs.retry_increment,
    });
    if (!obs.persist) return;
    const metadata = buildInteractionMetadata(obs.metadata);
    pushEvent({
      category,
      direction: obs.direction as TrafficRawEvent['direction'],
      provider: obs.provider,
      fingerprint: obs.fingerprint,
      method: obs.method,
      status_code: obs.status_code,
      duration_ms: obs.duration_ms,
      occurred_at: obs.occurred_at,
      error: obs.is_error,
      retry: obs.is_retry,
      timeout: obs.is_timeout,
      database_id: obs.database_id,
      dependency: obs.dependency,
      file_size_bytes: obs.file_size_bytes,
      lifecycle_phase: obs.lifecycle_phase,
      secondary_duration_ms: obs.secondary_duration_ms,
      file_operation: obs.file_operation,
      consumer_group: obs.consumer_group,
      dlq: obs.dlq,
      nack: obs.nack,
      ...(metadata ? { metadata } : {}),
    });
  };

  const registry: TrafficRegistry = {
    recordHttp(obs) {
      if (!trafficCfg.http?.enabled) return;
      const occurred_at = obs.occurred_at ?? Date.now();
      const is_error = (obs.status_code ?? 0) >= 500;
      const is_slow = obs.duration_ms >= thresholds.httpSlowMs;
      record('http', {
        direction: obs.direction,
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        method: obs.method,
        status_code: obs.status_code,
        duration_ms: obs.duration_ms,
        occurred_at,
        dependency: obs.dependency,
        metadata: obs.metadata,
        is_slow,
        is_error,
        is_retry: !!obs.retry,
        is_timeout: !!obs.timeout,
        is_query: false,
        persist: shouldPersistHttp(obs, thresholds, trafficCfg.http),
      });
    },

    recordDatabase(obs) {
      if (!trafficCfg.database?.enabled) return;
      const occurred_at = obs.occurred_at ?? Date.now();
      const is_slow = obs.duration_ms >= thresholds.dbSlowMs;
      record('database', {
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        database_id: obs.database_id,
        duration_ms: obs.duration_ms,
        occurred_at,
        metadata: obs.metadata,
        is_slow,
        is_error: !!obs.error,
        is_retry: !!obs.retry,
        is_timeout: !!obs.timeout,
        is_query: true,
        persist: shouldPersistDb(obs, thresholds, trafficCfg.database),
      });
    },

    recordMessaging(obs) {
      if (!trafficCfg.messaging?.enabled) return;
      const occurred_at = obs.occurred_at ?? Date.now();
      const slowMs =
        obs.direction === 'consume'
          ? thresholds.messagingConsumerSlowMs
          : thresholds.messagingPublishSlowMs;
      const is_slow = obs.duration_ms >= slowMs;
      record('messaging', {
        direction: obs.direction,
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        duration_ms: obs.duration_ms,
        occurred_at,
        metadata: obs.metadata,
        is_slow,
        is_error: !!obs.error || !!obs.dead_letter,
        is_retry: !!obs.retry,
        is_timeout: !!obs.timeout,
        is_query: false,
        persist: shouldPersistMessaging(obs, thresholds, trafficCfg.messaging),
      });
    },

    recordMessagingLifecycle(report) {
      if (!trafficCfg.messaging?.enabled) return;
      const occurred_at = report.occurred_at ?? Date.now();
      const ackMs = report.ack_duration_ms ?? 0;
      const commitMs = report.commit_duration_ms ?? 0;
      const secondary = ackMs > 0 ? ackMs : commitMs > 0 ? commitMs : undefined;
      const totalMs = report.processing_duration_ms + (secondary ?? 0);
      const is_slow = report.processing_duration_ms >= thresholds.messagingConsumerSlowMs;
      const persist = shouldPersistMessagingLifecycle(report, thresholds, trafficCfg.messaging);
      let lifecycle_phase = 'processing';
      if (report.dlq) lifecycle_phase = 'dlq';
      else if (report.nack) lifecycle_phase = 'nack';
      else if (report.rebalance) lifecycle_phase = 'rebalance';
      else if (report.commit_failed) lifecycle_phase = 'handler_failure';
      else if (report.ack_blocked) lifecycle_phase = 'ack';
      else if (commitMs > 0) lifecycle_phase = 'commit';
      else if (ackMs > 0) lifecycle_phase = 'ack';

      record('messaging', {
        direction: 'consume',
        provider: report.provider,
        fingerprint: report.queue_or_topic,
        duration_ms: totalMs,
        processing_duration_ms: report.processing_duration_ms,
        ack_duration_ms: ackMs > 0 ? ackMs : undefined,
        commit_duration_ms: commitMs > 0 ? commitMs : undefined,
        occurred_at,
        consumer_group: report.consumer_group,
        lifecycle_phase,
        secondary_duration_ms: secondary,
        is_slow,
        is_error: !!report.handler_error || !!report.dlq || !!report.commit_failed,
        is_retry: (report.retry_count ?? 0) > 0,
        is_timeout: !!report.ack_blocked,
        is_query: false,
        is_dlq: !!report.dlq,
        is_nack: !!report.nack,
        is_commit_failure: !!report.commit_failed,
        is_rebalance: !!report.rebalance,
        is_lag_spike: report.lag_ms != null && report.lag_ms >= thresholds.messagingConsumerSlowMs,
        retry_increment: report.retry_count,
        dlq: report.dlq,
        nack: report.nack,
        persist,
      });
    },

    recordFile(obs) {
      if (!trafficCfg.files?.enabled) return;
      const occurred_at = obs.occurred_at ?? Date.now();
      const op = obs.operation ?? 'upload';
      const slowMs = op === 'download' ? thresholds.fileDownloadSlowMs : thresholds.fileSlowMs;
      const is_slow = obs.duration_ms >= slowMs;
      const persist =
        op === 'download'
          ? !!(obs.error || obs.retry || obs.timeout || is_slow)
          : !!(obs.error || obs.retry || obs.timeout || is_slow);
      record('files', {
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        duration_ms: obs.duration_ms,
        occurred_at,
        file_size_bytes: obs.file_size_bytes,
        status_code: obs.status_code,
        file_operation: op,
        metadata: obs.metadata,
        is_slow,
        is_error: !!obs.error,
        is_retry: !!obs.retry,
        is_timeout: !!obs.timeout,
        is_query: false,
        persist,
      });
    },

    recordFileTransfer(report) {
      if (!trafficCfg.files?.enabled) return;
      const occurred_at = report.occurred_at ?? Date.now();
      const slowMs =
        report.operation === 'download' ? thresholds.fileDownloadSlowMs : thresholds.fileSlowMs;
      const is_slow = report.duration_ms >= slowMs;
      const persist = shouldPersistFileTransfer(report, thresholds, trafficCfg.files);
      record('files', {
        provider: report.provider,
        fingerprint: report.destination,
        duration_ms: report.duration_ms,
        occurred_at,
        file_size_bytes: report.file_size_bytes,
        status_code: report.status_code,
        file_operation: report.operation,
        lifecycle_phase: report.partial_failure ? 'partial' : report.error ? 'failed' : 'completed',
        is_slow,
        is_error: !!report.error || !!report.partial_failure,
        is_retry: (report.retry_count ?? 0) > 0,
        is_timeout: !!report.timeout,
        is_query: false,
        retry_increment: report.retry_count,
        persist,
      });
    },

    shutdown() {
      clearInterval(interval);
      flush();
      if (activeRegistry === registry) activeRegistry = null;
    },
  };

  activeRegistry = registry;
  return registry;
}
