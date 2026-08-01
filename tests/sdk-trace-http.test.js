const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatHttpEntryName,
  isHealthProbeRequest,
  httpTraceRootStatus,
} = require('../dist/trace-context/http');

describe('trace-context http', () => {
  it('formatHttpEntryName normalizes dynamic path segments', () => {
    assert.equal(
      formatHttpEntryName('POST', '/api/customers/123'),
      'POST /api/customers/:id',
    );
    assert.equal(
      formatHttpEntryName('post', '/api/customers/456/orders/99'),
      'POST /api/customers/:id/orders/:id',
    );
  });

  it('isHealthProbeRequest matches standard probe paths', () => {
    assert.equal(isHealthProbeRequest({ method: 'GET', rawPath: '/health' }), true);
    assert.equal(isHealthProbeRequest({ method: 'GET', rawPath: '/readyz' }), true);
    assert.equal(isHealthProbeRequest({ method: 'GET', rawPath: '/live' }), true);
    assert.equal(isHealthProbeRequest({ method: 'GET', rawPath: '/api/customers/1' }), false);
  });

  it('isHealthProbeRequest matches k8s and load balancer user agents', () => {
    assert.equal(
      isHealthProbeRequest({
        method: 'GET',
        rawPath: '/',
        headers: { 'user-agent': 'kube-probe/1.29' },
      }),
      true,
    );
    assert.equal(
      isHealthProbeRequest({
        method: 'GET',
        rawPath: '/',
        headers: { 'user-agent': 'ELB-HealthChecker/2.0' },
      }),
      true,
    );
  });

  it('httpTraceRootStatus maps status codes', () => {
    assert.equal(httpTraceRootStatus(200), 'ok');
    assert.equal(httpTraceRootStatus(404), 'ok');
    assert.equal(httpTraceRootStatus(500), 'failed');
  });
});
