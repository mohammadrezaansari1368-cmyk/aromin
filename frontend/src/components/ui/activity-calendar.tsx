'use client'

/**
 * ActivityCalendar — تقویمِ فعالیت به سبکِ «کالِندرِ مشارکت»، برای آرومین (RTL، تاریخِ شمسی، توکن‌های تم).
 * ستون = هفته (شنبه تا جمعه از بالا به پایین)، خانه = یک روز. شدتِ رنگ = مقدار نسبت به بیشینهٔ همان بازه.
 * داده از بیرون می‌آید (نگاشت در مصرف‌کننده تعریف می‌شود)؛ این جزء هیچ عددی نمی‌سازد.
 * date-fns لازم نیست: تاریخ‌ها شمسی‌اند و روزِ هفته از خودِ داده (ستونِ «روز» دستگاه) می‌آید.
 */

import { useMemo } from 'react'

export interface CalendarDay {
	/** تاریخِ شمسی yyyy/mm/dd */
	date: string
	/** ۰ = شنبه … ۶ = جمعه */
	weekday: number
	/** null = دادهٔ این روز نیست (نه صفر) */
	value: number | null
	/** متنِ راهنما (مثلاً «۰۷:۴۲ کارکرد») */
	label?: string
	holiday?: boolean
}

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
const LEVEL = ['bg-foreground/[0.07]', 'bg-primary/25', 'bg-primary/45', 'bg-primary/70', 'bg-primary']
const faDate = (d: string) => d.replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c])

/** روزِ هفته از نامِ فارسی (با/بی‌فاصله و نیم‌فاصله) */
export function weekdayOf(name: string): number | null {
	const n = String(name || '').replace(/[\s‌]/g, '').replace(/ي/g, 'ی')
	const i = ['شنبه', 'یکشنبه', 'دوشنبه', 'سهشنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].indexOf(n)
	return i < 0 ? null : i
}

export default function ActivityCalendar({ days, unit, caption, className = '' }: { days: CalendarDay[]; unit: string; caption: string; className?: string }) {
	const { weeks, max } = useMemo(() => {
		const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1))
		const out: (CalendarDay | null)[][] = []
		let week: (CalendarDay | null)[] = Array(7).fill(null)
		let last = -1
		for (const d of sorted) {
			if (d.weekday <= last) { out.push(week); week = Array(7).fill(null) }
			week[d.weekday] = d
			last = d.weekday
		}
		if (week.some(Boolean)) out.push(week)
		return { weeks: out, max: Math.max(0, ...sorted.map((d) => d.value || 0)) }
	}, [days])
	// بازهٔ کوتاه (یک ماه) ← خانه‌های بزرگ‌تر
	const big = weeks.length <= 8
	const cell = big ? 'size-5 sm:size-7' : 'size-[14px] sm:size-4'
	const level = (v: number | null) => (v == null || v <= 0 || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)))
	if (!days.length) return <p className="text-[12.5px] text-muted-foreground">دادهٔ روزانه‌ای برای این بازه نیست.</p>
	return (
		<figure className={`flex flex-col gap-3 ${className}`} dir="rtl">
			<div className="flex gap-2 overflow-x-auto pb-1">
				<div className="grid shrink-0 grid-rows-7 gap-[3px] pt-4 text-[10px] leading-none text-muted-foreground" aria-hidden>
					{WEEKDAYS.map((w) => <span key={w} className={`grid place-items-center ${cell}`}>{w}</span>)}
				</div>
				<div className="flex gap-[3px]" role="list" aria-label={caption}>
					{weeks.map((w, i) => {
						const first = w.find(Boolean)
						return (
							<div key={i} className="flex flex-col gap-[3px]">
								<span className="h-4 whitespace-nowrap text-[10px] leading-4 text-muted-foreground" aria-hidden>{first && (i === 0 || first.date.slice(8) <= '07') ? faDate(first.date.slice(5)) : ''}</span>
								{w.map((d, j) => d ? (
									<span key={j} role="listitem" tabIndex={0}
										title={`${faDate(d.date)}${d.holiday ? ' · تعطیل' : ''} — ${d.label ?? (d.value == null ? 'بدون داده' : d.value.toLocaleString('fa-IR') + ' ' + unit)}`}
										aria-label={`${faDate(d.date)}${d.holiday ? '، تعطیل' : ''}: ${d.label ?? (d.value == null ? 'بدون داده' : d.value.toLocaleString('fa-IR') + ' ' + unit)}`}
										className={`${cell} rounded-[5px] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${LEVEL[level(d.value)]} ${d.holiday ? 'ring-1 ring-inset ring-accent/70' : ''} ${d.value == null ? 'opacity-40' : ''}`} />
								) : <span key={j} className={cell} aria-hidden />)}
							</div>
						)
					})}
				</div>
			</div>
			<figcaption className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
				<span>{caption}</span>
				<span className="flex items-center gap-1" aria-hidden>
					کمتر {LEVEL.map((c) => <span key={c} className={`size-3 rounded-[3px] ${c}`} />)} بیشتر
					<span className="mr-2 size-3 rounded-[3px] ring-1 ring-inset ring-accent/70" /> تعطیل
				</span>
			</figcaption>
		</figure>
	)
}
