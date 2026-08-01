import { normalizeEndpoint } from '../traffic/normalize';

/** Skip common API/version prefixes when resolving the resource segment. */
const ROUTE_PREFIXES = new Set(['api', 'v1', 'v2', 'v3', 'internal', 'public']);

export type HttpProcessNameInput = {
  method: string;
  /** Raw or normalized path — normalized internally. */
  path: string;
};

export type HttpProcessNameResolver = (input: HttpProcessNameInput) => string | null;

function humanizeToken(token: string): string {
  return token
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function humanizeResource(token: string): string {
  return humanizeToken(token);
}

function toSingularResource(token: string): string {
  const lower = token.toLowerCase();
  if (lower.endsWith('ies') && lower.length > 4) {
    return humanizeToken(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ses') && lower.length > 4) {
    return humanizeToken(lower.slice(0, -2));
  }
  if (lower.endsWith('s') && lower.length > 3) {
    return humanizeToken(lower.slice(0, -1));
  }
  return humanizeResource(token);
}

function stripRoutePrefixes(segments: string[]): string[] {
  const out = [...segments];
  while (out.length > 0 && ROUTE_PREFIXES.has(out[0].toLowerCase())) {
    out.shift();
  }
  return out;
}

function pathParts(normalizedPath: string): string[] {
  return normalizedPath.split('/').filter(Boolean);
}

function nonParamSegments(normalizedPath: string): string[] {
  return stripRoutePrefixes(pathParts(normalizedPath).filter((s) => !s.startsWith(':')));
}

function hasResourceIdParam(normalizedPath: string, resource: string): boolean {
  const parts = pathParts(normalizedPath);
  const idx = parts.indexOf(resource);
  if (idx < 0) return false;
  return parts.slice(idx + 1).some((p) => p.startsWith(':'));
}

function crudProcessName(method: string, resource: string, hasId: boolean): string | null {
  const m = method.toUpperCase();
  const singular = toSingularResource(resource);
  const plural = humanizeResource(resource);

  if (m === 'POST' && !hasId) return `Create ${singular}`;
  if (m === 'GET' && !hasId) return `List ${plural}`;
  if (m === 'GET' && hasId) return `View ${singular}`;
  if ((m === 'PUT' || m === 'PATCH') && hasId) return `Update ${singular}`;
  if (m === 'DELETE' && hasId) return `Delete ${singular}`;
  return null;
}

function actionProcessName(method: string, resource: string, action: string): string | null {
  const m = method.toUpperCase();
  const singular = toSingularResource(resource);
  const actionParts = action.split('-').filter(Boolean);

  if (m === 'GET') {
    return `View ${singular} ${humanizeToken(action)}`;
  }

  if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
    if (actionParts.length >= 2) {
      const object = actionParts.slice(1).map((part) => humanizeToken(part)).join(' ');
      return `${humanizeToken(actionParts[0])} ${singular} ${object}`;
    }
    return `${humanizeToken(action)} ${singular}`;
  }

  return null;
}

/** Legacy fallback — last meaningful path segment, humanized. */
export function fallbackHttpProcessName(method: string, path: string): string {
  const normalized = normalizeEndpoint(path);
  const segments = nonParamSegments(normalized);
  const last = segments[segments.length - 1] ?? normalized.replace(/^\//, '') ?? method;
  return humanizeResource(last);
}

/**
 * Deterministic HTTP process name from method + path.
 * Returns null when the route shape is not recognized — use {@link fallbackHttpProcessName}.
 */
export function resolveHttpProcessName(method: string, path: string): string | null {
  const normalized = normalizeEndpoint(path);
  const segments = nonParamSegments(normalized);
  const resource = segments[0];
  if (!resource) return null;

  const action = segments.length > 1 ? segments.slice(1).join('-') : null;
  const hasId = hasResourceIdParam(normalized, resource);

  if (action) {
    const named = actionProcessName(method, resource, action);
    if (named) return named;
  }

  const crud = crudProcessName(method, resource, hasId);
  if (crud) return crud;

  return null;
}

/** Resolve from entry name shape: `POST /campaigns/:id`. */
export function resolveHttpProcessNameFromEntry(entryName: string): string | null {
  const space = entryName.indexOf(' ');
  if (space <= 0) return null;
  const method = entryName.slice(0, space).trim();
  const path = entryName.slice(space + 1).trim();
  if (!method || !path) return null;
  return resolveHttpProcessName(method, path);
}

export function resolveHttpProcessNameWithFallback(method: string, path: string): string {
  return resolveHttpProcessName(method, path) ?? fallbackHttpProcessName(method, path);
}

export const defaultHttpProcessNameResolver: HttpProcessNameResolver = (input) =>
  resolveHttpProcessName(input.method, input.path);
