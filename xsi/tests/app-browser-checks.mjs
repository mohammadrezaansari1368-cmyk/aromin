export function appBrowserChecks(n) {
  const steps=new Map(n.steps.map(s=>[s.step_id,s]));
  const ax=id=>steps.get(id)?.artifacts.accessibility.value?.text||'';
  const rows=id=>(ax(id).match(/button "سایر/g)||[]).length;
  const loaded=id=>steps.has(id+'-loaded')?id+'-loaded':id;
  const checks={allStepsCompleted:n.steps.every(s=>s.status==='completed'),persistedAfterProcessRestart:ax('persisted-live').includes('مشتری مصنوعی مرورگر'),demoExplicit:ax('demo-ready').includes('تمام ردیف‌ها و اعداد این مجموعه مصنوعی'),demoCreateDisabled:ax('demo-ready').includes('button "مشتری جدید محلی" [disabled]')};
  const expected={size10:10,page2:10,'search-draft':10,'enter-no-apply':10,'search-apply':1,'no-match-apply':0,'clear-apply':10,'fixed-yes':10,'trust-blocked':4,'source-sms':0,'active-deleted':2,'reset-active':10,size50:50,size100:100,'last-page':5,'first-page':100,size20:20};
  for(const [id,count]of Object.entries(expected))checks['rows:'+id]=rows(loaded(id))===count;
  checks.menuOpen=/button "سایر" \[expanded\]/.test(ax('menu-open'));
  checks.menuEscape=!/button "سایر" \[expanded\]/.test(ax('menu-escape'));
  checks.exactSyntheticMatch=ax(loaded('search-apply')).includes('TEST-PHONE-020');
  checks.sevenHeaders=(ax(loaded('size20')).match(/columnheader /g)||[]).length===7;
  checks.financialWritesDisabled=ax('menu-open').includes('button "افزودن اعتبار" [disabled]');
  checks.deleteDisabled=ax('menu-open').includes('button "حذف مشتری" [disabled]');
  checks.exportDisabled=ax(loaded('size20')).includes('button "خروجی اکسل" [disabled]');
  checks.noErrorsOrDownloads=!n.events.items.some(e=>['page-error','download'].includes(e.kind));
  checks.onlyLocalTraffic=n.events.items.filter(e=>e.kind==='request').every(e=>e.url.origin==='http://127.0.0.1:8083');
  checks.noRecordWrite=n.events.items.filter(e=>e.kind==='request'&&e.method!=='GET').every(e=>e.url.url.endsWith('/api/auth/login'));
  return checks;
}
