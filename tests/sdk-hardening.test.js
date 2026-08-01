const assert = require('node:assert/strict');
const { describe, it, afterEach } = require('node:test');
const { Logger } = require('../dist/logger');
const { getTrafficRegistry } = require('../dist/traffic/registry');
const { resetTrafficRuntimeForTests } = require('../dist/traffic');
const { resetFetchInstrumentationForTests, isGlobalFetchInstrumentedForTests } = require('../dist/traffic/instrumentation/http-fetch');

const BASE = {
  service: 'hardening-test',
  env: 'test',
  apiKey: 'test-key',
  baseUrl: 'http://localhost:3000',
  logging: { enabled: false, flushOnShutdown: false },
};

afterEach(() => {
  resetTrafficRuntimeForTests();
  resetFetchInstrumentationForTests();
});

describe('SDK hardening', () => {
  it('attachPostgres starts traffic registry without config flags', () => {
    const logger = new Logger({
      ...BASE,
    });
    let called = false;
    const client = {
      query: (...args) => {
        called = true;
        return Promise.resolve({ rows: [] });
      },
    };
    logger.attachPostgres(client);
    assert.equal(called, false);
    assert.ok(getTrafficRegistry());
    logger.destroy();
  });

  it('attachExpress enables outbound fetch patching', () => {
    const logger = new Logger({
      ...BASE,
    });
    const app = { middleware: [], use(fn) { this.middleware.push(fn); } };
    logger.attachExpress(app);
    assert.ok(getTrafficRegistry());
    assert.equal(isGlobalFetchInstrumentedForTests(), true);
    logger.destroy();
  });

  it('destroy on superseded logger does not stop active traffic session', () => {
    const loggerA = new Logger({ ...BASE });
    const loggerB = new Logger({ ...BASE });
    loggerA.attachFetch();
    loggerB.attachFetch();
    assert.ok(getTrafficRegistry());
    loggerA.destroy();
    assert.ok(getTrafficRegistry(), 'active registry survives stale logger destroy');
    loggerB.destroy();
    assert.equal(getTrafficRegistry(), null);
  });
});
