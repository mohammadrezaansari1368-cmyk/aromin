/** Raw API shapes (deployment/aromin_performance.py + server.performance_read) and the typed ViewModel the UI consumes. */
export type ApiStatus = 'valid' | 'partial' | 'no_data' | 'not_applicable' | 'error'
export type Status = 'valid' | 'partial' | 'not_computable' | 'irrelevant' | 'error'
/** Server call stats (WP-3, aromin_calls.daily_records): confirmed julio/ext mapping only; queue calls never credited to a person. */
export type CallKey = 'calls_in' | 'calls_out' | 'calls_internal' | 'calls_answered' | 'calls_missed' | 'talk_seconds'
export type ApiCalls = Record<CallKey, number> & { effort_talk_seconds?: number; peakHourShare?: number | null }
export type DailyKey = 'tasks' | 'contracts' | 'finance_documents' | 'tickets' | 'support_activity' | CallKey

export type AchievementPart = { actual: number | null; target: number | null; pct: number | null }
export type MetricParts = { tickets?: number; callsIn?: number; callsOut?: number; activity?: AchievementPart; count?: AchievementPart; amount?: AchievementPart; weights?: Record<string,number> }
export interface TargetCoverage { attendanceDays?: number; calendarDays?: number; targetStatus?: 'valid' | 'partial'; targetIssues?: { personId: string; metric: string; reason: string }[] }
export interface ApiMetric extends TargetCoverage {
	id: string; label: string; unit: string; definition: string
	parts?: MetricParts; answerRate?: number | null; basis?: string; pct?: number | null; workingDays?: number
	value: number | null; numerator: number | null; denominator: number | null
	status: ApiStatus; target: number | null
	coverage: { records: number; issues: number }; source: string[]; detailsMetric: string; updatedAt?: number
}
export interface ApiPerson { id: string; name: string; level?: string; role: string; unit: string; inactive: boolean; tasks?: number | null; calls?: ApiCalls | null; metrics?: ApiMetric[]; issues?: { personId?: string; reason: string }[] }
export interface ApiSummary { people: ApiPerson[]; groups: { unit: string; people: number; metrics: ApiMetric[]; calls?: ApiCalls | null }[]; issues: { personId: string; reason: string }[]; notes: string[]; updatedAt?: number }
export interface ApiDirectory { people: ApiPerson[]; role: string; scope: string; updatedAt?: number }
export interface ApiDaily { days: { date: string; value: number; status: string }[]; metric: string; unit: string; updatedAt?: number }
export interface DetailRow { id: string; date: string; personId: string; metric: string; value: number; unit: string; source: string; note: string; fiscalYear?: string }

export interface Metric extends TargetCoverage {
	id: string; label: string; unit: string; definition: string
	parts?: MetricParts; answerRate?: number | null; basis?: string; pct?: number | null; workingDays?: number
	value: number | null; numerator: number | null; denominator: number | null
	status: Status; target: number | null; records: number; issues: number
	source: string[]; detailsMetric: string; dailyMetric: DailyKey | null; updatedAt?: number
}
export interface PersonVM { id: string; name: string; level?: string; initial: string; role: string; unit: string; unitLabel: string; inactive: boolean; tasks: number | null; calls: ApiCalls | null; metrics: Metric[] }
export interface DayVM { date: string; value: number }
export interface IssueGroup { reason: string; count: number }
