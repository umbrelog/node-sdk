import type { RuntimeLifecycleIngestBody } from './types';

export type LifecycleTransportConfig = {
  apiKey: string;
  service: string;
  env: string;
  baseUrl: string;
  debug?: boolean;
};

let inFlight = false;
const queue: RuntimeLifecycleIngestBody[] = [];
const MAX_QUEUE = 12;
let lastTransportConfig: LifecycleTransportConfig | undefined;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function mergePayload(existing: RuntimeLifecycleIngestBody, next: RuntimeLifecycleIngestBody): RuntimeLifecycleIngestBody {
  return {
    service: next.service,
    env: next.env,
    heartbeats: [...(existing.heartbeats ?? []), ...(next.heartbeats ?? [])].slice(-24),
    events: [...(existing.events ?? []), ...(next.events ?? [])].slice(-24),
  };
}

async function postPayload(config: LifecycleTransportConfig, payload: RuntimeLifecycleIngestBody): Promise<void> {
  if ((payload.heartbeats?.length ?? 0) === 0 && (payload.events?.length ?? 0) === 0) return;
  const url = `${normalizeBaseUrl(config.baseUrl)}/runtime/lifecycle/ingest`;
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
      console.warn(`[UmbreLog lifecycle] ingest failed: HTTP ${res.status}`);
    }
  } catch (err) {
    if (config.debug) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[UmbreLog lifecycle] ingest error: ${msg}`);
    }
  }
}

function flushQueue(config: LifecycleTransportConfig): void {
  if (inFlight || queue.length === 0) return;
  inFlight = true;
  let batch = queue.splice(0, queue.length);
  if (batch.length > 1) {
    let merged = batch[0]!;
    for (let i = 1; i < batch.length; i += 1) {
      merged = mergePayload(merged, batch[i]!);
    }
    batch = [merged];
  }
  void postPayload(config, batch[0]!).finally(() => {
    inFlight = false;
    if (queue.length > 0) flushQueue(config);
  });
}

export async function flushLifecycleTransport(timeoutMs = 8000): Promise<void> {
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

export function enqueueLifecyclePayload(config: LifecycleTransportConfig, payload: RuntimeLifecycleIngestBody): void {
  lastTransportConfig = config;
  queue.push(payload);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  flushQueue(config);
}
