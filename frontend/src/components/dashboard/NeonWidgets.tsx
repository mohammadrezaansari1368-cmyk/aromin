'use client'

/**
 * کیتِ ویجت‌های نئونی (از بستهٔ طراحیِ «Cyberpunk Business Dashboard Widgets») — بازسازیِ بومی با SVG، بدونِ ECharts/CDN.
 * رنگ‌ها = سه رنگِ برندِ آرومین از توکن‌های تم (primary/secondary/accent)، پس با ۳ تم × روشن/تیره هماهنگ است.
 * درخشش در حالتِ تیره پررنگ و در روشن ملایم است؛ حرکت با prefers-reduced-motion خاموش می‌شود.
 * داده فعلاً «نمونهٔ طراحی» است و برچسب می‌خورد تا اتصال به دادهٔ واقعی مشخص شود.
 */

import { useId, useMemo, type ReactNode } from 'react'
import { tokenHex, useTheme } from '@/lib/theme'

export interface NeonData {
	revenue: number; cashReserve: number; marketShare: number; profit: number; margin: number
	salesVolume: number[]; radar: Record<string, number>
}
/** همان مقادیرِ نمونهٔ فایلِ طراحی — تا وقتی منبعِ داده تعیین شود */
export const NEON_SAMPLE: NeonData = {
	revenue: 85, cashReserve: 60, marketShare: 70, profit: 4200000, margin: 28,
	salesVolume: [10, 20, 15, 30, 25, 40],
	radar: { 'سهم بازار': 70, 'نفوذ': 58, 'حفظ مشتری': 76, 'دامنهٔ برند': 64, 'تبدیل': 49, 'رشد': 67 },
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
export function useNeonColors() {
	const th = useTheme()
	return useMemo(() => ({
		a: tokenHex('primary'), b: tokenHex('secondary'), c: tokenHex('accent'),
		// رنگِ متن: در روشن نسخهٔ «ink» (کنتراستِ AA روی کارت)، در تیره خودِ رنگِ نئون
		ta: tokenHex(th.mode === 'dark' ? 'primary' : 'primary-ink'), tb: tokenHex(th.mode === 'dark' ? 'secondary' : 'secondary-ink'),
		fg: tokenHex('foreground'), muted: tokenHex('muted-foreground'), border: tokenHex('border'), dark: th.mode === 'dark',
	}), [th])
}
type NC = ReturnType<typeof useNeonColors>
const glow = (c: string, k: NC, s = 1) => `drop-shadow(0 0 ${(k.dark ? 6 : 2.5) * s}px ${c})`

/** قابِ مشترک: عنوان با فاصلهٔ حرفیِ نئونی + نشانِ «نمونه» */
export function NeonShell({ title, meta, children, sample = true }: { title: string; meta?: ReactNode; children: ReactNode; sample?: boolean }) {
	return (
		<section dir="rtl" className="neon-tile @container relative flex h-full flex-col gap-3 overflow-hidden p-4 sm:p-5">
			<span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(120%_80%_at_50%_0%,hsl(var(--primary)/.12),transparent_60%)]" />
			<header className="relative flex flex-wrap items-center justify-between gap-2">
				<h3 className="truncate text-[12px] font-bold tracking-[0.12em] text-primary-ink">{title}</h3>
				<div className="flex items-center gap-2">
					{meta}
					{sample && <span title="دادهٔ نمونهٔ طراحی — در انتظارِ اتصال به دادهٔ واقعی" aria-label="دادهٔ نمونه، در انتظارِ اتصال به دادهٔ واقعی" className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-ink ring-1 ring-accent/40">نمونه</span>}
				</div>
			</header>
			<div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
		</section>
	)
}
const NeonNum = ({ children, className = '', color }: { children: ReactNode; className?: string; color?: string }) => (
	<span className={`font-extrabold tabular-nums leading-none ${className}`} style={{ color, textShadow: color ? `0 0 14px ${color}66` : undefined }}>{children}</span>
)

/* ---------- ۵) نوارِ سرعت‌سنجِ قطعه‌قطعه (۰ تا ۱۰۰ ← ۰ تا ۱۲) ---------- */
export function NeonSpeed({ value, k }: { value: number; k: NC }) {
	const N = 48, filled = Math.round((value / 100) * N), reading = (value / 100) * 12
	const arc = (t: number) => -(1 - Math.pow(2 * t - 1, 2)) * 14
	const segColor = (t: number) => (t < 0.5 ? mix(k.b, k.a, t * 2) : mix(k.a, k.c, (t - 0.5) * 2))
	return (
		<NeonShell title="تحقق تارگت درآمد" meta={<span className="text-[11px] text-muted-foreground"><NeonNum className="text-[26px]" color={k.ta}>{fa(reading, 1)}</NeonNum> / ۱۲ · {fa(value)}٪ تارگت</span>}>
			<div className="my-auto" dir="ltr" role="img" aria-label={`تحقق تارگت ${fa(value)} درصد`}>
				<div className="flex items-end gap-[3px] pt-4" style={{ height: 52 }}>
					{Array.from({ length: N }, (_, i) => {
						const t = i / (N - 1), on = i < filled, lead = i === filled - 1, c = segColor(t)
						return <span key={i} className="min-w-0 flex-1 rounded-[2px] transition-[background,box-shadow] duration-500 motion-reduce:transition-none"
							style={{ height: 32, transform: `translateY(${arc(t)}px) skewX(-8deg)`, background: on ? c : 'hsl(var(--muted))', border: `1px solid ${on ? c : 'hsl(var(--border))'}`, boxShadow: on ? `0 0 ${(lead ? 16 : 7) * (k.dark ? 1 : 0.5)}px ${c}` : 'none', opacity: on ? 1 : 0.7 }} />
					})}
				</div>
				<div className="mt-2 flex justify-between">
					{Array.from({ length: 13 }, (_, n) => <span key={n} className="w-5 text-center text-[13px] font-bold tabular-nums @[480px]:text-[16px]" style={{ transform: `translateY(${arc(n / 12)}px)`, color: n <= reading ? k.fg : k.muted, opacity: n <= reading ? 1 : 0.5 }}>{fa(n)}</span>)}
				</div>
			</div>
		</NeonShell>
	)
}

/* ---------- ۱) سه حلقهٔ هم‌مرکز: درآمد / ذخیرهٔ نقد / سهم بازار ---------- */
export function NeonRings({ d, k }: { d: NeonData; k: NC }) {
	const rings: [string, number, string, number][] = [['درآمد', d.revenue, k.a, 44], ['ذخیرهٔ نقد', d.cashReserve, k.b, 35], ['سهم بازار', d.marketShare, k.c, 26]]
	return (
		<NeonShell title="درآمد و نقدینگی">
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<svg viewBox="0 0 100 100" className="h-full max-h-[170px] w-auto" role="img" aria-label={rings.map((r) => `${r[0]} ${fa(r[1])}٪`).join('، ')}>
					<circle cx="50" cy="50" r="49" fill="none" stroke={k.a} strokeOpacity=".3" strokeWidth=".4" />
					{Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2, r1 = i % 4 ? 47.5 : 46.5; return <line key={i} x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1} x2={50 + Math.cos(a) * 49} y2={50 + Math.sin(a) * 49} stroke={k.a} strokeOpacity={i % 4 ? 0.3 : 0.7} strokeWidth=".5" /> })}
					{rings.map(([n, v, c, r]) => {
						const L = 2 * Math.PI * r
						return (
							<g key={n} transform="rotate(-90 50 50)">
								<circle cx="50" cy="50" r={r} fill="none" stroke={c} strokeOpacity=".12" strokeWidth="5" />
								<circle cx="50" cy="50" r={r} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(L * v) / 100} ${L}`} style={{ filter: glow(c, k), transition: 'stroke-dasharray .7s' }} className="motion-reduce:transition-none" />
							</g>
						)
					})}
					<text x="50" y="54" textAnchor="middle" fontSize="11" fontWeight="800" fill={k.fg} style={{ filter: glow(k.a, k, 0.6) }}>{fa(d.revenue)}٪</text>
				</svg>
			</div>
			<dl className="grid grid-cols-3 gap-1 text-[9px] @[220px]:text-[10.5px]">
				{rings.map(([n, v, c]) => <div key={n} className="flex flex-col items-center"><dt className="flex items-center gap-1 text-muted-foreground"><span className="size-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />{n}</dt><dd className="text-[12px] font-extrabold tabular-nums @[220px]:text-[14px]">{fa(v)}٪</dd></div>)}
			</dl>
		</NeonShell>
	)
}

/* ---------- ۴) کارتِ سود / حاشیه ---------- */
export function NeonKpi({ d, k }: { d: NeonData; k: NC }) {
	const money = d.profit >= 1e6 ? fa(d.profit / 1e6, 1) + 'M' : d.profit >= 1e3 ? fa(Math.round(d.profit / 1e3)) + 'K' : fa(d.profit)
	return (
		<NeonShell title="سود / جریان نقدی">
			<div className="flex flex-1 items-center justify-center gap-3 @[260px]:gap-5">
				<div className="flex flex-col items-center gap-1.5"><NeonNum className="text-[26px] @[200px]:text-[36px] @[260px]:text-[48px]" color={k.ta}><bdi>{money}</bdi></NeonNum><span className="text-[11px] tracking-[0.2em] text-muted-foreground">سود</span></div>
				<span aria-hidden className="h-16 w-px" style={{ background: `linear-gradient(transparent, ${k.b}, transparent)`, boxShadow: `0 0 8px ${k.b}` }} />
				<div className="flex flex-col items-center gap-1.5"><NeonNum className="text-[19px] @[200px]:text-[26px] @[260px]:text-[34px]" color={k.tb}>{fa(d.margin)}٪</NeonNum><span className="text-[11px] tracking-[0.2em] text-muted-foreground">حاشیه</span></div>
			</div>
			<span aria-hidden className="h-[3px] rounded" style={{ background: `linear-gradient(90deg, transparent, ${k.b} 20%, ${k.a} 50%, ${k.c} 80%, transparent)`, boxShadow: `0 0 10px ${k.a}` }} />
		</NeonShell>
	)
}

/* ---------- ۲) رادار ---------- */
export function NeonRadar({ d, k }: { d: NeonData; k: NC }) {
	const axes = Object.keys(d.radar), n = axes.length, R = 34
	const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [50 + Math.cos(a) * R * v, 50 + Math.sin(a) * R * v] }
	const poly = axes.map((a, i) => pt(i, (d.radar[a] || 0) / 100).join(',')).join(' ')
	return (
		<NeonShell title="سهم بازار و نفوذ" meta={<NeonNum className="text-[16px]" color={k.ta}>{fa(d.marketShare)}٪</NeonNum>}>
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<svg viewBox="0 0 100 100" className="h-full max-h-[200px] w-auto overflow-visible" role="img" aria-label={axes.map((a) => `${a} ${fa(d.radar[a])}`).join('، ')}>
					{[0.25, 0.5, 0.75, 1].map((s) => <circle key={s} cx="50" cy="50" r={R * s} fill="none" stroke={k.a} strokeOpacity=".2" strokeWidth=".4" />)}
					{axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1="50" y1="50" x2={x} y2={y} stroke={k.a} strokeOpacity=".2" strokeWidth=".4" /> })}
					<polygon points={poly} fill={k.a} fillOpacity=".22" stroke={k.a} strokeWidth="1.2" strokeLinejoin="round" style={{ filter: glow(k.a, k), transition: 'all .7s' }} />
					{axes.map((a, i) => { const [x, y] = pt(i, (d.radar[a] || 0) / 100); return <circle key={a} cx={x} cy={y} r="1.5" fill={k.c} style={{ filter: glow(k.c, k, 0.6) }} /> })}
					{axes.map((a, i) => { const [x, y] = pt(i, 1.3); return <text key={a} x={x} y={y + 1.5} textAnchor="middle" fontSize="5.5" fill={k.muted}>{a}</text> })}
				</svg>
			</div>
		</NeonShell>
	)
}

/* ---------- ۳) موجِ فعالیتِ فروش ---------- */
export function NeonWave({ d, k }: { d: NeonData; k: NC }) {
	const gid = useId().replace(/:/g, '')
	const v = d.salesVolume, W = 300, H = 90
	const max = Math.max(1, ...v), last = v[v.length - 1] ?? 0, delta = last - (v[v.length - 2] ?? last)
	const pts = v.map((y, i) => [v.length > 1 ? (i / (v.length - 1)) * W : W / 2, H - (y / max) * (H - 10) - 4])
	// منحنیِ نرم (کاتمول‌رام ← بزیه)
	const path = pts.map((p, i) => {
		if (!i) return `M${p[0]},${p[1]}`
		const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || p
		return `C${p1[0] + (p[0] - p0[0]) / 6},${p1[1] + (p[1] - p0[1]) / 6} ${p[0] - (p3[0] - p1[0]) / 6},${p[1] - (p3[1] - p1[1]) / 6} ${p[0]},${p[1]}`
	}).join(' ')
	return (
		<NeonShell title="فعالیت فروش و حجم تماس" meta={<span className="flex items-baseline gap-2"><NeonNum className="text-[22px]" color={k.ta}>{fa(last)}</NeonNum><span className={`text-[11px] font-bold ${delta >= 0 ? 'text-success' : 'text-error'}`}>{delta >= 0 ? '▲' : '▼'} {fa(Math.abs(delta))} نسبت به قبل</span></span>}>
			<svg viewBox={`0 0 ${W} ${H + 14}`} preserveAspectRatio="none" className="mt-auto h-full max-h-[170px] w-full" direction="ltr" role="img" aria-label={'حجم فعالیت: ' + v.map((x) => fa(x)).join('، ')}>
				<defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={k.a} stopOpacity=".45" /><stop offset="1" stopColor={k.a} stopOpacity="0" /></linearGradient></defs>
				{[0.33, 0.66].map((s) => <line key={s} x1="0" x2={W} y1={H * s} y2={H * s} stroke={k.border} strokeDasharray="3 4" strokeWidth=".6" />)}
				<path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} />
				<path d={path} fill="none" stroke={k.a} strokeWidth="2.2" vectorEffect="non-scaling-stroke" style={{ filter: glow(k.a, k) }} />
				<line x1="0" x2={W} y1={H} y2={H} stroke={k.b} strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: glow(k.b, k, 0.8) }} />
				{v.map((_, i) => <text key={i} x={pts[i][0]} y={H + 12} textAnchor={i === 0 ? 'start' : i === v.length - 1 ? 'end' : 'middle'} fontSize="8" fill={k.muted}>{i === v.length - 1 ? 'اکنون' : fa(v.length - 1 - i) + '−'}</text>)}
			</svg>
		</NeonShell>
	)
}

function mix(a: string, b: string, t: number) {
	const h = (c: string) => [0, 2, 4].map((i) => parseInt(c.replace('#', '').slice(i, i + 2), 16))
	const A = h(a), B = h(b)
	return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',')})`
}
