/** Sticky command bar (period · stepper · person · unit · ⓘ) and the drive-mode selector (dock on phones). */
import { useState } from 'react'
import { MONTHS } from '@/engines/commission'
import type { PersonVM } from '../data/types'
import { persian, UNIT_LABEL } from '../data/adapters'
import PersonPicker from '../ui/PersonPicker'
import { TactileButton } from '../ui/primitives'

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom'
export interface PeriodState { kind: PeriodKind; year: number; month: number; from: string; to: string }
const QUARTERS = ['بهار', 'تابستان', 'پاییز', 'زمستان']
export const periodLabel = (p: PeriodState) => p.kind === 'year' ? persian(String(p.year)) : p.kind === 'quarter' ? QUARTERS[Math.floor((p.month - 1) / 3)] + ' ' + persian(String(p.year)) : p.kind === 'custom' ? persian(p.from) + ' — ' + persian(p.to) : MONTHS[p.month - 1] + ' ' + persian(String(p.year))
export function shift(p: PeriodState, dir: 1 | -1): PeriodState {
	if (p.kind === 'year') return { ...p, year: p.year + dir }
	const step = p.kind === 'quarter' ? 3 : 1
	let m = p.month + dir * step, y = p.year
	if (m < 1) { m += 12; y-- } else if (m > 12) { m -= 12; y++ }
	return { ...p, month: m, year: y }
}

export function CommandBar({ period, setPeriod, people, stats, person, setPerson, unit, setUnit, units, manager, scopeNote }: {
	period: PeriodState; setPeriod: (p: PeriodState) => void; people: PersonVM[]; stats: PersonVM[]; person: string; setPerson: (id: string) => void
	unit: string; setUnit: (u: string) => void; units: string[]; manager: boolean; scopeNote: string
}) {
	const [sheet, setSheet] = useState(false)
	return <div className="pv-cmd" data-open={sheet}>
		<button type="button" className="pv-cmd-toggle" aria-expanded={sheet} onClick={() => setSheet((s) => !s)}>⚙ فیلتر · {periodLabel(period)}</button>
		<div className="pv-cmd-body">
			<div role="radiogroup" aria-label="نوع دوره" className="pv-seg">
				{([['month', 'ماه'], ['quarter', 'فصل'], ['year', 'سال'], ['custom', 'سفارشی']] as const).map(([k, t]) =>
					<button key={k} type="button" role="radio" aria-checked={period.kind === k} onClick={() => setPeriod({ ...period, kind: k })}>{t}</button>)}
			</div>
			{period.kind === 'custom'
				? <span className="pv-custom"><input aria-label="از تاریخ" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /><input aria-label="تا تاریخ" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></span>
				: <span className="pv-stepper"><button type="button" aria-label="دورهٔ قبل" onClick={() => setPeriod(shift(period, -1))}>›</button><b aria-live="polite">{periodLabel(period)}</b><button type="button" aria-label="دورهٔ بعد" onClick={() => setPeriod(shift(period, 1))}>‹</button></span>}
			{(manager || people.length > 1) && <PersonPicker people={people.filter((p) => !unit || p.unit === unit)} stats={stats} value={person} onChange={setPerson} allowAll={manager} />}
			{manager && units.length > 1 && <select className="pv-unit" aria-label="واحد" value={unit} onChange={(e) => setUnit(e.target.value)}>
				<option value="">همهٔ واحدها</option>{units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u] || u}</option>)}
			</select>}
			<span className="pv-info" tabIndex={0} role="note" aria-label={scopeNote} title={scopeNote}>ⓘ</span>
		</div>
	</div>
}

export type Mode = 'cabin' | 'person' | 'review' | 'settings' | 'legacy'
const MODES: [Mode, string, string][] = [['cabin', 'کابین', '◎'], ['person', 'فرد', '◉'], ['review', 'تطبیق', '⇄'], ['settings', 'تنظیمات', '⚙']]
export function DriveModeSelector({ mode, setMode, classic }: { mode: Mode; setMode: (m: Mode) => void; classic: boolean }) {
	const [menu, setMenu] = useState(false)
	return <nav className="pv-modes" aria-label="حالت نمایش">
		{MODES.map(([m, t, icon]) => <TactileButton key={m} pressed={mode === m} onClick={() => setMode(m)}><span aria-hidden className="pv-mode-ic">{icon}</span><span className="pv-mode-t">{t}</span></TactileButton>)}
		{classic && <span className="pv-more">
			<button type="button" aria-label="ابزارهای کلاسیک" aria-expanded={menu} onClick={() => setMenu((x) => !x)}>⋯</button>
			{menu && <span className="pv-menu" role="menu"><button role="menuitem" type="button" onClick={() => { setMode('legacy'); setMenu(false) }}>ابزارهای کلاسیک</button></span>}
		</span>}
	</nav>
}
