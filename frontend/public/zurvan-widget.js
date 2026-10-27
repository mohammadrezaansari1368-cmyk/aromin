/* ZURVAN: public site token only. Setup actions are never sent to public endpoints. */
(() => {
 'use strict';
 const script = document.currentScript;
 if (!script || document.getElementById('zurvan-agent-widget')) return;
 const site = script.dataset.siteId || '';
 const unavailable = 'دستیار موقتاً در دسترس نیست؛ کمی بعد دوباره امتحان کنید یا از راه تماسِ سایت پیگیری کنید.';
 const base = new URL(script.src).origin;
 const mount = () => {
  const host = document.createElement('div'); host.id = 'zurvan-agent-widget';
  host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;width:72px;height:80px';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
:host{--sand:#e8cb8f;--shade:#9a672d;--paper:#fffaf0;--ink:#392c20;font:14px Tahoma,sans-serif;color:var(--ink);color-scheme:light}
:host([data-theme=dark]){--sand:#a47b53;--shade:#4b3020;--paper:#2c2824;--ink:#f4f0e8;color-scheme:dark}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;color:inherit}button:focus-visible,input:focus-visible{outline:3px solid #5986af;outline-offset:3px}
.launch{width:72px;height:80px;border:0;background:none;position:relative;padding:0;filter:drop-shadow(0 7px 5px #0005)}
.face{display:block;position:relative;width:64px;height:62px;border-radius:46% 46% 40% 40%;background:radial-gradient(ellipse at 32% 23%,#fff7da 0,var(--sand) 30%,var(--shade) 90%);border:2px solid var(--shade);box-shadow:inset -5px -6px 6px #0003,inset 3px 3px 4px #fff8;transform:perspective(180px) rotateY(-9deg);animation:breathe 4s ease-in-out infinite}
.face:before{content:'';position:absolute;width:4px;height:13px;background:var(--shade);top:-12px;left:28px;border-radius:5px}.eyes{position:absolute;inset:22px 12px auto;display:flex;justify-content:space-between}.eye{width:9px;height:13px;border-radius:50%;background:#33251c;box-shadow:inset 2px 2px 1px #fff8}.mouth{position:absolute;left:23px;top:42px;width:16px;height:7px;border-bottom:3px solid #33251c;border-radius:0 0 60% 60%}
:host([data-state=happy]) .eye,:host([data-state=joy]) .eye,:host([data-state=success]) .eye,:host([data-state=laugh]) .eye{height:8px;border-radius:60% 60% 0 0;transform:rotate(-8deg)}
:host([data-state=angry]) .eye,:host([data-state=anger]) .eye,:host([data-state=annoyed]) .eye,:host([data-state=disgust]) .eye{transform:rotate(23deg);border-radius:1px;height:7px}
:host([data-state=sad]) .mouth,:host([data-state=sadness]) .mouth,:host([data-state=concerned]) .mouth,:host([data-state=error]) .mouth{transform:rotate(180deg)}
:host([data-state=surprised]) .mouth,:host([data-state=surprise]) .mouth,:host([data-state=fear]) .mouth,:host([data-state=confused]) .mouth{height:11px;width:9px;border:2px solid #33251c;border-radius:50%}
:host([data-state=idle]) .eye,:host([data-state=sleep]) .eye,:host([data-state=sleeping]) .eye,:host([data-state=lookdown]) .eye{height:3px;margin-top:8px}
:host([data-state=thinking]) .face,:host([data-state=curious]) .face{transform:rotate(-12deg)}:host([data-state=smug]) .mouth{transform:rotate(-20deg)}:host([data-state=serious]) .mouth{border-radius:0}
:host([data-state=listening]) .face{transform:rotate(8deg)}:host([data-state=speaking]) .mouth{animation:talk .4s infinite alternate}
@keyframes breathe{50%{translate:0 -3px}}@keyframes talk{to{height:12px}}
.panel{position:absolute;left:0;bottom:90px;width:min(370px,calc(100vw - 32px));height:min(520px,calc(100dvh - 130px));background:var(--paper);border:1px solid var(--shade);border-radius:22px;box-shadow:0 15px 50px #0004;display:flex;flex-direction:column;overflow:hidden;direction:rtl}
.panel[hidden]{display:none}header{display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid var(--sand)}header button{border:0;background:none;font-size:22px;min-width:44px;min-height:44px}.messages{padding:14px;overflow:auto;flex:1;white-space:pre-wrap;line-height:1.9}.messages p{overflow-wrap:anywhere}.user{background:var(--sand);color:#33251c;border-radius:16px;padding:8px}form{display:flex;gap:8px;padding:12px}input{min-width:0;width:100%;border:1px solid var(--shade);border-radius:12px;padding:12px;background:var(--paper);color:var(--ink)}form button,.lead{border:1px solid var(--shade);border-radius:12px;background:var(--sand);color:#33251c;padding:10px;min-height:44px}.lead{margin:0 12px 8px}.notice{font-size:12px;padding:0 14px 8px;margin:0}
@media(prefers-reduced-motion:reduce){*,*:before{animation:none!important;transition:none!important}}`;
  const launch = document.createElement('button'); launch.className = 'launch'; launch.type = 'button';
  launch.setAttribute('aria-label', 'گفت‌وگو با زروان'); launch.setAttribute('aria-expanded','false');
  launch.innerHTML = '<span class="face" aria-hidden="true"><span class="eyes"><i class="eye"></i><i class="eye"></i></span><i class="mouth"></i></span>';
  root.append(style,launch); document.body.append(host);
  const states = ['neutral','idle','listening','thinking','speaking','happy','laugh','curious','surprised','concerned','confused','serious','annoyed','angry','success','error','sleeping','sad','fear','disgust','smug','joy','anger','surprise','sadness','lookdown','sleep'];
  const mood = value => { host.dataset.state = states.includes(value) ? value : 'neutral'; };
  mood('neutral');
  const media = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => { host.dataset.theme = document.documentElement.dataset.theme || (document.documentElement.classList.contains('dark') || media.matches ? 'dark' : 'light'); };
  const observer = new MutationObserver(theme); observer.observe(document.documentElement,{ attributes:true,attributeFilter:['data-theme','class'] }); media.addEventListener('change',theme); theme();
  const app = window.ZurvanAgent;
  let panel, messages, input, send, close, config, pending = false;
  const history = [], conv = crypto.randomUUID().replaceAll('-',''), visitor = crypto.randomUUID().replaceAll('-','');
  const api = async (path, body) => {
   const r = await fetch(base + '/api/widget/public/' + encodeURIComponent(site) + '/' + path, { method: body ? 'POST' : 'GET', mode:'cors',credentials:'omit', headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}) });
   const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || 'اتصال برقرار نشد.'); return j;
  };
  const message = (text, role) => { const p=document.createElement('p'); p.textContent=text; p.className=role; messages.append(p); messages.scrollTop=messages.scrollHeight; };
  const create = async () => {
   panel=document.createElement('section'); panel.className='panel'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','دستیار زروان');
   panel.innerHTML='<header><strong>زروان · راهنمای حضور و غیاب</strong><button type="button" aria-label="بستن">×</button></header><div class="messages" role="log" aria-live="polite"></div><button type="button" class="lead">درخواست تماس با رضایت شما</button><form><input aria-label="پیام شما" maxlength="1000" placeholder="پیام شما…" required><button type="submit">ارسال</button></form><p class="notice">قیمت و قابلیت فقط از دانش تأییدشده؛ تغییر تنظیمات نیازمند تأیید مالک است.</p>';
   root.append(panel); messages=panel.querySelector('.messages'); input=panel.querySelector('input'); send=panel.querySelector('form button'); close=panel.querySelector('header button');
   close.onclick=() => { panel.hidden=true; launch.setAttribute('aria-expanded','false'); launch.focus(); mood('neutral'); };
   panel.onkeydown=e=>{if(e.key==='Escape')close.click();};
   input.oninput=()=>mood('listening');
   panel.querySelector('form').onsubmit=async e=>{
    e.preventDefault(); if(pending || !input.value.trim() || !config?.enabled)return;
    const text=input.value.trim();input.value='';message(text,'user');history.push({role:'user',content:text}); pending=true; send.disabled=true;mood('thinking');
    try { const j=app ? await app.chat(history.slice(-12)) : await api('chat',{conversationId:conv,visitorId:visitor,messages:history.slice(-12),agent:'zurvan',page:{url:location.href,title:document.title}});if(!j.ok)throw new Error('دستیار پاسخ نداد.');const answer=j.text || 'اطلاعات ندارم';message(answer,'assistant');history.push({role:'assistant',content:answer});mood(j.mood || 'speaking'); }
    catch(err){message(unavailable,'assistant');mood('concerned');}finally{pending=false;send.disabled=false;input.focus();}
   };
   if(app){panel.querySelector('strong').textContent='زروان · دستیار راه‌اندازی';panel.querySelector('.lead').textContent='بازبینی و تأیید پیشنهادها توسط مالک';}
   panel.querySelector('.lead').onclick=()=>{
    if(app){app.review();return;}
    if(panel.querySelector('[data-lead]'))return;
    const form=document.createElement('form');form.dataset.lead='1';form.innerHTML='<input name="business" aria-label="نام مجموعه" placeholder="نام مجموعه" maxlength="120" required><input name="phone" aria-label="موبایل" placeholder="موبایل" inputmode="tel" required><button>رضایت و ثبت</button>';
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await api('lead',{business:form.elements.business.value,phone:form.elements.phone.value,conversationId:conv,consent:true});form.remove();message('درخواست تماس ثبت شد.','assistant');mood('success');}catch(err){message(unavailable,'assistant');button.disabled=false;}};panel.insertBefore(form,panel.querySelector('.notice'));
   };
   try {config=app ? {enabled:true} : await api('config');if(!config.enabled)throw new Error('دستیار غیرفعال است.');message(app ? 'سلام، من زروان هستم. چه محصول یا خدمتی می‌فروشید و چند نفر در مجموعه کار می‌کنند؟' : 'سلام، من زروان هستم. دربارهٔ حضور و غیاب چه سؤالی دارید؟','assistant');}
   catch(err){message(unavailable,'assistant');send.disabled=true;mood('concerned');}
  };
  launch.onclick=async()=>{if(!panel){await create();}else panel.hidden=!panel.hidden;launch.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){mood('happy');input.focus();}else mood('neutral');};
  // Local visual QA only; this does not change server routing or authorization.
  host.addEventListener('zurvan:mood',e=>mood(e.detail));
 };
 if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
})();
