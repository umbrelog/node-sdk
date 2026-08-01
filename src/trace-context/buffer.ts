import { generateId } from '../utils/id-generator';
import { DEFAULT_TRACE_SAMPLING, shouldPersistInteraction } from './sampling';
import type { TraceSamplingConfig } from './sampling';
import { enqueueTraceBatch } from './transport';
import type {
  TraceContext,
  TraceInteractionRecord,
  TraceRootRecord,
  TraceTransportConfig,
} from './types';

export type TraceBufferConfig = TraceTransportConfig & {
  sampling?: TraceSamplingConfig;
};

let activeConfig: TraceBufferConfig | null = null;

export function startTraceBuffer(config: TraceBufferConfig): void {
  activeConfig = config;
}

export function stopTraceBuffer(): void {
  activeConfig = null;
}

export function isTraceBufferActive(): boolean {
  return activeConfig !== null;
}

function samplingConfig(): TraceSamplingConfig {
  return activeConfig?.sampling ?? DEFAULT_TRACE_SAMPLING;
}

export function emitTraceRoot(context: TraceContext): void {
  if (!activeConfig) return;
  const root: TraceRootRecord = {
    trace_id: context.traceId,
    parent_trace_id: context.parentTraceId ?? null,
    root_service: context.rootService,
    entry_type: context.entryType ?? 'manual',
    entry_name: context.entryName ?? 'unknown',
    request_id: context.requestId,
    correlation_id: context.correlationId,
    started_at: context.startedAt,
    status: 'open',
    completed_at: null,
    duration_ms: 0,
  };
  const interaction: TraceInteractionRecord = {
    interaction_kind: 'trace_root',
    interaction_id: generateId(),
    trace_id: context.traceId,
    parent_trace_id: context.parentTraceId ?? null,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    service: context.rootService,
    env: activeConfig.env,
    provider: context.entryType ?? 'manual',
    fingerprint: context.entryName ?? 'unknown',
    entry_type: context.entryType,
    entry_name: context.entryName,
    root_service: context.rootService,
    started_at: context.startedAt,
    duration_ms: 0,
  };
  enqueueTraceBatch(activeConfig, { roots: [root], interactions: [interaction] });
}

export function completeTraceRoot(
  context: TraceContext,
  status: TraceRootRecord['status'],
): void {
  if (!activeConfig) return;
  const completedAt = Date.now();
  const durationMs = Math.max(0, completedAt - context.startedAt);
  const root: TraceRootRecord = {
    trace_id: context.traceId,
    parent_trace_id: context.parentTraceId ?? null,
    root_service: context.rootService,
    entry_type: context.entryType ?? 'manual',
    entry_name: context.entryName ?? 'unknown',
    request_id: context.requestId,
    correlation_id: context.correlationId,
    started_at: context.startedAt,
    status,
    completed_at: completedAt,
    duration_ms: durationMs,
  };
  enqueueTraceBatch(activeConfig, { roots: [root], interactions: [] });
}

export function emitTraceInteraction(
  context: TraceContext,
  interaction: Omit<
    TraceInteractionRecord,
    | 'trace_id'
    | 'parent_trace_id'
    | 'request_id'
    | 'correlation_id'
    | 'service'
    | 'env'
    | 'root_service'
  > & { service?: string },
): void {
  if (!activeConfig) return;
  const { service: serviceOverride, ...rest } = interaction;
  const record: TraceInteractionRecord = {
    ...rest,
    parent_runtime_interaction_id:
      rest.parent_runtime_interaction_id ?? context.parentRuntimeInteractionId ?? null,
    trace_id: context.traceId,
    parent_trace_id: context.parentTraceId ?? null,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    service: serviceOverride ?? activeConfig.service,
    env: activeConfig.env,
    root_service: context.rootService,
  };
  const hotTrace = Boolean(context.hot) || Boolean(record.error) || Boolean(record.timeout);
  if (
    !shouldPersistInteraction(record, {
      hotTrace,
      config: samplingConfig(),
    })
  ) {
    return;
  }
  enqueueTraceBatch(activeConfig, { roots: [], interactions: [record] });
}
