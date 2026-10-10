/** Raw API shapes (deployment/aromin_performance.py + server.performance_read) and the typed ViewModel the UI consumes. */
export type ApiStatus = 'valid' | 'partial' | 'no_data' | 'not_applicable' | 'error'
export type Status = 'valid' | 'partial' | 'not_computable' | 'irrelevant' | 'error'
export type DailyKey = 'tasks' | 'contracts' | 'finance_documents'

export interface ApiMetric {
	id: string; label: string; unit: string; definition: string
	value: number | null; numerator: number | null; denominator: number | null
	status: ApiStatus; target: number | null
	coverage: { records: number; issues: number }; source: string[]; detailsMetric: string; updatedAt?: number
}
export interface ApiPerson { id: string; name: string; role: string; unit: string; inactive: boolean; tasks?: number | null; metrics?: ApiMetric[]; issues?: { personId?: string; reason: string }[] }
export interface ApiSummary { people: ApiPerson[]; groups: { unit: string; people: number; metrics: ApiMetric[] }[]; issues: { personId: string; reason: string }[]; notes: string[]; updatedAt?: number }
export interface ApiDirectory { people: ApiPerson[]; role: string; scope: string; updatedAt?: number }
export interface ApiDaily { days: { date: string; value: number; status: string }[]; metric: string; unit: string; updatedAt?: number }
export interface DetailRow { id: string; date: string; personId: string; metric: string; value: number; unit: string; source: string; note: string; fiscalYear?: string }

export interface Metric {
	id: string; label: string; unit: string; definition: string
	value: number | null; numerator: number | null; denominator: number | null
	status: Status; target: number | null; records: number; issues: number
	source: string[]; detailsMetric: string; dailyMetric: DailyKey | null; updatedAt?: number
}
export interface PersonVM { id: string; name: string; initial: string; role: string; unit: string; unitLabel: string; inactive: boolean; tasks: number | null; metrics: Metric[] }
export interface DayVM { date: string; value: number }
export interface IssueGroup { reason: string; count: number }
