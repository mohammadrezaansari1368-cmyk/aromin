/** 270° instrument gauge: chrono (big, brushed ring), reserve (minimal white-on-black), mini. Needle uses transform only. */
import { useEffect, useId, useRef, useState } from 'react'
import type { Status } from '../data/types'
import { fa } from '../data/adapters'
import { angle, arc, PARK, polar, ratio, START, SWEEP } from '../lib/gaugeMath'
import { statusVisual } from '../lib/statusVisual'
import { reducedMotion, TactileButton } from '../ui/primitives'

export interface PerfGaugeProps {
	variant: 'chrono' | 'reserve' | 'mini'
	value: number | null; max: number; target?: number | null
	status: Status; coverage?: { records: number }
	label: string; unitLabel: string; invert?: boolean
	active?: boolean; onSelect?: () => void; reason?: string; onConnect?: () => void
	format?: (n: number) => string
}
const SWEPT_KEY = 'pv-gauge-swept'

export default function PerfGauge(p: PerfGaugeProps) {
	const v = statusVisual(p.status), uid = useId().replace(/:/g, '')
	const r = v.needle === 'value' ? ratio(p.value, p.max) : null
	const target = angle(r), [deg, setDeg] = useState(target), first = useRef(true)
	useEffect(() => {
		// startup sweep 0 → max → value, once per session; later changes spring from the previous value
		if (first.current) {
			first.current = false
			let swept = true; try { swept = !!sessionStorage.getItem(SWEPT_KEY) } catch { /* */ }
			if (!swept && !reducedMotion() && r !== null) {
				try { sessionStorage.setItem(SWEPT_KEY, '1') } catch { /* */ }
				setDeg(START); const a = setTimeout(() => setDeg(START + SWEEP), 40), b = setTimeout(() => setDeg(target), 520)
				return () => { clearTimeout(a); clearTimeout(b) }
			}
		}
		setDeg(target)
	}, [target, r])
	if (v.hidden) return null
	const size = p.variant === 'mini' ? 120 : 200, c = size / 2, rad = c - (p.variant === 'mini' ? 12 : 18)
	const ticks = p.variant === 'mini' ? 6 : 10
	const tgtDeg = p.target != null && p.target > 0 && p.status !== 'not_computable' ? angle(ratio(p.target, p.max)) : null
	const fmt = p.format || ((n: number) => fa(n))
	const center = v.center === 'dash' ? '—' : v.center === 'bang' ? '!' : p.value === null ? '—' : fmt(p.value) + (v.center === 'value*' ? '٭' : '')
	const valueText = p.status === 'not_computable' ? `${p.label}: قابل محاسبه نیست` : p.status === 'error' ? `${p.label}: خطا` : `${p.label}: ${center} ${p.unitLabel}${p.status === 'partial' ? ' (ناقص، ' + fa(p.coverage?.records ?? 0, 0) + ' رکورد)' : ''}`
	return <div className={`pv-gauge pv-g-${p.variant}`} data-status={p.status} data-active={!!p.active}>
		<button type="button" className="pv-gauge-face" onClick={p.onSelect} disabled={!p.onSelect} role="meter" aria-valuemin={0} aria-valuemax={p.max} aria-valuenow={p.value ?? undefined} aria-valuetext={valueText} aria-label={valueText} aria-pressed={p.onSelect ? !!p.active : undefined}>
			<svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
				<defs>
					<linearGradient id={'ring' + uid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4f4f6" /><stop offset=".45" stopColor="#8b8d94" /><stop offset=".55" stopColor="#d9dadf" /><stop offset="1" stopColor="#5d5f66" /></linearGradient>
					<pattern id={'hatch' + uid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="5" fill="currentColor" /></pattern>
				</defs>
				{p.variant === 'chrono' && <circle cx={c} cy={c} r={c - 3} fill="none" stroke={`url(#ring${uid})`} strokeWidth="5" />}
				<path d={arc(c, c, rad, START, START + SWEEP)} className="pv-g-track" />
				{v.arc !== 'off' && r !== null && r > 0 && <path d={arc(c, c, rad, START, START + r * SWEEP)} className="pv-g-fill" stroke={v.arc === 'hatched' ? `url(#hatch${uid})` : undefined} />}
				{v.arc === 'error' && <path d={arc(c, c, rad, START, START + SWEEP)} className="pv-g-err" />}
				{tgtDeg !== null && <path d={arc(c, c, rad, tgtDeg, START + SWEEP)} className="pv-g-zone" />}
				{Array.from({ length: ticks + 1 }, (_, i) => { const d = START + (i / ticks) * SWEEP, [x0, y0] = polar(c, c, rad - 7, d), [x1, y1] = polar(c, c, rad + (i % 5 === 0 ? 0 : -3), d); return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className="pv-g-tick" /> })}
				<g className="pv-g-needle" style={{ transform: `rotate(${v.needle === 'parked' ? PARK : deg}deg)`, transformOrigin: `${c}px ${c}px` }}>
					<line x1={c} y1={c + 10} x2={c} y2={c - rad + 6} />
				</g>
				<circle cx={c} cy={c} r={p.variant === 'mini' ? 4 : 6} className="pv-g-hub" />
			</svg>
			<span className="pv-g-center"><b>{center}</b><small>{p.unitLabel}</small></span>
			<span className="pv-g-label">{p.label}</span>
		</button>
		{p.status === 'partial' && <span className="pv-g-badge">ناقص · {fa(p.coverage?.records ?? 0, 0)} رکورد</span>}
		{p.status !== 'not_computable' && p.status !== 'error' && tgtDeg === null && p.variant !== 'mini' && <span className="pv-g-badge pv-muted">بدون هدف</span>}
		{p.status === 'not_computable' && <span className="pv-g-off" title={p.reason || 'منبع لازم وارد نشده'}>
			<span aria-hidden>🔌</span>{p.onConnect && p.variant !== 'mini' && <TactileButton onClick={p.onConnect}>اتصال منبع</TactileButton>}
		</span>}
		{p.status === 'error' && <span className="pv-g-badge pv-err" title={p.reason}>خطا</span>}
	</div>
}
