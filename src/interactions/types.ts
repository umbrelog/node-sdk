/**
 * Canonical runtime interaction model (tracing-ready).
 * Internal observations map to traffic registry / transport via adapters.
 */

/** Stable interaction taxonomy — extend here when adding providers. */
export type InteractionKind =
  | 'http.inbound'
  | 'http.outbound'
  | 'db.query'
  | 'messaging.publish'
  | 'messaging.consume'
  | 'file.upload'
  | 'file.download';

export type InteractionStatus = 'ok' | 'error' | 'timeout';

/** Metadata key on persisted traffic events for per-span identity. */
export const INTERACTION_ID_KEY = 'interactionId';

/** Optional explicit fields on a recorded interaction (e.g. from inbound HTTP headers). */
export type InteractionContextMetadata = {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  tenantId?: string;
};

export type InteractionObservation = {
  /** Unique id for this interaction instance (span-ready). */
  interactionId: string;
  kind: InteractionKind;
  /** Provider id, e.g. `express`, `postgresql`, `kafka`. */
  provider: string;
  /** Normalized route / query / topic / object key fingerprint. */
  fingerprint: string;
  durationMs: number;
  occurredAt?: number;
  status?: InteractionStatus;
  /** Provider-specific dimensions (method, statusCode, databaseId, …). */
  attributes?: Record<string, string | number | boolean>;
  context?: InteractionContextMetadata;
};

/** Maps interaction kinds to traffic rollup categories. */
export type InteractionTrafficCategory = 'http' | 'database' | 'messaging' | 'files';

export function interactionKindToTrafficCategory(
  kind: InteractionKind,
): InteractionTrafficCategory {
  if (kind.startsWith('http.')) return 'http';
  if (kind === 'db.query') return 'database';
  if (kind.startsWith('messaging.')) return 'messaging';
  return 'files';
}
