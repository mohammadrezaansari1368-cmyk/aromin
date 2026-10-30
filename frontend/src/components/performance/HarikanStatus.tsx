/**
 * 3.9.68: «حضور و غیاب از هاریکان» — جای کادرِ وضعیتِ فایلِ حضور در «مرکز ایمپورت» (فقط مدیران و مالی).
 * حضور فقط از اپِ هاریکان (MCP، save_attendance_export) می‌آید؛ فایلِ حضور دیگر پذیرفته نمی‌شود.
 * نشان می‌دهد: آخرین خروجیِ روزانه/ماهانه، تعدادِ روزهای ذخیره‌شده، کدهایی که هنوز به کارمندی وصل نشده‌اند، و بایگانیِ حضورِ فایلی.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@/lib/auth'
import { call, canSeeAll, qs } from '@/lib/attendanceApi'

type Status = { ok: true; lastDay: { key: string; people: number; at: string } | null; lastMonth: { key: string; people: number; at: string } | null
	days: number; unmatched: string[]; archive: { at: string; moved: Record<string, number> } | null }
const fa = (n: number) => n.toLocaleString('fa-IR')

export default function HarikanStatus({ session }: { session: Session }) {
	const [st, setSt] = useState<Status | null>(null)
	const [err, setErr] = useState('')
	const all = canSeeAll(session)
	useEffect(() => {
		if (!all) return
		call<Status>(session, 'GET', '/api/performance/harikan?' + qs({})).then(setSt, (e) => setErr((e as Error).message))
	}, [session, all])
	if (!all) return null
	if (!st) return err ? <p role="status" className="mt-3 text-[12px] font-bold text-error">{err}</p> : null
	return (
		<section dir="rtl" className="mt-3 rounded-xl bg-muted/45 p-4 text-[12.5px] leading-6 ring-1 ring-border/80" data-testid="harikan-status">
			<b className="text-[13px]">حضور و غیاب از هاریکان</b>
			<p className="text-[12px] text-muted-foreground">حضور فقط از اپِ هاریکان می‌آید؛ فایلِ حضور و تنظیماتِ محاسبه دیگر لازم نیست.</p>
			<dl className="mt-2 grid gap-1">
				<div className="flex justify-between gap-3"><dt className="text-muted-foreground">آخرین خروجیِ روزانه</dt><dd>{st.lastDay ? <bdi dir="ltr">{st.lastDay.key}</bdi> : 'هنوز نرسیده'}</dd></div>
				<div className="flex justify-between gap-3"><dt className="text-muted-foreground">آخرین خروجیِ ماهانه</dt><dd>{st.lastMonth ? <bdi dir="ltr">{st.lastMonth.key}</bdi> : 'هنوز نرسیده'}</dd></div>
				<div className="flex justify-between gap-3"><dt className="text-muted-foreground">روزهای حضورِ ذخیره‌شده</dt><dd>{fa(st.days)}</dd></div>
			</dl>
			{st.unmatched.length > 0 && <p className="mt-2 text-[12px] text-warning">{fa(st.unmatched.length)} کدِ پرسنلی هنوز به کارمندی وصل نشده (پایینِ همین صفحه، «نگاشتِ هویت»): <bdi dir="ltr">{st.unmatched.slice(0, 12).join('، ')}</bdi></p>}
			{st.archive && <p className="mt-2 text-[11.5px] text-muted-foreground">حضورِ قبلیِ فایلی بایگانی شد ({fa(st.archive.moved.days || 0)} روز)؛ پاک نشده و قابلِ بازگردانی است.</p>}
		</section>
	)
}
