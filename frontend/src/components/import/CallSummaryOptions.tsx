/**
 * گزینه‌های فایلِ «عملکردِ تماس» در صفِ ایمپورت: جهت و دوره — بدونِ پیش‌فرض و بدونِ حدس از نامِ فایل.
 * فایلِ خلاصهٔ سانترال جهت و تاریخ ندارد؛ بی این دو، ردیف‌ها قابلِ تفسیر نیستند (سرور هم بی آن‌ها 400 می‌دهد).
 */
import { useState } from 'react'
import { callOptsError, type CallDirection, type CallOpts } from '@/lib/callsApi'

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const pill = (on: boolean) =>
	`h-8 rounded-lg px-3 text-[12px] font-bold ring-1 transition ${on ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-border hover:text-foreground'}`
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const field = 'h-8 rounded-lg bg-card px-2 text-[12px] text-foreground ring-1 ring-border focus:outline-none focus:ring-primary'

export default function CallSummaryOptions({ value, onChange }: { value?: CallOpts; onChange: (v: CallOpts) => void }) {
	const [mode, setMode] = useState<'month' | 'range'>(value?.period && 'from' in value.period ? 'range' : 'month')
	const [year, setYear] = useState(value?.period && 'month' in value.period ? value.period.month.slice(0, 4) : '')
	const [month, setMonth] = useState(value?.period && 'month' in value.period ? value.period.month.slice(5) : '')
	const [from, setFrom] = useState(value?.period && 'from' in value.period ? value.period.from : '')
	const [to, setTo] = useState(value?.period && 'to' in value.period ? value.period.to : '')
	const emit = (p: { direction?: CallDirection; mode?: 'month' | 'range'; year?: string; month?: string; from?: string; to?: string }) => {
		const m = p.mode ?? mode, y = latin(p.year ?? year).trim(), mo = p.month ?? month, f = latin(p.from ?? from).trim(), t = latin(p.to ?? to).trim()
		const period = m === 'month' ? (/^\d{4}$/.test(y) && mo ? { month: `${y}/${mo}` } : undefined) : f && t ? { from: f, to: t } : undefined
		onChange({ direction: p.direction ?? value?.direction, period })
	}
	const touched = !!(value?.direction || year || month || from || to)
	const err = touched ? callOptsError(value) : null
	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]" data-call-options>
			<div role="radiogroup" aria-label="جهتِ تماس‌های فایل" className="flex items-center gap-1.5">
				<span className="text-muted-foreground">جهت:</span>
				{(['in', 'out'] as const).map((d) => (
					<button key={d} type="button" role="radio" aria-checked={value?.direction === d} className={pill(value?.direction === d)} onClick={() => emit({ direction: d })}>
						{d === 'in' ? 'ورودی' : 'خروجی'}
					</button>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-muted-foreground">دوره:</span>
				<button type="button" aria-pressed={mode === 'month'} className={pill(mode === 'month')} onClick={() => { setMode('month'); emit({ mode: 'month' }) }}>ماهِ شمسی</button>
				<button type="button" aria-pressed={mode === 'range'} className={pill(mode === 'range')} onClick={() => { setMode('range'); emit({ mode: 'range' }) }}>از–تا</button>
				{mode === 'month' ? <>
					<input aria-label="سال" inputMode="numeric" placeholder="۱۴۰۵" dir="ltr" className={field + ' w-16 text-center'} value={year}
						onChange={(e) => { setYear(e.target.value); emit({ year: e.target.value }) }} />
					<select aria-label="ماه" className={field} value={month} onChange={(e) => { setMonth(e.target.value); emit({ month: e.target.value }) }}>
						<option value="">ماه…</option>
						{MONTHS.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
					</select>
				</> : <>
					<input aria-label="از تاریخ" placeholder="1405/06/01" dir="ltr" className={field + ' w-24'} value={from} onChange={(e) => { setFrom(e.target.value); emit({ from: e.target.value }) }} />
					<span className="text-muted-foreground">تا</span>
					<input aria-label="تا تاریخ" placeholder="1405/06/31" dir="ltr" className={field + ' w-24'} value={to} onChange={(e) => { setTo(e.target.value); emit({ to: e.target.value }) }} />
				</>}
			</div>
			{err && <span className="text-error" role="alert">{err}</span>}
		</div>
	)
}
