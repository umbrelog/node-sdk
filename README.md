# @umbrelog/sdk

Official Node.js SDK for [Umbrelog](https://umbrelog.com), an AI-powered Log Management Platform — structured logging, runtime interactions, and service telemetry for production applications.

Send logs from your app, attach Express and database drivers for contextual traffic, and let Umbrelog correlate events with signals and investigations in the dashboard.

## Requirements

- Node.js **18+**

## Quick start (Umbrelog Cloud)

### 1. Create an account

Sign up at **[app.umbrelog.com/login?signup=1](https://app.umbrelog.com/login?signup=1)**.

### 2. Create an API key

In the dashboard, open **Settings** ([app.umbrelog.com/settings](https://app.umbrelog.com/settings)), scroll to **API keys**, and click **Create API key**.

- Keys start with the `dl_` prefix — copy the full value once; it is shown only at creation time.
- Store it as an environment variable (never commit it to git):

```bash
export UMBRELOG_API_KEY=dl_your_key_here
```

The SDK does not read `UMBRELOG_API_KEY` automatically — pass it as `apiKey` in `createLogger({ … })` (see below).

### 3. Install the SDK

```bash
npm install @umbrelog/sdk
```

### 4. Send your first log

The SDK connects to **Umbrelog Cloud** automatically — you only need `service` and `apiKey`. **Do not set `baseUrl`.** Cloud traffic uses the same nginx routes as the web app: `POST https://app.umbrelog.com/api/logs` for ingestion and `GET https://app.umbrelog.com/config/policies` for runtime policy.

Create `first-log.js` (or use TypeScript with the same shape):

**JavaScript**

```javascript
const { createLogger } = require('@umbrelog/sdk');

async function main() {
  const logger = createLogger({
    service: 'my-first-app',
    env: process.env.NODE_ENV ?? 'production',
    apiKey: process.env.UMBRELOG_API_KEY,
  });

  logger.info('Hello from Umbrelog', { source: 'quick-start' });

  // Flush buffered logs before the process exits (important for one-shot scripts)
  await logger.shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**TypeScript**

```typescript
import { createLogger } from '@umbrelog/sdk';

const logger = createLogger({
  service: 'my-first-app',
  env: process.env.NODE_ENV ?? 'production',
  apiKey: process.env.UMBRELOG_API_KEY,
});

logger.info('Hello from Umbrelog', { source: 'quick-start' });

await logger.shutdown();
```

Run it:

```bash
export UMBRELOG_API_KEY=dl_your_key_here
node first-log.js
```

When `apiKey` is set, logs are sent to Umbrelog Cloud. Without an API key, logs stay in a local buffer only (useful when iterating without a key).

### 5. Verify in the dashboard

1. Open **[app.umbrelog.com/logs](https://app.umbrelog.com/logs)**.
2. Look for `Hello from Umbrelog` — it usually appears within a few seconds.
3. Filter by **service** `my-first-app` if your workspace has other logs.

If nothing shows up, see [Troubleshooting](#troubleshooting) below.

## Express example

```typescript
import express from 'express';
import { createLogger } from '@umbrelog/sdk';

const app = express();
const logger = createLogger({
  service: 'orders-api',
  env: 'production',
  apiKey: process.env.UMBRELOG_API_KEY,
});

// Inbound HTTP + outbound fetch + execution context
logger.attachExpress(app);

app.get('/health', (_req, res) => {
  logger.info('Health check');
  res.json({ ok: true });
});

app.listen(3000);
```

For PostgreSQL or MySQL, attach your client after creation:

```typescript
logger.attachPostgres(pgClient, { databaseId: 'primary' });
logger.attachRedis(redisClient, { redisId: 'session-cache' });
// or
logger.instrument({ express: app, postgres: { client: pgClient, databaseId: 'primary' } });
```

Long-running servers flush on SIGTERM/SIGINT by default (`logging.flushOnShutdown`). For one-shot scripts or tests, call `await logger.shutdown()` explicitly.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `UMBRELOG_API_KEY` | Your organization API key (`dl_…`) — pass to `createLogger({ apiKey: process.env.UMBRELOG_API_KEY })` |
| `NODE_ENV` | Default `env` field when not set in config |
| `SERVICE_NAME` / `APP_NAME` | Fallback service name when `service` is omitted in config |
| `APP_VERSION` | Service version metadata on each log |

You can also pass `apiKey`, `service`, and `env` directly in `createLogger({ … })`.

## Configuration

Common options:

```typescript
createLogger({
  service: 'orders-api',
  apiKey: process.env.UMBRELOG_API_KEY,
  logging: {
    captureUnhandledExceptions: true,
    captureUnhandledRejections: true,
    flushOnShutdown: true,
    sensitiveKeys: ['nationalId', 'iban'], // merged with built-in secret key list
  },
  resourceMetrics: { enabled: true, interval: '60s' },
  lifecycle: { enabled: true, interval: '30s' },
});
```

## Execution context

When a trace root is active (inbound Express request, `runWithTraceRoot`, or messaging consumer helpers), logs automatically include execution context: `traceId`, `executionId`, `process`, `correlationId`, `runtimeInteractionType`, `executionStatus`, and more. These fields are indexed in the dashboard for search and process discovery.

```typescript
import { createLogger, getTraceContext } from '@umbrelog/sdk';

const logger = createLogger({ service: 'billing-worker', apiKey: process.env.UMBRELOG_API_KEY });

await logger.runWithTraceRoot({ entryType: 'cron', entryName: 'nightly-billing' }, async () => {
  const ctx = getTraceContext();
  logger.info('Starting nightly billing', { traceId: ctx?.traceId });
});

// Kafka / RabbitMQ / Pub/Sub consumers
await logger.runWithKafkaMessage('orders.created', message.headers, async () => {
  logger.info('Processing order event');
});
```

Express `attachExpress()` creates a trace root per inbound request — no extra setup required.

## Public API

| Export | Description |
|--------|-------------|
| `createLogger(config?)` | Create a logger instance |
| `Logger` | Logger class — `info`, `warn`, `error`, `debug`, `fatal`, `shutdown`, … |
| `Logger.attachExpress`, `attachFetch`, `attachPostgres`, `attachMysql2`, `attachRedis`, `instrument` | Runtime instrumentation (Express, fetch, DB, Redis) |
| `Logger.runWithTraceRoot`, `runWithKafkaMessage`, `runWithRabbitMessage`, `runWithPubSubMessage` | Trace roots for cron, workers, and messaging |
| `getTraceContext()` | Active execution context (AsyncLocalStorage) |
| `getSdkVersion()` | Installed SDK version string |
| `TraceRootInput`, `TraceEntryType`, `LogEntry`, `LoggerConfig`, `LogLevel`, `RuntimeConfig` | TypeScript types |

Everything you need for a typical integration is available from `@umbrelog/sdk` — no subpath imports required.

## Troubleshooting

### Logs not appearing in the dashboard

- Confirm `UMBRELOG_API_KEY` is exported and passed to `createLogger`, and that the key starts with `dl_`.
- Ensure `service` is set — every log must belong to a service name.
- For one-shot scripts, call `await logger.shutdown()` so logs flush before the process exits.
- Check network access to Umbrelog Cloud from your environment.

### Service name warnings

If you see `No service name provided. Falling back to automatic detection.`, set `service` explicitly in config or via `SERVICE_NAME`.

### TypeScript errors

Ensure `"moduleResolution": "node"` (or `"node16"` / `"bundler"`) and that `@types/node` is installed in your project.

### Graceful shutdown

Call `await logger.shutdown()` on SIGTERM/SIGINT so buffered logs flush before exit (also enabled by default via `logging.flushOnShutdown` on long-running processes).

### Execution context missing on logs

- `logging.tracePropagation.enabled` defaults to **`true`** — missing fields usually mean no active trace root.
- HTTP apps: call `logger.attachExpress(app)` before handling traffic.
- Cron/scripts: wrap work in `logger.runWithTraceRoot({ entryType: 'cron', entryName: '…' }, fn)`.
- `createLogger()` + `logger.info()` alone does not populate Execution Context.

Full field glossary, attach/wrap patterns, and FAQ: **[EXECUTION_CONTEXT.md](./EXECUTION_CONTEXT.md)**.

## Documentation

- Website: [umbrelog.com](https://umbrelog.com)
- Dashboard: [app.umbrelog.com](https://app.umbrelog.com)
- Execution context: [EXECUTION_CONTEXT.md](./EXECUTION_CONTEXT.md)

## License

ISC — see [LICENSE](./LICENSE).
