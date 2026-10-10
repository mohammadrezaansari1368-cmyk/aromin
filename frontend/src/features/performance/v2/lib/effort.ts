/**
 * «ساعت تلاش مؤثر» — the classic engine's effortOf (deployment/legacy.html), ported 1:1:
 *   perDay = (talk minutes + Σ min(task minutes, cap)) ÷ 60 ÷ active days
 * zones: <4 کم‌کاری · 4–6 نرمال · 6–7.5 خوب · >7.5 خطر فرسودگی · days=0 → بدون داده.
 * Data connection only: talk = talkIn+talkOut (count importer) or, when those are absent, talkMin (call-log importer).
 */
export interface PerfFields {
	tasks?: number; callsIn?: number; callsOut?: number; callAns?: number
	talkIn?: number; talkOut?: number; talkMin?: number; taskMins?: number[]; effortMin?: number; activeDays?: number
}
export type EffortZone = 'none' | 'low' | 'normal' | 'good' | 'burnout'
export interface Effort { talkMin: number; taskMin: number; days: number; perDay: number | null; zone: EffortZone; calls: number; tasks: number }

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
export function effortOf(pf: PerfFields | null | undefined, capMin = 30): Effort {
	const p = pf || {}, cap = capMin > 0 ? capMin : 30
	const paired = n(p.talkIn) + n(p.talkOut)
	const talk = paired > 0 ? paired : n(p.talkMin)
	const task = Array.isArray(p.taskMins) && p.taskMins.length ? p.taskMins.reduce((s, m) => s + Math.min(n(m), cap), 0) : n(p.effortMin)
	const days = n(p.activeDays)
	const perDay = days > 0 ? (talk + task) / 60 / days : null
	const zone: EffortZone = perDay === null ? 'none' : perDay < 4 ? 'low' : perDay <= 6 ? 'normal' : perDay <= 7.5 ? 'good' : 'burnout'
	return { talkMin: talk, taskMin: task, days, perDay, zone, calls: n(p.callsIn) + n(p.callsOut), tasks: n(p.tasks) }
}
export const ZONE_LABEL: Record<EffortZone, string> = { none: 'بدون داده', low: 'کم‌کاری', normal: 'نرمال', good: 'خوب', burnout: 'خطر فرسودگی' }
/** % of a target; null when there is no positive target or no value */
export const achieve = (value: number | null, target: number | null | undefined) => (value === null || !target || target <= 0 ? null : (value / target) * 100)

/** Working days of a Jalali month for the tracker: not Friday, not a holiday code from the attendance engine. */
export function workingDays(dates: { date: string; weekday: number }[], holidays: Set<string>) {
	return dates.filter((d) => d.weekday !== 6 && !holidays.has(d.date)).length
}
/** Daily task target = monthly task target ÷ working days of that month (same monthly target as the bonus engine). */
export const dailyTarget = (monthlyTarget: number | null | undefined, workdays: number) => (!monthlyTarget || monthlyTarget <= 0 || workdays <= 0 ? null : monthlyTarget / workdays)
