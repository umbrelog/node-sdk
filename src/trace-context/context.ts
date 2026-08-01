import { AsyncLocalStorage } from 'node:async_hooks';
import { generateId } from '../utils/id-generator';
import { enrichTraceContext } from './execution-context';
import type { RuntimeInteractionType, TraceContext } from './types';
import { DEFAULT_RUNTIME_INTERACTION_VERSION } from './schema';
import type { RuntimeInteractionSource } from './types';

export type RuntimeInteractionScopeOptions = {
  /** Explicit parent — used when continuing a chain from message/bus headers. */
  parentRuntimeInteractionId?: string | null;
  /** Defaults to `auto` for built-in instrumentation. */
  runtimeInteractionSource?: RuntimeInteractionSource;
  /** Defaults to {@link DEFAULT_RUNTIME_INTERACTION_VERSION}. */
  runtimeInteractionVersion?: number;
};

const traceStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/** Patch the active ALS trace context in place (e.g. execution outcome on failure). */
export function patchTraceContext(patch: Partial<TraceContext>): void {
  const store = traceStorage.getStore();
  if (store) Object.assign(store, patch);
}

export function runWithTraceContext<T>(context: TraceContext, fn: () => T): T {
  return traceStorage.run(enrichTraceContext(context), fn);
}

export async function runWithTraceContextAsync<T>(
  context: TraceContext,
  fn: () => Promise<T>,
): Promise<T> {
  return traceStorage.run(enrichTraceContext(context), fn);
}

/**
 * Nest the active trace context with a runtime interaction for the duration of `fn`.
 * Each interaction gets its own id and type (http, postgres, kafka, …).
 */
export function withRuntimeInteractionContext<T>(
  runtimeInteractionType: RuntimeInteractionType,
  runtimeInteractionId: string,
  fn: () => T,
  options?: RuntimeInteractionScopeOptions,
): T {
  const parent = getTraceContext();
  if (!parent) return fn();
  const parentRuntimeInteractionId =
    options && 'parentRuntimeInteractionId' in options
      ? (options.parentRuntimeInteractionId ?? null)
      : (parent.runtimeInteractionId ?? null);
  return runWithTraceContext(
    {
      ...parent,
      parentRuntimeInteractionId,
      runtimeInteractionId,
      runtimeInteractionType,
      runtimeInteractionVersion:
        options?.runtimeInteractionVersion ?? DEFAULT_RUNTIME_INTERACTION_VERSION,
      runtimeInteractionSource: options?.runtimeInteractionSource ?? 'auto',
    },
    fn,
  );
}

/** Async variant of {@link withRuntimeInteractionContext}. */
export async function withRuntimeInteractionContextAsync<T>(
  runtimeInteractionType: RuntimeInteractionType,
  runtimeInteractionId: string,
  fn: () => Promise<T>,
  options?: RuntimeInteractionScopeOptions,
): Promise<T> {
  const parent = getTraceContext();
  if (!parent) return fn();
  const parentRuntimeInteractionId =
    options && 'parentRuntimeInteractionId' in options
      ? (options.parentRuntimeInteractionId ?? null)
      : (parent.runtimeInteractionId ?? null);
  return runWithTraceContextAsync(
    {
      ...parent,
      parentRuntimeInteractionId,
      runtimeInteractionId,
      runtimeInteractionType,
      runtimeInteractionVersion:
        options?.runtimeInteractionVersion ?? DEFAULT_RUNTIME_INTERACTION_VERSION,
      runtimeInteractionSource: options?.runtimeInteractionSource ?? 'auto',
    },
    fn,
  );
}

/**
 * Run `fn` inside a new runtime interaction scope (auto-generated id).
 * Use for Redis, external APIs, or any outbound call without built-in instrumentation.
 */
export function runWithRuntimeInteraction<T>(
  runtimeInteractionType: RuntimeInteractionType,
  fn: () => T,
): T {
  return withRuntimeInteractionContext(runtimeInteractionType, generateId(), fn, {
    runtimeInteractionSource: 'manual',
  });
}

/** Async variant of {@link runWithRuntimeInteraction}. */
export async function runWithRuntimeInteractionAsync<T>(
  runtimeInteractionType: RuntimeInteractionType,
  fn: () => Promise<T>,
): Promise<T> {
  return withRuntimeInteractionContextAsync(runtimeInteractionType, generateId(), fn, {
    runtimeInteractionSource: 'manual',
  });
}

/** Bind a callback so it re-enters the current trace context (EventEmitter listeners, etc.). */
export function bindTraceContext<T extends (...args: never[]) => unknown>(fn: T): T {
  const ctx = getTraceContext();
  if (!ctx) return fn;
  return ((...args: never[]) => runWithTraceContext(ctx, () => fn(...args))) as T;
}

/** Async-safe variant of {@link bindTraceContext}. */
export function bindTraceContextAsync<T extends (...args: never[]) => unknown>(fn: T): T {
  const ctx = getTraceContext();
  if (!ctx) return fn;
  return (async (...args: never[]) =>
    runWithTraceContextAsync(ctx, async () => fn(...args))) as T;
}

/** @internal Test-only reset. */
export function resetTraceContextStorageForTests(): void {
  traceStorage.disable();
}
