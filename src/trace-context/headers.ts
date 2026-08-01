function readScalarHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  const direct = headers[name] ?? headers[lower] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) return readScalarHeaderValue(direct[0]);
  return readScalarHeaderValue(direct);
}

function readScalarHeaderValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse W3C traceparent: version-traceid-spanid-flags */
export function readTraceIdFromTraceparent(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = readScalarHeader(headers, 'traceparent');
  if (!raw) return undefined;
  const parts = raw.split('-');
  if (parts.length < 4) return undefined;
  const traceId = parts[1]?.toLowerCase();
  if (!traceId || traceId.length !== 32 || !/^[0-9a-f]+$/.test(traceId)) return undefined;
  if (/^0+$/.test(traceId)) return undefined;
  return traceId;
}

export function readTraceIdFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const direct = readScalarHeader(headers, 'x-trace-id');
  if (direct) return direct.toLowerCase();
  return readTraceIdFromTraceparent(headers);
}

export function readParentTraceIdFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  return readScalarHeader(headers, 'x-parent-trace-id');
}

export function readRequestIdFromTraceHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  return readScalarHeader(headers, 'x-request-id');
}

export function readCorrelationIdFromTraceHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  return readScalarHeader(headers, 'x-correlation-id');
}

export function readParentRuntimeInteractionIdFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  return readScalarHeader(headers, 'x-parent-runtime-interaction-id');
}

export function readRuntimeInteractionIdFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  return readScalarHeader(headers, 'x-runtime-interaction-id');
}

/** Read execution context propagation schema version from inbound headers. */
export function readExecutionContextSchemaVersionFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): number | undefined {
  const raw = readScalarHeader(headers, 'x-umbrelog-schema-version');
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function formatTraceparent(traceId: string): string {
  const spanId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `00-${traceId}-${spanId}-01`;
}

import { EXECUTION_CONTEXT_SCHEMA_VERSION } from './schema';

export function injectTraceHeaders(
  headers: Headers,
  ctx: {
    traceId: string;
    requestId?: string;
    correlationId?: string;
    parentTraceId?: string | null;
    runtimeInteractionId?: string;
    parentRuntimeInteractionId?: string | null;
  },
): void {
  headers.set('x-trace-id', ctx.traceId);
  if (ctx.requestId) headers.set('x-request-id', ctx.requestId);
  if (ctx.correlationId) headers.set('x-correlation-id', ctx.correlationId);
  if (ctx.parentTraceId) headers.set('x-parent-trace-id', ctx.parentTraceId);
  if (ctx.runtimeInteractionId) headers.set('x-runtime-interaction-id', ctx.runtimeInteractionId);
  if (ctx.parentRuntimeInteractionId) {
    headers.set('x-parent-runtime-interaction-id', ctx.parentRuntimeInteractionId);
  }
  headers.set('x-umbrelog-schema-version', String(EXECUTION_CONTEXT_SCHEMA_VERSION));
  headers.set('traceparent', formatTraceparent(ctx.traceId));
}
