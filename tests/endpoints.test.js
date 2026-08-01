const assert = require('node:assert/strict');
const { describe, it, afterEach } = require('node:test');
const {
  UMBRELOG_CLOUD_BASE_URL,
  UMBRELOG_CLOUD_CONFIG_URL,
  UMBRELOG_CLOUD_INGESTION_URL,
  resolveUmbrelogBaseUrl,
  resolveUmbrelogEndpoints,
  resolveIngestionBaseUrl,
} = require('../dist/config/endpoints');

describe('Umbrelog endpoint resolution', () => {
  const originalBaseUrl = process.env.UMBRELOG_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.UMBRELOG_BASE_URL;
    else process.env.UMBRELOG_BASE_URL = originalBaseUrl;
  });

  it('defaults to cloud /api and /config when baseUrl is omitted', () => {
    delete process.env.UMBRELOG_BASE_URL;
    assert.equal(resolveUmbrelogBaseUrl(), UMBRELOG_CLOUD_BASE_URL);
    assert.equal(resolveIngestionBaseUrl(), UMBRELOG_CLOUD_INGESTION_URL);
    const endpoints = resolveUmbrelogEndpoints();
    assert.equal(endpoints.ingestionUrl, UMBRELOG_CLOUD_INGESTION_URL);
    assert.equal(endpoints.configOrigin, UMBRELOG_CLOUD_CONFIG_URL);
  });

  it('resolves cloud log and policy fetch URLs', () => {
    delete process.env.UMBRELOG_BASE_URL;
    const endpoints = resolveUmbrelogEndpoints();
    assert.equal(`${endpoints.ingestionUrl}/logs`, `${UMBRELOG_CLOUD_BASE_URL}/api/logs`);
    assert.equal(
      `${endpoints.configOrigin}/policies?service=demo&env=prod`,
      `${UMBRELOG_CLOUD_BASE_URL}/config/policies?service=demo&env=prod`,
    );
    assert.equal(
      `${endpoints.ingestionUrl}/metrics/ingest`,
      `${UMBRELOG_CLOUD_BASE_URL}/api/metrics/ingest`,
    );
    assert.equal(
      `${endpoints.ingestionUrl}/traffic/ingest`,
      `${UMBRELOG_CLOUD_BASE_URL}/api/traffic/ingest`,
    );
    assert.equal(
      `${endpoints.ingestionUrl}/runtime/lifecycle/ingest`,
      `${UMBRELOG_CLOUD_BASE_URL}/api/runtime/lifecycle/ingest`,
    );
  });

  it('uses UMBRELOG_BASE_URL env when config baseUrl is omitted (localhost ports)', () => {
    process.env.UMBRELOG_BASE_URL = 'http://localhost:3000';
    assert.equal(resolveUmbrelogBaseUrl(), 'http://localhost:3000');
    const endpoints = resolveUmbrelogEndpoints();
    assert.equal(endpoints.ingestionUrl, 'http://localhost:3000');
    assert.equal(endpoints.configOrigin, 'http://localhost:3100');
  });

  it('prefers explicit baseUrl over env', () => {
    process.env.UMBRELOG_BASE_URL = 'http://localhost:3000';
    assert.equal(resolveUmbrelogBaseUrl('https://staging.example.com'), 'https://staging.example.com');
    const endpoints = resolveUmbrelogEndpoints('https://staging.example.com');
    assert.equal(endpoints.ingestionUrl, 'https://staging.example.com/api');
    assert.equal(endpoints.configOrigin, 'https://staging.example.com/config');
  });

  it('splits localhost into ingestion and config ports', () => {
    const endpoints = resolveUmbrelogEndpoints('http://localhost');
    assert.equal(endpoints.ingestionUrl, 'http://localhost:3000');
    assert.equal(endpoints.configOrigin, 'http://localhost:3100');
  });
});
