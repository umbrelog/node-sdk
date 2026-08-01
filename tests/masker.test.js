const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { Masker } = require('../dist/masking/masker');

describe('SDK Masker', () => {
  it('masks sensitive attribute keys including camelCase', () => {
    const m = new Masker();
    const out = m.maskObject({
      password: 'x',
      accessToken: 'y',
      userId: '1',
    });
    assert.equal(out.password, '***');
    assert.equal(out.accessToken, '***');
    assert.equal(out.userId, '1');
  });

  it('applies built-in message patterns without lastIndex flip-flop', () => {
    const m = new Masker();
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepartxx';
    const a = m.maskString(`Bearer ${jwt}`);
    const b = m.maskString(`Bearer ${jwt}`);
    assert.equal(a.includes(jwt), false);
    assert.equal(b.includes(jwt), false);
    assert.equal(a, b);
  });

  it('does not mask when disabled', () => {
    const m = new Masker();
    m.disable();
    assert.equal(m.maskString('password=secret'), 'password=secret');
  });
});
