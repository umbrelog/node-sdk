/** Messaging & file lifecycle phases — operational runtime model, not tracing spans. */

export type MessagingLifecyclePhase =
  | 'receive'
  | 'processing'
  | 'ack'
  | 'commit'
  | 'nack'
  | 'retry'
  | 'requeue'
  | 'dlq'
  | 'rebalance'
  | 'lag'
  | 'handler_failure';

export type FileOperation = 'upload' | 'download';

export type FileLifecyclePhase = 'started' | 'completed' | 'failed' | 'partial';

export type MessagingProviderKind = 'rabbitmq' | 'kafka' | 'pubsub' | string;

/** Full consumer cycle reported at ACK/commit (or on failure). */
export type MessagingLifecycleReport = {
  provider: MessagingProviderKind;
  queue_or_topic: string;
  consumer_group?: string;
  service?: string;
  processing_duration_ms: number;
  /** RabbitMQ / Pub/Sub ACK duration (after processing). */
  ack_duration_ms?: number;
  /** Kafka commit duration (after processing). */
  commit_duration_ms?: number;
  retry_count?: number;
  nack?: boolean;
  dlq?: boolean;
  requeue?: boolean;
  rebalance?: boolean;
  commit_failed?: boolean;
  lag_ms?: number;
  /** Processed OK but ACK/commit did not complete in time. */
  ack_blocked?: boolean;
  handler_error?: boolean;
  occurred_at?: number;
};

export type FileTransferReport = {
  provider: string;
  destination: string;
  operation: FileOperation;
  duration_ms: number;
  file_size_bytes?: number;
  retry_count?: number;
  status_code?: number;
  timeout?: boolean;
  error?: boolean;
  partial_failure?: boolean;
  failure_reason?: string;
  occurred_at?: number;
};
