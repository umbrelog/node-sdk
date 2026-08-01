# Contributing

Thanks for your interest in `@umbrelog/sdk`.

## Scope

This repository is the **Node.js SDK** published as [`@umbrelog/sdk`](https://www.npmjs.com/package/@umbrelog/sdk).

- Product docs and examples for getting started live in [umbrelog/quickstart](https://github.com/umbrelog/quickstart) and at [umbrelog.com/docs](https://umbrelog.com/docs).
- Customer-facing API is the **root** import (`createLogger`, `Logger`, …). Do not document or expand `@umbrelog/sdk/advanced` for app use.

## Development

```bash
npm ci
npm run build
npm test
npm run verify:pack
```

Requirements: Node.js 18+.

## Pull requests

1. Keep changes focused and backward compatible unless you are intentionally cutting a major version.
2. Add or update tests when behavior changes.
3. Update `CHANGELOG.md` for user-visible changes.
4. Ensure CI is green.

## Issues

Bug reports and feature requests: [GitHub Issues](https://github.com/umbrelog/node-sdk/issues).
