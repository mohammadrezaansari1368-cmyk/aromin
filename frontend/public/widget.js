/* ابزارکِ گفت‌وگوی آرومین — بدونِ وابستگی، Shadow DOM، RTL. همهٔ تنظیمات از سرور (فقط siteId در کدِ نصب). */
(function () {
	'use strict'
	var W = window, D = document
	var me = D.currentScript || D.querySelector('script[data-site-id]')
	if (!me) return
	var siteId = me.getAttribute('data-site-id') || ''
	var preview = me.getAttribute('data-preview') // JSONِ تنظیمات برای پیش‌نمایشِ داشبورد (بدونِ تماس با API)
	var KEY = '__arominWidget_' + siteId
	if (W[KEY] || (!siteId && !preview)) return
	W[KEY] = 1
	var BASE = new URL(me.src, location.href).origin
	var API = BASE + '/api/widget/public/' + encodeURIComponent(siteId)
	var TEST = W.ArominWidgetTest || null // فقط صفحهٔ «تست ابزارک» داخلِ داشبورد
	var STORE = 'aromin-widget:' + siteId
	// نسخهٔ همهٔ فایل‌های ابزارک از یک منبع: APP_VERSION (legacy.html) — tools/package_release.py این نشانه را هنگامِ بسته‌سازی می‌نشاند
	var APP_V = '__AROMIN_APP_VERSION__'
	if (APP_V.charAt(0) === '_') APP_V = 'dev'
	var BOT_V = APP_V, AGENT_V = APP_V
	var URL_PREVIEW = /[?&]aromin_preview=1(?:&|$)/.test(location.search) // پیش‌نمایشِ تریگر از تنظیمات: بدونِ رویداد و لید

	function rid() {
		var a = new Uint8Array(12); (W.crypto || W.msCrypto).getRandomValues(a)
		return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2) }).join('').slice(0, 24)
	}
	function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {} } catch (e) { return {} } }
	function save() { try { localStorage.setItem(STORE, JSON.stringify(st)) } catch (e) { /* حالتِ خصوصی */ } }
	var st = preview ? {} : load()
	if (!st.visitorId) st.visitorId = rid()
	if (!st.conversationId) st.conversationId = rid()
	if (!Array.isArray(st.messages)) st.messages = []
	if (!preview && !st.landing) { st.landing = location.href.slice(0, 500); save() } // صفحهٔ ورودِ اولیه (برای لید)

	function req(method, path, body) {
		var h = {}, t = TEST && TEST.headers ? TEST.headers : {}
		for (var k in t) h[k] = t[k]
		if (body) h['Content-Type'] = 'text/plain;charset=UTF-8' // بدونِ preflight
		return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store' })
			.then(function (r) { return r.json().catch(function () { return { ok: false } }).then(function (d) { d.status = r.status; return d }) })
	}

	function fonts() {
		if (D.getElementById('aromin-widget-fonts')) return
		var s = D.createElement('style'); s.id = 'aromin-widget-fonts'
		var ar = 'U+0600-06FF,U+0750-077F,U+200C-200E,U+2010-2011,U+FB50-FDFF,U+FE70-FEFC', la = 'U+0000-00FF,U+2000-206F,U+20AC,U+2122'
		s.textContent = [['arabic', ar], ['latin', la]].map(function (x) {
			return [400, 700].map(function (w) {
				return "@font-face{font-family:'ArominWidget';font-style:normal;font-display:swap;font-weight:" + w + ";src:url(" + BASE + '/widget/fonts/vazirmatn-' + x[0] + '-' + w + ".woff2) format('woff2');unicode-range:" + x[1] + '}'
			}).join('')
		}).join('')
		;(D.head || D.documentElement).appendChild(s)
	}

	function css(c) {
		function pos(p, sel) {
			var side = p.side === 'left' ? 'left' : 'right', other = side === 'left' ? 'right' : 'left'
			return sel + ' .btn{bottom:' + p.bottom + 'px;' + side + ':' + p.offset + 'px;' + other + ':auto}' +
				sel + ' .tease{bottom:' + (p.bottom + 92) + 'px;' + side + ':' + p.offset + 'px;' + other + ':auto}' +
				sel + ' .panel{bottom:' + (p.bottom + 92) + 'px;' + side + ':' + p.offset + 'px;' + other + ':auto;transform-origin:bottom ' + side + '}'
		}
		var col = c.color, ink = '#1f1e1d', mute = '#7a776c', line = '#e8e6dc'
		return ':host{all:initial}*{box-sizing:border-box;margin:0;padding:0;font-family:ArominWidget,Tahoma,sans-serif;letter-spacing:0;line-height:1.7;text-transform:none}' +
			// launcher: the 3D assistant hops (squash & stretch) until the visitor opens the chat once
			'.btn{position:fixed;z-index:2147483000;width:78px;height:78px;border:0;padding:0;cursor:pointer;background:transparent;transform-origin:50% 100%}' +
			'.hop .btn{animation:aw-hop 2.4s cubic-bezier(.3,.7,.4,1) infinite}.btn:hover{animation-play-state:paused}.btn:active{transform:scale(.94)}' +
			'@keyframes aw-hop{0%,46%,100%{transform:translateY(0) scale(1,1)}7%{transform:translateY(0) scale(1.1,.88)}17%{transform:translateY(-26px) scale(.94,1.07)}27%{transform:translateY(0) scale(1.08,.9)}33%{transform:translateY(-8px) scale(1)}39%{transform:translateY(0)}}' +
			'.btn:focus-visible,button:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid ' + col + '55;outline-offset:2px}' +
			'.halo{position:absolute;inset:6px;border-radius:50%;background:' + col + '40;filter:blur(12px);opacity:0;transition:opacity .3s}.busy .halo{opacity:1;animation:awp 2s cubic-bezier(.4,0,.6,1) infinite}@keyframes awp{50%{opacity:.5}}' +
			'.bot,.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}' +
			'.tease{position:fixed;z-index:2147483000;max-width:240px;background:#fff;color:' + ink + ';border:1px solid ' + line + ';border-radius:16px;padding:10px 30px 10px 14px;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.14);cursor:pointer;opacity:0;transform:translateY(8px) scale(.96);transition:opacity .25s,transform .25s;pointer-events:none;direction:rtl}' +
			'.tease.on{opacity:1;transform:none;pointer-events:auto}.tease .tx{position:absolute;top:4px;right:6px;border:0;background:none;color:' + mute + ';font-size:16px;cursor:pointer;width:22px;height:22px}' +
			'.open .tease{display:none}' +
			// the chat page (Claude-like): warm paper, no coloured header, assistant text without a bubble, grey user bubble, round composer with ↑
			'.panel{position:fixed;z-index:2147483001;width:400px;max-width:calc(100vw - 24px);height:min(660px,calc(100vh - 120px));background:#faf9f5;color:' + ink + ';border:1px solid ' + line + ';border-radius:22px;box-shadow:0 24px 64px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;direction:rtl;text-align:right;opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;transition:opacity .18s cubic-bezier(.16,1,.3,1),transform .18s cubic-bezier(.16,1,.3,1)}' +
			'.open .panel{opacity:1;transform:none;pointer-events:auto}' +
			'.head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #eeece5}.hav{width:38px;height:38px;flex:none;object-fit:contain}' +
			'.ht{flex:1;min-width:0}.ht b{display:block;font-size:15px;font-weight:700;line-height:1.4}.ht small{display:block;font-size:11.5px;color:' + mute + ';line-height:1.4}' +
			'.head button{background:transparent;color:#5e5d59;border:0;border-radius:10px;width:36px;height:36px;display:grid;place-items:center;cursor:pointer;flex:none}.head button:hover{background:#efede6}.head svg{width:18px;height:18px}' +
			'.log{flex:1;overflow-y:auto;padding:18px 16px 8px;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain}' +
			'.m{font-size:15px;line-height:1.85;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}' +
			'.m.a{align-self:stretch;color:' + ink + '}.m.u{align-self:flex-end;max-width:85%;background:#f0eee6;border-radius:18px;padding:8px 14px}' +
			'.m.e{align-self:stretch;color:#8a4b00;background:#fdf3e4;border-radius:12px;padding:8px 12px;font-size:13.5px}' +
			'.row{display:flex;gap:10px;align-items:flex-start}.row>img{width:40px;height:40px;flex:none;object-fit:contain}.row .m{flex:1;min-width:0}' +
			'.dots{display:inline-flex;gap:5px;padding:8px 0}.dots i{width:7px;height:7px;border-radius:50%;background:' + col + ';opacity:.35;animation:aw-dot 1.1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}@keyframes aw-dot{40%{opacity:1;transform:translateY(-3px)}}' +
			'.lf{display:grid;gap:8px;background:#fff;border:1px solid ' + line + ';border-radius:16px;padding:12px}.lf input{font:inherit;font-size:15px;border:1px solid #e3e1d8;border-radius:12px;padding:10px 12px;outline:none;background:#fff;color:' + ink + ';direction:rtl}' +
			'.lf input:focus{border-color:' + col + ';box-shadow:0 0 0 3px ' + col + '22}.lf button{font:inherit;font-size:15px;font-weight:700;border:0;border-radius:12px;padding:11px;background:' + col + ';color:#fff;cursor:pointer}.lf button:disabled{opacity:.55}.lf .er{color:#b42318;font-size:12.5px}' +
			'form.c{margin:6px 12px 6px;display:flex;align-items:flex-end;gap:8px;background:#fff;border:1px solid #e3e1d8;border-radius:22px;padding:8px;box-shadow:0 1px 4px rgba(0,0,0,.05)}form.c:focus-within{border-color:#c9c6ba}' +
			'form.c textarea{flex:1;resize:none;border:0;outline:none;background:transparent;font-size:15px;padding:6px;max-height:140px;min-height:36px;color:' + ink + ';direction:rtl}' +
			'form.c button{width:36px;height:36px;border-radius:12px;border:0;background:' + col + ';color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}form.c button:disabled{opacity:.35;cursor:default}form.c button svg{width:18px;height:18px}' +
			'.foot{text-align:center;font-size:11px;color:#9a978c;padding:0 0 8px}' +
			pos(c.desktop, '') +
			'@media (max-width:520px){' + pos(c.mobile, '') +
			'.panel{inset:0!important;width:100%;max-width:none;height:100%;height:100dvh;border-radius:0;border:0}.head{padding-top:max(12px,env(safe-area-inset-top))}.foot{padding-bottom:max(8px,env(safe-area-inset-bottom))}.open .btn{display:none}}' +
			'@media (prefers-reduced-motion:reduce){.panel,.btn,.tease{transition:none}.hop .btn,.busy .halo,.dots i{animation:none}}'
	}

	var UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
	var NEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
	// 3.9.81: the assistant's 3D reactions (rendered from the dashboard's 3D model) — no emoji anywhere
	function FACE(k) { return BASE + '/agent/' + k + '.webp' }
	var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'

	function mount(c) {
		fonts()
		var host = D.createElement('aromin-chat-widget')
		host.setAttribute('style', 'all:initial!important;position:static!important;display:block!important')
		var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
		root.innerHTML = '<style>' + css(c) + '</style><div class="w" dir="rtl">' +
			'<div class="panel" role="dialog" aria-modal="false" aria-label=""><div class="head"><img class="hav" alt="" aria-hidden="true" src="' + FACE('listening') + '"><div class="ht"><b></b><small>معمولاً در چند ثانیه پاسخ می‌دهد</small></div>' +
			'<button type="button" class="new" title="گفت‌وگوی تازه" aria-label="گفت‌وگوی تازه">' + NEW + '</button><button type="button" class="x" aria-label="بستن">' + CLOSE + '</button></div>' +
			'<div class="log" aria-live="polite"></div><form class="c"><textarea rows="1" placeholder="پیامتان را بنویسید…" aria-label="پیام"></textarea><button type="submit" aria-label="ارسال">' + UP + '</button></form><div class="foot">دستیارِ هوشمندِ آرومین</div></div>' +
			'<div class="tease" role="status"><span class="tt"></span><button type="button" class="tx" aria-label="بستن">×</button></div>' +
			'<button type="button" class="btn" aria-expanded="false" aria-label=""><span class="halo" aria-hidden="true"></span><img class="ph" alt="" aria-hidden="true" src="' + FACE('joy') + '"><span class="bot" aria-hidden="true"></span></button></div>'
		;(D.body || D.documentElement).appendChild(host)
		var $ = function (s) { return root.querySelector(s) }
		var w = $('.w'), btn = $('.btn'), log = $('.log'), ta = $('textarea'), send = $('form button'), chatForm = $('form')   // captured before the lead form (3.9.80) is added to the log
		$('.ht b').textContent = c.title
		$('.panel').setAttribute('aria-label', c.title)
		btn.setAttribute('aria-label', 'گفت‌وگو با ' + c.title)
		var busy = false, bot = null, ag = null
		function emit(ev, t) { if (ag) try { ag.emit(ev, t) } catch { /* دستیار نباید ابزارک را خراب کند */ } }
		function track(ev, props) { if (!preview && !URL_PREVIEW && c.agent) req('POST', '/event', { event: ev, props: props || {} }).catch(function () { /* بی‌صدا */ }) }
		function status(v) { w.classList.toggle('busy', v !== 'idle'); if (bot) bot.setStatus(v) }
		function loadBot() {
			var still = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches
			var go = function () { try { bot = W.ArominWidgetBot.mount($('.bot'), btn, { color: c.color, still: still }); $('.ph').remove(); if (busy) bot.setStatus('thinking') } catch (e) { /* بدونِ WebGL: همان جانگه‌دارِ داشبورد می‌ماند */ } }
			if (W.ArominWidgetBot) return go()
			var s = D.createElement('script'); s.src = BASE + '/widget-bot.js?v=' + BOT_V; s.async = true; s.onload = go
			;(D.head || D.documentElement).appendChild(s)
		}
		// ربات سه‌بعدی (~۳۰۸KB gzip) هنگامِ بارِ صفحه بار نمی‌شود: فقط با باز شدنِ ابزارک یا اولین تعامل با خودِ ابزارک
		// (اشاره‌گر، لمس، فوکوس یا کلید روی دکمه/پنل). اسکرول یا کلیک در جای دیگرِ صفحه آن را بار نمی‌کند؛ تا آن موقع جانگه‌دار.
		var botWanted = false
		function needBot() { if (botWanted) return; botWanted = true; loadBot() }
		// فقط دکمه و پنل؛ حبابِ پاپ‌آپ (داخلِ .w) ربات را بار نمی‌کند — با «باز شدنِ پنل» بار می‌شود
		;[btn, $('.panel')].forEach(function (el) { ['pointerenter', 'pointerdown', 'touchstart', 'focusin', 'keydown'].forEach(function (ev) { el.addEventListener(ev, needBot, { once: true, passive: true }) }) })

		function bubble(role, text, face) {
			var d = D.createElement('div'); d.className = 'm ' + role; d.textContent = text
			var el = d
			if (face) { el = D.createElement('div'); el.className = 'row'; var im = D.createElement('img'); im.src = FACE(face); im.alt = ''; im.setAttribute('aria-hidden', 'true'); el.appendChild(im); el.appendChild(d) }
			log.appendChild(el); log.scrollTop = log.scrollHeight; return el
		}
		// 3.9.80: first goal = business name + mobile → straight to a sales rep (/lead); the chat stays open for questions
		var OPENER = 'سلام! خوش آمدید. برای اینکه کارشناسِ آرومین دقیق و رایگان راهنمایی‌تان کند، اسمِ مجموعه و شمارهٔ موبایل‌تان را بنویسید.'
		function leadForm() {
			var f = D.createElement('form'); f.className = 'lf'
			f.innerHTML = '<input name="b" autocomplete="organization" placeholder="اسمِ مجموعه (کافه، رستوران، فروشگاه…)" maxlength="120" required>' +
				'<input name="p" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="شمارهٔ موبایل ۰۹…" maxlength="16" required>' +
				'<button type="submit">ثبت و تماسِ کارشناس</button><span class="er" role="alert"></span>'
			f.addEventListener('submit', function (e) {
				e.preventDefault()
				var b = f.querySelector('[name=b]').value.trim(), p = f.querySelector('[name=p]').value.trim(), bt = f.querySelector('button'), er = f.querySelector('.er')
				if (!b || !p) return
				if (preview) { f.remove(); bubble('a', 'پیش‌نمایش: لید ثبت نمی‌شود.'); return }
				bt.disabled = true; er.textContent = ''
				req('POST', '/lead', { business: b, phone: p, conversationId: st.conversationId, page: { url: location.href.slice(0, 500) } })
					.then(function (d) {
						if (d && d.ok) { st.lead = true; save(); f.remove(); bubble('a', 'ممنون! کارشناسانِ آرومین به‌زودی با شما تماس می‌گیرند. اگر سؤالی دارید همین‌جا بپرسید.', 'joy'); emit('lead'); track('lead_form') }
						else { er.textContent = (d && d.error) || 'ثبت نشد؛ دوباره امتحان کنید.'; bt.disabled = false }
					})
					.catch(function () { er.textContent = 'اتصال برقرار نشد؛ دوباره امتحان کنید.'; bt.disabled = false })
			})
			log.appendChild(f)
		}
		function render() {
			log.textContent = ''
			bubble('a', st.lead ? c.welcome : OPENER, st.lead ? 'listening' : 'joy')
			if (!st.lead && !st.messages.length) leadForm()
			st.messages.forEach(function (m) { bubble(m.role === 'user' ? 'u' : 'a', m.content) })
		}
		function toggle(v) {
			var o = v === undefined ? !w.classList.contains('open') : v
			w.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o))
			st.open = o; if (o) { st.seen = 1; w.classList.remove('hop'); tease.classList.remove('on') } if (!preview) save()
			if (o) needBot()
			emit(o ? 'open' : 'close'); if (o) track('widget_opened')
			if (o) setTimeout(function () { var i = root.querySelector('.lf input'); (i || ta).focus() }, 60)
		}
		btn.onclick = function () { toggle() }
		var tease = $('.tease')
		if (!st.seen) w.classList.add('hop')
		var teaseOff = false
		try { teaseOff = sessionStorage.getItem(STORE + ':tease') === '0' } catch (e) { /* حالتِ خصوصی */ }
		if (!st.seen && !teaseOff) setTimeout(function () {
			if (w.classList.contains('open') || root.querySelector('.ag-pop.on')) return
			$('.tt').textContent = 'سلام! برای مشاورهٔ رایگان اینجا بزنید.'; tease.classList.add('on')
		}, 2500)
		tease.onclick = function (e) { if (e.target.className === 'tx') { tease.classList.remove('on'); try { sessionStorage.setItem(STORE + ':tease', '0') } catch (x) { /* */ } return } toggle(true) }
		$('.x').onclick = function () { toggle(false); btn.focus() }
		$('.new').onclick = function () { st.messages = []; st.conversationId = rid(); st.agent = ''; if (!preview) save(); render() }
		root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toggle(false); btn.focus() } })
		ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit ? chatForm.requestSubmit() : submit(e) } })
		ta.addEventListener('input', function () { emit('typing'); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px' })
		function submit(e) {
			e.preventDefault()
			var text = ta.value.trim()
			if (!text || busy) return
			ta.value = ''; ta.style.height = ''
			st.messages.push({ role: 'user', content: text.slice(0, 1000) }); st.messages = st.messages.slice(-40)
			bubble('u', text)
			if (preview) { bubble('a', 'این پیش‌نمایش است؛ پاسخِ واقعی بعد از نصب روی سایت نمایش داده می‌شود.'); return }
			save(); busy = true; send.disabled = true; status('thinking'); emit('send')
			var wait = bubble('a t', ''); wait.innerHTML = '<span class="dots" aria-label="در حالِ نوشتن"><i></i><i></i><i></i></span>'
			req('POST', '/chat', { conversationId: st.conversationId, visitorId: st.visitorId, messages: st.messages.slice(-12), consent: !!st.consent, preview: URL_PREVIEW || undefined, agent: st.agent || undefined, page: { url: location.href.slice(0, 500), title: D.title.slice(0, 200), landing: st.landing } })
				.then(function (d) {
					wait.remove()
					if (d.ok && d.text) { st.messages.push({ role: 'assistant', content: String(d.text) }); if (d.agent && /^[a-z_]{2,20}$/.test(d.agent.key)) st.agent = d.agent.key; save(); bubble('a', String(d.text)); emit(d.lead && d.lead.ok ? 'lead' : 'reply', String(d.text)) }
					else { bubble('e', d.error || 'ارسال نشد؛ دوباره امتحان کنید.', 'sadness'); emit(d.status === 429 ? 'rateLimit' : 'error') }
				})
				.catch(function () { wait.remove(); bubble('e', 'اتصال برقرار نشد؛ دوباره امتحان کنید.', 'sadness'); emit('offline') })
				.then(function () { busy = false; send.disabled = false; status('idle'); ta.focus() })
		}
		chatForm.addEventListener('submit', submit)
		render()
		if (st.open || me.getAttribute('data-open') === '1') toggle(true)
		function loadAgent() { // تنبل، پس از بارِ صفحه (بدونِ اثر بر LCP/INP)؛ خطا → همان ابزارکِ قبلی
			var go = function () {
				try {
					ag = W.ArominAgent.start({ root: root, cfg: c.agent, key: siteId, pos: (W.innerWidth < 640 ? c.mobile : c.desktop) || {},
						open: function () { toggle(true) }, isOpen: function () { return w.classList.contains('open') },
						setWelcome: function (t) { c.welcome = t; render() }, consent: !!st.consent,
						setConsent: function (v) { st.consent = !!v; if (!preview) save() }, track: track })
					W.ArominAgentWidget = ag
				} catch { ag = null }
			}
			if (W.ArominAgent) return go()
			var s = D.createElement('script'); s.src = BASE + '/widget-agent.js?v=' + AGENT_V; s.async = true; s.onload = go
			;(D.head || D.documentElement).appendChild(s)
		}
		if (c.agent) (W.requestIdleCallback || function (f) { setTimeout(f, 1200) })(loadAgent)
		return host
	}

	if (preview) { try { mount(JSON.parse(preview)) } catch (e) { /* تنظیماتِ نامعتبر */ } return }
	var go = function () {
		var mounted = st.cfg && st.cfg.enabled ? mount(st.cfg) : null, tries = 0
		var fetchCfg = function () {
			req('GET', '/config').then(function (c) {
				if (!c || !c.ok) return
				st.cfg = c; save()
				if (c.enabled && !mounted) mounted = mount(c)
				else if (!c.enabled && mounted) { mounted.remove(); mounted = null }
			}).catch(function () { if (++tries < 3) setTimeout(fetchCfg, 1500 * tries) }) // بی‌صدا: سایت نباید خراب شود
		}
		fetchCfg()
	}
	if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', go); else go()
})()
