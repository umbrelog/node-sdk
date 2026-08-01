export type TraceEntryType = 'http' | 'kafka' | 'rabbitmq' | 'pubsub' | 'cron' | 'manual';

export type TraceRootStatus = 'open' | 'ok' | 'failed' | 'slow';

/** Outcome of the execution at log emit time — enables log filters without joining traces. */
export type ExecutionStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'partial_success';

/** Kind of the active runtime interaction — enables interaction-type filters without parsing provider. */
export type RuntimeInteractionType =
  | 'http'
  | 'postgres'
  | 'mysql'
  | 'redis'
  | 'rabbit'
  | 'pubsub'
  | 'kafka'
  | 'filesystem'
  | 'cache'
  | 'cron';

/** How a runtime interaction was created — aids SDK debugging and future plugin integrations. */
export type RuntimeInteractionSource = 'auto' | 'manual' | 'sdk' | 'plugin';

export type TraceContext = {
  traceId: string;
  /** Execution/run id shown in the Processes UI — defaults to traceId. */
  executionId?: string;
  /** Business process label — defaults to entryName when set. */
  process?: string;
  parentTraceId?: string | null;
  requestId?: string;
  correlationId?: string;
  /** Active runtime interaction span id for logs emitted during an interaction. */
  runtimeInteractionId?: string;
  /** Parent of the active runtime interaction — enables future execution graphs. */
  parentRuntimeInteractionId?: string | null;
  /** Kind of the active runtime interaction (http, postgres, kafka, …). */
  runtimeInteractionType?: RuntimeInteractionType;
  /** Runtime interaction metadata schema version — default 1. */
  runtimeInteractionVersion?: number;
  /** How the active runtime interaction was created (auto, manual, sdk, plugin). */
  runtimeInteractionSource?: RuntimeInteractionSource;
  /** Execution outcome at log emit time — defaults to running while the trace root is open. */
  executionStatus?: ExecutionStatus;
  entryType?: TraceEntryType;
  entryName?: string;
  rootService: string;
  startedAt: number;
  hot?: boolean;
};

export type TraceRootInput = {
  entryType: TraceEntryType;
  entryName: string;
  process?: string;
  parentTraceId?: string | null;
  requestId?: string;
  correlationId?: string;
};

export type TraceInteractionKind =
  | 'trace_root'
  | 'http'
  | 'database'
  | 'messaging'
  | 'files'
  | 'cache';

export type TraceInteractionRecord = {
  interaction_kind: TraceInteractionKind;
  interaction_id: string;
  /** Parent runtime interaction that caused this interaction (nullable). */
  parent_runtime_interaction_id?: string | null;
  trace_id: string;
  parent_trace_id?: string | null;
  request_id?: string;
  correlation_id?: string;
  service: string;
  env: string;
  provider: string;
  direction?: string;
  fingerprint: string;
  entry_type?: string;
  entry_name?: string;
  root_service: string;
  started_at: number;
  duration_ms: number;
  status_code?: number;
  error?: boolean;
  timeout?: boolean;
  metadata?: Record<string, string | number | boolean>;
};

export type TraceRootRecord = {
  trace_id: string;
  parent_trace_id?: string | null;
  root_service: string;
  entry_type: string;
  entry_name: string;
  request_id?: string;
  correlation_id?: string;
  started_at: number;
  status: TraceRootStatus;
  completed_at?: number | null;
  duration_ms?: number | null;
  preservation?: 'normal' | 'significant';
  preservation_reason?: string;
};

export type TraceIngestPayload = {
  service: string;
  env: string;
  roots: TraceRootRecord[];
  interactions: TraceInteractionRecord[];
};

export type TraceTransportConfig = {
  apiKey: string;
  service: string;
  env: string;
  baseUrl: string;
  debug?: boolean;
};
