const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  buildEnrichedAttributes,
  buildRuntimeMetadata,
  buildServiceMetadata,
  mergeLogMetadata,
} = require('../dist/enrichment/log-enrichment');
const { Logger } = require('../dist/logger');

describe('SDK enrichment', () => {
  it('mergeLogMetadata applies logger < per-log precedence', () => {
    const merged = mergeLogMetadata(
      { service: 'billing', env: 'prod' },
      { orderId: 'ord-789', userId: 'override-user', env: 'dev' },
    );
    assert.equal(merged.service, 'billing');
    assert.equal(merged.env, 'dev');
    assert.equal(merged.userId, 'override-user');
    assert.equal(merged.orderId, 'ord-789');
  });

  it('buildEnrichedAttributes merges in precedence order', () => {
    const result = buildEnrichedAttributes({
      loggerMetadata: { service: 'billing', env: 'prod' },
      perLogMetadata: { userId: 'u1', orderId: 'ord-1' },
      runtimeMetadata: buildRuntimeMetadata('host1', '1.0.0'),
    });
    assert.equal(result.service, 'billing');
    assert.equal(result.userId, 'u1');
    assert.equal(result.orderId, 'ord-1');
    assert.equal(result.hostname, 'host1');
  });

  it('logger merges createLogger and per-log metadata', () => {
    const logger = new Logger({ hardDisableNetwork: true, service: 'billing', env: 'prod' });
    logger.info('payment failed', {
      requestId: 'req-123',
      userId: 'user-456',
      orderId: 'ord-789',
    });
    const entry = logger.getBufferedEntries()[0];
    assert.equal(entry.message, 'payment failed');
    assert.equal(entry.attributes.service, 'billing');
    assert.equal(entry.attributes.env, 'prod');
    assert.equal(entry.attributes.requestId, 'req-123');
    assert.equal(entry.attributes.userId, 'user-456');
    assert.equal(entry.attributes.orderId, 'ord-789');
    assert.equal(entry.metadata?.service, 'billing');
    assert.equal(entry.metadata?.env, 'prod');
  });

  it('per-log metadata overrides logger metadata on key collision', () => {
    const logger = new Logger({ hardDisableNetwork: true, service: 'billing', env: 'prod' });
    logger.info('payment failed', { env: 'dev' });
    const entry = logger.getBufferedEntries()[0];
    assert.equal(entry.attributes.env, 'dev');
    assert.equal(entry.metadata?.env, 'dev');
  });

  it('reserved event fields cannot be spoofed via per-log metadata', () => {
    const logger = new Logger({ hardDisableNetwork: true, service: 'billing', env: 'prod' });
    logger.info('test', { level: 'error', timestamp: '2020-01-01', message: 'different message' });
    const entry = logger.getBufferedEntries()[0];
    assert.equal(entry.level, 'info');
    assert.equal(entry.message, 'test');
    assert.ok(typeof entry.timestamp === 'number');
    assert.equal(entry.attributes.level, undefined);
    assert.equal(entry.attributes.timestamp, undefined);
    assert.equal(entry.attributes.message, undefined);
  });

  it('reserved event fields cannot be spoofed via createLogger serviceMetadata', () => {
    const logger = new Logger({
      hardDisableNetwork: true,
      service: 'billing',
      env: 'prod',
      serviceMetadata: { level: 'error', message: 'x', timestamp: 1 },
    });
    logger.info('hello');
    const entry = logger.getBufferedEntries()[0];
    assert.equal(entry.level, 'info');
    assert.equal(entry.message, 'hello');
    assert.equal(entry.attributes.level, undefined);
    assert.equal(entry.attributes.message, undefined);
    assert.equal(entry.attributes.timestamp, undefined);
  });

  it('service, env, region remain overridable via per-log metadata', () => {
    const logger = new Logger({ hardDisableNetwork: true, service: 'billing', env: 'prod', region: 'us-east-1' });
    logger.info('test', { service: 'checkout', env: 'staging', region: 'eu-west-1' });
    const entry = logger.getBufferedEntries()[0];
    assert.equal(entry.attributes.service, 'checkout');
    assert.equal(entry.attributes.env, 'staging');
    assert.equal(entry.attributes.region, 'eu-west-1');
    assert.equal(entry.metadata?.service, 'checkout');
    assert.equal(entry.metadata?.env, 'staging');
    assert.equal(entry.metadata?.region, 'eu-west-1');
  });

  it('logger.info works with and without per-log metadata', () => {
    const logger = new Logger({ hardDisableNetwork: true, service: 'billing', env: 'prod' });
    logger.info('payment completed');
    logger.info('payment completed', { orderId: 'ord-123' });
    const entries = logger.getBufferedEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].message, 'payment completed');
    assert.equal(entries[0].attributes.service, 'billing');
    assert.equal(entries[1].attributes.orderId, 'ord-123');
  });

  it('buildServiceMetadata includes region when set', () => {
    const meta = buildServiceMetadata({ service: 's', env: 'prod', region: 'us-east-1' });
    assert.equal(meta.region, 'us-east-1');
  });
});
