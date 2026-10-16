import test from 'node:test';
import assert from 'node:assert/strict';
import { branchColumns, branchFilters, getBranchPreview } from '../src/branch-model.mjs';
test('preview limits enabled controls to read-only synthetic interactions', () => {
  assert.deepEqual(getBranchPreview(), { status: 'CONFIRMED', dataSource: 'synthetic-only', filtersEnabled: true, actionsEnabled: false });
});
test('each observed filter state has exactly one valid selection', () => {
  assert.equal(branchFilters.length, 5);
  for (const filter of branchFilters) assert.ok(filter.selected >= 0 && filter.selected < filter.options.length);
  assert.equal(branchColumns.length, 7);
});
