import { request } from './api.mjs';
const form=document.querySelector('#local-auth'), button=document.querySelector('#auth-submit'), errorBox=document.querySelector('#auth-error'), status=document.querySelector('#auth-state');
let configured=null; button.disabled=true;
try { const result=await request('/auth/status'); configured=result.configured; button.disabled=false;document.querySelector('#auth-title').textContent=configured?'ورود به XSI':'ساخت حساب مالک محلی';button.textContent=configured?'ورود':'ایجاد حساب محلی';status.textContent=configured?'':'حساب نخست فقط روی این دستگاه ساخته می‌شود؛ سیاست مستقل XSI.'; }
catch { status.textContent='سرور در دسترس نیست؛ صفحه را دوباره بارگذاری کنید.'; }
form.onsubmit=async event=>{
  event.preventDefault(); button.disabled=true;errorBox.textContent='';status.textContent='در حال ورود…';
  try { await request(configured?'/auth/login':'/auth/setup',{method:'POST',body:JSON.stringify({username:form.username.value,password:form.password.value})});form.password.value='';location.assign('/branch.html'); }
  catch(error) {errorBox.textContent=error.message;status.textContent='ورود انجام نشد.';button.disabled=false;}
};
