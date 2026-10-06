'use client'

/**
 * Gauge3D — آمپرِ دیجیتالِ سه‌بعدی به سبکِ کلاسترِ لامبورگینی.
 * صفحهٔ تیره با شیبِ سه‌بعدی (perspective)، قوسِ LEDِ قطعه‌قطعه که با عقربه روشن می‌شود
 * (بنفش ← طلایی، ناحیهٔ قرمز در انتها)، عقربهٔ تیغه‌ایِ درخشان، نمایشگرِ دیجیتال و «سوییپِ استارت».
 * عقربه از مختصاتِ محاسبه‌شده رسم می‌شود (نه transform) تا مرکزِ دوران هرگز جابه‌جا نشود.
 */

import { memo, useEffect, useId, useRef, useState } from 'react'
import { animate } from 'motion/react'

export interface Gauge3DProps {
	/** مقدار بین 0 و max. */
	value: number
	/** بیشینهٔ مقیاس (پیش‌فرض 100). */
	max?: number
	/** برچسبِ زیرِ عدد. */
	label?: string
	/** واحد کنارِ عدد (مثلاً «٪»). */
	unit?: string
	/** رنگِ ابتدا/انتهای LEDها. */
	from?: string
	to?: string
	/** بیشینهٔ عرض (px). */
	size?: number
}

const START = 150
const SWEEP = 240
const SEG = 44
const RED = 0.88 // از این نسبت به بعد: ناحیهٔ قرمز

const toFa = (s: string | number) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
function polar(cx: number, cy: number, r: number, deg: number) {
	const a = (deg * Math.PI) / 180
	return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}
function hex(c: string) {
	const h = c.replace('#', '')
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function mix(a: string, b: string, t: number) {
	const A = hex(a), B = hex(b)
	return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

export const Gauge3D = memo(function Gauge3D({ value, max = 100, label, unit = '٪', from = '#910D6A', to = '#FCBF00', size = 230 }: Gauge3DProps) {
	const uid = useId().replace(/:/g, '')
	const cx = 110, cy = 104, R = 84
	const target = Math.max(0, Math.min(1, (value || 0) / (max || 1)))
	const [p, setP] = useState(0)
	const pRef = useRef(0)
	const first = useRef(true)

	useEffect(() => {
		const set = (v: number) => { pRef.current = v; setP(v) }
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { set(target); return }
		let stop = () => {}
		if (first.current) {
			// سوییپِ استارت: تا انتها و برگشت روی مقدار
			first.current = false
			const a1 = animate(0, 1, {
				duration: 0.7, ease: [0.3, 0, 0.2, 1], onUpdate: set,
				onComplete: () => { const a2 = animate(1, target, { type: 'spring', stiffness: 60, damping: 12, onUpdate: set }); stop = () => a2.stop() },
			})
			stop = () => a1.stop()
		} else {
			const a = animate(pRef.current, target, { type: 'spring', stiffness: 70, damping: 13, onUpdate: set })
			stop = () => a.stop()
		}
		return () => stop()
	}, [target])

	const pc = Math.max(0, Math.min(1, p))
	const ang = START + SWEEP * pc
	const shown = Math.round(p * (max || 1))
	const segs = Array.from({ length: SEG }, (_, i) => {
		const t = i / (SEG - 1)
		const a = START + SWEEP * t
		const o = polar(cx, cy, R, a), n = polar(cx, cy, R - (i % 4 === 0 ? 15 : 11), a)
		const lit = pc > 0 && t <= pc + 1e-6
		const col = t >= RED ? '#ff2d55' : mix(from, to, t / RED)
		return { o, n, lit, col, t }
	})
	const labels = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, pt: polar(cx, cy, R - 27, START + SWEEP * t) }))
	const tip = polar(cx, cy, R - 4, ang), tail = polar(cx, cy, 14, ang + 180)
	const w1 = polar(cx, cy, 6, ang - 90), w2 = polar(cx, cy, 6, ang + 90)
	const hot = pc >= RED

	return (
		<div className="relative mx-auto w-full" style={{ maxWidth: size, perspective: 700 }}>
			<div style={{ transform: 'rotateX(16deg)', transformOrigin: '50% 60%', filter: 'drop-shadow(0 14px 18px rgba(40,6,32,.35))' }}>
				<svg viewBox="0 0 220 176" className="w-full" role="img" aria-label={`${label ?? 'گیج'}: ${Math.round(value || 0)} ${unit}`}>
					<defs>
						<radialGradient id={`${uid}f`} cx="50%" cy="42%" r="62%">
							<stop offset="0%" stopColor="#2a1426" />
							<stop offset="70%" stopColor="#120910" />
							<stop offset="100%" stopColor="#060407" />
						</radialGradient>
						<linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#5b5560" />
							<stop offset="45%" stopColor="#1d1a20" />
							<stop offset="100%" stopColor="#3b353f" />
						</linearGradient>
						<linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#fff" stopOpacity=".22" />
							<stop offset="100%" stopColor="#fff" stopOpacity="0" />
						</linearGradient>
						<linearGradient id={`${uid}n`} gradientUnits="userSpaceOnUse" x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y}>
							<stop offset="0%" stopColor="#fff6cf" />
							<stop offset="100%" stopColor={hot ? '#ff2d55' : to} />
						</linearGradient>
						<filter id={`${uid}glow`} x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="2.2" result="b" />
							<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
						</filter>
					</defs>

					{/* بِزِلِ فلزی + صفحهٔ تیرهٔ زاویه‌دار */}
					<path d="M110 4 L196 36 L214 110 L176 170 L44 170 L6 110 L24 36 Z" fill={`url(#${uid}b)`} />
					<path d="M110 10 L191 40 L207 109 L172 164 L48 164 L13 109 L29 40 Z" fill={`url(#${uid}f)`} stroke={from} strokeOpacity=".6" strokeWidth="1.2" />
					<circle cx={cx} cy={cy} r={R + 5} fill="none" stroke={from} strokeOpacity=".25" strokeWidth="1" />

					{/* LEDها */}
					{segs.map((s, i) => (
						<line key={i} x1={s.n.x} y1={s.n.y} x2={s.o.x} y2={s.o.y} stroke={s.lit ? s.col : s.t >= RED ? '#3a1520' : '#2c2130'}
							strokeWidth={i % 4 === 0 ? 3.4 : 2.6} filter={s.lit ? `url(#${uid}glow)` : undefined} />
					))}

					{/* اعدادِ مقیاس */}
					{labels.map((l) => (
						<text key={l.t} x={l.pt.x} y={l.pt.y + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#a99aa6">{toFa(Math.round(l.t * (max || 1)))}</text>
					))}

					{/* نمایشگرِ دیجیتال */}
					<rect x={cx - 38} y={cy + 14} width="76" height="30" rx="5" fill="#000" fillOpacity=".55" stroke={from} strokeOpacity=".6" />
					<text x={cx} y={cy + 36} textAnchor="middle" fontSize="22" fontWeight="900" fill={hot ? '#ff4d6d' : '#fff3c4'} filter={`url(#${uid}glow)`} style={{ fontVariantNumeric: 'tabular-nums' }}>
						{toFa(shown)}<tspan fontSize="11" fontWeight="700" fill="#cdb7c6" dx="2">{unit}</tspan>
					</text>

					{/* عقربهٔ تیغه‌ای */}
					<g filter={`url(#${uid}glow)`}>
						<polygon points={`${tip.x},${tip.y} ${w1.x},${w1.y} ${tail.x},${tail.y} ${w2.x},${w2.y}`} fill={`url(#${uid}n)`} opacity=".95" />
						<line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#fff" strokeWidth="1" strokeOpacity=".9" />
					</g>
					<circle cx={cx} cy={cy} r="9" fill="#141015" stroke={from} strokeWidth="2" />
					<circle cx={cx} cy={cy} r="3" fill={hot ? '#ff2d55' : to} />

					{/* شیشه */}
					<path d="M29 40 L110 10 L191 40 L180 62 Q110 30 40 62 Z" fill={`url(#${uid}g)`} />
				</svg>
			</div>
			{label && <p className="mt-1 text-center text-[12px] tracking-[0.08em] text-muted-foreground">{label}</p>}
		</div>
	)
})

export default Gauge3D
