const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  fallbackHttpProcessName,
  resolveHttpProcessName,
  resolveHttpProcessNameFromEntry,
  resolveHttpProcessNameWithFallback,
} = require('../dist/trace-context/process-name-resolver');

describe('process-name-resolver', () => {
  it('resolves CRUD collection and member routes', () => {
    assert.equal(resolveHttpProcessName('POST', '/campaigns'), 'Create Campaign');
    assert.equal(resolveHttpProcessName('GET', '/campaigns'), 'List Campaigns');
    assert.equal(resolveHttpProcessName('GET', '/campaigns/:id'), 'View Campaign');
    assert.equal(resolveHttpProcessName('PUT', '/campaigns/:id'), 'Update Campaign');
    assert.equal(resolveHttpProcessName('PATCH', '/campaigns/:id'), 'Update Campaign');
    assert.equal(resolveHttpProcessName('DELETE', '/campaigns/:id'), 'Delete Campaign');
  });

  it('resolves action routes after resource id', () => {
    assert.equal(resolveHttpProcessName('POST', '/campaigns/:id/dispatch'), 'Dispatch Campaign');
    assert.equal(resolveHttpProcessName('POST', '/payments/:id/refund'), 'Refund Payment');
    assert.equal(resolveHttpProcessName('POST', '/users/:id/reset-password'), 'Reset User Password');
    assert.equal(resolveHttpProcessName('POST', '/orders/:id/cancel'), 'Cancel Order');
    assert.equal(resolveHttpProcessName('GET', '/orders/:id/invoice'), 'View Order Invoice');
  });

  it('skips api version prefixes', () => {
    assert.equal(resolveHttpProcessName('POST', '/api/v1/campaigns'), 'Create Campaign');
    assert.equal(resolveHttpProcessName('GET', '/api/users/:id'), 'View User');
  });

  it('normalizes dynamic ids before resolving', () => {
    assert.equal(resolveHttpProcessName('GET', '/campaigns/123'), 'View Campaign');
    assert.equal(resolveHttpProcessName('POST', '/orders/99/cancel'), 'Cancel Order');
  });

  it('resolveHttpProcessNameFromEntry parses method and path', () => {
    assert.equal(resolveHttpProcessNameFromEntry('POST /campaigns'), 'Create Campaign');
    assert.equal(resolveHttpProcessNameFromEntry('GET /orders/:id/invoice'), 'View Order Invoice');
  });

  it('falls back to last segment humanized label', () => {
    assert.equal(fallbackHttpProcessName('GET', '/api/auth/reset-password'), 'Reset Password');
    assert.equal(resolveHttpProcessNameWithFallback('OPTIONS', '/api/auth/reset-password'), 'Reset Password');
  });
});
