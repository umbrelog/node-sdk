import type {
  DatabaseObservation,
  FileObservation,
  HttpObservation,
  MessagingObservation,
  TrafficRegistry,
} from '../traffic/registry';
import { buildInteractionMetadata } from './context';
import { createInteractionId } from './context';
import type { InteractionKind, InteractionObservation } from './types';

function statusFlags(status?: InteractionObservation['status']): {
  error?: boolean;
  timeout?: boolean;
} {
  if (status === 'error') return { error: true };
  if (status === 'timeout') return { timeout: true };
  return {};
}

function metadataFromObservation(obs: InteractionObservation): Record<string, string | number | boolean> {
  const explicit = obs.context ? { ...obs.attributes, ...obs.context } : obs.attributes;
  return buildInteractionMetadata(explicit, obs.interactionId);
}

/**
 * Single entry point for recording a canonical interaction through the traffic registry.
 */
export function recordInteraction(registry: TrafficRegistry, obs: InteractionObservation): void {
  const metadata = metadataFromObservation(obs);
  const flags = statusFlags(obs.status);
  const duration_ms = obs.durationMs;
  const occurred_at = obs.occurredAt;
  const attrs = obs.attributes ?? {};

  switch (obs.kind) {
    case 'http.inbound':
    case 'http.outbound': {
      const httpObs: HttpObservation = {
        direction: obs.kind === 'http.inbound' ? 'inbound' : 'outbound',
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        method: typeof attrs.method === 'string' ? attrs.method : undefined,
        status_code: typeof attrs.statusCode === 'number' ? attrs.statusCode : undefined,
        duration_ms,
        occurred_at,
        dependency: typeof attrs.dependency === 'string' ? attrs.dependency : undefined,
        retry: attrs.retry === true,
        timeout: flags.timeout ?? attrs.timeout === true,
        metadata,
      };
      registry.recordHttp(httpObs);
      return;
    }
    case 'db.query': {
      const dbObs: DatabaseObservation = {
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        database_id: typeof attrs.databaseId === 'string' ? attrs.databaseId : undefined,
        duration_ms,
        occurred_at,
        error: flags.error ?? attrs.error === true,
        retry: attrs.retry === true,
        timeout: flags.timeout ?? attrs.timeout === true,
        metadata,
      };
      registry.recordDatabase(dbObs);
      return;
    }
    case 'messaging.publish':
    case 'messaging.consume': {
      const msgObs: MessagingObservation = {
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        direction: obs.kind === 'messaging.publish' ? 'publish' : 'consume',
        duration_ms,
        occurred_at,
        error: flags.error ?? attrs.error === true,
        retry: attrs.retry === true,
        timeout: flags.timeout ?? attrs.timeout === true,
        dead_letter: attrs.deadLetter === true,
        lag_spike: attrs.lagSpike === true,
        metadata,
      };
      registry.recordMessaging(msgObs);
      return;
    }
    case 'file.upload':
    case 'file.download': {
      const fileObs: FileObservation = {
        provider: obs.provider,
        fingerprint: obs.fingerprint,
        duration_ms,
        occurred_at,
        file_size_bytes:
          typeof attrs.fileSizeBytes === 'number' ? attrs.fileSizeBytes : undefined,
        error: flags.error ?? attrs.error === true,
        retry: attrs.retry === true,
        timeout: flags.timeout ?? attrs.timeout === true,
        status_code: typeof attrs.statusCode === 'number' ? attrs.statusCode : undefined,
        operation: obs.kind === 'file.upload' ? 'upload' : 'download',
        metadata,
      };
      registry.recordFile(fileObs);
      return;
    }
    default: {
      const _exhaustive: never = obs.kind;
      return _exhaustive;
    }
  }
}

/** Build an observation from instrumentation helpers (generates interactionId). */
export function createInteractionObservation(
  partial: Omit<InteractionObservation, 'interactionId'> & { interactionId?: string },
): InteractionObservation {
  return {
    ...partial,
    interactionId: partial.interactionId ?? createInteractionId(),
  };
}

export function httpInteractionKind(direction: 'inbound' | 'outbound'): InteractionKind {
  return direction === 'inbound' ? 'http.inbound' : 'http.outbound';
}
