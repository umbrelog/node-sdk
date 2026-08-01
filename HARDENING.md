# SDK hardening — production checklist

## Attach-first model

**Mental model:** `active = attach (or runWith* helper) ∧ apiKey ∧ traffic runtime started`

There are no category flags. Call `attachExpress`, `attachPostgres`, etc. when you want collection. `attachExpress` also patches outbound `fetch`. Use `attachFetch()` for outbound-only services.

---

## Production readiness checklist

### Reliability

| Item | Status | Notes |
|------|--------|-------|
| Traffic registry uses active session on fetch | Fixed | Fetch reads `getTrafficRegistry()` at call time |
| Stale logger `destroy()` kills active traffic | Fixed | Session id guard on shutdown |
| Outbound fetch enabled via attach | OK | `attachExpress` and `attachFetch` call `ensureTrafficCategories({ outbound: true })` |
| Process error hooks removed on destroy | OK | Per-logger teardown |
| Shutdown SIGTERM hooks removed on destroy | OK | Per-logger teardown |

### Performance

| Item | Status | Notes |
|------|--------|-------|
| Fetch patched once globally | OK | No per-request patch cost |
| Interaction metadata built at observation time | OK | Lightweight id generation |
| Traffic rollup batching | OK | 30s windows |
| Resource metrics interval clamped 30s–15m | OK | |

### Memory safety

| Item | Status | Notes |
|------|--------|-------|
| Traffic registry interval cleared on shutdown | OK | |
| Metrics collector timer cleared on destroy | OK | |
| Config poll timer cleared on destroy | OK | |
| DB/Express instrumentation not unpatchable | Known | Permanent client wrappers after attach; avoid re-attach cycles on same instance |
| Fetch never unpatched after first patch | Known | Acceptable — patch is inert when no registry |

### Shutdown behavior

| Item | Status | Notes |
|------|--------|-------|
| `destroy()` stops metrics | OK | |
| `destroy()` stops traffic session (if current) | OK | Session guard |
| `destroy()` does not flush log transport | Gap | Call `transport.flush()` explicitly if needed before exit |
| Global fetch remains after destroy | Known | By design |

### Runtime interactions

| Item | Status | Notes |
|------|--------|-------|
| `interactionId` on every persisted event | OK | |
| Inbound HTTP reads correlation headers internally | OK | Not exposed via public context APIs |
| Per-log attributes for log enrichment | OK | Primary enrichment mechanism |

### Instrumentation consistency

| Item | Status | Notes |
|------|--------|-------|
| Canonical `InteractionObservation` schema | OK | |
| Provider catalog for future attach APIs | OK | |
| Manual lifecycle helpers use registry gates | OK | Registry must be active (via attach) |

### Tracing readiness

| Item | Status | Notes |
|------|--------|-------|
| `interactionId` per observation | OK | In metadata today |
| Stable `InteractionKind` taxonomy | OK | |
| Context bag separate from attributes | OK | Optional on manual `recordInteraction` |

### Before external adoption — recommended

1. **One logger per process** for runtime interactions (document, don't enforce).
2. **Attach explicitly** after your app and clients are created.
3. **Call `destroy()` on graceful shutdown** in long-lived workers.
4. **Pass attributes on each log call** — no implicit request context.

---

## Public API deprecation roadmap (proposed — no removals yet)

| API | Issue | Proposed action |
|-----|-------|-----------------|
| `startTrafficInstrumentation` (public export) | Low-level; conflicts with Logger lifecycle | Deprecate v2; internal-only v3 |
| `instrumentExpress` / `instrumentPg` / `instrumentMysql2` (public) | Bypass Logger lifecycle | Deprecate v2; Logger.attach* only v3 |
| `HttpObservation` etc. (traffic types) | Duplicates `InteractionObservation` | Deprecate v2; interaction types v3 |
| `operationalSystems` on LoggerConfig | Ignored | Remove from types v3 |
| `clientId` on LoggerConfig | Alias for `service` | Deprecate v2 |
| Flat legacy LoggerConfig fields | Nested config preferred | Deprecate v2 |
| `formatObjectLiteral` on Logger export | Internal utility | Move to internal v3 |
| `recordInteraction` (public) | Advanced/low-level | Document as advanced; optional internal v3 |

**Keep as primary surface:** `createLogger`, `Logger.attach*`, `Logger.instrument`, interaction types, `CONFIG.md` / `INTERACTIONS.md`.

**Removed (v2):** `runWithContext`, `setContext`, `getContext`, `getCorrelationId`, `CORRELATION_ID_KEY`, `expressCorrelationMiddleware`, `logging.propagateCorrelationId`, `runtimeInteractions.outbound/database/messaging/downloads/inbound`.
