import { getTraceContext, withRuntimeInteractionContextAsync } from '../../trace-context/context';
import { injectTraceHeaders } from '../../trace-context/headers';
import { isTraceBufferActive } from '../../trace-context/buffer';
import { formatHttpEntryName } from '../../trace-context/http';
import { emitProviderTraceInteraction } from '../../trace-context/runtime-interaction';
import { buildInteractionMetadata, createInteractionId } from '../../interactions/context';
import { getTrafficRegistry } from '../registry';
import { normalizeEndpoint } from '../normalize';

let patched = false;

function mergeInitWithTraceHeaders(init: RequestInit | undefined): RequestInit {
  const ctx = getTraceContext();
  if (!ctx || !isTraceBufferActive()) return init ?? {};

  const headers = new Headers(init?.headers ?? {});
  injectTraceHeaders(headers, {
    traceId: ctx.traceId,
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    parentTraceId: ctx.parentTraceId,
    runtimeInteractionId: ctx.runtimeInteractionId,
    parentRuntimeInteractionId: ctx.parentRuntimeInteractionId,
  });
  return { ...init, headers };
}

/** Patch global fetch once; records via the active traffic registry at call time. */
export function instrumentGlobalFetch(): void {
  if (patched || typeof globalThis.fetch !== 'function') return;
  patched = true;
  const original = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function trafficInstrumentedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const registry = getTrafficRegistry();
    const traceCtx = getTraceContext();
    const mergedInit = mergeInitWithTraceHeaders(init);

    const started = Date.now();
    const interactionId = createInteractionId();
    const requestMeta = buildInteractionMetadata(
      traceCtx
        ? {
            ...(traceCtx.correlationId ? { correlationId: traceCtx.correlationId } : {}),
            ...(traceCtx.requestId ? { requestId: traceCtx.requestId } : {}),
          }
        : undefined,
      interactionId,
    );
    let url = '';
    let method = 'GET';
    try {
      if (typeof input === 'string') url = input;
      else if (input instanceof URL) url = input.toString();
      else url = input.url;
      method = (
        mergedInit?.method ?? init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
    } catch {
      /* ignore */
    }

    const normalizedPath = normalizeEndpoint(url || '/');
    const entryName = formatHttpEntryName(method, url || '/');

    const parentRuntimeInteractionId = traceCtx?.runtimeInteractionId ?? null;

    return withRuntimeInteractionContextAsync('http', interactionId, async () => {
      let response: Response;
      let timedOut = false;
      try {
        response = await original(input, mergedInit);
      } catch (err) {
        const duration_ms = Date.now() - started;
        const msg = err instanceof Error ? err.message : String(err);
        timedOut = /timeout|aborted|ETIMEDOUT/i.test(msg);
        if (registry) {
          registry.recordHttp({
            direction: 'outbound',
            provider: 'fetch',
            fingerprint: normalizedPath,
            method,
            status_code: 0,
            duration_ms,
            timeout: timedOut,
            dependency: tryHost(url),
            metadata: requestMeta,
          });
        }
        if (traceCtx) {
          emitProviderTraceInteraction(traceCtx, {
            interactionKind: 'http',
            interactionId,
            parentRuntimeInteractionId,
            runtimeInteractionType: 'http',
            provider: 'fetch',
            operation: method,
            target: normalizedPath,
            fingerprint: normalizedPath,
            startedAt: started,
            durationMs: duration_ms,
            statusCode: 0,
            error: true,
            timeout: timedOut,
            direction: 'outbound',
            entryType: 'http',
            entryName,
          });
        }
        throw err;
      }

      const duration_ms = Date.now() - started;
      if (registry) {
        registry.recordHttp({
          direction: 'outbound',
          provider: 'fetch',
          fingerprint: normalizedPath,
          method,
          status_code: response.status,
          duration_ms,
          dependency: tryHost(url),
          metadata: requestMeta,
        });
      }
      if (traceCtx) {
        emitProviderTraceInteraction(traceCtx, {
          interactionKind: 'http',
          interactionId,
          parentRuntimeInteractionId,
          runtimeInteractionType: 'http',
          provider: 'fetch',
          operation: method,
          target: normalizedPath,
          fingerprint: normalizedPath,
          startedAt: started,
          durationMs: duration_ms,
          statusCode: response.status,
          error: response.status >= 500,
          direction: 'outbound',
          entryType: 'http',
          entryName,
        });
      }
      return response;
    });
  } as typeof fetch;
}

function tryHost(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** @internal Test-only reset. */
export function resetFetchInstrumentationForTests(): void {
  patched = false;
}

/** @internal Test-only — whether global fetch has been patched. */
export function isGlobalFetchInstrumentedForTests(): boolean {
  return patched;
}
