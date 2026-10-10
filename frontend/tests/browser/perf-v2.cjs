// Performance v2 against the synthetic FastAPI fixture (deployment/tests/performance_fixture_api.py on 5192) and Vite (TEST_URL, default 5191).
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
;(async()=>{
 const out=path.resolve('docs/perf-ui-v2/screenshots');fs.mkdirSync(out,{recursive:true})
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.route('**/api/performance/**',async r=>{const u=new URL(r.request().url());u.host='127.0.0.1:5192';const response=await page.request.get(u.toString(),{headers:r.request().headers()});await r.fulfill({response})})
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5191')+'/tests/browser/index.html?view=perf',{timeout:180000})
 const root=page.locator('[data-performance-v2]');await root.waitFor({timeout:120000})
 await page.waitForLoadState('networkidle');await page.waitForTimeout(2500);await root.waitFor() // first visit: Vite may reload after optimizing deps
 await page.getByRole('radio',{name:'سال'}).click()
 const cab=page.locator('section[aria-label="کابین ابزار"]');await cab.waitFor({timeout:60000})
 assert.match(await cab.innerText(),/یک واحد یا شخص انتخاب کنید/)
 // the cabin follows the light theme (no hard-coded dark panel)
 await page.evaluate(()=>{document.documentElement.dataset.mode='light'});await page.waitForTimeout(300)
 const lum=await cab.evaluate(el=>{const s=getComputedStyle(el),m=(s.backgroundImage.match(/rgba?\(([^)]+)\)/)||[])[1]||(s.backgroundColor.match(/rgba?\(([^)]+)\)/)||[])[1]||'0,0,0';const v=m.split(',').map(Number);return (v[0]+v[1]+v[2])/3})
 assert.ok(lum>150,'light cabin luminance '+lum)
 const pick=async(i)=>{await page.getByRole('button',{name:/^شخص:/}).click();await page.getByRole('listbox',{name:'افراد'}).waitFor();for(let k=0;k<i;k++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')}
 await pick(1) // «الف» — has effort data in the fixture
 await cab.locator('.pv-g-chrono').waitFor({timeout:60000})
 for(const m of await cab.getByRole('meter').all()){const t=await m.getAttribute('aria-valuetext');if(/قابل محاسبه نیست/.test(t))assert.equal((await m.locator('.pv-g-center b').innerText()).trim(),'—')}
 // effort: (600 talk + Σmin(task,30)) ÷ 60 ÷ 20 days; fixture taskMins [20,40,90,15]×25 → 2375 → ≈2.48 h/day
 const eff=cab.locator('.pv-effort');await eff.waitFor({timeout:60000})
 assert.match(await eff.locator('.pv-effort-dial').getAttribute('aria-valuetext'),/۲٫۵|۲\.۵|۲٫۴|۲\.۴/)
 assert.equal(await eff.getByRole('meter').count(),4) // dial + 3 rings
 assert.match(await eff.innerText(),/مشروط به تأیید مالی/)
 const mini=cab.locator('.pv-g-mini .pv-gauge-face').first(),lbl=(await mini.locator('.pv-g-label').innerText()).trim()
 await mini.click();assert.equal(await mini.getAttribute('aria-pressed'),'true');assert.match(await page.locator('section[aria-label="روند دوره"]').innerText(),new RegExp(lbl))
 await page.getByRole('button',{name:/رسید محاسبه/}).click();const dlg=page.getByRole('dialog');await dlg.waitFor();await page.keyboard.press('Escape');await dlg.waitFor({state:'detached'})
 // yearly map = restored 2D/3D skyline with real data, Persian labels
 const hm=page.locator('section[aria-label="نقشهٔ سالانه"]');await hm.locator('canvas[role="img"]').waitFor({timeout:60000})
 await hm.getByRole('button',{name:'نمای سه‌بعدی'}).click();assert.equal(await hm.getByRole('button',{name:'نمای سه‌بعدی'}).getAttribute('aria-pressed'),'true')
 await hm.getByRole('button',{name:'نمای دوبعدی'}).click()
 assert.equal(await page.getByText('contributions',{exact:false}).count(),0)
 // task tracker: same component, drill year → quarter (→ month) by clicking a day
 const tr=page.locator('section[aria-label="ردیاب وظیفه"]');await tr.locator('canvas[role="img"]').waitFor({timeout:60000});await page.waitForTimeout(800)
 const clickMid=async()=>{const c=tr.locator('canvas[role="img"]');await c.scrollIntoViewIfNeeded();await c.focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.waitForTimeout(900)} // keyboard drill (End = last day, Enter = open)
 await clickMid();assert.ok(await tr.locator('.pv-crumb button').count()>=2,'drilled into a quarter')
 await clickMid();assert.ok(await tr.locator('.pv-crumb b').count()===1,'drilled into a month')
 await tr.getByRole('radio',{name:'تحقق هدف ٪'}).click();assert.equal(await tr.getByRole('radio',{name:'ساعت'}).isDisabled(),true)
 // a person without effort data: grey dial + import button, no zero
 await pick(2);await page.waitForTimeout(1000)
 assert.match(await cab.locator('.pv-effort-dial').getAttribute('aria-valuetext'),/بدون داده/);await cab.getByRole('button',{name:'ایمپورت گزارش'}).waitFor()
 await pick(1);await eff.waitFor()
 for(const theme of ['purple','blue'])for(const mode of ['light','dark'])for(const width of [1440,390]){
  await page.evaluate(([t,m])=>{document.documentElement.dataset.theme=t;document.documentElement.dataset.mode=m},[theme,mode]);await page.setViewportSize({width,height:1100});await page.waitForTimeout(600)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,`overflow ${theme} ${mode} ${width}`)
  await page.screenshot({path:path.join(out,`v2-${theme}-${mode}-${width}.png`),fullPage:true})
 }
 assert.deepEqual(errors,[])
 console.log('PASS: perf v2 cabin (themed) + effort instrument (data / no data) + restored 2D/3D yearly map + task tracker drill-down; receipt; no 0 for not-computable; 2 palettes × light/dark × 390/1440')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
