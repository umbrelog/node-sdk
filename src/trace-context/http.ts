import { normalizeEndpoint } from '../traffic/normalize';

const PROBE_PATHS = new Set([
  '/health',
  '/healthz',
  '/healthcheck',
  '/ping',
  '/ready',
  '/readyz',
  '/readiness',
  '/live',
  '/livez',
  '/liveness',
  '/alive',
  '/status',
  '/_health',
  '/actuator/health',
]);

const PROBE_UA_PATTERNS = [
  /kube-probe/i,
  /ELB-HealthChecker/i,
  /Amazon-Route53-Health-Check/i,
  /GoogleHC/i,
  /HealthChecker/i,
  /UptimeRobot/i,
  /Pingdom/i,
  /Datadog Agent/i,
];

/** Normalized route fingerprint for process discovery — e.g. POST /api/customers/:id */
export function formatHttpEntryName(method: string, rawPath: string): string {
  const m = String(method ?? 'GET').toUpperCase();
  const path = normalizeEndpoint(rawPath);
  return `${m} ${path}`;
}

export function isHealthProbeRequest(args: {
  method: string;
  rawPath: string;
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  const path = normalizeEndpoint(args.rawPath).toLowerCase();
  if (PROBE_PATHS.has(path)) return true;
  if (path.endsWith('/health') || path.endsWith('/healthz')) return true;
  if (path.endsWith('/ready') || path.endsWith('/readyz')) return true;
  if (path.endsWith('/live') || path.endsWith('/livez')) return true;

  const ua = readUserAgent(args.headers);
  if (ua && PROBE_UA_PATTERNS.some((re) => re.test(ua))) return true;

  return false;
}

function readUserAgent(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined;
  const raw = headers['user-agent'] ?? headers['User-Agent'];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

export function httpTraceRootStatus(statusCode: number): 'ok' | 'failed' {
  if (statusCode >= 500) return 'failed';
  return 'ok';
}
