import { useMemo } from 'react'
import { yearDays } from '@/components/performance/PerformanceWorkspace'
import { MONTHS } from '@/engines/commission'
import { todayJ } from '@/lib/jalali'
import type { DailyKey, DayVM } from '../data/types'
import { fa, persian } from '../data/adapters'
import { BentoCard } from '../ui/primitives'

export function yearStats(days: DayVM[], today: string) {
	const past = days.filter((d) => d.date <= today)
	return { total: past.length ? past.reduce((n, d) => n + d.value, 0) : null, busiest: past.length ? [...past].sort((a, b) => b.value - a.value)[0].date : null }
}
const KEYS: [DailyKey, string][] = [['tasks', 'وظایف'], ['contracts', 'قرارداد'], ['finance_documents', 'سند']]
type Day = { date: string; value: number | undefined; state: 'future' | 'none' | 'zero' | 'holiday' | 'leave' | 'on'; level: number }

/** Real /daily data on Saturday-first Jalali months. 3D stays off: it would turn missing days into zeros. */
export function YearHeatmap({ days, unit, year, setYear, metric, setMetric, dayType, onDay, error, loading, needPerson }: {
	days: DayVM[]; unit: string; year: number; setYear: (n: number) => void; metric: DailyKey; setMetric: (m: DailyKey) => void
	dayType: Map<string, 'holiday' | 'leave'>; onDay: (d: string) => void; error?: string; loading?: boolean; needPerson: boolean
}) {
	const today = todayJ(), dates = useMemo(() => yearDays(year), [year])
	const map = useMemo(() => new Map(days.map((d) => [d.date, d.value])), [days]), max = Math.max(0, ...days.map((d) => d.value))
	const st = yearStats(days, today)
	const cell = (date: string): Day => {
		const v = map.get(date), t = dayType.get(date)
		const state = date > today ? 'future' : v === undefined ? (t || 'none') : v === 0 ? (t || 'zero') : 'on'
		return { date, value: v, state, level: state === 'on' && max ? Math.max(1, Math.ceil((v! / max) * 4)) : 0 }
	}
	const label: Record<Day['state'], string> = { future: 'آینده', none: 'بدون داده', zero: 'صفر', holiday: 'تعطیل', leave: 'مرخصی', on: 'ثبت‌شده' }
	return <BentoCard title="نقشهٔ سالانه" label="نقشهٔ سالانه" actions={<span className="pv-hm-ctl">
		<span role="radiogroup" aria-label="شاخص نقشه" className="pv-seg pv-seg-s">{KEYS.map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={metric === k} onClick={() => setMetric(k)}>{t}</button>)}</span>
		<span className="pv-stepper"><button type="button" aria-label="سال قبل" onClick={() => setYear(year - 1)}>›</button><b>{persian(String(year))}</b><button type="button" aria-label="سال بعد" onClick={() => setYear(year + 1)}>‹</button></span>
	</span>}>
		<div className="pv-hm-stats">
			<span>مجموع<b>{fa(st.total)}</b></span><span>شلوغ‌ترین<b>{st.busiest ? persian(st.busiest.slice(5)) : '—'}</b></span>
			<span title="روز کاری و مرخصیِ روزانه در این منبع نیست؛ حدس زده نمی‌شود">طولانی‌ترین توالی<b>—</b></span><span title="روز کاری و مرخصیِ روزانه در این منبع نیست؛ حدس زده نمی‌شود">توالی فعلی<b>—</b></span>
		</div>
		{error ? <p role="alert" className="pv-empty">{error}</p> : needPerson ? <p className="pv-empty">یک شخص انتخاب کنید</p> : loading ? <div className="pv-skel" /> :
			<div className="pv-cal" aria-label="تقویم شمسی شنبه‌محور">
				{MONTHS.map((name, i) => { const md = dates.filter((d) => d.month === i + 1); return <section key={name}><h4>{name}</h4><div className="pv-month">
					{['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((w) => <span key={w} className="pv-wd">{w}</span>)}
					{Array.from({ length: md[0]?.weekday || 0 }, (_, j) => <span key={'b' + j} />)}
					{md.map((d) => { const c = cell(d.date); return <button key={d.date} type="button" data-state={c.state} data-level={c.level} onClick={() => onDay(d.date)}
						aria-label={`${persian(d.date)} · ${c.value === undefined ? '—' : fa(c.value)} ${unit} · ${label[c.state]}`} title={`${persian(d.date)} · ${c.value === undefined ? '—' : fa(c.value)} ${unit}`} /> })}
				</div></section> })}
			</div>}
		<div className="pv-hm-leg" aria-label="راهنما">{(['none', 'zero', 'future', 'holiday', 'leave', 'on'] as const).map((s) => <span key={s}><i data-state={s} data-level={s === 'on' ? 3 : 0} />{label[s]}</span>)}</div>
	</BentoCard>
}
