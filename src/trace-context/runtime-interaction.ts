import type {
  RuntimeInteractionSource,
  RuntimeInteractionType,
  TraceContext,
  TraceInteractionKind,
} from './types';
import { DEFAULT_RUNTIME_INTERACTION_VERSION } from './schema';
import { emitTraceInteraction, isTraceBufferActive } from './buffer';

/** Outcome of a single runtime interaction span. */
export type RuntimeInteractionStatus = 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

/** Standard metadata fields persisted on every runtime interaction regardless of provider. */
export type RuntimeInteractionMetadata = {
  runtimeInteractionId: string;
  parentRuntimeInteractionId?: string;
  runtimeInteractionType: RuntimeInteractionType;
  runtimeInteractionVersion?: number;
  runtimeInteractionSource?: RuntimeInteractionSource;
  provider: string;
  operation: string;
  target?: string;
  status: RuntimeInteractionStatus;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  error?: string;
};

export function buildRuntimeInteractionMetadata(
  fields: RuntimeInteractionMetadata,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    runtimeInteractionId: fields.runtimeInteractionId,
    runtimeInteractionType: fields.runtimeInteractionType,
    runtimeInteractionVersion:
      fields.runtimeInteractionVersion ?? DEFAULT_RUNTIME_INTERACTION_VERSION,
    runtimeInteractionSource: fields.runtimeInteractionSource ?? 'auto',
    provider: fields.provider,
    operation: fields.operation,
    status: fields.status,
    startedAt: fields.startedAt,
    completedAt: fields.completedAt,
    durationMs: fields.durationMs,
  };
  if (fields.parentRuntimeInteractionId) {
    out.parentRuntimeInteractionId = fields.parentRuntimeInteractionId;
  }
  if (fields.target) out.target = fields.target;
  if (fields.error) out.error = fields.error;
  return out;
}

export function interactionStatusFromError(err: unknown, timedOut = false): RuntimeInteractionStatus {
  if (timedOut) return 'timeout';
  if (err && typeof err === 'object') {
    const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
    if (name === 'AbortError') return 'cancelled';
    const message = 'message' in err && typeof err.message === 'string' ? err.message : '';
    if (/timeout|ETIMEDOUT|timed out/i.test(message)) return 'timeout';
  }
  return 'failed';
}

/** Emit a trace interaction with the standard runtime interaction metadata model. */
export function emitProviderTraceInteraction(
  context: TraceContext | undefined,
  fields: {
    interactionKind: TraceInteractionKind;
    interactionId: string;
    parentRuntimeInteractionId?: string | null;
    runtimeInteractionType: RuntimeInteractionType;
    runtimeInteractionVersion?: number;
    runtimeInteractionSource?: RuntimeInteractionSource;
    provider: string;
    operation: string;
    target?: string;
    fingerprint: string;
    startedAt: number;
    durationMs: number;
    error?: boolean;
    timeout?: boolean;
    direction?: string;
    statusCode?: number;
    entryType?: string;
    entryName?: string;
  },
): void {
  if (!context || !isTraceBufferActive()) return;
  const completedAt = fields.startedAt + fields.durationMs;
  const status: RuntimeInteractionStatus = fields.timeout
    ? 'timeout'
    : fields.error
      ? 'failed'
      : 'success';
  const metadata = buildRuntimeInteractionMetadata({
    runtimeInteractionId: fields.interactionId,
    parentRuntimeInteractionId: fields.parentRuntimeInteractionId ?? undefined,
    runtimeInteractionType: fields.runtimeInteractionType,
    runtimeInteractionVersion: fields.runtimeInteractionVersion ?? context.runtimeInteractionVersion,
    runtimeInteractionSource: fields.runtimeInteractionSource ?? context.runtimeInteractionSource,
    provider: fields.provider,
    operation: fields.operation,
    target: fields.target,
    status,
    startedAt: fields.startedAt,
    completedAt,
    durationMs: fields.durationMs,
  });
  emitTraceInteraction(context, {
    interaction_kind: fields.interactionKind,
    interaction_id: fields.interactionId,
    parent_runtime_interaction_id: fields.parentRuntimeInteractionId ?? null,
    provider: fields.provider,
    direction: fields.direction,
    fingerprint: fields.fingerprint,
    entry_type: fields.entryType,
    entry_name: fields.entryName,
    started_at: fields.startedAt,
    duration_ms: fields.durationMs,
    status_code: fields.statusCode,
    error: fields.error,
    timeout: fields.timeout,
    metadata,
  });
}
