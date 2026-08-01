import { createTrafficRegistry } from './registry';
import { instrumentGlobalFetch } from './instrumentation/http-fetch';
import type { TrafficSdkConfig } from './types';

export { normalizeEndpoint, normalizeSqlQuery, normalizeMessagingTopic, normalizeRedisCommand, normalizeRedisKey } from './normalize';
export { resolveTrafficThresholds, TRAFFIC_MIN_THRESHOLDS_MS } from './thresholds';
export { instrumentExpress } from './instrumentation/http-express';
export { instrumentPg } from './instrumentation/database-pg';
export { instrumentMysql2 } from './instrumentation/database-mysql2';
export { instrumentRedis, REDIS_INSTRUMENTED_OPERATIONS } from './instrumentation/database-redis';
export { recordMessagingLifecycle } from './messaging-lifecycle';
export { recordFileTransfer, normalizeFileDestination } from './file-transfer';
export type {
  MessagingLifecycleReport,
  MessagingLifecyclePhase,
  FileTransferReport,
  FileOperation,
} from './lifecycle-types';
export type {
  TrafficConfig,
  TrafficSdkConfig,
  TrafficRawEvent,
  TrafficAggregateBucket,
} from './types';
export { getTrafficRegistry } from './registry';
export type {
  TrafficRegistry,
  HttpObservation,
  DatabaseObservation,
  MessagingObservation,
  FileObservation,
} from './registry';

let activeShutdown: (() => void) | null = null;
let trafficSessionId = 0;

/**
 * Start runtime traffic instrumentation. All categories default to disabled —
 * pass `traffic.http.enabled`, etc. to opt in explicitly.
 */
export function startTrafficInstrumentation(config: TrafficSdkConfig): {
  shutdown: () => void;
  sessionId: number;
} {
  activeShutdown?.();
  const sessionId = ++trafficSessionId;
  const registry = createTrafficRegistry(config);
  const traffic = config.traffic ?? {};

  if (config.patchGlobalFetch === true && traffic.http?.enabled) {
    instrumentGlobalFetch();
  }

  const shutdown = () => {
    if (sessionId !== trafficSessionId) return;
    registry.shutdown();
    if (activeShutdown === shutdown) activeShutdown = null;
  };

  activeShutdown = shutdown;
  return { shutdown, sessionId };
}

/** @internal Test-only reset. */
export function resetTrafficRuntimeForTests(): void {
  activeShutdown?.();
  activeShutdown = null;
  trafficSessionId = 0;
}
