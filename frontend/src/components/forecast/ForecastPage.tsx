'use client'

/**
 * تبِ «پیش‌بینی و بودجه» — نسخهٔ بومیِ React با طراحیِ جدید، همهٔ کاشی‌های اپِ کامل.
 * همان دادهٔ FORECAST (همان کلیدها) روی MariaDB؛ ذخیرهٔ امن با بک‌آپ (forecastStore).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { isAdmin, type Session } from '@/lib/auth'
import { runPreset, setPageActions, setPageContext } from '@/lib/agent'
import { fetchFull, saveState } from '@/lib/forecastStore'
import Sortable from '@/components/ui/sortable'
import { BTN, BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, FOCUS } from '@/components/ui/tokens'
import {
	DEFAULTS, FC_IDS, GRP, FC_INDUSTRY, INDUSTRY_OPTS, M4TYPES, M4TYPE_OPTS, M4REAL_MSG, MARGIN_STD, STRAT_FA, FC_USD_HIST, LEVELW, MN,
	GUIDE, IND_FA, guideEx, industryDefaults, industryNote, normalize, fillAnnual, suggestBase, compute,
	fa, sep, pct, faGroup, fnum, fcGroupList, type Form, type Extra,
} from '@/lib/forecast'

const ACCESS_DEFAULT: Record<string, string[]> = {
	manager: ['p-forecast'], finance: ['p-forecast'], salesmgr: ['p-forecast'], accmgr: ['p-forecast'], sales: [], support: [],
}
const NUM_IDS = new Set(['fcHorizon', 'fcMktPct', 'fcM4r', 'fcM4rep', 'fcM4share', 'fcM4brand', 'fcM4aware', 'fcM4chan', 'fcM4comp', 'fcMargin', 'fcCapWorkers', 'fcCapDaily', 'fcCapDays', 'fcTargetYear'])
const toLat = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

const VARS = {
	'--fc-petrol': 'hsl(var(--primary-ink))', '--fc-rose': 'hsl(var(--error))', '--fc-brass': 'hsl(var(--accent-ink))', '--fc-brass-soft': 'hsl(var(--accent) / .14)',
	'--fc-ink2': 'hsl(var(--text))', '--fc-ink3': 'hsl(var(--muted-foreground))', '--fc-line': 'hsl(var(--border))', '--fc-green': 'hsl(var(--success))',
} as CSSProperties
const GREEN = 'hsl(var(--success))', ROSE = 'var(--fc-rose)'
const RING = 'hsl(var(--secondary))'

/* ---------------- طبقه‌های هرمِ برند (فعالیت‌ها ← اهداف ← نتایج) ---------------- */
type Tier = 'gold' | 'purple' | 'blue'
const TIER: Record<Tier, { fill: string; ink: string; on: string; onSub: string }> = {
	gold: { fill: '#FCBF00', ink: 'hsl(var(--brand-gold-ink))', on: 'text-[#2A1F00]', onSub: 'text-[#2A1F00]/70' },
	purple: { fill: '#910D6A', ink: 'hsl(var(--brand-purple-ink))', on: 'text-white', onSub: 'text-white/75' },
	blue: { fill: '#004991', ink: 'hsl(var(--brand-blue-ink))', on: 'text-white', onSub: 'text-white/75' },
}
const TierCtx = createContext<Tier>('purple')

/** آیکون‌ها — همان سبکِ خطیِ سایدبار (AppShell) */
const IC = {
	sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z|M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
	book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
	trend: 'M3 17l6-6 4 4 8-8|M14 7h7v7',
	bulb: 'M9 18h6|M10 22h4|M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
	target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
	info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-4|M12 8h.01',
	upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
	x: 'M18 6L6 18|M6 6l12 12',
	chev: 'M6 9l6 6 6-6',
}
const Icon = ({ n, className = 'size-4' }: { n: keyof typeof IC; className?: string }) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
		{IC[n].split('|').map((d, i) => <path key={i} d={d} />)}
	</svg>
)
/** نشانِ کوچکِ طبقه (مثلث/ذوزنقهٔ همان هرم) */
const TierMark = ({ tier, className = 'h-4 w-5' }: { tier: Tier; className?: string }) => (
	<span aria-hidden className={`inline-block shrink-0 ${className}`} style={{ background: TIER[tier].fill, clipPath: tier === 'blue' ? 'polygon(50% 0,100% 100%,0 100%)' : 'polygon(16% 0,84% 0,100% 100%,0 100%)' }} />
)

/* ---------------- بلوک‌های طراحی ---------------- */
function Card({ title, sub, children, id, tone }: { title: ReactNode; sub?: ReactNode; children: ReactNode; id?: string; tone?: string }) {
	return (
		<section id={id} className={`@container ${CARD} ${CARD_PAD} ${tone || ''}`}>
			<header className="mb-4">
				<h3 className={CARD_TITLE}>{title}</h3>
				{sub && <p className={CARD_SUB}>{sub}</p>}
			</header>
			{children}
		</section>
	)
}
function Band({ tier, title, desc, children }: { tier: Tier; title: string; desc: string; children: ReactNode }) {
	return (
		<TierCtx.Provider value={tier}>
			<section id={'fc-band-' + tier} aria-labelledby={'fc-band-h-' + tier} className="flex scroll-mt-24 flex-col gap-4">
				<header className="flex items-center gap-3 px-1 pt-4">
					<TierMark tier={tier} className="h-5 w-7" />
					<div className="min-w-0">
						<h2 id={'fc-band-h-' + tier} className="text-[18px] font-extrabold leading-7" style={{ color: TIER[tier].ink }}>{title}</h2>
						<p className="text-[12.5px] leading-6 text-muted-foreground">{desc}</p>
					</div>
				</header>
				<Sortable id={'forecast.' + tier}>{children}</Sortable>
			</section>
		</TierCtx.Provider>
	)
}
function Html({ h, className = '' }: { h: string; className?: string }) {
	return <p className={`max-w-[95ch] text-[12.5px] leading-7 text-muted-foreground ${className}`} dangerouslySetInnerHTML={{ __html: h }} />
}
type FigKind = 'total' | 'gold' | 'warn' | undefined
/** کاشیِ عدد — «total» رنگِ طبقهٔ همان بخش را می‌گیرد */
function Fig({ k, v, u, kind, small }: { k: ReactNode; v: ReactNode; u?: ReactNode; kind?: FigKind; small?: boolean }) {
	const t = TIER[useContext(TierCtx)]
	const total = kind === 'total'
	const cls = total ? t.on : kind === 'gold' ? 'bg-accent/15 ring-1 ring-accent/45' : kind === 'warn' ? 'bg-error/10 ring-1 ring-error/30' : 'bg-muted/45 ring-1 ring-border/80'
	const sub = total ? t.onSub : 'text-muted-foreground'
	return (
		<div className={`flex min-w-0 flex-col gap-1 rounded-xl px-4 py-3.5 ${cls}`} style={total ? { background: t.fill } : undefined}>
			<div className={`text-[11.5px] font-bold ${sub}`}>{k}</div>
			<div className={`${small ? 'text-[14px] @lg:text-[15px]' : 'text-[16px] @lg:text-[21px]'} font-extrabold leading-tight tabular-nums [overflow-wrap:anywhere]`}>{v}</div>
			{u && <div className={`text-[11px] leading-5 ${sub}`}>{u}</div>}
		</div>
	)
}
const Figs = ({ children }: { children: ReactNode }) => <div className="mt-4 grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">{children}</div>
function Btn({ children, onClick, kind = 'primary', sm, disabled, title }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'gold'; sm?: boolean; disabled?: boolean; title?: string }) {
	const k =
		kind === 'gold' ? `${BTN} bg-accent text-accent-foreground hover:brightness-105` : kind === 'ghost' ? BTN_GHOST : BTN_PRIMARY
	return (
		<button type="button" title={title} disabled={disabled} onClick={onClick} className={`${k} ${sm ? 'min-h-8 px-3 text-[12px]' : 'min-h-10 text-[13px]'} max-w-full text-center leading-5 active:translate-y-px sm:shrink-0 sm:whitespace-nowrap`}>
			{children}
		</button>
	)
}
const inCls = 'h-10 w-full rounded-xl border border-border bg-card px-3 text-[13px] text-foreground outline-none transition placeholder:text-muted-foreground/80 hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/12'
function Label({ children }: { children: ReactNode }) {
	return <span className="mb-1.5 block text-[11.5px] font-bold text-muted-foreground">{children}</span>
}
const Th = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <th className={`whitespace-nowrap px-3 py-2.5 text-right text-[11.5px] font-bold ${className}`}>{children}</th>
const Td = ({ children, className = '', style }: { children?: ReactNode; className?: string; style?: CSSProperties }) => <td style={style} className={`whitespace-nowrap border-t border-border/80 px-3 py-2 tabular-nums ${className}`}>{children}</td>
const Colored = ({ v, children }: { v: number; children: ReactNode }) => <span style={{ color: v >= 0 ? GREEN : ROSE }}>{children}</span>

/* ---------------- صفحه ---------------- */
interface Ctx { people: any[]; churn: any; salesCrisis: boolean; fy: string; industry: string; business: string }

export default function ForecastPage({ session, goImport }: { session: Session; goImport?: () => void }) {
	const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading')
	const [err, setErr] = useState('')
	const [f, setF] = useState<Form>(DEFAULTS)
	const [x, setX] = useState<Extra>({})
	const [ctx, setCtx] = useState<Ctx>({ people: [], churn: null, salesCrisis: false, fy: '', industry: '', business: '' })
	const [msg, setMsgs] = useState<Record<string, string>>({})
	const [saveSt, setSaveSt] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
	const [saveErr, setSaveErr] = useState('')
	const [marginStd, setMarginStd] = useState('')
	const [usdBusy, setUsdBusy] = useState(false)
	const [confirmApply, setConfirmApply] = useState(false)

	const fRef = useRef(f), xRef = useRef(x), ctxRef = useRef(ctx)
	const dirtyX = useRef<Set<string>>(new Set())
	const timer = useRef<number | undefined>(undefined)
	const pending = useRef(false)
	const setMsg = (k: string, h: string) => setMsgs((m) => ({ ...m, [k]: h }))

	/* ---------- بارگذاری ---------- */
	useEffect(() => {
		let dead = false
		;(async () => {
			try {
				const full = await fetchFull()
				if (dead) return
				if (!full || !Array.isArray(full.people)) { setErr('دادهٔ کسب‌وکار روی سرور پیدا نشد.'); setPhase('error'); return }
				const acc = (full.access && typeof full.access === 'object' ? full.access : null) as Record<string, string[]> | null
				const allowed = acc ? acc[session.role] || acc.manager || [] : ACCESS_DEFAULT[session.role] || ACCESS_DEFAULT.manager
				if (!isAdmin(session.role) && !allowed.includes('p-forecast')) { setPhase('denied'); return }
				let tInd = ''
				try { tInd = JSON.parse(localStorage.getItem('aromin.lastTenant') || '{}').industry || '' } catch { /* */ }
				if (!tInd && full.tenantInfo) tInd = full.tenantInfo.industry || ''
				// پیش‌فرض‌ها (همان ترتیبِ اپِ کامل: صنعتِ کسب‌وکار ← بازیابیِ FORECAST)
				const base: Form = { ...DEFAULTS }
				if (FC_INDUSTRY[tInd]) Object.assign(base, { fcIndustry: tInd }, industryDefaults(tInd))
				const fc = full.forecast && typeof full.forecast === 'object' ? full.forecast : {}
				for (const id of FC_IDS) {
					const v = fc[id]
					if (v == null) continue
					if (typeof DEFAULTS[id] === 'boolean') base[id] = !!v
					else if (v !== '') {
						const s = String(v)
						base[id] = GRP.has(id) ? faGroup(s) : NUM_IDS.has(id) && !/^-?\d*\.?\d+$/.test(s.trim()) ? '' : s
					}
				}
				const ex: Extra = {}
				for (const k of Object.keys(fc)) if (!(k in DEFAULTS)) ex[k] = fc[k]
				const c: Ctx = {
					people: full.people || [], churn: full.churn || null, salesCrisis: !!full.salesCrisis, fy: String(full.fy || ''),
					industry: String(full.tenantInfo?.industry || tInd || ''), business: String(full.tenantInfo?.name || ''),
				}
				const nf = normalize(base, ex)
				fRef.current = nf; xRef.current = ex; ctxRef.current = c
				setF(nf); setX(ex); setCtx(c); setPhase('ready')
			} catch {
				if (!dead) { setErr('اتصال به سرور برقرار نشد.'); setPhase('error') }
			}
		})()
		return () => { dead = true }
	}, [session.role])

	const r = useMemo(() => compute(f, x, ctx), [f, x, ctx])

	// خلاصهٔ اعدادِ همین صفحه و سه تحلیلِ آماده → دستیارِ سراسری (فقط وقتی این تب باز است)
	useEffect(() => {
		if (phase !== 'ready') return
		setPageContext(() => aiSummaryRef.current())
		setPageActions(['analysis', 'strategy', 'risk'].map((m) => ({ label: AI_MODE[m], run: () => doAiRef.current(m) })))
		return () => { setPageContext(null); setPageActions([]) }
	}, [phase])

	/* ---------- ذخیره (همان fcSave + autosave) ---------- */
	const buildPatch = useCallback(() => {
		const cf = fRef.current, cx = xRef.current
		const patch: Extra = {}
		for (const id of FC_IDS) patch[id] = cf[id]
		Object.assign(patch, compute(cf, cx, ctxRef.current).derived)
		for (const k of dirtyX.current) patch[k] = cx[k]
		return patch
	}, [])
	const flush = useCallback(() => {
		if (!pending.current) return
		pending.current = false
		window.clearTimeout(timer.current)
		const patch = buildPatch()
		const keys = [...dirtyX.current]
		setSaveSt('saving')
		saveState((full) => { full.forecast = { ...(full.forecast && typeof full.forecast === 'object' ? full.forecast : {}), ...patch } })
			.then(() => { keys.forEach((k) => dirtyX.current.delete(k)); setSaveSt('ok') })
			.catch((e: Error) => { pending.current = true; setSaveSt('err'); setSaveErr(e.message === 'backup' ? 'بک‌آپ گرفته نشد؛ برای حفظِ داده ذخیره انجام نشد.' : e.message === 'empty' ? 'دادهٔ سرور خالی بود؛ ذخیره انجام نشد.' : 'ذخیره ناموفق بود؛ دوباره تلاش می‌شود.') })
	}, [buildPatch])
	const schedule = useCallback(() => {
		pending.current = true
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(flush, 900)
	}, [flush])
	useEffect(() => {
		const onHide = () => flush()
		window.addEventListener('beforeunload', onHide)
		return () => { window.removeEventListener('beforeunload', onHide); flush() }
	}, [flush])

	/** تغییرِ فیلدها — مثلِ رویدادِ input/change پنل: عادی‌سازی ← محاسبه ← ذخیره. */
	const update = useCallback((changes: Partial<Form> | ((cur: Form) => Partial<Form>), changedId?: string, extra?: Extra) => {
		const cur = fRef.current
		const ch = typeof changes === 'function' ? changes(cur) : changes
		if (extra) { xRef.current = { ...xRef.current, ...extra }; Object.keys(extra).forEach((k) => dirtyX.current.add(k)); setX(xRef.current) }
		const nf = normalize({ ...cur, ...(ch as Form) }, xRef.current, changedId)
		fRef.current = nf
		setF(nf)
		setMsgs((m) => (m.m4adj ? { ...m, m4adj: '' } : m))
		schedule()
	}, [schedule])

	const onText = (id: string) => (v: string) => {
		let val = v
		if (GRP.has(id) || id === 'fcUsd') val = faGroup(v)
		else if (NUM_IDS.has(id)) val = toLat(v).replace(/[^\d.-]/g, '')
		update({ [id]: val }, id)
	}

	/* ---------- اقدام‌ها ---------- */
	const doIndustry = (v: string) => update({ fcIndustry: v, ...industryDefaults(v) }, 'fcIndustry')
	const doM4Type = (v: string) => {
		const t = M4TYPES[v]
		if (t) { update({ fcM4type: v, fcM4r: String(t.r) }, 'fcM4type'); setMsg('m4note', t.note + M4REAL_MSG) }
		else { update({ fcM4type: v }, 'fcM4type'); setMsg('m4note', '«نرخ خرید» = چند درصد از بازار هدفِ نظرسنجی‌شده واقعاً می‌خرند.' + M4REAL_MSG) }
	}
	const doMarginStd = (v: string) => {
		setMarginStd(v)
		if (!v) return
		const txt = (MARGIN_STD.find((o) => o[0] === v)?.[1] || '').replace(/ — .*/, '')
		update({ fcMargin: v }, 'fcMargin')
		setMsg('margin', '✓ حاشیهٔ <b>' + fa(v) + '٪</b> از استانداردِ جهانیِ «' + txt + '» گذاشته شد. اگر عددِ واقعیِ خودت را داری، دستی عوضش کن.')
	}
	const doM1Sug = () => {
		const s = suggestBase(fRef.current, xRef.current)
		if (!s) { setMsg('m1', 'حداقل یک سال (ترجیحاً دو سال) از جدولِ فروشِ بالا را پر کن تا پیشنهاد ساخته شود.'); return }
		update({ fcM1: faGroup(s.m1) }, 'fcM1')
		setMsg('m1', 'پیشنهاد <b>' + sep(s.m1) + '</b> تومان = فروشِ «' + s.yrLbl + '» (' + sep(s.lastY) + ') × (۱+' + pct(s.infl * 100) + ' ' + s.src + ') × استراتژیِ ' + s.stratName + '. در تورم بالا، عددِ مدیریتی باید دستِ‌کم پا‌به‌پای دلار بیاید.')
	}
	const doM2Sug = () => {
		const s = suggestBase(fRef.current, xRef.current)
		if (!s) { setMsg('m2', 'حداقل یک سال (ترجیحاً دو سال) از جدولِ فروشِ بالا را پر کن تا پیشنهاد ساخته شود.'); return }
		update({ fcM2: faGroup(s.cons) + '، ' + faGroup(s.base) + '، ' + faGroup(s.opt) }, 'fcM2')
		setMsg('m2', 'سه سناریو حول تورم/دلار: محافظه‌کار <b>' + sep(s.cons) + '</b>، پایه <b>' + sep(s.base) + '</b>، خوش‌بینانه <b>' + sep(s.opt) + '</b> → میانهٔ دلفی = <b>' + sep(s.base) + '</b>.')
	}
	const doM4Adj = () => {
		const cf = fRef.current, n = (id: string) => fnum(cf[id])
		const strat = (cf.fcStrategy as string) || 'hold'
		const real = cf.fcM4real ? 0.65 : 1
		const depth = ((n('fcM4n') * n('fcM4a') * n('fcM4r')) / 100) * (n('fcM4rep') || 1) * real
		let lastSales = n('fcY3') || n('fcY2') || n('fcY1')
		const h = xRef.current.hist
		if (h && h.length) { const lh = h[h.length - 1]; if (lh && lh.total > lastSales) lastSales = lh.total }
		let share = 100, shareMsg = ''
		if (depth > 0 && lastSales > 0) {
			const cur = (lastSales / depth) * 100, mult = strat === 'grow' ? 1.3 : strat === 'survive' ? 0.9 : 1.0
			const multTxt = strat === 'grow' ? '۱٫۳× (رشد)' : strat === 'survive' ? '۰٫۹× (بقا)' : '۱٫۰× (حفظ)'
			share = Math.max(1, Math.min(100, Math.round(cur * mult)))
			shareMsg = 'سهمِ فعلی ≈' + fa(Math.round(cur)) + '٪ (فروش÷عمقِ بازار) × ' + multTxt + ' → <b>' + fa(share) + '٪</b>'
		} else shareMsg = 'عمقِ بازار (روش ۴) یا فروشِ تاریخی خالی است → سهم ۱۰۰٪ ماند؛ برای دقتِ بیشتر آن‌ها را پر کن.'
		const brand = strat === 'grow' ? 10 : strat === 'hold' ? 5 : 0
		const aware = strat === 'grow' ? 5 : 0
		const chan = Math.max(-15, Math.min(15, Math.round(((n('fcC6') - 50) / 50) * 15)))
		const comp = -5 - (n('fcC2') >= 70 ? 5 : 0)
		update({ fcM4share: String(share), fcM4brand: String(brand), fcM4aware: String(aware), fcM4chan: String(chan), fcM4comp: String(comp) }, 'fcM4share')
		setMsg('m4adj', '✓ پیشنهادِ سیستم اعمال شد — ' + shareMsg + ' · برند ' + (brand >= 0 ? '+' : '') + fa(brand) + '٪ و اورنس ' + (aware >= 0 ? '+' : '') + fa(aware) + '٪ (از استراتژیِ «' + STRAT_FA[strat] + '») · کانال ' + (chan >= 0 ? '+' : '') + fa(chan) + '٪ (از توانِ اجرایی، مؤلفهٔ ۶) · رقبا ' + fa(comp) + '٪ (رکود + تحلیلِ بازار، مؤلفهٔ ۲). این‌ها <b>نقطهٔ شروع</b>اند؛ با واقعیتِ کسب‌وکارت تنظیمشان کن.')
	}
	const aiSummary = () => {
		const cf = fRef.current, rr = compute(cf, xRef.current, ctxRef.current), n = (id: string) => fnum(cf[id])
		const indTxt = INDUSTRY_OPTS.find((o) => o[0] === cf.fcIndustry)?.[1] || '—'
		const L: string[] = []
		L.push('صنعتِ کسب‌وکار: ' + indTxt + ' | حاشیهٔ سودِ فعلی: ' + fa(n('fcMargin')) + '٪')
		L.push('سال هدف: ' + fa(n('fcTargetYear') || 0) + ' | استراتژی: ' + (STRAT_FA[cf.fcStrategy as string] || '—') + ' | افق: ' + fa(n('fcHorizon')) + ' | نرخ دلار امروز: ' + faGroup(n('fcUsd')) + ' تومان')
		L.push('فروش هدف: ' + sep(n('fcRevenue')) + ' تومان | حجم فروش: ' + faGroup(n('fcVolume')) + ' | بودجهٔ بازاریابی: ' + fa(n('fcMktPct')) + '٪')
		L.push('— تاریخچهٔ سالانه —')
		;[0, 1, 2].forEach((i) => {
			const yv = rr.y[i]
			if (yv <= 0) return
			const lbl = 'سال ' + fa(rr.yrs[i]) + (i === 2 ? ' (جدیدترین)' : '')
			const dv = rr.d[i], dol = rr.dol[i] > 0 ? '$' + sep(Math.round(rr.dol[i])) : '—'
			L.push(lbl + ': فروش ' + sep(yv) + ' تومان' + (dv > 0 ? ' | نرخ دلار ' + faGroup(dv) + ' | فروش دلاری ' + dol : ''))
		})
		L.push('رشد میانگین ریالی: ' + (rr.grs.length ? pct(rr.avgG) : '—') + ' | رشد واقعی (دلاری): ' + (rr.dg == null ? '—' : pct(rr.dg)) + ' | رگرسیونِ سال بعد: ' + sep(rr.next) + ' تومان')
		L.push('اجماعِ روش‌ها: ' + sep(rr.consensus) + ' تومان | میانه: ' + sep(rr.median) + ' | روش‌های پرشده: ' + fa(rr.filled.length) + ' از ۹')
		const ch = ctxRef.current.churn
		if (ch && ch.trans && ch.trans.length) L.push('میانگین نرخ ریزش مشتری: ' + pct(ch.trans.reduce((a: number, t: any) => a + t.rate, 0) / ch.trans.length))
		return L.join('\n')
	}
	// دستیارِ سراسری (پایینِ چپ): همان درخواستِ قبلیِ /api/ai (mode, context, kb, industry, business)؛ نتیجه در پنلِ گفت‌وگو
	const doAi = (mode: string) => {
		const c = ctxRef.current
		runPreset(mode, AI_MODE[mode] || 'تحلیل', { context: aiSummary(), industry: c.industry, business: c.business })
	}
	const doUsdFetch = () => {
		setUsdBusy(true)
		setMsg('usd', 'در حال دریافت نرخ دلار بازار آزاد…')
		// fcFillHistUsd
		const cur = fRef.current, yrs = compute(cur, xRef.current, ctxRef.current).yrs, histFilled: number[] = [], ch: Partial<Form> = {}
		;[0, 1, 2].forEach((i) => {
			const yy = yrs[i], v = fnum(cur['fcD' + (i + 1)])
			if (FC_USD_HIST[yy] && (v < 10000 || v > 500000)) { ch['fcD' + (i + 1)] = faGroup(FC_USD_HIST[yy]); histFilled.push(yy) }
		})
		if (Object.keys(ch).length) { fRef.current = { ...fRef.current, ...(ch as Form) }; setF(fRef.current) }
		const histMsg = () => (histFilled.length ? ' · نرخِ دلارِ سال‌های ' + histFilled.map(fa).join('، ') + ' هم پیش‌فرض پر شد (' + histFilled.map((y) => faGroup(FC_USD_HIST[y])).join('، ') + ' تومان).' : '')
		const faLat = (s: unknown) => toLat(String(s)).replace(/[^\d.]/g, '')
		const done = (toman: number) => {
			setUsdBusy(false)
			if (toman >= 10000 && toman <= 20000000) {
				update({ fcUsd: faGroup(Math.round(toman)) }, 'fcUsd')
				setMsg('usd', 'نرخ دلار دریافت شد: <b>' + sep(Math.round(toman)) + '</b> تومان (منبع: tgju).' + histMsg())
			} else {
				update({}, 'fcUsd')
				setMsg('usd', 'نرخِ امروز به‌صورت آنلاین دریافت نشد (نیاز به اینترنت) — دستی وارد کن.' + histMsg())
			}
		}
		const tries: { u: string; pick: (j: any) => number }[] = [
			{ u: 'https://call3.tgju.org/ajax.json', pick: (j) => parseFloat(faLat(j.current.price_dollar_rl.p)) / 10 },
			{ u: 'https://call.tgju.org/ajax.json', pick: (j) => parseFloat(faLat(j.current.price_dollar_rl.p)) / 10 },
			{ u: 'https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl', pick: (j) => parseFloat(faLat(j.data[0][0])) / 10 },
		]
		let i = 0
		const next = () => {
			if (i >= tries.length) return done(0)
			const t = tries[i++]
			fetch(t.u, { cache: 'no-store' })
				.then((q) => q.json())
				.then((j) => { let v = 0; try { v = t.pick(j) } catch { v = 0 } if (v > 0) done(v); else next() })
				.catch(next)
		}
		next()
	}
	const doAutoSetup = () => {
		const why: string[] = []
		const ch = ctxRef.current.churn
		const churnR = ch && ch.trans && ch.trans.length ? ch.trans[ch.trans.length - 1].rate : 0
		const pm = (xRef.current.plMonthly && xRef.current.plMonthly.months) || null
		let recentNeg = false, marginDrop = false
		if (pm) {
			const v = pm.filter((q: any) => q && q.sales > 0)
			if (v.length >= 2) { const last = v[v.length - 1], first = v[0]; recentNeg = last.net < 0; marginDrop = first.margin - last.margin > 10 }
		}
		let strat: string
		if (recentNeg || churnR > 45) { strat = 'survive'; why.push(recentNeg ? 'سود خالصِ ماه‌های اخیر منفی شده' : 'نرخ ریزش بالای ۴۵٪') }
		else if (marginDrop || churnR > 30) { strat = 'hold'; why.push(marginDrop ? 'حاشیهٔ سود در حال افت است' : 'ریزشِ قابل‌توجه') }
		else { strat = 'grow'; why.push('حاشیه و سود سالم است') }
		const hMap: Record<string, number> = { survive: 3, hold: 4, grow: 6 }
		update({ fcStrategy: strat, fcHorizon: String(hMap[strat]), fcHorizonUnit: '1' }, 'fcStrategy')
		doUsdFetch()
		setMsg('setup', '✓ استراتژی پیشنهادی: <b>' + STRAT_FA[strat] + '</b> (' + why.join('، ') + ') · افق: <b>' + fa(hMap[strat]) + ' ماه</b> · نرخ دلار به‌صورت آنلاین درخواست شد (اگر شبکه اجازه دهد). می‌توانی هرکدام را دستی تغییر بدهی.')
	}
	const doAutoPyramid = () => {
		const mb = compute(fRef.current, xRef.current, ctxRef.current).monthlyBlended
		const yr = mb ? mb.reduce((a: number, b: number) => a + (b || 0), 0) : 0
		const strat = (fRef.current.fcStrategy as string) || 'hold'
		const mk = ({ survive: 4, hold: 6, grow: 12 } as Record<string, number>)[strat] || 6
		const parts: string[] = []
		const ch: Partial<Form> = { fcMktPct: String(mk) }
		if (yr > 0) { ch.fcRevenue = faGroup(Math.round(yr)); parts.push('فروش هدف = پیش‌بینی سال (' + sep(Math.round(yr)) + ' تومان)') }
		else parts.push("<span style='color:var(--fc-brass)'>ابتدا در گام روش‌ها پیش‌بینی ماهانه بساز تا «فروش هدف» خودکار پر شود</span>")
		parts.push('بودجهٔ بازاریابی = ' + fa(mk) + '٪ (راهنمای استراتژی «' + STRAT_FA[strat] + '»)')
		update(ch, 'fcMktPct')
		setMsg('pyramid', '✓ ' + parts.join(' · ') + '. «حجم فروش» را دستی وارد کن (یا اگر میانگین قیمتِ هر واحد را داری: حجم = فروش ÷ قیمت).')
	}
	const doAutoReady = () => {
		const h = xRef.current.hist, histN = (h && h.length) || 0
		const c1 = histN >= 3 ? 100 : histN === 2 ? 85 : histN === 1 ? 55 : 25
		let deals = 0
		ctxRef.current.people.forEach((p: any) => { deals += (p.inv || []).length })
		const c3 = deals >= 30 ? 85 : deals > 0 ? 60 : 35
		const hasMonthly = !!(h && h.some((q: any) => (q.months || []).some((v: number) => v > 0)))
		const c5 = hasMonthly ? 90 : 40
		const c6 = fnum(fRef.current.fcFixed) > 0 && fnum(fRef.current.fcMargin) > 0 ? 85 : 50
		update({ fcC1: String(c1), fcC3: String(c3), fcC5: String(c5), fcC6: String(c6) }, 'fcC1')
	}
	const doClearMonth = () => {
		if (!window.confirm('داده‌ی ماهانه پاک شود؟')) return
		update({}, undefined, { hist: null })
		setMsg('month', 'داده‌ی ماهانه پاک شد.')
	}
	const doSel = (on: boolean) => {
		const ch: Partial<Form> = {}
		for (let k = 1; k <= 9; k++) ch['fcUse' + k] = on
		update(ch, 'fcUse1')
	}
	const doUnit = (v: string) => {
		const res = fillAnnual({ ...fRef.current, fcUnit: v }, xRef.current)
		if (res) update({ ...res.f, fcUnit: v }, 'fcUnit', { _dollarWarn: res.warn })
		else update({ fcUnit: v }, 'fcUnit')
	}
	const doApplyTargets = async () => {
		setConfirmApply(false)
		const mb = compute(fRef.current, xRef.current, ctxRef.current).monthlyBlended
		if (!mb || !mb.length || mb.reduce((a: number, b: number) => a + (b || 0), 0) <= 0) {
			setMsg('apply', '<b style="color:var(--fc-rose)">اول در گام روش‌ها پیش‌بینی ماهانه را بساز</b> (حداقل یک روش با داده)، بعد این دکمه را بزن.')
			return
		}
		pending.current = false
		window.clearTimeout(timer.current)
		const patch = buildPatch()
		let nSales = 0
		const ty = fnum(fRef.current.fcTargetYear)
		setSaveSt('saving')
		try {
			await saveState((full) => {
				full.forecast = { ...(full.forecast && typeof full.forecast === 'object' ? full.forecast : {}), ...patch }
				const fy = String(full.fy || '')
				const years = full.years && typeof full.years === 'object' ? full.years : null
				const curB = (fy && years && years[fy] && years[fy].budget) || full.budget || {}
				const B: Record<string, number> = { ...curB }
				for (let m = 0; m < 12; m++) B[m] = Math.round((mb[m] || 0) / 1e6)
				const people: any[] = full.people || []
				let sales = people.filter((p) => { if (p && p.inactive) return false; const ro = (p && p.role) || 'sales'; return ro === 'sales' || (ro === 'salesmgr' && !!full.salesCrisis) })
				if (!sales.length) sales = people.slice()
				const lw = (p: any) => LEVELW[(p && p.level) || 'junior'] || 1
				const sumW = sales.reduce((s, p) => s + lw(p), 0) || 1
				const T: Record<string, number[]> = {}
				sales.forEach((p) => { const w = lw(p) / sumW, arr: number[] = []; for (let m = 0; m < 12; m++) arr[m] = Math.round((mb[m] || 0) * w); T[p.id] = arr })
				nSales = sales.length
				full.budget = B
				full.BUDGET = B
				full.targets = T
				if (fy && years) full.years = { ...years, [fy]: { ...(years[fy] || {}), budget: B, targets: T } }
			}, { forceBackup: true, tag: 'react-apply-targets' })
			setSaveSt('ok')
			setMsg('apply', '✓ بودجهٔ ۱۲ ماهِ سال <b>' + fa(ty || '') + '</b> در «تارگت فروش ماه» قرار گرفت و بین <b>' + fa(nSales) + '</b> کارشناس فروش بر اساس سطح تقسیم شد. جدول تارگت کارشناسان در «داشبورد مدیریتی» است.')
		} catch (e) {
			setSaveSt('err')
			setMsg('apply', '<b style="color:var(--fc-rose)">اعمال نشد' + ((e as Error).message === 'backup' ? ' — بک‌آپ گرفته نشد، برای حفظِ داده هیچ تغییری نوشته نشد.' : ' — هیچ تغییری روی تارگت‌ها نوشته نشد.') + '</b>')
		}
	}

	const aiSummaryRef = useRef(aiSummary)
	const doAiRef = useRef(doAi)
	useLayoutEffect(() => { aiSummaryRef.current = aiSummary; doAiRef.current = doAi })

	/* ---------- وضعیت‌ها ---------- */
	if (phase === 'loading')
		return (
			<div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال بارگذاریِ پیش‌بینی…">
				<div className={`grid gap-6 rounded-2xl bg-card p-6 ring-1 ring-border md:grid-cols-[300px_1fr] shadow-card`}>
					<div className="mx-auto h-[230px] w-full max-w-[300px] animate-pulse bg-muted" style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />
					<div className="flex flex-col justify-center gap-3">
						{[0, 1, 2].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-muted/70" />)}
					</div>
				</div>
				{[0, 1].map((i) => <div key={i} className={`h-[220px] animate-pulse rounded-2xl bg-card ring-1 ring-border shadow-card`} />)}
			</div>
		)
	if (phase !== 'ready')
		return (
			<div className={`rounded-2xl bg-card p-8 text-center ring-1 ring-border shadow-card`}>
				<p className="text-[14px] font-bold">{phase === 'denied' ? 'این بخش برای نقشِ شما در دسترس نیست.' : 'این بخش باز نشد.'}</p>
				{err && <p className="mt-1 text-[12px] text-error">{err}</p>}
			</div>
		)

	const v = (id: string) => String(f[id] ?? '')
	const txt = (id: string, extra?: { ph?: string; ltr?: boolean; w?: string }) => (
		<input value={v(id)} onChange={(e) => onText(id)(e.target.value)} inputMode={GRP.has(id) || NUM_IDS.has(id) || id === 'fcUsd' ? 'numeric' : undefined}
			placeholder={extra?.ph} dir={extra?.ltr === false ? undefined : 'ltr'} className={`${inCls} ${extra?.w || ''} text-left`} />
	)
	const sel = (id: string, opts: [string, string][], onCh?: (v: string) => void, w = '') => (
		<select value={v(id)} onChange={(e) => (onCh ? onCh(e.target.value) : update({ [id]: e.target.value }, id))} className={`${inCls} ${w}`}>
			{opts.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
		</select>
	)
	const range = (id: string, min: number, max: number, step: number) => (
		<input type="range" min={min} max={max} step={step} value={fnum(f[id])} onChange={(e) => update({ [id]: e.target.value }, id)} className="w-full accent-primary" />
	)
	const check = (id: string, label: ReactNode) => (
		<label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold">
			<input type="checkbox" checked={!!f[id]} onChange={(e) => update({ [id]: e.target.checked }, id)} className="size-4 accent-primary" />
			{label}
		</label>
	)
	const ind = String(f.fcIndustry || '')
	const indN = industryNote(ind, r.ty)
	const usdCell = (t: number) => (r.usd > 0 && t > 0 ? '$' + sep(Math.round(t / r.usd)) : '—')
	const mo = r.monthly
	const LBL: Record<number, string> = { 1: 'مدیریتی', 2: 'دلفی', 3: 'تیم فروش', 4: 'مشتری', 5: 'رگرسیون', 6: 'م.متحرک', 7: 'هموارسازی', 8: 'سربه‌سر', 9: 'ظرفیت' }
	const indFa = IND_FA[ind || 'general'] || 'عمومی'
	const saveBadge =
		saveSt === 'saving' ? ['bg-warning/10 text-warning ring-warning/30', 'در حال ذخیره…'] : saveSt === 'ok' ? ['bg-success/10 text-success ring-success/30', 'ذخیره شد ✓ (MariaDB)'] : saveSt === 'err' ? ['bg-error/10 text-error ring-error/30', saveErr] : ['bg-muted text-muted-foreground ring-border', 'هر تغییر خودکار ذخیره می‌شود']
	const importBtn = goImport && <Btn kind="ghost" sm onClick={() => { flush(); goImport() }}><Icon n="upload" className="size-3.5" />ایمپورت فایل (مرکز ایمپورت)</Btn>
	// هرمِ خلاصه — فقط نمایشِ همان خروجی‌های compute (بدون محاسبهٔ تازه)
	const va = r.va, vaOn = !!(r.monthlyForecast && va.nM), vaGap = va.sumA - va.sumF, vaPct = va.sumF > 0 ? (vaGap / va.sumF) * 100 : 0
	const yearF = mo && mo.blTot > 0 ? mo.blTot : 0
	const pyramid: PyTier[] = [
		{
			tier: 'blue', title: 'نتایج کسب‌وکار', label: 'واقعی در برابر پیش‌بینی',
			value: vaOn ? <span style={{ color: vaGap >= 0 ? GREEN : ROSE }}>{vaGap >= 0 ? '▲ جلو ' : '▼ عقب '}{pct(Math.abs(vaPct))}</span> : '—',
			sub: vaOn ? 'واقعی ' + sep(Math.round(va.sumA)) + ' تومان در ' + fa(va.nM) + ' ماه' : 'هنوز ماهی عددِ واقعی ندارد',
		},
		{
			tier: 'purple', title: 'اهداف فروش', label: yearF ? 'پیش‌بینی سال ' + fa(r.ty) : 'فروش هدف',
			value: yearF ? sep(yearF) : r.R > 0 ? sep(r.R) : '—',
			sub: 'فروش هدف ' + (r.R > 0 ? sep(r.R) : '—') + ' · هدفِ محافظه‌کارانه ' + sep(r.safeT),
		},
		{
			tier: 'gold', title: 'فعالیت‌های فروش', label: 'آمادگی پیش‌بینی',
			value: pct(r.ready),
			sub: fa(r.filled.length) + ' روش از ۹ پر شده · ' + fa((x.hist && x.hist.length) || 0) + ' سال دادهٔ ماهانه',
		},
	]

	return (
		<div dir="rtl" className="fc-root flex flex-col gap-6 pb-24 selection:bg-primary/15" style={VARS}>
			<PyramidOverview tiers={pyramid} badge={saveBadge} />

			{/* ۲) راهنما */}
			<section className={`rounded-2xl bg-card ring-1 ring-border shadow-card`}>
				<details className="group">
					<summary className={`flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
						<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Icon n="book" className="size-[18px]" /></span>
						<span className="min-w-0 flex-1">
							<span className="block text-[15px] font-extrabold leading-7">راهنمای روش‌ها و فرمول‌ها</span>
							<span className="block text-[12px] leading-5 text-muted-foreground">خلاصهٔ مرجعِ ۹ روش، فرمول‌ها و ابزارهای تعدیل</span>
						</span>
						<Icon n="chev" className="size-5 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
					</summary>
					<div className="space-y-4 border-t border-border/70 px-5 pb-6 pt-4 text-[12.5px] leading-7 sm:px-6">
						<p className="text-muted-foreground">پیش‌بینی فروش = <b>تخمین + انتظار + دورهٔ برنامه</b> با تولرانسِ ۱۰ تا ۲۰٪. لازم نیست همهٔ روش‌ها را پر کنی؛ هرچه روش‌های بیشتری به هم نزدیک باشند، تخمین معتبرتر است. خروجیِ نهایی = <b>میانگینِ روش‌های انتخاب‌شده</b>.</p>
						<div className="overflow-auto rounded-xl ring-1 ring-border">
							<table className="w-full min-w-[900px] border-collapse text-[12.5px]">
								<thead><tr className="bg-primary text-primary-foreground"><Th className="text-center">#</Th><Th>روش</Th><Th>چه می‌کند</Th><Th>فرمول</Th><Th>کِی</Th><Th className="bg-[#1E8E3E]">مثال (بر اساس صنعت)</Th></tr></thead>
								<tbody>
									{GUIDE.map((m, i) => (
										<tr key={m[0]} className={i % 2 ? 'bg-[var(--fc-brass-soft)]' : ''}>
											<td className="border-t border-border p-2.5 text-center"><span className="inline-grid size-[26px] place-items-center rounded-lg bg-accent font-extrabold text-[#3A2A00]">{m[0]}</span></td>
											<td className="border-t border-border p-2.5"><b>{m[1]}</b><div dir="ltr" className="text-right text-[10.5px] text-muted-foreground">{m[2]}</div></td>
											<td className="border-t border-border p-2.5 text-muted-foreground">{m[3]}</td>
											<td className="border-t border-border p-2.5"><span className="inline-block rounded-lg bg-card px-2 py-1.5 font-mono text-[11.5px] leading-6 text-primary-ink ring-1 ring-border">{m[4]}</span></td>
											<td className="border-t border-border p-2.5 text-[11.5px] text-muted-foreground">{m[5]}</td>
											<td className="border-t border-border bg-success/[.07] p-2.5 text-[11.5px] text-success">{guideEx(m[0], ind)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="text-muted-foreground">ستونِ <b>مثال</b> بر اساسِ صنعتِ انتخاب‌شده («<b>{indFa}</b>») نمایش داده می‌شود — صنعت را در گامِ ۱ عوض کنی، مثال‌ها هم عوض می‌شوند.</p>
						<details open className="rounded-xl bg-primary/[.035] px-4 ring-1 ring-primary/15">
							<summary className="flex cursor-pointer items-center gap-2 py-3 font-extrabold text-primary-ink"><Icon n="trend" />هموارسازیِ نمایی (Holt): توضیحِ دقیق</summary>
							<div className="pb-3.5 text-muted-foreground">
								<p className="mb-2">برخلافِ «میانگینِ متحرک» که همهٔ ماه‌ها را یکسان می‌بیند، Holt سریِ ماهانه را با <b>دو مؤلفهٔ زنده</b> دنبال می‌کند و هر ماه به‌روزشان می‌کند:</p>
								<div dir="ltr" className="mb-2.5 rounded-lg bg-[var(--fc-brass-soft)] px-3 py-2.5 font-mono text-[12px] leading-8 text-primary-ink ring-1 ring-border">
									Lₜ = α·xₜ + (1−α)·(Lₜ₋₁ + Tₜ₋₁) ← سطح (Level)<br />Tₜ = β·(Lₜ − Lₜ₋₁) + (1−β)·Tₜ₋₁ ← روند (Trend)<br />پیش‌بینیِ k ماهِ بعد = Lₜ + k·Tₜ
								</div>
								<ul className="list-disc space-y-1 pr-5">
									<li><b>سطح (L):</b> برآوردِ «الانِ» فروش. <b>روند (T):</b> شیبِ تغییر (رشد یا افت در هر ماه).</li>
									<li><b>α (آلفا):</b> وزنِ داده‌های اخیر. آلفای بالا (۰٫۷–۰٫۹) یعنی به فروشِ ماه‌های اخیر بیشتر بها بده — <b>مناسبِ بازارِ تورمیِ ایران</b> که سریع عوض می‌شود. آلفای پایین = هموارترِ ولی کندتر.</li>
									<li><b>β (بتا):</b> وزنِ تغییرِ روند (پیش‌فرض ۰٫۱۵).</li>
									<li>چون روند را می‌بیند، اگر فروش رو به رشد باشد Holt هم پیش‌بینیِ رو به رشد می‌دهد — نه یک عددِ صاف.</li>
								</ul>
								<p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-success"><b>مثالِ «{indFa}»:</b> {guideEx('۷', ind)} — یعنی روند در پیش‌بینی دیده می‌شود، نه فقط میانگین.</p>
							</div>
						</details>
						<div className="rounded-xl bg-[var(--fc-brass-soft)] px-4 py-3.5 ring-1 ring-accent/40">
							<b className="text-primary-ink">گامِ دومِ روش ۴ — تعدیلِ پتانسیلِ فروش (فصل ۱۸):</b>
							<div className="mt-1.5 font-mono text-[12px] text-primary-ink">پتانسیلِ فروش = پتانسیلِ بازار × سهم٪ × (۱+برند٪) × (۱+اورنس٪) × (۱+کانال٪) × (۱+رقبا٪)</div>
							<div className="mt-1.5 text-[12px] text-muted-foreground">مثالِ کافی‌شاپِ جزوه: عمقِ بازار ۵۰ میلیارد × سهمِ ۱۰٪ = ۵ میلیارد → ×۱٫۲ (برند) → ×۰٫۹ (کانالِ ضعیف) → ×۰٫۸۵ (رقبای قوی) = <b className="text-success">۴٫۵۹ میلیارد</b>. ضریبی اعمال می‌شوند، نه جمع‌وتفریقی.</div>
							<div className="mt-2.5 overflow-auto rounded-lg bg-card ring-1 ring-border">
								<table className="w-full min-w-[520px] text-[12px]">
									<thead><tr className="bg-primary text-primary-foreground"><Th>المان</Th><Th>معنی</Th><Th>بازهٔ عادی</Th></tr></thead>
									<tbody>
										{[
											['سهم بالقوه', 'Share', 'چند درصد از کلِ بازار را هدف گرفته‌ای؟ = فروشِ پارسال ÷ عمقِ بازار.', '۱–۱۰۰٪'],
											['برند', 'Brand', 'قدرتِ برند روی قیمت و وفاداری. در ایران تا سقفِ ~۲۰٪ منطقی است.', '۰ تا +۲۰٪'],
											['اورنس', 'Awareness', 'شناخته‌شدگی: اگر بازار سه برندِ اولِ صنعت را نام ببرد، اسمِ تو هست؟ سطحش (محله/شهر/کشور) مهم است.', '−۲۰ تا +۲۰٪'],
											['کانال', 'Channel', 'گستردگیِ توزیع/تعدادِ شعب و نقاطِ دسترسی. بیشتر = پتانسیلِ بالاتر.', '−۱۵ تا +۱۵٪'],
											['رقبا', 'Competitors', 'قدرت و تعدادِ رقبا. رقیبِ قوی هم سهم و هم قدرتِ قیمت‌گذاری را کم می‌کند (معمولاً منفی).', '−۲۰ تا ۰٪'],
										].map((q, i) => (
											<tr key={q[0]} className={i % 2 ? 'bg-[var(--fc-brass-soft)]' : ''}>
												<Td className="whitespace-normal"><b>{q[0]}</b> <span className="text-muted-foreground">({q[1]})</span></Td>
												<Td className="whitespace-normal text-muted-foreground">{q[2]}</Td>
												<Td>{q[3]}</Td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<div className="mt-2 flex items-start gap-1.5 text-[12px] text-primary-ink"><Icon n="bulb" className="mt-1 size-3.5" /><span>دکمهٔ <b>«پیشنهاد خودکارِ سیستم»</b> در روش ۴، این چهار ضریب را از داده‌های موجود (فروش، عمقِ بازار، استراتژی، مؤلفه‌های آمادگی) خودکار پیشنهاد می‌دهد.</span></div>
						</div>
						<div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
							{[
								['توزیعِ فصلی و قمری', 'عددِ سالانهٔ روش‌های قضاوتی (۱–۴، ۸، ۹) با الگوی فصلیِ صنعت پخش می‌شود؛ ۵/۶/۷ مستقیم ماهانه‌اند. رمضان و محرم خودکار (قمری) اعمال می‌شوند.'],
								['حاشیهٔ احتیاطِ ریسک', 'بر پایهٔ تعهدِ مالی، ریسک‌پذیری و دارایی: هدفِ امن = پیش‌بینی × (۱ − safety)'],
								['شامخ ← سیاستِ فروش (فصل ۱۵)', 'مرزِ ۵۰: ≥۵۰ نقدی · <۵۰ اقساطی. قیمتِ مدت‌دار = نقدی × (۱+تورمِ‌ماهانه)^ماه ÷ (۱−ریسکِ‌چک).'],
								['استراتژی ← بودجهٔ بازاریابی', 'بقا ۳–۵٪ · حفظ ۵–۱۰٪ · رشد ۱۰–۱۵٪ (درصدی از فروش).'],
							].map((b) => (
								<div key={b[0]} className="rounded-xl p-3.5 ring-1 ring-border"><b>{b[0]}</b><div className="mt-1 text-[12px] text-muted-foreground">{b[1]}</div></div>
							))}
						</div>
					</div>
				</details>
			</section>

			<Band tier="gold" title="فعالیت‌های فروش" desc="پایهٔ پیش‌بینی: صنعت، افق و استراتژی، دادهٔ تاریخی و آمادگی">
				{/* ۱) صنعت */}
				<Card title="صنعتِ کسب‌وکارت چیست؟" sub="اول صنعت را انتخاب کن تا پیش‌فرض‌های تخصصی (حاشیهٔ سود، الگوی فصلی، نرخ خرید…) خودکار اعمال شود">
					<div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,380px)_1fr]">
						<label className="block"><Label>صنعتِ کسب‌وکار: پیش‌فرض‌های تخصصی</Label>{sel('fcIndustry', INDUSTRY_OPTS, doIndustry)}</label>
						{indN && <div className="rounded-xl bg-[var(--fc-brass-soft)] px-4 py-3 text-[12.5px] leading-7 text-foreground ring-1 ring-accent/35" dangerouslySetInnerHTML={{ __html: indN }} />}
					</div>
				</Card>

				{/* ۳) افق، استراتژی، دلار */}
				<Card title="پیش‌بینی فروش و بودجه‌بندی" sub="ابزار عملیِ برگرفته از جزوه‌ی «بودجه‌بندی و پیش‌بینی فروش»">
					<p className="mb-3 text-[12.5px] leading-7 text-muted-foreground">پیش‌بینی فروش یعنی <b>تخمینِ</b> حجم فروشی که می‌توان «انتظار» داشت (نه آرزو)، در یک «افق زمانی» مشخص و با تولرانس ۱۰ تا ۲۰ درصد. این تب اعداد را از تو می‌گیرد و زنده محاسبه می‌کند؛ همه چیز روی سرور ذخیره می‌شود.</p>
					<div className="grid items-end gap-4 @2xl:grid-cols-3">
						<label className="block"><Label>افق دید برنامه (ماه / فصل / سال)</Label>
							<div className="flex gap-1.5">{txt('fcHorizon')}{sel('fcHorizonUnit', [['1', 'ماه'], ['3', 'فصل'], ['12', 'سال']], undefined, '!w-24 shrink-0')}</div>
						</label>
						<label className="block"><Label>استراتژی امسال</Label>{sel('fcStrategy', [['survive', 'بقا (Survival) — فقط بمانم'], ['hold', 'حفظ (Hold) — سهم بازار را نگه دارم'], ['grow', 'رشد (Growth) — سهم بازار بگیرم']])}</label>
						<p className="text-[12px] leading-6 text-muted-foreground">{r.stratNote}</p>
					</div>
					<div className="mt-4"><Btn onClick={doAutoSetup}>پیشنهاد خودکار (افق، استراتژی و نرخ دلار)</Btn></div>
					{msg.setup && <Html className="mt-1.5" h={msg.setup} />}
					<div className="mt-5 grid items-end gap-4 border-t border-border/70 pt-4 @2xl:grid-cols-3">
						<label className="block"><Label>نرخ دلار امروز (تومان): مبنای محاسبه‌ی دلاری</Label>
							<div className="flex gap-1.5">{txt('fcUsd', { ph: 'مثلاً ۱۸۷٬۵۱۵' })}<Btn kind="ghost" onClick={doUsdFetch} disabled={usdBusy}>دریافت آنلاین</Btn></div>
						</label>
						<div className="@2xl:col-span-2"><Html h={msg.usd || 'اولویت با نگاه دلاری است: نرخ دلار را وارد کن (یا آنلاین بگیر) تا همه‌ی اعداد معادل دلاری هم نشان داده شوند و از تورم گول نخوری.'} /></div>
					</div>
				</Card>

				{/* ۵) داده‌ی تاریخی */}
				<Card title="پیش‌بینی از داده‌ی تاریخی" sub="قابل‌اعتمادترین داده؛ سه سال اخیر را وارد کن">
					<div className="mb-3 flex flex-wrap items-center gap-3">
						<Html h={'از فایل «صورت سود و زیان» (هر ماه یک شیت) خودکار استخراج می‌شود: <b>فروش خالص ماهانه</b> (→ داده‌ی تاریخی)، <b>حاشیه سود ناخالص</b> و <b>هزینهٔ ثابت (اداری/فروش)</b> (→ روش نقطه‌ی سربه‌سر). فایل نباید رمز داشته باشد.'} />
						{importBtn}
					</div>
					<div className="overflow-auto rounded-xl ring-1 ring-border">
						<table className="w-full min-w-[620px] text-[12.5px]">
							<thead className="bg-muted/60"><tr><Th>سال</Th><Th>فروش ریالی (تومان)</Th><Th>میانگین نرخ دلار (تومان، اختیاری)</Th><Th>فروش دلاری</Th><Th>رشد ریالی</Th></tr></thead>
							<tbody>
								{[0, 1, 2].map((i) => {
									const g = i === 1 ? r.g2 : i === 2 ? r.g3 : null
									return (
										<tr key={i}>
											<Td><b>سال {fa(r.yrs[i])}</b>{i === 2 ? ' (جدیدترین)' : ''}</Td>
											<Td>{txt('fcY' + (i + 1))}</Td>
											<Td>{txt('fcD' + (i + 1))}</Td>
											<Td>{r.dol[i] > 0 ? '$' + sep(Math.round(r.dol[i])) : '—'}</Td>
											<Td>{i === 0 || g == null ? '—' : <Colored v={g}>{pct(g)}</Colored>}</Td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
					<Figs>
						<Fig k="میانگین رشد ریالی سالانه" v={r.grs.length ? pct(r.avgG) : '—'} u="دو گذار اخیر" />
						<Fig k="میانگین متحرک ۳ ساله" v={sep(r.ma3)} u="تومان — کف فروش عادی" />
						<Fig kind="gold" k="رشد دلاری کل دوره" v={r.dg == null ? '—' : <Colored v={r.dg}>{pct(r.dg)}</Colored>} u="تا از تورم گول نخوری" />
						<Fig kind="total" k="پیش‌بینی سال بعد (خطی)" v={sep(r.next)} u="تومان — بر پایه‌ی روند" />
					</Figs>
					<Html className="mt-2" h={r.histNote} />
				</Card>

				{/* ۱۱) آمادگی */}
				<Card title="آمادگی پیش‌بینی: شش مؤلفه" sub="هرچه کامل‌تر، تخمین به تولرانس ۱۰–۲۰٪ نزدیک‌تر">
					<Btn onClick={doAutoReady}>پرکردن خودکار از داده‌های موجود</Btn>
					<details className="my-4 rounded-xl bg-muted/40 ring-1 ring-border">
						<summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 font-bold text-primary-ink"><Icon n="info" />این شش مؤلفه چیستند و از کجا بدانم؟</summary>
						<div className="px-3.5 pb-3 text-[12px] leading-7 text-muted-foreground">
							<b>۱) داده‌های تاریخی:</b> آیا فروش چند سال گذشته را داری؟ (خودکار از جدول/اکسل شما پر می‌شود.)<br />
							<b>۲) تحلیل بازار:</b> رقبا، تغییر رفتار مصرف‌کننده، قانون/تحریم، نرخ ارز — <i>دستی</i>؛ از اخبار صنف و رقبا.<br />
							<b>۳) قیف فروش و CRM:</b> وضعیت لید و نرخ تبدیل — خودکار از دفتر فروش/داده‌ی شما.<br />
							<b>۴) شاخص‌های کلان:</b> شامخ (PMI)، تورم، نرخ ارز — <i>دستی</i>؛ از اتاق بازرگانی و بانک مرکزی.<br />
							<b>۵) تقویم فصلی:</b> ماه‌های خوب/بد کسب‌وکارت — خودکار اگر داده‌ی ماهانه وارد کرده باشی.<br />
							<b>۶) عوامل داخلی:</b> خط تولید، نیرو، نقدینگی — خودکار اگر صورت سود و زیان را ایمپورت کرده باشی.<br />
							دکمهٔ بالا مؤلفه‌های ۱، ۳، ۵ و ۶ را از داده‌ها پر می‌کند؛ ۲ و ۴ را چون قضاوتی‌اند خودت تنظیم کن.
						</div>
					</details>
					<div className="grid items-start gap-6 @4xl:grid-cols-[1fr_300px]">
					<div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2">
						{[
							['fcC1', '۱) داده‌های تاریخی'], ['fcC2', '۲) تحلیل بازار — رقبا، مصرف‌کننده، قانون/ارز'], ['fcC3', '۳) قیف فروش و CRM'],
							['fcC4', '۴) شاخص‌های کلان — شامخ، تورم، ارز'], ['fcC5', '۵) تقویم فصلی کسب‌وکار'], ['fcC6', '۶) عوامل داخلی سازمان'],
						].map(([id, l]) => (
							<label key={id} className="block"><Label>{l} (۰–۱۰۰): <b className="text-foreground">{fa(fnum(f[id]))}</b></Label>{range(id, 0, 100, 5)}</label>
						))}
					</div>
					<div className="grid grid-cols-2 gap-2.5 @4xl:grid-cols-1">
						<Fig kind="total" k="نمره‌ی آمادگی" v={pct(r.ready)} u="میانگین شش مؤلفه" />
						<Fig small k="کیفیت خروجی" v={<span style={{ color: r.tol.c }}>{r.tol.t}</span>} u={r.tol.u} />
					</div>
					</div>
				</Card>
			</Band>

			<Band tier="purple" title="اهداف فروش" desc="فروشِ هدف، نُه روشِ پیش‌بینی، بودجهٔ ماهانه و حاشیهٔ احتیاط">
				{/* ۴) هرم */}
				<Card title="هرم سه‌گانه‌ی پیش‌بینی فروش" sub="اول عددِ فروش را تعیین کن، بعد بودجه را کنار بگذار، نه برعکس">
					<div className="grid items-end gap-4 @2xl:grid-cols-3">
						<label className="block"><Label>۱) فروش ریالی هدف، سالانه (تومان)</Label>{txt('fcRevenue')}</label>
						<label className="block"><Label>۲) حجم فروش تعدادی، سالانه (عدد)</Label>{txt('fcVolume')}</label>
						<label className="block"><Label>۳) بودجه‌ی بازاریابی (٪ از فروش)</Label>{txt('fcMktPct')}</label>
						<label className="block"><Label>قیمت هر واحد (تومان، اختیاری)</Label>{txt('fcUnitPrice')}</label>
						<p className="text-[12px] leading-6 text-muted-foreground @2xl:col-span-2">اگر «قیمت هر واحد» را پر کنی، <b>حجم فروش خودکار = فروش هدف ÷ قیمت</b> حساب می‌شود (نیمه‌خودکار). اگر خالی بگذاری، حجم را دستی وارد کن.</p>
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<Html h={x.volSource ? 'حجم فروش از فایل «ProductRank»: <b>' + faGroup(x.volSource.sold) + '</b> واحد از <b>' + fa(x.volSource.nProd) + '</b> محصول (حملِ بار حذف شد).' : 'فایل «ProductRank» جولیو را بده؛ تعدادِ فروخته‌شده (ستون «بستن») همهٔ محصولات جمع می‌شود و <b>«حمل بار» و خدمات حمل خودکار حذف می‌شوند</b> → حجم فروش پر می‌شود.'} />
						{importBtn}
					</div>
					<Figs>
						<Fig kind="total" k="بودجه‌ی بازاریابی" v={sep(r.mkt)} u="تومان — مثل مالیات، اول کنار بگذار" />
						<Fig k="میانگین قیمت هر واحد" v={sep(r.avgP)} u="تومان (فروش سالانه ÷ حجم سالانه)" />
						<Fig k="فروش لازم در هر ماه" v={sep(r.perMonth)} u="تومان (فروش سالانه ÷ ۱۲)" />
						<Fig kind="gold" k="فروش لازم در افقِ انتخابی" v={sep(r.perHorizon)} u={'تومان در ' + fa(r.Hm) + ' ماهِ افق'} />
					</Figs>
					<div className="mt-4"><Btn onClick={doAutoPyramid}>پیشنهاد خودکار (فروش هدف و بودجهٔ بازاریابی)</Btn></div>
					{msg.pyramid && <Html className="mt-1.5" h={msg.pyramid} />}
					<Html className="mt-1.5" h={r.pyramidNote} />
				</Card>

				{/* ۸) نه روش */}
				<Card title="نه روش پیش‌بینی فروش" sub="لازم نیست همه را پر کنی؛ ۵ روش هم کافی‌ست، بعد میانگین می‌گیریم">
					<p className="mb-2 text-[12.5px] leading-7 text-muted-foreground">همه‌ی اعداد به <b>تومان</b>اند. روش‌های «رگرسیون» و «میانگین متحرک» خودکار از جدول سه‌ساله‌ی بالا حساب می‌شوند. هرچه روش‌های بیشتری پر کنی و به هم نزدیک‌تر باشند، تخمین معتبرتر است.</p>
					<details className="mb-3 rounded-xl bg-muted/40 ring-1 ring-border">
						<summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 font-extrabold text-primary-ink"><Icon n="book" />راهنمای روش‌ها و مفاهیم</summary>
						<div className="space-y-2 px-4 pb-3.5 text-[12.5px] leading-8 text-muted-foreground">
							<p><b>کدام داده دستی است، کدام خودکار؟</b> روش‌های <b>۵ رگرسیون / ۶ میانگین متحرک / ۷ هموارسازی</b> کاملاً خودکار از جدول سه‌سالهٔ بالا حساب می‌شوند. روش‌های <b>۱ تا ۴ و ۸ و ۹</b> عددِ دستی می‌خواهند (نظر مدیر، کارشناسان، مشتری، هزینهٔ ثابت، ظرفیت). «نقطهٔ سربه‌سر (۸)» و «حاشیه» با ایمپورت صورت سود و زیان هم خودکار پر می‌شوند.</p>
							<p>۱) نظر مدیریتی: عددِ فروشِ کلِ سال (شهودِ مدیر). · ۲) دلفی: اعداد چند کارشناس با ویرگول → میانه. · ۳) تیم فروش: تخمین هر فروشنده با ویرگول → جمع. · ۴) نظرسنجی مشتری (عمقِ بازارِ جزوه): تعداد × میانگین خرید × نرخ٪ × <b>تکرارِ خرید در سال</b>. · ۵) رگرسیون: روند خطیِ ۳ سال (خودکار). · ۶) میانگین متحرک: کف فروش (خودکار). · ۷) هموارسازی نمایی: آلفا (بازار ایران ۰٫۷–۰٫۹). · ۸) نقطهٔ سربه‌سر: هزینهٔ ثابت ÷ حاشیه٪ (= مدلِ بقا). · ۹) ظرفیت: نیرو × ظرفیتِ روزانه × روزهای فعال × قیمت — <b>وقتی تقاضا &gt; عرضه</b>.</p>
							<p className="border-t border-dashed border-border pt-2"><b>آلفا (α) در هموارسازی نمایی:</b> ضریبی بین <b>۰ تا ۱</b> — پیش‌بینی = α×اخیر + (۱−α)×قبلی. α نزدیک ۱ = واکنش سریع به تغییرات تازه (بازار پرنوسان/تورمی)؛ α نزدیک ۰ = هموار و وزن به روند بلندمدت. طبق جزوه در تورم امروز α را بالاتر می‌گیریم؛ شروع خوب: ۰٫۴ تا ۰٫۶.</p>
						</div>
					</details>
					<div className="flex flex-col gap-2.5">
						<Method n="۱" t="نظر مدیریتی" h="شهودِ مدیرعامل" out={r.mR[1]}>
							<div className="flex flex-wrap gap-2">{txt('fcM1', { w: '!w-[190px]' })}<Btn sm onClick={doM1Sug}><Icon n="bulb" className="size-3.5" />پیشنهاد سیستم</Btn></div>
							<Html className="mt-1 !text-primary-ink" h={msg.m1 || 'پیشنهاد بر پایهٔ فروشِ آخرین سال + جهش دلار/تورم + استراتژی محاسبه می‌شود. <b>دو سالِ پرشده کافی است</b> (حتی یک سال).'} />
						</Method>
						<Method n="۲" t="تکنیک دلفی" h="اعداد کارشناسان → میانه" out={r.mR[2]}>
							<div className="flex flex-wrap gap-2">
								<input value={v('fcM2')} onChange={(e) => update({ fcM2: e.target.value }, 'fcM2')} onBlur={(e) => { if (e.target.value.replace(/[^\d۰-۹]/g, '') !== '') update({ fcM2: fcGroupList(e.target.value) }, 'fcM2') }} placeholder="با ویرگول: ۹۰۰٬۰۰۰٬۰۰۰، ۱٬۱۰۰٬۰۰۰٬۰۰۰" className={`${inCls} min-w-[200px] flex-1`} />
								<Btn sm onClick={doM2Sug}><Icon n="bulb" className="size-3.5" />پیشنهاد سیستم</Btn>
							</div>
							<Html className="mt-1 !text-primary-ink" h={msg.m2 || 'سه عددِ محافظه‌کار/پایه/خوش‌بینانه پیشنهاد می‌شود؛ میانهٔ آن‌ها = تخمینِ دلفی. <b>دو سالِ پرشده کافی است</b>.'} />
						</Method>
						<Method n="۳" t="نظرسنجی تیم فروش" h="تخمین هر فروشنده → جمع" out={r.mR[3]}>
							<input value={v('fcM3')} onChange={(e) => update({ fcM3: e.target.value }, 'fcM3')} onBlur={(e) => { if (e.target.value.replace(/[^\d۰-۹]/g, '') !== '') update({ fcM3: fcGroupList(e.target.value) }, 'fcM3') }} placeholder="با ویرگول: ۵۰۰٬۰۰۰٬۰۰۰، ۳۰۰٬۰۰۰٬۰۰۰" className={inCls} />
						</Method>
						<Method n="۴" t="نظرسنجی مشتری" h="تعداد بالقوه × میانگین خرید × نرخ خرید" out={r.mR[4]}>
							<div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
								<label><Label>تعداد</Label>{txt('fcM4n')}</label>
								<label><Label>× خرید</Label>{txt('fcM4a')}</label>
								<label><Label>× نرخ٪</Label>{txt('fcM4r')}</label>
								<label><Label>× تکرار/سال</Label>{txt('fcM4rep')}</label>
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-3">
								<label className="flex min-w-[240px] flex-1 items-center gap-2"><span className="shrink-0 text-[12px] font-bold text-muted-foreground">نرخِ استانداردِ صنف:</span>{sel('fcM4type', M4TYPE_OPTS, doM4Type)}</label>
								{check('fcM4real', 'ضریب واقع‌گراییِ جزوه (۰٫۶۵×)')}
							</div>
							<Html className="mt-1 !text-primary-ink" h={msg.m4note || '«نرخ خرید» = چند درصد از بازار هدفِ نظرسنجی‌شده واقعاً می‌خرند. مشتری‌ها ~۴۰٪ اغراق می‌کنند؛ طبق جزوه ضریب واقع‌گرایی ۰٫۶–۰٫۷ را لحاظ کن. عددِ بالا = <b>پتانسیلِ بازار</b> (عمقِ آبی، ایدئال).'} />
							<details open className="mt-2 rounded-xl bg-[var(--fc-brass-soft)] px-3 py-2">
								<summary className="flex cursor-pointer items-center gap-2 font-bold text-accent-ink"><Icon n="target" />تبدیل به پتانسیلِ فروش (المان‌های تعدیل‌کنندهٔ فصل ۱۸)</summary>
								<div className="my-2 flex flex-wrap items-center gap-2">
									<Btn sm onClick={doM4Adj}><Icon n="bulb" className="size-3.5" />پیشنهاد خودکارِ سیستم</Btn>
									<Btn sm kind="ghost" onClick={() => doAi('brand')}><Icon n="sparkle" className="size-3.5 text-primary-ink" />پیشنهاد هوش مصنوعی (برند/اورنس)</Btn>
									<span className="text-[11px] text-muted-foreground">«سیستم» سهم را از فروش÷عمق و بقیه را از استراتژی می‌سازد؛ «هوش مصنوعی» برند/اورنس/کانال/رقبا را متناسبِ کسب‌وکارت پیشنهاد می‌دهد.</span>
								</div>
								<div className="grid grid-cols-2 gap-2 @2xl:grid-cols-5">
									<label><Label>سهم بالقوه٪ (Share)</Label>{txt('fcM4share')}</label>
									<label><Label>× برند٪ (Brand)</Label>{txt('fcM4brand')}</label>
									<label><Label>اورنس٪ (Awareness)</Label>{txt('fcM4aware')}</label>
									<label><Label>کانال٪ (Channel)</Label>{txt('fcM4chan')}</label>
									<label><Label>رقبا٪ (Competitors)</Label>{txt('fcM4comp')}</label>
								</div>
								<Html className="mt-1.5 !text-primary-ink" h={msg.m4adj || r.m4adjNote || 'فرمولِ جزوه (ضریبی، نه جمعی): پتانسیلِ فروش = پتانسیلِ بازار × سهم × (۱+برند) × (۱+اورنس) × (۱+کانال) × (۱+رقبا). <b>اورنس (Awareness) = شناخته‌شدگیِ برند</b>: اگر بازارِ هدف سه برندِ اولِ صنعت را نام ببرد، اسمِ تو هست؟ +۱۰ تا +۲۰٪ اگر شناخته‌شده‌ای، ۰ اگر معمولی، منفی اگر ناشناس. مثالِ کافی‌شاپ: سهم ۱۰٪ → ۵ میلیارد، ×۱٫۲ برند، ×۰٫۹ کانالِ ضعیف، ×۰٫۸۵ رقبای قوی = ۴٫۵۹ میلیارد.'} />
							</details>
						</Method>
						<Method n="۵" t="رگرسیون" h="روند خطی از ۳ سال" out={r.mR[5]}><span className="text-[12.5px] text-muted-foreground">خودکار از جدول بالا</span></Method>
						<Method n="۶" t="میانگین متحرک" h="کف فروش عادی" out={r.mR[6]}><span className="text-[12.5px] text-muted-foreground">خودکار از جدول بالا</span></Method>
						<Method n="۷" t="هموارسازی نمایی (Holt)" h={<>دنباله‌ای + روند · آلفا = <b>{fa(r.alpha)}</b> (بازار تورمی: ۰٫۷–۰٫۹)</>} out={r.mR[7]}>
							{range('fcAlpha', 0.1, 0.9, 0.1)}
						</Method>
						<Method n="۸" t="نقطه‌ی سربه‌سر" h="مدل بقا" out={r.mR[8]}>
							<div className="grid grid-cols-2 gap-2 sm:max-w-[420px]">
								<label><Label>هزینه ثابت</Label>{txt('fcFixed')}</label>
								<label><Label>÷ حاشیه٪</Label>{txt('fcMargin')}</label>
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<span className="shrink-0 text-[12px] font-bold text-muted-foreground">استانداردِ جهانیِ صنعت:</span>
								<select value={marginStd} onChange={(e) => doMarginStd(e.target.value)} className={`${inCls} !w-auto min-w-[230px]`}>
									{MARGIN_STD.map(([val, t], i) => <option key={i} value={val}>{t}</option>)}
								</select>
								<Btn sm kind="ghost" onClick={() => doAi('margin')}><Icon n="sparkle" className="size-3.5 text-primary-ink" />پیشنهاد هوش مصنوعی</Btn>
							</div>
							<Html className="mt-1 !text-primary-ink" h={msg.margin || 'این‌ها <b>حاشیهٔ ناخالص/مشارکتی</b> (فروش منهای هزینهٔ متغیر) بر پایهٔ استانداردِ جهانی‌اند — همان چیزی که نقطهٔ سربه‌سر لازم دارد (نه سودِ خالص). برای ایران کمی تعدیل کن؛ یا با دکمهٔ «هوش مصنوعی» متناسبِ کسب‌وکارت پیشنهاد بگیر.'} />
						</Method>
						<Method n="۹" t="ظرفیت (Capacity)" h="وقتی تقاضا > عرضه: سقفِ فروش = سقفِ تحویل" out={r.mR[9]}>
							<div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
								<label><Label>نیرو (کافه=۱)</Label>{txt('fcCapWorkers')}</label>
								<label><Label>× روزانه/فیش</Label>{txt('fcCapDaily')}</label>
								<label><Label>× روز/ماه</Label>{txt('fcCapDays')}</label>
								<label><Label>× قیمت/میانگینِ‌فیش</Label>{txt('fcCapP')}</label>
							</div>
							<Html className="mt-1 !text-primary-ink" h={r.capNote} />
						</Method>
					</div>
					<Figs>
						<Fig kind="total" k="میانگین روش‌های پرشده" v={sep(r.consensus)} u="تومان — پیش‌بینی نهایی" />
						<Fig k="میانه‌ی روش‌ها" v={sep(r.median)} u="تومان" />
						<Fig kind="gold" small k="پراکندگی روش‌ها" v={r.spread ? sep(r.spread[0]) + ' — ' + sep(r.spread[1]) : '—'} u="کمینه تا بیشینه" />
						<Fig k="روش‌های پرشده" v={fa(r.filled.length)} u="از ۹" />
					</Figs>
					<Html className="mt-2" h={r.methodsNote} />
				</Card>

				{/* ۹) پیش‌بینی ماهانه */}
				<Card id="fcMonthlyCard" title="پیش‌بینی ماهانه‌ی بودجه: چندروشی" sub="داده‌ی ماهانه‌ی سه‌ساله را وارد کن، روش‌ها را انتخاب کن، پیش‌بینی ماه‌به‌ماه بگیر">
					<p className="mb-4 flex items-start gap-2 rounded-xl bg-[var(--fc-brass-soft)] px-3.5 py-2.5 text-[12.5px] leading-7 ring-1 ring-accent/35"><Icon n="info" className="mt-1.5 size-4 text-accent-ink" /><span>این پیش‌بینی <b>همیشه برای کلِ سالِ هدف و ماه‌به‌ماه</b> است (سالانه، ۱۲ ماه) — مستقل از «افق دید». «افق دید» فقط اندازهٔ هدفِ هر دوره را در <b>هرمِ بالا</b> تعیین می‌کند. اگر سالِ جاری چند ماهش پر باشد، آن ماه‌ها <b>واقعی (✓)</b> و بقیه <b>پیش‌بینی</b> نمایش داده می‌شوند.</span></p>
					<div className="flex flex-wrap items-end gap-3">
						{importBtn}
						<Btn kind="ghost" sm onClick={doClearMonth}>پاک کردن داده‌ی ماهانه</Btn>
						<label className="flex items-center gap-2 text-[12px] font-bold text-muted-foreground">واحد اعداد فایل:{sel('fcUnit', [['rial', 'ریال (÷۱۰ به تومان)'], ['toman', 'تومان']], doUnit, '!h-9 !w-[150px]')}</label>
						<label className="flex items-center gap-2 text-[12px] font-bold text-muted-foreground">سال هدف پیش‌بینی:<span className="w-[90px]">{txt('fcTargetYear')}</span>
							{x.hist && x.hist.length ? <b className="text-[11px] text-primary-ink">← پیشنهاد: {fa(x.hist.reduce((m: number, h: any) => Math.max(m, h.year), 0) + 1)} (آخرین دادهٔ {fa(x.hist.reduce((m: number, h: any) => Math.max(m, h.year), 0))} +۱)</b> : null}
						</label>
					</div>
					<Html className="mt-2" h={msg.month || (x.hist && x.hist.length ? '<b>' + fa(x.hist.length) + '</b> سال داده‌ی ماهانه در سیستم (' + x.hist.map((h: any) => fa(h.year)).join('، ') + ')' + (x.ytd ? ' + سالِ جاری <b>' + fa(x.ytd.year) + '</b> با <b>' + fa(x.ytd.mfilled || 0) + '</b> ماهِ پرشده' : '') + '.' + (x._dollarWarn && x._dollarWarn.length ? " <span style='color:var(--fc-rose)'>⚠️ سلولِ «فروش دلاری» سال‌های " + x._dollarWarn.map(fa).join('، ') + ' در فایل نامعتبر بود — نرخ دلار آن سال را دستی وارد کن.</span>' : '') : 'قالب اکسل: هر ردیف یک سال، ستون‌ها «سال، فروردین … اسفند». حداقل دو سال داده لازم است. کل برنامه با <b>تومان</b> کار می‌کند؛ اگر اعداد فایل ریال‌اند، واحد را روی «ریال» بگذار تا خودکار تقسیم بر ۱۰ شود.')} />

					{mo && (
						<>
							<h4 className="mb-2 mt-5 text-[13.5px] font-extrabold">داده‌ی واردشده <span className="text-[11.5px] font-medium text-muted-foreground">سال‌های کامل + سالِ جاری (واقعی + پیش‌بینی)</span></h4>
							<div className="overflow-auto rounded-xl ring-1 ring-border">
								<table className="w-full min-w-[900px] text-[11px]">
									<thead className="bg-muted/60"><tr><Th>سال</Th>{MN.map((m) => <Th key={m}>{m}</Th>)}<Th>کل (تومان)</Th><Th className="bg-secondary/10 text-secondary-ink">فروش دلاری</Th><Th className="bg-secondary/10 text-secondary-ink">میانگین نرخ دلار</Th><Th className="bg-[var(--fc-brass-soft)]">رشد نسبت به سال قبل</Th></tr></thead>
									<tbody>
										{mo.histRows.map((yr) => (
											<tr key={yr.year}>
												<Td><b>{fa(yr.year)}</b></Td>
												{yr.months.map((q, i) => <Td key={i}>{q > 0 ? sep(q) : '—'}</Td>)}
												<Td><b>{sep(yr.total)}</b></Td>
												<Td className="bg-secondary/5 font-bold text-secondary-ink">{yr.rateOk && yr.dsales > 0 ? '$' + sep(yr.dsales) : <span style={{ color: ROSE }}>نامعتبر</span>}</Td>
												<Td className="bg-secondary/5 font-bold text-secondary-ink">{yr.rateOk ? sep(yr.drate) + ' ت' : <span style={{ color: ROSE }}>— دستی وارد کن</span>}</Td>
												<Td className="bg-[var(--fc-brass-soft)] font-extrabold">{yr.g == null ? '—' : <Colored v={yr.g}>{pct(yr.g)}</Colored>}</Td>
											</tr>
										))}
										{mo.blTot > 0 && (() => {
											const dS = r.usd > 0 ? Math.round(mo.blTot / r.usd) : 0
											const prevY = mo.lastHistTotal, gY = prevY > 0 ? (mo.blTot / prevY - 1) * 100 : null
											return (
												<tr className="border-t-2 border-accent-ink">
													<Td><b>{fa(r.ty)}</b><div className="text-[10px] text-accent-ink">واقعی+پیش‌بینی</div></Td>
													{mo.fin.map((q, m) => {
														const isA = !!(mo.actualM && mo.actualM[m] > 0)
														return <Td key={m} className={isA ? 'font-extrabold text-secondary-ink' : 'bg-[var(--fc-brass-soft)] font-semibold italic text-accent-ink'}>{q > 0 ? sep(q) : '—'}{isA ? ' ✓' : ''}</Td>
													})}
													<Td><b>{sep(mo.blTot)}</b></Td>
													<Td className="bg-secondary/5 font-bold text-secondary-ink">{dS > 0 ? '$' + sep(dS) : '—'}</Td>
													<Td className="bg-secondary/5 font-bold text-secondary-ink">{r.usd > 0 ? sep(r.usd) + ' ت' : '—'}</Td>
													<Td className="bg-[var(--fc-brass-soft)] font-extrabold">{gY == null ? '—' : <Colored v={gY}>{pct(gY)}</Colored>}</Td>
												</tr>
											)
										})()}
									</tbody>
								</table>
							</div>
							{mo.blTot > 0 && <p className="mt-1.5 text-[12px] text-muted-foreground">ردیفِ <b>{fa(r.ty)}</b>: <span className="font-extrabold text-secondary-ink">آبی ✓ = عددِ واقعیِ ثبت‌شده ({fa(mo.nAct)} ماه)</span> · <span className="font-bold italic text-accent-ink">طلاییِ کج = پیش‌بینیِ ۹ روش</span> برای ماه‌های باقی‌مانده.</p>}
						</>
					)}

					<h4 className="mb-2 mt-6 text-[13.5px] font-extrabold">انتخاب روش‌ها برای پیش‌بینی <span className="text-[11.5px] font-medium text-muted-foreground">یک روش، دو روش یا هر ۹ روش</span></h4>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => <span key={k}>{check('fcUse' + k, fa(k) + ' ' + LBL[k])}</span>)}
						<Btn kind="ghost" sm onClick={() => doSel(true)}>همه</Btn>
						<Btn kind="ghost" sm onClick={() => doSel(false)}>هیچ</Btn>
					</div>
					<p className="mt-1.5 text-[12px] leading-6 text-muted-foreground">روش‌های ۵/۶/۷ مستقیم روی سری ماهانه محاسبه می‌شوند؛ روش‌های قضاوتی (۱–۴، ۸، ۹) عددِ سالانه‌شان با <b>الگوی فصلی</b> بین ماه‌ها پخش می‌شود (چون اقتصاد ایران فصلی است). ستون «پیش‌بینی» میانگینِ روش‌های انتخاب‌شده است.</p>

					{mo ? (
						<>
							<div className="mt-3 max-h-[520px] overflow-auto rounded-xl ring-1 ring-border">
								<table className="w-full min-w-[760px] text-[11px]">
									<thead className="sticky top-0 bg-muted"><tr><Th>ماه</Th>{mo.sel.map((k) => <Th key={k}>{LBL[k]}</Th>)}<Th className="bg-accent/15">{mo.nAct ? 'واقعی/پیش‌بینی' : 'پیش‌بینی'} (تومان)</Th><Th className="bg-[#E0EBF8] text-secondary-ink">$ لازم</Th></tr></thead>
									<tbody>
										{MN.map((mn, m) => {
											const isAct = !!(mo.actualM && mo.actualM[m] > 0)
											return (
												<tr key={mn}>
													<Td><b>{mn}</b></Td>
													{mo.sel.map((k) => <Td key={k}>{mo.perM[k][m] > 0 ? sep(mo.perM[k][m]) : '—'}</Td>)}
													<Td className="bg-[var(--fc-brass-soft)] font-extrabold text-primary-ink">{sep(mo.fin[m])}{isAct && <span title="عددِ واقعیِ ثبت‌شده" className="text-success"> ✓</span>}</Td>
													<Td className="bg-secondary/5 font-extrabold text-secondary-ink">{usdCell(mo.fin[m])}</Td>
												</tr>
											)
										})}
									</tbody>
									<tfoot>
										<tr className="bg-muted/60"><Td><b>کل سال</b></Td>{mo.colTot.map((q, i) => <Td key={i}><b>{sep(q)}</b></Td>)}<Td className="bg-[var(--fc-brass-soft)] font-extrabold">{sep(mo.blTot)}</Td><Td className="bg-secondary/5 font-extrabold text-secondary-ink">{usdCell(mo.blTot)}</Td></tr>
									</tfoot>
								</table>
							</div>
							<Html className="mt-2" h={(mo.nAct ? "<b style='color:#1E8E3E'>✓ = عددِ واقعیِ ثبت‌شدهٔ " + fa(r.ty) + ' (' + fa(mo.nAct) + ' ماه)</b>؛ بقیهٔ ماه‌ها پیش‌بینیِ ۹ روش است. ' : '') + (r.usd > 0 && mo.blTot > 0 ? 'برای رشدِ واقعی (نه فقط تورمی)، فروشِ <b>دلاری</b> هر ماه باید از همان ماهِ سال قبل بیشتر باشد. مثال: در <b>' + MN[mo.peak[0]] + "</b> باید حدود <b style='direction:ltr;display:inline-block'>$" + sep(Math.round(mo.peak[1] / r.usd)) + '</b> بفروشی. (نرخ دلار: ' + faGroup(r.usd) + ' تومان)' : 'نرخ دلار را در گام «افق دید» وارد کن تا ستونِ «$ لازم» و هدفِ دلاریِ هر ماه نمایش داده شود.')} />
							<div className="mt-4 grid grid-cols-1 gap-2.5 @xl:grid-cols-3">
								<Fig kind="total" k="پیش‌بینی کل سال هدف" v={sep(mo.blTot)} u={<span dangerouslySetInnerHTML={{ __html: 'تومان — سال ' + fa(r.ty) + (mo.sel.length ? ' · ' + fa(mo.sel.length) + ' روش' : ' · روشی انتخاب نشده') + (r.usd > 0 && mo.blTot > 0 ? ' · ≈ <b>$' + sep(Math.round(mo.blTot / r.usd)) + '</b>' : '') }} />} />
								<Fig small k="بهترین ماه (اوج فصلی)" v={mo.blTot > 0 ? MN[mo.peak[0]] : '—'} u={mo.blTot > 0 ? sep(mo.peak[1]) : '—'} />
								<Fig small k="ضعیف‌ترین ماه" v={mo.blTot > 0 ? MN[mo.low[0]] : '—'} u={mo.blTot > 0 ? sep(mo.low[1]) : '—'} />
							</div>
						</>
					) : (
						<p className="mt-3 rounded-xl bg-muted/50 p-4 text-center text-[12.5px] text-muted-foreground">هنوز داده‌ی ماهانه وارد نشده — از «مرکز ایمپورت» فایلِ فروش ماهانه یا صورت سود و زیان را بده.</p>
					)}
					<div className="mt-4 flex flex-wrap items-center gap-2">
						{!confirmApply ? (
							<Btn kind="gold" onClick={() => setConfirmApply(true)}>اعمال بودجهٔ ماهانه به تارگت‌ها + تقسیم بین کارشناسان (بر اساس سطح)</Btn>
						) : (
							<>
								<span className="text-[12.5px] font-bold text-error">تارگتِ ماهانه و تارگتِ کارشناسانِ سالِ جاری جایگزین می‌شود (قبلش بک‌آپ گرفته می‌شود). ادامه؟</span>
								<Btn kind="gold" onClick={doApplyTargets}>بله، اعمال کن</Btn>
								<Btn kind="ghost" onClick={() => setConfirmApply(false)}>انصراف</Btn>
							</>
						)}
					</div>
					<Html className="mt-1.5" h={msg.apply || 'این دکمه بودجهٔ پیش‌بینی هر ماه را در «تارگت فروش ماه» می‌گذارد و بین کارشناسان فروش بر اساس تجربه تقسیم می‌کند: ارشد ۱٫۵ ، میانی ۱ ، تازه‌کار ۰٫۶ برابر. نتیجه در داشبورد مدیریتی دیده می‌شود.'} />
				</Card>

				{/* ۱۲) ریسک */}
				<Card title="خودارزیابی ریسکِ مدیرعامل" sub="این سه عدد تعیین می‌کنند چقدر محافظه‌کار برنامه بریزی">
					<div className="grid items-start gap-6 @3xl:grid-cols-[1fr_320px]">
					<div className="grid gap-4">
						<label className="block"><Label>ریسک‌پذیری امسال (۱–۱۰۰): <b className="text-foreground">{fa(fnum(f.fcRisk))}</b></Label>{range('fcRisk', 1, 100, 1)}</label>
						<label className="block"><Label>تعهد/مسئولیت مالی، «چاله‌ها» (۱–۱۰): <b className="text-foreground">{fa(fnum(f.fcOblig))}</b></Label>{range('fcOblig', 1, 10, 1)}</label>
						<label className="block"><Label>آمادگی تزریق دارایی شخصی (۱–۱۰): <b className="text-foreground">{fa(fnum(f.fcAsset))}</b></Label>{range('fcAsset', 1, 10, 1)}</label>
					</div>
					<div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-1">
						<Fig kind="warn" k="حاشیه‌ی احتیاط پیشنهادی" v={pct(r.safety)} u="زیر هدف برنامه ببند" />
						<Fig kind="total" k="هدفِ محافظه‌کارانه" v={sep(r.safeT)} u="تومان، هدف پس از حاشیه" />
					</div>
					</div>
					<Html className="mt-4" h={'هرچه تعهد مالی‌ات بیشتر و ریسک‌پذیری‌ات کمتر باشد، باید محافظه‌کارتر برنامه ببندی. با اعداد فعلی، پیشنهاد این است که برنامه را حدود <b>' + pct(r.safety) + '</b> زیر هدف (' + sep(r.safeT) + ' تومان) ببندی تا اگر فروش کمتر از انتظار شد، نقدینگی‌ات قفل نشود.'} />
				</Card>
			</Band>

			<Band tier="blue" title="نتایج کسب‌وکار" desc="واقعی در برابر پیش‌بینی، سقفِ هزینه‌ها و اثرِ تورم">
				{/* ۱۰) واقعی در برابر پیش‌بینی */}
				<Card title="واقعی در برابر پیش‌بینی" sub="پیش‌بینی ملاک است؛ با ورود معاملاتِ هر ماه، عقب/جلو بودن نسبت به پیش‌بینی محاسبه می‌شود">
					{(() => {
						const va = r.va, gap = va.sumA - va.sumF, gvr = va.sumF > 0 ? (gap / va.sumF) * 100 : 0, gc = gap >= 0 ? GREEN : ROSE
						return (
							<>
								<div className="grid grid-cols-1 gap-2.5 @xl:grid-cols-3">
									<Fig kind="total" k="واقعیِ تا این‌جا" v={sep(Math.round(va.sumA))} u={r.monthlyForecast ? fa(va.nM) + ' ماهِ دارای واقعی' : '— ماه'} />
									<Fig kind="gold" k="پیش‌بینیِ همان ماه‌ها" v={sep(Math.round(va.sumF))} u="تومان" />
									<Fig k="عقب/جلو" v={r.monthlyForecast && va.nM ? <span style={{ color: gc }}>{gap >= 0 ? '▲ جلو ' : '▼ عقب '}{pct(Math.abs(gvr))}</span> : '—'} u={r.monthlyForecast && va.nM ? <span style={{ color: gc }}>{(gap >= 0 ? '+' : '−') + sep(Math.abs(Math.round(gap)))} تومان</span> : 'نسبت به پیش‌بینی'} />
								</div>
								<div className="mt-3 overflow-auto rounded-xl ring-1 ring-border">
									<table className="w-full min-w-[620px] text-[12.5px]">
										<thead className="bg-muted/60"><tr><Th>ماه</Th><Th>پیش‌بینی (ملاک)</Th><Th>واقعی</Th><Th>اختلاف</Th><Th>عقب/جلو</Th></tr></thead>
										<tbody>
											{!r.monthlyForecast ? (
												<tr><td colSpan={5} className="py-4 text-center text-muted-foreground">اول در همین تب پیش‌بینی را بساز (روش‌ها را انتخاب کن) تا ملاک ساخته شود.</td></tr>
											) : va.rows.length ? (
												va.rows.map((q) => {
													const col = q.diff >= 0 ? GREEN : ROSE
													return (
														<tr key={q.m}>
															<Td><b>{MN[q.m]}</b></Td><Td>{sep(Math.round(q.f))}</Td><Td>{sep(Math.round(q.a))}</Td>
															<Td style={{ color: col }} className="font-bold">{(q.diff >= 0 ? '+' : '−') + sep(Math.abs(Math.round(q.diff)))}</Td>
															<Td style={{ color: col }} className="font-extrabold">{(q.diff >= 0 ? '▲ جلو ' : '▼ عقب ') + pct(Math.abs(q.vr))}</Td>
														</tr>
													)
												})
											) : (
												<tr><td colSpan={5} className="py-4 text-center text-muted-foreground">هنوز ماهی داده‌ی واقعی ندارد. معاملاتِ ماه را ایمپورت کن (یا فایلِ فروش ماهانه) تا مقایسه انجام شود.</td></tr>
											)}
										</tbody>
									</table>
								</div>
								<Html className="mt-2" h={!r.monthlyForecast ? 'برای مقایسه، اول پیش‌بینیِ ماهانه باید محاسبه شده باشد.' : va.nM ? 'تا این‌جا (' + fa(va.nM) + ' ماه) مجموعِ واقعی <b>' + sep(Math.round(va.sumA)) + '</b> در برابرِ پیش‌بینیِ <b>' + sep(Math.round(va.sumF)) + '</b> تومان — یعنی ' + (gap >= 0 ? "<b style='color:#1E8E3E'>" + pct(Math.abs(gvr)) + ' جلوتر</b>' : "<b style='color:var(--fc-rose)'>" + pct(Math.abs(gvr)) + ' عقب‌تر</b>') + ' از پیش‌بینی. واقعیِ هر ماه از معاملاتِ بسته‌شدهٔ همان ماه (یا فایلِ فروش ماهانه) می‌آید.' : 'با ورودِ معاملاتِ هر ماه (تبِ عملکرد ← ایمپورتِ معاملات)، عقب/جلو بودنِ آن ماه نسبت به پیش‌بینی این‌جا نشان داده می‌شود.'} />
							</>
						)
					})()}
				</Card>
				{/* ۶) نسبت‌های طلایی */}
				<Card title="نسبت‌های طلاییِ تخصیص منابع" sub="سقف استانداردهای عملیاتی، برگرفته از جزوه">
					<div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @5xl:grid-cols-6">
						{[
							{ n: 'کمیسیون فروش', mn: 5, mx: 15 },
							{ n: 'بازاریابی', mn: 5, mx: 10 },
							{ n: 'تبلیغات', mn: 1, mx: 5 },
							{ n: 'اجاره', mn: 15, mx: 20 },
							{ n: 'حقوق شرکت‌های تولیدی', mn: 19, mx: 20 },
							{ n: 'حقوق شرکت‌های خدماتی', mn: 25, mx: 35 },
						].map((o) => {
							const Cc = 2 * Math.PI * 34, len = Cc * (o.mx / 100)
							return (
								<div key={o.n} className="flex flex-col items-center gap-1 rounded-xl bg-muted/40 p-3 text-center ring-1 ring-border/80">
									<svg viewBox="0 0 104 104" className="h-auto w-full max-w-[112px]">
										<circle cx="52" cy="52" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="13" />
										<circle cx="52" cy="52" r="34" fill="none" stroke={RING} strokeWidth="13" strokeLinecap="round" strokeDasharray={Cc.toFixed(1)} strokeDashoffset={(Cc - len).toFixed(1)} transform="rotate(-90 52 52)" className="transition-[stroke-dashoffset] duration-700" />
										<text x="52" y="56" textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--secondary-ink))">{fa(o.mn)}٪ تا {fa(o.mx)}٪</text>
									</svg>
									<div className="text-[12px] font-bold">{o.n}</div>
									{r.R > 0 && <div className="text-[11px] text-muted-foreground">≈ {sep((r.R * o.mn) / 100)} تا {sep((r.R * o.mx) / 100)} تومان</div>}
								</div>
							)
						})}
					</div>
					<p className="mt-2 text-[12px] leading-6 text-muted-foreground">این اعداد <b>سقف</b> استانداردهای عملیاتی هستند و بسته به مدل کسب‌وکار بهینه‌سازی می‌شوند. اگر «فروش هدف» را پر کرده باشی، معادل تومانیِ هر بازه هم زیر آن نشان داده می‌شود.</p>
				</Card>

				{/* ۷) سناریوهای تورمی */}
				<Card title="سناریوهای تورمی" sub="تورم ۵۰٪، ۷۰٪ و ۱۲۰٪؛ هر سناریو تصمیم متفاوتی می‌طلبد">
					<p className="mb-3 text-[12.5px] leading-7 text-muted-foreground">مبنا: همان «فروش ریالی هدف» بالا. جدول نشان می‌دهد برای <b>حفظ ارزش واقعی</b> در هر سناریوی تورم، فروش اسمی باید چقدر شود؛ و اگر فروش اسمی ثابت بماند، ارزش واقعی چقدر آب می‌رود.</p>
					<div className="overflow-auto rounded-xl ring-1 ring-border">
						<table className="w-full min-w-[520px] text-[12.5px]">
							<thead className="bg-muted/60"><tr><Th>سناریوی تورم</Th><Th>فروش اسمی لازم برای حفظ ارزش</Th><Th>ارزش واقعی اگر فروش ثابت بماند</Th><Th>افت قدرت خرید</Th></tr></thead>
							<tbody>
								{r.scen.map((s) => (
									<tr key={s.s}><Td><b>تورم {fa(s.s)}٪</b></Td><Td>{sep(s.need)}</Td><Td>{sep(s.real)}</Td><Td style={{ color: ROSE }}>{pct(s.loss)}</Td></tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			</Band>

		</div>
	)
}

function Method({ n, t, h, out, children }: { n: string; t: string; h: ReactNode; out: number; children: ReactNode }) {
	return (
		<div className="grid gap-3 rounded-xl p-4 ring-1 ring-border/80 transition hover:ring-border @3xl:grid-cols-[200px_1fr_170px]">
			<div className="flex items-start gap-2.5">
				<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-[13px] font-extrabold text-primary-ink">{n}</span>
				<div className="min-w-0"><b className="text-[13.5px] leading-7">{t}</b><div className="text-[11.5px] leading-5 text-muted-foreground">{h}</div></div>
			</div>
			<div className="min-w-0">{children}</div>
			<div className="flex items-center @3xl:justify-end">
				<span className={`rounded-xl px-3 py-2 text-[14px] tabular-nums ${out > 0 ? 'bg-primary/[.07] text-primary-ink' : 'bg-muted/60'}`}>{out > 0 ? <b>{sep(out)}</b> : <span className="text-muted-foreground">—</span>}</span>
			</div>
		</div>
	)
}

/* ---------------- هرمِ خلاصه (بالای صفحه) ---------------- */
interface PyTier { tier: Tier; title: string; label: string; value: ReactNode; sub: string }
const jump = (t: Tier) => document.getElementById('fc-band-' + t)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

function PyramidOverview({ tiers, badge }: { tiers: PyTier[]; badge: string[] }) {
	const reduce = useReducedMotion()
	// هندسهٔ هرم (همان تصویرِ برند): رأس (150,0)، قاعده ۳۰۰ در y=250، فاصلهٔ ۱۰ بینِ طبقه‌ها
	const w = (y: number) => 0.6 * y
	const poly = (a: number, b: number) => (a === 0 ? `150,0 ${150 + w(b)},${b} ${150 - w(b)},${b}` : `${150 - w(a)},${a} ${150 + w(a)},${a} ${150 + w(b)},${b} ${150 - w(b)},${b}`)
	const shape: Record<Tier, { pts: string; lines: [string, number][]; order: number }> = {
		blue: { pts: poly(0, 108), lines: [['نتایج', 70], ['کسب‌وکار', 94]], order: 2 },
		purple: { pts: poly(118, 176), lines: [['اهداف فروش', 153]], order: 1 },
		gold: { pts: poly(186, 250), lines: [['فعالیت‌های فروش', 224]], order: 0 },
	}
	return (
		<section aria-labelledby="fc-pyr-h" className={`@container rounded-2xl bg-card p-5 ring-1 ring-border sm:p-6 shadow-card`}>
			<header className="mb-5 flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 id="fc-pyr-h" className="text-[18px] font-extrabold leading-7">هرمِ پیش‌بینی و بودجه</h2>
					<p className="mt-0.5 text-[12.5px] leading-6 text-muted-foreground">از فعالیت‌های فروش تا نتایج کسب‌وکار. روی هر طبقه بزن تا به همان بخش بروی.</p>
				</div>
				<span role="status" className={`rounded-full px-3 py-1 text-[11.5px] font-bold ring-1 ${badge[0]}`}>{badge[1]}</span>
			</header>
			<div className="grid items-center gap-6 @2xl:grid-cols-[minmax(0,320px)_1fr]">
				<svg viewBox="-24 -4 348 262" className="mx-auto w-full max-w-[320px]" role="group" aria-label="هرمِ فعالیت‌ها، اهداف و نتایج">
					<defs>
						<marker id="fcArr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
							<path d="M0 0L10 5L0 10z" fill="hsl(var(--border))" />
						</marker>
					</defs>
					<path d="M-6 236 Q-22 180 40 128" fill="none" stroke="hsl(var(--border))" strokeWidth="5" strokeLinecap="round" markerEnd="url(#fcArr)" />
					<path d="M306 236 Q322 180 260 128" fill="none" stroke="hsl(var(--border))" strokeWidth="5" strokeLinecap="round" markerEnd="url(#fcArr)" />
					{(['gold', 'purple', 'blue'] as Tier[]).map((t) => {
						const s = shape[t], tt = tiers.find((q) => q.tier === t)
						return (
							<motion.g key={t} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: s.order * 0.12, ease: [0.16, 1, 0.3, 1] }}
								role="button" tabIndex={0} aria-label={(tt?.title || '') + ': رفتن به بخش'} onClick={() => jump(t)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(t) } }}
								className="cursor-pointer outline-none transition-[filter] hover:brightness-110 focus-visible:brightness-110 [&:focus-visible>polygon]:stroke-[#2A1F00]/40 [&:focus-visible>polygon]:[stroke-width:4]">
								<polygon points={s.pts} fill={TIER[t].fill} />
								{s.lines.map(([txt, y]) => (
									<text key={txt} x="150" y={y} textAnchor="middle" fontSize={t === 'blue' ? 19 : 17} fontWeight="800" fill={t === 'gold' ? '#2A1F00' : '#fff'} style={{ fontFamily: 'inherit' }}>{txt}</text>
								))}
							</motion.g>
						)
					})}
				</svg>
				<ul className="flex flex-col gap-2">
					{tiers.map((t) => (
						<li key={t.tier}>
							<button type="button" onClick={() => jump(t.tier)} className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-xl px-3.5 py-3 text-right ring-1 ring-border/70 transition hover:bg-muted/50 hover:ring-border ${FOCUS}`}>
								<TierMark tier={t.tier} className="row-span-2 h-4 w-5" />
								<span className="min-w-0 text-[13px] font-extrabold" style={{ color: TIER[t.tier].ink }}>{t.title}<span className="mr-2 text-[11.5px] font-bold text-muted-foreground">{t.label}</span></span>
								<span className="row-span-2 text-left text-[16px] font-extrabold tabular-nums leading-tight @lg:text-[20px]">{t.value}</span>
								<span className="min-w-0 truncate text-[11.5px] text-muted-foreground">{t.sub}</span>
							</button>
						</li>
					))}
				</ul>
			</div>
			<p className="mt-4 border-t border-border/70 pt-3 text-[11.5px] text-muted-foreground">همان دادهٔ اپِ کامل؛ قبل از اولین ذخیره بک‌آپ روی سرور گرفته می‌شود.</p>
		</section>
	)
}

/** برچسبِ درخواست‌های تحلیلیِ /api/ai (همان modeهای قبلی) */
const AI_MODE: Record<string, string> = { analysis: 'تحلیلِ هوشمندِ پیش‌بینی', strategy: 'پیشنهادِ استراتژی', risk: 'هشدارِ ریسک', brand: 'پیشنهادِ برند و اورنس (روش ۴)', margin: 'پیشنهادِ حاشیهٔ سود (روش ۸)' }
