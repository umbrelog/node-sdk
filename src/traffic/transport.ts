import type { TrafficAggregateBucket, TrafficIngestPayload, TrafficRawEvent } from './types';

export type TrafficTransportConfig = {
  apiKey: string;
  service: string;
  env: string;
  baseUrl: string;
  debug?: boolean;
};

let inFlight = false;
const queue: TrafficIngestPayload[] = [];
const MAX_QUEUE = 8;
let lastTransportConfig: TrafficTransportConfig | undefined;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function postTraffic(
  config: TrafficTransportConfig,
  payload: TrafficIngestPayload,
): Promise<void> {
  if (payload.aggregates.length === 0 && payload.events.length === 0) return;
  const url = `${normalizeBaseUrl(config.baseUrl)}/traffic/ingest`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok && config.debug) {
      console.warn(`[UmbreLog traffic] ingest failed: HTTP ${res.status}`);
    }
  } catch (err) {
    if (config.debug) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[UmbreLog traffic] ingest error: ${msg}`);
    }
  }
}

function flushQueue(config: TrafficTransportConfig): void {
  if (inFlight || queue.length === 0) return;
  inFlight = true;
  const batch = queue.splice(0, queue.length);
  const merged: TrafficIngestPayload = {
    service: config.service,
    env: config.env,
    aggregates: batch.flatMap((b) => b.aggregates).slice(0, 64),
    events: batch.flatMap((b) => b.events).slice(0, 48),
  };
  void postTraffic(config, merged).finally(() => {
    inFlight = false;
    if (queue.length > 0) flushQueue(config);
  });
}

/** Fire-and-forget traffic transport — never blocks caller flow. */
/** Wait for queued traffic batches to finish posting (best-effort, for tests/shutdown). */
export async function flushTrafficTransport(timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (lastTransportConfig && queue.length > 0 && !inFlight) {
      flushQueue(lastTransportConfig);
    }
    if (queue.length === 0 && !inFlight) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 50);
      if (typeof t.unref === 'function') t.unref();
    });
  }
}

export function enqueueTrafficBatch(
  config: TrafficTransportConfig,
  partial: { aggregates: TrafficAggregateBucket[]; events: TrafficRawEvent[] },
): void {
  lastTransportConfig = config;
  queue.push({
    service: config.service,
    env: config.env,
    aggregates: partial.aggregates,
    events: partial.events,
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  flushQueue(config);
}
