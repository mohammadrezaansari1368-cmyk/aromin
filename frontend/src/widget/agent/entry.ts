/**
 * widget-agent.js: لایهٔ «دستیارِ آرومین» روی ابزارکِ سایت (public/widget.js آن را تنبل و فقط وقتی دستیار در تنظیمات روشن است بار می‌کند).
 * چهرهٔ احساسی + پاپ‌آپِ پیش‌فعال + سلامِ ساعت‌محور + سقف/فاصله + تیکِ رضایت. هیچ PII/توکنی ذخیره یا ارسال نمی‌شود.
 */
import { EmotionController, firstMatch, greetingFor, canShow, recordShow, recordDismiss, newGate, countsAsInteraction, isPreviewUrl, type AgentEvent, type Caps, type Ctx, type EmotionState, type Gate, type Greetings, type Trigger } from './core'
import { FACE_SVG, FACE_CSS, applyState } from './face'

export type AgentCfg = { emotion: boolean; proactive: boolean; greetings: Greetings; caps: Caps; triggers: Trigger[]; consentText?: string }
export type Host = {
	root: ShadowRoot | HTMLElement; cfg: AgentCfg; key: string; pos?: { side?: string; bottom?: number; offset?: number }
	open: () => void; isOpen: () => boolean; setWelcome: (t: string) => void; setConsent: (v: boolean) => void; consent: boolean
	track: (event: string, props?: Record<string, string>) => void
}

const CSS = FACE_CSS + `
.ag-face{width:30px;height:30px;flex:0 0 30px;margin-inline-end:8px}
.ag-pop{position:fixed;z-index:2147483001;max-width:min(280px,calc(100vw - 32px));display:flex;gap:10px;align-items:flex-start;
 background:#fff;color:#1d1d1f;border-radius:14px;padding:12px 12px 12px 30px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:14px/1.7 inherit;
 opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none}
.ag-pop.on{opacity:1;transform:none;pointer-events:auto}.ag-pop .ag-face{width:40px;height:40px;flex-basis:40px;margin:0}
.ag-pop p{margin:0;cursor:pointer}.ag-pop button{position:absolute;top:6px;left:8px;border:0;background:none;font-size:16px;cursor:pointer;color:#666;padding:2px 6px}
.ag-consent{display:flex;gap:6px;align-items:center;font-size:11px;color:#666;padding:4px 12px 0}
@media (max-width:480px){.ag-pop{max-width:calc(100vw - 24px)}}
@media (prefers-reduced-motion:reduce){.ag-pop{transition:none}}
.af.paused,.af.paused *{animation-play-state:paused!important}
`

export function start(h: Host) {
	const R = h.root, W = window, $ = (s: string) => R.querySelector(s) as HTMLElement | null
	const st = document.createElement('style'); st.textContent = CSS; R.appendChild(st)
	const faces: HTMLElement[] = []
	const mk = (parent: Element | null, before = true) => {
		if (!parent || !h.cfg.emotion) return
		const s = document.createElement('span'); s.className = 'ag-face'; s.innerHTML = FACE_SVG
		if (before) parent.prepend(s)
		else parent.appendChild(s)
		const face = s.querySelector('.af') as HTMLElement; faces.push(face); applyState(face, 'neutral')
	}
	// widget.js already has the 3D avatar in the header (3.9.81) — drive it instead of adding a second face
	const hav = $('.hav')
	if (hav && h.cfg.emotion) { faces.push(hav); applyState(hav, 'neutral') } else mk($('.head'))
	const emo = new EmotionController((s: EmotionState) => faces.forEach((f) => applyState(f, s)))
	const greeting = greetingFor(h.cfg.greetings || {})
	h.setWelcome(greeting)

	// تیکِ رضایت (پیش‌فرض خاموش) — فقط برای استفادهٔ بدونِ PII در بهبودِ دستیار
	const form = $('form')
	if (form && h.cfg.consentText) {
		const l = document.createElement('label'); l.className = 'ag-consent'
		const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!h.consent; cb.onchange = () => h.setConsent(cb.checked)
		l.append(cb, document.createTextNode(h.cfg.consentText)); form.after(l)
	}

	// نگاه به اشاره‌گر (فقط دسکتاپ و بدونِ reduced-motion)، throttle با rAF
	const still = W.matchMedia?.('(prefers-reduced-motion: reduce)').matches
	if (!still && W.matchMedia?.('(pointer:fine)').matches) {
		let raf = 0
		W.addEventListener('pointermove', (e) => {
			if (raf) return
			raf = requestAnimationFrame(() => {
				raf = 0
				const gx = Math.max(-2, Math.min(2, (e.clientX / W.innerWidth - 0.5) * 4)), gy = Math.max(-2, Math.min(2, (e.clientY / W.innerHeight - 0.5) * 4))
				faces.forEach((f) => { f.style.setProperty('--gx', gx.toFixed(1) + 'px'); f.style.setProperty('--gy', gy.toFixed(1) + 'px') })
			})
		}, { passive: true })
	}

	// ---- پاپ‌آپِ پیش‌فعال ----
	const GK = 'aromin-agent-gate:' + h.key, SK = 'aromin-agent-session:' + h.key, VK = 'aromin-agent-seen:' + h.key
	const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* خصوصی */ } } }
	const ss = { get: (k: string) => { try { return Number(sessionStorage.getItem(k) || 0) } catch { return 0 } }, set: (k: string, v: number) => { try { sessionStorage.setItem(k, String(v)) } catch { /* خصوصی */ } } }
	let gate: Gate = newGate()
	try { gate = { ...gate, ...JSON.parse(ls.get(GK) || '{}') } } catch { /* خراب */ }
	const returning = ls.get(VK) === '1'; ls.set(VK, '1')
	const t0 = Date.now(), fired = new Set<string>(), clicked: string[] = [], manual: string[] = []
	const preview = isPreviewUrl(location.search)
	let interacted = false
	let pop: HTMLElement | null = null, timer = 0
	// پنهان بودنِ تب: انیمیشنِ چهره متوقف، تریگرها بررسی نمی‌شوند و زمانِ پنهان در «ثانیه‌های حضور» شمرده نمی‌شود
	let hiddenAt = document.hidden ? Date.now() : 0, hiddenMs = 0
	const onVis = () => {
		if (document.hidden) hiddenAt = Date.now()
		else if (hiddenAt) { hiddenMs += Date.now() - hiddenAt; hiddenAt = 0 }
		faces.forEach((f) => f.classList.toggle('paused', document.hidden))
	}
	document.addEventListener('visibilitychange', onVis)
	onVis()
	const ctx = (): Ctx => {
		const de = document.documentElement, max = Math.max(1, de.scrollHeight - W.innerHeight)
		const away = hiddenMs + (hiddenAt ? Date.now() - hiddenAt : 0)
		if (preview) return { url: location.href, seconds: 1e9, scroll: 100, returning, clicked, manual, interacted: true }
		return { url: location.href, seconds: (Date.now() - t0 - away) / 1000, scroll: Math.min(100, Math.round((W.scrollY / max) * 100)), returning, clicked, manual, interacted }
	}
	const hide = (dismiss: boolean) => {
		if (!pop) return
		pop.classList.remove('on'); const p = pop; pop = null; setTimeout(() => p.remove(), 300)
		if (dismiss && !preview) { gate = recordDismiss(gate, Date.now()); ls.set(GK, JSON.stringify(gate)); h.track('popup_dismissed') }
		if (dismiss) emo.emit('dismiss')
	}
	const show = (t: Trigger) => {
		const now = Date.now()
		if (pop || h.isOpen() || (!preview && !canShow(gate, ss.get(SK), h.cfg.caps, now))) return false
		if (!preview) { gate = recordShow(gate, now); ls.set(GK, JSON.stringify(gate)); ss.set(SK, ss.get(SK) + 1) }
		const box = $('.w') || R; if (!box) return false
		pop = document.createElement('div'); pop.className = 'ag-pop'; pop.setAttribute('role', 'status')
		const P = h.pos || {}
		pop.style.setProperty(P.side === 'left' ? 'left' : 'right', (P.offset ?? 20) + 'px'); pop.style.bottom = 'calc(' + Math.max((P.bottom ?? 20) + 84, W.innerWidth < 640 ? 85 : 0) + 'px + env(safe-area-inset-bottom, 0px))'   // بالای منوی پایینِ سایت
		const p = document.createElement('p'); p.textContent = (t.message || '').trim() || greeting
		const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'بستن'); x.textContent = '×'
		x.onclick = (e) => { e.stopPropagation(); hide(true) }
		p.onclick = () => { hide(false); h.open() }
		box.appendChild(pop); mk(pop, true); pop.append(p, x)
		requestAnimationFrame(() => pop?.classList.add('on'))
		emo.set(t.emotion || 'curious')
		if (!preview) { h.track('trigger_fired', { trigger: t.id }); h.track('popup_shown', { trigger: t.id }) }
		return true
	}
	const check = () => {
		if (!h.cfg.proactive || pop || h.isOpen() || document.hidden) return
		const t = firstMatch(h.cfg.triggers || [], ctx(), fired)
		if (t) { fired.add(t.id); show(t) }
	}
	if (h.cfg.proactive && (h.cfg.triggers || []).length) {
		timer = W.setInterval(check, 2000)
		W.addEventListener('scroll', () => { if (!pop) check() }, { passive: true })
		const sels = h.cfg.triggers.map((t) => t.when?.click).filter(Boolean) as string[]
		if (sels.length) document.addEventListener('click', (e) => {
			const el = e.target as Element | null
			sels.forEach((s) => { try { if (el?.closest?.(s) && !clicked.includes(s)) { clicked.push(s); check() } } catch { /* انتخابگرِ نامعتبر */ } })
		}, true)
		if (h.cfg.triggers.some((t) => t.when?.firstInteraction)) {
			const once = (e: Event) => {
				if (interacted || !countsAsInteraction(e.target as Element | null)) return
				interacted = true; check()
			}
			;['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, once, { capture: true, passive: true }))
		}
	}
	if (preview) setTimeout(check, 300)
	return {
		emit: (ev: AgentEvent, text?: string) => { if (ev === 'open') hide(false); emo.emit(ev, text) },
		/** اجرای دستیِ تریگر از سایت: ArominAgent.trigger('id') */
		trigger: (id: string) => { manual.push(id); fired.delete(id); check() },
		state: () => emo.state,
		stop: () => { W.clearInterval(timer); document.removeEventListener('visibilitychange', onVis); emo.destroy(); hide(false) },
	}
}

;(window as unknown as { ArominAgent: { start: typeof start } }).ArominAgent = { start }
