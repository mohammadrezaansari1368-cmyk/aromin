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
 const select=page.getByRole('combobox',{name:'ماه فعال'}),c2=page.locator('[data-tile="C2"]'),c3=page.locator('[data-tile="C3"]'),c4=page.locator('[data-tile="C4"]')
 await c2.waitFor()
 const reach=v=>[0,1,2,3].map(i=>v.slice(i,4).reduce((x,y)=>x+y,0))
 async function check(month,values,gross){
  await select.selectOption(month)
  for(const tile of [c2,c3])assert.equal(await tile.getAttribute('data-selected-month'),month)
  const t=await c2.innerText(), r=reach(values)
  for(const s of ['Start','Qualified','Advance','Won','Lost: '+values[4]])assert.ok(t.includes(s),month+' '+s)
  if(r[0])for(const n of r)assert.ok(t.includes(String(n)),month+' reach '+n)
  const row=c3.locator('div').filter({has:page.getByText('فروشِ ناخالص',{exact:true})}).last()
  assert.equal((await row.innerText()).replace(/[^۰-۹]/g,''),fa(gross))
  const shown=await page.locator('[data-order-row]').evaluateAll(els=>els.map(e=>Number(e.dataset.orderRow.split(':')[1])))
  for(const key of shown)assert.ok(month==='all'||deals.find(d=>d.id===key)?.month===Number(month))
 }
 await check('4',counts[0],1000000)
 await check('5',counts[1],4000000)
 await check('6',[0,0,0,0,0],0)
 await check('all',[3,3,5,3,4],5000000)
 await check('4',counts[0],1000000);await check('5',counts[1],4000000);await check('4',counts[0],1000000)
 // C4 به حالتِ قبل: فروش روزانهٔ ماه جاری
 assert.match(await c4.innerText(),/فروش روزانهٔ ماه جاری/)
 for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:1100});await c2.scrollIntoViewIfNeeded();const bx=await c2.boundingBox();assert.ok(bx.x>=0&&bx.x+bx.width<=width)}
 await page.emulateMedia({reducedMotion:'reduce'});await check('5',counts[1],4000000)
 assert.deepEqual(errors,[]);console.log('PASS: C2 (bklit, cumulative, English)/C3 and ledger share selected month; zero/empty/all/rapid changes; C4 daily sales restored; 320–1440; reduced motion');await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
