const {chromium}=require('playwright')
const assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const fa=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d])
 const S={weights:{lead:5,pre:10,funnel:20,follow:15,close:35,post:10,fin:5},officialDeduct:0,months:{}}
 let id=0
 const counts=[[2,3,1,1,1],[1,0,4,2,3]],keys=['start','qualify','advance','won','lost']
 const deals=counts.flatMap((nums,m)=>nums.flatMap((n,k)=>Array.from({length:n},()=>({id:++id,no:String(id),name:'آزمون',month:m+4,saleDate:`1405/0${m+5}/10`,fy:'1405',funnel:keys[k],amount:String((m+1)*1000000),settle:'cash',stages:['lead','pre','funnel','follow','close','post','fin']}))))
 const full={fy:'1405',people:[{id:1,name:'آزمایش',role:'sales',S,inv:deals,invY:{1405:deals}}],years:{1405:{}}}
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.route('**/api/**',r=>r.fulfill({json:{ok:true,full,order:[]}}))
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5189')+'/tests/browser/index.html')
 const select=page.getByRole('combobox',{name:'ماه فعال'}),c4=page.locator('[data-tile="C4"]'),c2=page.locator('[data-tile="C2"]'),c3=page.locator('[data-tile="C3"]')
 await c4.waitFor();await c4.evaluate(el=>window.savedC4=el.querySelector('svg'))
 async function check(month,values,gross){
  await select.selectOption(month)
  for(const tile of [c2,c3,c4])assert.equal(await tile.getAttribute('data-selected-month'),month)
  for(let i=0;i<5;i++)assert.ok((await c2.locator(`[data-seg="${keys[i]}"]`).getAttribute('aria-label')).endsWith(fa(values[i])))
  assert.equal(await c4.locator('[data-seg]').count(),4)
  for(let i=0;i<4;i++)assert.ok((await c4.locator(`[data-seg="${keys[i]}"]`).getAttribute('aria-label')).endsWith(fa(values[i])))
  assert.match(await c4.locator('[data-funnel-loss]').innerText(),new RegExp(fa(values[4])))
  const row=c3.locator('div').filter({has:page.getByText('فروشِ ناخالص',{exact:true})}).last()
  assert.equal((await row.innerText()).replace(/[^۰-۹]/g,''),fa(gross))
  assert.equal(await c4.evaluate(el=>el.querySelector('svg')===window.savedC4),true)
  const shown=await page.locator('[data-order-row]').evaluateAll(els=>els.map(e=>Number(e.dataset.orderRow.split(':')[1])))
  for(const key of shown)assert.ok(month==='all'||deals.find(d=>d.id===key)?.month===Number(month))
 }
 await check('4',counts[0],1000000)
 const old=await c4.locator('[data-seg="qualify"]').getAttribute('d')
 await check('5',counts[1],4000000);await page.waitForTimeout(450)
 assert.notEqual(await c4.locator('[data-seg="qualify"]').getAttribute('d'),old)
 await check('6',[0,0,0,0,0],0);assert.match(await c4.getByRole('status').innerText(),/معامله‌ای ثبت نشده/)
 await check('all',[3,3,5,3,4],5000000)
 await check('4',counts[0],1000000);await check('5',counts[1],4000000);await check('4',counts[0],1000000)
 const colors=['#004991','#910D6A','#FCBF00','#004991']
 for(const theme of ['light','dark']){
  await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;document.documentElement.dataset.theme='purple'},theme)
  for(const width of [320,375,768,1440]){
   await page.setViewportSize({width,height:1100});await c4.scrollIntoViewIfNeeded()
   for(let i=0;i<4;i++){
    assert.equal(await c4.locator('[data-seg]').nth(i).getAttribute('fill'),colors[i]);assert.equal(await c4.locator('[data-seg]').nth(i).getAttribute('fill-opacity'),'1')
    assert.equal(await c4.locator('[data-legend-marker]').nth(i).evaluate((el,color)=>{const ref=document.createElement('span');ref.style.backgroundColor=color;return el.style.backgroundColor===ref.style.backgroundColor},colors[i]),true)
   }
   const b=await c4.locator('svg').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width)
  }
 }
 const legend=c4.getByRole('list',{name:'راهنمای رنگ‌های قیف'})
 await legend.getByRole('button').nth(2).hover();assert.equal(await c4.locator('[data-seg="advance"]').getAttribute('aria-pressed'),'true')
 await c4.locator('[data-seg="start"]').focus();assert.equal(await legend.getByRole('button').nth(0).getAttribute('aria-pressed'),'true')
 await page.emulateMedia({reducedMotion:'reduce'});await check('5',counts[1],4000000)
 assert.equal(await c4.locator('[data-seg]').first().evaluate(el=>el.style.transform),'')
 await c4.scrollIntoViewIfNeeded();await c4.screenshot({path:'/workspace/month-funnel-c4.png'})
 assert.deepEqual(errors,[]);console.log('PASS: C2/C3/C4 and ledger share selected month; zero/empty/all/rapid changes; palette + hover; persistent geometry; light/dark 320–1440; reduced motion');await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
