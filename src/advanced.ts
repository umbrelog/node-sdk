/**
 * Internal / validation surface — not part of the public SDK contract.
 * Do not import from customer applications; subject to breaking changes without semver notice.
 * Used by private monorepo validation and SDK unit tests.
 */
export * from './index';
export { PolicyAction } from './policy/types';
export type { PolicyRule, PolicySet } from './policy/types';
export { mergeLogMetadata } from './enrichment/log-enrichment';
export { RESERVED_EVENT_FIELDS, stripReservedEventFields } from './enrichment/reserved-fields';
export {
  normalizeLoggerConfig,
  validateLoggerConfig,
  parseDurationMs,
  DEFAULT_LOGGING,
  DEFAULT_RUNTIME_INTERACTIONS,
  DEFAULT_RESOURCE_METRICS,
  RESOURCE_METRICS_MIN_INTERVAL_MS,
  RESOURCE_METRICS_MAX_INTERVAL_MS,
} from './config';
export type {
  LoggingConfig,
  RuntimeInteractionsConfig,
  ResourceMetricsConfig,
  ResolvedLoggerConfig,
  DurationInput,
  ConfigValidationIssue,
} from './config';

export type {
  InteractionKind,
  InteractionObservation,
  InteractionContextMetadata,
  InteractionStatus,
  InstrumentTargets,
  PostgresAttachOptions,
  MysqlAttachOptions,
  RedisAttachOptions,
  RuntimeProviderId,
} from './interactions';
export {
  INTERACTION_ID_KEY,
  createInteractionId,
  buildInteractionMetadata,
  recordInteraction,
  createInteractionObservation,
  RUNTIME_PROVIDER_CATALOG,
} from './interactions';

export { createMetricsCollector, startServiceMetrics } from './metrics/collector';
export { sampleServiceMetrics } from './metrics/sampler';
export type { MetricSnapshot, MetricsCollector, MetricsCollectorConfig } from './metrics/types';

export {
  startTrafficInstrumentation,
  normalizeEndpoint,
  normalizeSqlQuery,
  instrumentExpress,
  instrumentPg,
  instrumentMysql2,
  instrumentRedis,
  recordMessagingLifecycle,
  recordFileTransfer,
  getTrafficRegistry,
  TRAFFIC_MIN_THRESHOLDS_MS,
} from './traffic';
export type {
  TrafficConfig,
  TrafficSdkConfig,
  TrafficRegistry,
  HttpObservation,
  DatabaseObservation,
  MessagingObservation,
  FileObservation,
} from './traffic';
