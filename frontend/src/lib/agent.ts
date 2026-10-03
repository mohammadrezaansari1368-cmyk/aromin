/**
 * دستیارِ عامل (Agent) — حالت، ابزارها، کنترلِ دسترسی و حلقهٔ «مدل ← ابزار ← مدل».
 *
 * جریان: پیامِ کاربر → POST /api/ai {mode:'agent'} → اگر مدل بلاکِ ```tool {...}``` داد، ابزار همین‌جا
 * (سمتِ کلاینت) اجرا می‌شود → نتیجه به‌صورتِ [tool_result] به مدل برمی‌گردد (حداکثر ۳ دور).
 * ابزارهای مدیریتی فقط برای نقشِ manager؛ نوشتن در داده فقط با تأییدِ صریحِ کاربر و بک‌آپِ اجباری.
 * ⚠️ این کنترلِ دسترسی سمتِ کلاینت است؛ /api/state هنوز احرازِ هویت ندارد (ریسکِ شناخته‌شده).
 */
import { useSyncExternalStore } from 'react'
import { ROLES, authHeaders, isAdmin, type Session } from '@/lib/auth'
import { THEMES, getTheme, setTheme, type Mode, type ThemeName } from '@/lib/theme'
import { fetchFull, saveState } from '@/lib/forecastStore'
import { compute, currentTenant } from '@/lib/data'

/* ---------------- تعریفِ ابزارها (همان نام‌ها در server.py → AGENT_TOOLS) ---------------- */
export interface ToolSpec { name: string; admin: boolean; description: string; parameters: Record<string, unknown> }
export const TOOLS: ToolSpec[] = [
	{ name: 'navigateToTab', admin: false, description: 'رفتن به یک تبِ اپ', parameters: { type: 'object', properties: { tab: { type: 'string', description: 'id یا نامِ تب' } }, required: ['tab'] } },
	{ name: 'fetchAnalytics', admin: true, description: 'خواندنِ یک شاخص از دادهٔ زنده (فقط خواندنی)', parameters: { type: 'object', properties: { metric: { enum: ['sales', 'target', 'conversion', 'deals', 'funnel', 'topSellers', 'forecast', 'tickets', 'summary'] } }, required: ['metric'] } },
	{ name: 'updateAppTheme', admin: true, description: 'تغییرِ تمِ رنگیِ اپ در همین مرورگر', parameters: { type: 'object', properties: { theme: { enum: ['purple', 'blue', 'gold'] }, mode: { enum: ['light', 'dark'] } } } },
	{ name: 'toggleFeature', admin: true, description: 'روشن/خاموش کردنِ قابلیتِ رابط', parameters: { type: 'object', properties: { feature: { enum: ['voiceReplies', 'agentMotion'] }, enabled: { type: 'boolean' } }, required: ['feature', 'enabled'] } },
	{ name: 'updateDatabaseRecord', admin: true, description: 'ویرایشِ یک رکورد با تأییدِ کاربر و بک‌آپ', parameters: { type: 'object', properties: { collection: { enum: ['people', 'users'] }, id: { type: 'string' }, data: { type: 'object' } }, required: ['collection', 'id', 'data'] } },
]
const ADMIN = new Set(TOOLS.filter((t) => t.admin).map((t) => t.name))
/** فیلدهای مجاز برای نوشتن — هر چیزِ دیگر (رمز، فاکتور، تارگت…) رد می‌شود. */
const WRITABLE: Record<string, Record<string, (v: string) => string | null>> = {
	people: {
		mobile: (v) => { const s = v.replace(/[^\d]/g, '').replace(/^98/, '0').replace(/^9/, '09'); return /^09\d{9}$/.test(s) ? s : null },
		email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null),
		level: (v) => (['junior', 'mid', 'senior'].includes(v) ? v : null),
	},
	users: {
		role: (v) => (ROLES.some((r) => r.id === v) ? v : null),
		mobile: (v) => WRITABLE.people.mobile(v),
		email: (v) => WRITABLE.people.email(v),
	},
}
const FIELD_FA: Record<string, string> = { mobile: 'موبایل', email: 'ایمیل', level: 'سطح', role: 'نقش' }

/* ---------------- قابلیت‌های رابط (per-browser) ---------------- */
export interface Features { voiceReplies: boolean; agentMotion: boolean }
const FKEY = 'aromin.ui.features'
function readFeatures(): Features {
	try { return { voiceReplies: false, agentMotion: true, ...JSON.parse(localStorage.getItem(FKEY) || '{}') } } catch { return { voiceReplies: false, agentMotion: true } }
}

/* ---------------- حالت ---------------- */
export type Status = 'idle' | 'listening' | 'thinking' | 'tool' | 'speaking'
export interface Msg {
	id: string
	role: 'user' | 'assistant' | 'tool'
	text: string
	streaming?: boolean
	/** فقط برای مدل (در گفت‌وگو نمایش داده نمی‌شود) */
	hidden?: boolean
	tool?: { name: string; status: 'ok' | 'denied' | 'error' | 'cancelled' }
	/** آنچه به مدل برمی‌گردد (برای assistant = متنِ خام با بلاکِ ابزار؛ برای tool = [tool_result …]) */
	llm?: { role: 'user' | 'assistant'; content: string }
}
export interface Confirm { title: string; lines: string[]; resolve: (ok: boolean) => void }
export interface PageAction { label: string; run: () => void }
interface State { open: boolean; status: Status; msgs: Msg[]; confirm: Confirm | null; features: Features; pulse: number; pageActions: PageAction[] }

let state: State = { open: false, status: 'idle', msgs: [], confirm: null, features: readFeatures(), pulse: 0, pageActions: [] }
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
const patchMsg = (id: string, p: Partial<Msg>) => set({ msgs: state.msgs.map((m) => (m.id === id ? { ...m, ...p } : m)) })
let seq = 0
const uid = () => 'm' + ++seq + '-' + Date.now().toString(36)
export const useAgent = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
export const getAgent = () => state

/* ---------------- اتصال به اپ (AppShell) ---------------- */
export interface Host {
	session: Session
	tabs: { id: string; label: string; sub: string }[]
	activeTab: () => string
	go: (id: string) => void | Promise<void>
	flush: () => Promise<void>
	reload: () => void
}
let host: Host | null = null
export const bindHost = (h: Host | null) => { host = h }
let pageContext: (() => string) | null = null
/** تبِ فعلی می‌تواند خلاصهٔ اعدادش را به دستیار بدهد (مثلاً G). */
export const setPageContext = (fn: (() => string) | null) => { pageContext = fn }
/** اقدام‌های آمادهٔ همان صفحه (مثلاً تحلیل/استراتژی/ریسکِ G) که در پنل به‌صورتِ دکمه دیده می‌شوند. */
export const setPageActions = (pageActions: PageAction[]) => set({ pageActions })

export const openAgent = (open = true) => set({ open })
export const setFeature = (k: keyof Features, v: boolean) => {
	const f = { ...state.features, [k]: v }
	try { localStorage.setItem(FKEY, JSON.stringify(f)) } catch { /* */ }
	set({ features: f })
}
export const setStatus = (status: Status) => set({ status })
export const clearChat = () => set({ msgs: [] })

/* ---------------- نمایشِ تدریجی (افکتِ استریم) ---------------- */
function reveal(id: string, full: string): Promise<void> {
	const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
	if (reduce || full.length < 24) { patchMsg(id, { text: full, streaming: false }); return Promise.resolve() }
	return new Promise((res) => {
		const words = full.split(/(\s+)/)
		let i = 0
		const step = Math.max(1, Math.ceil(words.length / 60))
		const t = window.setInterval(() => {
			i = Math.min(words.length, i + step)
			patchMsg(id, { text: words.slice(0, i).join(''), streaming: i < words.length })
			if (i >= words.length) { window.clearInterval(t); res() }
		}, 28)
	})
}

/* ---------------- گفتار (TTS) ---------------- */
let lastByVoice = false
export const markVoiceInput = (v: boolean) => { lastByVoice = v }
function speak(text: string) {
	if (!('speechSynthesis' in window) || !(state.features.voiceReplies || lastByVoice)) return
	const plain = text.replace(/```[\s\S]*?```/g, '').replace(/[*_#`>]/g, '').slice(0, 600)
	if (!plain.trim()) return
	const u = new SpeechSynthesisUtterance(plain)
	const voices = speechSynthesis.getVoices()
	const fa = voices.find((v) => /^fa/i.test(v.lang))
	u.lang = fa?.lang || 'fa-IR'
	if (fa) u.voice = fa
	u.onstart = () => setStatus('speaking')
	u.onend = u.onerror = () => { if (state.status === 'speaking') setStatus('idle') }
	speechSynthesis.cancel()
	speechSynthesis.speak(u)
}
export const hasPersianVoice = () => 'speechSynthesis' in window && speechSynthesis.getVoices().some((v) => /^fa/i.test(v.lang))
export const stopSpeaking = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); if (state.status === 'speaking') setStatus('idle') }

/* ---------------- اجرای ابزار (با کنترلِ نقش) ---------------- */
type ToolResult = { ok: boolean; [k: string]: unknown }
const askConfirm = (title: string, lines: string[]) => new Promise<boolean>((resolve) => set({ confirm: { title, lines, resolve: (ok) => { set({ confirm: null }); resolve(ok) } } }))

function resolveTab(q: string) {
	const tabs = host?.tabs || []
	const s = String(q || '').trim().toLowerCase()
	const alias: Record<string, string> = { settings: 'p-set', setting: 'p-set', dashboard: 'dashboard', forecast: 'forecast', budget: 'forecast', import: 'import', hiring: 'p-hire', support: 'p-ticket', ledger: 'p-inv', sales: 'p-inv', report: 'p-report', reports: 'p-report', calculator: 'p-calc', performance: 'performance', attendance: 'performance', 'p-kpi': 'performance', ladder: 'p-ladder', commission: 'p-team', analytics: 'p-dash' }
	return tabs.find((t) => t.id.toLowerCase() === s) || tabs.find((t) => t.id === alias[s])
		|| tabs.find((t) => t.label === q.trim()) || tabs.find((t) => q.trim() && (t.label.includes(q.trim()) || q.trim().includes(t.label)))
		|| tabs.find((t) => t.sub.toLowerCase().includes(s) && s.length > 2)
}

async function analytics(metric: string): Promise<ToolResult> {
	const full = await fetchFull()
	if (!full || !Array.isArray(full.people)) return { ok: false, error: 'دادهٔ سرور در دسترس نیست' }
	const m = compute(full, currentTenant())
	const pick: Record<string, unknown> = {
		sales: { wonMillionToman: m.wonMillion, wonDeals: m.won, lostDeals: m.lost, openDeals: m.open },
		target: { targetAchievedPct: m.targetPct, annualBudgetMillionToman: m.budgetMillion, wonMillionToman: m.wonMillion },
		conversion: { conversionPct: m.conversion },
		deals: { total: m.totalDeals, won: m.won, lost: m.lost, open: m.open },
		funnel: m.funnel,
		topSellers: m.agents.slice(0, 5),
		forecast: { year: m.fcYear, forecastMillionToman: m.fcYearMillion, actualVsForecastPct: m.fcVsActualPct, monthsWithActual: m.fcMonths },
		tickets: { total: m.tickets.total, withinSla: m.tickets.met, slaPct: m.tickets.slaPct },
	}
	pick.summary = { people: m.people, ...(pick.sales as object), ...(pick.target as object), conversionPct: m.conversion, forecast: pick.forecast }
	if (!(metric in pick)) return { ok: false, error: 'شاخصِ ناشناخته: ' + metric }
	return { ok: true, metric, value: pick[metric], real: m.real }
}

async function updateRecord(args: Record<string, unknown>): Promise<ToolResult> {
	const collection = String(args.collection || ''), id = String(args.id || ''), data = (args.data && typeof args.data === 'object' ? args.data : {}) as Record<string, unknown>
	const rules = WRITABLE[collection]
	if (!rules) return { ok: false, error: 'مجموعهٔ غیرمجاز (فقط people یا users)' }
	const clean: Record<string, string> = {}
	for (const [k, v] of Object.entries(data)) {
		if (!rules[k]) return { ok: false, error: `فیلدِ «${k}» قابلِ ویرایش نیست` }
		const ok = rules[k](String(v ?? ''))
		if (ok == null) return { ok: false, error: `مقدارِ «${String(v)}» برای ${FIELD_FA[k] || k} معتبر نیست` }
		clean[k] = ok
	}
	if (!Object.keys(clean).length) return { ok: false, error: 'تغییری مشخص نشده' }
	const full = await fetchFull()
	const rec = collection === 'people' ? (full?.people || []).find((p: any) => String(p.id) === id || String(p.name) === id) : full?.users?.[id]
	if (!rec) return { ok: false, error: 'رکورد پیدا نشد: ' + id }
	const who = collection === 'people' ? rec.name : id
	const lines = Object.entries(clean).map(([k, v]) => `${FIELD_FA[k] || k}: ${rec[k] ? String(rec[k]) : '—'} ← ${v}`)
	const yes = await askConfirm(`تغییر در دادهٔ اصلیِ «${who}»`, lines)
	if (!yes) return { ok: false, cancelled: true, error: 'کاربر لغو کرد' }
	await host?.flush()
	await saveState((f) => {
		if (collection === 'people') { const p = (f.people || []).find((q: any) => String(q.id) === String(rec.id) && q.name === rec.name); if (!p) throw new Error('gone'); Object.assign(p, clean) }
		else { if (!f.users?.[id]) throw new Error('gone'); Object.assign(f.users[id], clean) }
	}, { forceBackup: true, tag: 'agent-update' })
	host?.reload()
	return { ok: true, updated: { collection, id: who, ...clean } }
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<{ result: ToolResult; status: NonNullable<Msg['tool']>['status']; summary: string }> {
	const role = host?.session.role
	if (!TOOLS.some((t) => t.name === name)) return { result: { ok: false, error: 'ابزارِ ناشناخته' }, status: 'error', summary: `ابزارِ ناشناخته: ${name}` }
	if (ADMIN.has(name) && !isAdmin(role)) return { result: { ok: false, error: 'این کار فقط برای مدیر مجاز است' }, status: 'denied', summary: 'فقط برای مدیر' }
	try {
		if (name === 'navigateToTab') {
			const t = resolveTab(String(args.tab || ''))
			if (!t) return { result: { ok: false, error: 'تب پیدا نشد' }, status: 'error', summary: `تبِ «${String(args.tab)}» پیدا نشد` }
			await host?.go(t.id)
			return { result: { ok: true, tab: t.label }, status: 'ok', summary: `رفتن به «${t.label}»` }
		}
		if (name === 'updateAppTheme') {
			let theme = args.theme as ThemeName | undefined, mode = args.mode as Mode | undefined
			// فقط همان چیزی که کاربر خواست: مدل گاهی رنگ را هم عوض می‌کرد وقتی فقط «تیره» خواسته شده بود
			const askedColor = /(بنفش|آبی|طلایی|purple|blue|gold)/i.test(lastUserText), askedMode = /(تیره|روشن|تاریک|dark|light)/i.test(lastUserText)
			if (askedColor !== askedMode) { if (!askedColor) theme = undefined; if (!askedMode) mode = undefined }
			if (theme && !THEMES.some((t) => t.id === theme)) return { result: { ok: false, error: 'تمِ نامعتبر' }, status: 'error', summary: 'تمِ نامعتبر' }
			if (mode && mode !== 'light' && mode !== 'dark') return { result: { ok: false, error: 'حالتِ نامعتبر' }, status: 'error', summary: 'حالتِ نامعتبر' }
			setTheme({ ...(theme ? { theme } : {}), ...(mode ? { mode } : {}) })
			const s = getTheme()
			return { result: { ok: true, ...s }, status: 'ok', summary: `تم: ${THEMES.find((t) => t.id === s.theme)?.label} · ${s.mode === 'dark' ? 'تیره' : 'روشن'}` }
		}
		if (name === 'toggleFeature') {
			const f = String(args.feature) as keyof Features
			if (!(f in state.features)) return { result: { ok: false, error: 'قابلیتِ ناشناخته' }, status: 'error', summary: 'قابلیتِ ناشناخته' }
			setFeature(f, !!args.enabled)
			return { result: { ok: true, feature: f, enabled: !!args.enabled }, status: 'ok', summary: `${f === 'voiceReplies' ? 'پاسخِ صوتی' : 'حرکتِ نشانِ سه‌بعدی'}: ${args.enabled ? 'روشن' : 'خاموش'}` }
		}
		if (name === 'fetchAnalytics') {
			const r = await analytics(String(args.metric || 'summary'))
			return { result: r, status: r.ok ? 'ok' : 'error', summary: r.ok ? `خواندنِ شاخصِ ${String(args.metric)}` : String(r.error) }
		}
		if (name === 'updateDatabaseRecord') {
			const r = await updateRecord(args)
			return { result: r, status: r.ok ? 'ok' : r.cancelled ? 'cancelled' : 'error', summary: r.ok ? 'رکورد به‌روز شد (با بک‌آپ)' : String(r.error) }
		}
	} catch (e) {
		return { result: { ok: false, error: (e as Error).message }, status: 'error', summary: 'خطا: ' + (e as Error).message }
	}
	return { result: { ok: false }, status: 'error', summary: 'اجرا نشد' }
}

/* ---------------- حلقهٔ گفت‌وگو ---------------- */
const TOOL_RE = /```tool\s*([\s\S]*?)```/
// مدلِ زنده گاهی فقط «وعده» می‌دهد («داده را می‌خوانم») و بلاکِ ابزار نمی‌فرستد (۲ از ۵ در آزمونِ زنده)؛
// یک یادآوریِ پنهان همان را به بلاکِ ابزار تبدیل کرد (۳ از ۳). حداکثر یک‌بار در هر نوبت.
const PROMISE_RE = /(می‌خوانم|بخوانم|بررسی می‌کنم|بررسی کنم|دریافت می‌کنم|بگیرم|می‌گیرم|اجرا می‌کنم|انجام می‌دهم|می‌روم|باز می‌کنم|تغییر می‌دهم)/
const NUDGE = '[system] ابزار را اجرا نکردی. همین حالا فقط بلاکِ ```tool``` لازم را بفرست، بدونِ هیچ متنِ دیگر.'
function tenantInfo() {
	try { const t = JSON.parse(localStorage.getItem('aromin.lastTenant') || '{}'); return { industry: String(t.industry || ''), business: String(t.name || '') } } catch { return { industry: '', business: '' } }
}
async function post(body: Record<string, unknown>) {
	// دانشِ کسب‌وکار را سرور از S3 پیوست می‌کند (فقط برای کاربرِ معتبرِ همین tenant) — دیگر از کلاینت فرستاده نمی‌شود
	const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(host?.session) }, body: JSON.stringify({ tenant: currentTenant(), ...body }) })
	return r.json() as Promise<{ ok: boolean; text?: string; error?: string; detail?: string }>
}
let busy = false
let lastUserText = ''
export async function send(text: string) {
	const q = text.trim()
	if (!q || busy) return
	busy = true
	lastUserText = q
	set({ open: true, status: 'thinking', msgs: [...state.msgs, { id: uid(), role: 'user', text: q, llm: { role: 'user', content: q } }] })
	let nudged = false
	try {
		for (let round = 0; round < 4; round++) {
			const history = state.msgs.filter((m) => m.llm).map((m) => m.llm!)
			const res = await post({
				mode: 'agent', messages: history, role: host?.session.role, page: host?.tabs.find((t) => t.id === host?.activeTab())?.label || '',
				tabs: (host?.tabs || []).map(({ id, label }) => ({ id, label })), context: pageContext?.() || '', ...tenantInfo(),
			})
			if (!res?.ok) { set({ msgs: [...state.msgs, { id: uid(), role: 'assistant', text: 'دستیار پاسخ نداد: ' + String(res?.detail || res?.error || 'نامشخص') }] }); break }
			const raw = String(res.text || '')
			const m = raw.match(TOOL_RE)
			const visible = raw.replace(TOOL_RE, '').trim()
			const aid = uid()
			set({ msgs: [...state.msgs, { id: aid, role: 'assistant', text: '', streaming: true, llm: { role: 'assistant', content: raw } }] })
			if (visible) await reveal(aid, visible)
			else patchMsg(aid, { streaming: false }) // فقط درخواستِ ابزار؛ حباب خالی نمایش داده نمی‌شود
			if (!m) {
				if (!nudged && visible.length < 220 && PROMISE_RE.test(visible)) {
					nudged = true
					set({ msgs: [...state.msgs, { id: uid(), role: 'user', text: '', hidden: true, llm: { role: 'user', content: NUDGE } }] })
					continue
				}
				speak(visible)
				break
			}
			let call: { name?: string; args?: Record<string, unknown> } = {}
			try { call = JSON.parse(m[1]) } catch { /* */ }
			set({ status: 'tool', pulse: state.pulse + 1 })
			const out = await runTool(String(call.name || ''), call.args || {})
			set({ status: 'thinking', msgs: [...state.msgs, { id: uid(), role: 'tool', text: out.summary, tool: { name: String(call.name), status: out.status }, llm: { role: 'user', content: `[tool_result ${String(call.name)}] ${JSON.stringify(out.result)}` } }] })
		}
	} catch {
		set({ msgs: [...state.msgs, { id: uid(), role: 'assistant', text: 'به دستیار وصل نشدم.' }] })
	} finally {
		busy = false
		if (state.status !== 'speaking') setStatus('idle')
		lastByVoice = false
	}
}

/** دکمه‌های تحلیلِ داخلِ صفحه‌ها (مثلاً G): همان درخواستِ قبلی به /api/ai، نتیجه در همین گفت‌وگو. */
export async function runPreset(mode: string, label: string, body: Record<string, unknown>) {
	if (busy) return
	busy = true
	set({ open: true, status: 'thinking', msgs: [...state.msgs, { id: uid(), role: 'user', text: label, llm: { role: 'user', content: label } }] })
	try {
		const res = await post({ mode, ...body })
		const aid = uid()
		const txt = res?.ok ? String(res.text || '') : 'خطا در اجرای دستیار: ' + String(res?.detail || res?.error || 'نامشخص')
		set({ msgs: [...state.msgs, { id: aid, role: 'assistant', text: '', streaming: true, llm: { role: 'assistant', content: txt } }] })
		await reveal(aid, txt)
		if (res?.ok) speak(txt)
	} catch {
		set({ msgs: [...state.msgs, { id: uid(), role: 'assistant', text: 'به دستیارِ هوشمند وصل نشدم.' }] })
	} finally {
		busy = false
		if (state.status !== 'speaking') setStatus('idle')
	}
}
