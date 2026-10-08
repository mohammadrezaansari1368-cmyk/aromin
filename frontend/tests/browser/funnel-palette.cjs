const {chromium}=require('playwright')
const assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch(),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5188')+'/tests/browser/index.html?view=funnel&brand=1')
 const paths=page.locator('[data-seg]'),legend=page.getByRole('list',{name:'راهنمای رنگ‌های قیف'}),colors=['#004991','#910D6A','#FCBF00']
 for(const width of [320,375,768,1440]){
  await page.setViewportSize({width,height:900});await paths.first().waitFor();assert.equal(await paths.count(),3)
  for(let i=0;i<3;i++){
   assert.equal(await paths.nth(i).getAttribute('fill'),colors[i]);assert.equal(await paths.nth(i).getAttribute('fill-opacity'),'1')
   const marker=legend.locator('[data-legend-marker]').nth(i)
   assert.equal(await marker.evaluate((el,color)=>{const ref=document.createElement('span');ref.style.backgroundColor=color;return el.style.backgroundColor===ref.style.backgroundColor},colors[i]),true)
  }
  const b=await page.getByRole('group',{name:'قیف تبدیل فروش'}).boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width)
 }
 await legend.getByRole('button').nth(1).hover();assert.equal(await paths.nth(1).getAttribute('aria-pressed'),'true')
 await paths.nth(0).focus();assert.equal(await legend.getByRole('button').nth(0).getAttribute('aria-pressed'),'true')
 const before=await paths.nth(1).getAttribute('d');await page.getByRole('button',{name:'تغییر داده'}).click();await page.waitForTimeout(500);assert.notEqual(await paths.nth(1).getAttribute('d'),before)
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100)
 assert.equal(await paths.first().evaluate(el=>el.style.transform),'')
 assert.deepEqual(errors,[]);console.log('PASS: exact palette, 3 layers, legend parity, hover, geometry update, reduced motion, 320–1440px');await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
