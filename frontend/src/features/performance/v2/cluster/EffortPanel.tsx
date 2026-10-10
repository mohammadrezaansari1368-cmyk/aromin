/** «ساعت تلاش مؤثر» as a classic cabin instrument (one component: cabin + person view). Colours: theme tokens only. */
import type { Effort } from '../lib/effort'
import { achieve, ZONE_LABEL } from '../lib/effort'
import { fa } from '../data/adapters'
import { arc, polar } from '../lib/gaugeMath'
import { TactileButton } from '../ui/primitives'

const MAX_H = 9, A0 = -120, A1 = 120
const deg = (h: number) => A0 + (Math.min(MAX_H, Math.max(0, h)) / MAX_H) * (A1 - A0)
const ZONES: [number, number, string][] = [[0, 4, 'low'], [4, 6, 'normal'], [6, 7.5, 'good'], [7.5, MAX_H, 'burnout']]
const B2B = [10, 14], B2C = [17, 18, 19]
/** the Persian decimal mark «٫» nearly vanishes in the bold numeric face → render it as its own visible glyph */
const decimal = (t: string) => { const [i, f] = t.split('٫'); return f === undefined ? t : <>{i}<span className="pv-dec">٫</span>{f}</> }

function Ring({ label, pct }: { label: string; pct: number | null }) {
	const r = 20, c = 2 * Math.PI * r, p = pct === null ? 0 : Math.min(100, Math.max(0, pct))
	return <div className="pv-ring" data-empty={pct === null} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-valuetext={label + ': ' + (pct === null ? 'بدون هدف یا داده' : fa(pct, 0) + '٪')}>
		<svg viewBox="0 0 50 50" aria-hidden><circle cx="25" cy="25" r={r} className="pv-ring-t" /><circle cx="25" cy="25" r={r} className="pv-ring-f" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 25 25)" /></svg>
		<b>{pct === null ? '—' : fa(pct, 0) + '٪'}</b><span>{label}</span>
	</div>
}

export default function EffortPanel({ effort, callTarget, taskTarget, sales, salesTarget, callHours, onImport }: {
	effort: Effort; callTarget: number | null; taskTarget: number | null; sales: number | null; salesTarget: number | null
	callHours: Record<string, number>; onImport: () => void
}) {
	const c = 100, rad = 78, has = effort.perDay !== null
	const maxHour = Math.max(1, ...Object.values(callHours))
	return <div className="pv-effort" data-zone={effort.zone} aria-label="ساعت تلاش مؤثر">
		<div className="pv-effort-dial" role="meter" aria-valuemin={0} aria-valuemax={MAX_H} aria-valuenow={effort.perDay ?? undefined}
			aria-valuetext={has ? `ساعت تلاش مؤثر: ${fa(effort.perDay, 1)} ساعت در روز · ${ZONE_LABEL[effort.zone]}` : 'ساعت تلاش مؤثر: بدون داده'}>
			<svg viewBox="0 0 200 170" aria-hidden>
				{ZONES.map(([a, b, z]) => <path key={z} d={arc(c, c, rad, deg(a), deg(b))} className={'pv-ez pv-ez-' + z} data-off={!has} />)}
				{Array.from({ length: MAX_H + 1 }, (_, h) => { const [x0, y0] = polar(c, c, rad - 12, deg(h)), [x1, y1] = polar(c, c, rad - 4, deg(h)), [tx, ty] = polar(c, c, rad - 22, deg(h)); return <g key={h}><line x1={x0} y1={y0} x2={x1} y2={y1} className="pv-g-tick" /><text x={tx} y={ty + 3} className="pv-ef-num">{fa(h, 0)}</text></g> })}
				{(() => { const [x0, y0] = polar(c, c, rad + 2, deg(6)), [x1, y1] = polar(c, c, rad - 14, deg(6)); return <line x1={x0} y1={y0} x2={x1} y2={y1} className="pv-ef-target" /> })()}
				<g className="pv-g-needle" style={{ transform: `rotate(${has ? deg(effort.perDay!) : A0 - 10}deg)`, transformOrigin: `${c}px ${c}px` }}><line x1={c} y1={c + 10} x2={c} y2={c - rad + 8} /></g>
				<circle cx={c} cy={c} r={6} className="pv-g-hub" />
			</svg>
			<span className="pv-ef-val"><b>{has ? decimal(fa(effort.perDay, 1)) : '—'}</b><small>ساعت/روز · هدف ۶</small><em>{ZONE_LABEL[effort.zone]}</em></span>
		</div>
		{!has ? <TactileButton onClick={onImport}>ایمپورت گزارش</TactileButton> : <>
			<div className="pv-rings">
				<Ring label="تماس" pct={achieve(effort.calls, callTarget)} /><Ring label="وظیفه" pct={achieve(effort.tasks, taskTarget)} /><Ring label="فروش" pct={achieve(sales, salesTarget)} />
			</div>
			<dl className="pv-ef-figs">
				<div><dt>مکالمه</dt><dd>{fa(effort.talkMin / 60, 1)}<small> ساعت</small></dd></div>
				<div><dt>وظایف</dt><dd>{fa(effort.taskMin / 60, 1)}<small> ساعت</small></dd></div>
				<div><dt>روز فعال</dt><dd>{fa(effort.days, 0)}</dd></div>
				<div><dt>فروش</dt><dd>{fa(sales, 0)}</dd></div>
			</dl>
		</>}
		<div className="pv-peak" aria-label="اوج تماس: B2B ۱۰–۱۱ و ۱۴–۱۵ · B2C ۱۷–۲۰">
			{Array.from({ length: 13 }, (_, i) => i + 8).map((h) => <i key={h} title={fa(h, 0) + ':۰۰ · ' + fa(callHours[h] || 0, 0) + ' تماس'} data-b2b={B2B.includes(h)} data-b2c={B2C.includes(h)} style={{ ['--h' as string]: ((callHours[h] || 0) / maxHour).toFixed(2) }} />)}
			<span aria-hidden>۸</span><span aria-hidden>۲۰</span>
		</div>
		<span className="pv-g-badge pv-muted">مشروط به تأیید مالی</span>
	</div>
}
