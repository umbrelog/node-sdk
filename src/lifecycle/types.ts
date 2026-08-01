export type LifecycleEventType =
  | 'service_started'
  | 'service_restarted'
  | 'service_shutdown'
  | 'service_crash'
  | 'unexpected_restart';

export type RuntimeHeartbeat = {
  collected_at: number;
  session_id: string;
  started_at: number;
  uptime_sec: number;
  hostname: string;
  pid: number;
  sdk_version: string;
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    rss_mb: number;
  };
  cpu: {
    user_us: number;
    system_us: number;
  };
  event_loop_delay_ms: {
    mean: number;
    p99: number;
  };
  graceful_shutdown_pending?: boolean;
};

export type RuntimeLifecycleEvent = {
  occurred_at: number;
  session_id: string;
  previous_session_id?: string;
  event_type: LifecycleEventType;
  reason?: string;
  crash_detail?: {
    message: string;
    name?: string;
  };
};

export type RuntimeLifecycleIngestBody = {
  service: string;
  env: string;
  heartbeats?: RuntimeHeartbeat[];
  events?: RuntimeLifecycleEvent[];
};

export type LifecycleCollectorConfig = {
  apiKey: string;
  service: string;
  env: string;
  baseUrl: string;
  intervalMs: number;
  memoryPressurePct: number;
  eventLoopStallMs: number;
  debug?: boolean;
  enabled: boolean;
};

export type LifecycleCollector = {
  start(): void;
  stop(): void;
  emitEvent(event: Omit<RuntimeLifecycleEvent, 'session_id' | 'occurred_at'> & Partial<Pick<RuntimeLifecycleEvent, 'session_id' | 'occurred_at'>>): void;
  flushPending(): Promise<void>;
};
