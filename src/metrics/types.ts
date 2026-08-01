export type MetricSnapshot = {
  collected_at: number;
  cpu_usage_pct: number;
  memory_usage_pct: number;
  /** null when host OS cannot measure (macOS/Windows — Linux /proc only today). */
  network_bytes_per_sec: number | null;
  disk_iops: number | null;
};

export type MetricsCollectorConfig = {
  apiKey: string;
  service: string;
  env?: string;
  baseUrl?: string;
  intervalMs?: number;
  enabled?: boolean;
};

export type MetricsCollector = {
  start(): void;
  stop(): void;
  sampleOnce(): MetricSnapshot | null;
  flushPending(): Promise<void>;
};
