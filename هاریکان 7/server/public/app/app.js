// اپلیکیشن پرسنل آرومین — بدون فریم‌ورک، روی همه گوشی‌ها
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem('aromin:' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('aromin:' + k) : localStorage.setItem('aromin:' + k, v); } catch { /* */ } },
};
const deviceId = store.get('device') || (() => { const id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); store.set('device', id); return id; })();
const platform = /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'web';
let token = store.get('token');
let me = null;

function toast(text, type = '') {
  const t = $('#toast'); t.textContent = text; t.className = `show ${type}`;
  clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, 3500);
}
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); throw new Error(j.error || 'دوباره وارد شوید'); }
  if (!r.ok) throw new Error(j.error || 'خطا در ارتباط با سرور');
  return j;
}
const show = (id) => { $('#login').classList.toggle('hidden', id !== 'login'); $('#main').classList.toggle('hidden', id !== 'main'); };
function logout() { token = null; store.set('token', null); show('login'); }

// ───────── ورود
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api('/auth/login', { method: 'POST', body: f });
    if (r.user.role !== 'employee') throw new Error('این اپلیکیشن مخصوص پرسنل است؛ مدیر از پنل وارد شود');
    token = r.token; store.set('token', token); start();
  } catch (err) { toast(err.message, 'err'); }
});
$('#logout').onclick = logout;

// ───────── تب‌ها
$$('nav button').forEach((b) => b.addEventListener('click', () => {
  $$('nav button').forEach((x) => x.classList.toggle('on', x === b));
  $$('[data-tab]').forEach((s) => s.classList.toggle('hidden', s.dataset.tab !== b.dataset.go));
  ({ requests: loadRequests, messages: loadMessages, profile: loadProfile }[b.dataset.go] || load)();
}));

setInterval(() => { $('#now').textContent = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); }, 1000);

// ───────── خانه
async function load() {
  me = await api('/app/me');
  $('#hello').textContent = me.name;
  $('#today').textContent = `امروز ${me.date}${me.shiftToday ? ` — شیفت ${me.shiftToday[0]} تا ${me.shiftToday[1]}` : ' — بدون شیفت'}`;
  const b = $('#clockBtn'); b.textContent = me.isIn ? 'ثبت خروج' : 'ثبت ورود'; b.classList.toggle('out', me.isIn);
  $('#clockHint').textContent = me.workplace ? `محل کار: ${me.workplace.name}` : 'محل کار تعریف نشده است';
  const sel = $('#project');
  sel.classList.toggle('hidden', !me.projects.length || me.isIn);
  sel.innerHTML = '<option value="">بدون پروژه</option>' + me.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#todayList').innerHTML = me.today.length
    ? me.today.map((a) => `<div class="row"><span>ورود ${esc(a.in)}</span><span>${a.out ? 'خروج ' + esc(a.out) : '<span class="tag warn">در محل کار</span>'}</span></div>`).join('')
    : '<p class="muted">هنوز ترددی ثبت نشده است.</p>';
  const m = me.month;
  $('#monthStats').innerHTML = [['حضور', m.inShift], ['اضافه‌کاری', m.overtime], ['کسری', m.absent], ['روز کارکرد', m.workDays], ['تأخیر', m.late], ['مرخصی', m.earned + ' روز']]
    .map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${esc(v)}</b></div>`).join('');
  const u = $('#unread'); u.textContent = me.unread; u.classList.toggle('hidden', !me.unread);
  if (me.tracking) startTracking();
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('مرورگر شما موقعیت‌یابی ندارد'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'اجازه دسترسی به موقعیت مکانی داده نشد. از تنظیمات مرورگر Location را فعال کنید.' : 'موقعیت مکانی پیدا نشد؛ GPS گوشی را روشن کنید و دوباره امتحان کنید.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

$('#clockBtn').addEventListener('click', async () => {
  const b = $('#clockBtn'); b.disabled = true; const label = b.textContent; b.textContent = 'در حال یافتن موقعیت…';
  try {
    const pos = await getPosition();
    b.textContent = 'در حال ثبت…';
    const r = await api('/app/clock', { method: 'POST', body: { ...pos, deviceId, platform, project: $('#project').value || null, source: platform } });
    toast(r.action === 'in' ? `ورود ساعت ${r.time} ثبت شد${r.late ? ` (${r.late} دقیقه تأخیر)` : ''}` : `خروج ساعت ${r.time} ثبت شد`, 'ok');
    await load();
  } catch (e) { toast(e.message, 'err'); b.textContent = label; } finally { b.disabled = false; }
});

let tracking = null;
function startTracking() {
  if (tracking || !navigator.geolocation) return;
  const send = () => me?.isIn && getPosition().then((p) => api('/app/location', { method: 'POST', body: p })).catch(() => {});
  send(); tracking = setInterval(send, 5 * 60 * 1000);
}

// ───────── درخواست‌ها
const statusTag = (s) => `<span class="tag ${s === 'تایید شده' ? 'ok' : s === 'رد شده' ? 'err' : 'warn'}">${esc(s)}</span>`;
async function loadRequests() {
  const [types, list, m] = await Promise.all([api('/app/request-types'), api('/app/requests'), me ? me : api('/app/me')]);
  me = m;
  $('#reqKind').innerHTML = types.map((t) => `<option>${esc(t)}</option>`).join('');
  $('#reqForm').from.placeholder = me.date;
  const l = me.leave;
  $('#leaveStats').innerHTML = [['مانده ماه', l.mr], ['مانده سال', l.yr], ['استفاده سال', l.yu]].map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${v}</b></div>`).join('');
  $('#reqList').innerHTML = list.length ? list.map((r) => `<div class="row"><div><b>${esc(r.kind)}</b><div class="muted">${esc(r.from)}${r.to && r.to !== r.from ? ' تا ' + esc(r.to) : ''}${r.fromTime ? ` (${esc(r.fromTime)}-${esc(r.toTime)})` : ''}</div></div>
    <div style="display:flex;gap:6px;align-items:center">${statusTag(r.status)}${r.status === 'در دست بررسی' ? `<button class="tag" data-cancel="${esc(r.id)}">لغو</button>` : ''}</div></div>`).join('')
    : '<p class="muted">درخواستی ثبت نکرده‌اید.</p>';
  $$('[data-cancel]').forEach((b) => b.onclick = async () => { try { await api('/app/requests/' + b.dataset.cancel, { method: 'DELETE' }); toast('لغو شد', 'ok'); loadRequests(); } catch (e) { toast(e.message, 'err'); } });
}
$('#reqForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  Object.keys(f).forEach((k) => { if (!f[k]) delete f[k]; });
  try { await api('/app/requests', { method: 'POST', body: f }); e.target.reset(); toast('درخواست ثبت شد و پس از تایید مدیر اعمال می‌شود', 'ok'); loadRequests(); }
  catch (err) { toast(err.message, 'err'); }
});

// ───────── پیام‌ها
async function loadMessages() {
  const list = await api('/app/messages');
  $('#msgList').innerHTML = list.length ? list.map((m) => `<div class="row msg ${m.read ? '' : 'unread'}" data-id="${esc(m.id)}"><div><b>${esc(m.title)}</b><div class="muted body hidden" style="white-space:pre-wrap;margin-top:6px">${esc(m.body)}</div></div><span class="muted">${esc(m.date)}</span></div>`).join('')
    : '<p class="muted">پیامی ندارید.</p>';
  $$('.msg').forEach((el) => el.onclick = async () => {
    el.querySelector('.body').classList.toggle('hidden');
    if (el.classList.contains('unread')) { el.classList.remove('unread'); await api(`/app/messages/${el.dataset.id}/read`, { method: 'POST' }).catch(() => {}); }
  });
}

// ───────── پروفایل
async function loadProfile() {
  me = await api('/app/me');
  $('#profileCard').innerHTML = `<h2>${esc(me.name)}</h2>
    <div class="row"><span class="muted">کد پرسنلی</span><span>${esc(me.code)}</span></div>
    <div class="row"><span class="muted">عنوان شغلی</span><span>${esc(me.jobTitle || '—')}</span></div>
    <div class="row"><span class="muted">محل کار</span><span>${esc(me.workplace?.name || '—')}</span></div>
    <div class="row"><span class="muted">شیفت</span><span>${esc(me.shift || '—')}</span></div>`;
  const hist = await api('/app/attendance');
  $('#history').innerHTML = hist.slice(0, 20).map((a) => `<div class="row"><span>${esc(a.date)}</span><span style="direction:ltr">${esc(a.in)} → ${esc(a.out || '…')}</span></div>`).join('') || '<p class="muted">—</p>';
}
$('#pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/app/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('رمز عبور تغییر کرد', 'ok'); }
  catch (err) { toast(err.message, 'err'); }
});

// ───────── شروع
async function start() { show('main'); try { await load(); } catch (e) { toast(e.message, 'err'); } }
if (token) start(); else show('login');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
