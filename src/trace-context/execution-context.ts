import type { ExecutionStatus, TraceContext, TraceRootStatus } from './types';

/** Map trace-root completion status to execution outcome on logs. */
export function mapTraceRootStatusToExecutionStatus(status: TraceRootStatus): ExecutionStatus {
  if (status === 'failed') return 'failed';
  if (status === 'ok' || status === 'slow') return 'success';
  return 'running';
}

/** Infer execution outcome from a thrown error when the trace root has not completed yet. */
export function executionStatusFromError(err: unknown): ExecutionStatus {
  if (err && typeof err === 'object') {
    const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
    if (name === 'AbortError') return 'cancelled';
    const message = 'message' in err && typeof err.message === 'string' ? err.message : '';
    if (/timeout|ETIMEDOUT|timed out/i.test(message)) return 'timeout';
  }
  return 'failed';
}

/** Normalize execution-scoped fields on a trace context store value. */
export function enrichTraceContext(ctx: TraceContext): TraceContext {
  return {
    ...ctx,
    executionId: ctx.executionId ?? ctx.traceId,
    process: ctx.process ?? ctx.entryName,
    executionStatus: ctx.executionStatus ?? 'running',
  };
}

/** Apply execution context fields to structured log attributes when not explicitly set. */
export function applyExecutionContextToAttributes(
  attributes: Record<string, unknown>,
  traceCtx: TraceContext | undefined,
): void {
  if (!traceCtx) return;
  if (attributes.traceId === undefined) attributes.traceId = traceCtx.traceId;
  if (attributes.executionId === undefined && traceCtx.executionId) {
    attributes.executionId = traceCtx.executionId;
  }
  if (attributes.requestId === undefined && traceCtx.requestId) {
    attributes.requestId = traceCtx.requestId;
  }
  if (attributes.correlationId === undefined && traceCtx.correlationId) {
    attributes.correlationId = traceCtx.correlationId;
  }
  if (attributes.parentTraceId === undefined && traceCtx.parentTraceId) {
    attributes.parentTraceId = traceCtx.parentTraceId;
  }
  if (attributes.process === undefined && traceCtx.process) {
    attributes.process = traceCtx.process;
  }
  if (attributes.runtimeInteractionId === undefined && traceCtx.runtimeInteractionId) {
    attributes.runtimeInteractionId = traceCtx.runtimeInteractionId;
  }
  if (attributes.runtimeInteractionType === undefined && traceCtx.runtimeInteractionType) {
    attributes.runtimeInteractionType = traceCtx.runtimeInteractionType;
  }
  if (attributes.parentRuntimeInteractionId === undefined && traceCtx.parentRuntimeInteractionId) {
    attributes.parentRuntimeInteractionId = traceCtx.parentRuntimeInteractionId;
  }
  if (attributes.runtimeInteractionVersion === undefined && traceCtx.runtimeInteractionVersion) {
    attributes.runtimeInteractionVersion = traceCtx.runtimeInteractionVersion;
  }
  if (attributes.runtimeInteractionSource === undefined && traceCtx.runtimeInteractionSource) {
    attributes.runtimeInteractionSource = traceCtx.runtimeInteractionSource;
  }
  if (attributes.executionStatus === undefined && traceCtx.executionStatus) {
    attributes.executionStatus = traceCtx.executionStatus;
  }
  if (attributes.executionOutcome === undefined && traceCtx.executionStatus) {
    attributes.executionOutcome = traceCtx.executionStatus;
  }
}
