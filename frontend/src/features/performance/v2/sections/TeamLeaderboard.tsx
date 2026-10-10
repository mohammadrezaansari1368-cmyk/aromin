import { useState } from 'react'
import type { Metric, PersonVM } from '../data/types'
import { fa, faMoney } from '../data/adapters'
import { BentoCard, ScrollFadeList } from '../ui/primitives'

/** Horizontal RTL bars for the active metric; click = person filter; inactive faded with a hide toggle. */
export function TeamLeaderboard({ people, metric, selected, onSelect }: { people: PersonVM[]; metric: Metric; selected: string; onSelect: (id: string) => void }) {
	const [hide, setHide] = useState(false)
	const val = (p: PersonVM) => (metric.id === 'tasks' ? p.tasks : p.metrics.find((m) => m.id === metric.id)?.value ?? null)
	const max = Math.max(0, ...people.map((p) => val(p) ?? 0))
	const rows = people.filter((p) => !hide || !p.inactive).sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1))
	const fmt = metric.id === 'contract_average' ? faMoney : (n: number | null) => fa(n)
	return <BentoCard title={'تیم · ' + metric.label} label="مقایسهٔ تیم" actions={<label className="pv-inline"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />پنهان‌کردن قطع همکاری</label>}>
		{!rows.length ? <p className="pv-empty">بدون داده</p> : <ScrollFadeList label="افراد">
			{rows.map((p) => { const n = val(p), st = p.metrics.find((m) => m.id === metric.id)?.status; return <button key={p.id} role="listitem" type="button" className="pv-row" data-inactive={p.inactive} aria-pressed={selected === p.id} onClick={() => onSelect(p.id)}>
				<span className="pv-avatar">{p.initial}</span>
				<span className="pv-row-n">{p.name}<span className="pv-bar"><i style={{ width: max && n !== null ? (Math.max(0, n) / max) * 100 + '%' : '0%' }} /></span></span>
				<b>{fmt(n)}</b><small aria-label={n === null ? 'بدون داده' : st === 'partial' ? 'ناقص' : 'معتبر'}>{n === null ? '○' : st === 'partial' ? '◐' : '●'}</small>
			</button> })}
		</ScrollFadeList>}
	</BentoCard>
}
