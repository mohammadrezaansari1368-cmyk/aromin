'use client'

/**
 * تبِ «پیش‌بینی و بودجه» — نسخهٔ بومیِ React با طراحیِ جدید، همهٔ کاشی‌های اپِ کامل.
 * همان دادهٔ FORECAST (همان کلیدها) روی MariaDB؛ ذخیرهٔ امن با بک‌آپ (forecastStore).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sanitizeForecastHtml } from '@/lib/sanitizeForecastHtml'
import { isAdmin, type Session } from '@/lib/auth'
import { runPreset, setPageActions, setPageContext } from '@/lib/agent'
import { fetchFull, saveState } from '@/lib/forecastStore'
import Sortable from '@/components/ui/sortable'
import { GaugeTile } from '@/components/dashboard/gauges/GaugeTiles'
import { CountUp } from '@/components/ui/count-up'
import { type Plan } from '@/components/ui/radio-group-with-plan-cards'
import CurrencyInput from 'react-currency-input-field'
import { HeartHandshake, Rocket, ShieldCheck } from 'lucide-react'
import { Field, FieldDescription, FieldLabel, InfoTip, InputGroup, InputGroupAddon, Markdown } from '@/components/ui/shadcn-kit'
import MagicBento, { type MagicBentoItem } from '@/components/ui/reactbits/MagicBento'
import SpotlightCard from '@/components/ui/reactbits/SpotlightCard'
import FlowingMenu from '@/components/ui/reactbits/FlowingMenu'
import ElasticSlider from '@/components/ui/reactbits/ElasticSlider'
import ScrollStack, { ScrollStackItem } from '@/components/ui/reactbits/ScrollStack'
import Stepper, { Step } from '@/components/ui/reactbits/Stepper'
import CardSwap, { Card as SwapCard } from '@/components/ui/reactbits/CardSwap'
import AnimatedList from '@/components/ui/reactbits/AnimatedList'
import OptionWheel from '@/components/ui/reactbits/OptionWheel'
import Stack from '@/components/ui/reactbits/Stack'
import Counter from '@/components/ui/reactbits/Counter'
import { useTheme } from '@/lib/theme'
import { stripHtml, toBullets } from '@/lib/stripHtml'
import { BTN, BTN_GHOST, BTN_PRIMARY, FOCUS } from '@/components/ui/tokens'
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
const ForecastBento = lazy(() => import('./ForecastBento'))

// 3.9.87: «استراتژی امسال» plans (lucide icons; «price» = marketing budget share of target sales, same rule as the auto-suggestion)
const STRAT_PLANS: Plan[] = [
	{ id: 'survive', title: 'بقا', desc: 'فقط بمانم؛ نقدینگی و هزینه‌ها اولویت دارند.', price: 'بودجه ۴٪', icon: ShieldCheck, color: 'text-sky-600', background: 'bg-sky-500/10' },
	{ id: 'hold', title: 'حفظ', desc: 'سهم بازار را نگه دارم و مشتری را حفظ کنم.', price: 'بودجه ۶٪', icon: HeartHandshake, color: 'text-amber-500', background: 'bg-amber-400/10' },
	{ id: 'grow', title: 'رشد', desc: 'سهم بازار بگیرم؛ بودجهٔ بازاریابی بیشتر.', price: 'بودجه ۱۲٪', icon: Rocket, color: 'text-rose-500', background: 'bg-rose-500/10' },
]
const MONEY = 'min-h-[44px] w-full min-w-0 rounded-xl border border-current/20 bg-transparent px-3 text-left text-[15px] tabular-nums text-inherit outline-none focus:ring-2 focus:ring-[#FCBF00]/45'
function Card({ title, sub, children, id, tone }: { title: ReactNode; sub?: ReactNode; children: ReactNode; id?: string; tone?: string }) {
	const mode = useTheme().mode
	return (
		<SpotlightCard id={id} theme={mode} spotlightColor="#FCBF00" className={`@container ${tone || ''}`}>
			<header className="mb-4">
				<h3 className="text-[15.5px] font-bold leading-7 tracking-tight sm:text-[17px]">{title}</h3>
				{sub && <p className="mt-0.5 max-w-[75ch] text-[12.5px] leading-6 opacity-70">{sub}</p>}
			</header>
			{children}
		</SpotlightCard>
	)
}
function Band({ tier, title, desc, children }: { tier: Tier; title: string; desc: string; children: ReactNode }) {
	return (
		<TierCtx.Provider value={tier}>
			<section id={'fc-band-' + tier} aria-labelledby={'fc-band-h-' + tier} className="flex scroll-mt-24 flex-col gap-4">
				<header className="flex items-center gap-3 px-1 pt-4">
					<TierMark tier={tier} className="h-5 w-7" />
					<div className="min-w-0">
						<h2 id={'fc-band-h-' + tier} className="text-[18px] font-extrabold leading-7 tracking-tight" style={{ color: TIER[tier].ink }}>{title}</h2>
						<p className="text-[12.5px] leading-6 text-muted-foreground">{desc}</p>
					</div>
					<span aria-hidden className="hidden h-px flex-1 self-center sm:block" style={{ background: `linear-gradient(to left, ${TIER[tier].fill}38, transparent)` }} />
				</header>
				<Sortable id={'forecast.' + tier}>{children}</Sortable>
			</section>
		</TierCtx.Provider>
	)
}
function Html({ h, className = '' }: { h: string; className?: string }) {
	return <p className={`max-w-[95ch] text-[12.5px] leading-7 text-muted-foreground ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeForecastHtml(h) }} />
}
type FigKind = 'total' | 'gold' | 'warn' | undefined
/** کاشیِ عدد — «total» رنگِ طبقهٔ همان بخش را می‌گیرد */
function Fig({ k, v, u, kind, small }: { k: ReactNode; v: ReactNode; u?: ReactNode; kind?: FigKind; small?: boolean }) {
	const t = TIER[useContext(TierCtx)]
	const total = kind === 'total'
	const cls = total ? t.on : kind === 'gold' ? 'bg-accent/10 ring-1 ring-accent/30' : kind === 'warn' ? 'bg-error/10 ring-1 ring-error/25' : 'bg-muted/40 ring-1 ring-border/70'
	const sub = total ? t.onSub : 'text-muted-foreground'
	return (
		<div
			className={`relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-2xl px-4 py-3.5 transition-shadow motion-safe:duration-200 ${cls} ${total ? '' : 'hover:shadow-sm'}`}
			style={total ? { background: `linear-gradient(135deg, ${t.fill}, ${t.fill}e6)` } : undefined}
		>
			{total && <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/10" />}
			<div className={`relative text-[11px] font-bold tracking-wide ${sub}`}>{k}</div>
			<div className={`relative ${small ? 'text-[14px] @lg:text-[15px]' : 'text-[16px] @lg:text-[21px]'} font-extrabold leading-tight tabular-nums [overflow-wrap:anywhere]`}>{v}</div>
			{u && <div className={`relative text-[11px] leading-5 ${sub}`}>{u}</div>}
		</div>
	)
}
const Figs = ({ children }: { children: ReactNode }) => <div className="mt-4 grid grid-cols-2 gap-3 @2xl:grid-cols-4">{children}</div>
function Btn({ children, onClick, kind = 'primary', sm, disabled, title }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'gold'; sm?: boolean; disabled?: boolean; title?: string }) {
	const k =
		kind === 'gold'
			? `${BTN} bg-accent text-accent-foreground shadow-[0_6px_16px_-6px_rgba(252,191,0,.5)] hover:brightness-105 hover:shadow-[0_8px_20px_-6px_rgba(252,191,0,.6)]`
			: kind === 'ghost'
				? `${BTN_GHOST} ring-1 ring-inset ring-border/70 hover:ring-border`
				: `${BTN_PRIMARY} shadow-[0_6px_16px_-6px_hsl(var(--primary)/.45)] hover:shadow-[0_8px_20px_-6px_hsl(var(--primary)/.55)]`
	return (
		<button type="button" title={title} disabled={disabled} onClick={onClick} className={`${k} ${sm ? 'min-h-8 px-3 text-[12px]' : 'min-h-10 text-[13px]'} max-w-full text-center leading-5 motion-safe:active:translate-y-px sm:shrink-0 sm:whitespace-nowrap`}>
			{children}
		</button>
	)
}
const inCls = 'h-10 w-full rounded-xl border border-border bg-card px-3 text-[13px] text-foreground outline-none transition placeholder:text-muted-foreground/80 hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/12'
function Label({ children }: { children: ReactNode }) {
	return <span className="mb-1.5 block text-[11.5px] font-bold tracking-wide text-muted-foreground">{children}</span>
}
const Th = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <th className={`whitespace-nowrap px-3 py-2.5 text-right text-[11.5px] font-bold ${className}`}>{children}</th>
const Td = ({ children, className = '', style }: { children?: ReactNode; className?: string; style?: CSSProperties }) => <td style={style} className={`whitespace-nowrap border-t border-border/70 px-3 py-2 tabular-nums ${className}`}>{children}</td>
const Colored = ({ v, children }: { v: number; children: ReactNode }) => <span style={{ color: v >= 0 ? GREEN : ROSE }}>{children}</span>
/** زبرا + هاوِر برای ردیف‌های <tbody> جدول‌ها (بدون نیاز به کلاسِ تکی روی هر tr) */
const ROWS = '[&>tr]:transition-colors motion-safe:[&>tr]:duration-150 [&>tr:nth-child(even)]:bg-muted/[0.035] [&>tr:hover]:!bg-primary/[0.06]'
const ROWS_HOVER = '[&>tr]:transition-colors motion-safe:[&>tr]:duration-150 [&>tr:hover]:!bg-primary/[0.05]'
/** کانتینرِ اسکرولِ گوشه‌گرد برای جدول‌ها */
const SCROLL = 'overflow-auto rounded-xl ring-1 ring-inset ring-border/70'

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
	const [guideAt, setGuideAt] = useState(0)
	const [ratioAt, setRatioAt] = useState(0)
	const mode = useTheme().mode
	const reduceMotion = useReducedMotion()
	const deck = {
		theme: mode, glowColor: '#FCBF00', textAutoHide: false, enableStars: true, enableTilt: true, enableSpotlight: true, enableBorderGlow: true,
		disableAnimations: !!reduceMotion, style: { gridAutoRows: 'auto' } as CSSProperties, className: '[&_.magic-bento__card]:!h-auto',
	}

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
	// 3.9.86: the suggestion is computed live (shown in G3's panel) and applied only with «اعمال پیشنهاد»
	const suggestSetup = () => {
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
		return { strat, why: why.join('، '), horizon: hMap[strat], mkt: ({ survive: 4, hold: 6, grow: 12 } as Record<string, number>)[strat] }
	}
	const doAutoSetup = () => {
		const { strat, why: w, horizon } = suggestSetup()
		const why = [w], hMap: Record<string, number> = { [strat]: horizon }
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
	const sug = suggestSetup()
	const applySuggestion = () => { doAutoSetup(); update({ fcMktPct: String(sug.mkt) }, 'fcMktPct') }
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

	// 3.9.68: نمای بنتو — فقط نمایشِ همان خروجی‌های compute و معاملاتِ همین صفحه
	const bento = (() => {
		const ch: Record<string, number> = {}, st = { cash: 0, check: 0, hold: 0 }
		for (const p of ctx.people || []) for (const d of (p as { inv?: Record<string, unknown>[] }).inv || []) {
			if ((d.funnel || 'won') !== 'won') continue
			const a = parseFloat(String(d.amount ?? '').replace(/[^\d.-]/g, '')) || 0
			const c = d.channel === 'unofficial' ? 'غیررسمی' : 'رسمی'
			ch[c] = (ch[c] || 0) + a
			if (d.settle === 'hold') st.hold += a
			else if (d.settle === 'check' || d.settle === 'cash_after_check') st.check += a
			else st.cash += a
		}
		const today = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', month: 'numeric' }).format(new Date())
		return { channels: Object.entries(ch).map(([name, value]) => ({ name, value })), settle: st, month: Math.max(0, Math.min(11, (parseInt(today, 10) || 1) - 1)) }
	})()

	return (
		<div dir="rtl" className="fc-root flex flex-col gap-6 pb-24 selection:bg-primary/15" style={VARS}>
			<Suspense fallback={null}>
				<ForecastBento year={r.ty} target={r.R} safeTarget={r.safeT} forecast={r.monthlyBlended && r.monthlyBlended.length ? r.monthlyBlended.slice(0, 12) : null}
					actual={r.act} channels={bento.channels} settle={bento.settle} month={bento.month} readiness={r.ready} />
			</Suspense>
			<PyramidOverview tiers={pyramid} badge={saveBadge} />

			{/* ۲) راهنما — React Bits FlowingMenu */}
			<section data-testid="fc-guide" className="overflow-hidden rounded-[28px] bg-[#120F17] text-white">
				<div className="flex items-end justify-between gap-4 px-6 pb-2 pt-5">
					<div>
						<h3 className="text-[18px] font-extrabold leading-7">راهنمای روش‌ها و فرمول‌ها</h3>
						<p className="text-[12.5px] leading-6 text-white/70">خلاصهٔ مرجعِ ۹ روش، فرمول‌ها و ابزارهای تعدیل</p>
					</div>
					<p className="hidden max-w-[36ch] text-[12px] leading-6 text-white/60 sm:block">پیش‌بینی فروش = تخمین + انتظار + دورهٔ برنامه با تولرانسِ ۱۰ تا ۲۰٪. خروجیِ نهایی = میانگینِ روش‌های انتخاب‌شده.</p>
				</div>
				<div className="h-[520px]">
					<FlowingMenu
						ariaLabel="راهنمای روش‌ها"
						showIndex
						activeIndex={guideAt}
						onItemClick={(_, index) => setGuideAt(index)}
						items={[
							...GUIDE.map((m) => ({ text: m[1], meta: m[2], marquee: `${m[4]}  ·  ${m[5]}` })),
							{ text: 'هموارسازیِ نمایی (Holt)', meta: 'سطح و روند', marquee: 'Lₜ = α·xₜ + (1−α)·(Lₜ₋₁ + Tₜ₋₁)    Tₜ = β·(Lₜ − Lₜ₋₁) + (1−β)·Tₜ₋₁' },
							{ text: 'تعدیلِ پتانسیلِ فروش', meta: 'فصل ۱۸', marquee: 'پتانسیلِ فروش = پتانسیلِ بازار × سهم٪ × (۱+برند٪) × (۱+اورنس٪) × (۱+کانال٪) × (۱+رقبا٪)' },
							...[
								['سهم بالقوه', '۱–۱۰۰٪'], ['برند', '۰ تا +۲۰٪'], ['اورنس', '−۲۰ تا +۲۰٪'], ['کانال', '−۱۵ تا +۱۵٪'], ['رقبا', '−۲۰ تا ۰٪'],
							].map(([name, band]) => ({ text: name, meta: band, marquee: band })),
							...[
								['توزیعِ فصلی و قمری', 'الگوی فصلیِ صنعت'],
								['حاشیهٔ احتیاطِ ریسک', 'هدفِ امن = پیش‌بینی × (۱ − safety)'],
								['شامخ ← سیاستِ فروش', 'مرزِ ۵۰'],
								['استراتژی ← بودجهٔ بازاریابی', 'بقا ۳–۵٪ · حفظ ۵–۱۰٪ · رشد ۱۰–۱۵٪'],
							].map(([name, band]) => ({ text: name, meta: band, marquee: band })),
						]}
					/>
				</div>
				<div className="border-t border-white/10 px-6 py-5 text-[12.5px] leading-7">
					{guideAt < GUIDE.length ? (
						<div className="grid gap-3 sm:grid-cols-2">
							<div><div className="text-[11px] text-white/50">چه می‌کند</div><div>{GUIDE[guideAt][3]}</div></div>
							<div><div className="text-[11px] text-white/50">فرمول</div><div className="font-mono text-[12.5px]">{GUIDE[guideAt][4]}</div></div>
							<div><div className="text-[11px] text-white/50">کِی</div><div className="text-white/80">{GUIDE[guideAt][5]}</div></div>
							<div><div className="text-[11px] text-white/50">مثال (بر اساس صنعت)</div><div className="text-emerald-300">{guideEx(GUIDE[guideAt][0], ind)}</div></div>
						</div>
					) : guideAt === GUIDE.length ? (
						<div className="text-white/80">
							<p className="mb-2">برخلافِ «میانگینِ متحرک» که همهٔ ماه‌ها را یکسان می‌بیند، Holt سریِ ماهانه را با دو مؤلفهٔ زنده دنبال می‌کند و هر ماه به‌روزشان می‌کند:</p>
							<div dir="ltr" className="mb-2 rounded-lg bg-white/5 px-3 py-2 font-mono text-[12px] leading-8">Lₜ = α·xₜ + (1−α)·(Lₜ₋₁ + Tₜ₋₁) ← سطح (Level)<br />Tₜ = β·(Lₜ − Lₜ₋₁) + (1−β)·Tₜ₋₁ ← روند (Trend)<br />پیش‌بینیِ k ماهِ بعد = Lₜ + k·Tₜ</div>
							<ul className="list-disc space-y-1 pr-5">
								<li>سطح (L): برآوردِ «الانِ» فروش. روند (T): شیبِ تغییر (رشد یا افت در هر ماه).</li>
								<li>α (آلفا): وزنِ داده‌های اخیر. آلفای بالا (۰٫۷–۰٫۹) یعنی به فروشِ ماه‌های اخیر بیشتر بها بده — مناسبِ بازارِ تورمیِ ایران. آلفای پایین = هموارترِ ولی کندتر.</li>
								<li>β (بتا): وزنِ تغییرِ روند (پیش‌فرض ۰٫۱۵).</li>
								<li>چون روند را می‌بیند، اگر فروش رو به رشد باشد Holt هم پیش‌بینیِ رو به رشد می‌دهد — نه یک عددِ صاف.</li>
							</ul>
							<p className="mt-2 text-emerald-300">مثالِ «{indFa}»: {guideEx('۷', ind)} — یعنی روند در پیش‌بینی دیده می‌شود، نه فقط میانگین.</p>
						</div>
					) : guideAt === GUIDE.length + 1 ? (
						<div>
							<div className="font-mono text-[12.5px]">پتانسیلِ فروش = پتانسیلِ بازار × سهم٪ × (۱+برند٪) × (۱+اورنس٪) × (۱+کانال٪) × (۱+رقبا٪)</div>
							<p className="mt-2 text-white/75">مثالِ کافی‌شاپِ جزوه: عمقِ بازار ۵۰ میلیارد × سهمِ ۱۰٪ = ۵ میلیارد → ×۱٫۲ (برند) → ×۰٫۹ (کانالِ ضعیف) → ×۰٫۸۵ (رقبای قوی) = ۴٫۵۹ میلیارد. ضریبی اعمال می‌شوند، نه جمع‌وتفریقی.</p>
							<p className="mt-2 text-white/75">دکمهٔ «پیشنهاد خودکارِ سیستم» در روش ۴، این چهار ضریب را از داده‌های موجود (فروش، عمقِ بازار، استراتژی، مؤلفه‌های آمادگی) خودکار پیشنهاد می‌دهد.</p>
						</div>
					) : guideAt < GUIDE.length + 7 ? (
						<div>
							{([
								['سهم بالقوه', 'Share', 'چند درصد از کلِ بازار را هدف گرفته‌ای؟ = فروشِ پارسال ÷ عمقِ بازار.', '۱–۱۰۰٪'],
								['برند', 'Brand', 'قدرتِ برند روی قیمت و وفاداری. در ایران تا سقفِ ~۲۰٪ منطقی است.', '۰ تا +۲۰٪'],
								['اورنس', 'Awareness', 'شناخته‌شدگی: اگر بازار سه برندِ اولِ صنعت را نام ببرد، اسمِ تو هست؟ سطحش (محله/شهر/کشور) مهم است.', '−۲۰ تا +۲۰٪'],
								['کانال', 'Channel', 'گستردگیِ توزیع/تعدادِ شعب و نقاطِ دسترسی. بیشتر = پتانسیلِ بالاتر.', '−۱۵ تا +۱۵٪'],
								['رقبا', 'Competitors', 'قدرت و تعدادِ رقبا. رقیبِ قوی هم سهم و هم قدرتِ قیمت‌گذاری را کم می‌کند (معمولاً منفی).', '−۲۰ تا ۰٪'],
							][guideAt - GUIDE.length - 2] || []).length ? (
								<>
									<div className="text-[18px] font-extrabold">{[
										['سهم بالقوه', 'Share', 'چند درصد از کلِ بازار را هدف گرفته‌ای؟ = فروشِ پارسال ÷ عمقِ بازار.', '۱–۱۰۰٪'],
										['برند', 'Brand', 'قدرتِ برند روی قیمت و وفاداری. در ایران تا سقفِ ~۲۰٪ منطقی است.', '۰ تا +۲۰٪'],
										['اورنس', 'Awareness', 'شناخته‌شدگی: اگر بازار سه برندِ اولِ صنعت را نام ببرد، اسمِ تو هست؟ سطحش (محله/شهر/کشور) مهم است.', '−۲۰ تا +۲۰٪'],
										['کانال', 'Channel', 'گستردگیِ توزیع/تعدادِ شعب و نقاطِ دسترسی. بیشتر = پتانسیلِ بالاتر.', '−۱۵ تا +۱۵٪'],
										['رقبا', 'Competitors', 'قدرت و تعدادِ رقبا. رقیبِ قوی هم سهم و هم قدرتِ قیمت‌گذاری را کم می‌کند (معمولاً منفی).', '−۲۰ تا ۰٪'],
									][guideAt - GUIDE.length - 2][0]} <span className="text-white/50">({[
										['سهم بالقوه', 'Share'], ['برند', 'Brand'], ['اورنس', 'Awareness'], ['کانال', 'Channel'], ['رقبا', 'Competitors'],
									][guideAt - GUIDE.length - 2][1]})</span></div>
									<p className="mt-1 text-white/75">{[
										['', '', 'چند درصد از کلِ بازار را هدف گرفته‌ای؟ = فروشِ پارسال ÷ عمقِ بازار.', '۱–۱۰۰٪'],
										['', '', 'قدرتِ برند روی قیمت و وفاداری. در ایران تا سقفِ ~۲۰٪ منطقی است.', '۰ تا +۲۰٪'],
										['', '', 'شناخته‌شدگی: اگر بازار سه برندِ اولِ صنعت را نام ببرد، اسمِ تو هست؟ سطحش (محله/شهر/کشور) مهم است.', '−۲۰ تا +۲۰٪'],
										['', '', 'گستردگیِ توزیع/تعدادِ شعب و نقاطِ دسترسی. بیشتر = پتانسیلِ بالاتر.', '−۱۵ تا +۱۵٪'],
										['', '', 'قدرت و تعدادِ رقبا. رقیبِ قوی هم سهم و هم قدرتِ قیمت‌گذاری را کم می‌کند (معمولاً منفی).', '−۲۰ تا ۰٪'],
									][guideAt - GUIDE.length - 2][2]}</p>
									<div className="mt-2 font-bold text-amber-200">بازهٔ عادی: {[
										'۱–۱۰۰٪', '۰ تا +۲۰٪', '−۲۰ تا +۲۰٪', '−۱۵ تا +۱۵٪', '−۲۰ تا ۰٪',
									][guideAt - GUIDE.length - 2]}</div>
								</>
							) : null}
						</div>
					) : (
						<p className="text-white/80">{[
							'عددِ سالانهٔ روش‌های قضاوتی (۱–۴، ۸، ۹) با الگوی فصلیِ صنعت پخش می‌شود؛ ۵/۶/۷ مستقیم ماهانه‌اند. رمضان و محرم خودکار (قمری) اعمال می‌شوند.',
							'بر پایهٔ تعهدِ مالی، ریسک‌پذیری و دارایی: هدفِ امن = پیش‌بینی × (۱ − safety)',
							'مرزِ ۵۰: ≥۵۰ نقدی · <۵۰ اقساطی. قیمتِ مدت‌دار = نقدی × (۱+تورمِ‌ماهانه)^ماه ÷ (۱−ریسکِ‌چک).',
							'بقا ۳–۵٪ · حفظ ۵–۱۰٪ · رشد ۱۰–۱۵٪ (درصدی از فروش).',
						][guideAt - GUIDE.length - 7]}</p>
					)}
					<p className="mt-3 text-[12px] text-white/50">ستونِ مثال بر اساسِ صنعتِ انتخاب‌شده («{indFa}») نمایش داده می‌شود — صنعت را در گامِ ۱ عوض کنی، مثال‌ها هم عوض می‌شوند.</p>
				</div>
			</section>

			<Band tier="gold" title="فعالیت‌های فروش" desc="پایهٔ پیش‌بینی: صنعت، افق و استراتژی، دادهٔ تاریخی و آمادگی">
				{/* G1) صنعت — React Bits MagicBento (same options, same doIndustry) */}
				<SpotlightCard theme={mode} spotlightColor="#004991" data-testid="fc-industry">
					<h3 className="flex items-center gap-2 text-xl font-bold leading-8">صنعت کسب‌وکار چیست؟</h3>
					<p className="mt-2 text-sm leading-6 opacity-70">اول صنعت را انتخاب کن تا پیش‌فرض‌های تخصصی (حاشیه سود، الگوی فصلی، نرخ خرید...) خودکار اعمال شود.</p>
					<p className="mb-3 mt-4 text-sm font-semibold">صنعت کسب‌وکار: پیش‌فرض‌های تخصصی</p>
					<MagicBento {...deck} columns={3} items={INDUSTRY_OPTS.filter((o) => o[0]).map(([value, label]): MagicBentoItem => ({
						id: value, title: label, label: v('fcIndustry') === value ? '✓' : '', onClick: () => doIndustry(value),
					}))} />
					<FieldDescription>تغییر صنعت، تمام مقادیر پیش‌فرض را بازنویسی می‌کند.</FieldDescription>
					<div className="mt-4">
						<div className="mb-2 font-semibold">جزئیات الگوها و پیش‌فرض‌ها</div>
						<div className="prose prose-sm max-w-none text-inherit md:prose-base prose-li:my-1 prose-strong:text-inherit">
							{indN ? <Markdown>{toBullets(stripHtml(indN))}</Markdown> : <p className="opacity-70">صنعت را انتخاب کن تا الگوها و پیش‌فرض‌هایش این‌جا بیاید.</p>}
						</div>
					</div>
				</SpotlightCard>

				{/* G3) افق، استراتژی، دلار — MagicBento for horizon + strategy; gauge untouched */}
				<SpotlightCard theme={mode} spotlightColor="#FCBF00" data-testid="fc-setup">
					<h3 className="flex items-center gap-2 text-xl font-bold leading-8">پیش‌بینی فروش و بودجه‌بندی <InfoTip>پیش‌بینی فروش یعنی تخمینِ حجم فروشی که می‌توان «انتظار» داشت (نه آرزو)، در یک افق زمانیِ مشخص و با تولرانس ۱۰ تا ۲۰ درصد. اعداد زنده محاسبه و روی سرور ذخیره می‌شوند.</InfoTip></h3>
					<p className="mt-2 text-sm leading-6 opacity-70">تخمین فروش قابل انتظار در افق مشخص، با تلورانس ±۱۰–۲۰٪</p>
					<Field className="mt-5">
						<FieldLabel>افق دید</FieldLabel>
						<MagicBento {...deck} columns={3} items={[
							{ id: '1', title: 'ماهانه', label: (v('fcHorizonUnit') || '1') === '1' ? '✓' : '', onClick: () => update({ fcHorizonUnit: '1' }, 'fcHorizonUnit') },
							{ id: '3', title: 'فصلی', label: (v('fcHorizonUnit') || '1') === '3' ? '✓' : '', onClick: () => update({ fcHorizonUnit: '3' }, 'fcHorizonUnit') },
							{ id: '12', title: 'سالانه', label: (v('fcHorizonUnit') || '1') === '12' ? '✓' : '', onClick: () => update({ fcHorizonUnit: '12' }, 'fcHorizonUnit') },
						]} />
						<div className="mt-3 flex items-center gap-2">
							<span className="text-sm opacity-70">طولِ افق:</span>
							<div className="w-24">{txt('fcHorizon', { w: '!h-11' })}</div>
							<span className="text-sm opacity-70">{v('fcHorizonUnit') === '12' ? 'سال' : v('fcHorizonUnit') === '3' ? 'فصل' : 'ماه'}</span>
						</div>
					</Field>
					<Field className="mt-5">
						<FieldLabel>استراتژی امسال</FieldLabel>
						<MagicBento {...deck} columns={3} items={STRAT_PLANS.map((p): MagicBentoItem => ({
							id: p.id, title: p.title, description: p.desc, icon: <p.icon className="size-4" />,
							label: ((v('fcStrategy') || 'hold') === p.id ? '✓ ' : '') + p.price,
							onClick: () => update({ fcStrategy: p.id }, 'fcStrategy'),
						}))} />
						{r.stratNote && <FieldDescription>{r.stratNote}</FieldDescription>}
					</Field>
					<div className="mx-auto h-[360px] w-full max-w-[300px]" data-testid="fc-usd-gauge">
						<GaugeTile id="speed" hero pinned={{ value: r.usd / 1000, max: 400, spec: { label: 'نرخ دلار امروز (تومان): مبنای محاسبه‌ی دلاری', unit: 'هزار تومان', faceUnit: 'هزار تومان', code: '0–400', step: 100, minor: 2, decimals: 3, redFrom: undefined, redTo: undefined } }} />
					</div>
					<Field>
						<FieldLabel htmlFor="fcUsdIn">نرخ دلار امروز (تومان)</FieldLabel>
						<InputGroup>
							<CurrencyInput id="fcUsdIn" dir="ltr" inputMode="numeric" allowDecimals={false} allowNegativeValue={false} groupSeparator="," decimalSeparator="."
								value={toLat(v('fcUsd')).replace(/[^0-9]/g, '')} onValueChange={(val) => onText('fcUsd')(val || '')} placeholder="مثلاً 187,515"
								className="min-h-[44px] w-full min-w-0 flex-1 bg-transparent px-3 text-left text-[15px] tabular-nums outline-none placeholder:text-muted-foreground/70" />
							<span className="flex items-center px-2 text-xs opacity-70">تومان</span>
							<InputGroupAddon>
								<button type="button" onClick={doUsdFetch} disabled={usdBusy} className="min-h-[36px] whitespace-nowrap rounded-lg bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50">
									{usdBusy ? 'در حال دریافت…' : 'دریافت آنلاین'}
								</button>
							</InputGroupAddon>
						</InputGroup>
						<FieldDescription>{msg.usd ? stripHtml(msg.usd).replace(/\*\*/g, '') : 'مبنای محاسبهٔ دلاری؛ همهٔ اعداد معادلِ دلاری هم نشان داده می‌شوند تا از تورم گول نخوری.'}</FieldDescription>
					</Field>
					<SpotlightCard theme={mode} shape="beam" spotlightColor="#910D6A" className="mt-4">
						<div className="text-sm font-semibold">پیشنهاد خودکار</div>
						<div className="mt-2 text-2xl font-extrabold">بودجه پیشنهادی: {fa(sug.mkt)}٪</div>
						<p className="mt-2 text-xs leading-5 opacity-80">استراتژی <b>{STRAT_FA[sug.strat]}</b> · افق <b>{fa(sug.horizon)} ماه</b> — {sug.why}. بودجهٔ بازاریابی از فروشِ هدف؛ نرخ دلار هم آنلاین گرفته می‌شود.</p>
						<button type="button" onClick={applySuggestion} className="mt-3 min-h-[44px] rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">اعمال پیشنهاد</button>
						{msg.setup && <p className="mt-2 text-xs leading-5">{stripHtml(msg.setup).replace(/\*\*/g, '')}</p>}
					</SpotlightCard>
				</SpotlightCard>

				{/* G5) دادهٔ تاریخی — MagicBento year rows + stat tiles; same fields and figures */}
				<SpotlightCard theme={mode} spotlightColor="#FCBF00" data-testid="fc-history">
					<h3 className="text-xl font-bold leading-8">پیش‌بینی از داده‌ی تاریخی</h3>
					<p className="mt-1 text-sm opacity-70">سه سال اخیر را وارد کن</p>
					<MagicBento {...deck} enableTilt={false} columns={1} className="mt-4 [&_.magic-bento__card]:!h-auto [&_.magic-bento__card]:select-text" items={[0, 1, 2].map((i): MagicBentoItem => {
						const g = i === 1 ? r.g2 : i === 2 ? r.g3 : null
						return {
							id: 'hist-' + i,
							content: (
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
									<div className="text-[15px] font-bold leading-7">سال {fa(r.yrs[i])}{i === 2 ? <span className="ms-1 text-[#FCBF00]">(جدیدترین)</span> : null}</div>
									<label className="flex flex-col gap-1 text-xs font-semibold">فروش ریالی (تومان)
										<CurrencyInput dir="ltr" inputMode="numeric" allowDecimals={false} allowNegativeValue={false} groupSeparator="," decimalSeparator="." aria-label="فروش ریالی (تومان)" placeholder="مثلاً 12,000,000,000"
											value={toLat(v('fcY' + (i + 1))).replace(/[^0-9]/g, '')} onValueChange={(val) => onText('fcY' + (i + 1))(val || '')} className={MONEY} />
									</label>
									<label className="flex flex-col gap-1 text-xs font-semibold">میانگین نرخ دلار (تومان)
										<CurrencyInput dir="ltr" inputMode="numeric" allowDecimals={false} allowNegativeValue={false} groupSeparator="," decimalSeparator="." aria-label="میانگین نرخ دلار (تومان)" placeholder="اختیاری"
											value={toLat(v('fcD' + (i + 1))).replace(/[^0-9]/g, '')} onValueChange={(val) => onText('fcD' + (i + 1))(val || '')} className={MONEY} />
									</label>
									<div><div className="text-xs font-semibold">فروش دلاری</div><div className="mt-2 text-[15px] font-bold tabular-nums">{r.dol[i] > 0 ? '$' + sep(Math.round(r.dol[i])) : '—'}</div></div>
									<div><div className="text-xs font-semibold">رشد ریالی</div><div className="mt-2 text-[15px] font-bold">{i === 0 || g == null ? '—' : <Colored v={g}>{pct(g)}</Colored>}</div></div>
								</div>
							),
						}
					})} />
					<MagicBento {...deck} columns={4} className="mt-4 [&_.magic-bento__card]:!h-auto" items={[
						{ id: 'next', content: <div><div className="text-xs font-semibold opacity-70">پیش‌بینی سال بعد</div><div className="mt-1 text-[26px] font-extrabold leading-9 tabular-nums">{r.next ? <CountUp to={Math.round(r.next)} duration={2} startWhen /> : '—'}</div><div className="text-[11.5px] opacity-70">بر پایه‌ی روند — تومان</div></div> },
						{ id: 'dg', content: <div><div className="text-xs font-semibold opacity-70">رشد دلاری کل دوره</div><div className={`mt-1 text-[26px] font-extrabold leading-9 ${r.dg == null ? '' : r.dg >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{r.dg == null ? '—' : <><CountUp to={Math.round(r.dg * 10) / 10} decimals={1} duration={2} startWhen />٪</>}</div><div className="text-[11.5px] opacity-70">تا از تورم گول نخوری</div></div> },
						{ id: 'ma3', content: <div><div className="text-xs font-semibold opacity-70">میانگین متحرک ۳ ساله</div><div className="mt-1 text-[26px] font-extrabold leading-9 tabular-nums">{r.ma3 ? <CountUp to={Math.round(r.ma3)} duration={2} startWhen /> : '—'}</div><div className="text-[11.5px] opacity-70">کف فروش عادی — تومان</div></div> },
						{ id: 'avg', content: <div><div className="text-xs font-semibold opacity-70">میانگین رشد ریالی سالانه</div><div className={`mt-1 text-[26px] font-extrabold leading-9 ${!r.grs.length ? '' : r.avgG >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{r.grs.length ? <><CountUp to={Math.round(r.avgG * 10) / 10} decimals={1} duration={2} startWhen />٪</> : '—'}</div><div className="text-[11.5px] opacity-70">دو گذار اخیر</div></div> },
					]} />
					<p className="mt-4 text-center text-xs leading-6 opacity-60">نرخ دلار هر سال را هم پر کن تا رشد واقعی (دلاری) را ببینی و از تورم گول نخوری.</p>
				</SpotlightCard>

				{/* ۱۱) آمادگی — React Bits ElasticSlider */}
				<section data-testid="fc-ready" className="px-1">
					<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
						<div>
							<h3 className="text-[18px] font-extrabold leading-7">آمادگی پیش‌بینی: شش مؤلفه</h3>
							<p className="text-[12.5px] leading-6 text-muted-foreground">هرچه کامل‌تر، تخمین به تولرانس ۱۰–۲۰٪ نزدیک‌تر</p>
						</div>
						<div className="text-left">
							<div className="text-[11px] font-bold text-muted-foreground">نمره‌ی آمادگی · میانگین شش مؤلفه</div>
							<div className="text-[28px] font-extrabold tabular-nums leading-none">{pct(r.ready)}</div>
							<div className="mt-1 text-[12.5px] font-bold" style={{ color: r.tol.c }}>{r.tol.t}<span className="ms-2 font-medium text-muted-foreground">{r.tol.u}</span></div>
						</div>
					</div>
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
					<div className="mt-2 grid gap-6">
						{[
							['fcC1', '۱) داده‌های تاریخی'], ['fcC2', '۲) تحلیل بازار — رقبا، مصرف‌کننده، قانون/ارز'], ['fcC3', '۳) قیف فروش و CRM'],
							['fcC4', '۴) شاخص‌های کلان — شامخ، تورم، ارز'], ['fcC5', '۵) تقویم فصلی کسب‌وکار'], ['fcC6', '۶) عوامل داخلی سازمان'],
						].map(([id, l]) => (
							<div key={id}>
								<div className="mb-1 text-[13px] font-bold">{l} <span className="font-medium text-muted-foreground">(۰–۱۰۰)</span></div>
								<ElasticSlider ariaLabel={l} value={fnum(f[id])} startingValue={0} maxValue={100} isStepped stepSize={5} wheel={false}
									leftIcon={<span />} rightIcon={<span />} valuePosition="bubble" thickness={14} activeThickness={26} formatValue={(n) => fa(Math.round(n))}
									onChange={(n) => update({ [id]: String(n) }, id)} />
							</div>
						))}
					</div>
				</section>
			</Band>

			<Band tier="purple" title="اهداف فروش" desc="فروشِ هدف، نُه روشِ پیش‌بینی، بودجهٔ ماهانه و حاشیهٔ احتیاط">
				{/* ۴) هرم — React Bits Stepper */}
				<section data-testid="fc-pyramid">
					<h3 className="text-[18px] font-extrabold leading-7">هرم سه‌گانه‌ی پیش‌بینی فروش</h3>
					<p className="mb-4 text-[12.5px] leading-6 text-muted-foreground">اول عددِ فروش را تعیین کن، بعد بودجه را کنار بگذار، نه برعکس</p>
					<Stepper theme={mode} linear={false} showFooter={false} accentColor="#910D6A" initialStep={1}>
						<Step title="فروش هدف" description="تومان، سالانه">
							<Label>۱) فروش ریالی هدف، سالانه (تومان)</Label>
							{txt('fcRevenue')}
							<div className="mt-4 text-[11px] font-bold text-muted-foreground">بودجه‌ی بازاریابی · تومان — مثل مالیات، اول کنار بگذار</div>
							<div className="text-[32px] font-extrabold tabular-nums leading-none">{sep(r.mkt)}</div>
						</Step>
						<Step title="حجم" description="عدد در سال">
							<Label>۲) حجم فروش تعدادی، سالانه (عدد)</Label>
							{txt('fcVolume')}
							<p className="mt-3 text-[12px] leading-6 text-muted-foreground">اگر «قیمت هر واحد» را پر کنی، <b>حجم فروش خودکار = فروش هدف ÷ قیمت</b> حساب می‌شود (نیمه‌خودکار). اگر خالی بگذاری، حجم را دستی وارد کن.</p>
							<div className="mt-4 text-[11px] font-bold text-muted-foreground">میانگین قیمت هر واحد · تومان (فروش سالانه ÷ حجم سالانه)</div>
							<div className="text-[32px] font-extrabold tabular-nums leading-none">{sep(r.avgP)}</div>
						</Step>
						<Step title="بودجه" description="٪ از فروش">
							<Label>۳) بودجه‌ی بازاریابی (٪ از فروش)</Label>
							{txt('fcMktPct')}
							<div className="mt-4 text-[11px] font-bold text-muted-foreground">فروش لازم در هر ماه · تومان (فروش سالانه ÷ ۱۲)</div>
							<div className="text-[32px] font-extrabold tabular-nums leading-none">{sep(r.perMonth)}</div>
						</Step>
						<Step title="قیمت واحد" description="اختیاری">
							<Label>قیمت هر واحد (تومان، اختیاری)</Label>
							{txt('fcUnitPrice')}
							<div className="mt-4 text-[11px] font-bold text-muted-foreground">فروش لازم در افقِ انتخابی · تومان در {fa(r.Hm)} ماهِ افق</div>
							<div className="text-[32px] font-extrabold tabular-nums leading-none">{sep(r.perHorizon)}</div>
						</Step>
					</Stepper>
					<div className="mt-4 flex flex-wrap items-center gap-3">
						<Html h={x.volSource ? 'حجم فروش از فایل «ProductRank»: <b>' + faGroup(x.volSource.sold) + '</b> واحد از <b>' + fa(x.volSource.nProd) + '</b> محصول (حملِ بار حذف شد).' : 'فایل «ProductRank» جولیو را بده؛ تعدادِ فروخته‌شده (ستون «بستن») همهٔ محصولات جمع می‌شود و <b>«حمل بار» و خدمات حمل خودکار حذف می‌شوند</b> → حجم فروش پر می‌شود.'} />
						{importBtn}
						<Btn onClick={doAutoPyramid}>پیشنهاد خودکار (فروش هدف و بودجهٔ بازاریابی)</Btn>
					</div>
					{msg.pyramid && <Html className="mt-1.5" h={msg.pyramid} />}
					<Html className="mt-1.5" h={r.pyramidNote} />
				</section>

				{/* ۸) نه روش — React Bits ScrollStack */}
				<section data-testid="fc-methods">
					<h3 className="text-[18px] font-extrabold leading-7">نه روش پیش‌بینی فروش</h3>
					<p className="text-[12.5px] leading-6 text-muted-foreground">لازم نیست همه را پر کنی؛ ۵ روش هم کافی‌ست، بعد میانگین می‌گیریم</p>
					<p className="mb-2 text-[12.5px] leading-7 text-muted-foreground">همه‌ی اعداد به <b>تومان</b>اند. روش‌های «رگرسیون» و «میانگین متحرک» خودکار از جدول سه‌ساله‌ی بالا حساب می‌شوند. هرچه روش‌های بیشتری پر کنی و به هم نزدیک‌تر باشند، تخمین معتبرتر است.</p>
					<details className="mb-3 rounded-xl bg-muted/40 ring-1 ring-border">
						<summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 font-extrabold text-primary-ink"><Icon n="book" />راهنمای روش‌ها و مفاهیم</summary>
						<div className="space-y-2 px-4 pb-3.5 text-[12.5px] leading-8 text-muted-foreground">
							<p><b>کدام داده دستی است، کدام خودکار؟</b> روش‌های <b>۵ رگرسیون / ۶ میانگین متحرک / ۷ هموارسازی</b> کاملاً خودکار از جدول سه‌سالهٔ بالا حساب می‌شوند. روش‌های <b>۱ تا ۴ و ۸ و ۹</b> عددِ دستی می‌خواهند (نظر مدیر، کارشناسان، مشتری، هزینهٔ ثابت، ظرفیت). «نقطهٔ سربه‌سر (۸)» و «حاشیه» با ایمپورت صورت سود و زیان هم خودکار پر می‌شوند.</p>
							<p>۱) نظر مدیریتی: عددِ فروشِ کلِ سال (شهودِ مدیر). · ۲) دلفی: اعداد چند کارشناس با ویرگول → میانه. · ۳) تیم فروش: تخمین هر فروشنده با ویرگول → جمع. · ۴) نظرسنجی مشتری (عمقِ بازارِ جزوه): تعداد × میانگین خرید × نرخ٪ × <b>تکرارِ خرید در سال</b>. · ۵) رگرسیون: روند خطیِ ۳ سال (خودکار). · ۶) میانگین متحرک: کف فروش (خودکار). · ۷) هموارسازی نمایی: آلفا (بازار ایران ۰٫۷–۰٫۹). · ۸) نقطهٔ سربه‌سر: هزینهٔ ثابت ÷ حاشیه٪ (= مدلِ بقا). · ۹) ظرفیت: نیرو × ظرفیتِ روزانه × روزهای فعال × قیمت — <b>وقتی تقاضا &gt; عرضه</b>.</p>
							<p className="border-t border-dashed border-border pt-2"><b>آلفا (α) در هموارسازی نمایی:</b> ضریبی بین <b>۰ تا ۱</b> — پیش‌بینی = α×اخیر + (۱−α)×قبلی. α نزدیک ۱ = واکنش سریع به تغییرات تازه (بازار پرنوسان/تورمی)؛ α نزدیک ۰ = هموار و وزن به روند بلندمدت. طبق جزوه در تورم امروز α را بالاتر می‌گیریم؛ شروع خوب: ۰٫۴ تا ۰٫۶.</p>
						</div>
					</details>
					<div className="mt-4 h-[680px]">
					<ScrollStack className="h-full" itemDistance={48} blurAmount={0} tiltAmount={2} useWindowScroll={false}>
						<ScrollStackItem itemClassName="!h-auto min-h-[220px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۱</div><div className="text-[22px] font-extrabold leading-8">نظر مدیریتی</div><div className="text-[12.5px] opacity-70">شهودِ مدیرعامل</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[1] > 0 ? sep(r.mR[1]) : '—'}</div></div>
							<div className="mt-4">
							<div className="flex flex-wrap gap-2">{txt('fcM1', { w: '!w-[190px]' })}<Btn sm onClick={doM1Sug}><Icon n="bulb" className="size-3.5" />پیشنهاد سیستم</Btn></div>
							<Html className="mt-1 !text-primary-ink" h={msg.m1 || 'پیشنهاد بر پایهٔ فروشِ آخرین سال + جهش دلار/تورم + استراتژی محاسبه می‌شود. <b>دو سالِ پرشده کافی است</b> (حتی یک سال).'} />
						</div></ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[220px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۲</div><div className="text-[22px] font-extrabold leading-8">تکنیک دلفی</div><div className="text-[12.5px] opacity-70">اعداد کارشناسان → میانه</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[2] > 0 ? sep(r.mR[2]) : '—'}</div></div>
							<div className="mt-4">
							<div className="flex flex-wrap gap-2">
								<input value={v('fcM2')} onChange={(e) => update({ fcM2: e.target.value }, 'fcM2')} onBlur={(e) => { if (e.target.value.replace(/[^\d۰-۹]/g, '') !== '') update({ fcM2: fcGroupList(e.target.value) }, 'fcM2') }} placeholder="با ویرگول: ۹۰۰٬۰۰۰٬۰۰۰، ۱٬۱۰۰٬۰۰۰٬۰۰۰" className={`${inCls} min-w-[200px] flex-1`} />
								<Btn sm onClick={doM2Sug}><Icon n="bulb" className="size-3.5" />پیشنهاد سیستم</Btn>
							</div>
							<Html className="mt-1 !text-primary-ink" h={msg.m2 || 'سه عددِ محافظه‌کار/پایه/خوش‌بینانه پیشنهاد می‌شود؛ میانهٔ آن‌ها = تخمینِ دلفی. <b>دو سالِ پرشده کافی است</b>.'} />
						</div></ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[200px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۳</div><div className="text-[22px] font-extrabold leading-8">نظرسنجی تیم فروش</div><div className="text-[12.5px] opacity-70">تخمین هر فروشنده → جمع</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[3] > 0 ? sep(r.mR[3]) : '—'}</div></div>
							<div className="mt-4">
							<input value={v('fcM3')} onChange={(e) => update({ fcM3: e.target.value }, 'fcM3')} onBlur={(e) => { if (e.target.value.replace(/[^\d۰-۹]/g, '') !== '') update({ fcM3: fcGroupList(e.target.value) }, 'fcM3') }} placeholder="با ویرگول: ۵۰۰٬۰۰۰٬۰۰۰، ۳۰۰٬۰۰۰٬۰۰۰" className={inCls} />
						</div></ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[280px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۴</div><div className="text-[22px] font-extrabold leading-8">نظرسنجی مشتری</div><div className="text-[12.5px] opacity-70">تعداد بالقوه × میانگین خرید × نرخ خرید</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[4] > 0 ? sep(r.mR[4]) : '—'}</div></div>
							<div className="mt-4">
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
						</div></ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[160px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۵</div><div className="text-[22px] font-extrabold leading-8">رگرسیون</div><div className="text-[12.5px] opacity-70">روند خطی از ۳ سال</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[5] > 0 ? sep(r.mR[5]) : '—'}</div></div>
							<div className="mt-4"><span className="text-[12.5px] text-muted-foreground">خودکار از جدول بالا</span></div>
						</ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[160px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۶</div><div className="text-[22px] font-extrabold leading-8">میانگین متحرک</div><div className="text-[12.5px] opacity-70">کف فروش عادی</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[6] > 0 ? sep(r.mR[6]) : '—'}</div></div>
							<div className="mt-4"><span className="text-[12.5px] text-muted-foreground">خودکار از جدول بالا</span></div>
						</ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[200px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۷</div><div className="text-[22px] font-extrabold leading-8">هموارسازی نمایی (Holt)</div><div className="text-[12.5px] opacity-70">دنباله‌ای + روند · آلفا = <b>{fa(r.alpha)}</b> (بازار تورمی: ۰٫۷–۰٫۹)</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[7] > 0 ? sep(r.mR[7]) : '—'}</div></div>
							<div className="mt-4">
							{range('fcAlpha', 0.1, 0.9, 0.1)}
						</div></ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[260px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۸</div><div className="text-[22px] font-extrabold leading-8">نقطه‌ی سربه‌سر</div><div className="text-[12.5px] opacity-70">مدل بقا</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[8] > 0 ? sep(r.mR[8]) : '—'}</div></div>
							<div className="mt-4">
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
						</div></ScrollStackItem>
						<ScrollStackItem itemClassName="!h-auto min-h-[220px]">
							<div className="flex items-start justify-between gap-4"><div><div className="text-[12px] font-bold opacity-60">۹</div><div className="text-[22px] font-extrabold leading-8">ظرفیت (Capacity)</div><div className="text-[12.5px] opacity-70">وقتی تقاضا &gt; عرضه: سقفِ فروش = سقفِ تحویل</div></div><div className="text-[28px] font-extrabold tabular-nums">{r.mR[9] > 0 ? sep(r.mR[9]) : '—'}</div></div>
							<div className="mt-4">
							<div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
								<label><Label>نیرو (کافه=۱)</Label>{txt('fcCapWorkers')}</label>
								<label><Label>× روزانه/فیش</Label>{txt('fcCapDaily')}</label>
								<label><Label>× روز/ماه</Label>{txt('fcCapDays')}</label>
								<label><Label>× قیمت/میانگینِ‌فیش</Label>{txt('fcCapP')}</label>
							</div>
							<Html className="mt-1 !text-primary-ink" h={r.capNote} />
						</div></ScrollStackItem>
					</ScrollStack>
					</div>
					<div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-2 border-t border-border/70 pt-3 text-[13px]">
						<div><div className="text-[11px] font-bold text-muted-foreground">میانگین روش‌های پرشده</div><div className="text-[22px] font-extrabold tabular-nums">{sep(r.consensus)} <span className="text-[12px] font-medium text-muted-foreground">تومان — پیش‌بینی نهایی</span></div></div>
						<div><div className="text-[11px] font-bold text-muted-foreground">میانه‌ی روش‌ها</div><div className="text-[22px] font-extrabold tabular-nums">{sep(r.median)} <span className="text-[12px] font-medium text-muted-foreground">تومان</span></div></div>
						<div><div className="text-[11px] font-bold text-muted-foreground">پراکندگی روش‌ها</div><div className="text-[18px] font-extrabold tabular-nums">{r.spread ? sep(r.spread[0]) + ' — ' + sep(r.spread[1]) : '—'} <span className="text-[12px] font-medium text-muted-foreground">کمینه تا بیشینه</span></div></div>
						<div><div className="text-[11px] font-bold text-muted-foreground">روش‌های پرشده</div><div className="text-[22px] font-extrabold tabular-nums">{fa(r.filled.length)} <span className="text-[12px] font-medium text-muted-foreground">از ۹</span></div></div>
					</div>
					<Html className="mt-2" h={r.methodsNote} />
				</section>

				{/* ۹) پیش‌بینی ماهانه — React Bits CardSwap */}
				<section id="fcMonthlyCard" data-testid="fc-monthly">
					<h3 className="text-[18px] font-extrabold leading-7">پیش‌بینی ماهانه‌ی بودجه: چندروشی</h3>
					<p className="text-[12.5px] leading-6 text-muted-foreground">داده‌ی ماهانه‌ی سه‌ساله را وارد کن، روش‌ها را انتخاب کن، پیش‌بینی ماه‌به‌ماه بگیر</p>
					<p className="mb-4 mt-3 flex items-start gap-2 text-[12.5px] leading-7 text-muted-foreground"><Icon n="info" className="mt-1.5 size-4" /><span>این پیش‌بینی <b>همیشه برای کلِ سالِ هدف و ماه‌به‌ماه</b> است (سالانه، ۱۲ ماه) — مستقل از «افق دید». «افق دید» فقط اندازهٔ هدفِ هر دوره را در <b>هرمِ بالا</b> تعیین می‌کند. اگر سالِ جاری چند ماهش پر باشد، آن ماه‌ها <b>واقعی (✓)</b> و بقیه <b>پیش‌بینی</b> نمایش داده می‌شوند.</span></p>
					<div className="flex flex-wrap items-end gap-3">
						{importBtn}
						<Btn kind="ghost" sm onClick={doClearMonth}>پاک کردن داده‌ی ماهانه</Btn>
						<label className="flex items-center gap-2 text-[12px] font-bold text-muted-foreground">واحد اعداد فایل:{sel('fcUnit', [['rial', 'ریال (÷۱۰ به تومان)'], ['toman', 'تومان']], doUnit, '!h-9 !w-[150px]')}</label>
						<label className="flex items-center gap-2 text-[12px] font-bold text-muted-foreground">سال هدف پیش‌بینی:<span className="w-[90px]">{txt('fcTargetYear')}</span>
							{x.hist && x.hist.length ? <b className="text-[11px] text-primary-ink">← پیشنهاد: {fa(x.hist.reduce((m: number, h: any) => Math.max(m, h.year), 0) + 1)} (آخرین دادهٔ {fa(x.hist.reduce((m: number, h: any) => Math.max(m, h.year), 0))} +۱)</b> : null}
						</label>
					</div>
					<Html className="mt-2" h={msg.month || (x.hist && x.hist.length ? '<b>' + fa(x.hist.length) + '</b> سال داده‌ی ماهانه در سیستم (' + x.hist.map((h: any) => fa(h.year)).join('، ') + ')' + (x.ytd ? ' + سالِ جاری <b>' + fa(x.ytd.year) + '</b> با <b>' + fa(x.ytd.mfilled || 0) + '</b> ماهِ پرشده' : '') + '.' + (x._dollarWarn && x._dollarWarn.length ? " <span style='color:var(--fc-rose)'>⚠️ سلولِ «فروش دلاری» سال‌های " + x._dollarWarn.map(fa).join('، ') + ' در فایل نامعتبر بود — نرخ دلار آن سال را دستی وارد کن.</span>' : '') : 'قالب اکسل: هر ردیف یک سال، ستون‌ها «سال، فروردین … اسفند». حداقل دو سال داده لازم است. کل برنامه با <b>تومان</b> کار می‌کند؛ اگر اعداد فایل ریال‌اند، واحد را روی «ریال» بگذار تا خودکار تقسیم بر ۱۰ شود.')} />
					<h4 className="mb-2 mt-6 text-[13.5px] font-extrabold">انتخاب روش‌ها برای پیش‌بینی <span className="text-[11.5px] font-medium text-muted-foreground">یک روش، دو روش یا هر ۹ روش</span></h4>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => <span key={k}>{check('fcUse' + k, fa(k) + ' ' + LBL[k])}</span>)}
						<Btn kind="ghost" sm onClick={() => doSel(true)}>همه</Btn>
						<Btn kind="ghost" sm onClick={() => doSel(false)}>هیچ</Btn>
					</div>
					<p className="mt-1.5 text-[12px] leading-6 text-muted-foreground">روش‌های ۵/۶/۷ مستقیم روی سری ماهانه محاسبه می‌شوند؛ روش‌های قضاوتی (۱–۴، ۸، ۹) عددِ سالانه‌شان با <b>الگوی فصلی</b> بین ماه‌ها پخش می‌شود (چون اقتصاد ایران فصلی است). ستون «پیش‌بینی» میانگینِ روش‌های انتخاب‌شده است.</p>
					<div className="relative mx-auto mt-4 h-[560px] w-full max-w-[720px]">
						<CardSwap theme={mode} autoplay={false} draggable width={300} height={460} visibleCards={3}>
							{mo ? mo.histRows.map((yr) => (
								<SwapCard key={'y' + yr.year}>
									<div className="flex h-full flex-col gap-1.5 overflow-hidden p-4 text-[12px] leading-5">
										<div className="text-[11px] opacity-60">داده‌ی واردشده · سال</div>
										<div className="text-[28px] font-extrabold leading-none">{fa(yr.year)}</div>
										<div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5">
											{MN.map((name, i) => <div key={name} className="truncate"><span className="opacity-50">{name}</span> {yr.months[i] > 0 ? sep(yr.months[i]) : '—'}</div>)}
										</div>
										<div className="mt-auto">کل (تومان) <b>{sep(yr.total)}</b></div>
										<div>فروش دلاری {yr.rateOk && yr.dsales > 0 ? '$' + sep(yr.dsales) : <span style={{ color: ROSE }}>نامعتبر</span>}</div>
										<div>میانگین نرخ دلار {yr.rateOk ? sep(yr.drate) + ' ت' : <span style={{ color: ROSE }}>— دستی وارد کن</span>}</div>
										<div>رشد نسبت به سال قبل {yr.g == null ? '—' : <Colored v={yr.g}>{pct(yr.g)}</Colored>}</div>
									</div>
								</SwapCard>
							)) : null}
							{mo && mo.blTot > 0 ? (
								<SwapCard key="blend">
									<div className="flex h-full flex-col gap-1.5 overflow-hidden p-4 text-[12px] leading-5">
										<div className="text-[11px] opacity-60">سال {fa(r.ty)} · واقعی+پیش‌بینی</div>
										<div className="text-[28px] font-extrabold leading-none">{sep(mo.blTot)} <span className="text-[12px] font-medium">تومان</span></div>
										<div className="grid grid-cols-3 gap-x-2">
											{MN.map((name, m) => {
												const isA = !!(mo.actualM && mo.actualM[m] > 0)
												return <div key={name} className={isA ? 'font-extrabold' : 'italic opacity-80'}>{name} {mo.fin[m] > 0 ? sep(mo.fin[m]) : '—'}{isA ? ' ✓' : ''}</div>
											})}
										</div>
										<div className="mt-auto">فروش دلاری {r.usd > 0 ? '$' + sep(Math.round(mo.blTot / r.usd)) : '—'}</div>
										<div>میانگین نرخ دلار {r.usd > 0 ? sep(r.usd) + ' ت' : '—'}</div>
										<div>رشد نسبت به سال قبل {mo.lastHistTotal > 0 ? <Colored v={(mo.blTot / mo.lastHistTotal - 1) * 100}>{pct((mo.blTot / mo.lastHistTotal - 1) * 100)}</Colored> : '—'}</div>
										<p className="text-[11px] opacity-70">آبی ✓ = عددِ واقعیِ ثبت‌شده ({fa(mo.nAct)} ماه) · طلاییِ کج = پیش‌بینیِ ۹ روش</p>
									</div>
								</SwapCard>
							) : null}
							{mo ? MN.map((mn, m) => {
								const isAct = !!(mo.actualM && mo.actualM[m] > 0)
								return (
									<SwapCard key={mn}>
										<div className="flex h-full flex-col gap-1 overflow-hidden p-4 text-[12.5px] leading-6">
											<div className="text-[11px] opacity-60">ماه</div>
											<div className="text-[30px] font-extrabold leading-none">{mn}{isAct ? <span className="ms-2 text-[16px] text-emerald-600">✓</span> : null}</div>
											{mo.sel.map((k) => <div key={k} className="flex justify-between gap-2"><span>{LBL[k]}</span><b className="tabular-nums">{mo.perM[k][m] > 0 ? sep(mo.perM[k][m]) : '—'}</b></div>)}
											<div className="mt-auto flex justify-between gap-2 font-extrabold"><span>{mo.nAct ? 'واقعی/پیش‌بینی' : 'پیش‌بینی'} (تومان)</span><span className="tabular-nums">{sep(mo.fin[m])}</span></div>
											<div className="flex justify-between gap-2 font-extrabold"><span>$ لازم</span><span>{usdCell(mo.fin[m])}</span></div>
										</div>
									</SwapCard>
								)
							}) : (
								<SwapCard key="empty">
									<div className="grid h-full place-items-center p-6 text-center text-[13px] leading-7">هنوز داده‌ی ماهانه وارد نشده — از «مرکز ایمپورت» فایلِ فروش ماهانه یا صورت سود و زیان را بده.</div>
								</SwapCard>
							)}
							{mo ? (
								<SwapCard key="year-total">
									<div className="flex h-full flex-col gap-1 overflow-hidden p-4 text-[12.5px] leading-6">
										<div className="text-[11px] opacity-60">کل سال</div>
										<div className="text-[28px] font-extrabold leading-none">{sep(mo.blTot)}</div>
										{mo.colTot.map((q, i) => <div key={i} className="flex justify-between"><span>{LBL[mo.sel[i]] || 'روش'}</span><b>{sep(q)}</b></div>)}
										<div className="font-extrabold">پیش‌بینی کل سال هدف {sep(mo.blTot)} تومان — سال {fa(r.ty)}{mo.sel.length ? ' · ' + fa(mo.sel.length) + ' روش' : ' · روشی انتخاب نشده'}{r.usd > 0 && mo.blTot > 0 ? ' · ≈ $' + sep(Math.round(mo.blTot / r.usd)) : ''}</div>
										<div>$ لازم {usdCell(mo.blTot)}</div>
										<div>بهترین ماه (اوج فصلی) {mo.blTot > 0 ? MN[mo.peak[0]] + ' · ' + sep(mo.peak[1]) : '—'}</div>
										<div>ضعیف‌ترین ماه {mo.blTot > 0 ? MN[mo.low[0]] + ' · ' + sep(mo.low[1]) : '—'}</div>
									</div>
								</SwapCard>
							) : null}
						</CardSwap>
					</div>
					{mo && <Html className="mt-2" h={(mo.nAct ? "<b style='color:#1E8E3E'>✓ = عددِ واقعیِ ثبت‌شدهٔ " + fa(r.ty) + ' (' + fa(mo.nAct) + ' ماه)</b>؛ بقیهٔ ماه‌ها پیش‌بینیِ ۹ روش است. ' : '') + (r.usd > 0 && mo.blTot > 0 ? 'برای رشدِ واقعی (نه فقط تورمی)، فروشِ <b>دلاری</b> هر ماه باید از همان ماهِ سال قبل بیشتر باشد. مثال: در <b>' + MN[mo.peak[0]] + "</b> باید حدود <b style='direction:ltr;display:inline-block'>$" + sep(Math.round(mo.peak[1] / r.usd)) + '</b> بفروشی. (نرخ دلار: ' + faGroup(r.usd) + ' تومان)' : 'نرخ دلار را در گام «افق دید» وارد کن تا ستونِ «$ لازم» و هدفِ دلاریِ هر ماه نمایش داده شود.')} />}
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
				</section>

				{/* ۱۲) ریسک — React Bits Counter */}
				<section data-testid="fc-risk">
					<h3 className="text-[18px] font-extrabold leading-7">خودارزیابی ریسکِ مدیرعامل</h3>
					<p className="text-[12.5px] leading-6 text-muted-foreground">این سه عدد تعیین می‌کنند چقدر محافظه‌کار برنامه بریزی. روی هر شمارنده بکش، یا با دکمه‌ها کم و زیاد کن.</p>
					<div className="mt-5 grid gap-4 md:grid-cols-3">
						{([
							['fcRisk', 'ریسک‌پذیری امسال', 1, 100, 1],
							['fcOblig', 'تعهد/مسئولیت مالی، «چاله‌ها»', 1, 10, 1],
							['fcAsset', 'آمادگی تزریق دارایی شخصی', 1, 10, 1],
						] as const).map(([id, label, min, max, step]) => {
							const value = fnum(f[id])
							const nudge = (dir: number) => {
								const next = Math.min(max, Math.max(min, Math.round((value + dir * step) * 1000) / 1000))
								update({ [id]: String(next) }, id)
							}
							return (
								<div
									key={id}
									role="slider"
									tabIndex={0}
									aria-label={label}
									aria-valuemin={min}
									aria-valuemax={max}
									aria-valuenow={value}
									className="cursor-ew-resize select-none rounded-[28px] bg-[#120F17] px-5 py-6 text-white outline-none focus-visible:ring-2 focus-visible:ring-[#FCBF00]"
									onKeyDown={(e) => {
										if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); nudge(1) }
										if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nudge(-1) }
									}}
									onPointerDown={(e) => {
										const el = e.currentTarget
										el.setPointerCapture(e.pointerId)
										el.dataset.x = String(e.clientX)
										el.dataset.v = String(value)
									}}
									onPointerMove={(e) => {
										const el = e.currentTarget
										if (!el.hasPointerCapture(e.pointerId) || el.dataset.x == null || el.dataset.v == null) return
										const dx = e.clientX - Number(el.dataset.x)
										const next = Math.min(max, Math.max(min, Math.round((Number(el.dataset.v) + dx / 8) / step) * step))
										if (next !== fnum(f[id])) update({ [id]: String(next) }, id)
									}}
								>
									<div className="text-[12px] leading-6 text-white/60">{label}</div>
									<div className="text-[11px] text-white/40">{fa(min)} تا {fa(max)}</div>
									<Counter value={value} locale="fa-IR" fontSize={56} fontWeight={800} textColor="#FCBF00" duration={0.35} />
									<div className="mt-3 flex gap-2">
										<button type="button" className="grid size-10 place-items-center rounded-full bg-white/10 text-lg font-bold" onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(-1)} aria-label={`${label} کمتر`}>−</button>
										<button type="button" className="grid size-10 place-items-center rounded-full bg-white/10 text-lg font-bold" onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(1)} aria-label={`${label} بیشتر`}>+</button>
									</div>
								</div>
							)
						})}
					</div>
					<div className="mt-4 grid gap-4 md:grid-cols-2">
						<div className="rounded-[28px] bg-[#120F17] px-6 py-7 text-white">
							<div className="text-[12px] text-white/60">حاشیه‌ی احتیاط پیشنهادی · زیر هدف برنامه ببند</div>
							<Counter value={Math.round((r.safety || 0) * 10) / 10} decimals={1} suffix="٪" locale="fa-IR" fontSize={72} fontWeight={800} textColor="#FCBF00" duration={0.8} />
						</div>
						<div className="rounded-[28px] bg-[#120F17] px-6 py-7 text-white">
							<div className="text-[12px] text-white/60">هدفِ محافظه‌کارانه · تومان، هدف پس از حاشیه</div>
							<Counter value={Math.round(r.safeT || 0)} locale="fa-IR" fontSize={48} fontWeight={800} textColor="#ffffff" duration={0.9} />
						</div>
					</div>
					<Html className="mt-4" h={'هرچه تعهد مالی‌ات بیشتر و ریسک‌پذیری‌ات کمتر باشد، باید محافظه‌کارتر برنامه ببندی. با اعداد فعلی، پیشنهاد این است که برنامه را حدود <b>' + pct(r.safety) + '</b> زیر هدف (' + sep(r.safeT) + ' تومان) ببندی تا اگر فروش کمتر از انتظار شد، نقدینگی‌ات قفل نشود.'} />
				</section>
			</Band>

			<Band tier="blue" title="نتایج کسب‌وکار" desc="واقعی در برابر پیش‌بینی، سقفِ هزینه‌ها و اثرِ تورم">
				{/* ۱۰) واقعی در برابر پیش‌بینی — React Bits AnimatedList */}
				<section data-testid="fc-variance">
					<h3 className="text-[18px] font-extrabold leading-7">واقعی در برابر پیش‌بینی</h3>
					<p className="mb-3 text-[12.5px] leading-6 text-muted-foreground">پیش‌بینی ملاک است؛ با ورود معاملاتِ هر ماه، عقب/جلو بودن نسبت به پیش‌بینی محاسبه می‌شود</p>
					{(() => {
						const va = r.va, gap = va.sumA - va.sumF, gvr = va.sumF > 0 ? (gap / va.sumF) * 100 : 0, gc = gap >= 0 ? GREEN : ROSE
						const rows = !r.monthlyForecast
							? [{ title: 'ملاک هنوز ساخته نشده', description: 'اول در همین تب پیش‌بینی را بساز (روش‌ها را انتخاب کن) تا ملاک ساخته شود.', meta: '' }]
							: va.rows.length
								? [
									{ title: 'واقعیِ تا این‌جا', description: sep(Math.round(va.sumA)) + ' تومان', meta: r.monthlyForecast ? fa(va.nM) + ' ماهِ دارای واقعی' : '— ماه' },
									{ title: 'پیش‌بینیِ همان ماه‌ها', description: sep(Math.round(va.sumF)) + ' تومان', meta: 'تومان' },
									{ title: 'عقب/جلو', description: (gap >= 0 ? '▲ جلو ' : '▼ عقب ') + pct(Math.abs(gvr)), meta: (gap >= 0 ? '+' : '−') + sep(Math.abs(Math.round(gap))) + ' تومان' },
									...va.rows.map((q) => ({
										title: MN[q.m],
										description: 'پیش‌بینی (ملاک) ' + sep(Math.round(q.f)) + ' · واقعی ' + sep(Math.round(q.a)),
										meta: (q.diff >= 0 ? '▲ جلو ' : '▼ عقب ') + pct(Math.abs(q.vr)) + ' · ' + (q.diff >= 0 ? '+' : '−') + sep(Math.abs(Math.round(q.diff))),
									})),
								]
								: [{ title: 'بدون واقعی', description: 'هنوز ماهی داده‌ی واقعی ندارد. معاملاتِ ماه را ایمپورت کن (یا فایلِ فروش ماهانه) تا مقایسه انجام شود.', meta: '' }]
						return (
							<>
								<AnimatedList theme={mode} items={rows} maxHeight={460} frame accentColor="#004991" selectOnHover={false} />
								<Html className="mt-3" h={!r.monthlyForecast ? 'برای مقایسه، اول پیش‌بینیِ ماهانه باید محاسبه شده باشد.' : va.nM ? 'تا این‌جا (' + fa(va.nM) + ' ماه) مجموعِ واقعی <b>' + sep(Math.round(va.sumA)) + '</b> در برابرِ پیش‌بینیِ <b>' + sep(Math.round(va.sumF)) + '</b> تومان — یعنی ' + (gap >= 0 ? "<b style='color:#1E8E3E'>" + pct(Math.abs(gvr)) + ' جلوتر</b>' : "<b style='color:var(--fc-rose)'>" + pct(Math.abs(gvr)) + ' عقب‌تر</b>') + ' از پیش‌بینی. واقعیِ هر ماه از معاملاتِ بسته‌شدهٔ همان ماه (یا فایلِ فروش ماهانه) می‌آید.' : 'با ورودِ معاملاتِ هر ماه (تبِ عملکرد ← ایمپورتِ معاملات)، عقب/جلو بودنِ آن ماه نسبت به پیش‌بینی این‌جا نشان داده می‌شود.'} />
							</>
						)
					})()}
				</section>
				{/* ۶) نسبت‌های طلایی — React Bits OptionWheel */}
				<section data-testid="fc-ratios" className="grid items-center gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
					<div>
						<h3 className="text-[18px] font-extrabold leading-7">نسبت‌های طلاییِ تخصیص منابع</h3>
						<p className="text-[12.5px] leading-6 text-muted-foreground">سقف استانداردهای عملیاتی، برگرفته از جزوه</p>
						{(() => {
							const bands = [
								{ n: 'کمیسیون فروش', mn: 5, mx: 15 },
								{ n: 'بازاریابی', mn: 5, mx: 10 },
								{ n: 'تبلیغات', mn: 1, mx: 5 },
								{ n: 'اجاره', mn: 15, mx: 20 },
								{ n: 'حقوق شرکت‌های تولیدی', mn: 19, mx: 20 },
								{ n: 'حقوق شرکت‌های خدماتی', mn: 25, mx: 35 },
							]
							const o = bands[Math.min(ratioAt, bands.length - 1)]
							return (
								<div className="mt-6">
									<div className="text-[13px] font-bold text-muted-foreground">{o.n}</div>
									<div className="text-[40px] font-extrabold leading-none tabular-nums">{fa(o.mn)}٪ تا {fa(o.mx)}٪</div>
									{r.R > 0 && <div className="mt-2 text-[14px] text-muted-foreground">≈ {sep((r.R * o.mn) / 100)} تا {sep((r.R * o.mx) / 100)} تومان</div>}
								</div>
							)
						})()}
					</div>
					<div className="h-[340px] overflow-hidden rounded-[28px] bg-[#0c0c0e]">
						<OptionWheel
							items={['کمیسیون فروش', 'بازاریابی', 'تبلیغات', 'اجاره', 'حقوق شرکت‌های تولیدی', 'حقوق شرکت‌های خدماتی']}
							defaultSelected={0}
							onChange={(index) => setRatioAt(index)}
							side="right"
							fontSize={1.15}
							spacing={1.35}
							textColor="#a1a1aa"
							activeColor="#FCBF00"
							soundUrl=""
						/>
					</div>
					<p className="text-[12px] leading-6 text-muted-foreground lg:col-span-2">این اعداد <b>سقف</b> استانداردهای عملیاتی هستند و بسته به مدل کسب‌وکار بهینه‌سازی می‌شوند. اگر «فروش هدف» را پر کرده باشی، معادل تومانیِ هر بازه هم زیر آن نشان داده می‌شود.</p>
				</section>
				{/* ۷) سناریوهای تورمی — React Bits Stack */}
				<section data-testid="fc-inflation">
					<h3 className="text-[18px] font-extrabold leading-7">سناریوهای تورمی</h3>
					<p className="mb-3 text-[12.5px] leading-6 text-muted-foreground">تورم ۵۰٪، ۷۰٪ و ۱۲۰٪؛ هر سناریو تصمیم متفاوتی می‌طلبد. مبنا: همان «فروش ریالی هدف» بالا. برای <b>حفظ ارزش واقعی</b> در هر سناریوی تورم، فروش اسمی باید چقدر شود؛ و اگر فروش اسمی ثابت بماند، ارزش واقعی چقدر آب می‌رود.</p>
					<div className="relative mx-auto h-[380px] w-full max-w-[460px]">
						<Stack
							layout="fan"
							visible={3}
							spread={0.9}
							autoplay={false}
							sendToBackOnClick
							cards={r.scen.map((s) => (
								<div key={s.s} className="flex h-full flex-col justify-between bg-[#120F17] p-7 text-white">
									<div className="text-[13px] text-white/60">سناریوی تورم</div>
									<div className="text-[42px] font-extrabold leading-none">تورم {fa(s.s)}٪</div>
									<div><div className="text-[12px] text-white/55">فروش اسمی لازم برای حفظ ارزش</div><div className="text-[22px] font-extrabold tabular-nums">{sep(s.need)}</div></div>
									<div><div className="text-[12px] text-white/55">ارزش واقعی اگر فروش ثابت بماند</div><div className="text-[22px] font-extrabold tabular-nums">{sep(s.real)}</div></div>
									<div><div className="text-[12px] text-white/55">افت قدرت خرید</div><div className="text-[22px] font-extrabold tabular-nums text-rose-300">{pct(s.loss)}</div></div>
								</div>
							))}
						/>
					</div>
				</section>
			</Band>

		</div>
	)
}

function Method({ n, t, h, out, children }: { n: string; t: string; h: ReactNode; out: number; children: ReactNode }) {
	const tier = TIER[useContext(TierCtx)]
	const filled = out > 0
	return (
		<div className={`group @container relative grid gap-3 overflow-hidden rounded-2xl bg-card/60 p-4 ring-1 ring-border/70 transition motion-safe:duration-200 hover:bg-card hover:shadow-sm hover:ring-border @3xl:grid-cols-[210px_1fr_170px] @3xl:items-center ${filled ? 'ring-border' : ''}`}>
			<span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[3px] opacity-0 transition-opacity motion-safe:duration-200 group-hover:opacity-100" style={{ background: filled ? tier.fill : `${tier.fill}80` }} />
			<div className="flex items-start gap-2.5">
				<span
					className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold tabular-nums ring-1 ring-inset"
					style={filled ? { background: `linear-gradient(135deg, ${tier.fill}, ${tier.fill}cc)`, color: 'white', boxShadow: `0 4px 10px -4px ${tier.fill}99` } : { background: `${tier.fill}14`, color: tier.ink, boxShadow: 'none' }}
				>
					{n}
				</span>
				<div className="min-w-0"><b className="text-[13.5px] leading-7">{t}</b><div className="text-[11.5px] leading-5 text-muted-foreground">{h}</div></div>
			</div>
			<div className="min-w-0">{children}</div>
			<div className="flex items-center @3xl:justify-end">
				<span
					className={`rounded-xl px-3 py-2 text-[14px] tabular-nums ring-1 ring-inset transition-colors ${filled ? '' : 'bg-muted/60 ring-border/60'}`}
					style={filled ? { background: `${tier.fill}14`, color: tier.ink, boxShadow: `inset 0 0 0 1px ${tier.fill}2e` } : undefined}
				>
					{filled ? <b>{sep(out)}</b> : <span className="text-muted-foreground">—</span>}
				</span>
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
	const mode = useTheme().mode
	return (
		<SpotlightCard theme={mode} spotlightColor="#910D6A" className="@container" aria-labelledby="fc-pyr-h">
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
		</SpotlightCard>
	)
}

/** برچسبِ درخواست‌های تحلیلیِ /api/ai (همان modeهای قبلی) */
const AI_MODE: Record<string, string> = { analysis: 'تحلیلِ هوشمندِ پیش‌بینی', strategy: 'پیشنهادِ استراتژی', risk: 'هشدارِ ریسک', brand: 'پیشنهادِ برند و اورنس (روش ۴)', margin: 'پیشنهادِ حاشیهٔ سود (روش ۸)' }
