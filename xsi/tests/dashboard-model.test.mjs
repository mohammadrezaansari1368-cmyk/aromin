import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePanel, products } from '../src/dashboard-model.mjs';
test('unobserved routes stay unknown instead of implying successful navigation', () => {
  assert.equal(resolvePanel('club').status, 'UNKNOWN');
  assert.equal(resolvePanel('not-observed'), null);
});
test('view consumers cannot mutate the confirmed quick-link inventory', () => {
  resolvePanel('club').actions.length = 0;
  assert.equal(products[0].actions.length, 3);
});
