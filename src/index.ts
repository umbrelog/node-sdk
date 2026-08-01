/**
 * Umbrelog SDK — public API.
 */
export { createLogger } from './factory';
export { Logger, formatObjectLiteral } from './logger';
export type { ExpressAttachOptions } from './traffic/instrumentation/http-express';
export type { LogEntry, LoggerConfig, LogLevel, RuntimeConfig } from './types';
export type { TraceRootInput, TraceEntryType } from './trace-context/types';
export type { LogEnvelope, UmbrelogRuntime, UmbrelogPlatform } from './log-envelope';
export {
  resolveHttpProcessName,
  resolveHttpProcessNameFromEntry,
  resolveHttpProcessNameWithFallback,
  fallbackHttpProcessName,
  defaultHttpProcessNameResolver,
} from './trace-context/process-name-resolver';
export type { HttpProcessNameInput, HttpProcessNameResolver } from './trace-context/process-name-resolver';
export { getSdkVersion } from './version';
export { getTraceContext } from './trace-context/context';
