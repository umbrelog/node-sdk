# @umbrelog/sdk — npm release checklist

Use this checklist before publishing from this repository. **Do not publish until every blocking item is checked.**

## Pre-flight

- [ ] npm account has access to the `@umbrelog` scope (org created on npmjs.com)
- [ ] `package.json` `repository.url` points to `https://github.com/umbrelog/node-sdk.git`
- [ ] `bugs.url` and `homepage` are correct
- [ ] Version follows semver
- [ ] CHANGELOG entry written for the release

## README & onboarding

- [ ] **README cloud quick start verified** — a new developer can follow `README.md` end-to-end without a local stack:
  - Sign-up link works: [app.umbrelog.com/login?signup=1](https://app.umbrelog.com/login?signup=1)
  - API key path matches UI: **Settings → API keys** ([app.umbrelog.com/settings](https://app.umbrelog.com/settings))
  - Quick-start examples use only `service` + `apiKey` (cloud URL baked into SDK) and `await logger.shutdown()`
  - Both **JavaScript** (`require`) and **TypeScript** (`import`) examples are present
  - Dashboard verification step points to [app.umbrelog.com/logs](https://app.umbrelog.com/logs) with `service` filter guidance

### `./advanced` export policy

**Keep `./advanced` in `package.json` exports; do not document it in README or public docs.**

| | |
|---|---|
| **Why ship it** | Private monorepo validation and unit tests import `@umbrelog/sdk/advanced`; compiled `dist/advanced.js` is included in the npm tarball |
| **Why not document** | Internal/validation surface — policy helpers, traffic internals, config validators — not semver-stable for customers |
| **Customer contract** | `@umbrelog/sdk` root import only (`createLogger`, `Logger`, types) |

- [ ] README and npm package page mention **only** the root import — no `@umbrelog/sdk/advanced`
- [ ] `src/advanced.ts` header comment still marks the surface as internal / breaking without notice

README smoke (recommended once per release):

```bash
npm install   # if needed
npm run build
export UMBRELOG_API_KEY=dl_your_key_here   # real cloud key — do not commit

node -e "
const { createLogger } = require('./dist/index.js');
(async () => {
  const logger = createLogger({
    service: 'readme-smoke',
    apiKey: process.env.UMBRELOG_API_KEY,
  });
  logger.info('README smoke test', { source: 'release-checklist' });
  await logger.shutdown();
  console.log('OK: log sent — check app.umbrelog.com/logs for service readme-smoke');
})().catch((e) => { console.error(e); process.exit(1); });
"
```

## Build & test

```bash
npm run build
npm test
npm run verify:pack   # npm pack + tar -tf + forbidden-path scan
```

- [ ] `npm test` passes (includes `sdk-trace-messaging.test.js` for Kafka trace roots)

### Tarball eyeball review (required before publish)

```bash
npm pack
tar -tf umbrelog-sdk-*.tgz | sort
```

Scroll through the list and confirm **none** of these appear:

| Must NOT be in tarball |
|------------------------|
| `.env`, `.env.*`, credentials, secrets |
| `*.db`, `*.sqlite`, `dev.db`, `test-data/` |
| `src/`, `tests/`, `scripts/`, `examples/` |
| `CONFIG.md`, `INTERACTIONS.md`, `HARDENING.md`, `RELEASE_CHECKLIST.md` |
| Screenshots (`*.png`, `*.jpg`, …) |
| `package-lock.json` (dev-only; not needed by consumers) |

Expected contents (**only**):

- `package/package.json`
- `package/README.md`
- `package/CHANGELOG.md`
- `package/LICENSE`
- `package/dist/**` — compiled `.js` + `.d.ts` (no `.map`, no `.ts` sources)

When satisfied, delete the local tarball (`rm umbrelog-sdk-*.tgz`) — do not commit it.

```bash
npm run verify:pack
```

## Consumer smoke test

```bash
npm run build
cd examples/consumer-smoke
npm install
npm run build
npm start
# Expect: OK: @umbrelog/sdk consumer smoke test passed
```

Optional — test from packed tarball:

```bash
npm pack
mkdir -p /tmp/umbrelog-sdk-smoke && cd /tmp/umbrelog-sdk-smoke
npm init -y
npm install /path/to/umbrelog-sdk-*.tgz
node -e "const { createLogger, getSdkVersion } = require('@umbrelog/sdk'); console.log(getSdkVersion());"
```

## Security

- [ ] No API keys, tokens, or internal URLs in published files
- [ ] `grep -r "dl_" dist/` returns only auth header logic, not real keys
- [ ] Public API reviewed (`src/index.ts`) — customer-facing surface is `@umbrelog/sdk` only

## Publish (when ready)

```bash
npm login
npm publish --access public
```

Scoped packages require `--access public` on first publish of a new name; subsequent publishes use the same scope access.

## Post-publish verification

```bash
mkdir /tmp/umbrelog-sdk-verify && cd /tmp/umbrelog-sdk-verify
npm init -y
npm install @umbrelog/sdk
node -e "const { createLogger, getSdkVersion } = require('@umbrelog/sdk'); console.log('version', getSdkVersion());"
```

- [ ] Package visible at https://www.npmjs.com/package/@umbrelog/sdk
- [ ] TypeScript consumer can `import { createLogger } from '@umbrelog/sdk'`

## Versioning guidance

| Change | Bump |
|--------|------|
| Breaking API or config behavior | MAJOR |
| New backward-compatible features | MINOR |
| Bug fixes, docs-only republish | PATCH |
