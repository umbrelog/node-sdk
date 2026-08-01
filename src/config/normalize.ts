import type { TrafficConfig } from '../traffic/types';
import { parseDurationMs } from './duration';
import { warnDeprecatedConfig } from './deprecations';
import {
  DEFAULT_LOGGING,
  DEFAULT_LIFECYCLE,
  DEFAULT_RESOURCE_METRICS,
  DEFAULT_RUNTIME_INTERACTIONS,
  LIFECYCLE_MAX_INTERVAL_MS,
  LIFECYCLE_MIN_INTERVAL_MS,
  RESOURCE_METRICS_MAX_INTERVAL_MS,
  RESOURCE_METRICS_MIN_INTERVAL_MS,
} from './defaults';
import type {
  LegacyLoggerConfigFields,
  LifecycleConfig,
  LoggerConfig,
  LoggingConfig,
  ResolvedLifecycleConfig,
  ResolvedLoggerConfig,
  ResolvedLoggingConfig,
  ResolvedResourceMetricsConfig,
  ResolvedRuntimeInteractionsConfig,
  ResolvedTracePropagationConfig,
  ResourceMetricsConfig,
  RuntimeInteractionsConfig,
  TracePropagationConfig,
} from './types';

function legacyLoggingFields(legacy: LegacyLoggerConfigFields): LoggingConfig {
  const l: LoggingConfig = {};
  if (legacy.enabled !== undefined) l.enabled = legacy.enabled;
  if (legacy.runtimeMetadata !== undefined) l.runtimeMetadata = legacy.runtimeMetadata;
  if (legacy.captureFunctionName !== undefined) l.captureFunctionName = legacy.captureFunctionName;
  if (legacy.captureUnhandledExceptions !== undefined) {
    l.captureUnhandledExceptions = legacy.captureUnhandledExceptions;
  }
  if (legacy.captureUnhandledRejections !== undefined) {
    l.captureUnhandledRejections = legacy.captureUnhandledRejections;
  }
  if (legacy.flushOnShutdown !== undefined) l.flushOnShutdown = legacy.flushOnShutdown;
  if (legacy.flushTimeoutMs !== undefined) l.flushTimeoutMs = legacy.flushTimeoutMs;
  if (legacy.captureConsole !== undefined) l.captureConsole = legacy.captureConsole;
  if (legacy.bufferSize !== undefined) l.bufferSize = legacy.bufferSize;
  if (legacy.bufferTtl !== undefined) l.bufferTtl = legacy.bufferTtl;
  if (legacy.configPollInterval !== undefined) l.configPollInterval = legacy.configPollInterval;
  if (legacy.enableSensitiveDataMasking !== undefined) {
    l.enableSensitiveDataMasking = legacy.enableSensitiveDataMasking;
  }
  if (legacy.maskPatterns !== undefined) l.maskPatterns = legacy.maskPatterns;
  if (legacy.sensitiveKeys !== undefined) l.sensitiveKeys = legacy.sensitiveKeys;
  if (legacy.enableAttributeExtraction !== undefined) {
    l.enableAttributeExtraction = legacy.enableAttributeExtraction;
  }
  if (legacy.enableAttribution !== undefined) l.enableAttribution = legacy.enableAttribution;
  if (legacy.attributionConfig !== undefined) l.attributionConfig = legacy.attributionConfig;
  if (legacy.serviceMetadata !== undefined) l.serviceMetadata = legacy.serviceMetadata;
  return l;
}

function coalesceTracePropagation(
  nested: TracePropagationConfig | undefined,
): ResolvedTracePropagationConfig {
  const d = DEFAULT_LOGGING.tracePropagation;
  const s = nested?.sampling;
  return {
    enabled: nested?.enabled ?? d.enabled,
    injectOutboundHeaders: nested?.injectOutboundHeaders ?? d.injectOutboundHeaders,
    sampling: {
      enabled: s?.enabled ?? d.sampling.enabled,
      baseHealthySampleRate: s?.baseHealthySampleRate ?? d.sampling.baseHealthySampleRate,
      targetInteractionsPerMinute:
        s?.targetInteractionsPerMinute ?? d.sampling.targetInteractionsPerMinute,
      minSampleRate: s?.minSampleRate ?? d.sampling.minSampleRate,
      maxSampleRate: s?.maxSampleRate ?? d.sampling.maxSampleRate,
    },
  };
}

function coalesceLogging(
  nested: LoggingConfig | undefined,
  legacy: LegacyLoggerConfigFields,
): ResolvedLoggingConfig {
  const l: LoggingConfig = { ...legacyLoggingFields(legacy), ...nested };

  return {
    enabled: l.enabled ?? DEFAULT_LOGGING.enabled,
    runtimeMetadata: l.runtimeMetadata ?? DEFAULT_LOGGING.runtimeMetadata,
    captureFunctionName: l.captureFunctionName ?? DEFAULT_LOGGING.captureFunctionName,
    captureUnhandledExceptions:
      l.captureUnhandledExceptions ?? DEFAULT_LOGGING.captureUnhandledExceptions,
    captureUnhandledRejections:
      l.captureUnhandledRejections ?? DEFAULT_LOGGING.captureUnhandledRejections,
    flushOnShutdown: l.flushOnShutdown ?? DEFAULT_LOGGING.flushOnShutdown,
    flushTimeoutMs: l.flushTimeoutMs ?? DEFAULT_LOGGING.flushTimeoutMs,
    captureConsole: l.captureConsole ?? DEFAULT_LOGGING.captureConsole,
    bufferSize: l.bufferSize ?? DEFAULT_LOGGING.bufferSize,
    bufferTtlMs: l.bufferTtl ?? DEFAULT_LOGGING.bufferTtlMs,
    configPollIntervalMs: l.configPollInterval ?? DEFAULT_LOGGING.configPollIntervalMs,
    enableSensitiveDataMasking:
      l.enableSensitiveDataMasking ?? DEFAULT_LOGGING.enableSensitiveDataMasking,
    maskPatterns: l.maskPatterns ?? DEFAULT_LOGGING.maskPatterns,
    sensitiveKeys: l.sensitiveKeys ?? DEFAULT_LOGGING.sensitiveKeys,
    enableAttributeExtraction:
      l.enableAttributeExtraction ?? DEFAULT_LOGGING.enableAttributeExtraction,
    enableAttribution: l.enableAttribution ?? DEFAULT_LOGGING.enableAttribution,
    attributionConfig: l.attributionConfig,
    serviceMetadata: l.serviceMetadata ?? DEFAULT_LOGGING.serviceMetadata,
    tracePropagation: coalesceTracePropagation(l.tracePropagation),
  };
}

function coalesceRuntimeInteractions(
  nested: RuntimeInteractionsConfig | undefined,
  legacy: LegacyLoggerConfigFields,
): ResolvedRuntimeInteractionsConfig {
  return {
    traffic: nested?.traffic ?? legacy.traffic ?? DEFAULT_RUNTIME_INTERACTIONS.traffic,
  };
}

function coalesceResourceMetrics(nested?: ResourceMetricsConfig): ResolvedResourceMetricsConfig {
  const intervalMs = parseDurationMs(nested?.interval, DEFAULT_RESOURCE_METRICS.intervalMs);
  const clamped = Math.min(
    RESOURCE_METRICS_MAX_INTERVAL_MS,
    Math.max(RESOURCE_METRICS_MIN_INTERVAL_MS, intervalMs),
  );
  return {
    enabled: nested?.enabled ?? DEFAULT_RESOURCE_METRICS.enabled,
    intervalMs: clamped,
  };
}

function coalesceLifecycle(nested?: LifecycleConfig): ResolvedLifecycleConfig {
  const intervalMs = parseDurationMs(nested?.interval, DEFAULT_LIFECYCLE.intervalMs);
  const clamped = Math.min(
    LIFECYCLE_MAX_INTERVAL_MS,
    Math.max(LIFECYCLE_MIN_INTERVAL_MS, intervalMs),
  );
  return {
    enabled: nested?.enabled ?? DEFAULT_LIFECYCLE.enabled,
    intervalMs: clamped,
    memoryPressurePct: nested?.memoryPressurePct ?? DEFAULT_LIFECYCLE.memoryPressurePct,
    eventLoopStallMs: nested?.eventLoopStallMs ?? DEFAULT_LIFECYCLE.eventLoopStallMs,
  };
}

/** Normalize user config (nested + legacy flat) into a single resolved structure. */
export function normalizeLoggerConfig(config: LoggerConfig = {}): ResolvedLoggerConfig {
  warnDeprecatedConfig(config);

  return {
    service: config.service ?? config.clientId ?? '',
    env: config.env ?? '',
    region: config.region,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    authToken: config.authToken,
    hardDisableNetwork:
      Boolean(config.hardDisableNetwork) || process.env.LM_SDK_HARD_DISABLE_NETWORK === '1',
    debug: config.debug === true,
    logging: coalesceLogging(config.logging, config),
    runtimeInteractions: coalesceRuntimeInteractions(config.runtimeInteractions, config),
    resourceMetrics: coalesceResourceMetrics(config.resourceMetrics),
    lifecycle: coalesceLifecycle(config.lifecycle),
  };
}
