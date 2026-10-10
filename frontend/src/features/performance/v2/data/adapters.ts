/** Raw API → ViewModel. The UI never reads raw responses. Missing/invalid fields become null/«—», never 0. */
import type { ApiDaily, ApiMetric, ApiPerson, ApiStatus, DailyKey, DayVM, IssueGroup, Metric, PersonVM, Status } from './types'

export const UNIT_LABEL: Record<string, string> = { sales: 'فروش', support: 'پشتیبانی', finance: 'مالی', other: 'سایر' }
const STATUS_MAP: Record<ApiStatus, Status> = { valid: 'valid', partial: 'partial', no_data: 'not_computable', not_applicable: 'irrelevant', error: 'error' }
/** metric id → the /daily metric that can draw its trend (only these exist in the API) */
const DAILY_OF: Record<string, DailyKey> = { contract_average: 'contracts', finance_documents: 'finance_documents', tasks: 'tasks' }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export const toStatus = (s: unknown): Status => (typeof s === 'string' && s in STATUS_MAP ? STATUS_MAP[s as ApiStatus] : 'not_computable')

export function toMetric(raw: Partial<ApiMetric> | null | undefined): Metric {
	const r = raw || {}
	const status = toStatus(r.status)
	const computable = status === 'valid' || status === 'partial'
	return {
		id: String(r.id || ''), label: String(r.label || '—'), unit: String(r.unit || ''), definition: String(r.definition || ''),
		value: computable ? num(r.value) : null, numerator: computable ? num(r.numerator) : null, denominator: computable ? num(r.denominator) : null,
		status: computable && num(r.value) === null ? 'not_computable' : status,
		target: num(r.target), records: num(r.coverage?.records) ?? 0, issues: num(r.coverage?.issues) ?? 0,
		source: Array.isArray(r.source) ? r.source.map(String) : [], detailsMetric: String(r.detailsMetric || r.id || ''),
		dailyMetric: DAILY_OF[String(r.id)] || null, updatedAt: num(r.updatedAt) ?? undefined,
	}
}
/** Tasks are a person field, not an axis metric; expose them as a selectable pseudo-metric. */
export function tasksMetric(tasks: number | null | undefined): Metric {
	return toMetric({ id: 'tasks', label: 'وظایف', unit: 'وظیفه', definition: 'وظایف ثبت‌شده در منبع وظایف برای همین دوره.', value: num(tasks), numerator: num(tasks), denominator: null, status: num(tasks) === null ? 'no_data' : 'valid', target: null, coverage: { records: num(tasks) === null ? 0 : 1, issues: 0 }, source: [], detailsMetric: 'tasks' })
}
export function toPerson(raw: Partial<ApiPerson> | null | undefined): PersonVM {
	const r = raw || {}, name = String(r.name || '—'), unit = String(r.unit || 'other')
	return { id: String(r.id ?? ''), name, initial: name.trim().charAt(0) || '؟', role: String(r.role || ''), unit, unitLabel: UNIT_LABEL[unit] || UNIT_LABEL.other, inactive: !!r.inactive, tasks: num(r.tasks), metrics: Array.isArray(r.metrics) ? r.metrics.map(toMetric) : [] }
}
export const toPeople = (raw: unknown): PersonVM[] => (Array.isArray(raw) ? raw.map((p) => toPerson(p as ApiPerson)).filter((p) => p.id) : [])
export function toDays(raw: Partial<ApiDaily> | null | undefined): DayVM[] {
	const days = Array.isArray(raw?.days) ? raw.days : []
	return days.filter((d) => d && /^\d{4}\/\d{2}\/\d{2}$/.test(String(d.date)) && num(d.value) !== null).map((d) => ({ date: d.date, value: d.value }))
}
/** Same reason → one line with a count («۱۲ قرارداد بدون …»). */
export function groupIssues(raw: unknown): IssueGroup[] {
	const counts = new Map<string, number>()
	for (const i of Array.isArray(raw) ? raw : []) { const k = String((i as { reason?: string })?.reason || '').trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1) }
	return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}
/** Gauge scale is decided here, not in the gauge: target×1.25 when a real target exists, else the team maximum. */
export function gaugeMax(m: Metric, peers: (number | null)[]): number {
	if (m.unit === '٪') return 100
	if (m.target !== null && m.target > 0) return m.target * 1.25
	const best = Math.max(0, ...peers.filter((v): v is number => v !== null), m.value ?? 0)
	return best > 0 ? best : 1
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
export const persian = (s: string) => String(s).replace(/\d/g, (d) => FA_DIGITS[+d])
export const fa = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: digits }))
export const faMoney = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n >= 1e9 ? fa(n / 1e9, 1) + ' میلیارد' : n >= 1e6 ? fa(n / 1e6, 1) + ' میلیون' : fa(n, 0))
export function ago(ts: number | undefined, now = Date.now()): string {
	if (!ts) return '—'
	const d = Math.floor((now - ts) / 86400000)
	return d <= 0 ? 'امروز' : d === 1 ? 'دیروز' : fa(d, 0) + ' روز پیش'
}
