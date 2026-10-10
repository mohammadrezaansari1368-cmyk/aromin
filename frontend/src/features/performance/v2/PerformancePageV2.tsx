/** Performance tab v2 — instrument-cluster UI over the same read-only /api/performance endpoints. No sample data. */
import { useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@/lib/auth'
import { parseJ, todayJ } from '@/lib/jalali'
import { EMPTY_FILTER, type Filter } from '@/lib/performance'
import { yearDays } from '@/components/performance/PerformanceWorkspace'
import { usePerformance } from '@/components/performance/usePerformance'
import type { ApiDaily, ApiDirectory, ApiSummary, DailyKey, Metric, PersonVM } from './data/types'
import { gaugeMax, groupIssues, tasksMetric, toDays, toMetric, toPeople, UNIT_LABEL } from './data/adapters'
import { usePerf } from './data/hooks'
import { CLUSTER, WORKDAY_MIN } from './data/clusterConfig'
import InstrumentCluster, { type ClusterGauge } from './cluster/InstrumentCluster'
import { CommandBar, DriveModeSelector, periodLabel, type Mode, type PeriodState } from './sections/CommandBar'
import { TrendChart } from './sections/TrendChart'
import { TeamLeaderboard } from './sections/TeamLeaderboard'
import { YearHeatmap } from './sections/YearHeatmap'
import { DataHealthBar } from './sections/DataHealthBar'
import { MetricDrawer } from './sections/MetricDrawer'
import { AromLoader } from './ui/primitives'
import EffortPanel from './cluster/EffortPanel'
import { effortOf, type PerfFields } from './lib/effort'
import { TaskTracker } from './sections/TaskTracker'
import './perf-v2.css'

const MANAGERS = ['manager', 'salesmgr', 'accmgr']
const off = (id: string, label: string, unit: string, definition: string): Metric => toMetric({ id, label, unit, definition, status: 'no_data', value: null, coverage: { records: 0, issues: 0 } })

export default function PerformancePageV2({ session, go, renderReview, renderSettings, renderLegacy }: {
	session: Session; go?: (id: string) => void
	renderReview: (f: Filter, names: string[]) => ReactNode; renderSettings: () => ReactNode; renderLegacy: () => ReactNode
}) {
	const manager = MANAGERS.includes(session.role), today = todayJ()
	const [mode, setMode] = useState<Mode>('cabin')
	const [period, setPeriod] = useState<PeriodState>({ kind: 'month', year: +today.slice(0, 4), month: +today.slice(5, 7), from: today.slice(0, 8) + '01', to: today })
	const [pick, setPick] = useState(''), [unit, setUnit] = useState(''), [active, setActive] = useState('')
	const [heatYear, setHeatYear] = useState(+today.slice(0, 4)), [heatMetric, setHeatMetric] = useState<DailyKey>('tasks')
	const [drawer, setDrawer] = useState<{ metric: Metric; start: string; end: string } | null>(null)
	const connect = () => go?.('import')

	const directory = usePerf<ApiDirectory>(session, 'directory', {})
	const people = useMemo(() => toPeople(directory.data?.people), [directory.data])
	const person = pick || (!manager ? people[0]?.id || '' : '')
	const dates = useMemo(() => yearDays(period.year), [period.year])
	const span = period.kind === 'year' ? dates : dates.filter((d) => period.kind === 'quarter' ? Math.floor((d.month - 1) / 3) === Math.floor((period.month - 1) / 3) : d.month === period.month)
	const start = period.kind === 'custom' ? parseJ(period.from)?.j || '' : span[0]?.date || '', end = period.kind === 'custom' ? parseJ(period.to)?.j || '' : span.at(-1)?.date || ''
	const params = { person, unit, start, end }
	const summary = usePerf<ApiSummary>(session, 'summary', params, !!directory.data && !!start && !!end && start <= end)
	const team = useMemo(() => toPeople(summary.data?.people), [summary.data])
	const current: PersonVM | undefined = person ? team.find((p) => p.id === person) : undefined
	const group = !person && unit ? summary.data?.groups?.find((g) => g.unit === unit) : undefined
	const effUnit = current?.unit || unit
	const metrics: Metric[] = current ? [...current.metrics, tasksMetric(current.tasks)] : group ? group.metrics.map(toMetric) : []

	// local attendance (this browser only) → presence rate and workdays for one person
	const { ds } = usePerformance(session)
	const chosen = people.find((p) => p.id === person)
	const rows = useMemo(() => (ds?.people || []).filter((p) => chosen && p.person === chosen.name && ['manual', 'strong'].includes(p.personHow)).flatMap((p) => p.rows), [ds, chosen])
	const inSpan = rows.filter((r) => r.date >= start && r.date <= end && (r.presentMin || 0) > 0)
	const presenceMap = useMemo(() => new Map(rows.filter((r) => r.presentMin !== null).map((r) => [r.date, r.presentMin as number])), [rows])
	const presence: Metric = inSpan.length
		? toMetric({ id: 'presence', label: 'حضور', unit: '٪', definition: 'میانگین دقیقهٔ حضورِ روزهای کارکرد ÷ ' + WORKDAY_MIN + ' (فایل حضورِ همین مرورگر)', status: 'valid', value: Math.round((inSpan.reduce((n, r) => n + (r.presentMin || 0), 0) / (inSpan.length * WORKDAY_MIN)) * 1000) / 10, numerator: inSpan.reduce((n, r) => n + (r.presentMin || 0), 0), denominator: inSpan.length * WORKDAY_MIN, coverage: { records: inSpan.length, issues: 0 } })
		: off('presence', 'حضور', '٪', 'فایل حضور در این مرورگر برای این شخص و دوره نیست.')
	// effort inputs = the engine's own perf fields (scoped /source projection); targets: person override → team setting → engine defaults
	type Src = { full?: { people?: { id: string | number; perf?: PerfFields; perfSet?: { taskTarget?: number; callTarget?: number } }[]; perfCfg?: { taskCapMin?: number; taskTarget?: number; callTarget?: number }; callHours?: Record<string, number> } }
	const source = usePerf<Src>(session, 'source', {}, !!directory.data)
	const srcPerson = source.data?.full?.people?.find((p) => String(p.id) === person)
	const cfgP = source.data?.full?.perfCfg || {}
	const effort = effortOf(srcPerson?.perf, cfgP.taskCapMin ?? 30)
	const taskTarget = srcPerson?.perfSet?.taskTarget ?? cfgP.taskTarget ?? 300, callTarget = srcPerson?.perfSet?.callTarget ?? cfgP.callTarget ?? 400
	const holidays = useMemo(() => new Set(rows.filter((r) => ['official_holiday', 'friday', 'birthday', 'official_worked', 'friday_worked', 'birthday_worked'].includes(r.code)).map((r) => r.date)), [rows])

	const peers = (id: string) => team.map((p) => (id === 'tasks' ? p.tasks : p.metrics.find((m) => m.id === id)?.value ?? null))
	const cfg = CLUSTER[effUnit]
	const asGauge = (m: Metric | undefined): ClusterGauge | null => (m ? { metric: m, max: gaugeMax(m, peers(m.id)) } : null)
	const byId = (id: string) => metrics.find((m) => m.id === id)
	const main = cfg ? asGauge(byId(cfg.main)) : null
	const minis = [...(cfg ? cfg.minis.map((id) => asGauge(byId(id))).filter((g): g is ClusterGauge => !!g) : []), asGauge(presence)!]
	const activeMetric = byId(active) || (active === 'presence' ? presence : undefined) || main?.metric || byId('tasks') || presence
	const dailyKey = activeMetric.dailyMetric
	const trend = usePerf<ApiDaily>(session, 'daily', { person, start, end, metric: dailyKey || 'tasks' }, !!person && !!dailyKey && !!start && !!end)
	const yd = yearDays(heatYear)
	const year = usePerf<ApiDaily>(session, 'daily', { person, start: yd[0]?.date || '', end: yd.at(-1)?.date || '', metric: heatMetric }, !!person)
	const avg = byId('contract_average')
	const missing = new Set([main, ...minis].filter((g) => g && g.metric.status === 'not_computable').map((g) => g!.metric.id)).size + (person && effort.zone === 'none' ? 1 : 0)
	const title = current?.name || chosen?.name || (unit ? 'واحد ' + UNIT_LABEL[unit] : 'همهٔ واحدها')
	const units = [...new Set(people.map((p) => p.unit))]
	const scopeNote = `دامنه: ${directory.data?.scope === 'organization' ? 'کل سازمان' : directory.data?.scope === 'unit' ? 'واحد شما' : 'فقط خودتان'} · سال مالیِ اسناد مستقل است · Asia/Tehran`

	const cabin = directory.error ? <p role="alert" className="pv-alert">{directory.error}</p>
		: summary.error ? <p role="alert" className="pv-alert">{summary.error}</p>
			: directory.loading || summary.loading ? <div className="pv-cabin pv-cabin-load"><AromLoader /></div>
				: <InstrumentCluster main={main} side={person ? <EffortPanel effort={effort} callTarget={callTarget} taskTarget={taskTarget} sales={avg?.denominator ?? null} salesTarget={null} callHours={source.data?.full?.callHours || {}} onImport={connect} /> : <p className="pv-cabin-hint">ساعت تلاش: یک شخص انتخاب کنید</p>} minis={minis} title={title} period={periodLabel(period)}
					contracts={avg?.denominator ?? null} avgContract={avg?.value ?? null} workdays={inSpan.length || null}
					activeId={activeMetric.id} onSelect={(m) => { setActive(m.id); if (m.dailyMetric) setHeatMetric(m.dailyMetric) }} onConnect={connect} />
	const open = (m: Metric, s = start, e = end) => setDrawer({ metric: m, start: s, end: e })
	const trendDays = activeMetric.id === 'presence' ? [...presenceMap].filter(([d]) => d >= start && d <= end).sort().map(([date, value]) => ({ date, value })) : toDays(trend.data)
	const trendCard = <TrendChart days={trendDays} unit={activeMetric.id === 'presence' ? 'دقیقهٔ حضور' : trend.data?.unit || activeMetric.unit} metric={activeMetric} presence={presenceMap}
		onDay={(d) => open(activeMetric, d, d)} onDetails={() => open(activeMetric)} error={trend.error} loading={activeMetric.id !== 'presence' && (trend.loading || (!person && !!dailyKey))} />
	const heat = <YearHeatmap days={toDays(year.data)} unit={year.data?.unit || ''} year={heatYear} setYear={setHeatYear} metric={heatMetric} setMetric={setHeatMetric}
 onDay={(d) => { const m = metrics.find((x) => x.dailyMetric === heatMetric); if (m) open(m, d, d) }} error={year.error} loading={year.loading} needPerson={!person} />

	const tracker = <TaskTracker session={session} person={person} year={heatYear} monthlyTarget={taskTarget} holidays={holidays} onDay={(d) => open(tasksMetric(current?.tasks), d, d)} />
	return <div dir="rtl" className="pv-root" data-performance-v2>
		<CommandBar period={period} setPeriod={setPeriod} people={people} stats={team} person={person} setPerson={setPick} unit={unit} setUnit={(u) => { setUnit(u); setPick('') }} units={units} manager={manager} scopeNote={scopeNote} />
		<DriveModeSelector mode={mode} setMode={setMode} classic={session.role === 'manager'} />
		{mode === 'cabin' && <>
			{cabin}
			<div className="pv-grid2">{person ? trendCard : <TeamLeaderboard people={team} metric={activeMetric} selected={person} onSelect={setPick} />}{person ? heat : trendCard}</div>
			{person && tracker}
			{person && manager && team.length > 1 && <TeamLeaderboard people={team} metric={activeMetric} selected={person} onSelect={setPick} />}
		</>}
		{mode === 'person' && <>{person ? <>{cabin}{trendCard}{heat}{tracker}</> : <p className="pv-empty pv-card">یک شخص انتخاب کنید</p>}</>}
		{mode === 'review' && renderReview({ ...EMPTY_FILTER, from: start, to: end, person: chosen?.name || '', team: '' }, team.map((p) => p.name))}
		{mode === 'settings' && renderSettings()}
		{mode === 'legacy' && manager && renderLegacy()}
		{(mode === 'cabin' || mode === 'person') && !summary.loading && <DataHealthBar missing={missing} issues={groupIssues(summary.data?.issues)} updatedAt={summary.data?.updatedAt} onConnect={connect} />}
		{drawer && <MetricDrawer session={session} metric={drawer.metric} who={title} params={{ person, unit, start: drawer.start, end: drawer.end }} onClose={() => setDrawer(null)} onConnect={connect} />}
	</div>
}
