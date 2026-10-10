/** Task tracker on the shared 2D/3D calendar: year → quarter → month drill-down; count / % of target (hours need dated task minutes). */
import { useMemo, useState } from 'react'
import type { Session } from '@/lib/auth'
import { MONTHS } from '@/engines/commission'
import { yearDays } from '@/components/performance/PerformanceWorkspace'
import type { ApiDaily } from '../data/types'
import { persian, toDays } from '../data/adapters'
import { usePerf } from '../data/hooks'
import { dailyTarget, workingDays } from '../lib/effort'
import { BentoCard } from '../ui/primitives'
import CalendarMap2D3D from '../ui/CalendarMap2D3D'

type Level = 'year' | 'quarter' | 'month'
type Value = 'count' | 'pct' | 'hours'
const QUARTERS = ['بهار', 'تابستان', 'پاییز', 'زمستان']

export function TaskTracker({ session, person, year, monthlyTarget, holidays, onDay }: {
	session: Session; person: string; year: number; monthlyTarget: number | null; holidays: Set<string>; onDay: (dateJ: string) => void
}) {
	const [level, setLevel] = useState<Level>('year'), [q, setQ] = useState(0), [m, setM] = useState(1), [value, setValue] = useState<Value>('count')
	const all = useMemo(() => yearDays(year), [year])
	const span = level === 'year' ? all : level === 'quarter' ? all.filter((d) => Math.floor((d.month - 1) / 3) === q) : all.filter((d) => d.month === m)
	const from = span[0]?.date || '', to = span.at(-1)?.date || ''
	const res = usePerf<ApiDaily>(session, 'daily', { person, start: from, end: to, metric: 'tasks' }, !!person && !!from)
	const counts = useMemo(() => toDays(res.data), [res.data])
	const days = useMemo(() => {
		if (value !== 'pct') return counts
		const per = new Map<number, number | null>()
		for (let mm = 1; mm <= 12; mm++) per.set(mm, dailyTarget(monthlyTarget, workingDays(all.filter((d) => d.month === mm), holidays)))
		return counts.flatMap((d) => { const t = per.get(+d.date.slice(5, 7)); return t ? [{ date: d.date, value: Math.round((d.value / t) * 100) }] : [] })
	}, [counts, value, monthlyTarget, all, holidays])
	const drill = (date: string) => {
		const mm = +date.slice(5, 7)
		if (level === 'year') { setQ(Math.floor((mm - 1) / 3)); setLevel('quarter') }
		else if (level === 'quarter') { setM(mm); setLevel('month') }
		else onDay(date)
	}
	const crumb = <span className="pv-crumb">
		<button type="button" aria-current={level === 'year'} onClick={() => setLevel('year')}>{persian(String(year))}</button>
		{level !== 'year' && <>›<button type="button" aria-current={level === 'quarter'} onClick={() => setLevel('quarter')}>{QUARTERS[level === 'month' ? Math.floor((m - 1) / 3) : q]}</button></>}
		{level === 'month' && <>›<b aria-current>{MONTHS[m - 1]}</b></>}
	</span>
	const noTarget = value === 'pct' && !monthlyTarget
	return <BentoCard title="ردیاب وظیفه" sub={crumb} label="ردیاب وظیفه" actions={<span role="radiogroup" aria-label="مقدار ردیاب" className="pv-seg pv-seg-s">
		{([['count', 'تعداد'], ['pct', 'تحقق هدف ٪'], ['hours', 'ساعت']] as const).map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={value === k} disabled={k === 'hours'}
			title={k === 'hours' ? 'مدت وظایف در ایمپورت فعلی تاریخ ندارد؛ ساعتِ روزانه قابل محاسبه نیست' : undefined} onClick={() => setValue(k)}>{t}</button>)}
	</span>}>
		{!person ? <p className="pv-empty">یک شخص انتخاب کنید</p> : res.error ? <p role="alert" className="pv-empty">{res.error}</p> : res.loading ? <div className="pv-skel" />
			: noTarget ? <p className="pv-empty">هدف وظیفه در تنظیمات ثبت نشده</p>
				: <CalendarMap2D3D key={level + q + m + value} days={days} from={from} to={to} unit={value === 'pct' ? '٪' : 'وظیفه'} onDay={drill} />}
	</BentoCard>
}
