# Changelog

All notable changes to `@umbrelog/sdk` are documented here.

## 2.2.1 — 2026-08-01

### Changed

- **Package description** — positions Umbrelog as an AI-powered Log Management Platform (npm metadata + README).
- **Public source repository** — development continues in [umbrelog/node-sdk](https://github.com/umbrelog/node-sdk).

## 2.2.0 — 2026-07-11

### Added

- **LogEnvelope contract on Node transport** — every ingested log now includes `runtime: "node"`, `platform: "node"`, and `sdkVersion` so Node and Browser share one investigation identity model.
- **Default `source: "node"`** when the log does not already set `source`.
- **Exported types** — `LogEnvelope`, `UmbrelogRuntime`, and `UmbrelogPlatform` from the package root (for typing shared wire shape; not required for normal `createLogger` usage).

## 2.1.0 — 2026-06-30

### Added

- **HTTP Process Name Resolver** — deterministic business process names from HTTP method + path (e.g. `POST /campaigns` → `Create Campaign`, `POST /orders/:id/cancel` → `Cancel Order`). Entry names stay technical (`HTTP POST /campaigns`).
- **`resolveHttpProcessName`**, **`resolveHttpProcessNameFromEntry`**, **`resolveHttpProcessNameWithFallback`**, **`fallbackHttpProcessName`**, and **`defaultHttpProcessNameResolver`** — reusable outside Express for Fastify, NestJS, or custom HTTP adapters.
- **`logger.attachExpress(app, { processName(req) { … } })`** — optional override; resolution priority is explicit callback → automatic resolver → legacy last-segment fallback.

### Changed

- **Express inbound traces** set `process` to the resolved business operation name instead of defaulting to the full HTTP entry label.

## 2.0.0 — 2026-06-24

### Breaking

- **Removed `runtimeInteractions` category flags** — `outbound`, `database`, `messaging`, `downloads`, and `inbound` are no longer supported in config. Pass old keys and the SDK logs a one-time warning; they have no effect. Enable collection via attach APIs only.
- **No traffic instrumentation at `createLogger()`** — the traffic runtime starts when you call `attachExpress`, `attachFetch`, `attachPostgres`, etc.

### Added

- **`logger.attachFetch()`** — outbound `fetch` instrumentation for services without inbound HTTP.

### Changed

- **`attachExpress(app)`** — enables inbound HTTP, outbound `fetch`, and execution context in one call.
- **`attachPostgres` / `attachMysql2` / `attachRedis`** — work without config flags; attach alone enables collection.
- **`runtimeInteractions`** — optional advanced thresholds only (`runtimeInteractions.traffic`).

### Migration

```ts
// Before (1.x)
createLogger({
  service: 'orders-api',
  apiKey: process.env.UMBRELOG_API_KEY,
  runtimeInteractions: { outbound: true, database: true },
});
logger.attachPostgres(pool);

// After (2.x)
const logger = createLogger({
  service: 'orders-api',
  apiKey: process.env.UMBRELOG_API_KEY,
});
logger.attachExpress(app);   // or attachFetch() for outbound-only
logger.attachPostgres(pool);
```

## 1.1.0 — 2026-06-26

### Added

- **Execution context** on logs when a trace root is active: `traceId`, `executionId`, `process`, `correlationId`, `runtimeInteractionId`, `runtimeInteractionType`, `executionStatus`, and related fields — promoted to indexed ingestion columns for dashboard search (`@traceId`, `@process`, `@correlationId`, …).
- **`getTraceContext()`** — read the active execution context from AsyncLocalStorage.
- **`Logger.runWithTraceRoot()`** — cron jobs, workers, and custom entry points.
- **`Logger.runWithKafkaMessage()`**, **`runWithRabbitMessage()`**, **`runWithPubSubMessage()`** — messaging consumers with automatic trace roots and topic normalization.
- **Express inbound trace roots** via `attachExpress()` — each request gets `process`, HTTP runtime interaction scope, and outbound trace header propagation (`x-umbrelog-schema-version`, `x-runtime-interaction-id`, …).
- **`attachRedis()`** — Redis command instrumentation with parent interaction chaining.
- **Resource metrics** flush on `shutdown()` so short-lived scripts still emit a final host-metrics snapshot (feeds operational context on logs after ingest).

### Changed

- Outbound `fetch` instrumentation propagates execution context headers when trace propagation is enabled.
- Log transport sends execution context as top-level fields (`trace_id`, `execution_id`, `process`, …) in addition to structured attributes.

### Notes

- Requires a compatible Umbrelog ingestion stack for indexed execution columns and operational context linking.
- Validated end-to-end via `lab` `sdk-validation` scenario (execution context + resource metrics).

## 1.0.2

Previous public release — structured logging, runtime interactions, resource metrics, lifecycle telemetry.
