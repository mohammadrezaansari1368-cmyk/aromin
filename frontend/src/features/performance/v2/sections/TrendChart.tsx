import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { parseJ } from '@/lib/jalali'
import type { DayVM, Metric } from '../data/types'
import { fa, persian } from '../data/adapters'
import { BentoCard } from '../ui/primitives'

/** Daily area of the active metric. Target line only with a real target; tooltip = Jalali date + attendance minutes when known. */
export function TrendChart({ days, unit, metric, presence, onDay, onDetails, error, loading }: { days: DayVM[]; unit: string; metric: Metric; presence: Map<string, number>; onDay: (d: string) => void; onDetails: () => void; error?: string; loading?: boolean }) {
	const id = 'pvt' + useId().replace(/:/g, '')
	const body = error ? <p role="alert" className="pv-empty">{error}</p>
		: !metric.dailyMetric && !days.length ? <p className="pv-empty">روند این شاخص در منبع نیست</p>
			: loading ? <div className="pv-skel" /> : !days.length ? <p className="pv-empty">بدون داده</p>
				: <ResponsiveContainer width="100%" height={230}>
					<AreaChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(e) => { const d = (e as { activeLabel?: string })?.activeLabel; if (d) onDay(String(d)) }}>
						<defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="hsl(var(--primary))" stopOpacity={0.32} /><stop offset="1" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
						<CartesianGrid vertical={false} stroke="hsl(var(--border))" />
						<XAxis dataKey="date" reversed tickFormatter={(s) => persian(String(s).slice(5))} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
						<YAxis orientation="right" width={40} tickFormatter={(v) => fa(v)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
						<Tooltip content={({ active, payload }) => {
							const d = payload?.[0]?.payload as DayVM | undefined
							if (!active || !d) return null
							const iso = parseJ(d.date)?.iso, pm = presence.get(d.date)
							return <div className="pv-tip"><span>{persian(d.date)}{iso ? ' · ' + new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'Asia/Tehran' }).format(new Date(iso + 'T12:00:00Z')) : ''}</span><b>{fa(d.value)} {unit}</b><small>حضور: {pm === undefined ? '—' : fa(pm, 0) + ' دقیقه'}</small></div>
						}} />
						{metric.target !== null && <ReferenceLine y={metric.target} stroke="hsl(var(--warning))" strokeDasharray="4 4" />}
						<Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
					</AreaChart>
				</ResponsiveContainer>
	return <BentoCard title={'روند · ' + metric.label} sub={days.length ? unit : undefined} label="روند دوره" actions={<button type="button" className="pv-link" onClick={onDetails}>رسید محاسبه ⓘ</button>}>{body}</BentoCard>
}
