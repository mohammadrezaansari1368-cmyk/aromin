async page => {
  // ایمپورتِ واقعی از «مرکز ایمپورت» روی سرورِ 3010 + MariaDB (tenantِ seed_team.py، فایلِ make_joolio_fixture.py)
  const FILE = 'D:/aromin-mariadb/joolio-fixture.xlsx'
  const res = [], errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  page.on('dialog', (d) => d.accept().catch(() => {}))
  const ok = (n, c, i) => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || i === undefined ? '' : ' — ' + JSON.stringify(i).slice(0, 300)))
  const T = async (n, fn) => { try { await fn() } catch (e) { await page.screenshot({ path: 'D:/aromin-mariadb/fail-' + n.replace(/[^a-z0-9]+/gi, '_') + '.png' }).catch(() => {}); res.push('FAIL ' + n + ' — EXC ' + String(e.message || e).split('\n')[0].slice(0, 220)) } }
  const idle = (ms) => page.waitForTimeout(ms || 400)
  const state = async () => page.evaluate(async () => (await (await fetch('/api/state?tenant=team', { cache: 'no-store' })).json()).full)
  const kpis = async (sec) => Object.fromEntries(await sec.locator('.grid > div').evaluateAll((els) => els.map((e) => [e.children[1]?.textContent?.split(' ')[0], +e.children[0].textContent.replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)])))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:3010/'); await idle(900)
  if (!(await page.getByLabel('نام کاربری').count())) { await page.getByRole('button', { name: 'خروج' }).first().click(); await page.getByLabel('نام کاربری').waitFor() }
  await page.getByLabel('نام کاربری').fill('t_admin'); await page.locator('input[type=password]').fill('local-test-only'); await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await page.locator('aside nav').waitFor({ timeout: 30000 })
  const preview = async () => {
    const nav = page.locator('aside nav button').filter({ has: page.locator('span', { hasText: /^مرکز ایمپورت$/ }) }).first()
    if (await nav.isVisible()) { await nav.click(); await idle(800) }   // موبایل: منوی کشویی، همان صفحه می‌ماند
    await page.locator('input[type=file]').first().setInputFiles(FILE); await idle(1200)
    await page.getByRole('button', { name: /^ورودِ .* فایل به سیستم$/ }).click()
    const sec = page.locator('section[aria-label="پیش‌نمایشِ ایمپورتِ معاملات"]')
    await sec.locator('.grid').first().waitFor({ timeout: 60000 }); await idle(400)
    return sec
  }
  await T('first import', async () => {
    const sec = await preview()
    const k = await kpis(sec)
    ok('preview counts: valid 4, previous 1, duplicate 1, conflict 3, invalid 1', k['معتبر'] === 4 && k['سال‌های'] === 1 && k['تکراری'] === 1 && k['تعارض'] === 3 && k['نامعتبر'] === 1, k)
    const note = await sec.innerText()
    ok('unknown seller flagged, not matched', note.includes('پویا تازه (۱)') && note.includes('کارشناسِ تازه ساخته می‌شود'))
    await sec.getByRole('button', { name: /گزارشِ اعتبارسنجی/ }).click(); await idle(200)
    const rep = await sec.locator('table[aria-label="گزارشِ اعتبارسنجیِ ایمپورت"]').innerText()
    ok('validation table: sellers × months with conflicts', rep.includes('سارا آزمون') && rep.includes('پویا تازه (تازه)') && rep.includes('شهریور') && rep.includes('مهر'), rep.slice(0, 300))
    await sec.getByRole('button', { name: /ردیفِ کنارگذاشته/ }).click(); await idle(200)
    const rows = await sec.locator('table').last().innerText()
    ok('conflict reasons name the differing field', rows.includes('نامِ مشتری') && rows.includes('مبلغ') && rows.includes('تطبیق خودکار انجام نشد'), rows.slice(0, 400))
    const before = await state()
    await sec.getByRole('button', { name: /^ثبت ۴ ردیف/ }).click()
    await page.waitForFunction(async () => { const f = (await (await fetch('/api/state?tenant=team', { cache: 'no-store' })).json()).full; return f.people.some((p) => p.name === 'پویا تازه') }, null, { timeout: 30000 })
    await idle(800)
    const f = await state()
    const sara = f.people.find((p) => p.name === 'سارا آزمون').invY['1405']
    const d = sara.find((x) => x.no === '7101')
    ok('imported row: date/time/month/raw from stage-change, rial ÷10', d && d.saleDate === '1405/07/03' && d.saleTime === '11:20:00' && d.month === 6 && d.stageChangedAt === '11:20:00 1405/07/03' && d.amount === '12000000', d)
    const k7001 = (x) => x.find((y) => y.no === '7001'), k7002 = (x) => x.find((y) => y.no === '7002')
    const bs = before.people.find((p) => p.name === 'سارا آزمون').invY['1405']
    ok('conflicting 7001 and duplicate locked 7002 untouched', JSON.stringify(k7001(sara)) === JSON.stringify(k7001(bs)) && JSON.stringify(k7002(sara)) === JSON.stringify(k7002(bs)))
    ok('no 7104 (in-file conflict), no 7105 (1404), no 7106 (invalid)', !sara.some((x) => ['7104', '7105', '7106'].includes(x.no)))
    const log = f.importLog.at(-1)
    ok('import log carries the validation report', log.fy.conflict === 3 && log.report.bySeller['سارا آزمون'].conflict === 3 && log.report.newNames['پویا تازه'] === 1, log.fy)
  })
  await T('re-import is idempotent', async () => {
    const before = JSON.stringify((await state()).people)
    const sec = await preview()
    const k = await kpis(sec)
    ok('second preview: valid 0, duplicate 5, conflict 3', k['معتبر'] === 0 && k['تکراری'] === 5 && k['تعارض'] === 3, k)
    ok('commit disabled (nothing to write)', await sec.getByRole('button', { name: 'ردیفِ معتبری برای ثبت نیست' }).isDisabled())
    await sec.getByRole('button', { name: 'انصراف' }).click(); await idle(500)
    ok('ledger unchanged after second import attempt', JSON.stringify((await state()).people) === before)
  })
  await T('mobile preview', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await idle(400)
    const sec = await preview()
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ok('mobile: preview has no horizontal page overflow', ovf <= 1, ovf)
    await sec.getByRole('button', { name: 'انصراف' }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
  })
  ok('no page errors', errs.length === 0, errs.slice(0, 3))
  return 'PASSED ' + res.filter((x) => x.startsWith('PASS')).length + '/' + res.length + '\n' + res.join('\n')
}
