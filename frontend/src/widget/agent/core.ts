/**
 * هستهٔ «دستیارِ آرومین» (بدونِ وابستگی، قابلِ تست): EmotionController، ارزیابیِ تریگرهای پیش‌فعال، سلامِ متناسب با ساعت، سقف/فاصلهٔ نمایشِ پاپ‌آپ.
 * تصمیم‌ها قطعی‌اند؛ LLM فقط متنِ گفت‌وگو را می‌سازد.
 */
export const STATES = ['neutral', 'idle', 'listening', 'thinking', 'speaking', 'happy', 'laugh', 'curious', 'surprised', 'concerned', 'confused',
	'serious', 'annoyed', 'angry', 'success', 'error', 'sleeping'] as const
export type EmotionState = (typeof STATES)[number]
export type AgentEvent = 'open' | 'close' | 'typing' | 'send' | 'reply' | 'error' | 'lead' | 'handoff' | 'trigger' | 'dismiss' | 'greet'
	| 'rateLimit' | 'offline' | 'wake' | 'idle' | 'sleep' | 'warn' | 'abuse'

/** نگاشتِ رویدادِ اجرا ← حالتِ چهره */
export const EVENT_STATE: Record<AgentEvent, EmotionState> = {
	open: 'happy', close: 'neutral', typing: 'listening', send: 'thinking', reply: 'speaking', error: 'error', lead: 'success', handoff: 'laugh',
	trigger: 'curious', dismiss: 'neutral', greet: 'happy', rateLimit: 'annoyed', offline: 'confused', wake: 'surprised', idle: 'idle',
	sleep: 'sleeping', warn: 'serious', abuse: 'angry',
}
/** حالت‌های گذرا پس از این مدت (ms) به neutral برمی‌گردند */
const TRANSIENT: Partial<Record<EmotionState, number>> = { speaking: 2600, happy: 2200, laugh: 2200, success: 3000, surprised: 1200, curious: 4000, error: 3500, annoyed: 3000, confused: 3000, concerned: 3000 }

type Timers = { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void }
const realTimers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }

export class EmotionController {
	state: EmotionState = 'neutral'
	private back: unknown = null
	private idle: unknown = null
	constructor(private onChange: (s: EmotionState) => void, private t: Timers = realTimers, private idleMs = 60_000, private sleepMs = 180_000) {
		this.arm()
	}
	/** رویدادِ اجرا (باز شدن، تایپ، پاسخ، خطا، ثبتِ لید …) */
	emit(ev: AgentEvent, text?: string) {
		let s = EVENT_STATE[ev]
		if (ev === 'reply' && text) s = mood(text) ?? s
		this.set(s)
	}
	set(s: EmotionState, activity = true) {
		if (!STATES.includes(s)) s = 'neutral'
		this.t.clear(this.back)
		if (s !== this.state) { this.state = s; this.onChange(s) }
		const ms = TRANSIENT[s]
		if (ms) this.back = this.t.set(() => this.set('neutral', false), ms)
		if (activity && s !== 'idle' && s !== 'sleeping') this.arm()
	}
	private arm() {
		this.t.clear(this.idle)
		this.idle = this.t.set(() => { this.set('idle', false); this.idle = this.t.set(() => this.set('sleeping', false), this.sleepMs - this.idleMs) }, this.idleMs)
	}
	destroy() { this.t.clear(this.back); this.t.clear(this.idle) }
}

/** لحنِ پاسخ ← حالت (کلیدواژه‌ای و قطعی) */
export function mood(text: string): EmotionState | null {
	if (/متأسف|متاسف|عذر|ببخشید/.test(text)) return 'concerned'
	if (/😂|🤣|خنده/.test(text)) return 'laugh'
	if (/عالی|خوشحال|ممنون|🙏|😊|!/.test(text)) return 'happy'
	if (/\?|؟/.test(text)) return 'curious'
	return null
}

// ---------------- تریگرها ----------------
export type Cond = { path?: string; urlContains?: string; domain?: string; minSeconds?: number; minScroll?: number; visitor?: 'first' | 'returning'
	click?: string; utmSource?: string; utmCampaign?: string; manual?: boolean }
export type Trigger = { id: string; enabled?: boolean; when: Cond; message?: string; emotion?: EmotionState }
export type Ctx = { url: string; seconds: number; scroll: number; returning: boolean; clicked?: string[]; manual?: string[] }

function pathMatch(pattern: string, path: string) {
	if (!pattern.includes('*')) return path.startsWith(pattern) || path.includes(pattern)
	const rx = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
	return rx.test(path)
}

/** همهٔ شرط‌های تعریف‌شده باید برقرار باشند (AND). تریگرِ بدونِ شرط هرگز خودکار اجرا نمی‌شود. */
export function matches(t: Trigger, c: Ctx): boolean {
	if (t.enabled === false) return false
	const w = t.when || {}
	if (!Object.keys(w).length) return false
	let u: URL
	try { u = new URL(c.url) } catch { return false }
	const host = u.hostname.replace(/^www\./, '')
	if (w.path && !pathMatch(w.path, u.pathname)) return false
	if (w.urlContains && !c.url.includes(w.urlContains)) return false
	if (w.domain && host !== w.domain.replace(/^www\./, '') && !host.endsWith('.' + w.domain)) return false
	if (w.minSeconds != null && c.seconds < w.minSeconds) return false
	if (w.minScroll != null && c.scroll < w.minScroll) return false
	if (w.visitor === 'first' && c.returning) return false
	if (w.visitor === 'returning' && !c.returning) return false
	if (w.utmSource && u.searchParams.get('utm_source') !== w.utmSource) return false
	if (w.utmCampaign && u.searchParams.get('utm_campaign') !== w.utmCampaign) return false
	if (w.click && !(c.clicked || []).includes(w.click)) return false
	if (w.manual && !(c.manual || []).includes(t.id)) return false
	return true
}
export const firstMatch = (ts: Trigger[], c: Ctx, fired: Set<string>) => ts.find((t) => !fired.has(t.id) && matches(t, c)) || null

// ---------------- سلام با ساعتِ محلی ----------------
export type Greetings = { morning?: string; noon?: string; afternoon?: string; night?: string; custom?: string }
export function dayPart(h: number): 'morning' | 'noon' | 'afternoon' | 'night' {
	return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 14 ? 'noon' : h >= 14 && h < 19 ? 'afternoon' : 'night'
}
export function greetingFor(g: Greetings, d: Date = new Date(), fallback = 'سلام! چطور می‌توانم کمکتان کنم؟') {
	return (g.custom || '').trim() || (g[dayPart(d.getHours())] || '').trim() || fallback
}

// ---------------- سقف و فاصلهٔ نمایش ----------------
export type Caps = { perSession: number; perDay: number; cooldownMin: number; dismissCooldownMin: number }
export type Gate = { day: string; dayCount: number; last: number; dismissedAt: number }
export const newGate = (): Gate => ({ day: '', dayCount: 0, last: 0, dismissedAt: 0 })
const dayKey = (now: number) => new Date(now).toDateString()

export function canShow(g: Gate, sessionCount: number, caps: Caps, now: number): boolean {
	if (sessionCount >= caps.perSession) return false
	if ((g.day === dayKey(now) ? g.dayCount : 0) >= caps.perDay) return false
	if (g.last && now - g.last < caps.cooldownMin * 60_000) return false
	if (g.dismissedAt && now - g.dismissedAt < caps.dismissCooldownMin * 60_000) return false
	return true
}
export function recordShow(g: Gate, now: number): Gate {
	const same = g.day === dayKey(now)
	return { ...g, day: dayKey(now), dayCount: (same ? g.dayCount : 0) + 1, last: now }
}
export const recordDismiss = (g: Gate, now: number): Gate => ({ ...g, dismissedAt: now })
