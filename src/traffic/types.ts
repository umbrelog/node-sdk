/** Runtime traffic intelligence — operational interaction visibility, not distributed tracing. */

export type TrafficCategory = 'http' | 'database' | 'messaging' | 'files';

export type HttpDirection = 'inbound' | 'outbound';

export type TrafficHttpConfig = {
  enabled?: boolean;
  slowRequestThresholdMs?: number;
  captureRetries?: boolean;
  captureFailures?: boolean;
  captureTimeouts?: boolean;
};

export type TrafficDatabaseConfig = {
  enabled?: boolean;
  slowQueryThresholdMs?: number;
  captureErrors?: boolean;
  captureRetries?: boolean;
  captureTimeouts?: boolean;
};

export type TrafficMessagingConfig = {
  enabled?: boolean;
  slowConsumerThresholdMs?: number;
  slowPublishThresholdMs?: number;
  slowAckThresholdMs?: number;
  slowCommitThresholdMs?: number;
  captureRetries?: boolean;
  captureDLQ?: boolean;
  captureRebalances?: boolean;
  captureCommitFailures?: boolean;
};

export type TrafficFilesConfig = {
  enabled?: boolean;
  slowUploadThresholdMs?: number;
  slowDownloadThresholdMs?: number;
  captureResponses?: boolean;
  /** Persist anomalous downloads only (default true). Healthy downloads aggregate only. */
  captureAnomalousDownloads?: boolean;
  captureUploadRetries?: boolean;
};

export type TrafficConfig = {
  http?: TrafficHttpConfig;
  database?: TrafficDatabaseConfig;
  messaging?: TrafficMessagingConfig;
  files?: TrafficFilesConfig;
};

export type TrafficSdkConfig = {
  apiKey: string;
  service: string;
  env?: string;
  baseUrl: string;
  debug?: boolean;
  traffic?: TrafficConfig;
  /** When true, patch global `fetch` (enabled when HTTP category is active via attachExpress / attachFetch). */
  patchGlobalFetch?: boolean;
};

/** Raw event persisted only for anomalies (slow, error, retry, timeout). */
export type TrafficRawEvent = {
  category: TrafficCategory;
  direction?: HttpDirection | 'inbound' | 'outbound' | 'publish' | 'consume';
  provider: string;
  fingerprint: string;
  method?: string;
  status_code?: number;
  duration_ms: number;
  occurred_at: number;
  error?: boolean;
  retry?: boolean;
  timeout?: boolean;
  database_id?: string;
  dependency?: string;
  file_size_bytes?: number;
  lifecycle_phase?: string;
  secondary_duration_ms?: number;
  file_operation?: 'upload' | 'download';
  consumer_group?: string;
  dlq?: boolean;
  nack?: boolean;
  metadata?: Record<string, string | number | boolean>;
};

/** 30s rolling aggregate bucket flushed to backend. */
export type TrafficAggregateBucket = {
  category: TrafficCategory;
  direction?: string;
  provider: string;
  fingerprint: string;
  method?: string;
  database_id?: string;
  dependency?: string;
  window_start_ms: number;
  window_end_ms: number;
  query_count: number;
  request_count: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  timeout_count: number;
  retry_count: number;
  slow_count: number;
  error_count: number;
  failure_rate: number;
  throughput_per_sec: number;
  p95_processing_ms?: number;
  p95_ack_ms?: number;
  p95_commit_ms?: number;
  dlq_count?: number;
  nack_count?: number;
  commit_failure_count?: number;
  rebalance_count?: number;
  lag_spike_count?: number;
};

export type TrafficIngestPayload = {
  service: string;
  env: string;
  aggregates: TrafficAggregateBucket[];
  events: TrafficRawEvent[];
};
