import { useState } from 'react'
import type { IssueGroup } from '../data/types'
import { ago, fa } from '../data/adapters'
import { ScrollFadeList, TactileButton } from '../ui/primitives'

/** Collapsed: «● n شاخص نیاز به منبع · m مورد بررسی · آخرین به‌روزرسانی». Open: merged issues + jump to the import center. */
export function DataHealthBar({ missing, issues, updatedAt, onConnect }: { missing: number; issues: IssueGroup[]; updatedAt?: number; onConnect: () => void }) {
	const [open, setOpen] = useState(false), total = issues.reduce((n, i) => n + i.count, 0)
	const tone = missing || total ? 'warn' : 'ok'
	return <section className="pv-health" data-tone={tone} aria-label="سلامت داده">
		<button type="button" className="pv-health-h" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
			<i aria-hidden />{fa(missing, 0)} شاخص نیاز به منبع · {fa(total, 0)} مورد بررسی · به‌روزرسانی: {ago(updatedAt)}<span aria-hidden className="pv-chev">{open ? '▴' : '▾'}</span>
		</button>
		{open && <div className="pv-health-b">
			{issues.length ? <ScrollFadeList max={220} label="موارد بررسی">{issues.map((i) => <div role="listitem" key={i.reason} className="pv-issue"><b>{fa(i.count, 0)}</b>{i.reason}</div>)}</ScrollFadeList> : <p className="pv-empty">موردی نیست</p>}
			<TactileButton onClick={onConnect}>اتصال منبع ←</TactileButton>
		</div>}
	</section>
}
