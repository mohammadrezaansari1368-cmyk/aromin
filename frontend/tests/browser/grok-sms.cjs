const {chromium}=require('playwright'),assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],calls=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 let cfg={success:true,api_key_configured:true,token_configured:true,PAYAMRESAN_DEFAULT_SENDER:'30001234',SMS_MAX_RECIPIENTS:100,SMS_REQUIRE_CONFIRMATION:true}
 await page.route('**/api/settings/grok-sms**',async r=>{const u=new URL(r.request().url());calls.push(u.pathname);let body=cfg
  if(u.pathname.endsWith('/test'))body={success:true,message:'برای تست واقعی، یک پیامک آزمایشی باید ارسال شود.'}
  else if(u.pathname.endsWith('/regenerate'))body={success:true,token:'synthetic-new-token-only',message:'توکن قبلی باطل شد'}
  else if(u.pathname.endsWith('/audit'))body={success:true,rows:[]}
  else if(r.request().method()==='POST'){const d=r.request().postDataJSON();assert.equal(d.PAYAMRESAN_API_KEY,'synthetic-api-key');cfg={...cfg,PAYAMRESAN_DEFAULT_SENDER:d.PAYAMRESAN_DEFAULT_SENDER};body=cfg}
  await r.fulfill({json:body})
 })
 await page.goto('http://127.0.0.1:5191/tests/browser/index.html?view=grok')
 const section=page.getByRole('region',{name:'اتصال Grok SMS'});await section.getByLabel('شماره خط پیش‌فرض ارسال پیامک').waitFor()
 assert.equal(await section.getByLabel('کلید API پیام‌رسان باستانی').inputValue(),'')
 await section.getByLabel('کلید API پیام‌رسان باستانی').fill('synthetic-api-key');await section.getByRole('button',{name:'ذخیره تنظیمات',exact:true}).click()
 await page.getByText('تنظیمات ذخیره شد؛ کلیدها بازخوانی نمی‌شوند.').waitFor();assert.equal(await section.getByLabel('کلید API پیام‌رسان باستانی').inputValue(),'')
 await section.getByRole('button',{name:'تست اتصال پیام‌رسان باستانی',exact:true}).click();await page.getByText('برای تست واقعی، یک پیامک آزمایشی باید ارسال شود.',{exact:true}).waitFor()
 await section.getByRole('button',{name:'تولید / بازتولید توکن امن'}).click();const secret=section.getByLabel('توکن یک‌بارمصرف نمایشی');await secret.waitFor();assert.equal(await secret.getAttribute('type'),'password')
 await section.getByRole('button',{name:'پنهان‌کردن',exact:true}).click();assert.equal(await secret.count(),0)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
 assert.equal(calls.some(x=>x==='/api/grok/send-sms'),false)
 await page.goto('http://127.0.0.1:5191/tests/browser/index.html?view=grok&role=sales');assert.equal(await page.getByRole('region',{name:'اتصال Grok SMS'}).count(),0)
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: masked secrets, save clearing, no-send test, token regeneration, mobile RTL, non-admin hidden')
})().catch(e=>{console.error(e);process.exit(1)})
