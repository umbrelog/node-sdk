export {
  UMBRELOG_CLOUD_BASE_URL,
  UMBRELOG_CLOUD_CONFIG_URL,
  UMBRELOG_CLOUD_INGESTION_URL,
  resolveUmbrelogBaseUrl,
  resolveUmbrelogEndpoints,
  resolveIngestionBaseUrl,
} from './endpoints';
export { parseDurationMs } from './duration';
export {
  DEFAULT_LOGGING,
  DEFAULT_RESOURCE_METRICS,
  DEFAULT_RUNTIME_INTERACTIONS,
  RESOURCE_METRICS_MIN_INTERVAL_MS,
  RESOURCE_METRICS_MAX_INTERVAL_MS,
} from './defaults';
export { normalizeLoggerConfig } from './normalize';
export { validateLoggerConfig, emitConfigValidationIssues } from './validate';
export type { ConfigValidationIssue } from './validate';
export { bootstrapLoggerCapabilities } from './bootstrap';
export type { LoggerBootstrapHandles } from './bootstrap';
export {
  buildTrafficConfigFromState,
  mergeTrafficCategoryState,
  initialTrafficCategoryState,
} from './traffic-runtime';
export type { TrafficCategoryState } from './traffic-runtime';
export type {
  DurationInput,
  LoggerConfig,
  LoggingConfig,
  RuntimeInteractionsConfig,
  ResourceMetricsConfig,
  OperationalSystemsConfig,
  ResolvedLoggerConfig,
  ResolvedLoggingConfig,
  ResolvedRuntimeInteractionsConfig,
  ResolvedResourceMetricsConfig,
  LegacyLoggerConfigFields,
} from './types';
