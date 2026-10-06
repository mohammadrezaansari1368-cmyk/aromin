/**
 * دادهٔ نمونه — فقط برای نمایشِ UI تا منبعِ هر کاشی مشخص شود. هیچ ارتباطی با دادهٔ واقعیِ اپ ندارد.
 * مقادیرِ اولیه و بازهٔ شبیه‌سازی همان فایلِ طراحی است (targets / RANGE).
 */
import type { GaugeId, GaugeReading, GaugeSnapshot, GaugeSource } from './kpi'

const START: Record<GaugeId, number> = { tach: 3.8, speed: 164, fuel: 112, temp: 72, power: 620 }
const RANGE: Record<GaugeId, [number, number]> = { tach: [0.9, 7.6], speed: [30, 265], fuel: [18, 145], temp: [52, 96], power: [150, 950] }
/** روندِ نمونه برای نمایشِ جهت (٪) */
const TREND: Record<GaugeId, number> = { tach: 4.2, speed: 6.8, fuel: -3.1, temp: 1.4, power: 9.5 }

let snap: GaugeSnapshot = {
	readings: Object.fromEntries((Object.keys(START) as GaugeId[]).map((id) => [id, { value: START[id], trend: TREND[id], updatedAt: null } satisfies GaugeReading])) as Record<GaugeId, GaugeReading>,
	mode: 'mock',
	simulating: false,
	sweep: 0,
	lastUpdate: null,
}
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
let timer = 0

function step() {
	const now = Date.now()
	const readings = { ...snap.readings }
	for (const id of Object.keys(RANGE) as GaugeId[]) {
		const [lo, hi] = RANGE[id], cur = readings[id].value
		const next = Math.min(hi, Math.max(lo, cur + (Math.random() - 0.5) * (hi - lo) * 0.18))
		readings[id] = { value: next, trend: cur ? ((next - cur) / cur) * 100 : null, updatedAt: now }
	}
	snap = { ...snap, readings, lastUpdate: now }
	emit()
}

export const mockGaugeSource: GaugeSource = {
	subscribe(cb) { subs.add(cb); return () => { subs.delete(cb) } },
	get: () => snap,
	setSimulating(on) {
		window.clearInterval(timer)
		if (on) timer = window.setInterval(step, 2800)
		snap = { ...snap, simulating: on }
		emit()
	},
	sweepTest() { snap = { ...snap, sweep: snap.sweep + 1 }; emit() },
	start() { return () => { if (!subs.size) { window.clearInterval(timer); snap = { ...snap, simulating: false } } } },
}
