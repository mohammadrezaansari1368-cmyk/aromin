/** 270° gauge geometry. Pure; covered by tests (null, max=0, invert, clamp). */
export const SWEEP = 270
export const START = -135
export const PARK = START - 14 // «engine off»: needle rests below zero

export function ratio(value: number | null, max: number): number | null {
	if (value === null || !Number.isFinite(value)) return null
	if (!(max > 0)) return 0
	return Math.min(1, Math.max(0, value / max))
}
export const angle = (r: number | null) => (r === null ? PARK : START + r * SWEEP)
/** 0 = bad, 1 = good; invert for «lower is better» metrics */
export const goodness = (r: number | null, invert = false) => (r === null ? null : invert ? 1 - r : r)

export function polar(cx: number, cy: number, rad: number, deg: number): [number, number] {
	const a = ((deg - 90) * Math.PI) / 180
	return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
}
export function arc(cx: number, cy: number, rad: number, from: number, to: number): string {
	const [x0, y0] = polar(cx, cy, rad, from), [x1, y1] = polar(cx, cy, rad, to)
	return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rad} ${rad} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
