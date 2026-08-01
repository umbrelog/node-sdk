/**
 * LogEnvelope — Umbrelog's Internal Product Contract.
 *
 * LogEnvelope is Umbrelog's canonical runtime-independent log model.
 * It is a product decision, not merely a TypeScript type: every runtime
 * (Node, Browser, and future Bun/Edge) must produce this shape before
 * HTTP serialization so logs share one investigation pipeline.
 *
 * Keep in sync with `@umbrelog/browser` LogEnvelope until shared
 * serialization is extracted to @umbrelog/sdk-wire.
 *
 * This is NOT a Logger implementation.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'fatal';

export type UmbrelogRuntime = 'node' | 'browser';

export type UmbrelogPlatform = 'node' | 'web' | string;

export type LogEnvelope = {
  timestamp: number;
  level: LogLevel;
  message: string;
  service: string;
  env: string;
  runtime: UmbrelogRuntime;
  platform: UmbrelogPlatform;
  source: string;
  sdkVersion: string;
  /** Optional application identity (used heavily by Browser; optional on Node). */
  application?: string;
  metadata: {
    service: string;
    env: string;
    version?: string;
    application?: string;
    [key: string]: unknown;
  };
  trace_id?: string;
  execution_id?: string;
  correlation_id?: string;
  attributes?: Record<string, unknown>;
};
