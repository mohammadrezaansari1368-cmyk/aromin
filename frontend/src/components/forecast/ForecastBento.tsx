/**
 * 3.9.68: «نمای سال در یک نگاه» — بالای تبِ «پیش‌بینی و بودجه»، چیدمانِ بنتو (برگرفته از طرحِ Web3 Bento، بومی‌سازی‌شده:
 * فارسی، راست‌به‌چپ، توکن‌های تمِ آرومین، بدونِ محتوای رمزارز). هیچ محاسبهٔ تازه‌ای ندارد: همهٔ اعداد از خروجیِ موتورِ پیش‌بینی
 * (compute در lib/forecast.ts) و همان معاملاتِ صفحه می‌آیند. حرکت با prefers-reduced-motion خاموش می‌شود.
 */
import { lazy, Suspense, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { MONTHS } from '@/engines/commission'

const VioletSwirl = lazy(() => import('./VioletSwirl'))

export interface ForecastBentoProps {
	year: number
	/** فروشِ هدفِ سال (تومان) */
	target: number
	/** هدفِ محافظه‌کارانه پس از حاشیهٔ ایمنی (تومان) */
	safeTarget: number
	/** پیش‌بینیِ ماهانه (۱۲ عدد، تومان) یا null وقتی هنوز ساخته نشده */
	forecast: number[] | null
	/** فروشِ واقعیِ هر ماه (۱۲ عدد، تومان؛ ۰ = هنوز داده ندارد) */
	actual: number[]
	channels: { name: string; value: number }[]
	settle: { cash: number; check: number; hold: number }
	/** ماهِ جاری (۰ تا ۱۱) */
	month: number
	readiness: number
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const faN = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
/** میلیون تومان، خوانا */
const mt = (v: number) => (Math.abs(v) >= 1e9 ? (v / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' میلیارد' : faN(Math.round(v / 1e6)) + ' میلیون')
const sum = (a: number[]) => a.reduce((s, x) => s + (x || 0), 0)

function useReduced() {
	const [r, setR] = useState(false)
	useEffect(() => {
		const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
		if (!mq) return
		const u = () => setR(mq.matches)
		u(); mq.addEventListener?.('change', u)
		return () => mq.removeEventListener?.('change', u)
	}, [])
	return r
}
function useMounted() {
	const [on, setOn] = useState(false)
	useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id) }, [])
	return on
}
function useCountUp(target: number, enabled: boolean, ms = 1200) {
	const [v, setV] = useState(enabled ? 0 : target)
	useEffect(() => {
		if (!enabled) { setV(target); return }
		let raf = 0
		const t0 = performance.now()
		const tick = (now: number) => { const p = Math.min(1, (now - t0) / ms); setV(target * (1 - Math.pow(1 - p, 4))); if (p < 1) raf = requestAnimationFrame(tick) }
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [target, enabled, ms])
	return v
}

/** کاشیِ پایه: قابِ شیشه‌ای (حاشیهٔ گرادیانی)، اسپات‌لایتِ دنبالِ ماوس، ورودِ نرم (با احترام به prefers-reduced-motion) */
function Tile({ title, action, className = '', children, testid, reduced = false, index = 0 }: { title?: ReactNode; action?: ReactNode; className?: string; children: ReactNode; testid?: string; reduced?: boolean; index?: number }) {
	const mounted = useMounted()
	const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)
	return (
		<div
			className={`relative rounded-[23px] bg-gradient-to-br from-border/85 via-border/25 to-transparent p-px shadow-card ${className}`}
			style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(14px)', transition: reduced ? 'none' : `opacity 640ms ${EASE} ${index * 70}ms, transform 640ms ${EASE} ${index * 70}ms` }}
		>
			<section data-testid={testid}
				onPointerMove={reduced ? undefined : (e) => { const r = e.currentTarget.getBoundingClientRect(); setSpot({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
				onPointerLeave={reduced ? undefined : () => setSpot(null)}
				className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] bg-card/95 p-5 text-card-foreground backdrop-blur-xl">
				<span aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ zIndex: -1, opacity: spot ? 1 : 0, background: spot ? `radial-gradient(280px circle at ${spot.x}% ${spot.y}%, hsl(var(--primary)/.16), transparent 70%)` : undefined }} />
				{(title || action) && (
					<header className="mb-3 flex items-center justify-between gap-3">
						{title && <h3 className="text-[12.5px] font-bold text-muted-foreground">{title}</h3>}
						{action}
					</header>
				)}
				{children}
			</section>
		</div>
	)
}
function Empty({ children, className = '' }: { children: ReactNode; className?: string }) {
	return (
		<div className={`m-auto flex flex-col items-center gap-2 rounded-2xl border border-dashed border-current/15 px-5 py-6 text-center text-[12.5px] text-muted-foreground ${className}`}>
			<span aria-hidden className="size-1.5 rounded-full bg-current/30" />
			{children}
		</div>
	)
}

/** کاشیِ اصلی: پیش‌بینیِ سال، فاصله تا هدف، نوارِ ماه‌به‌ماهِ واقعی در برابرِ پیش‌بینی */
function HeroTile({ p, reduced, index = 0 }: { p: ForecastBentoProps; reduced: boolean; index?: number }) {
	const mounted = useMounted()
	const fy = p.forecast ? sum(p.forecast) : 0
	const act = sum(p.actual)
	const shown = useCountUp(fy || p.target, !reduced)
	const gap = p.target > 0 ? act - p.target * ((p.month + 1) / 12) : 0     // جلو/عقب نسبت به سهمِ هدف تا امروز
	const [hover, setHover] = useState<number | null>(null)
	const max = Math.max(1, ...p.actual, ...(p.forecast || [0]))
	return (
		<Tile className="sm:col-span-2 lg:col-span-2" testid="fb-hero" reduced={reduced} index={index}>
			<Suspense fallback={null}><VioletSwirl /></Suspense>
			<div aria-hidden className="absolute inset-0 bg-gradient-to-b from-card/88 via-card/60 to-card/92" />
			<div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
				<div className="min-w-0">
					<p className="text-[24px] font-extrabold leading-tight sm:text-[30px]">سالِ <span className="text-primary-ink">{faN(p.year).replace(/٬/g, '')}</span> در یک نگاه</p>
					<p className="mt-1 text-[13px] text-muted-foreground">پیش‌بینی، فروشِ واقعی و فاصله تا هدف — از همین موتورِ پیش‌بینی.</p>
				</div>
				<div className="text-left">
					<p className="text-[11.5px] text-muted-foreground">{fy ? 'پیش‌بینیِ سال' : 'فروشِ هدف'}</p>
					<p className="text-[28px] font-extrabold tabular-nums leading-none sm:text-[34px]">{mt(shown)} <span className="text-[13px] font-bold text-muted-foreground">تومان</span></p>
					{p.target > 0 && <p className="mt-1.5 text-[12px] font-bold tabular-nums" style={{ color: gap >= 0 ? 'hsl(var(--success))' : 'hsl(var(--error))' }}>
						{gap >= 0 ? '▲ جلوتر از برنامه ' : '▼ عقب‌تر از برنامه '}{mt(Math.abs(gap))} تومان</p>}
				</div>
			</div>
			<div className="relative z-10 mt-5 flex flex-1 flex-col">
				<div className="flex flex-1 items-end gap-1.5" style={{ minHeight: 84 }} onPointerLeave={() => setHover(null)} dir="rtl">
					{MONTHS.map((name, i) => {
						const a = p.actual[i] || 0, f = p.forecast?.[i] || 0
						return (
							<button key={name} type="button" onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
								aria-label={`${name}: واقعی ${mt(a)}، پیش‌بینی ${mt(f)} تومان`}
								className="relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
								<span className="w-1/2 rounded-[4px] bg-secondary/35" style={{ height: mounted ? `${Math.max(4, (f / max) * 100)}%` : '4%', transition: reduced ? 'none' : `height 900ms ${EASE} ${i * 40}ms` }} />
								<span className="w-1/2 rounded-[4px]" style={{ height: mounted ? `${a ? Math.max(4, (a / max) * 100) : 0}%` : '0%', background: i === p.month ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
									opacity: hover === null || hover === i ? 1 : 0.35, transition: reduced ? 'none' : `height 900ms ${EASE} ${i * 40}ms, opacity 200ms ease` }} />
							</button>
						)
					})}
				</div>
				<div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
					<span>{MONTHS[0]}</span>
					<span className="font-bold text-foreground" aria-live="polite">{hover !== null ? `${MONTHS[hover]} · واقعی ${mt(p.actual[hover] || 0)} · پیش‌بینی ${mt(p.forecast?.[hover] || 0)}` : 'ماه‌به‌ماه: واقعی (پررنگ) در برابرِ پیش‌بینی'}</span>
					<span>{MONTHS[11]}</span>
				</div>
			</div>
		</Tile>
	)
}

/** تحققِ هدف: کاشیِ رنگیِ برجسته (همتای کاشیِ Staking) */
function TargetTile({ p, reduced, index = 0 }: { p: ForecastBentoProps; reduced: boolean; index?: number }) {
	const mounted = useMounted()
	const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)
	const act = sum(p.actual)
	const pct = p.target > 0 ? Math.min(999, (act / p.target) * 100) : null
	const next = p.forecast?.[(p.month + 1) % 12] || 0
	return (
		<div className="relative rounded-[23px] bg-gradient-to-br from-primary/70 via-primary/25 to-transparent p-px shadow-card lg:row-span-2"
			style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(14px)', transition: reduced ? 'none' : `opacity 640ms ${EASE} ${index * 70}ms, transform 640ms ${EASE} ${index * 70}ms` }}>
			<section data-testid="fb-target"
				onPointerMove={reduced ? undefined : (e) => { const r = e.currentTarget.getBoundingClientRect(); setSpot({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
				onPointerLeave={reduced ? undefined : () => setSpot(null)}
				className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] bg-primary p-5 text-primary-foreground">
				<span aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: -1, background: 'linear-gradient(135deg, hsl(0 0% 100% / .12), transparent 55%, hsl(0 0% 0% / .12))' }} />
				<span aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ zIndex: -1, opacity: spot ? 1 : 0, background: spot ? `radial-gradient(260px circle at ${spot.x}% ${spot.y}%, hsl(0 0% 100% / .18), transparent 70%)` : undefined }} />
				<header className="flex items-center justify-between"><h3 className="text-[12.5px] font-bold opacity-80">تحققِ هدفِ سال</h3>
					<span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[11px] font-bold">تا {MONTHS[p.month]}</span></header>
				{pct == null ? <Empty className="text-primary-foreground/70">فروشِ هدف وارد نشده</Empty> : <>
					<p className="mt-4 text-[48px] font-extrabold leading-none tabular-nums">{faN(pct, pct < 10 ? 1 : 0)}<span className="text-[20px]">٪</span></p>
					<p className="mt-1 text-[12px] opacity-80">{mt(act)} از {mt(p.target)} تومان</p>
					<div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-foreground/20" role="progressbar" aria-valuenow={Math.round(Math.min(100, pct))} aria-valuemin={0} aria-valuemax={100} aria-label="تحققِ هدف">
						<div className="h-full rounded-full bg-primary-foreground" style={{ width: `${Math.min(100, pct)}%` }} />
					</div>
				</>}
				<dl className="mt-5 space-y-2 text-[12.5px]">
					<div className="flex justify-between gap-2"><dt className="opacity-75">هدفِ محافظه‌کارانه</dt><dd className="font-bold tabular-nums">{p.safeTarget > 0 ? mt(p.safeTarget) : '—'}</dd></div>
					<div className="flex justify-between gap-2"><dt className="opacity-75">پیش‌بینیِ {MONTHS[(p.month + 1) % 12]}</dt><dd className="font-bold tabular-nums">{next ? mt(next) : '—'}</dd></div>
					<div className="flex justify-between gap-2"><dt className="opacity-75">آمادگیِ پیش‌بینی</dt><dd className="font-bold tabular-nums">{faN(Math.round(p.readiness))}٪</dd></div>
				</dl>
				<p className="mt-auto pt-5 text-[11.5px] leading-6 opacity-80">{pct == null ? '' : pct >= ((p.month + 1) / 12) * 100 ? 'طبقِ برنامه یا جلوتر — همین روند را نگه دارید.' : 'از سهمِ هدف تا امروز عقب‌تریم؛ قیف و معاملاتِ بیش از ۴۰ روز را ببینید.'}</p>
			</section>
		</div>
	)
}

/** خطِ روند: واقعی در برابرِ پیش‌بینی (همتای Portfolio vs ETH) */
function TrendTile({ p, reduced, index = 0 }: { p: ForecastBentoProps; reduced: boolean; index?: number }) {
	const uid = useId().replace(/:/g, '')
	const mounted = useMounted()
	const [hover, setHover] = useState<number | null>(null)
	const W = 640, H = 200
	const f = p.forecast || Array(12).fill(0)
	const hasAct = p.actual.some((v) => v > 0)
	const hi = Math.max(1, ...f, ...p.actual)
	const y = (v: number) => H - 14 - (v / hi) * (H - 34)
	const x = (i: number) => W - (i / 11) * W          // راست‌به‌چپ: فروردین در راست
	const path = (vals: number[], upto = 11) => vals.slice(0, upto + 1).map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
	const lastAct = p.actual.reduce((last, v, i) => (v > 0 ? i : last), -1)
	const idx = hover ?? Math.max(0, lastAct)
	if (!p.forecast && !hasAct) return <Tile title="روندِ سال" className="sm:col-span-2 lg:col-span-2" reduced={reduced} index={index}><Empty>هنوز پیش‌بینیِ ماهانه یا فروشِ واقعی ثبت نشده</Empty></Tile>
	return (
		<Tile title="روند: واقعی در برابرِ پیش‌بینی" className="sm:col-span-2 lg:col-span-2" testid="fb-trend" reduced={reduced} index={index}
			action={<span className="flex items-center gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-primary" />واقعی</span><span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-muted-foreground" />پیش‌بینی</span></span>}>
			<div className="flex flex-wrap items-end gap-x-8 gap-y-1">
				<div><p className="text-[11.5px] text-muted-foreground">{MONTHS[idx]} · واقعی</p><p className="text-[20px] font-extrabold tabular-nums">{mt(p.actual[idx] || 0)}</p></div>
				<div><p className="text-[11.5px] text-muted-foreground">پیش‌بینی</p><p className="text-[20px] font-extrabold tabular-nums text-muted-foreground">{mt(f[idx] || 0)}</p></div>
			</div>
			<div className="relative mt-3 flex-1 touch-pan-y" style={{ minHeight: 180 }} role="img" aria-label={`واقعی ${mt(sum(p.actual))} در برابرِ پیش‌بینی ${mt(sum(f))} تومان`}
				onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(11, Math.round(((r.right - e.clientX) / r.width) * 11)))) }}
				onPointerLeave={() => setHover(null)}>
				<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
					<defs><linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.28" /><stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" /></linearGradient></defs>
					{[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="hsl(var(--border))" strokeDasharray="1 5" vectorEffect="non-scaling-stroke" />)}
					{p.forecast && <path d={path(f)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />}
					{hasAct && <>
						<path d={`${path(p.actual, lastAct)} L ${x(lastAct)} ${H} L ${x(0)} ${H} Z`} fill={`url(#${uid}-g)`} style={{ opacity: mounted ? 1 : 0, transition: 'opacity 900ms ease 300ms' }} />
						<path d={path(p.actual, lastAct)} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1}
							style={{ strokeDasharray: 1, strokeDashoffset: mounted || reduced ? 0 : 1, transition: reduced ? 'none' : `stroke-dashoffset 1200ms ${EASE}` }} />
					</>}
				</svg>
				<span aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-border" style={{ left: `${(x(idx) / W) * 100}%`, opacity: hover !== null ? 1 : 0 }} />
			</div>
			<div className="mt-2 flex justify-between text-[11px] text-muted-foreground" aria-hidden>{[0, 3, 6, 9, 11].map((i) => <span key={i}>{MONTHS[i]}</span>)}</div>
		</Tile>
	)
}

/** نوارِ تقسیم‌شده (همتای Allocation) — برای کانال یا وضعیتِ تسویه */
function SplitTile({ title, parts, testid, reduced = false, index = 0 }: { title: string; parts: { name: string; value: number; color: string }[]; testid: string; reduced?: boolean; index?: number }) {
	const mounted = useMounted()
	const total = sum(parts.map((x) => x.value))
	const [hover, setHover] = useState<number | null>(null)
	return (
		<Tile title={title} testid={testid} reduced={reduced} index={index}>
			{total <= 0 ? <Empty>فروشِ بسته‌شده‌ای نیست</Empty> : <>
				<p className="text-[20px] font-extrabold tabular-nums">{mt(total)} <span className="text-[12px] font-bold text-muted-foreground">تومان</span></p>
				<div className="mt-3 flex h-8 gap-1" onPointerLeave={() => setHover(null)}>
					{parts.filter((x) => x.value > 0).map((x, i) => (
						<span key={x.name} onPointerEnter={() => setHover(i)} aria-hidden className="rounded-[7px]"
							style={{ flexBasis: mounted ? `${(x.value / total) * 100}%` : `${100 / parts.length}%`, background: x.color, opacity: hover === null || hover === i ? 1 : 0.3, transition: reduced ? 'opacity 200ms ease' : `flex-basis 1000ms ${EASE} ${200 + i * 60}ms, opacity 200ms ease` }} />
					))}
				</div>
				<ul className="mt-3 grid gap-1.5">
					{parts.map((x) => (
						<li key={x.name} className="flex items-center justify-between gap-2 text-[12.5px]">
							<span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: x.color }} aria-hidden />{x.name}</span>
							<span className="tabular-nums text-muted-foreground">{faN(total ? (x.value / total) * 100 : 0, 1)}٪ · {mt(x.value)}</span>
						</li>
					))}
				</ul>
			</>}
		</Tile>
	)
}

export default function ForecastBento(p: ForecastBentoProps) {
	const reduced = useReduced()
	const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))']
	const channels = useMemo(() => p.channels.map((c, i) => ({ ...c, color: COLORS[i % COLORS.length] })), [p.channels])   // eslint-disable-line react-hooks/exhaustive-deps
	return (
		<div dir="rtl" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="نمای سال در یک نگاه" data-testid="forecast-bento">
			<HeroTile p={p} reduced={reduced} index={0} />
			<TargetTile p={p} reduced={reduced} index={1} />
			<SplitTile title="سهمِ کانال‌ها" parts={channels} testid="fb-channels" reduced={reduced} index={2} />
			<TrendTile p={p} reduced={reduced} index={3} />
			<SplitTile title="وضعیتِ تسویهٔ فروش" testid="fb-settle" reduced={reduced} index={4}
				parts={[{ name: 'نقد', value: p.settle.cash, color: 'hsl(var(--success))' }, { name: 'چک', value: p.settle.check, color: 'hsl(var(--secondary))' }, { name: 'معلق تا وصول', value: p.settle.hold, color: 'hsl(var(--warning))' }]} />
		</div>
	)
}
