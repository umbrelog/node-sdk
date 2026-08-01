import type { MetricSnapshot } from './types';

export type MetricsTransportConfig = {
  apiKey: string;
  service: string;
  env: string;
  baseUrl: string;
  debug?: boolean;
};

let inFlight = false;
const queue: MetricSnapshot[] = [];
const MAX_QUEUE = 24;
let lastTransportConfig: MetricsTransportConfig | undefined;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function postSnapshots(config: MetricsTransportConfig, snapshots: MetricSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  const url = `${normalizeBaseUrl(config.baseUrl)}/metrics/ingest`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.apiKey,
      },
      body: JSON.stringify({
        service: config.service,
        env: config.env,
        snapshots,
      }),
    });
    if (!res.ok && config.debug) {
      console.warn(`[UmbreLog metrics] ingest failed: HTTP ${res.status}`);
    }
  } catch (err) {
    if (config.debug) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[UmbreLog metrics] ingest error: ${msg}`);
    }
  }
}

function flushQueue(config: MetricsTransportConfig): void {
  if (inFlight || queue.length === 0) return;
  inFlight = true;
  const batch = queue.splice(0, queue.length);
  void postSnapshots(config, batch).finally(() => {
    inFlight = false;
    if (queue.length > 0) flushQueue(config);
  });
}

/** Wait for queued metric batches to finish posting (best-effort, for shutdown). */
export async function flushMetricsTransport(timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (lastTransportConfig && queue.length > 0 && !inFlight) {
      flushQueue(lastTransportConfig);
    }
    if (queue.length === 0 && !inFlight) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

/** Fire-and-forget metrics transport — never blocks caller flow. */
export function enqueueMetricSnapshot(config: MetricsTransportConfig, snapshot: MetricSnapshot): void {
  lastTransportConfig = config;
  queue.push(snapshot);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  flushQueue(config);
}
