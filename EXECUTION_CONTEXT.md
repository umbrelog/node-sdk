# Execution Context

Execution Context is the **single correlation model** for logs, traces, and runtime interactions in the Umbrelog SDK. It extends Node.js `AsyncLocalStorage` (ALS) — there is no parallel context system.

## Fields on every log

When a trace root is active, logs automatically include:

| Field | Description |
|-------|-------------|
| `traceId` | Distributed trace id |
| `executionId` | Process execution id (defaults to `traceId`) |
| `process` | Business process label (defaults to entry name) |
| `correlationId` | Cross-service correlation id |
| `runtimeInteractionId` | Active runtime interaction span |
| `parentRuntimeInteractionId` | Parent interaction that caused this one (nullable) |
| `runtimeInteractionType` | Kind: `http`, `postgres`, `mysql`, `redis`, `kafka`, … |
| `runtimeInteractionVersion` | Interaction metadata schema version (default `1`) |
| `runtimeInteractionSource` | How the interaction was created: `auto`, `manual`, `sdk`, `plugin` |
| `executionStatus` | `running`, `success`, `failed`, `timeout`, `cancelled`, `partial_success` |

These are promoted to indexed ingestion columns (`trace_id`, `execution_id`, `runtime_interaction_id`, …) for filtering without JSON parsing.

## Runtime Interactions

A **Runtime Interaction** is one observable unit of work: an HTTP request, SQL query, Redis command, message publish, etc.

Each interaction exposes a consistent metadata model:

- `runtimeInteractionId`
- `parentRuntimeInteractionId` (nullable)
- `runtimeInteractionType`
- `runtimeInteractionVersion` (default `1`)
- `runtimeInteractionSource` — `auto` | `manual` | `sdk` | `plugin`
- `provider` (e.g. `express`, `postgresql`, `redis`, `kafka`)
- `operation` (e.g. `GET`, `query`, `publish`, `consume`)
- `target` (normalized route, SQL fingerprint, Redis key pattern, topic)
- `status` — `running`, `success`, `failed`, `timeout`, `cancelled`
- `startedAt`, `completedAt`, `durationMs`
- `error` (when applicable)

Provider-specific details are stored in interaction `metadata` without changing the core shape.

### Version and source (not in UI yet)

These optional fields are persisted end-to-end (SDK → transport → ingestion → storage) but **not shown in the UI** today. They exist so the architecture can evolve without ambiguous schema migrations:

| Field | Default | Purpose |
|-------|---------|---------|
| `runtimeInteractionVersion` | `1` | Future interaction metadata may add fields or change semantics; receivers know which version they are reading. |
| `runtimeInteractionSource` | `auto` | Distinguishes built-in instrumentation (`auto`), manual `runWithRuntimeInteraction()` (`manual`), SDK infrastructure such as `runWithTraceRoot` (`sdk`), and future third-party plugins (`plugin`). |

### Propagation schema version

Outbound trace headers include:

```
x-umbrelog-schema-version: 1
```

This is the **execution context propagation schema version** — separate from `runtimeInteractionVersion`. If header shapes or ALS propagation rules change in a future SDK release, receivers can detect which protocol version produced the context. Current behavior is unchanged when the header is absent (treated as version 1).

### Parent hierarchy

When one interaction directly causes another, the child records `parentRuntimeInteractionId`:

```
HTTP Request (parent)
  └─ RabbitMQ Publish (child, parent = HTTP)
       └─ RabbitMQ Consume (child, parent = Publish via message headers)
            └─ PostgreSQL Query (child, parent = Consume)
```

Cross-service links propagate via headers:

- `x-umbrelog-schema-version` — execution context propagation schema (default `1`)
- `x-runtime-interaction-id` — the interaction that produced the outbound message/request
- `x-parent-runtime-interaction-id` — optional explicit parent chain

Use `bindTraceContext()` for `EventEmitter` listeners that fire outside ALS scope.

## Automatic instrumentation

| Provider | How it is enabled | Runtime interaction |
|----------|-------------------|---------------------|
| HTTP inbound | `logger.attachExpress(app)` | Per request (`http`) |
| HTTP outbound | `logger.attachExpress(app)` or `logger.attachFetch()` | Per `fetch` (`http`) |
| PostgreSQL | `attachPostgres(client)` | Per query (`postgres`) |
| MySQL | `attachMysql2(pool)` | Per query (`mysql`) |
| Redis | `attachRedis(client)` | Per command (`redis`) |
| Kafka / Rabbit / Pub/Sub publish | `runWithKafkaPublish` / `runWithRabbitPublish` / `runWithPubSubPublish` | Per publish |
| Kafka / Rabbit / Pub/Sub consume | `runWithKafkaMessage` / `runWithRabbitMessage` / `runWithPubSubMessage` | Per consume |
| Cron / manual jobs | `runWithTraceRoot({ entryType: 'cron', … })` | Per execution (`cron`) |

### Redis

`attachRedis` wraps `node-redis` and `ioredis` clients. Supported commands include:

`GET`, `SET`, `DEL`, `MGET`, `MSET`, `HGET`, `HSET`, `EXPIRE`, `TTL`, `EXISTS`, `INCR`, `DECR`, `PUBLISH`, `SUBSCRIBE`

plus generic `sendCommand` fallback. Each command gets its own `runtimeInteractionId`, normalized `target` key, and duration.

```ts
logger.attachRedis(redisClient, { redisId: 'session-cache' });

// No manual wrappers required:
await redis.get('user:123');
```

### Messaging

Publish helpers create an interaction scope **and** record traffic. Inject trace headers inside the callback so consumers can continue the chain:

```ts
import {
  runWithKafkaPublish,
  injectTraceIntoKafkaHeaders,
  getTraceContext,
} from '@umbrelog/sdk';

await runWithKafkaPublish('orders.created', async () => {
  const headers = injectTraceIntoKafkaHeaders({}, getTraceContext()!);
  await producer.send({ topic: 'orders.created', messages: [{ value, headers }] });
});
```

## What still requires manual wiring

| Scenario | Action |
|----------|--------|
| Express app | `attachExpress(app)` once at startup |
| Database pools | `attachPostgres` / `attachMysql2` / `attachRedis` on your client instances |
| Message consumers | Wrap handler with `runWithKafkaMessage` (or Rabbit / Pub/Sub equivalent) |
| Message producers | Wrap send with `runWithKafkaPublish` (or equivalent) + header injection |
| Cron without HTTP | `runWithTraceRoot({ entryType: 'cron', entryName: 'nightly_sync' }, service, fn)` |
| EventEmitter callbacks | `emitter.on('event', bindTraceContext(handler))` |
| Libraries without attach API | `runWithRuntimeInteraction('http', () => …)` as escape hatch |

## Trace propagation

`logging.tracePropagation.enabled` defaults to **`true`**. You only need to set it when turning propagation **off**:

```ts
logging: {
  tracePropagation: { enabled: false },
}
```

When enabled, trace roots and interactions are sampled and sent to `/trace/ingest`. Hot/failed traces are always preserved. **Execution Context on logs still requires an active trace root** from `attachExpress`, `runWithTraceRoot`, messaging helpers, or equivalent — not from `createLogger()` alone.

## See also

- `INTERACTIONS.md` — traffic registry and provider catalog
- `CONFIG.md` — `runtimeInteractions` and `tracePropagation` options
- `../../docs/EXECUTION_CONTEXT.md` — product-facing glossary and FAQ

## FAQ

### What is Execution Context?
The automatic correlation layer on every log when a trace root is active. The SDK sets fields via AsyncLocalStorage — you do not pass them on every `logger.info()` call. `createLogger()` alone does not activate a trace root; use `attachExpress`, `runWithTraceRoot`, or messaging helpers.

### Why don't I see Execution Context on my logs?
Usually there is no active trace root at emit time. Attach inbound HTTP (`attachExpress`), wrap cron/background work (`runWithTraceRoot`), wrap message consumers (`runWithKafkaMessage`, etc.), or use `bindTraceContext` for EventEmitter callbacks. `logging.tracePropagation.enabled` defaults to `true` — missing fields rarely mean it is disabled.

### What is the default for `logging.tracePropagation.enabled`?
**`true`**. Set `enabled: false` only to disable propagation. Fields still require an active trace root from attach/wrap APIs.

### What is a Runtime Interaction?
One observable operation: HTTP request, SQL query, Redis command, Kafka publish, etc. Each gets its own `runtimeInteractionId`, `runtimeInteractionType`, duration, and status.

### What is the difference between `traceId` and `executionId`?
- **`traceId`** — technical distributed trace id (headers, cross-service).
- **`executionId`** — execution run id in the Processes UI (defaults to `traceId` in v1).

### What is the difference between `correlationId` and `traceId`?
- **`traceId`** — one SDK trace flow.
- **`correlationId`** — optional business id (`x-correlation-id`) that may span multiple traces.

### What is the difference between `process` and `runtimeInteractionType`?
- **`process`** — what business flow is running (`Checkout Session`, `nightly_sync`).
- **`runtimeInteractionType`** — what kind of step produced the log (`http`, `postgres`, `redis`).

### What is the difference between `runtimeInteractionType` and `provider`?
- **`runtimeInteractionType`** — normalized kind (`http`, `postgres`, `redis`) for filters and UI.
- **`provider`** — specific library (`express`, `postgresql`, `ioredis`) on the interaction record.

### What is the difference between `executionStatus` and interaction `status`?
- **`executionStatus`** — on the **log**: outcome of the whole execution when the log was emitted.
- **`status`** — on the **interaction**: outcome of that single operation (query, request, command).

### What is `parentRuntimeInteractionId`?
The interaction that caused this one. Example chain: HTTP → publish → consume → SQL. Propagates via `x-runtime-interaction-id` and `x-parent-runtime-interaction-id` headers.

### What is `runtimeInteractionVersion` vs `x-umbrelog-schema-version`?
- **`runtimeInteractionVersion`** — version of interaction metadata shape (default `1`).
- **`x-umbrelog-schema-version`** — version of header/ALS propagation protocol (default `1`).

### What is `runtimeInteractionSource`?
How the interaction was created: `auto` (instrumentation), `manual` (`runWithRuntimeInteraction`), `sdk` (`runWithTraceRoot`), `plugin` (future third-party).

### Execution Context vs Runtime Interactions in the Metrics tab?
- **Execution Context** — fields **on the log** (filterable in Logs).
- **Metrics → Runtime Interactions** — nearby interaction events around the log timestamp.

They complement each other: context identifies which execution produced the log; Metrics shows dependency timing nearby.

