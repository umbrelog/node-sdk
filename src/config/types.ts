import type { TrafficConfig } from '../traffic/types';

/** Duration as milliseconds or a string such as `60s`, `5m`, `1h`. */
export type DurationInput = number | string;

export interface LoggingConfig {
  enabled?: boolean;
  runtimeMetadata?: boolean;
  captureFunctionName?: boolean;
  captureUnhandledExceptions?: boolean;
  captureUnhandledRejections?: boolean;
  flushOnShutdown?: boolean;
  flushTimeoutMs?: number;
  captureConsole?: boolean;
  bufferSize?: number;
  bufferTtl?: number;
  configPollInterval?: number;
  enableSensitiveDataMasking?: boolean;
  maskPatterns?: string[];
  sensitiveKeys?: string[];
  enableAttributeExtraction?: boolean;
  enableAttribution?: boolean;
  attributionConfig?: {
    apiKeyHeaders?: string[];
    clientIdHeader?: string;
    ipAddressFields?: string[];
    enableIpAttribution?: boolean;
  };
  /** Extra init-time fields merged into every log (logger-level metadata). */
  serviceMetadata?: Record<string, string | number | boolean>;
  /** Trace / flow correlation across runtime interactions. */
  tracePropagation?: TracePropagationConfig;
}

export type TracePropagationConfig = {
  enabled?: boolean;
  injectOutboundHeaders?: boolean;
  sampling?: {
    enabled?: boolean;
    baseHealthySampleRate?: number;
    targetInteractionsPerMinute?: number;
    minSampleRate?: number;
    maxSampleRate?: number;
  };
};

/**
 * Optional advanced runtime interaction thresholds.
 * Enable collection via `logger.attach*` — not config flags.
 */
export interface RuntimeInteractionsConfig {
  /** Slow-request / slow-query thresholds and capture toggles. */
  traffic?: TrafficConfig;
}

export interface ResourceMetricsConfig {
  /**
   * System-level CPU, memory, network, and disk samples from the host OS.
   * Normalized default: `true` (`DEFAULT_RESOURCE_METRICS.enabled`). Collection starts when
   * `apiKey` (or `authToken`) is also set. Set `false` to disable host samples.
   * @see CONFIG.md — distinct from `lifecycle` (process heap / event loop)
   */
  enabled?: boolean;
  /** Sampling interval, e.g. `60s`. Default `60s` when enabled. Clamped 30s–15m. */
  interval?: DurationInput;
}

export interface LifecycleConfig {
  /** Process lifecycle heartbeats and crash/restart events. Default `true` when apiKey is set. */
  enabled?: boolean;
  /** Heartbeat interval, e.g. `30s`. Default `30s`. Clamped 15s–120s. */
  interval?: DurationInput;
  /** Heap pressure threshold (heapUsed / heapTotal). Default 85. */
  memoryPressurePct?: number;
  /** Event loop p99 delay threshold in ms. Default 500. */
  eventLoopStallMs?: number;
}

/**
 * @deprecated Infrastructure monitoring is configured in the Umbrelog platform
 * (Operational Systems UI/API), not in the SDK. This field is ignored.
 */
export interface OperationalSystemsConfig {
  enabled?: boolean;
  postgres?: boolean;
  mysql?: boolean;
  redis?: boolean;
  kafka?: boolean;
  rabbitmq?: boolean;
  sqs?: boolean;
  pollInterval?: DurationInput;
}

export interface ResolvedLoggingConfig extends Required<
  Omit<
    LoggingConfig,
    | 'attributionConfig'
    | 'serviceMetadata'
    | 'maskPatterns'
    | 'sensitiveKeys'
    | 'bufferTtl'
    | 'configPollInterval'
  >
> {
  bufferTtlMs: number;
  configPollIntervalMs: number;
  maskPatterns: string[];
  sensitiveKeys: string[];
  attributionConfig: LoggingConfig['attributionConfig'];
  serviceMetadata: Record<string, string | number | boolean>;
  tracePropagation: ResolvedTracePropagationConfig;
}

export interface ResolvedTracePropagationConfig {
  enabled: boolean;
  injectOutboundHeaders: boolean;
  sampling: {
    enabled: boolean;
    baseHealthySampleRate: number;
    targetInteractionsPerMinute: number;
    minSampleRate: number;
    maxSampleRate: number;
  };
}

export interface ResolvedRuntimeInteractionsConfig {
  traffic: TrafficConfig;
}

export interface ResolvedResourceMetricsConfig {
  enabled: boolean;
  intervalMs: number;
}

export interface ResolvedLifecycleConfig {
  enabled: boolean;
  intervalMs: number;
  memoryPressurePct: number;
  eventLoopStallMs: number;
}

/** Fully normalized config used internally by the SDK. */
export interface ResolvedLoggerConfig {
  service: string;
  env: string;
  region?: string;
  baseUrl?: string;
  apiKey?: string;
  authToken?: string;
  hardDisableNetwork: boolean;
  debug: boolean;
  logging: ResolvedLoggingConfig;
  runtimeInteractions: ResolvedRuntimeInteractionsConfig;
  resourceMetrics: ResolvedResourceMetricsConfig;
  lifecycle: ResolvedLifecycleConfig;
}

/**
 * @deprecated Flat fields remain supported; prefer nested `logging`, `runtimeInteractions`, etc.
 */
export interface LegacyLoggerConfigFields {
  clientId?: string;
  enabled?: boolean;
  maskPatterns?: string[];
  sensitiveKeys?: string[];
  enableSensitiveDataMasking?: boolean;
  bufferSize?: number;
  bufferTtl?: number;
  configPollInterval?: number;
  enableAttributeExtraction?: boolean;
  enableAttribution?: boolean;
  attributionConfig?: LoggingConfig['attributionConfig'];
  serviceMetadata?: Record<string, string | number | boolean>;
  captureUnhandledExceptions?: boolean;
  captureUnhandledRejections?: boolean;
  runtimeMetadata?: boolean;
  captureFunctionName?: boolean;
  flushOnShutdown?: boolean;
  flushTimeoutMs?: number;
  captureConsole?: boolean;
  debug?: boolean;
  /** @deprecated Use `runtimeInteractions.traffic` or attach APIs. */
  traffic?: TrafficConfig;
}

export interface LoggerConfig extends LegacyLoggerConfigFields {
  service?: string;
  /**
   * @internal Not for customer apps — the SDK resolves Umbrelog Cloud automatically.
   * Reserved for Umbrelog platform development and self-hosted deployments.
   */
  baseUrl?: string;
  env?: string;
  region?: string;
  apiKey?: string;
  authToken?: string;
  hardDisableNetwork?: boolean;
  logging?: LoggingConfig;
  runtimeInteractions?: RuntimeInteractionsConfig;
  resourceMetrics?: ResourceMetricsConfig;
  lifecycle?: LifecycleConfig;
  /** @deprecated Use Umbrelog platform Operational Systems — ignored by SDK. */
  operationalSystems?: OperationalSystemsConfig;
}
