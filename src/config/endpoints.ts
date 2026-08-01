/** Default Umbrelog Cloud app origin — used when `baseUrl` is omitted. */
export const UMBRELOG_CLOUD_BASE_URL = 'https://app.umbrelog.com';

/** Nginx-mounted ingestion prefix on the cloud app host. */
export const UMBRELOG_CLOUD_INGESTION_URL = `${UMBRELOG_CLOUD_BASE_URL}/api`;

/** Nginx-mounted config-service prefix on the cloud app host. */
export const UMBRELOG_CLOUD_CONFIG_URL = `${UMBRELOG_CLOUD_BASE_URL}/config`;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function readNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isLocalHostname(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1)$/i.test(hostname);
}

function hostedIngestionUrl(origin: string): string {
  return `${origin}/api`;
}

function hostedConfigUrl(origin: string): string {
  return `${origin}/config`;
}

/** Resolve the configured base URL: explicit config → UMBRELOG_BASE_URL → cloud default. */
export function resolveUmbrelogBaseUrl(explicit?: string): string {
  const fromConfig = readNonEmpty(explicit);
  if (fromConfig) return trimTrailingSlashes(fromConfig);

  const fromEnv = readNonEmpty(process.env.UMBRELOG_BASE_URL);
  if (fromEnv) return trimTrailingSlashes(fromEnv);

  return UMBRELOG_CLOUD_BASE_URL;
}

export function resolveUmbrelogEndpoints(baseUrl?: string): {
  configOrigin: string;
  ingestionUrl: string;
} {
  const raw = resolveUmbrelogBaseUrl(baseUrl);
  try {
    const withProto = raw.includes('://') ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (isLocalHostname(u.hostname)) {
      return {
        configOrigin: `${u.protocol}//${u.hostname}:3100`,
        ingestionUrl: u.port ? u.origin : `${u.protocol}//${u.hostname}:3000`,
      };
    }
    return {
      configOrigin: hostedConfigUrl(u.origin),
      ingestionUrl: hostedIngestionUrl(u.origin),
    };
  } catch {
    return {
      configOrigin: UMBRELOG_CLOUD_CONFIG_URL,
      ingestionUrl: UMBRELOG_CLOUD_INGESTION_URL,
    };
  }
}

export function resolveIngestionBaseUrl(baseUrl?: string): string {
  return resolveUmbrelogEndpoints(baseUrl).ingestionUrl;
}
