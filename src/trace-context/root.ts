import { runWithTraceContextAsync, patchTraceContext, withRuntimeInteractionContextAsync } from './context';
import { completeTraceRoot, emitTraceRoot } from './buffer';
import { enrichTraceContext, executionStatusFromError, mapTraceRootStatusToExecutionStatus } from './execution-context';
import { generateCorrelationId, generateRequestId, generateTraceId } from './ids';
import { generateId } from '../utils/id-generator';
import type { RuntimeInteractionType, TraceContext, TraceEntryType, TraceRootInput, TraceRootStatus } from './types';

function entryTypeToRuntimeInteraction(entryType?: TraceEntryType): RuntimeInteractionType {
  switch (entryType) {
    case 'http':
      return 'http';
    case 'kafka':
      return 'kafka';
    case 'rabbitmq':
      return 'rabbit';
    case 'pubsub':
      return 'pubsub';
    case 'cron':
      return 'cron';
    default:
      return 'cron';
  }
}

export function buildTraceContext(
  input: TraceRootInput,
  rootService: string,
  existingTraceId?: string,
): TraceContext {
  const startedAt = Date.now();
  const traceId = existingTraceId ?? generateTraceId();
  return enrichTraceContext({
    traceId,
    executionId: traceId,
    process: input.process ?? input.entryName,
    parentTraceId: input.parentTraceId ?? null,
    requestId: input.requestId ?? generateRequestId(),
    correlationId: input.correlationId ?? generateCorrelationId(),
    entryType: input.entryType,
    entryName: input.entryName,
    rootService,
    startedAt,
    hot: false,
  });
}

export async function runWithTraceRoot<T>(
  input: TraceRootInput,
  rootService: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const context = buildTraceContext(input, rootService);
  emitTraceRoot(context);
  const rootInteractionId = generateId();
  const rootInteractionType = entryTypeToRuntimeInteraction(input.entryType);
  let status: TraceRootStatus = 'ok';
  try {
    const result = await runWithTraceContextAsync(context, async () =>
      withRuntimeInteractionContextAsync(rootInteractionType, rootInteractionId, async () => fn(), {
        runtimeInteractionSource: 'sdk',
      }),
    );
    return result;
  } catch (err) {
    status = 'failed';
    context.hot = true;
    patchTraceContext({ executionStatus: executionStatusFromError(err), hot: true });
    throw err;
  } finally {
    patchTraceContext({ executionStatus: mapTraceRootStatusToExecutionStatus(status) });
    completeTraceRoot(context, status);
  }
}
