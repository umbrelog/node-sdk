const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  normalizeLoggerConfig,
  validateLoggerConfig,
  parseDurationMs,
  DEFAULT_RESOURCE_METRICS,
  initialTrafficCategoryState,
} = require('../dist/config');

describe('SDK config normalization', () => {
  it('applies logging defaults', () => {
    const r = normalizeLoggerConfig({ service: 'api', env: 'prod' });
    assert.equal(r.logging.captureUnhandledExceptions, true);
    assert.equal(r.logging.runtimeMetadata, true);
    assert.equal(r.logging.captureFunctionName, false);
    assert.equal(r.logging.flushOnShutdown, true);
  });

  it('merges nested logging over legacy flat fields', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      bufferSize: 500,
      logging: { bufferSize: 2000 },
    });
    assert.equal(r.logging.bufferSize, 2000);
  });

  it('runtime interactions default to empty traffic thresholds', () => {
    const r = normalizeLoggerConfig({ service: 'api' });
    assert.deepEqual(r.runtimeInteractions.traffic, {});
    assert.deepEqual(initialTrafficCategoryState(), {
      http: false,
      database: false,
      messaging: false,
      files: false,
    });
  });

  it('merges runtimeInteractions.traffic thresholds', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      runtimeInteractions: {
        traffic: {
          http: { slowRequestThresholdMs: 3000 },
          database: { slowQueryThresholdMs: 500 },
        },
      },
    });
    assert.equal(r.runtimeInteractions.traffic.http?.slowRequestThresholdMs, 3000);
    assert.equal(r.runtimeInteractions.traffic.database?.slowQueryThresholdMs, 500);
  });

  it('legacy flat traffic maps to runtimeInteractions.traffic', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      traffic: { http: { captureRetries: true } },
    });
    assert.equal(r.runtimeInteractions.traffic.http?.captureRetries, true);
  });

  it('resource metrics enabled by default', () => {
    const r = normalizeLoggerConfig({ service: 'api' });
    assert.equal(r.resourceMetrics.enabled, true);
    assert.equal(r.resourceMetrics.intervalMs, DEFAULT_RESOURCE_METRICS.intervalMs);
  });

  it('DEFAULT_RESOURCE_METRICS.enabled is true (source of truth)', () => {
    assert.equal(DEFAULT_RESOURCE_METRICS.enabled, true);
  });

  it('resourceMetrics can be disabled explicitly', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      resourceMetrics: { enabled: false },
    });
    assert.equal(r.resourceMetrics.enabled, false);
  });

  it('parses resource metrics interval with 30s minimum', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      resourceMetrics: { enabled: true, interval: '10s' },
    });
    assert.equal(r.resourceMetrics.intervalMs, 30_000);
  });

  it('resolved config has no operationalSystems', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      operationalSystems: { postgres: true },
    });
    assert.equal(r.operationalSystems, undefined);
  });

  it('parseDurationMs handles ms, s, m', () => {
    assert.equal(parseDurationMs('60s', 0), 60_000);
    assert.equal(parseDurationMs('5m', 0), 300_000);
    assert.equal(parseDurationMs(5000, 0), 5000);
  });

  it('validate warns when resource metrics enabled without apiKey', () => {
    const r = normalizeLoggerConfig({
      service: 'api',
      resourceMetrics: { enabled: true },
    });
    const issues = validateLoggerConfig(r);
    assert.ok(issues.some((i) => i.path === 'resourceMetrics.enabled'));
  });
});
