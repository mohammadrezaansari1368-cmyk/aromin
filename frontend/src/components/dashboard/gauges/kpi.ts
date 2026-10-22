/**
 * لایهٔ دادهٔ کاشی‌های گیج (بستهٔ طراحیِ «Gauge Cluster»).
 * UI فقط از `useGaugeReadings` می‌خواند؛ منبعِ داده پشتِ رابطِ `GaugeSource` است.
 * فعلاً منبع = `mockGaugeSource` (فقط نمایشِ UI، در gaugeMock.ts). برای اتصالِ واقعی:
 * یک GaugeSource تازه (API/DB/موتور) بسازید و در `activeSource` جایگزین کنید — بدونِ هیچ تغییری در UI.
 */
import { useEffect, useSyncExternalStore } from 'react'

export type GaugeId = 'tach' | 'speed' | 'fuel' | 'temp' | 'power'

/** مشخصاتِ صفحهٔ هر گیج (از README طراحی) */
export interface GaugeSpec {
	id: GaugeId
	label: string
	/** برچسبِ کوتاهِ لاتین برای ردیفِ کد (مثلِ tach · 0–8) */
	code: string
	unit: string
	/** متنِ روی صفحه */
	faceUnit: string
	max: number
	step: number
	/** تعدادِ خط‌های فرعی بینِ دو عدد */
	minor: number
	/** ناحیهٔ قرمز از این کسر به بالا */
	redFrom?: number
	/** ناحیهٔ قرمز تا این کسر (پایین) */
	redTo?: number
	decimals: number
	/** مسیرِ آیکونِ خطی (viewBox 24) */
	icon: string
}

export type GaugeStatus = 'ok' | 'warn' | 'err' | 'idle'
/** یک خوانش؛ همان شکلی که منبعِ واقعی باید برگرداند ({gaugeId, value, maxValue}) */
export interface GaugeReading {
	value: number
	max?: number
	/** تغییر نسبت به خوانشِ قبلی (٪)؛ null = نامعلوم */
	trend: number | null
	updatedAt: number | null
}
export interface GaugeSnapshot {
	readings: Record<GaugeId, GaugeReading>
	/** «mock» تا وقتی منبعِ واقعی وصل نشده */
	mode: 'mock' | 'live' | 'offline'
	simulating: boolean
	/** شمارندهٔ «تست سوییپ» — گیج‌ها با تغییرش یک دور کامل می‌زنند */
	sweep: number
	lastUpdate: number | null
	/** 3.9.68: business label/scale per gauge (overrides GAUGE_SPECS) and gauges whose source has no data */
	specs?: Partial<Record<GaugeId, GaugeSpec>>
	empty?: Partial<Record<GaugeId, boolean>>
	/** منبع و تاریخِ آخرین دادهٔ هر منبع (برای کاشیِ «فیدِ زنده») */
	feeds?: { label: string; at: string | null }[]
}
/** رابطِ منبعِ داده — هر پیاده‌سازیِ واقعی همین را برآورده می‌کند */
export interface GaugeSource {
	subscribe(cb: () => void): () => void
	get(): GaugeSnapshot
	/** اختیاری: فقط برای منابعی که شبیه‌سازی/آزمون دارند */
	setSimulating?(on: boolean): void
	sweepTest?(): void
	start?(): () => void
}

export const GAUGE_SPECS: Record<GaugeId, GaugeSpec> = {
	tach: { id: 'tach', label: 'دورسنج', code: 'tach · 0–8', unit: '× ۱۰۰۰ دور', faceUnit: 'دور × ۱۰۰۰', max: 8, step: 1, minor: 5, redFrom: 0.875, decimals: 1, icon: 'M12 14l4-4|M3.3 19a10 10 0 1 1 17.4 0' },
	speed: { id: 'speed', label: 'سرعت‌سنج', code: 'speed · 0–280', unit: 'کیلومتر/ساعت', faceUnit: 'km/h', max: 280, step: 20, minor: 2, decimals: 0, icon: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' },
	fuel: { id: 'fuel', label: 'سوخت', code: 'fuel · 0–150', unit: 'لیتر', faceUnit: 'سوخت', max: 150, step: 30, minor: 3, redTo: 0.1, decimals: 0, icon: 'M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18|M3 10h12|M15 13h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-3-3' },
	temp: { id: 'temp', label: 'دما', code: 'temp · 0–100', unit: '°C', faceUnit: '°C', max: 100, step: 20, minor: 4, redFrom: 0.8, decimals: 0, icon: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z' },
	power: { id: 'power', label: 'توان', code: 'power · 0–1000', unit: 'اسب‌بخار', faceUnit: 'PS', max: 1000, step: 100, minor: 2, decimals: 0, icon: 'M18.36 6.64a9 9 0 1 1-12.73 0|M12 2v10' },
}
export const GAUGE_ORDER: GaugeId[] = ['tach', 'speed', 'fuel', 'temp', 'power']

/** وضعیت از روی ناحیهٔ قرمز: داخلِ آن = err، ۵٪ مانده به آن = warn */
export function gaugeStatus(spec: GaugeSpec, r: GaugeReading | undefined): GaugeStatus {
	if (!r) return 'idle'
	const f = r.value / (r.max ?? spec.max)
	if ((spec.redFrom != null && f >= spec.redFrom) || (spec.redTo != null && f <= spec.redTo)) return 'err'
	if ((spec.redFrom != null && f >= spec.redFrom - 0.05) || (spec.redTo != null && f <= spec.redTo + 0.05)) return 'warn'
	return 'ok'
}

/** 3.9.68: the live source — Board pushes real numbers here (setLiveGauges); until then every gauge is «داده‌ای نیست». */
const zero = (): GaugeReading => ({ value: 0, trend: null, updatedAt: null })
let liveSnap: GaugeSnapshot = {
	readings: { tach: zero(), speed: zero(), fuel: zero(), temp: zero(), power: zero() }, mode: 'offline', simulating: false, sweep: 0, lastUpdate: null,
	empty: { tach: true, speed: true, fuel: true, temp: true, power: true },
}
const liveSubs = new Set<() => void>()
export function setLiveGauges(p: Pick<GaugeSnapshot, 'readings' | 'specs' | 'empty' | 'feeds'>) {
	const same = JSON.stringify([p.readings, p.empty, p.feeds, Object.keys(p.specs || {}).map((k) => p.specs![k as GaugeId]!.max)]) ===
		JSON.stringify([liveSnap.readings, liveSnap.empty, liveSnap.feeds, Object.keys(liveSnap.specs || {}).map((k) => liveSnap.specs![k as GaugeId]!.max)])
	if (same) return
	liveSnap = { ...liveSnap, ...p, mode: 'live', lastUpdate: Date.now() }
	liveSubs.forEach((f) => f())
}
export const liveGaugeSource: GaugeSource = {
	subscribe(cb) { liveSubs.add(cb); return () => { liveSubs.delete(cb) } },
	get: () => liveSnap,
	sweepTest() { liveSnap = { ...liveSnap, sweep: liveSnap.sweep + 1 }; liveSubs.forEach((f) => f()) },
}
/** ← نقطهٔ اتصال: منبعِ واقعی */
const activeSource: GaugeSource = liveGaugeSource

export function useGaugeReadings() {
	useEffect(() => activeSource.start?.(), [])
	const snap = useSyncExternalStore(activeSource.subscribe, activeSource.get)
	return { ...snap, setSimulating: activeSource.setSimulating, sweepTest: activeSource.sweepTest }
}
