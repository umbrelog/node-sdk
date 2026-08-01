import type { TrafficConfig } from './types';

export const TRAFFIC_MIN_THRESHOLDS_MS = {
  http: 3000,
  database: 1000,
  messaging: 3000,
  files: 10_000,
} as const;

export type ResolvedTrafficThresholds = {
  httpSlowMs: number;
  dbSlowMs: number;
  messagingConsumerSlowMs: number;
  messagingPublishSlowMs: number;
  messagingAckSlowMs: number;
  messagingCommitSlowMs: number;
  fileDownloadSlowMs: number;
  fileSlowMs: number;
};

function clampThreshold(
  value: number | undefined,
  minimum: number,
  debug: boolean,
  label: string,
): number {
  if (value == null || !Number.isFinite(value)) return minimum;
  if (value < minimum) {
    if (debug) {
      console.warn(
        `[UmbreLog traffic] ${label} threshold ${value}ms below minimum ${minimum}ms — clamped`,
      );
    }
    return minimum;
  }
  return value;
}

/** Enforce minimum safe thresholds to protect ingestion volume. */
export function resolveTrafficThresholds(
  config: TrafficConfig | undefined,
  debug = false,
): ResolvedTrafficThresholds {
  return {
    httpSlowMs: clampThreshold(
      config?.http?.slowRequestThresholdMs,
      TRAFFIC_MIN_THRESHOLDS_MS.http,
      debug,
      'HTTP slow request',
    ),
    dbSlowMs: clampThreshold(
      config?.database?.slowQueryThresholdMs,
      TRAFFIC_MIN_THRESHOLDS_MS.database,
      debug,
      'Database slow query',
    ),
    messagingConsumerSlowMs: clampThreshold(
      config?.messaging?.slowConsumerThresholdMs,
      TRAFFIC_MIN_THRESHOLDS_MS.messaging,
      debug,
      'Messaging slow consumer',
    ),
    messagingPublishSlowMs: clampThreshold(
      config?.messaging?.slowPublishThresholdMs ?? config?.messaging?.slowConsumerThresholdMs,
      TRAFFIC_MIN_THRESHOLDS_MS.messaging,
      debug,
      'Messaging slow publish',
    ),
    messagingAckSlowMs: clampThreshold(
      config?.messaging?.slowAckThresholdMs ?? 2000,
      500,
      debug,
      'Messaging slow ACK',
    ),
    messagingCommitSlowMs: clampThreshold(
      config?.messaging?.slowCommitThresholdMs ?? 3000,
      500,
      debug,
      'Messaging slow commit',
    ),
    fileSlowMs: clampThreshold(
      config?.files?.slowUploadThresholdMs,
      TRAFFIC_MIN_THRESHOLDS_MS.files,
      debug,
      'File upload slow',
    ),
    fileDownloadSlowMs: clampThreshold(
      config?.files?.slowDownloadThresholdMs ?? config?.files?.slowUploadThresholdMs,
      TRAFFIC_MIN_THRESHOLDS_MS.files,
      debug,
      'File download slow',
    ),
  };
}
