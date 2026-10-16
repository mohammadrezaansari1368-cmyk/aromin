/** WP-3 call tiles: server call stats (confirmed julio/ext mapping only). Click → trend + details of that metric. */
import type { Metric } from '../data/types'
import { fa, faDuration } from '../data/adapters'

export function CallTiles({ metrics, activeId, onSelect, onConnect }: { metrics: Metric[]; activeId: string; onSelect: (m: Metric) => void; onConnect: () => void }) {
	const empty = metrics.every((m) => m.value === null)
	return <section className="pv-card pv-calls" aria-label="آمار تماس">
		<header className="pv-calls-head"><b>تماس‌ها</b><small>ریز تماسِ سرور · فقط نگاشتِ تأییدشده · تماسِ صف شمرده نمی‌شود</small></header>
		{empty ? <p className="pv-empty">برای این دامنه و دوره ریز تماسی روی سرور نیست. <button type="button" className="pv-link" onClick={onConnect}>ورود ریز تماس</button></p>
			: <div className="pv-calls-grid">{metrics.map((m) => <button key={m.id} type="button" className="pv-calls-tile" aria-pressed={activeId === m.id} onClick={() => onSelect(m)} title={m.definition}>
				<span>{m.label}</span><b>{m.id === 'talk_seconds' ? faDuration(m.value) : fa(m.value, 0)}</b><small>{m.id === 'talk_seconds' ? 'ساعت:دقیقه' : m.unit}</small>
			</button>)}</div>}
	</section>
}
