/** Details drawer: printed calculation receipt + records (paged) + Excel export (same paging/columns as v1). */
import { useEffect, useRef, useState } from 'react'
import type { Session } from '@/lib/auth'
import type { DetailRow, Metric } from '../data/types'
import { ago, fa, persian } from '../data/adapters'
import { exportDetails, usePerf } from '../data/hooks'
import { IMPORT_SOURCE } from '../data/clusterConfig'
import { DynamicButton, TactileButton } from '../ui/primitives'

export function CalcReceipt({ metric, who, from, to, onConnect }: { metric: Metric; who: string; from: string; to: string; onConnect: () => void }) {
	const off = metric.status === 'not_computable' || metric.status === 'error'
	const src = metric.source.length ? metric.source.join('، ') : IMPORT_SOURCE[metric.id] || '—'
	const line = (k: string, v: string) => <div className="pv-rc-l"><span>{k}</span><b>{v}</b></div>
	return <div className="pv-receipt" aria-label="رسید محاسبه"><div className="pv-rc-paper">
		<header><b>{metric.label} · {who}</b><span>{persian(from)} — {persian(to)}</span></header><hr />
		{off ? <>{line('دلیل', metric.status === 'error' ? 'خطا در محاسبه' : 'قابل محاسبه نیست')}{line('منبع لازم', IMPORT_SOURCE[metric.id] || '—')}<p className="pv-rc-def">{metric.definition}</p>
			<TactileButton onClick={onConnect}>اتصال منبع ←</TactileButton></> : <>
			{line('صورت', fa(metric.numerator))}{line('مخرج', metric.denominator === null ? '—' : fa(metric.denominator))}<hr />
			{line('مقدار', fa(metric.value) + ' ' + metric.unit)}{line('پوشش', (metric.status === 'partial' ? 'ناقص' : 'کامل') + ' · ' + fa(metric.records, 0) + ' رکورد')}
			{line('منبع', src + ' · ' + ago(metric.updatedAt))}{line('هدف', metric.target === null ? 'بدون هدف' : fa(metric.target))}<p className="pv-rc-def">{metric.definition}</p></>}
		<hr /><div className="pv-rc-bar" aria-hidden>|||||| {metric.id} ||||||</div>
	</div></div>
}

export function MetricDrawer({ session, metric, who, params, onClose, onConnect }: { session: Session; metric: Metric; who: string; params: { person: string; unit: string; start: string; end: string }; onClose: () => void; onConnect: () => void }) {
	const [pages, setPages] = useState(1), [exp, setExp] = useState<{ label: string; tone?: 'ok' | 'err' }>({ label: 'خروجی اکسل' })
	const q = { ...params, metric: metric.detailsMetric }
	const res = usePerf<{ rows: DetailRow[]; total: number }>(session, 'details', { ...q, offset: '0', limit: String(50 * pages) }, metric.status !== 'not_computable')
	const panel = useRef<HTMLDivElement>(null)
	useEffect(() => { panel.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
	const run = async () => {
		try { setExp({ label: 'در حال آماده‌سازی…' }); const n = await exportDetails(session, q, (d, t) => setExp({ label: `در حال آماده‌سازی ${fa(d, 0)}/${fa(t, 0)}` })); setExp({ label: n ? 'دانلود شد ✓' : 'رکوردی نیست', tone: 'ok' }) }
		catch { setExp({ label: 'تلاش دوباره', tone: 'err' }) }
	}
	return <div className="pv-drawer-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
		<div className="pv-drawer" role="dialog" aria-modal="true" aria-label={'جزئیات ' + metric.label} tabIndex={-1} ref={panel}>
			<header className="pv-drawer-h"><b>{metric.label}</b><button type="button" aria-label="بستن" onClick={onClose}>✕</button></header>
			<CalcReceipt metric={metric} who={who} from={params.start} to={params.end} onConnect={onConnect} />
			{metric.status !== 'not_computable' && <>
				<div className="pv-drawer-act"><DynamicButton label={exp.label} tone={exp.tone} onClick={run} disabled={exp.label.startsWith('در حال')} /><span>{res.data ? fa(res.data.total, 0) + ' رکورد' : ''}</span></div>
				{res.error ? <p role="alert" className="pv-empty">{res.error}</p> : res.loading ? <div className="pv-skel" /> :
					<div className="pv-table" role="table" aria-label="رکوردها">
						<div role="row" className="pv-tr pv-th"><span role="columnheader">تاریخ</span><span role="columnheader">مقدار</span><span role="columnheader">منبع</span></div>
						{res.data?.rows.map((r) => <div role="row" key={r.id} className="pv-tr"><span role="cell">{persian(r.date)}</span><span role="cell">{fa(r.value)} {r.unit}</span><span role="cell" title={r.note}>{r.source}</span></div>)}
						{res.data && res.data.rows.length < res.data.total && <button type="button" className="pv-more-rows" onClick={() => setPages((p) => p + 1)}>بیشتر</button>}
					</div>}
			</>}
		</div>
	</div>
}
