const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  getTraceContext,
  resetTraceContextStorageForTests,
  runWithTraceContext,
  runWithTraceContextAsync,
  withRuntimeInteractionContext,
  withRuntimeInteractionContextAsync,
  bindTraceContext,
  runWithRuntimeInteraction,
  patchTraceContext,
} = require('../dist/trace-context/context');
const { generateTraceId } = require('../dist/trace-context/ids');
const { runWithTraceRoot } = require('../dist/trace-context/root');
const { resetTraceSamplingForTests, shouldPersistInteraction } = require('../dist/trace-context/sampling');
const { applyExecutionContextToAttributes } = require('../dist/trace-context/execution-context');
const { runWithMessagingPublish } = require('../dist/trace-context/messaging');
const {
  injectTraceHeaders,
  readExecutionContextSchemaVersionFromHeaders,
} = require('../dist/trace-context/headers');
const { EXECUTION_CONTEXT_SCHEMA_VERSION } = require('../dist/trace-context/schema');

function baseCtx(overrides = {}) {
  return {
    traceId: generateTraceId(),
    process: 'Checkout Session',
    rootService: 'billing-worker',
    startedAt: Date.now(),
    entryType: 'cron',
    entryName: 'Checkout Session',
    executionStatus: 'running',
    ...overrides,
  };
}

describe('execution context on logs', () => {
  it('merges execution context fields into log attributes', () => {
    const attrs = {};
    applyExecutionContextToAttributes(attrs, {
      traceId: 'trace-abc',
      executionId: 'trace-abc',
      process: 'Checkout Session',
      correlationId: 'corr-1',
      runtimeInteractionId: 'ri-123',
      runtimeInteractionType: 'http',
      executionStatus: 'running',
      rootService: 'orders-api',
      startedAt: Date.now(),
    });
    assert.equal(attrs.traceId, 'trace-abc');
    assert.equal(attrs.executionId, 'trace-abc');
    assert.equal(attrs.process, 'Checkout Session');
    assert.equal(attrs.correlationId, 'corr-1');
    assert.equal(attrs.runtimeInteractionId, 'ri-123');
    assert.equal(attrs.runtimeInteractionType, 'http');
    assert.equal(attrs.executionStatus, 'running');
    assert.equal(attrs.executionOutcome, 'running');
  });

  it('propagates runtime interaction id and type through ALS', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    await runWithTraceContextAsync(ctx, async () => {
      await withRuntimeInteractionContextAsync('http', 'ri-123', async () => {
        const active = getTraceContext();
        assert.equal(active?.runtimeInteractionId, 'ri-123');
        assert.equal(active?.runtimeInteractionType, 'http');
        assert.equal(active?.runtimeInteractionVersion, 1);
        assert.equal(active?.runtimeInteractionSource, 'auto');
        assert.equal(active?.process, 'Checkout Session');
        assert.equal(active?.executionId, ctx.traceId);
      });
    });
  });

  it('each runtime interaction scope gets a distinct id', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    const seen = new Set();
    await runWithTraceContextAsync(ctx, async () => {
      for (let i = 0; i < 3; i++) {
        runWithRuntimeInteraction('http', () => {
          seen.add(getTraceContext()?.runtimeInteractionId);
        });
      }
    });
    assert.equal(seen.size, 3);
  });

  it('merges runtime interaction version and source into log attributes', () => {
    const attrs = {};
    applyExecutionContextToAttributes(attrs, {
      traceId: 'trace-abc',
      rootService: 'api',
      startedAt: Date.now(),
      runtimeInteractionId: 'ri-1',
      runtimeInteractionType: 'http',
      runtimeInteractionVersion: 1,
      runtimeInteractionSource: 'auto',
    });
    assert.equal(attrs.runtimeInteractionVersion, 1);
    assert.equal(attrs.runtimeInteractionSource, 'auto');
  });

  it('runWithRuntimeInteraction marks source as manual', () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    runWithTraceContext(ctx, () => {
      runWithRuntimeInteraction('http', () => {
        assert.equal(getTraceContext()?.runtimeInteractionSource, 'manual');
        assert.equal(getTraceContext()?.runtimeInteractionVersion, 1);
      });
    });
  });
});

describe('execution context schema version header', () => {
  it('injects x-umbrelog-schema-version on trace headers', () => {
    const headers = new Headers();
    injectTraceHeaders(headers, { traceId: 'abc1234567890123456789012345678' });
    assert.equal(headers.get('x-umbrelog-schema-version'), String(EXECUTION_CONTEXT_SCHEMA_VERSION));
    assert.equal(
      readExecutionContextSchemaVersionFromHeaders({
        'x-umbrelog-schema-version': '1',
      }),
      1,
    );
  });
});

describe('ALS propagation edge cases', () => {
  it('propagates through setTimeout', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    await runWithTraceContextAsync(ctx, async () => {
      await new Promise((resolve) => {
        setTimeout(() => {
          assert.equal(getTraceContext()?.traceId, ctx.traceId);
          resolve();
        }, 5);
      });
    });
  });

  it('propagates through Promise.all', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    await runWithTraceContextAsync(ctx, async () => {
      const results = await Promise.all([
        Promise.resolve(getTraceContext()?.traceId),
        Promise.resolve(getTraceContext()?.traceId),
      ]);
      assert.deepEqual(results, [ctx.traceId, ctx.traceId]);
    });
  });

  it('propagates through Promise.race', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    await runWithTraceContextAsync(ctx, async () => {
      const winner = await Promise.race([
        new Promise((resolve) => setTimeout(() => resolve(getTraceContext()?.traceId), 10)),
        Promise.resolve(getTraceContext()?.traceId),
      ]);
      assert.equal(winner, ctx.traceId);
    });
  });

  it('does not propagate to EventEmitter listeners after ALS scope ends', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    const emitter = new EventEmitter();
    const pending = new Promise((resolve) => {
      emitter.once('tick', () => {
        assert.equal(getTraceContext(), undefined);
        resolve();
      });
    });
    await runWithTraceContextAsync(ctx, async () => {
      /* enter and leave ALS scope */
    });
    emitter.emit('tick');
    await pending;
  });

  it('propagates through EventEmitter when listener is bound', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    const emitter = new EventEmitter();
    await runWithTraceContextAsync(ctx, async () => {
      await new Promise((resolve) => {
        emitter.once(
          'tick',
          bindTraceContext(() => {
            assert.equal(getTraceContext()?.traceId, ctx.traceId);
            resolve();
          }),
        );
        emitter.emit('tick');
      });
    });
  });
});

describe('execution status', () => {
  it('defaults to running and patches to failed on trace root error', async () => {
    resetTraceContextStorageForTests();
    let statusDuring = null;
    try {
      await runWithTraceRoot(
        { entryType: 'cron', entryName: 'failing_job' },
        'cron-worker',
        async () => {
          statusDuring = getTraceContext()?.executionStatus;
          throw new Error('boom');
        },
      );
    } catch {
      /* expected */
    }
    assert.equal(statusDuring, 'running');
  });

  it('patchTraceContext updates active ALS store', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    await runWithTraceContextAsync(ctx, async () => {
      patchTraceContext({ executionStatus: 'failed' });
      assert.equal(getTraceContext()?.executionStatus, 'failed');
    });
  });
});

describe('trace-context', () => {
  it('propagates trace context across async boundaries', async () => {
    const ctx = {
      traceId: generateTraceId(),
      rootService: 'cron-worker',
      startedAt: Date.now(),
      entryType: 'cron',
      entryName: 'nightly_sync',
    };
    await runWithTraceContextAsync(ctx, async () => {
      await Promise.resolve();
      const active = getTraceContext();
      assert.equal(active?.traceId, ctx.traceId);
      assert.equal(active?.entryName, 'nightly_sync');
    });
    assert.equal(getTraceContext(), undefined);
  });

  it('runWithTraceRoot completes with failed status on error', async () => {
    let caught = false;
    try {
      await runWithTraceRoot(
        { entryType: 'cron', entryName: 'failing_job' },
        'cron-worker',
        async () => {
          throw new Error('boom');
        },
      );
    } catch {
      caught = true;
    }
    assert.equal(caught, true);
  });

  it('messaging publish creates kafka runtime interaction scope', async () => {
    resetTraceContextStorageForTests();
    const ctx = baseCtx();
    await runWithTraceContextAsync(ctx, async () => {
      await runWithMessagingPublish({
        provider: 'kafka',
        topicOrQueue: 'orders.created',
        fn: async () => {
          assert.equal(getTraceContext()?.runtimeInteractionType, 'kafka');
          assert.ok(getTraceContext()?.runtimeInteractionId);
        },
      });
    });
  });

  it('always persists trace_root interactions', () => {
    resetTraceSamplingForTests();
    const persist = shouldPersistInteraction(
      {
        interaction_kind: 'trace_root',
        interaction_id: 'i1',
        trace_id: 'abc',
        service: 's',
        env: 'prod',
        provider: 'cron',
        fingerprint: 'job',
        root_service: 's',
        started_at: Date.now(),
        duration_ms: 0,
      },
      {
        hotTrace: false,
        config: {
          enabled: true,
          baseHealthySampleRate: 0.01,
          targetInteractionsPerMinute: 200,
          minSampleRate: 0.01,
          maxSampleRate: 0.1,
        },
      },
    );
    assert.equal(persist, true);
  });

  it('resetTraceContextStorageForTests does not throw', () => {
    resetTraceContextStorageForTests();
    assert.equal(getTraceContext(), undefined);
  });
});
