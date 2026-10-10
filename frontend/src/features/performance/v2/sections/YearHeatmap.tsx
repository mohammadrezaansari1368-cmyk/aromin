import { yearDays } from '@/components/performance/PerformanceWorkspace'
import type { DailyKey, DayVM } from '../data/types'
import { persian } from '../data/adapters'
import { BentoCard } from '../ui/primitives'
import CalendarMap2D3D from '../ui/CalendarMap2D3D'

export function yearStats(days: DayVM[], today: string) {
	const past = days.filter((d) => d.date <= today)
	return { total: past.length ? past.reduce((n, d) => n + d.value, 0) : null, busiest: past.length ? [...past].sort((a, b) => b.value - a.value)[0].date : null }
}
const KEYS: [DailyKey, string][] = [['tasks', 'وظایف'], ['contracts', 'قرارداد'], ['finance_documents', 'سند']]

/** Yearly map — the restored 2D/3D skyline (commit 0046a99) fed with real /daily data for one Jalali year. */
export function YearHeatmap({ days, unit, year, setYear, metric, setMetric, onDay, error, loading, needPerson }: {
	days: DayVM[]; unit: string; year: number; setYear: (n: number) => void; metric: DailyKey; setMetric: (m: DailyKey) => void
	onDay: (d: string) => void; error?: string; loading?: boolean; needPerson: boolean
}) {
	const yd = yearDays(year)
	return <BentoCard title="نقشهٔ سالانه" label="نقشهٔ سالانه" actions={<span className="pv-hm-ctl">
		<span role="radiogroup" aria-label="شاخص نقشه" className="pv-seg pv-seg-s">{KEYS.map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={metric === k} onClick={() => setMetric(k)}>{t}</button>)}</span>
		<span className="pv-stepper"><button type="button" aria-label="سال قبل" onClick={() => setYear(year - 1)}>›</button><b>{persian(String(year))}</b><button type="button" aria-label="سال بعد" onClick={() => setYear(year + 1)}>‹</button></span>
	</span>}>
		{error ? <p role="alert" className="pv-empty">{error}</p> : needPerson ? <p className="pv-empty">یک شخص انتخاب کنید</p> : loading ? <div className="pv-skel" />
			: <CalendarMap2D3D days={days} from={yd[0]?.date || ''} to={yd.at(-1)?.date || ''} unit={unit || 'مورد'} onDay={onDay} />}
	</BentoCard>
}
