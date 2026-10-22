/**
 * 3.9.66: گیرنده‌هایی که با شمارهٔ موبایل ثبت شده‌اند — ربات با شماره پیام نمی‌دهد؛ هر نفر یک‌بار لینکِ «/start» را در بله/تلگرام
 * لمس می‌کند و از آن پس اعلان‌ها به همان گفت‌وگو می‌رسد. اینجا وضعیتِ اتصال و لینکِ هر نفر (فقط مدیر؛ بر اساسِ تنظیماتِ ذخیره‌شده).
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_GHOST } from '@/components/ui/tokens'

type Row = { phone: string; name: string; baleLinked: boolean; telegramLinked: boolean; baleLink: string; telegramLink: string; startCommand: string }

export default function RecipientLinks({ session, version }: { session: Session; version: number }) {
	const [rows, setRows] = useState<Row[] | null>(null)
	const [note, setNote] = useState('')
	const load = useCallback(async () => {
		try {
			const r = await fetch('/api/agent/recipient-links?tenant=' + encodeURIComponent(currentTenant()), { headers: authHeaders(session), cache: 'no-store' })
			const j = await r.json()
			setRows(r.ok && j.ok ? j.recipients : [])
		} catch { setRows([]) }
	}, [session])
	useEffect(() => { load() }, [load, version])
	if (!rows || rows.length === 0) return null
	const copy = (t: string, what: string) => { navigator.clipboard?.writeText(t).catch(() => undefined); setNote(what + ' کپی شد؛ برای همان شخص بفرستید تا یک‌بار لمس کند.') }
	return (
		<div className="grid gap-1.5 rounded-md border border-border p-2.5 sm:col-span-2" data-testid="recipient-links">
			<b className="text-[12.5px]">گیرنده‌های با شمارهٔ موبایل</b>
			<p className="text-[11.5px] text-muted-foreground">ربات با شماره پیام نمی‌دهد: هر نفر فقط یک‌بار لینکِ خودش را در بله (یا تلگرام) باز کند و «شروع» را بزند.</p>
			{rows.map((x) => (
				<div key={x.phone} className="flex flex-wrap items-center gap-2 text-[12.5px]">
					<bdi dir="ltr">{x.phone}</bdi>{x.name && <span className="text-muted-foreground">({x.name})</span>}
					<span className={x.baleLinked ? 'text-success' : 'text-warning'}>بله: {x.baleLinked ? 'وصل ✓' : 'وصل نشده'}</span>
					{!x.baleLinked && <button type="button" className={BTN_GHOST} onClick={() => copy(x.baleLink, 'لینکِ بله')}>کپی لینکِ بله</button>}
					<span className={x.telegramLinked ? 'text-success' : 'text-muted-foreground'}>تلگرام: {x.telegramLinked ? 'وصل ✓' : '—'}</span>
				</div>
			))}
			<div className="flex flex-wrap items-center gap-2"><button type="button" className={BTN_GHOST} onClick={load}>به‌روزرسانیِ وضعیت</button>{note && <span className="text-[12px] text-success">{note}</span>}</div>
		</div>
	)
}
