import type {
  LifecycleConfig,
  LoggingConfig,
  ResolvedLifecycleConfig,
  ResolvedLoggingConfig,
  ResolvedResourceMetricsConfig,
  ResolvedRuntimeInteractionsConfig,
  ResolvedTracePropagationConfig,
  ResourceMetricsConfig,
  RuntimeInteractionsConfig,
  TracePropagationConfig,
} from './types';

export const DEFAULT_LOGGING: ResolvedLoggingConfig = {
  enabled: true,
  runtimeMetadata: true,
  captureFunctionName: false,
  captureUnhandledExceptions: true,
  captureUnhandledRejections: true,
  flushOnShutdown: true,
  flushTimeoutMs: 3000,
  captureConsole: false,
  bufferSize: 1000,
  bufferTtlMs: 120_000,
  configPollIntervalMs: 7500,
  enableSensitiveDataMasking: true,
  maskPatterns: [],
  sensitiveKeys: [],
  enableAttributeExtraction: false,
  enableAttribution: true,
  attributionConfig: undefined,
  serviceMetadata: {},
  tracePropagation: {
    enabled: true,
    injectOutboundHeaders: true,
    sampling: {
      enabled: true,
      baseHealthySampleRate: 0.05,
      targetInteractionsPerMinute: 200,
      minSampleRate: 0.01,
      maxSampleRate: 0.1,
    },
  },
};

export const DEFAULT_RUNTIME_INTERACTIONS: ResolvedRuntimeInteractionsConfig = {
  traffic: {},
};

/** System host metrics enabled by default (`enabled: true`); 60s interval. Requires apiKey to collect. */
export const DEFAULT_RESOURCE_METRICS: ResolvedResourceMetricsConfig = {
  enabled: true,
  intervalMs: 60_000,
};

export const LIFECYCLE_MIN_INTERVAL_MS = 15_000;
export const LIFECYCLE_MAX_INTERVAL_MS = 120_000;

/** Lifecycle tracking on by default when apiKey is set; 30s heartbeat. */
export const DEFAULT_LIFECYCLE: ResolvedLifecycleConfig = {
  enabled: true,
  intervalMs: 30_000,
  memoryPressurePct: 85,
  eventLoopStallMs: 500,
};

export const RESOURCE_METRICS_MIN_INTERVAL_MS = 30_000;
export const RESOURCE_METRICS_MAX_INTERVAL_MS = 15 * 60_000;

export function defaultLogging(overrides?: LoggingConfig): ResolvedLoggingConfig {
  const tp = overrides?.tracePropagation;
  return {
    ...DEFAULT_LOGGING,
    ...overrides,
    tracePropagation: {
      enabled: tp?.enabled ?? DEFAULT_LOGGING.tracePropagation.enabled,
      injectOutboundHeaders:
        tp?.injectOutboundHeaders ?? DEFAULT_LOGGING.tracePropagation.injectOutboundHeaders,
      sampling: {
        enabled: tp?.sampling?.enabled ?? DEFAULT_LOGGING.tracePropagation.sampling.enabled,
        baseHealthySampleRate:
          tp?.sampling?.baseHealthySampleRate ??
          DEFAULT_LOGGING.tracePropagation.sampling.baseHealthySampleRate,
        targetInteractionsPerMinute:
          tp?.sampling?.targetInteractionsPerMinute ??
          DEFAULT_LOGGING.tracePropagation.sampling.targetInteractionsPerMinute,
        minSampleRate:
          tp?.sampling?.minSampleRate ?? DEFAULT_LOGGING.tracePropagation.sampling.minSampleRate,
        maxSampleRate:
          tp?.sampling?.maxSampleRate ?? DEFAULT_LOGGING.tracePropagation.sampling.maxSampleRate,
      },
    },
  };
}

export function defaultRuntimeInteractions(
  overrides?: RuntimeInteractionsConfig,
): ResolvedRuntimeInteractionsConfig {
  return {
    traffic: { ...DEFAULT_RUNTIME_INTERACTIONS.traffic, ...overrides?.traffic },
  };
}

export function defaultResourceMetrics(
  overrides?: ResourceMetricsConfig,
): ResolvedResourceMetricsConfig {
  return { ...DEFAULT_RESOURCE_METRICS, ...overrides };
}

export function defaultLifecycle(overrides?: LifecycleConfig): ResolvedLifecycleConfig {
  return { ...DEFAULT_LIFECYCLE, ...overrides };
}
