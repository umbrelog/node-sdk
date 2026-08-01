import type { TraceIngestPayload, TraceTransportConfig } from './types';

let inFlight = false;
const queue: TraceIngestPayload[] = [];
const MAX_QUEUE = 8;
let lastTransportConfig: TraceTransportConfig | undefined;
let ingestCaptureForTests: ((payload: TraceIngestPayload) => void) | undefined;

/** @internal — capture ingest payloads in unit tests without network I/O. */
export function setTraceIngestCaptureForTests(
  fn?: (payload: TraceIngestPayload) => void,
): void {
  ingestCaptureForTests = fn;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function postTrace(config: TraceTransportConfig, payload: TraceIngestPayload): Promise<void> {
  if (payload.roots.length === 0 && payload.interactions.length === 0) return;
  const url = `${normalizeBaseUrl(config.baseUrl)}/trace/ingest`;
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
      console.warn(`[UmbreLog trace] ingest failed: HTTP ${res.status}`);
    }
  } catch (err) {
    if (config.debug) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[UmbreLog trace] ingest error: ${msg}`);
    }
  }
}

function flushQueue(config: TraceTransportConfig): void {
  if (inFlight || queue.length === 0) return;
  inFlight = true;
  const batch = queue.splice(0, queue.length);
  const merged: TraceIngestPayload = {
    service: config.service,
    env: config.env,
    roots: batch.flatMap((b) => b.roots).slice(0, 32),
    interactions: batch.flatMap((b) => b.interactions).slice(0, 128),
  };
  void postTrace(config, merged).finally(() => {
    inFlight = false;
    if (queue.length > 0) flushQueue(config);
  });
}

export async function flushTraceTransport(timeoutMs = 8000): Promise<void> {
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

export function enqueueTraceBatch(
  config: TraceTransportConfig,
  partial: Pick<TraceIngestPayload, 'roots' | 'interactions'>,
): void {
  const payload: TraceIngestPayload = {
    service: config.service,
    env: config.env,
    roots: partial.roots,
    interactions: partial.interactions,
  };
  if (ingestCaptureForTests) {
    ingestCaptureForTests(payload);
    return;
  }
  lastTransportConfig = config;
  queue.push(payload);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  flushQueue(config);
}
