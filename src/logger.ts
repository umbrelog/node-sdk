import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { AttributeExtractor } from './attributes/extractor';
import { AttributionExtractor } from './attribution/extractor';
import { CircularBuffer, type ReplayOptions } from './buffer/circular-buffer';
import { ConfigClient } from './config/config-client';
import { captureCallerFunctionName } from './enrichment/caller-name';
import {
  buildEnrichedAttributes,
  buildRuntimeMetadata,
  buildServiceMetadata,
  type RuntimeMetadata,
} from './enrichment/log-enrichment';
import { stripReservedEventFields } from './enrichment/reserved-fields';
import { registerConsoleCapture } from './hooks/console-capture';
import { registerProcessErrorHooks } from './hooks/process-errors';
import { registerShutdownHooks } from './hooks/shutdown';
import { registerLifecycleHooks } from './lifecycle/hooks';
import { Masker } from './masking/masker';
import { PolicyEvaluator } from './policy/evaluator';
import { HttpTransport } from './transport/http-transport';
import {
  bootstrapLoggerCapabilities,
  buildTrafficConfigFromState,
  emitConfigValidationIssues,
  initialTrafficCategoryState,
  mergeTrafficCategoryState,
  normalizeLoggerConfig,
  validateLoggerConfig,
  type LoggerBootstrapHandles,
  type ResolvedLoggerConfig,
  type TrafficCategoryState,
} from './config';
import { resolveIngestionBaseUrl, resolveUmbrelogEndpoints } from './config/endpoints';
import type { InstrumentTargets, MysqlAttachOptions, PostgresAttachOptions, RedisAttachOptions } from './interactions';
import { instrumentExpress, type ExpressAttachOptions, type ExpressTraceOptions } from './traffic/instrumentation/http-express';
import { instrumentMysql2 } from './traffic/instrumentation/database-mysql2';
import { instrumentRedis } from './traffic/instrumentation/database-redis';
import { instrumentPg } from './traffic/instrumentation/database-pg';
import { startTrafficInstrumentation } from './traffic';
import { getTrafficRegistry } from './traffic/registry';
import type { TrafficConfig } from './traffic/types';
import type { LogEntry, LoggerConfig, LogLevel, RuntimeConfig } from './types';
import { generateId } from './utils/id-generator';
import { getSdkVersion } from './version';
import { getTraceContext } from './trace-context/context';
import { applyExecutionContextToAttributes } from './trace-context/execution-context';
import { startTraceBuffer, stopTraceBuffer } from './trace-context/buffer';
import { runWithTraceRoot as runTraceRoot } from './trace-context/root';
import {
  runWithKafkaMessage as runKafkaMessage,
  runWithPubSubMessage as runPubSubMessage,
  runWithRabbitMessage as runRabbitMessage,
} from './trace-context/messaging';
import type { TraceRootInput } from './trace-context/types';
import { flushTraceTransport } from './trace-context/transport';

export function formatObjectLiteral(obj: unknown, indent = 0, compact = true): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') return `"${obj.replace(/"/g, '\\"')}"`;
    return String(obj);
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    if (compact) {
      return `[${obj.map((item) => formatObjectLiteral(item, 0, true)).join(', ')}]`;
    }
    const items = obj.map(
      (item) => `${'  '.repeat(indent + 1)}${formatObjectLiteral(item, indent + 1, false)}`,
    );
    return `[\n${items.join(',\n')}\n${'  '.repeat(indent)}]`;
  }
  const keys = Object.keys(obj as object);
  if (keys.length === 0) return '{}';
  if (compact) {
    const items = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${key}: ${formatObjectLiteral(value, 0, true)}`;
    });
    return `{${items.join(', ')}}`;
  }
  const items = keys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return `${'  '.repeat(indent + 1)}${key}: ${formatObjectLiteral(value, indent + 1, false)}`;
  });
  return `{\n${items.join(',\n')}\n${'  '.repeat(indent)}}`;
}

function replaceObjectObjectInMessage(message: string, attributes: Record<string, unknown>): string {
  if (!message.includes('[object Object]')) return message;
  const objectValues: unknown[] = [];
  function extractObjects(obj: unknown, depth = 0): void {
    if (depth > 5) return;
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      objectValues.push(obj);
      Object.values(obj as Record<string, unknown>).forEach((value) => {
        if (typeof value === 'object' && value !== null) extractObjects(value, depth + 1);
      });
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => {
        if (typeof item === 'object' && item !== null) extractObjects(item, depth + 1);
      });
    }
  }
  Object.values(attributes).forEach((value) => extractObjects(value));
  const matches = message.match(/\[object Object\]/g);
  if (!matches) return message;
  if (objectValues.length >= matches.length) {
    let replacementIndex = 0;
    return message.replace(/\[object Object\]/g, () => {
      const obj = objectValues[replacementIndex++];
      return formatObjectLiteral(obj, 0, true);
    });
  }
  return message.replace(/\[object Object\]/g, '{object}');
}

let packageMetadataCache: { name?: string; version?: string } | undefined;
let serviceNameFallbackWarned = false;

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readPackageMetadata(): { name?: string; version?: string } {
  if (packageMetadataCache !== undefined) return packageMetadataCache;
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    packageMetadataCache = {
      name: normalizeNonEmpty(parsed?.name),
      version: normalizeNonEmpty(parsed?.version),
    };
  } catch {
    packageMetadataCache = {};
  }
  return packageMetadataCache;
}

function buildBaseContext(config: LoggerConfig): LogEntry['metadata'] & { service: string; env: string } {
  const pkg = readPackageMetadata();
  const explicitService = normalizeNonEmpty(config.service) || normalizeNonEmpty(config.clientId);
  const envService = normalizeNonEmpty(process.env.SERVICE_NAME) || normalizeNonEmpty(process.env.APP_NAME);
  const service = explicitService || envService || pkg.name || 'unknown-service';
  const env = normalizeNonEmpty(config.env) || normalizeNonEmpty(process.env.NODE_ENV) || 'prod';
  const version =
    normalizeNonEmpty(process.env.APP_VERSION) ||
    normalizeNonEmpty(process.env.npm_package_version) ||
    pkg.version ||
    'unknown-version';
  let host = 'unknown-host';
  try {
    host = normalizeNonEmpty(hostname()) || 'unknown-host';
  } catch {
    host = 'unknown-host';
  }
  if (!explicitService && !serviceNameFallbackWarned) {
    serviceNameFallbackWarned = true;
    console.warn('No service name provided. Falling back to automatic detection.');
  }
  const region =
    normalizeNonEmpty(config.region) ||
    normalizeNonEmpty(process.env.AWS_REGION) ||
    normalizeNonEmpty(process.env.VERCEL_REGION) ||
    normalizeNonEmpty(process.env.FLY_REGION) ||
    normalizeNonEmpty(process.env.REGION);
  return { service, env, host, version, ...(region ? { region } : {}) };
}

function stripPerLogMetadata(attributes: Record<string, unknown>): Record<string, unknown> {
  return stripReservedEventFields(attributes);
}

function buildEntryMetadata(
  baseContext: ReturnType<typeof buildBaseContext>,
  mergedMetadata: Record<string, unknown>,
): LogEntry['metadata'] {
  return {
    ...baseContext,
    service:
      typeof mergedMetadata.service === 'string' && mergedMetadata.service.trim()
        ? mergedMetadata.service
        : baseContext.service,
    env:
      typeof mergedMetadata.env === 'string' && mergedMetadata.env.trim()
        ? mergedMetadata.env
        : baseContext.env,
    ...(typeof mergedMetadata.region === 'string' && mergedMetadata.region.trim()
      ? { region: mergedMetadata.region }
      : baseContext.region
        ? { region: baseContext.region }
        : {}),
  };
}

export class Logger {
  private enabled: boolean;
  private hardDisableNetwork: boolean;
  private clientId?: string;
  private baseContext: ReturnType<typeof buildBaseContext>;
  private loggerMetadata: Record<string, unknown>;
  private runtimeMetadata: RuntimeMetadata | null;
  private captureFunctionName: boolean;
  private masker: Masker;
  private buffer: CircularBuffer;
  readonly configClient: ConfigClient;
  private attributeExtractor: AttributeExtractor;
  private attributionExtractor: AttributionExtractor;
  transport?: HttpTransport;
  private errorLevelDetector: (entry: LogEntry) => boolean;
  private runtimeConfigPollTimer?: ReturnType<typeof setInterval>;
  private processErrorTeardown?: () => void;
  private shutdownTeardown?: () => void;
  private lifecycleTeardown?: () => void;
  private consoleTeardown?: () => void;
  readonly resolved: ResolvedLoggerConfig;
  private bootstrapHandles: LoggerBootstrapHandles = {};
  private trafficCategories: TrafficCategoryState;
  private trafficShutdown?: () => void;
  private trafficSessionId = 0;

  constructor(config: LoggerConfig = {}) {
    this.resolved = normalizeLoggerConfig(config);
    emitConfigValidationIssues(validateLoggerConfig(this.resolved), this.resolved.debug);

    const logging = this.resolved.logging;
    this.enabled = logging.enabled;
    this.hardDisableNetwork = this.resolved.hardDisableNetwork;
    this.clientId = config.service ?? config.clientId;
    this.baseContext = buildBaseContext(config);
    this.captureFunctionName = logging.captureFunctionName;
    this.loggerMetadata = buildServiceMetadata(
      {
        service: this.baseContext.service,
        env: this.baseContext.env,
        region: this.baseContext.region as string | undefined,
      },
      logging.serviceMetadata,
    );
    this.runtimeMetadata = logging.runtimeMetadata
      ? buildRuntimeMetadata((this.baseContext.host as string) || hostname(), getSdkVersion())
      : null;

    this.masker = new Masker(
      logging.maskPatterns,
      logging.sensitiveKeys,
      '***',
      logging.enableSensitiveDataMasking,
    );
    this.buffer = new CircularBuffer(logging.bufferSize, logging.bufferTtlMs);

    const authToken = this.resolved.apiKey || this.resolved.authToken;
    const { configOrigin, ingestionUrl } = resolveUmbrelogEndpoints(this.resolved.baseUrl);
    const serviceId = this.baseContext.service;
    const env = this.baseContext.env;

    this.configClient = new ConfigClient(
      configOrigin,
      serviceId,
      env,
      logging.configPollIntervalMs,
      authToken,
    );

    this.attributeExtractor = new AttributeExtractor(logging.enableAttributeExtraction);
    this.attributionExtractor = new AttributionExtractor(
      logging.attributionConfig,
      logging.enableAttribution,
    );

    this.errorLevelDetector = (entry) => {
      const messageLower = entry.message.toLowerCase();
      if (
        messageLower.includes('error') ||
        messageLower.includes('exception') ||
        messageLower.includes('failed') ||
        messageLower.includes('failure')
      ) {
        return true;
      }
      const attrs = entry.attributes || {};
      if (attrs.error || attrs.err || attrs.exception || attrs.stack) return true;
      if (typeof attrs.statusCode === 'number' && attrs.statusCode >= 500) return true;
      if (attrs.queryError || attrs.databaseError) return true;
      return false;
    };

    if (configOrigin) {
      const configClient = this.configClient;
      void (async () => {
        try {
          await configClient.startAndWaitForFirstFetch(5000);
          this.applyRuntimeConfig();
        } catch {
          /* default policies */
        }
      })();
      this.runtimeConfigPollTimer = setInterval(
        () => this.applyRuntimeConfig(),
        logging.configPollIntervalMs,
      );
      if (typeof this.runtimeConfigPollTimer.unref === 'function') this.runtimeConfigPollTimer.unref();
    }

    if (ingestionUrl) {
      this.transport = new HttpTransport(ingestionUrl, serviceId, env, authToken);
    }

    const traceCfg = logging.tracePropagation;
    if (
      traceCfg.enabled &&
      authToken &&
      !this.hardDisableNetwork &&
      ingestionUrl
    ) {
      startTraceBuffer({
        apiKey: authToken,
        service: serviceId,
        env,
        baseUrl: ingestionUrl,
        debug: this.resolved.debug,
        sampling: traceCfg.sampling,
      });
    }

    if (logging.captureUnhandledExceptions || logging.captureUnhandledRejections) {
      this.processErrorTeardown = registerProcessErrorHooks(this, {
        captureExceptions: logging.captureUnhandledExceptions,
        captureRejections: logging.captureUnhandledRejections,
      }).teardown;
    }

    if (logging.flushOnShutdown) {
      this.shutdownTeardown = registerShutdownHooks(this.transport, {
        enabled: true,
        timeoutMs: logging.flushTimeoutMs,
      }).teardown;
    }

    if (logging.captureConsole) {
      this.consoleTeardown = registerConsoleCapture(this).teardown;
    }

    this.trafficCategories = initialTrafficCategoryState();

    this.bootstrapHandles = bootstrapLoggerCapabilities(this.resolved, serviceId, env);

    if (this.bootstrapHandles.lifecycleCollector) {
      this.lifecycleTeardown = registerLifecycleHooks(this.bootstrapHandles.lifecycleCollector, {
        captureExceptions: logging.captureUnhandledExceptions,
        captureRejections: logging.captureUnhandledRejections,
        flushOnShutdown: logging.flushOnShutdown,
      }).teardown;
    }
  }

  /** Resolved SDK configuration (logging, runtime interactions, resource metrics, lifecycle). */
  getConfig(): Readonly<ResolvedLoggerConfig> {
    return this.resolved;
  }

  /**
   * Enable runtime traffic categories and (re)start the traffic runtime if needed.
   * Attach APIs opt in per provider — no runtimeInteractions category flags required.
   * Also used by manual / validation recordInteraction when no real client is attached.
   */
  enableTrafficCategories(partial: Partial<TrafficCategoryState>): void {
    this.ensureTrafficCategories(partial);
  }

  private ensureTrafficCategories(partial: Partial<TrafficCategoryState>): void {
    if (this.resolved.hardDisableNetwork) return;
    const { next, changed } = mergeTrafficCategoryState(this.trafficCategories, partial);
    if (!changed && this.trafficShutdown) return;
    this.trafficCategories = next;
    this.startTrafficInstrumentation();
  }

  private startTrafficInstrumentation(): void {
    if (this.resolved.hardDisableNetwork) return;
    const auth = this.resolved.apiKey || this.resolved.authToken;
    if (!auth) {
      if (this.resolved.debug) {
        console.warn('[UmbreLog SDK] runtime interactions require apiKey — traffic instrumentation skipped');
      }
      return;
    }

    this.trafficShutdown?.();
    const traffic: TrafficConfig = buildTrafficConfigFromState(
      this.trafficCategories,
      this.resolved.runtimeInteractions.traffic,
    );
    const baseUrl = resolveIngestionBaseUrl(this.resolved.baseUrl);
    const { shutdown, sessionId } = startTrafficInstrumentation({
      apiKey: auth,
      service: this.baseContext.service,
      env: this.baseContext.env,
      baseUrl,
      debug: this.resolved.debug,
      traffic,
      patchGlobalFetch: this.trafficCategories.http,
    });
    this.trafficShutdown = shutdown;
    this.trafficSessionId = sessionId;
  }

  /**
   * Attach one or more runtime providers in a single call.
   * Each attach enables its interaction kind automatically.
   */
  instrument(targets: InstrumentTargets): void {
    if (targets.express) this.attachExpress(targets.express);
    if (targets.postgres?.client) {
      this.attachPostgres(targets.postgres.client, {
        databaseId: targets.postgres.databaseId,
      });
    }
    if (targets.mysql2?.pool) {
      this.attachMysql2(targets.mysql2.pool, { databaseId: targets.mysql2.databaseId });
    }
    if (targets.redis?.client) {
      this.attachRedis(targets.redis.client, { redisId: targets.redis.redisId });
    }
  }

  /** Attach inbound HTTP instrumentation to an Express-compatible app (also enables outbound fetch). */
  attachExpress(
    app: Parameters<typeof instrumentExpress>[0],
    options?: ExpressAttachOptions,
  ): void {
    this.ensureTrafficCategories({ http: true });
    const registry = getTrafficRegistry();
    const traceOpts: ExpressTraceOptions = {
      enabled:
        this.resolved.logging.tracePropagation.enabled &&
        !this.hardDisableNetwork &&
        Boolean(this.resolved.apiKey || this.resolved.authToken),
      rootService: this.baseContext.service,
      processName: options?.processName,
    };
    instrumentExpress(app, registry, traceOpts);
  }

  /** Enable outbound `fetch` instrumentation without inbound HTTP middleware. */
  attachFetch(): void {
    this.ensureTrafficCategories({ http: true });
  }

  /** Attach PostgreSQL client instrumentation (`pg`). */
  attachPostgres(
    client: Parameters<typeof instrumentPg>[0],
    databaseIdOrOptions?: string | PostgresAttachOptions,
  ): void {
    const databaseId =
      typeof databaseIdOrOptions === 'string'
        ? databaseIdOrOptions
        : databaseIdOrOptions?.databaseId;
    this.ensureTrafficCategories({ database: true });
    const registry = getTrafficRegistry();
    if (!registry) return;
    instrumentPg(client, registry, databaseId);
  }

  /** Attach MySQL2 pool instrumentation. */
  attachMysql2(
    pool: Parameters<typeof instrumentMysql2>[0],
    databaseIdOrOptions?: string | MysqlAttachOptions,
  ): void {
    const databaseId =
      typeof databaseIdOrOptions === 'string'
        ? databaseIdOrOptions
        : databaseIdOrOptions?.databaseId;
    this.ensureTrafficCategories({ database: true });
    const registry = getTrafficRegistry();
    if (!registry) return;
    instrumentMysql2(pool, registry, databaseId);
  }

  /** Attach Redis client instrumentation (`node-redis` / `ioredis`). */
  attachRedis(
    client: Parameters<typeof instrumentRedis>[0],
    redisIdOrOptions?: string | RedisAttachOptions,
  ): void {
    const redisId =
      typeof redisIdOrOptions === 'string' ? redisIdOrOptions : redisIdOrOptions?.redisId;
    this.ensureTrafficCategories({ database: true });
    const registry = getTrafficRegistry();
    if (!registry) return;
    instrumentRedis(client, registry, redisId);
  }

  private applyRuntimeConfig(): void {
    const maskingConfig = this.configClient.getMaskingConfig();
    if (maskingConfig.enabled !== this.masker.isEnabled()) {
      maskingConfig.enabled ? this.masker.enable() : this.masker.disable();
    }
    maskingConfig.fields.forEach((field: string) => this.masker.addSensitiveKey(field));
  }

  /**
   * logger.info(message) | logger.info(message, { attributes })
   */
  private handleLog(level: LogLevel, arg1: unknown, arg2?: unknown): void {
    let message: string;
    let attributes: Record<string, unknown>;

    if (arg2 === undefined && typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
      message = formatObjectLiteral(arg1);
      attributes = {};
    } else if (
      arg2 !== undefined &&
      typeof arg2 === 'object' &&
      arg2 !== null &&
      !Array.isArray(arg2)
    ) {
      message =
        typeof arg1 === 'string'
          ? arg1
          : typeof arg1 === 'object' && arg1 !== null
            ? formatObjectLiteral(arg1)
            : String(arg1);
      attributes = arg2 as Record<string, unknown>;
    } else {
      message =
        typeof arg1 === 'string'
          ? arg1
          : typeof arg1 === 'object' && arg1 !== null
            ? formatObjectLiteral(arg1)
            : String(arg1);
      attributes = {};
    }

    this.logInternal(message, attributes, level);
  }

  private logInternal(
    message: string,
    attributes: Record<string, unknown>,
    level: LogLevel,
  ): void {
    message = replaceObjectObjectInMessage(message, attributes);
    const perLogMetadata = stripPerLogMetadata(attributes);

    const extractedAttributes = this.attributeExtractor.extractAndMerge(message, perLogMetadata);

    const functionName = this.captureFunctionName ? captureCallerFunctionName() : undefined;
    const mergedAttributes = buildEnrichedAttributes({
      loggerMetadata: this.loggerMetadata,
      perLogMetadata: extractedAttributes || {},
      runtimeMetadata: this.runtimeMetadata,
      functionName,
    });

    const extractedClientId = this.attributionExtractor.extract(mergedAttributes);
    const clientId = extractedClientId || this.clientId;

    const traceCtx = getTraceContext();
    applyExecutionContextToAttributes(mergedAttributes, traceCtx);

    const entry: LogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      message,
      attributes: mergedAttributes,
      metadata: buildEntryMetadata(this.baseContext, mergedAttributes),
      level,
      ...(clientId ? { clientId } : {}),
      ...(traceCtx?.traceId ? { traceId: traceCtx.traceId } : {}),
      ...(traceCtx?.executionId ? { executionId: traceCtx.executionId } : {}),
      ...(traceCtx?.correlationId ? { correlationId: traceCtx.correlationId } : {}),
      ...(traceCtx?.process ? { process: traceCtx.process } : {}),
      ...(traceCtx?.runtimeInteractionId
        ? { runtimeInteractionId: traceCtx.runtimeInteractionId }
        : {}),
      ...(traceCtx?.parentRuntimeInteractionId
        ? { parentRuntimeInteractionId: traceCtx.parentRuntimeInteractionId }
        : {}),
      ...(traceCtx?.runtimeInteractionType
        ? { runtimeInteractionType: traceCtx.runtimeInteractionType }
        : {}),
      ...(traceCtx?.runtimeInteractionVersion !== undefined
        ? { runtimeInteractionVersion: traceCtx.runtimeInteractionVersion }
        : {}),
      ...(traceCtx?.runtimeInteractionSource
        ? { runtimeInteractionSource: traceCtx.runtimeInteractionSource }
        : {}),
      ...(traceCtx?.executionStatus ? { executionStatus: traceCtx.executionStatus } : {}),
    };

    const maskedEntry = this.masker.maskLogEntry(entry);
    if (clientId && maskedEntry.attributes) {
      maskedEntry.attributes.client_id = clientId;
    }

    const policies = this.configClient.getPolicies();
    const action = PolicyEvaluator.evaluate(maskedEntry, policies, level);

    this.buffer.add(maskedEntry);
    if (this.transport && !this.hardDisableNetwork) {
      this.transport.send(maskedEntry, action, level);
    }
  }

  error(message: string, attributes?: Record<string, unknown>): void;
  error(arg1: unknown, arg2?: unknown): void {
    this.handleLog('error', arg1, arg2);
  }

  warn(message: string, attributes?: Record<string, unknown>): void;
  warn(arg1: unknown, arg2?: unknown): void {
    this.handleLog('warn', arg1, arg2);
  }

  info(message: string, attributes?: Record<string, unknown>): void;
  info(arg1: unknown, arg2?: unknown): void {
    this.handleLog('info', arg1, arg2);
  }

  debug(message: string, attributes?: Record<string, unknown>): void;
  debug(arg1: unknown, arg2?: unknown): void {
    this.handleLog('debug', arg1, arg2);
  }

  fatal(message: string, attributes?: Record<string, unknown>): void;
  fatal(arg1: unknown, arg2?: unknown): void {
    this.handleLog('fatal', arg1, arg2);
  }

  log(message: string, attributes?: Record<string, unknown>): void;
  log(arg1: string, arg2?: Record<string, unknown>): void {
    const attrs = (typeof arg2 === 'object' && arg2 !== null ? arg2 : {}) as Record<string, unknown>;
    let level: LogLevel = 'info';
    if (attrs.level) {
      const levelStr = String(attrs.level).toLowerCase();
      if (['error', 'warn', 'info', 'debug', 'fatal'].includes(levelStr)) level = levelStr as LogLevel;
    } else if ((typeof attrs.statusCode === 'number' && attrs.statusCode >= 500) || attrs.error) {
      level = 'error';
    } else if (typeof attrs.statusCode === 'number' && attrs.statusCode >= 400) {
      level = 'warn';
    }
    const cleanAttrs = { ...attrs };
    delete cleanAttrs.level;
    this.logInternal(arg1, cleanAttrs, level);
  }

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }
  getBufferedEntries(): LogEntry[] { return this.buffer.getAll(); }
  flush(): LogEntry[] { return this.buffer.flush(); }
  getBufferSize(): number { return this.buffer.getSize(); }
  setClientId(clientId: string): void { this.clientId = clientId; }
  getClientId(): string | undefined { return this.clientId; }

  getRuntimeConfig(): RuntimeConfig {
    const config = this.configClient.getConfig();
    return {
      enabled: config.enabled,
      enabledServices: config.enabledServices,
      disabledServices: config.disabledServices,
    };
  }

  getLastConfigFetchTime(): number { return this.configClient.getLastSuccessfulFetch(); }
  isServiceEnabled(): boolean { return this.configClient.isServiceEnabled(this.clientId); }
  updateRuntimeConfig(config: RuntimeConfig): void { this.configClient.updateConfig(config); }

  enableAttributeExtraction(): void { this.attributeExtractor.enable(); }
  disableAttributeExtraction(): void { this.attributeExtractor.disable(); }
  isAttributeExtractionEnabled(): boolean { return this.attributeExtractor.isEnabled(); }

  enableSensitiveDataMasking(): void { this.masker.enable(); }
  disableSensitiveDataMasking(): void { this.masker.disable(); }
  isSensitiveDataMaskingEnabled(): boolean { return this.masker.isEnabled(); }
  addSensitiveKey(key: string): void { this.masker.addSensitiveKey(key); }
  removeSensitiveKey(key: string): void { this.masker.removeSensitiveKey(key); }
  getSensitiveKeys(): string[] { return this.masker.getSensitiveKeys(); }

  enableAttribution(): void { this.attributionExtractor.enable(); }
  disableAttribution(): void { this.attributionExtractor.disable(); }
  isAttributionEnabled(): boolean { return this.attributionExtractor.isEnabled(); }

  /**
   * Run a cron, manual, or background job inside a new trace root.
   * All logs during execution receive traceId / requestId / correlationId automatically.
   */
  async runWithTraceRoot<T>(input: TraceRootInput, fn: () => T | Promise<T>): Promise<T> {
    if (!this.resolved.logging.tracePropagation.enabled) {
      return fn();
    }
    return runTraceRoot(input, this.baseContext.service, fn);
  }

  /** Wrap a Kafka consumer handler — creates or continues a trace root per message. */
  async runWithKafkaMessage<T>(
    topic: string,
    headers: Record<string, unknown> | undefined,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.ensureTrafficCategories({ messaging: true });
    if (!this.resolved.logging.tracePropagation.enabled) {
      return fn();
    }
    return runKafkaMessage(topic, headers, this.baseContext.service, fn);
  }

  /** Wrap a RabbitMQ consumer handler — creates or continues a trace root per message. */
  async runWithRabbitMessage<T>(
    queue: string,
    headers: Record<string, unknown> | undefined,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.ensureTrafficCategories({ messaging: true });
    if (!this.resolved.logging.tracePropagation.enabled) {
      return fn();
    }
    return runRabbitMessage(queue, headers, this.baseContext.service, fn);
  }

  /** Wrap a Pub/Sub subscriber handler — creates or continues a trace root per message. */
  async runWithPubSubMessage<T>(
    subscription: string,
    attributes: Record<string, unknown> | undefined,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.ensureTrafficCategories({ messaging: true });
    if (!this.resolved.logging.tracePropagation.enabled) {
      return fn();
    }
    return runPubSubMessage(subscription, attributes, this.baseContext.service, fn);
  }

  /** Flush in-flight logs, lifecycle, traffic, and trace batches, then tear down timers/hooks. */
  async shutdown(): Promise<void> {
    await this.bootstrapHandles.lifecycleCollector?.flushPending();
    await this.bootstrapHandles.metricsCollector?.flushPending();
    this.trafficShutdown?.();
    this.trafficShutdown = undefined;
    const { flushTrafficTransport } = await import('./traffic/transport');
    await flushTrafficTransport(10_000);
    await flushTraceTransport(10_000);
    await this.transport?.flush(10_000);
    this.destroy();
  }

  destroy(): void {
    this.bootstrapHandles.lifecycleCollector?.stop();
    this.bootstrapHandles.metricsCollector?.stop();
    this.trafficShutdown?.();
    this.trafficShutdown = undefined;
    this.bootstrapHandles = {};
    this.configClient.stop();
    if (this.runtimeConfigPollTimer) {
      clearInterval(this.runtimeConfigPollTimer);
      this.runtimeConfigPollTimer = undefined;
    }
    this.processErrorTeardown?.();
    this.shutdownTeardown?.();
    this.lifecycleTeardown?.();
    this.consoleTeardown?.();
    stopTraceBuffer();
  }

  replayByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.buffer.replayByTimeRange(startTime, endTime);
  }
  replay(options: ReplayOptions = {}): LogEntry[] { return this.buffer.replay(options); }
  replayLastMinutes(minutes: number): LogEntry[] { return this.buffer.replayLastMinutes(minutes); }
}

export type { ReplayOptions };
