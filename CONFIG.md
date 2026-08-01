# SDK configuration

`createLogger()` is the single entry point for **application observability**:

1. **Logging** — structured logs, masking, buffer, process hooks  
2. **Runtime interactions** — your app’s HTTP, DB, messaging, file activity  
3. **Resource metrics** — system-level host telemetry (on by default when `apiKey` is set)  
4. **Runtime lifecycle** — process heartbeats, event-loop delay, crash/shutdown events (on by default when `apiKey` is set)

**Infrastructure monitoring** (PostgreSQL health, Redis, Kafka lag, polling, credentials) is owned by the **Umbrelog platform** → Operational Systems in the UI/API. It is **not** configured in the SDK.

---

## Example

```ts
import { createLogger } from '@umbrelog/sdk';

const logger = createLogger({
  service: 'orders-api',
  env: 'prod',
  apiKey: process.env.UMBRELOG_API_KEY,

  logging: {
    runtimeMetadata: true,              // hostname, pid, node version on every log
    captureUnhandledExceptions: true,   // log uncaught exceptions automatically
    captureUnhandledRejections: true,   // log unhandled promise rejections
    flushOnShutdown: true,              // send buffered logs on SIGTERM / SIGINT
    // merged with built-in defaults (password, token, ssn, …) — does not replace them
    sensitiveKeys: ['nationalId', 'iban'],
  },

  // Host metrics — enabled by default when apiKey is set (see overhead section)
  resourceMetrics: {
    enabled: true,
    interval: '60s',
  },

  // Process lifecycle — enabled by default when apiKey is set
  lifecycle: {
    enabled: true,
    interval: '30s',
  },
});

// Attach when your app and clients exist — each attach enables that kind of collection
logger.attachExpress(app);
// Optional: override automatic process names (Entry stays HTTP METHOD /path)
// logger.attachExpress(app, {
//   processName(req) {
//     return 'Generate Monthly Invoice';
//   },
// });
logger.attachPostgres(pgClient, { databaseId: 'primary' });
logger.attachFetch(); // outbound-only services (optional if you use attachExpress)

// Or attach multiple providers at once
logger.instrument({
  express: app,
  postgres: { client: pgClient, databaseId: 'primary' },
});
```

Optional advanced thresholds only (no category flags):

```ts
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

**You only need `apiKey` and `service`.** The SDK connects to Umbrelog Cloud automatically at `https://app.umbrelog.com` using the same nginx routes as the dashboard: ingestion on `/api` (e.g. `POST /api/logs`) and runtime config on `/config` (e.g. `GET /config/policies`). Customers never set `baseUrl`.

Platform developers running a local stack may set `UMBRELOG_BASE_URL=http://localhost:3000` (ingestion `:3000`, config-service `:3100` on separate ports).

---

## Structured logging

Pass attributes on each log call — no context APIs required:

```ts
logger.info('User authenticated', {
  userId: user.id,
  tenantId: tenant.id,
});

logger.error('Order failed', { orderId: 'ord-1', reason: 'timeout' });
```

Use stable field names (`orderId`, `userId`, `tenantId`) so you can filter and group in the dashboard.

---

## Sensitive data masking

By default, `enableSensitiveDataMasking` is **`true`**. Masking applies to **attribute field names** in log payloads (values are replaced with `***`) and to **built-in free-text patterns** in messages (Bearer tokens, JWT-shaped strings, PEM blocks, common cloud key prefixes, and `key=value` secret pairs).

### `sensitiveKeys` — adds to defaults, does not replace

`logging.sensitiveKeys` is **merged** with the SDK's built-in list (`DEFAULT_SENSITIVE_KEYS`). It does **not** limit masking to only the keys you list.

Built-in keys already include common secrets, for example:

`password`, `token`, `api_key`, `authorization`, `ssn`, `creditcard`, `cvv`, `secret`, `private_key`, `session`, `cookie`, and more.

Use `sensitiveKeys` for **app-specific** field names not covered by defaults:

```ts
logging: {
  sensitiveKeys: ['nationalId', 'iban', 'customerSecret'],
}
```

### Matching rules

- Case-insensitive exact match — `password` masks `Password`
- Substring match — `token` also masks `accessToken`, `userPassword`

### Other options

| Option | Default | Purpose |
|--------|---------|---------|
| `enableSensitiveDataMasking` | `true` | Toggle all field masking |
| `maskPatterns` | `[]` | Extra regex patterns on field names **and** log message text |

The platform can append more field names at runtime via remote config (`maskingFields`).

---

## Runtime interactions (attach-first)

| Attach / helper | What it enables |
|-----------------|-----------------|
| `logger.attachExpress(app)` | Inbound HTTP + outbound `fetch` + execution context |
| `logger.attachFetch()` | Outbound `fetch` only |
| `logger.attachPostgres` / `attachMysql2` / `attachRedis` | Database / Redis query interactions |
| `logger.runWithKafkaMessage` / Rabbit / PubSub | Messaging consumers + execution context |
| `logger.runWithTraceRoot` | Cron / background jobs + execution context |
| `recordMessagingLifecycle` / `recordFileTransfer` | Manual messaging / file events (registry must be active) |

| API | What it does |
|-----|--------------|
| `logger.instrument({ express, postgres, mysql2, redis })` | Attach multiple providers |
| `logger.attachExpress(app)` | Inbound HTTP instrumentation |
| `logger.attachPostgres(client, { databaseId })` | Instruments `pg` |
| `logger.attachMysql2(pool, { databaseId })` | Instruments `mysql2` |

Optional `runtimeInteractions.traffic` holds advanced thresholds only (slow-request ms, capture toggles) — not category flags.

Inbound HTTP interactions read `x-correlation-id` / `x-request-id` from request headers when present (or generate an internal correlation id).

See **`INTERACTIONS.md`** for the canonical interaction schema and provider extension guide.

### Why attach?

Node has no universal “the app” handle at `createLogger()` time. Frameworks (Express, Fastify, Nest) and DB pools are created **after** the logger. Attach APIs bind instrumentation to **your** instances — same pattern as OpenTelemetry instrumentations. To disable collection, omit the attach call.

---

## Resource metrics — defaults & overhead

**Source of truth:** `DEFAULT_RESOURCE_METRICS.enabled` is **`true`** in `src/config/defaults.ts`. Omitting `resourceMetrics` in `createLogger()` keeps metrics enabled. Set `resourceMetrics: { enabled: false }` to opt out. The collector only runs when `apiKey` (or `authToken`) is also provided.

**System-level** samples from the host OS — not process heap, not event-loop delay, and not PostgreSQL/Redis/Kafka health (those are separate: lifecycle heartbeats vs platform Operational Systems).

| Setting | Default | Notes |
|---------|---------|--------|
| `enabled` | **`true`** | Set `false` to disable host metrics |
| `interval` | **`60s`** | Clamped **30s–15m** |

### Sampling

Each tick runs `sampleServiceMetrics()` (requires ≥ 3s since last baseline for stable deltas):

| Field | Source |
|-------|--------|
| `cpu_usage_pct` | System-wide CPU busy % from `os.cpus()` jiffies delta |
| `memory_usage_pct` | System memory: Linux `(totalmem − freemem) / totalmem`; macOS `vm_stat` active+wired+compressed |
| `network_bytes_per_sec` | Linux `/proc/net/dev`; macOS `netstat -ibn` — `null` when unavailable |
| `disk_iops` | Linux `/proc/diskstats` delta; macOS `iostat` — `null` when unavailable |

Snapshots POST to `/metrics/ingest`. Resource metrics do not patch libraries and do not affect runtime interactions.

### Estimated overhead (single process, `interval: 60s`)

| Resource | Typical |
|----------|---------|
| CPU | &lt; 0.1% average (brief spike per sample) |
| Memory | Fixed ~few KB queue (max 24 snapshots) |
| Network | ~1 POST / 60s, ~200–400 byte JSON body per snapshot |

Traffic aggregates (runtime interactions) flush every **30s** separately when instrumentation is active — see traffic package.

### Production recommendation

```ts
resourceMetrics: { enabled: true, interval: '60s' }
```

Use `enabled: false` if you only need logs, lifecycle heartbeats, and runtime interactions without system-level host samples.

---

## Runtime lifecycle — defaults & overhead

Process-level health telemetry — **separate from** `resourceMetrics` (system host) and **runtime interactions** (HTTP/DB/messaging).

| Setting | Default | Notes |
|---------|---------|--------|
| `enabled` | **`true`** | Set `false` to disable lifecycle heartbeats and crash events |
| `interval` | **`30s`** | Heartbeat interval; clamped **15s–120s** |
| `memoryPressurePct` | `85` | Reserved for future client-side pressure events — **not evaluated in the SDK today** |
| `eventLoopStallMs` | `500` | Reserved for future client-side stall events — **not evaluated in the SDK today** |

### What lifecycle collects

On start: `service_started` event. On SIGTERM/SIGINT (when `flushOnShutdown`): `service_shutdown`. On uncaught exception / unhandled rejection (when logging hooks enabled): `service_crash`.

Each heartbeat includes: process heap used/total, RSS, `process.cpuUsage()` delta, event-loop delay mean/p99 (`monitorEventLoopDelay`), uptime, session id.

Heartbeats and events POST to `/runtime/lifecycle/ingest`.

### Production recommendation

```ts
lifecycle: { enabled: true, interval: '30s' }
```

Set `lifecycle.enabled: false` only when you do not need process health heartbeats. Event-loop and heap metrics live here — **not** in `resourceMetrics`.

---

## Logging defaults

| Field | Default |
|-------|---------|
| `enableSensitiveDataMasking` | `true` |
| `captureUnhandledExceptions` | `true` |
| `captureUnhandledRejections` | `true` |
| `flushOnShutdown` | `true` |
| `runtimeMetadata` | `true` |
| `captureFunctionName` | `false` |
| `bufferSize` | `1000` |

---

## Metadata precedence

1. Logger metadata (`serviceMetadata` / `createLogger`)  
2. Per-log (`logger.info(msg, { ... })`)

Reserved fields (`timestamp`, `level`, `message`, …) cannot be overridden.

---

## Backward compatibility

| Legacy | Migration |
|--------|-----------|
| Flat `bufferSize`, `sensitiveKeys`, … | Still work → `logging.*` |
| `runtimeInteractions.outbound/database/messaging/downloads` | **Removed** — use `attachExpress`, `attachFetch`, `attachPostgres`, etc. |
| `runtimeInteractions.inbound` | **Removed** — use `attachExpress` |
| `runtimeInteractions.storage` | **Removed** — use attach APIs |
| `operationalSystems` | **Ignored** — use platform Operational Systems UI |
| `startTrafficInstrumentation()`, `instrumentPg`, `instrumentMysql2`, `instrumentExpress` (package exports) | **Deprecated for app use** — prefer `logger.attach*` / `logger.instrument` |
| `runWithContext` / `setContext` / `getContext` | **Removed** — pass attributes per log call |
| `logging.propagateCorrelationId` | **Removed** — no ALS-based header propagation |

Nested config wins over legacy flat fields when both are set.

---

## Platform vs SDK

| SDK | Platform |
|-----|----------|
| Logs, masking | Policies, retention |
| Runtime interactions (your app’s HTTP/DB/messaging/files) | — |
| Resource metrics (system CPU/memory/network/disk) | — |
| Runtime lifecycle (process heap, event loop, crashes) | — |
| — | Operational Systems (DB/Redis/Kafka/… health, polling) |
| — | Alerts, signals, investigations |

---

## Validation

`validateLoggerConfig(normalizeLoggerConfig(input))` or constructor warnings with `debug: true`.
