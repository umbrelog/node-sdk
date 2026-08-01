import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEndpoint, normalizeSqlQuery } from '../src/traffic/normalize';

test('normalizeEndpoint replaces ids', () => {
  assert.equal(normalizeEndpoint('/orders/983728/items/42'), '/orders/:id/items/:id');
  assert.equal(
    normalizeEndpoint('https://api.example.com/users/550e8400-e29b-41d4-a716-446655440000'),
    '/users/:id',
  );
});

test('normalizeSqlQuery replaces literals', () => {
  const q = normalizeSqlQuery("SELECT * FROM users WHERE id = 123 AND name = 'alice'");
  assert.match(q, /WHERE id = \?/);
  assert.match(q, /name = \?/);
});
