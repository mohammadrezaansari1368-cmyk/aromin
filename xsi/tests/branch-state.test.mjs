import test from 'node:test';
import assert from 'node:assert/strict';
import { initialBranchState, transition, selectBranchView } from '../src/branch-state.mjs';
import { syntheticCustomers } from '../src/synthetic-data.mjs';
const view = state => selectBranchView(syntheticCustomers, state);
test('draft and Enter-independent search stays unapplied until search action, then clear restores results', () => {
  const initial = initialBranchState();
  const draft = transition(initial, { type: 'draft', value: 'XSI_READONLY_NONMATCH_20261016' });
  assert.deepEqual(view(draft), view(initial));
  const searched = transition(draft, { type: 'search' });
  assert.equal(view(searched).filtered, 0);
  const reset = transition(transition(searched, { type: 'draft', value: '' }), { type: 'search' });
  assert.deepEqual(view(reset), view(initial));
  assert.equal(initial.query, '');
});
test('page two is disjoint, final page is bounded and empty results clamp page to one', () => {
  const initial = initialBranchState();
  const first = view(initial), second = view(transition(initial, { type: 'page', value: 2 }));
  assert.ok(second.rows.every(r => !first.rows.some(f => f.id === r.id)));
  const last = view(transition(initial, { type: 'page', value: 999 }));
  assert.equal(last.page, last.pages);
  assert.ok(last.rows.length > 0 && last.rows.length <= initial.pageSize);
});
for (const size of [10, 20, 50, 100]) test(`page size ${size} returns the requested synthetic slice and resets pagination`, () => {
  const paged = transition(initialBranchState(), { type: 'page', value: 2 });
  const resized = transition(paged, { type: 'size', value: size });
  assert.equal(resized.page, 1);
  assert.equal(view(resized).rows.length, size);
});
test('synthetic filter predicates compose and keep draft state separate', () => {
  let state = initialBranchState();
  for (const [id, value] of [['sms', 0], ['fixed', 0], ['trust', 2]]) state = transition(state, { type: 'filter', id, value });
  const result = view(state);
  assert.ok(result.filtered > 0);
  assert.ok(result.rows.every(r => r.smsBlocked && r.fixed && r.trust === 'blocked' && !r.deleted));
});
test('deleted/source filters select independent synthetic populations', () => {
  let state = transition(initialBranchState(), { type: 'filter', id: 'active', value: 1 });
  state = transition(state, { type: 'filter', id: 'source', value: 1 });
  assert.ok(view(state).rows.length > 0);
  assert.ok(view(state).rows.every(r => r.deleted && r.source === 'sms'));
});
test('unimplemented mutations and invalid state cannot run', () => {
  const state = initialBranchState();
  assert.throws(() => transition(state, { type: 'delete' }), /Unimplemented/);
  assert.throws(() => transition(state, { type: 'size', value: 999 }), /Unsupported/);
  assert.throws(() => transition(state, { type: 'filter', id: 'unknown', value: 0 }), /Invalid/);
  assert.throws(() => transition(state, { type: 'filter', id: 'active', value: 9 }), /Invalid/);
  assert.throws(() => transition(state, { type: 'page', value: 0 }), /Invalid/);
});
test('fixture reader rejects rows without the synthetic marker', () => {
  assert.throws(() => selectBranchView([{ id: 'untrusted' }], initialBranchState()), /Synthetic/);
  assert.ok(syntheticCustomers.every(r => r.synthetic && r.name.startsWith('مشتری مصنوعی') && r.mobile.startsWith('TEST-PHONE-')));
});
