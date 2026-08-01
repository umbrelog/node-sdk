import { resolveIngestionBaseUrl } from '../config/endpoints';
import { enqueueMetricSnapshot, flushMetricsTransport } from './transport';
import {
  MIN_SAMPLE_ELAPSED_MS,
  resetServiceMetricsBaseline,
  sampleServiceMetrics,
} from './sampler';
import type { MetricsCollector, MetricsCollectorConfig } from './types';

const DEFAULT_INTERVAL_MS = 5000;

/** @param keepAlive When true, timer keeps the process alive (required for shutdown flush in short scripts). */
function sleep(ms: number, keepAlive = false): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (!keepAlive && typeof t.unref === 'function') t.unref();
  });
}

export function createMetricsCollector(config: MetricsCollectorConfig): MetricsCollector {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const baseUrl = resolveIngestionBaseUrl(config.baseUrl);
  const env = config.env ?? 'production';
  let timer: ReturnType<typeof setInterval> | null = null;
  let enabled = config.enabled !== false;
  let baselineAt = Date.now();

  const transport = {
    apiKey: config.apiKey,
    service: config.service,
    env,
    baseUrl,
  };

  const tick = () => {
    if (!enabled) return;
    const snapshot = sampleServiceMetrics();
    if (snapshot) enqueueMetricSnapshot(transport, snapshot);
  };

  return {
    sampleOnce: () => sampleServiceMetrics(),
    async flushPending() {
      const waitMs = Math.max(0, MIN_SAMPLE_ELAPSED_MS - (Date.now() - baselineAt));
      if (waitMs > 0) await sleep(waitMs, true);
      const snapshot = sampleServiceMetrics();
      if (snapshot) enqueueMetricSnapshot(transport, snapshot);
      await flushMetricsTransport(8000);
    },
    start() {
      if (timer) return;
      enabled = true;
      resetServiceMetricsBaseline();
      baselineAt = Date.now();
      timer = setInterval(tick, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      enabled = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

export function startServiceMetrics(config: MetricsCollectorConfig): MetricsCollector {
  const collector = createMetricsCollector(config);
  collector.start();
  return collector;
}
