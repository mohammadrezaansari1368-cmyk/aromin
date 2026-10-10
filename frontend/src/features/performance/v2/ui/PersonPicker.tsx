/** Person picker: chip trigger → searchable listbox; hover/focus shows 4 LED meters from summary.people (no faked numbers). */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PersonVM } from '../data/types'
import { fa } from '../data/adapters'

const LEDS = [['activity', 'فعالیت'], ['efficiency', 'راندمان'], ['presence', 'حضور'], ['conversion', 'تبدیل']] as const

function Meter({ label, value, max }: { label: string; value: number | null; max: number }) {
	const on = value === null ? 0 : Math.round(Math.min(1, max > 0 ? value / max : 0) * 10)
	return <div className="pv-led" data-empty={value === null}>
		<span>{label}</span>
		<i aria-hidden>{Array.from({ length: 10 }, (_, k) => <b key={k} data-on={k < on} />)}</i>
		<em>{value === null ? '—' : fa(value)}</em>
	</div>
}

export default function PersonPicker({ people, stats, value, onChange, allowAll }: { people: PersonVM[]; stats: PersonVM[]; value: string; onChange: (id: string) => void; allowAll: boolean }) {
	const [open, setOpen] = useState(false), [q, setQ] = useState(''), [cur, setCur] = useState(0)
	const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
	const list = useMemo(() => {
		const f = people.filter((p) => !q || p.name.includes(q))
		return [...f.filter((p) => !p.inactive), ...f.filter((p) => p.inactive)]
	}, [people, q])
	const options = allowAll ? [null, ...list] : list
	const chosen = people.find((p) => p.id === value)
	const hover = options[cur] || null
	const statOf = (id: string, m: string) => stats.find((s) => s.id === id)?.metrics.find((x) => x.id === m)?.value ?? null
	const maxOf = (m: string) => Math.max(0, ...stats.map((s) => s.metrics.find((x) => x.id === m)?.value ?? 0))
	useEffect(() => { if (open) { setCur(0); requestAnimationFrame(() => input.current?.focus()) } }, [open])
	useEffect(() => { const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('pointerdown', off); return () => document.removeEventListener('pointerdown', off) }, [])
	const pick = (p: PersonVM | null) => { onChange(p?.id || ''); setOpen(false); setQ('') }
	const key = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(options.length - 1, c + 1)) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)) }
		else if (e.key === 'Enter') { e.preventDefault(); if (options[cur] !== undefined) pick(options[cur]) }
		else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
	}
	return <div className="pv-picker" ref={box}>
		<button type="button" className="pv-chip" aria-haspopup="listbox" aria-expanded={open} aria-label={'شخص: ' + (chosen?.name || 'همه')} onClick={() => setOpen((o) => !o)}>
			<span className="pv-avatar">{chosen?.initial || '∗'}</span>{chosen?.name || 'همهٔ افراد'}<span aria-hidden className="pv-chev">▾</span>
		</button>
		{open && <div className="pv-pop" onKeyDown={key}>
			<input ref={input} className="pv-search" placeholder="جستجو" aria-label="جستجوی شخص" value={q} onChange={(e) => { setQ(e.target.value); setCur(0) }}
				aria-controls="pv-people" aria-activedescendant={options[cur] !== undefined ? 'pv-opt-' + (options[cur]?.id || 'all') : undefined} />
			<div className="pv-pop-grid">
				<ul id="pv-people" role="listbox" aria-label="افراد">
					{options.map((p, i) => <li key={p?.id || 'all'} id={'pv-opt-' + (p?.id || 'all')} role="option" aria-selected={(p?.id || '') === value} data-cur={i === cur} data-inactive={!!p?.inactive}
						onMouseEnter={() => setCur(i)} onClick={() => pick(p)}>
						<span className="pv-avatar">{p?.initial || '∗'}</span><span>{p?.name || 'همهٔ افراد'}<small>{p ? p.unitLabel + (p.inactive ? ' · قطع همکاری' : '') : 'دامنهٔ مجاز'}</small></span>
					</li>)}
				</ul>
				{hover && <aside className="pv-pop-card" aria-label={'خلاصهٔ ' + hover.name}>
					<b>{hover.name}</b>
					{LEDS.map(([m, l]) => <Meter key={m} label={l} value={m === 'presence' ? null : statOf(hover.id, m)} max={maxOf(m)} />)}
				</aside>}
			</div>
		</div>}
	</div>
}
