export function browserChecks(evidence) {
  const n = evidence.normalized_result;
  const steps = new Map((n?.steps || []).map(s => [s.step_id, s]));
  const ax = id => steps.get(id)?.artifacts.accessibility.value?.text || '';
  const rows = id => (ax(id).match(/button "سایر/g) || []).length;
  const checks = {};
  checks.allStepsCompleted = n?.steps.length === 28 && n.steps.every(s => s.status === 'completed');
  const expected = { 'open-branch': 20, size10: 10, page2: 10, 'search-draft': 10, 'enter-no-apply': 10, 'search-apply': 1,
    'no-match-apply': 0, 'clear-draft': 0, 'clear-apply': 10, 'fixed-yes': 10, 'trust-blocked': 4, 'source-sms': 0,
    'active-deleted': 2, 'sms-yes': 2, 'reset-active': 10, size50: 50, size100: 100, 'last-page': 5, 'first-page': 100, size20: 20 };
  for (const [id, count] of Object.entries(expected)) checks[`rowCount:${id}`] = rows(id) === count;
  checks.pageChanged = ax('size10') !== ax('page2');
  checks.enterDidNotApply = rows('enter-no-apply') === rows('search-draft');
  checks.exactSyntheticMatch = ax('search-apply').includes('TEST-PHONE-020');
  checks.menuOpened = /button "سایر" \[expanded\]/.test(ax('menu-open'));
  checks.menuEscaped = !/button "سایر" \[expanded\]/.test(ax('menu-escape'));
  checks.syntheticNotice = ax('size20').includes('تمام ردیف‌ها و اعداد این صفحه مصنوعی');
  checks.sevenHeaders = (ax('size20').match(/columnheader /g) || []).length === 7;
  checks.emptyState = ax('no-match-apply').includes('هیچ ردیفی در داده‌های مصنوعی مطابق نیست.');
  checks.exportDisabled = ax('size20').includes('button "خروجی اکسل" [disabled]');
  checks.deleteDisabled = ax('menu-open').includes('button "حذف مشتری" [disabled]');
  checks.noPageErrorsOrDownloads = !!n && !n.events.items.some(e => ['page-error', 'download'].includes(e.kind));
  checks.onlyLocalReads = !!n && n.events.items.filter(e => e.kind === 'request').every(e => e.method === 'GET' && e.url.origin === 'http://127.0.0.1:8081');
  checks.completeCapture = n?.completeness.status === 'complete' && n.events.dropped === 0;
  return checks;
}
