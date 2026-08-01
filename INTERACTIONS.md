# Runtime interactions architecture

Runtime interactions are **your application's** outbound calls, inbound HTTP, database queries, messaging, and file I/O. They are separate from platform **operational systems** monitoring.

## Mental model

| Layer | Answers | Example |
|-------|---------|---------|
| **Attach / helpers** | Which library or entry point is instrumented? | `attachPostgres(pool, { databaseId: 'primary' })` |
| **Traffic thresholds** (`runtimeInteractions.traffic`) | Optional slow-request / capture tuning | `http: { slowRequestThresholdMs: 3000 }` |

There are **no category flags** (`outbound`, `database`, …). Call the attach API when you want collection; omit it when you do not.

## Canonical interaction schema

Every observation uses `InteractionObservation`:

| Field | Role |
|-------|------|
| `interactionId` | Unique span id (always set on persisted events) |
| `kind` | `http.inbound`, `http.outbound`, `db.query`, `messaging.publish`, `messaging.consume`, `file.upload`, `file.download` |
| `provider` | `express`, `fetch`, `postgresql`, `kafka`, … |
| `fingerprint` | Normalized route / SQL / topic / object key |
| `durationMs` | Wall-clock duration |
| `status` | `ok` \| `error` \| `timeout` (optional) |
| `attributes` | Provider-specific dimensions (`method`, `statusCode`, `databaseId`, …) |
| `context` | Optional explicit fields when recording manually (`correlationId`, `requestId`, …) |

Persisted traffic events include `interactionId` in `metadata`. Inbound HTTP may also include `correlationId` / `requestId` from request headers (internal only — not exposed via context APIs).

## Enrichment

**Logs:** pass attributes on each call:

```ts
logger.info('Order created', { orderId: '123', userId: '42', tenantId: 'tenant-a' });
```

**Runtime interactions:** instrumentation adds `interactionId` automatically. Inbound Express reads `x-correlation-id` / `x-request-id` from headers when present. Manual `recordInteraction` calls may pass optional `context` fields.

## Public API

```ts
// Attach when your app and clients exist
logger.attachExpress(app);           // inbound HTTP + outbound fetch + execution context
logger.attachFetch();                // outbound fetch only
logger.attachPostgres(pool, { databaseId: 'primary' });
logger.attachMysql2(pool, { databaseId: 'primary' });
logger.attachRedis(redisClient, { redisId: 'session-cache' });

logger.instrument({
  express: app,
  postgres: { client: pool, databaseId: 'primary' },
  redis: { client: redisClient, redisId: 'session-cache' },
});

// Optional advanced thresholds only
createLogger({
  service: 'orders-api',
  apiKey: process.env.UMBRELOG_API_KEY,
  runtimeInteractions: {
    traffic: {
      http: { slowRequestThresholdMs: 3000 },
      database: { slowQueryThresholdMs: 500 },
    },
  },
});
```

See **`EXECUTION_CONTEXT.md`** for execution fields, runtime interaction hierarchy, and automatic vs manual instrumentation.

## Adding a new provider

1. Add entry to `RUNTIME_PROVIDER_CATALOG` (`interactions/providers/types.ts`).
2. Implement `src/traffic/instrumentation/<provider>.ts` that calls `registry.record*` and `emitProviderTraceInteraction` when trace propagation is enabled.
3. Add `logger.attach<Provider>(client, options?)` that calls `ensureTrafficCategories` for the catalog category.
4. Attach alone enables collection — no config flag required.

Future providers (Kafka client auto-patch, S3, …) follow the same path without changing the canonical schema.

## Collection activation

| Interaction kind | Enable with | Also requires |
|------------------|-------------|---------------|
| Outbound HTTP | `attachFetch()` or `attachExpress()` | `apiKey`, traffic runtime started on attach |
| Inbound HTTP | `attachExpress()` | `apiKey`, traffic runtime started on attach |
| Database | `attachPostgres` / `attachMysql2` / `attachRedis` | `apiKey`, traffic runtime started on attach |
| Messaging | `runWithKafkaMessage` / `runWithRabbitMessage` / publish helpers | `apiKey`, traffic runtime started |
| Object storage / files | manual `recordFileTransfer` | registry active (via any attach) |

### Common combinations

| Attach | Outcome |
|--------|---------|
| `attachPostgres()` | DB interactions collected |
| *(none)* | No runtime interaction events |
| `attachExpress()` | Inbound HTTP + outbound fetch + execution context |
| `attachFetch()` only | Outbound fetch only |

**Rule:** Attach wires providers and starts the traffic runtime. To disable collection, omit the attach call.

### Multiple loggers in one process

- **Traffic registry** — singleton; last `startTrafficInstrumentation` wins. Prefer one logger per process for runtime interactions.
- **Global `fetch` patch** — applied once; uses active registry at call time. Destroying an older logger does not affect a newer one's session.
- **Resource metrics** — per logger; each collector has its own timer when `resourceMetrics.enabled` is true (default). Multiple enabled loggers = duplicate host samples.
- **Runtime lifecycle** — per logger; separate from resource metrics (process heap/event loop vs system host metrics).

See **`CONFIG.md`** for `lifecycle` vs `resourceMetrics` and **`HARDENING.md`** for production checklist.

## Internal modules

| Path | Purpose |
|------|---------|
| `interactions/types.ts` | Canonical schema |
| `traffic/registry.ts` | Singleton observation registry + flush |
| `traffic/instrumentation/*` | Provider patches |
