/**
 * Shared 2D ↔ 3D calendar map (restored ContributionSkyline, commit 0046a99) for the yearly map and the task tracker.
 * Real Jalali data only; Saturday-first; Persian labels; every colour comes from theme tokens (read with getComputedStyle,
 * recomputed on theme/palette/mode change — no reload).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import ContributionSkyline, { type SkylineLabels } from '@/components/ui/contribution-skyline'
import { parseJ, todayJ } from '@/lib/jalali'
import type { DayVM } from '../data/types'

/** token → rgb triple via the browser (works for any CSS colour expression) */
function tokenRgb(expr: string): [number, number, number] | null {
	const el = document.createElement('span'); el.style.color = expr; el.style.display = 'none'; document.body.appendChild(el)
	const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g); el.remove()
	return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : null
}
const mix = (a: [number, number, number], b: [number, number, number], t: number) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')'

/** 4 activity levels = primary token blended into the card token at 30/55/80/100% */
export function useTokenPalette() {
	const read = () => {
		const card = tokenRgb('hsl(var(--card))'), pri = tokenRgb('hsl(var(--primary))')
		if (!card || !pri) return null
		const levels = [0.3, 0.55, 0.8, 1].map((t) => mix(card, pri, t))
		return { light: levels, dark: levels }
	}
	const [pal, setPal] = useState(read)
	useEffect(() => {
		const mo = new MutationObserver(() => setPal((prev) => { const n = read(); return JSON.stringify(n) === JSON.stringify(prev) ? prev : n }))
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode', 'class', 'style'] })
		return () => mo.disconnect()
	}, [])
	return pal
}
const THEME_VARS = { '--color-background': 'hsl(var(--card))', '--color-foreground': 'hsl(var(--text))', '--color-border': 'hsl(var(--border))', '--color-muted-foreground': 'hsl(var(--muted-foreground))' } as CSSProperties
const FA: Partial<SkylineLabels> = {
	lastYear: '', total: 'مجموع', busiest: 'شلوغ‌ترین روز', longest: 'طولانی‌ترین توالی', current: 'توالی فعلی', day: 'روز', days: 'روز',
	hint2d: 'روی روز بروید یا با کلیدهای جهت حرکت کنید', hint3d: 'بکشید تا بچرخد · دوبار کلیک = بازنشانی', less: 'کم', more: 'زیاد',
	levels: ['', 'کم', 'متوسط', 'زیاد', 'خیلی زیاد'], none: 'بدون ', on: ' · ', between: ' · ', shownAs: ' · ', flat: 'نمای دوبعدی', sky: 'نمای سه‌بعدی', view: 'نوع نما', keys: '', highlight: 'برجسته‌کردن ',
}

export default function CalendarMap2D3D({ days, from, to, unit, title, onDay }: { days: DayVM[]; from: string; to: string; unit: string; title?: string; onDay?: (dateJ: string) => void }) {
	const palette = useTokenPalette()
	const data = useMemo(() => days.map((d) => ({ date: parseJ(d.date)?.iso || '', count: d.value })).filter((d) => d.date), [days])
	const start = parseJ(from)?.iso, end = parseJ(to)?.iso
	if (!start || !end) return null
	// cells keep a readable size: short ranges (month/quarter) don't stretch to full width
	const weeks = Math.ceil((Date.parse(end) - Date.parse(start)) / 86400000 / 7) + 1
	return <div dir="ltr" style={{ ...THEME_VARS, maxWidth: Math.max(340, weeks * 24 + 90), marginInline: 'auto' }} className="pv-cal3d">
		<ContributionSkyline data={data} startDate={start} endDate={end} weekStart={6} locale="fa-IR-u-ca-persian" palette={palette || undefined}
			unit={unit} unitPlural={unit} labels={FA} title={title} defaultView="2d" footer={null}
			onCellClick={onDay ? (d) => onDay(todayJ(new Date(d.date + 'T12:00:00Z'))) : undefined} />
	</div>
}
