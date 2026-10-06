'use client'

/**
 * کاشی‌های KPI از بستهٔ «Gauge Cluster»: پنج گیجِ مستقل + فیدِ زنده + کلاسترِ پنج‌تایی.
 * هر کاشی فقط `useGaugeReadings()` را می‌خواند؛ اتصال به دادهٔ واقعی = عوض کردنِ منبع در kpi.ts (نه این فایل).
 * ساختارِ مشترکِ هر کاشی: آیکون · عنوان · کد · وضعیت · روند · نشانگر (گیج) · عددِ اصلی + واحد.
 */

import { useState, type ReactNode } from 'react'
import AnalogGauge from './AnalogGauge'
import { GAUGE_ORDER, GAUGE_SPECS, gaugeStatus, useGaugeReadings, type GaugeId, type GaugeStatus } from './kpi'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const DOT: Record<GaugeStatus, string> = { ok: 'bg-success', warn: 'bg-warning', err: 'bg-error', idle: 'bg-muted-foreground/60' }
const STATUS_FA: Record<GaugeStatus, string> = { ok: 'در محدوده', warn: 'نزدیکِ مرز', err: 'ناحیهٔ قرمز', idle: 'بدون داده' }
const Icon = ({ d, className = 'size-4' }: { d: string; className?: string }) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
)

/** قابِ مشترکِ کاشی‌های گیج — سبک، دقیق، بدونِ شلوغی */
function GaugeShell({ icon, title, code, status, meta, children, mock }: { icon: string; title: string; code?: string; status?: GaugeStatus; meta?: ReactNode; children: ReactNode; mock?: boolean }) {
	return (
		<section dir="rtl" className="@container relative flex h-full flex-col gap-2 overflow-hidden p-4 sm:p-5">
			<span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-l from-transparent via-primary/50 to-transparent" />
			<header className="flex items-center gap-2">
				<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary/12 text-secondary-ink ring-1 ring-secondary/25"><Icon d={icon} className="size-[15px]" /></span>
				<div className="min-w-0 flex-1">
					<h3 className="truncate text-[12.5px] font-extrabold tracking-[0.06em] text-foreground">{title}</h3>
					{code && <p className="hidden truncate font-mono text-[10px] text-muted-foreground @[200px]:block" dir="ltr">{code}</p>}
				</div>
				{meta}
				{status && <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground" title={STATUS_FA[status]}><span className={`size-1.5 rounded-full ${DOT[status]} ${status === 'err' ? 'shadow-[0_0_8px_hsl(var(--error))]' : ''}`} /><span className="hidden @[220px]:inline">{STATUS_FA[status]}</span></span>}
				{mock && <span title="دادهٔ نمونه — در انتظارِ اتصال به منبعِ واقعی" aria-label="دادهٔ نمونه" className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-bold text-accent-ink ring-1 ring-accent/35">نمونه</span>}
			</header>
			{children}
		</section>
	)
}
function Trend({ v }: { v: number | null }) {
	if (v == null || !isFinite(v)) return null
	const up = v >= 0
	return <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ring-1 ${up ? 'bg-success/10 text-success ring-success/25' : 'bg-error/10 text-error ring-error/25'}`}><span aria-hidden>{up ? '▲' : '▼'}</span>{fa(Math.abs(v), 1)}٪<span className="sr-only">{up ? 'افزایش' : 'کاهش'}</span></span>
}

/** یک گیجِ مستقل */
export function GaugeTile({ id, hero = false }: { id: GaugeId; hero?: boolean }) {
	const s = GAUGE_SPECS[id]
	const { readings, sweep, mode } = useGaugeReadings()
	const r = readings[id]
	const [live, setLive] = useState<number | null>(null)
	const shown = Math.max(0, Math.min(live ?? r.value, r.max ?? s.max))
	return (
		<GaugeShell icon={s.icon} title={s.label} code={s.code} status={gaugeStatus(s, r)} mock={mode === 'mock'}>
			{/* گیج = کوچک‌ترِ عرض و ارتفاعِ فضای موجود (container size) — در کاشیِ بلند و کوتاه هر دو جا می‌شود */}
			<div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
				<div className={`aspect-square w-[min(100cqw,100cqh)] ${hero ? 'max-w-[440px]' : 'max-w-[220px]'}`}>
					<AnalogGauge spec={s} value={r.value} max={r.max} sweep={sweep} delay={GAUGE_ORDER.indexOf(id) * 0.12} onFrame={setLive} />
				</div>
			</div>
			<footer className="flex items-baseline justify-center gap-2">
				<span className={`font-extrabold tabular-nums leading-none text-foreground ${hero ? 'text-[34px] @[320px]:text-[40px]' : 'text-[24px] @[240px]:text-[28px]'}`}>{fa(shown, s.decimals)}</span>
				<span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground">{s.unit}</span>
				<Trend v={r.trend} />
			</footer>
		</GaugeShell>
	)
}

/** فیدِ زنده: منبع، آخرین به‌روزرسانی، تست سوییپ و شبیه‌سازی (فقط منبعِ نمونه) */
export function LiveFeedTile() {
	const { mode, simulating, lastUpdate, setSimulating, sweepTest } = useGaugeReadings()
	const state = mode === 'live' ? { dot: 'bg-success', t: 'زنده' } : simulating ? { dot: 'bg-success', t: 'شبیه‌سازی' } : mode === 'offline' ? { dot: 'bg-error', t: 'قطع' } : { dot: 'bg-muted-foreground/60', t: 'متوقف' }
	return (
		<GaugeShell icon="M4.9 19.1a10 10 0 0 1 0-14.2|M19.1 4.9a10 10 0 0 1 0 14.2|M7.8 16.2a6 6 0 0 1 0-8.4|M16.2 7.8a6 6 0 0 1 0 8.4|M12 12h.01" title="فیدِ زنده" code="gauges · source" mock={mode === 'mock'}
			meta={<span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold" title={state.t}><span className={`size-2 rounded-full ${state.dot} ${state.dot === 'bg-success' ? 'shadow-[0_0_8px_hsl(var(--success))]' : ''}`} /><span className="hidden @[240px]:inline">{state.t}</span></span>}>
			<dl className="mt-1 flex flex-col gap-1.5 text-[11px] @[240px]:gap-2 @[240px]:text-[11.5px]">
				<div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">منبعِ داده</dt><dd className="text-left font-bold">{mode === 'mock' ? <>نمونهٔ طراحی<span className="hidden @[300px]:inline"> (در انتظارِ اتصال)</span></> : mode === 'live' ? 'منبعِ زنده' : 'در دسترس نیست'}</dd></div>
				<div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">آخرین به‌روزرسانی</dt><dd className="font-mono tabular-nums" dir="ltr">{lastUpdate ? new Date(lastUpdate).toLocaleTimeString('fa-IR', { hour12: false }) : '—'}</dd></div>
				<div className="hidden items-center justify-between gap-2 @[240px]:flex"><dt className="text-muted-foreground">گیج‌ها</dt><dd className="font-bold">{fa(GAUGE_ORDER.length)}</dd></div>
			</dl>
			<div className="mt-auto flex flex-col gap-1.5 pt-1 @[240px]:flex-row @[240px]:gap-2 @[240px]:pt-2">
				<button type="button" onClick={() => sweepTest?.()} disabled={!sweepTest}
					className="min-h-8 flex-1 rounded-xl bg-primary @[240px]:min-h-9 px-2 text-[11.5px] @[240px]:text-[12px] font-bold text-primary-foreground shadow-[0_6px_16px_-8px_hsl(var(--primary)/.6)] transition hover:bg-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-50">تست سوییپ</button>
				<button type="button" onClick={() => setSimulating?.(!simulating)} disabled={!setSimulating} aria-pressed={simulating}
					className="min-h-8 flex-1 rounded-xl bg-card @[240px]:min-h-9 px-2 text-[11.5px] @[240px]:text-[12px] font-bold text-foreground ring-1 ring-border transition hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-50">{simulating ? 'توقفِ شبیه‌سازی' : 'شبیه‌سازی'}</button>
			</div>
		</GaugeShell>
	)
}

/** کلاسترِ پنج‌گیجی در یک بدنهٔ فلزی (چیدمانِ «Gauge Cluster») */
const MOUNTS: { id: GaugeId; x: number; y: number; w: number; z: number }[] = [
	{ id: 'fuel', x: 19.3, y: 25, w: 19.5, z: 1 },
	{ id: 'temp', x: 80.2, y: 24, w: 19.5, z: 1 },
	{ id: 'power', x: 15.2, y: 65, w: 35.5, z: 2 },
	{ id: 'speed', x: 84.8, y: 65, w: 35.5, z: 2 },
	{ id: 'tach', x: 50, y: 39, w: 49.5, z: 3 },
]
export function ClusterTile() {
	const { readings, sweep, mode } = useGaugeReadings()
	return (
		<GaugeShell icon="M3 12h3l3-8 4 16 3-8h5" title="کلاسترِ عملکرد" code="cluster · 5 gauges" mock={mode === 'mock'}>
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<div className="relative aspect-[1010/600] h-full max-h-full max-w-full" dir="ltr">
					{/* بدنهٔ فلزیِ برس‌خورده از توکن‌های خنثی */}
					<div aria-hidden className="absolute inset-[9%_3%_4%_3%] [border-radius:32%_32%_16%_16%/44%_44%_22%_22%] bg-gradient-to-b from-muted via-border to-muted-foreground/60 shadow-[inset_0_1px_0_hsl(var(--card)),0_14px_30px_-12px_hsl(var(--shadow)/.45)]"
						style={{ backgroundImage: 'repeating-linear-gradient(0deg, hsl(var(--card) / .12) 0 1px, transparent 1px 3px), linear-gradient(180deg, hsl(var(--muted)), hsl(var(--border)) 45%, hsl(var(--muted-foreground) / .55))' }} />
					<div aria-hidden className="absolute bottom-[1%] left-[22%] right-[22%] h-[12%] rounded-b-[40%] bg-gradient-to-b from-border to-muted-foreground/50" />
					{MOUNTS.map((m, i) => {
						const r = readings[m.id]
						return (
							<div key={m.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: m.x + '%', top: m.y + '%', width: m.w + '%', zIndex: m.z }}>
								<AnalogGauge spec={GAUGE_SPECS[m.id]} value={r.value} max={r.max} sweep={sweep} delay={i * 0.12} tilt={false} />
							</div>
						)
					})}
				</div>
			</div>
		</GaugeShell>
	)
}
