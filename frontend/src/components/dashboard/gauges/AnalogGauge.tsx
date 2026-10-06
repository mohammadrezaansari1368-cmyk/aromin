'use client'

/**
 * گیجِ آنالوگِ لوکس (از بستهٔ طراحیِ «Gauge Cluster») — بازسازیِ SVG به‌جای یک WebGLRenderer برای هر گیج.
 * هندسه طبقِ README: جاروبِ ۲۷۰°، خط‌های اصلی/فرعی، قوسِ قرمز، عقربهٔ کشیده با سایه، کلاهک، شیشه و درخشش.
 * همهٔ رنگ‌ها ارجاعِ مستقیم به توکن‌ها (hsl(var(--…))): صفحه/متن/عقربه/توپی = --gauge-* (از سه رنگِ برندِ همان تم، index.css)،
 * ناحیهٔ قرمز = error، قاب و سایه = توکن‌های خنثی. پس با ۳ تم × روشن/تیره خودکار عوض می‌شود.
 * حرکت: فنرِ کم‌میرا (حسِ elastic طراحی)، «تست سوییپ» ۰ ← max ← مقدار؛ با prefers-reduced-motion بی‌حرکت.
 */

import { memo, useEffect, useId, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import type { GaugeSpec } from './kpi'

const C = 100, R = 80
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const pt = (f: number, r: number) => { const a = ((135 + f * 270) * Math.PI) / 180; return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const }
const arc = (f0: number, f1: number, r: number) => { const [x0, y0] = pt(f0, r), [x1, y1] = pt(f1, r); return `M${x0},${y0} A${r},${r} 0 ${(f1 - f0) * 270 > 180 ? 1 : 0} 1 ${x1},${y1}` }
const inRed = (s: GaugeSpec, f: number) => (s.redFrom != null && f >= s.redFrom - 1e-9) || (s.redTo != null && f <= s.redTo + 1e-9)
/** عقربهٔ رو به بالا (واحدِ طراحی × R) */
const NEEDLE = [[-0.03, -0.24], [0.03, -0.24], [0.011, 0.86], [0, 0.9], [-0.011, 0.86]].map(([x, y]) => `${C + x * R},${C - y * R}`).join(' ')

export interface AnalogGaugeProps {
	spec: GaugeSpec
	value: number
	max?: number
	/** هر بار که عوض شود یک دورِ کامل (سوییپ) می‌زند */
	sweep?: number
	/** تأخیرِ سوییپ برای پلکانی شدنِ چند گیج (ثانیه) */
	delay?: number
	/** مقدارِ متحرکِ لحظه‌ای برای نمایشگرِ عددی */
	onFrame?: (v: number) => void
	/** کج‌شدنِ ملایم با اشاره‌گر */
	tilt?: boolean
	className?: string
}

export const AnalogGauge = memo(function AnalogGauge({ spec, value, max: maxIn, sweep = 0, delay = 0, onFrame, tilt = true, className = '' }: AnalogGaugeProps) {
	const uid = useId().replace(/:/g, '')
	const max = maxIn ?? spec.max
	const reduce = useReducedMotion()
	const [v, setV] = useState(reduce ? value : 0)
	const cur = useRef(reduce ? value : 0)
	const frame = useRef(onFrame)
	frame.current = onFrame
	const first = useRef(true)
	const lastSweep = useRef(sweep)

	useEffect(() => {
		const set = (x: number) => { cur.current = x; setV(x); frame.current?.(x) }
		if (reduce) { set(value); return }
		let stopped = false
		const controls: { stop(): void }[] = []
		const to = (target: number, o: Parameters<typeof animate>[2]) => new Promise<void>((res) => {
			if (stopped) return res()
			controls.push(animate(cur.current, target, { ...o, onUpdate: set, onComplete: () => res() } as never))
		})
		const doSweep = first.current || sweep !== lastSweep.current
		first.current = false
		lastSweep.current = sweep
		;(async () => {
			if (doSweep) {
				await to(0, { duration: 0.25, ease: 'easeOut', delay })
				await to(max, { duration: 0.95, ease: 'easeInOut' })
			}
			await to(value, { type: 'spring', stiffness: 70, damping: 7, mass: 1 })
		})()
		return () => { stopped = true; controls.forEach((c) => c.stop()) }
	}, [value, max, sweep, delay, reduce])

	const f = Math.max(-0.02, Math.min(1.02, v / max))
	const labels = Math.round(max / spec.step)
	const fs = labels + 1 <= 6 ? 17 : labels + 1 <= 9 ? 15.5 : labels + 1 <= 12 ? 12 : 10
	const ticks: { f: number; major: boolean }[] = []
	for (let i = 0; i <= labels * spec.minor; i++) ticks.push({ f: i / (labels * spec.minor), major: i % spec.minor === 0 })

	// کج‌شدن با اشاره‌گر (±۶°)
	const [t, setT] = useState<[number, number]>([0, 0])
	const move = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!tilt || reduce || e.pointerType !== 'mouse') return
		const b = e.currentTarget.getBoundingClientRect()
		setT([((e.clientY - b.top) / b.height - 0.5) * -12, ((e.clientX - b.left) / b.width - 0.5) * 12])
	}
	const tok = (name: string, a?: number) => `hsl(var(--${name})${a != null ? ' / ' + a : ''})`

	return (
		<div className={`relative aspect-square w-full [perspective:700px] ${className}`} onPointerMove={move} onPointerLeave={() => setT([0, 0])}>
			<svg viewBox="0 0 200 200" className="size-full overflow-visible transition-transform duration-300 ease-out motion-reduce:transition-none"
				style={{ transform: `rotateX(${t[0]}deg) rotateY(${t[1]}deg)`, filter: `drop-shadow(0 6px 10px ${tok('shadow', 0.35)})` }}
				role="img" aria-label={`${spec.label}: ${fa(Math.max(0, Math.min(value, max)), spec.decimals)} از ${fa(max)} ${spec.unit}`}>
				<defs>
					<radialGradient id={`dial-${uid}`} cx="50%" cy="42%" r="62%">
						<stop offset="0" style={{ stopColor: tok('gauge-dial'), stopOpacity: 0.82 }} />
						<stop offset="0.6" style={{ stopColor: tok('gauge-dial') }} />
						<stop offset="1" style={{ stopColor: tok('gauge-dial') }} />
					</radialGradient>
					<radialGradient id={`vig-${uid}`} cx="50%" cy="50%" r="50%">
						<stop offset="0.84" style={{ stopColor: tok('shadow'), stopOpacity: 0 }} />
						<stop offset="1" style={{ stopColor: tok('shadow'), stopOpacity: 0.55 }} />
					</radialGradient>
					<linearGradient id={`chrome-${uid}`} x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" style={{ stopColor: tok('card') }} />
						<stop offset="0.28" style={{ stopColor: tok('muted-foreground') }} />
						<stop offset="0.5" style={{ stopColor: tok('card') }} />
						<stop offset="0.72" style={{ stopColor: tok('border') }} />
						<stop offset="1" style={{ stopColor: tok('muted-foreground') }} />
					</linearGradient>
					<linearGradient id={`glare-${uid}`} x1="0.15" y1="0" x2="0.7" y2="0.8">
						<stop offset="0" style={{ stopColor: tok('gauge-ink'), stopOpacity: 0.18 }} />
						<stop offset="0.45" style={{ stopColor: tok('gauge-ink'), stopOpacity: 0.04 }} />
						<stop offset="0.46" style={{ stopColor: tok('gauge-ink'), stopOpacity: 0 }} />
					</linearGradient>
				</defs>
				{/* قاب و بدنه */}
				<circle cx={C} cy={C} r={99} fill={tok('foreground', 0.85)} />
				<circle cx={C} cy={C} r={97.5} fill={`url(#chrome-${uid})`} />
				<circle cx={C} cy={C} r={88} fill="none" stroke={tok('gauge-ink', 0.35)} strokeWidth="0.6" />
				<circle cx={C} cy={C} r={R + 1.2} fill={tok('shadow', 0.6)} />
				{/* صفحه */}
				<circle cx={C} cy={C} r={R} fill={`url(#dial-${uid})`} />
				<circle cx={C} cy={C} r={R} fill={`url(#vig-${uid})`} />
				<circle cx={C} cy={C} r={R * 0.5} fill={tok('shadow', 0.12)} stroke={tok('gauge-ink', 0.14)} strokeWidth="0.5" />
				{/* ناحیهٔ قرمز */}
				{spec.redFrom != null && <path d={arc(spec.redFrom, 1, R * 0.955)} fill="none" stroke={tok('error')} strokeWidth="2.4" style={{ filter: `drop-shadow(0 0 1.5px ${tok('error')})` }} />}
				{spec.redTo != null && <path d={arc(0, spec.redTo, R * 0.955)} fill="none" stroke={tok('error')} strokeWidth="2.4" style={{ filter: `drop-shadow(0 0 1.5px ${tok('error')})` }} />}
				{/* خط‌ها */}
				{ticks.map(({ f: tf, major }, i) => {
					const [x0, y0] = pt(tf, R * 0.925), [x1, y1] = pt(tf, R * (major ? 0.825 : 0.88))
					return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={inRed(spec, tf) ? tok('error') : tok('gauge-ink')} strokeWidth={major ? 1.6 : 0.7} strokeLinecap="round" />
				})}
				{/* اعداد */}
				{Array.from({ length: labels + 1 }, (_, k) => {
					const lf = k / labels, [x, y] = pt(lf, R * (labels + 1 > 12 ? 0.73 : 0.69))
					return <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight="600" style={{ fill: tok('gauge-ink') }}>{fa(k * spec.step)}</text>
				})}
				<text x={C} y={C + R * 0.74} textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="1" style={{ fill: tok('gauge-ink', 0.85) }}>{spec.faceUnit}</text>
				{/* عقربه */}
				<g style={{ transform: `rotate(${270 * f - 135}deg)`, transformOrigin: `${C}px ${C}px` }}>
					<polygon points={NEEDLE} transform="translate(3.2 4.4)" fill={tok('shadow', 0.35)} />
					<polygon points={NEEDLE} fill={tok('gauge-needle')} stroke={tok('gauge-ink', 0.35)} strokeWidth="0.4" />
				</g>
				{/* توپی */}
				<circle cx={C} cy={C} r={R * 0.145} fill={tok('gauge-hub')} stroke={tok('gauge-ink', 0.5)} strokeWidth="0.6" />
				<circle cx={C} cy={C} r={R * 0.118} fill={`url(#chrome-${uid})`} />
				{/* شیشه */}
				<circle cx={C} cy={C} r={R * 1.02} fill={`url(#glare-${uid})`} pointerEvents="none" />
			</svg>
		</div>
	)
})
export default AnalogGauge
