import { generateId } from '../../utils/id-generator';

function readScalarHeaderValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function generateCorrelationId(): string {
  return generateId();
}

export function readCorrelationIdFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined;
  const direct = headers['x-correlation-id'] ?? headers['X-Correlation-Id'];
  if (Array.isArray(direct)) return readScalarHeaderValue(direct[0]);
  return readScalarHeaderValue(direct);
}

export function readRequestIdFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined;
  const direct = headers['x-request-id'] ?? headers['X-Request-Id'];
  if (Array.isArray(direct)) return readScalarHeaderValue(direct[0]);
  return readScalarHeaderValue(direct);
}
