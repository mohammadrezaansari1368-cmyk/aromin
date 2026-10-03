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
	var BOT_V = '3.9.25' // با هر تغییرِ رباتِ سه‌بعدی بالا برود: نشانیِ تازه = بدونِ کشِ کهنهٔ CDN

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
				sel + ' .panel{bottom:' + (p.bottom + 84) + 'px;' + side + ':' + p.offset + 'px;' + other + ':auto;transform-origin:bottom ' + side + '}'
		}
		var col = c.color
		return ':host{all:initial}*{box-sizing:border-box;margin:0;padding:0;font-family:ArominWidget,Tahoma,sans-serif;letter-spacing:0;line-height:1.7;text-transform:none}' +
			'.btn{position:fixed;z-index:2147483000;width:72px;height:72px;border-radius:50%;border:0;padding:0;cursor:pointer;background:transparent;transition:transform .15s cubic-bezier(.4,0,.2,1)}.btn:active{transform:scale(.95)}' +
			'.btn:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid ' + col + '55;outline-offset:2px}' +
			'.halo{position:absolute;inset:4px;border-radius:50%;background:' + col + '40;filter:blur(12px);opacity:0;transition:opacity .3s}.busy .halo{opacity:1;animation:awp 2s cubic-bezier(.4,0,.6,1) infinite}@keyframes awp{50%{opacity:.5}}' +
			'.bot,.ph{position:absolute;inset:0}.ph{inset:8px;border-radius:50%;background:' + col + ';box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}' +
			'.panel{position:fixed;z-index:2147483001;width:370px;max-width:calc(100vw - 24px);height:min(600px,calc(100vh - 120px));background:#fff;color:#1f1a1e;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;direction:rtl;text-align:right;opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;transition:opacity .24s cubic-bezier(.16,1,.3,1),transform .24s cubic-bezier(.16,1,.3,1)}' +
			'.open .panel{opacity:1;transform:none;pointer-events:auto}' +
			'.head{background:' + col + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:8px}.head b{flex:1;font-size:15px;font-weight:700}' +
			'.head button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:10px;min-width:32px;height:32px;padding:0 8px;cursor:pointer;font-size:12px}' +
			'.log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f7f5f7}' +
			'.m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}' +
			'.m.a{align-self:flex-start;background:#fff;border:1px solid #eee;border-bottom-right-radius:4px}.m.u{align-self:flex-end;background:' + col + ';color:#fff;border-bottom-left-radius:4px}' +
			'.m.e{align-self:center;background:#fff4e5;color:#8a4b00;font-size:12.5px}.m.t{color:#888}' +
			'form{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}' +
			'textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:12px;padding:8px 10px;font-size:14px;max-height:110px;min-height:42px;background:#fff;color:#1f1a1e;direction:rtl}' +
			'form button{border:0;border-radius:12px;background:' + col + ';color:#fff;min-width:64px;font-size:14px;font-weight:700;cursor:pointer}form button:disabled{opacity:.5;cursor:default}' +
			pos(c.desktop, '') +
			'@media (max-width:520px){' + pos(c.mobile, '') +
			'.panel{inset:0!important;width:100%;max-width:none;height:100%;height:100dvh;border-radius:0}.open .btn{display:none}}' +
			'@media (prefers-reduced-motion:reduce){.panel,.btn{transition:none}.busy .halo{animation:none}}'
	}

	var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'

	function mount(c) {
		fonts()
		var host = D.createElement('aromin-chat-widget')
		host.setAttribute('style', 'all:initial!important;position:static!important;display:block!important')
		var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
		root.innerHTML = '<style>' + css(c) + '</style><div class="w" dir="rtl">' +
			'<div class="panel" role="dialog" aria-modal="false" aria-label=""><div class="head"><b></b><button type="button" class="new" title="گفت‌وگوی تازه">تازه</button><button type="button" class="x" aria-label="بستن">' + CLOSE + '</button></div>' +
			'<div class="log" aria-live="polite"></div><form><textarea rows="1" placeholder="پیامتان را بنویسید…" aria-label="پیام"></textarea><button type="submit">ارسال</button></form></div>' +
			'<button type="button" class="btn" aria-expanded="false" aria-label=""><span class="halo" aria-hidden="true"></span><span class="ph" aria-hidden="true"></span><span class="bot" aria-hidden="true"></span></button></div>'
		;(D.body || D.documentElement).appendChild(host)
		var $ = function (s) { return root.querySelector(s) }
		var w = $('.w'), btn = $('.btn'), log = $('.log'), ta = $('textarea'), send = $('form button')
		$('.head b').textContent = c.title
		$('.panel').setAttribute('aria-label', c.title)
		btn.setAttribute('aria-label', 'گفت‌وگو با ' + c.title)
		var busy = false, bot = null
		function status(v) { w.classList.toggle('busy', v !== 'idle'); if (bot) bot.setStatus(v) }
		function loadBot() {
			var still = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches
			var go = function () { try { bot = W.ArominWidgetBot.mount($('.bot'), btn, { color: c.color, still: still }); $('.ph').remove(); if (busy) bot.setStatus('thinking') } catch (e) { /* بدونِ WebGL: همان جانگه‌دارِ داشبورد می‌ماند */ } }
			if (W.ArominWidgetBot) return go()
			var s = D.createElement('script'); s.src = BASE + '/widget-bot.js?v=' + BOT_V; s.async = true; s.onload = go
			;(D.head || D.documentElement).appendChild(s)
		}
		loadBot()

		function bubble(role, text) {
			var d = D.createElement('div'); d.className = 'm ' + role; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d
		}
		function render() {
			log.textContent = ''
			bubble('a', c.welcome)
			st.messages.forEach(function (m) { bubble(m.role === 'user' ? 'u' : 'a', m.content) })
		}
		function toggle(v) {
			var o = v === undefined ? !w.classList.contains('open') : v
			w.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o))
			st.open = o; if (!preview) save()
			if (o) setTimeout(function () { ta.focus() }, 60)
		}
		btn.onclick = function () { toggle() }
		$('.x').onclick = function () { toggle(false); btn.focus() }
		$('.new').onclick = function () { st.messages = []; st.conversationId = rid(); if (!preview) save(); render() }
		root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toggle(false); btn.focus() } })
		ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form').requestSubmit ? $('form').requestSubmit() : submit(e) } })
		ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px' })
		function submit(e) {
			e.preventDefault()
			var text = ta.value.trim()
			if (!text || busy) return
			ta.value = ''; ta.style.height = ''
			st.messages.push({ role: 'user', content: text.slice(0, 1000) }); st.messages = st.messages.slice(-40)
			bubble('u', text)
			if (preview) { bubble('a', 'این پیش‌نمایش است؛ پاسخِ واقعی بعد از نصب روی سایت نمایش داده می‌شود.'); return }
			save(); busy = true; send.disabled = true; status('thinking')
			var wait = bubble('a t', '…')
			req('POST', '/chat', { conversationId: st.conversationId, visitorId: st.visitorId, messages: st.messages.slice(-12), page: { url: location.href.slice(0, 500), title: D.title.slice(0, 200), landing: st.landing } })
				.then(function (d) {
					wait.remove()
					if (d.ok && d.text) { st.messages.push({ role: 'assistant', content: String(d.text) }); save(); bubble('a', String(d.text)) }
					else bubble('e', d.error || 'ارسال نشد؛ دوباره امتحان کنید.')
				})
				.catch(function () { wait.remove(); bubble('e', 'اتصال برقرار نشد؛ دوباره امتحان کنید.') })
				.then(function () { busy = false; send.disabled = false; status('idle'); ta.focus() })
		}
		$('form').addEventListener('submit', submit)
		render()
		if (st.open || me.getAttribute('data-open') === '1') toggle(true)
	}

	if (preview) { try { mount(JSON.parse(preview)) } catch (e) { /* تنظیماتِ نامعتبر */ } return }
	var go = function () { req('GET', '/config').then(function (c) { if (c && c.ok && c.enabled) mount(c) }).catch(function () { /* بی‌صدا: سایت نباید خراب شود */ }) }
	if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', go); else go()
})()
