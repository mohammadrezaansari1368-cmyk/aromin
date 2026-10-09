const {chromium}=require('playwright')
const assert=require('node:assert/strict')
// N21: نقشهٔ فعالیتِ سالانه در تبِ عملکرد — همیشه دیده می‌شود (حتی بدونِ فایلِ حضور)، دوبعدی/سه‌بعدی، دادهٔ نمونه
;(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.route('**/api/**',r=>r.fulfill({json:{ok:true,full:{fy:'1405',people:[],years:{1405:{}}},order:[]}}))
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5190')+'/tests/browser/index.html?view=perf',{timeout:180000})
 const tile=page.locator('section').filter({has:page.getByRole('heading',{name:/نقشهٔ فعالیتِ سالانه/})}).last()
 await tile.waitFor({timeout:120000});await tile.scrollIntoViewIfNeeded();await page.waitForTimeout(800)
 assert.match(await tile.innerText(),/contributions in the last year/)
 assert.equal(await tile.locator('canvas[role="img"]').count(),1)
 const flat=tile.getByRole('button',{name:'Flat heat map'}),sky=tile.getByRole('button',{name:'3D skyline'})
 assert.equal(await sky.getAttribute('aria-pressed'),'true')
 await flat.click();assert.equal(await flat.getAttribute('aria-pressed'),'true')
 await sky.click();assert.equal(await sky.getAttribute('aria-pressed'),'true')
 // رنگ‌ها از سه تمِ برند، روشن و تیره (پررنگ‌ترین پله)
 const top=async()=>tile.locator('button[aria-label^="Highlight heaviest"]').evaluate(el=>getComputedStyle(el).backgroundColor)
 for(const [theme,mode,rgb] of [['purple','light','rgb(110, 10, 80)'],['blue','dark','rgb(127, 178, 240)'],['gold','light','rgb(168, 125, 0)'],['gold','dark','rgb(255, 224, 122)']]){
  await page.evaluate(([t,m])=>{document.documentElement.dataset.theme=t;document.documentElement.dataset.mode=m},[theme,mode]);await page.waitForTimeout(700)
  assert.equal(await top(),rgb,theme+'/'+mode)
 }
 for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,'overflow '+width)}
 assert.deepEqual(errors,[])
 console.log('PASS: N21 skyline tile visible without data, 2D/3D toggle, brand palette per theme/mode, 320–1440px')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
