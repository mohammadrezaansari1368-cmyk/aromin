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
 // manager, all units: cabin asks for a unit/person instead of inventing an aggregate
 await page.locator('section[aria-label="کابین ابزار"]').waitFor({timeout:60000})
 assert.match(await page.locator('section[aria-label="کابین ابزار"]').innerText(),/یک واحد یا شخص انتخاب کنید/)
 const chars0=(await root.innerText()).replace(/\s+/g,'').length
 // person picker: keyboard
 await page.getByRole('button',{name:/^شخص:/}).click();await page.getByRole('listbox',{name:'افراد'}).waitFor()
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
 const chip=await page.getByRole('button',{name:/^شخص:/}).innerText();assert.ok(!/همهٔ افراد/.test(chip),chip)
 const cab=page.locator('section[aria-label="کابین ابزار"]');await cab.locator('.pv-g-chrono').waitFor({timeout:60000})
 // «not computable» is never 0
 for(const m of await cab.getByRole('meter').all()){const t=await m.getAttribute('aria-valuetext');if(/قابل محاسبه نیست/.test(t))assert.equal((await m.locator('.pv-g-center b').innerText()).trim(),'—')}
 // clicking a gauge switches the active metric (trend title follows)
 const mini=cab.locator('.pv-g-mini .pv-gauge-face').first(),lbl=(await mini.locator('.pv-g-label').innerText()).trim()
 await mini.click();assert.equal(await mini.getAttribute('aria-pressed'),'true')
 assert.match(await page.locator('section[aria-label="روند دوره"]').innerText(),new RegExp(lbl))
 // receipt drawer
 await page.getByRole('button',{name:/رسید محاسبه/}).click();const dlg=page.getByRole('dialog');await dlg.waitFor()
 assert.match(await dlg.innerText(),/صورت|دلیل/);await page.keyboard.press('Escape');await dlg.waitFor({state:'detached'})
 // real heatmap: 12 Jalali months, no sample data
 const hm=page.locator('section[aria-label="نقشهٔ سالانه"]');await hm.locator('.pv-cal').waitFor({timeout:60000})
 assert.equal(await hm.locator('.pv-cal > section').count(),12);assert.equal(await page.getByText('contributions',{exact:false}).count(),0)
 // data health bar expands
 await page.locator('.pv-health-h').click();await page.getByRole('button',{name:'اتصال منبع ←'}).last().waitFor()
 // modes
 await page.getByRole('button',{name:/تطبیق/}).click();await page.waitForTimeout(400);assert.equal(await cab.count(),0)
 await page.getByRole('button',{name:/کابین/}).click();await cab.waitFor()
 for(const mode of ['light','dark'])for(const width of [1440,390]){
  await page.evaluate(m=>{document.documentElement.dataset.mode=m},mode);await page.setViewportSize({width,height:1100});await page.waitForTimeout(500)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,`overflow ${mode} ${width}`)
  await page.screenshot({path:path.join(out,`v2-${mode}-${width}.png`),fullPage:true})
 }
 assert.deepEqual(errors,[])
 console.log('PASS: perf v2 cabin/person picker/gauge select/receipt/heatmap/health/modes; no 0 for not-computable; 390–1440 light/dark; visible chars (all-units view): '+chars0)
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
