import test from 'node:test';
import assert from 'node:assert/strict';
import { loginView } from '../src/login-state.mjs';

test('E1 default login offers phone entry and code request', () => {
  const view = loginView();
  assert.equal(view.mode, 'mobile');
  assert.equal(view.fields[0].inputMode, 'tel');
  assert.equal(view.fields[0].maxLength, 15);
  assert.equal(view.submitLabel, 'دریافت کد');
});
test('E2 username tab exposes username/password and login', () => {
  assert.deepEqual(loginView('username').fields.map(f => f.label), ['نام کاربری', 'رمز عبور']);
  assert.equal(loginView('username').submitLabel, 'ورود');
  assert.equal(loginView('mobile').submitLabel, 'دریافت کد');
});
