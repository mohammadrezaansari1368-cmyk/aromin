async page => {
  const res = [], errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  page.on('dialog', (d) => d.accept().catch(() => {}))
  const ok = (n, c, i) => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : ' — ' + JSON.stringify(i).slice(0, 240)))
  const T = async (n, fn) => { try { await fn() } catch (e) { await page.screenshot({ path: 'fail-' + n.replace(/[^a-z0-9]+/gi, '_') + '.png' }).catch(() => {}); res.push('FAIL ' + n + ' — EXC ' + String(e.message || e).split('\n')[0].slice(0, 220)) } }
  const idle = (ms) => page.waitForTimeout(ms || 400)
  const deals = async () => (await page.evaluate(async () => (await (await fetch('/api/state?tenant=team', { cache: 'no-store' })).json()).full)).people[0].invY['1405']
  async function login(u) {
    await page.goto('http://127.0.0.1:3010/'); await idle(900)
    if (!(await page.getByLabel('نام کاربری').count())) { await page.getByRole('button', { name: 'خروج' }).first().click(); await page.getByLabel('نام کاربری').waitFor() }
    await page.getByLabel('نام کاربری').fill(u); await page.locator('input[type=password]').fill('local-test-only'); await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await page.locator('aside nav').waitFor({ timeout: 30000 })
    await page.locator('aside nav button').filter({ has: page.locator('span', { hasText: /^دفتر فروش$/ }) }).first().click()
    await page.locator('section[aria-label="C1 دفترِ فاکتورها"]').waitFor({ timeout: 60000 }); await idle(800)
  }
  const openDoc = async (i) => { await page.getByRole('button', { name: 'سند مالی' }).nth(i).click(); await page.locator('section[aria-label="سندِ مالی و نقش‌ها"]').waitFor(); await idle(300) }
  const panel = () => page.locator('section[aria-label="سندِ مالی و نقش‌ها"]')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await T('admin flow', async () => {
    await login('t_admin')
    const inlineInGrid = await page.locator('[role=grid] input[type=checkbox][aria-label*="٪"]').count()
    ok('grid rows no longer carry the 7 stage checkboxes', inlineInGrid === 0, inlineInGrid)
    await openDoc(0)
    const det = panel().locator('details')
    ok('collapsible section exists and is closed by default', (await det.count()) === 1 && !(await det.evaluate((d) => d.open)))
    const sum = await det.locator('summary').innerText()
    ok('closed summary shows status line', /بدون تأیید مالی/.test(sum) && /نقش/.test(sum), sum)
    await det.locator('summary').focus(); await page.keyboard.press('Enter'); await idle(200)
    ok('keyboard (Enter on summary) opens the section', await det.evaluate((d) => d.open))
    const pre = det.getByLabel('پیش‌فاکتور', { exact: false }).first()
    await pre.check(); await idle(100)
    await det.locator('summary').focus(); await page.keyboard.press('Enter'); await idle(150)
    const closedNow = !(await det.evaluate((d) => d.open))
    await det.locator('summary').focus(); await page.keyboard.press('Enter'); await idle(150)
    ok('closing/reopening keeps unsaved edits (no reset)', closedNow && (await pre.isChecked()))
    await det.getByLabel('حسابدار (تأییدکنندهٔ مالی)').selectOption('نورا آزمون')
    const w = await det.innerText()
    ok('weights shown (5/10/20/15/35/10/5) with labels', ['۵٪', '۱۰٪', '۲۰٪', '۱۵٪', '۳۵٪'].every((x) => w.includes(x)), w.slice(0, 200))
    await det.getByRole('button', { name: /ذخیرهٔ نقش‌ها و تأیید مالی/ }).click()
    await page.waitForFunction(async () => { const r = await (await fetch('/api/state?tenant=team', { cache: 'no-store' })).json(); return r.full.people[0].invY['1405'][0].finBy === 'نورا آزمون' }, null, { timeout: 15000 })
    await idle(1500)
    const d = (await deals())[0]
    ok('saved: finBy via server route, stages updated, audit actor = t_admin', d.finBy === 'نورا آزمون' && d.stages.includes('pre') && d.finAudit.at(-1).user === 't_admin' && d.finAudit.at(-1).to === 'نورا آزمون' && d.mgrShare === undefined, { finBy: d.finBy, stages: d.stages, a: d.finAudit?.at(-1) })
    const grid = await page.locator('[role=grid]').innerText()
    ok('grid shows «✓ تأیید مالی: نورا آزمون» (not hardcoded)', grid.includes('✓ تأیید مالی: نورا آزمون'))
    ok('ledger shows date from stage-change cell with time', grid.includes('1405/07/05') && grid.includes('16:32:51'))
  })
  await T('locked doc', async () => {
    await page.keyboard.press('Escape').catch(() => {})
    await login('t_admin'); await openDoc(1)
    const det = panel().locator('details'); await det.locator('summary').click(); await idle(150)
    const rolesDisabled = await det.locator('fieldset').first().evaluate((f) => f.disabled)
    const finDisabled = await det.locator('fieldset').nth(1).evaluate((f) => f.disabled)
    const txt = await det.innerText()
    ok('approved (locked) doc: roles and finance read-only; approver shown separately', rolesDisabled && finDisabled && txt.includes('تصویب‌کنندهٔ سند') && txt.includes('مدیر نمونه'), { rolesDisabled, finDisabled })
  })
  await T('sales flow', async () => {
    await login('t_sales'); await openDoc(0)
    const det = panel().locator('details'); await det.locator('summary').click(); await idle(150)
    const finDisabled = await det.locator('fieldset').nth(1).evaluate((f) => f.disabled)
    ok('sales user cannot edit finance approval (UI)', finDisabled)
    const st = await page.evaluate(async () => { const r = await fetch('/api/c1/finance-by', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aromin-User': 't_sales', 'X-Aromin-Pass': 'local-test-only' }, body: JSON.stringify({ tenant: 'team', id: 1, person: '' }) }); return r.status })
    ok('sales request rejected by backend (403)', st === 403, st)
  })
  await T('mobile', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await idle(600)
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ok('mobile: no horizontal overflow on ledger page', ovf <= 1, ovf)
    await page.setViewportSize({ width: 1440, height: 1000 })
  })
  ok('no page errors', errs.length === 0, errs.slice(0, 3))
  return 'PASSED ' + res.filter((x) => x.startsWith('PASS')).length + '/' + res.length + '\n' + res.join('\n')
}
