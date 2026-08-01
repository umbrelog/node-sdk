const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  buildInteractionMetadata,
  INTERACTION_ID_KEY,
} = require('../dist/interactions/context');
const { normalizeLoggerConfig } = require('../dist/config');

describe('SDK runtime interactions', () => {
  it('buildInteractionMetadata always includes interactionId', () => {
    const meta = buildInteractionMetadata();
    assert.ok(typeof meta[INTERACTION_ID_KEY] === 'string' && meta[INTERACTION_ID_KEY].length > 0);
  });

  it('buildInteractionMetadata merges explicit fields', () => {
    const meta = buildInteractionMetadata({
      correlationId: 'c-1',
      requestId: 'r-1',
      userId: 'u-1',
    });
    assert.equal(meta.correlationId, 'c-1');
    assert.equal(meta.requestId, 'r-1');
    assert.equal(meta.userId, 'u-1');
    assert.ok(meta[INTERACTION_ID_KEY]);
  });

  it('buildInteractionMetadata preserves explicit interactionId', () => {
    const meta = buildInteractionMetadata({ [INTERACTION_ID_KEY]: 'custom-id' });
    assert.equal(meta[INTERACTION_ID_KEY], 'custom-id');
  });

  it('normalizeLoggerConfig merges runtimeInteractions.traffic', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      runtimeInteractions: { traffic: { database: { slowQueryThresholdMs: 500 } } },
    });
    assert.equal(r.runtimeInteractions.traffic.database?.slowQueryThresholdMs, 500);
  });
});
