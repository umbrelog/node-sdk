import { createInteractionId } from '../../interactions/context';
import { getTraceContext, withRuntimeInteractionContext } from '../../trace-context/context';
import {
  buildRuntimeInteractionMetadata,
  emitProviderTraceInteraction,
  interactionStatusFromError,
} from '../../trace-context/runtime-interaction';
import { normalizeRedisCommand, normalizeRedisKey } from '../normalize';
import type { TrafficRegistry } from '../registry';

/** Canonical Redis command names instrumented automatically. */
export const REDIS_INSTRUMENTED_OPERATIONS = [
  'GET',
  'SET',
  'DEL',
  'MGET',
  'MSET',
  'HGET',
  'HSET',
  'EXPIRE',
  'TTL',
  'EXISTS',
  'INCR',
  'DECR',
  'PUBLISH',
  'SUBSCRIBE',
] as const;

export type RedisInstrumentedOperation = (typeof REDIS_INSTRUMENTED_OPERATIONS)[number];

/** Method names on node-redis / ioredis clients mapped to canonical operations. */
const REDIS_METHOD_TO_OPERATION: Record<string, RedisInstrumentedOperation> = {
  get: 'GET',
  set: 'SET',
  del: 'DEL',
  mGet: 'MGET',
  mget: 'MGET',
  mSet: 'MSET',
  mset: 'MSET',
  hGet: 'HGET',
  hget: 'HGET',
  hSet: 'HSET',
  hset: 'HSET',
  expire: 'EXPIRE',
  ttl: 'TTL',
  exists: 'EXISTS',
  incr: 'INCR',
  decr: 'DECR',
  publish: 'PUBLISH',
  subscribe: 'SUBSCRIBE',
};

type RedisClientLike = Record<string, unknown> & {
  sendCommand?: (args: string[]) => unknown;
};

function extractRedisTarget(operation: RedisInstrumentedOperation, args: unknown[]): string | undefined {
  if (!args.length) return undefined;
  const first = args[0];
  if (typeof first === 'string') return normalizeRedisKey(first);
  if (Array.isArray(first) && typeof first[0] === 'string') return normalizeRedisKey(first[0]);
  if (operation === 'HGET' || operation === 'HSET') {
    const hash = typeof first === 'string' ? normalizeRedisKey(first) : undefined;
    const field = typeof args[1] === 'string' ? args[1] : undefined;
    if (hash && field) return `${hash}:${field}`;
    return hash;
  }
  return undefined;
}

function isTimedOutError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /timeout|ETIMEDOUT|timed out/i.test(message);
}

function recordRedisInteraction(args: {
  registry: TrafficRegistry;
  redisId?: string;
  interactionId: string;
  parentRuntimeInteractionId?: string | null;
  operation: RedisInstrumentedOperation;
  target?: string;
  startedAt: number;
  durationMs: number;
  error?: unknown;
  timedOut?: boolean;
}): void {
  const {
    registry,
    redisId,
    interactionId,
    parentRuntimeInteractionId,
    operation,
    target,
    startedAt,
    durationMs,
    error,
    timedOut,
  } = args;
  const failed = Boolean(error);
  const status = failed ? interactionStatusFromError(error, timedOut) : 'success';
  const completedAt = startedAt + durationMs;
  const fingerprint = normalizeRedisCommand(operation, target);
  const metadata = buildRuntimeInteractionMetadata({
    runtimeInteractionId: interactionId,
    parentRuntimeInteractionId: parentRuntimeInteractionId ?? undefined,
    runtimeInteractionType: 'redis',
    runtimeInteractionVersion: getTraceContext()?.runtimeInteractionVersion,
    runtimeInteractionSource: getTraceContext()?.runtimeInteractionSource,
    provider: 'redis',
    operation,
    target,
    status,
    startedAt,
    completedAt,
    durationMs,
    ...(failed && error instanceof Error ? { error: error.message } : {}),
  });

  registry.recordDatabase({
    provider: 'redis',
    fingerprint,
    database_id: redisId,
    duration_ms: durationMs,
    occurred_at: startedAt,
    error: failed,
    timeout: timedOut ?? false,
    metadata,
  });

  emitProviderTraceInteraction(getTraceContext(), {
    interactionKind: 'cache',
    interactionId,
    parentRuntimeInteractionId,
    runtimeInteractionType: 'redis',
    provider: 'redis',
    operation,
    target,
    fingerprint,
    startedAt,
    durationMs,
    error: failed,
    timeout: timedOut ?? false,
  });
}

function finalizeRedisCall<T>(
  result: T,
  onComplete: (err: unknown | null) => void,
): T {
  const maybePromise = result as unknown;
  if (
    maybePromise &&
    typeof maybePromise === 'object' &&
    typeof (maybePromise as Promise<unknown>).then === 'function'
  ) {
    return (maybePromise as Promise<unknown>)
      .then((value) => {
        onComplete(null);
        return value;
      })
      .catch((err: unknown) => {
        onComplete(err);
        throw err;
      }) as T;
  }
  onComplete(null);
  return result;
}

function wrapRedisMethod(
  client: RedisClientLike,
  methodName: string,
  operation: RedisInstrumentedOperation,
  registry: TrafficRegistry,
  redisId?: string,
): void {
  const original = client[methodName];
  if (typeof original !== 'function') return;
  const bound = (original as (...args: unknown[]) => unknown).bind(client);

  client[methodName] = function instrumentedRedisMethod(...args: unknown[]): unknown {
    const interactionId = createInteractionId();
    const startedAt = Date.now();
    const target = extractRedisTarget(operation, args);
    const parentCtx = getTraceContext();
    const parentRuntimeInteractionId = parentCtx?.runtimeInteractionId ?? null;

    const complete = (err: unknown | null): void => {
      recordRedisInteraction({
        registry,
        redisId,
        interactionId,
        parentRuntimeInteractionId,
        operation,
        target,
        startedAt,
        durationMs: Math.max(0, Date.now() - startedAt),
        error: err ?? undefined,
        timedOut: err ? isTimedOutError(err) : false,
      });
    };

    return withRuntimeInteractionContext('redis', interactionId, () => {
      try {
        return finalizeRedisCall(bound(...args), complete);
      } catch (err) {
        complete(err);
        throw err;
      }
    });
  };
}

function wrapSendCommand(
  client: RedisClientLike,
  registry: TrafficRegistry,
  redisId?: string,
): void {
  const original = client.sendCommand;
  if (typeof original !== 'function') return;
  const bound = original.bind(client);

  client.sendCommand = function instrumentedSendCommand(args: string[]): unknown {
    const rawOp = String(args?.[0] ?? '').toUpperCase();
    const operation = REDIS_INSTRUMENTED_OPERATIONS.includes(rawOp as RedisInstrumentedOperation)
      ? (rawOp as RedisInstrumentedOperation)
      : 'GET';
    const interactionId = createInteractionId();
    const startedAt = Date.now();
    const keyArg = typeof args?.[1] === 'string' ? args[1] : undefined;
    const target = keyArg ? normalizeRedisKey(keyArg) : undefined;
    const parentCtx = getTraceContext();
    const parentRuntimeInteractionId = parentCtx?.runtimeInteractionId ?? null;

    const complete = (err: unknown | null): void => {
      recordRedisInteraction({
        registry,
        redisId,
        interactionId,
        parentRuntimeInteractionId,
        operation,
        target,
        startedAt,
        durationMs: Math.max(0, Date.now() - startedAt),
        error: err ?? undefined,
        timedOut: err ? isTimedOutError(err) : false,
      });
    };

    return withRuntimeInteractionContext('redis', interactionId, () => {
      try {
        return finalizeRedisCall(bound(args), complete);
      } catch (err) {
        complete(err);
        throw err;
      }
    });
  };
}

/**
 * Wrap a node-redis or ioredis client — each supported command creates its own runtime interaction.
 * Requires an active traffic registry (started by logger.attach*).
 */
export function instrumentRedis(
  client: RedisClientLike,
  registry: TrafficRegistry,
  redisId?: string,
): void {
  if (!client || typeof client !== 'object') return;

  for (const [methodName, operation] of Object.entries(REDIS_METHOD_TO_OPERATION)) {
    if (typeof client[methodName] === 'function') {
      wrapRedisMethod(client, methodName, operation, registry, redisId);
    }
  }

  wrapSendCommand(client, registry, redisId);
}

/** @internal Test-only — restore sendCommand if patched. */
export function resetRedisInstrumentationMarkerForTests(): void {
  /* no global patch state */
}
