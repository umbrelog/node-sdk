import type { TrafficAggregateBucket, TrafficCategory } from './types';

const ROLLUP_WINDOW_MS = 30_000;

type BucketKey = string;

type LatencyBucket = {
  category: TrafficCategory;
  direction?: string;
  provider: string;
  fingerprint: string;
  method?: string;
  database_id?: string;
  dependency?: string;
  consumer_group?: string;
  window_start_ms: number;
  latencies: number[];
  processing_latencies: number[];
  ack_latencies: number[];
  commit_latencies: number[];
  query_count: number;
  request_count: number;
  timeout_count: number;
  retry_count: number;
  slow_count: number;
  error_count: number;
  dlq_count: number;
  nack_count: number;
  commit_failure_count: number;
  rebalance_count: number;
  lag_spike_count: number;
};

function bucketKey(parts: Record<string, string | undefined>): BucketKey {
  return [
    parts.category,
    parts.direction ?? '',
    parts.provider,
    parts.fingerprint,
    parts.method ?? '',
    parts.database_id ?? '',
    parts.dependency ?? '',
    parts.consumer_group ?? '',
  ].join('|');
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

export class TrafficRollup {
  private buckets = new Map<BucketKey, LatencyBucket>();
  private windowStartMs: number;

  constructor(now = Date.now()) {
    this.windowStartMs = Math.floor(now / ROLLUP_WINDOW_MS) * ROLLUP_WINDOW_MS;
  }

  record(args: {
    category: TrafficCategory;
    direction?: string;
    provider: string;
    fingerprint: string;
    method?: string;
    database_id?: string;
    dependency?: string;
    consumer_group?: string;
    duration_ms: number;
    processing_duration_ms?: number;
    ack_duration_ms?: number;
    commit_duration_ms?: number;
    occurred_at: number;
    is_slow?: boolean;
    is_error?: boolean;
    is_retry?: boolean;
    is_timeout?: boolean;
    is_query?: boolean;
    is_dlq?: boolean;
    is_nack?: boolean;
    is_commit_failure?: boolean;
    is_rebalance?: boolean;
    is_lag_spike?: boolean;
    retry_increment?: number;
  }): void {
    const windowStart = Math.floor(args.occurred_at / ROLLUP_WINDOW_MS) * ROLLUP_WINDOW_MS;
    const key = bucketKey({
      category: args.category,
      direction: args.direction,
      provider: args.provider,
      fingerprint: args.fingerprint,
      method: args.method,
      database_id: args.database_id,
      dependency: args.dependency,
      consumer_group: args.consumer_group,
    });
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.window_start_ms !== windowStart) {
      bucket = {
        category: args.category,
        direction: args.direction,
        provider: args.provider,
        fingerprint: args.fingerprint,
        method: args.method,
        database_id: args.database_id,
        dependency: args.dependency,
        consumer_group: args.consumer_group,
        window_start_ms: windowStart,
        latencies: [],
        processing_latencies: [],
        ack_latencies: [],
        commit_latencies: [],
        query_count: 0,
        request_count: 0,
        timeout_count: 0,
        retry_count: 0,
        slow_count: 0,
        error_count: 0,
        dlq_count: 0,
        nack_count: 0,
        commit_failure_count: 0,
        rebalance_count: 0,
        lag_spike_count: 0,
      };
      this.buckets.set(key, bucket);
    }
    bucket.latencies.push(args.duration_ms);
    if (args.processing_duration_ms != null && args.processing_duration_ms >= 0) {
      bucket.processing_latencies.push(args.processing_duration_ms);
    }
    if (args.ack_duration_ms != null && args.ack_duration_ms >= 0) {
      bucket.ack_latencies.push(args.ack_duration_ms);
    }
    if (args.commit_duration_ms != null && args.commit_duration_ms >= 0) {
      bucket.commit_latencies.push(args.commit_duration_ms);
    }
    if (args.is_query) bucket.query_count += 1;
    else bucket.request_count += 1;
    if (args.is_timeout) bucket.timeout_count += 1;
    if (args.is_retry) bucket.retry_count += 1;
    if (args.retry_increment) bucket.retry_count += args.retry_increment;
    if (args.is_slow) bucket.slow_count += 1;
    if (args.is_error) bucket.error_count += 1;
    if (args.is_dlq) bucket.dlq_count += 1;
    if (args.is_nack) bucket.nack_count += 1;
    if (args.is_commit_failure) bucket.commit_failure_count += 1;
    if (args.is_rebalance) bucket.rebalance_count += 1;
    if (args.is_lag_spike) bucket.lag_spike_count += 1;
  }

  /** Flush buckets whose window ended before `now`. */
  flushReady(now = Date.now()): TrafficAggregateBucket[] {
    const currentWindow = Math.floor(now / ROLLUP_WINDOW_MS) * ROLLUP_WINDOW_MS;
    const out: TrafficAggregateBucket[] = [];
    for (const [key, bucket] of this.buckets) {
      if (bucket.window_start_ms >= currentWindow) continue;
      out.push(this.toAggregate(bucket));
      this.buckets.delete(key);
    }
    return out;
  }

  /** Flush all in-memory buckets (used on shutdown so short-lived processes still export rollups). */
  flushAll(): TrafficAggregateBucket[] {
    const out: TrafficAggregateBucket[] = [];
    for (const bucket of this.buckets.values()) {
      out.push(this.toAggregate(bucket));
    }
    this.buckets.clear();
    return out;
  }

  private toAggregate(bucket: LatencyBucket): TrafficAggregateBucket {
    const sorted = [...bucket.latencies].sort((a, b) => a - b);
    const total = bucket.query_count + bucket.request_count;
    const windowMs = ROLLUP_WINDOW_MS;
    const errorRate = total > 0 ? bucket.error_count / total : 0;
    return {
      category: bucket.category,
      direction: bucket.direction,
      provider: bucket.provider,
      fingerprint: bucket.fingerprint,
      method: bucket.method,
      database_id: bucket.database_id,
      dependency: bucket.dependency,
      window_start_ms: bucket.window_start_ms,
      window_end_ms: bucket.window_start_ms + windowMs,
      query_count: bucket.query_count,
      request_count: bucket.request_count,
      p95_latency_ms: percentile(sorted, 95),
      p99_latency_ms: percentile(sorted, 99),
      timeout_count: bucket.timeout_count,
      retry_count: bucket.retry_count,
      slow_count: bucket.slow_count,
      error_count: bucket.error_count,
      failure_rate: errorRate,
      throughput_per_sec: total / (windowMs / 1000),
      p95_processing_ms:
        bucket.processing_latencies.length > 0
          ? percentile([...bucket.processing_latencies].sort((a, b) => a - b), 95)
          : undefined,
      p95_ack_ms:
        bucket.ack_latencies.length > 0
          ? percentile([...bucket.ack_latencies].sort((a, b) => a - b), 95)
          : undefined,
      p95_commit_ms:
        bucket.commit_latencies.length > 0
          ? percentile([...bucket.commit_latencies].sort((a, b) => a - b), 95)
          : undefined,
      dlq_count: bucket.dlq_count || undefined,
      nack_count: bucket.nack_count || undefined,
      commit_failure_count: bucket.commit_failure_count || undefined,
      rebalance_count: bucket.rebalance_count || undefined,
      lag_spike_count: bucket.lag_spike_count || undefined,
    };
  }
}

export const TRAFFIC_ROLLUP_INTERVAL_MS = ROLLUP_WINDOW_MS;
