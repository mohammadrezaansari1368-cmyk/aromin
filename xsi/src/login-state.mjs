// Behavior derived from REA observations E1 and E2, not a server auth contract.
export function loginView(mode = 'mobile') {
  if (!['mobile', 'username'].includes(mode)) throw new RangeError('Unknown login mode');
  return {
    mode,
    fields: mode === 'mobile'
      ? [{ name: 'mobile', inputMode: 'tel', autocomplete: 'tel', maxLength: 15 }]
      : [{ name: 'username', label: 'نام کاربری' }, { name: 'password', label: 'رمز عبور' }],
    rememberLabel: 'مرا به خاطر بسپار',
    submitLabel: mode === 'mobile' ? 'دریافت کد' : 'ورود',
  };
}
