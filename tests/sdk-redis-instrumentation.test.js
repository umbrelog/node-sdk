const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  getTraceContext,
  resetTraceContextStorageForTests,
  runWithTraceContextAsync,
  withRuntimeInteractionContext,
} = require('../dist/trace-context/context');
const { generateTraceId } = require('../dist/trace-context/ids');
const { instrumentRedis } = require('../dist/traffic/instrumentation/database-redis');

function mockRegistry() {
  const events = [];
  return {
    events,
    recordDatabase(obs) {
      events.push(obs);
    },
    recordHttp() {},
    recordMessaging() {},
    recordMessagingLifecycle() {},
    recordFile() {},
    recordFileTransfer() {},
    shutdown() {},
  };
}

describe('redis instrumentation', () => {
  beforeEach(() => resetTraceContextStorageForTests());

  it('wraps GET and records a redis runtime interaction', async () => {
    const registry = mockRegistry();
    const client = {
      get(key) {
        return Promise.resolve(`value:${key}`);
      },
    };
    instrumentRedis(client, registry, 'session-cache');

    const ctx = {
      traceId: generateTraceId(),
      rootService: 'api',
      startedAt: Date.now(),
    };
    await runWithTraceContextAsync(ctx, async () => {
      const value = await client.get('user:123');
      assert.equal(value, 'value:user:123');
    });

    assert.equal(registry.events.length, 1);
    assert.equal(registry.events[0].provider, 'redis');
    assert.equal(registry.events[0].fingerprint, 'GET user:?');
    assert.equal(registry.events[0].metadata.operation, 'GET');
    assert.equal(registry.events[0].metadata.runtimeInteractionType, 'redis');
    assert.equal(registry.events[0].metadata.runtimeInteractionVersion, 1);
    assert.equal(registry.events[0].metadata.runtimeInteractionSource, 'auto');
  });

  it('chains parent runtime interaction ids', async () => {
    resetTraceContextStorageForTests();
    const ctx = {
      traceId: generateTraceId(),
      rootService: 'api',
      startedAt: Date.now(),
    };
    let parentDuringChild = null;
    await runWithTraceContextAsync(ctx, async () => {
      withRuntimeInteractionContext('http', 'parent-ri', () => {
        withRuntimeInteractionContext('redis', 'child-ri', () => {
          parentDuringChild = getTraceContext()?.parentRuntimeInteractionId;
        });
      });
    });
    assert.equal(parentDuringChild, 'parent-ri');
  });
});
