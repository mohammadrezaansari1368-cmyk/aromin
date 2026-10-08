const {chromium}=require('playwright')
const assert=require('node:assert/strict')
// دکمهٔ کلیِ «بازگرداندن تصویب» (فقط مدیر) + کدِ تلگرام؛ و پنلِ «سند مالی» که در دفترِ بلند خودش به دید می‌آید
;(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const ap=(id,o={})=>({id,no:String(7000+id),name:'مشتری '+id,funnel:'won',stages:['close'],month:6,amount:'10000000',settle:'cash',channel:'official',...o})
 const deals=[ap(1,{finState:'approved',finApproval:{by:'مدیر',ts:1}}),ap(2,{finState:'closed',finClosed:{by:'مالی',ts:2},channel:'unofficial'}),...Array.from({length:60},(_,i)=>ap(i+3))]
 const S={weights:{lead:5,pre:10,funnel:20,follow:15,close:35,post:10,fin:5},officialDeduct:10,months:{}}
 const full={fy:'1405',people:[{id:1,name:'آزمایش',role:'sales',S,inv:deals,invY:{1405:deals}}],years:{1405:{}}}
 const writes=[]
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
 await page.route('**/api/**',r=>{const u=r.request().url();if(r.request().method()==='POST')writes.push({u,b:r.request().postDataJSON()})
  if(u.includes('/api/c1/reopen-code'))return r.fulfill({json:{ok:true,to:'تلگرام',count:2}})
  if(u.includes('/api/c1/reopen'))return r.fulfill({json:{ok:true,via:'telegram',reopened:2}})
  return r.fulfill({json:{ok:true,full,order:[]}})})
 const base=(process.env.TEST_URL||'http://127.0.0.1:5186')+'/tests/browser/index.html'
 await page.goto(base,{timeout:180000})
 const btn=page.getByRole('button',{name:/بازگرداندن تصویب/})
 await btn.waitFor({timeout:120000})
 // پنلِ سند در دفترِ ۶۲ردیفه خودش به دید می‌آید
 await page.getByRole('button',{name:'سند مالی'}).first().click(); await page.waitForTimeout(1200)
 const panel=page.locator('section[aria-label="سندِ مالی و نقش‌ها"]'); const pb=await panel.boundingBox()
 assert.ok(pb.y>=0 && pb.y<1000, 'panel in view '+pb.y)
 assert.equal(await page.getByRole('button',{name:'ارسالِ کد به تلگرام'}).count(),1)
 // دکمهٔ کلی: ۲ سندِ قفل (تصویب‌شده + بسته)
 await btn.click()
 const dlg=page.getByRole('dialog',{name:'بازگرداندنِ تصویبِ اسناد'}); await dlg.waitFor()
 assert.match(await dlg.innerText(),/۲ سند/)
 await dlg.getByRole('checkbox').check(); await dlg.getByRole('button',{name:'بعدی'}).click()
 await dlg.locator('#br-reason').fill('اصلاح مبلغ دوره'); await dlg.getByRole('button',{name:'بعدی'}).click()
 await dlg.getByRole('button',{name:'ارسالِ کد به تلگرام'}).click()
 await dlg.locator('#br-code').fill('123456')
 await dlg.getByRole('button',{name:/بازگرداندنِ همهٔ اسناد/}).click()
 await dlg.getByText('۲ سند به پیش‌نویس برگشت').waitFor()
 const code=writes.find(w=>w.u.includes('reopen-code')),re=writes.find(w=>/\/api\/c1\/reopen(\?|$)/.test(w.u))
 assert.deepEqual(code.b.ids,[1,2]); assert.equal(code.b.reason,'اصلاح مبلغ دوره')
 assert.deepEqual(re.b.ids,[1,2]); assert.equal(re.b.code,'123456')
 // کارشناسِ فروش دکمه را نمی‌بیند
 await page.goto(base+'?role=sales',{timeout:180000}); await page.getByRole('button',{name:'سند مالی'}).first().waitFor({timeout:120000})
 assert.equal(await page.getByRole('button',{name:/بازگرداندن تصویب/}).count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS: bulk reopen (manager only, Telegram code for exactly the locked set), document panel scrolls into view')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
