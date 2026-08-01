export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  attributes: Record<string, unknown>;
  metadata?: {
    service?: string;
    env?: string;
    host?: string;
    version?: string;
    region?: string;
    [key: string]: unknown;
  };
  level?: string;
  clientId?: string;
  traceId?: string;
  executionId?: string;
  correlationId?: string;
  process?: string;
  runtimeInteractionId?: string;
  parentRuntimeInteractionId?: string;
  runtimeInteractionType?: string;
  runtimeInteractionVersion?: number;
  runtimeInteractionSource?: string;
  executionStatus?: string;
}

export interface RuntimeConfig {
  enabled?: boolean;
  enabledServices?: string[];
  disabledServices?: string[];
}

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
} from './config/types';

export type { LogLevel } from './log-level';
