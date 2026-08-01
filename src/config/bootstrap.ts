import { createMetricsCollector } from '../metrics/collector';
import type { MetricsCollector } from '../metrics/types';
import { createLifecycleCollector } from '../lifecycle/collector';
import type { LifecycleCollector } from '../lifecycle/types';
import { resolveIngestionBaseUrl } from './endpoints';
import type { ResolvedLoggerConfig } from './types';

export type LoggerBootstrapHandles = {
  metricsCollector?: MetricsCollector;
  lifecycleCollector?: LifecycleCollector;
};

/** Start resource metrics and lifecycle tracking — runtime traffic is started lazily via Logger.attach* / outbound. */
export function bootstrapLoggerCapabilities(
  resolved: ResolvedLoggerConfig,
  service: string,
  env: string,
): LoggerBootstrapHandles {
  const handles: LoggerBootstrapHandles = {};
  if (resolved.hardDisableNetwork) return handles;

  const auth = resolved.apiKey || resolved.authToken;
  const baseUrl = resolveIngestionBaseUrl(resolved.baseUrl);

  if (resolved.resourceMetrics.enabled && auth) {
    const collector = createMetricsCollector({
      apiKey: auth,
      service,
      env,
      baseUrl,
      intervalMs: resolved.resourceMetrics.intervalMs,
      enabled: true,
    });
    collector.start();
    handles.metricsCollector = collector;
  }

  if (resolved.lifecycle.enabled && auth) {
    const lifecycle = createLifecycleCollector({
      apiKey: auth,
      service,
      env,
      baseUrl,
      intervalMs: resolved.lifecycle.intervalMs,
      memoryPressurePct: resolved.lifecycle.memoryPressurePct,
      eventLoopStallMs: resolved.lifecycle.eventLoopStallMs,
      enabled: true,
      debug: resolved.debug,
    });
    lifecycle.start();
    handles.lifecycleCollector = lifecycle;
  }

  return handles;
}
