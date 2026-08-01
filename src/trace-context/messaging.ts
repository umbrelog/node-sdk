import { normalizeMessagingTopic } from '../traffic/normalize';
import {
  getTraceContext,
  patchTraceContext,
  runWithTraceContextAsync,
  withRuntimeInteractionContextAsync,
} from './context';
import {
  completeTraceRoot,
  emitTraceRoot,
} from './buffer';
import {
  enrichTraceContext,
  executionStatusFromError,
  mapTraceRootStatusToExecutionStatus,
} from './execution-context';
import { buildTraceContext } from './root';
import {
  injectTraceHeaders,
  readCorrelationIdFromTraceHeaders,
  readParentRuntimeInteractionIdFromHeaders,
  readParentTraceIdFromHeaders,
  readRequestIdFromTraceHeaders,
  readRuntimeInteractionIdFromHeaders,
  readTraceIdFromHeaders,
} from './headers';
import { generateId } from '../utils/id-generator';
import { getTrafficRegistry } from '../traffic/registry';
import {
  buildRuntimeInteractionMetadata,
  emitProviderTraceInteraction,
} from './runtime-interaction';
import type { RuntimeInteractionType, TraceContext, TraceEntryType, TraceRootStatus } from './types';

export type MessagingProvider = 'kafka' | 'rabbitmq' | 'pubsub';

/** Process-discovery entry name — e.g. customer-123-created → customer.created */
export function formatMessagingEntryName(topicOrQueue: string): string {
  const normalized = normalizeMessagingTopic(topicOrQueue);
  if (normalized.includes('.')) return normalized;
  return normalized.replace(/-/g, '.');
}

export function messagingFingerprint(topicOrQueue: string): string {
  return normalizeMessagingTopic(topicOrQueue);
}

function toTraceHeaderBag(
  bag: Record<string, unknown> | undefined,
): Record<string, string | string[] | undefined> | undefined {
  if (!bag) return undefined;
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(bag)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === 'string' ? v : String(v)));
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      out[key] = value.toString('utf8');
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

export function extractTraceFromMessagingBag(bag: Record<string, unknown> | undefined): {
  traceId?: string;
  parentTraceId?: string;
  requestId?: string;
  correlationId?: string;
  parentRuntimeInteractionId?: string;
} {
  const headers = toTraceHeaderBag(bag);
  return {
    traceId: readTraceIdFromHeaders(headers),
    parentTraceId: readParentTraceIdFromHeaders(headers),
    requestId: readRequestIdFromTraceHeaders(headers),
    correlationId: readCorrelationIdFromTraceHeaders(headers),
    parentRuntimeInteractionId:
      readRuntimeInteractionIdFromHeaders(headers) ??
      readParentRuntimeInteractionIdFromHeaders(headers),
  };
}

export function injectTraceIntoMessagingBag(
  bag: Record<string, string>,
  ctx: TraceContext,
): Record<string, string> {
  const headers = new Headers();
  injectTraceHeaders(headers, {
    traceId: ctx.traceId,
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    parentTraceId: ctx.parentTraceId,
    runtimeInteractionId: ctx.runtimeInteractionId,
    parentRuntimeInteractionId: ctx.parentRuntimeInteractionId,
  });
  const out = { ...bag };
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export type MessagingConsumeOptions<T> = {
  provider: MessagingProvider;
  topicOrQueue: string;
  rootService: string;
  headers?: Record<string, unknown>;
  fn: () => T | Promise<T>;
};

function providerToEntryType(provider: MessagingProvider): TraceEntryType {
  if (provider === 'kafka') return 'kafka';
  if (provider === 'rabbitmq') return 'rabbitmq';
  return 'pubsub';
}

function providerToRuntimeInteractionType(provider: MessagingProvider): RuntimeInteractionType {
  if (provider === 'kafka') return 'kafka';
  if (provider === 'rabbitmq') return 'rabbit';
  return 'pubsub';
}

/**
 * Wrap a message consumer: continue or create trace_root, complete on success/failure.
 * Creates trace_root when no incoming traceId (payload-only messages are not lost).
 */
export async function runWithMessagingConsume<T>(
  options: MessagingConsumeOptions<T>,
): Promise<T> {
  const { provider, topicOrQueue, rootService, headers, fn } = options;
  const entryType = providerToEntryType(provider);
  const entryName = formatMessagingEntryName(topicOrQueue);
  const fingerprint = messagingFingerprint(topicOrQueue);
  const extracted = extractTraceFromMessagingBag(headers);
  const started = Date.now();

  let active: TraceContext;
  let isNewRoot: boolean;

  if (extracted.traceId) {
    isNewRoot = false;
    active = enrichTraceContext({
      traceId: extracted.traceId,
      executionId: extracted.traceId,
      process: entryName,
      parentTraceId: extracted.parentTraceId ?? null,
      requestId: extracted.requestId,
      correlationId: extracted.correlationId,
      entryType,
      entryName,
      rootService,
      startedAt: started,
      hot: false,
    });
  } else {
    isNewRoot = true;
    active = buildTraceContext(
      {
        entryType,
        entryName,
        parentTraceId: extracted.parentTraceId ?? null,
        requestId: extracted.requestId,
        correlationId: extracted.correlationId,
      },
      rootService,
    );
    emitTraceRoot(active);
  }

  const interactionId = generateId();
  const interactionType = providerToRuntimeInteractionType(provider);
  const upstreamInteractionId = extracted.parentRuntimeInteractionId;
  let status: TraceRootStatus = 'ok';
  try {
    const result = await runWithTraceContextAsync(active, async () =>
      withRuntimeInteractionContextAsync(
        interactionType,
        interactionId,
        async () => fn(),
        { parentRuntimeInteractionId: upstreamInteractionId ?? null },
      ),
    );
    return result;
  } catch (err) {
    status = 'failed';
    active.hot = true;
    patchTraceContext({ executionStatus: executionStatusFromError(err), hot: true });
    throw err;
  } finally {
    const duration_ms = Math.max(0, Date.now() - started);
    if (isNewRoot) {
      patchTraceContext({ executionStatus: mapTraceRootStatusToExecutionStatus(status) });
      completeTraceRoot(active, status);
    }
    const metadata = buildRuntimeInteractionMetadata({
      runtimeInteractionId: interactionId,
      parentRuntimeInteractionId: upstreamInteractionId,
      runtimeInteractionType: interactionType,
      provider,
      operation: 'consume',
      target: fingerprint,
      status: status === 'failed' ? 'failed' : 'success',
      startedAt: started,
      completedAt: started + duration_ms,
      durationMs: duration_ms,
    });
    emitProviderTraceInteraction(active, {
      interactionKind: 'messaging',
      interactionId,
      parentRuntimeInteractionId: upstreamInteractionId ?? null,
      runtimeInteractionType: interactionType,
      provider,
      operation: 'consume',
      target: fingerprint,
      fingerprint,
      startedAt: started,
      durationMs: duration_ms,
      error: status === 'failed',
      direction: 'consume',
      entryType,
      entryName,
    });
    const registry = getTrafficRegistry();
    if (registry) {
      registry.recordMessaging({
        provider,
        fingerprint,
        direction: 'consume',
        duration_ms,
        occurred_at: started,
        error: status === 'failed',
        metadata,
      });
    }
  }
}

export function runWithKafkaMessage<T>(
  topic: string,
  headers: Record<string, unknown> | undefined,
  rootService: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithMessagingConsume({
    provider: 'kafka',
    topicOrQueue: topic,
    rootService,
    headers,
    fn,
  });
}

export function runWithRabbitMessage<T>(
  queue: string,
  headers: Record<string, unknown> | undefined,
  rootService: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithMessagingConsume({
    provider: 'rabbitmq',
    topicOrQueue: queue,
    rootService,
    headers,
    fn,
  });
}

export function runWithPubSubMessage<T>(
  subscription: string,
  attributes: Record<string, unknown> | undefined,
  rootService: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithMessagingConsume({
    provider: 'pubsub',
    topicOrQueue: subscription,
    rootService,
    headers: attributes,
    fn,
  });
}

export type MessagingPublishOptions<T> = {
  provider: MessagingProvider;
  topicOrQueue: string;
  fn: () => T | Promise<T>;
};

/**
 * Wrap a message publish: each publish gets its own runtime interaction id + type.
 * Trace headers should still be injected separately via injectTraceInto* helpers.
 */
export async function runWithMessagingPublish<T>(
  options: MessagingPublishOptions<T>,
): Promise<T> {
  const { provider, topicOrQueue, fn } = options;
  const ctx = getTraceContext();
  const interactionId = generateId();
  const interactionType = providerToRuntimeInteractionType(provider);
  const fingerprint = messagingFingerprint(topicOrQueue);
  const parentRuntimeInteractionId = ctx?.runtimeInteractionId ?? null;
  const started = Date.now();
  let failed = false;
  try {
    return await withRuntimeInteractionContextAsync(interactionType, interactionId, async () => fn());
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    if (ctx) {
      const duration_ms = Math.max(0, Date.now() - started);
      const metadata = buildRuntimeInteractionMetadata({
        runtimeInteractionId: interactionId,
        parentRuntimeInteractionId: parentRuntimeInteractionId ?? undefined,
        runtimeInteractionType: interactionType,
        provider,
        operation: 'publish',
        target: fingerprint,
        status: failed ? 'failed' : 'success',
        startedAt: started,
        completedAt: started + duration_ms,
        durationMs: duration_ms,
      });
      emitProviderTraceInteraction(ctx, {
        interactionKind: 'messaging',
        interactionId,
        parentRuntimeInteractionId,
        runtimeInteractionType: interactionType,
        provider,
        operation: 'publish',
        target: fingerprint,
        fingerprint,
        startedAt: started,
        durationMs: duration_ms,
        error: failed,
        direction: 'publish',
      });
      const registry = getTrafficRegistry();
      if (registry) {
        registry.recordMessaging({
          provider,
          fingerprint,
          direction: 'publish',
          duration_ms,
          occurred_at: started,
          error: failed,
          metadata,
        });
      }
    }
  }
}

export function runWithKafkaPublish<T>(
  topic: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithMessagingPublish({ provider: 'kafka', topicOrQueue: topic, fn });
}

export function runWithRabbitPublish<T>(
  queue: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithMessagingPublish({ provider: 'rabbitmq', topicOrQueue: queue, fn });
}

export function runWithPubSubPublish<T>(
  topic: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithMessagingPublish({ provider: 'pubsub', topicOrQueue: topic, fn });
}

/** Kafka producer — merge trace headers into a string-keyed headers object. */
export function injectTraceIntoKafkaHeaders(
  headers: Record<string, string>,
  ctx: TraceContext,
): Record<string, string> {
  return injectTraceIntoMessagingBag(headers, ctx);
}

export function injectTraceIntoRabbitHeaders(
  headers: Record<string, string>,
  ctx: TraceContext,
): Record<string, string> {
  return injectTraceIntoMessagingBag(headers, ctx);
}

export function injectTraceIntoPubSubAttributes(
  attributes: Record<string, string>,
  ctx: TraceContext,
): Record<string, string> {
  return injectTraceIntoMessagingBag(attributes, ctx);
}
