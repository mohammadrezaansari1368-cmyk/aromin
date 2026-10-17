/**
 * تنظیمات ← دستیار فروش ← «اعلانِ لید در تلگرام و بله»: لینکِ اختصاصیِ /start هر کارشناس و مدیرِ فروش در هر دو ربات + وضعیتِ پیوند.
 * هر نفر یک بار هر دو لینک را باز و Start را می‌زند؛ از آن پس هر لیدِ تازه جداگانه در بله و تلگرام برایش می‌آید.
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN } from '@/components/ui/tokens'

type Person = { id: string; name: string; role: string; telegramLink: string; baleLink: string; startCommand: string; telegramLinked: boolean; baleLinked: boolean }
type Data = { telegramBot: string; baleBot: string; people: Person[]; configured: { telegram: boolean; bale: boolean } }
type Ch = { ok: boolean; error?: string }

const ROLE: Record<string, string> = { sales: 'کارشناس', salesmgr: 'مدیرِ فروش' }

export default function LeadAlertLinks({ session }: { session: Session }) {
	const [d, setD] = useState<Data | null>(null)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const call = useCallback(async (method: string, path: string, body?: unknown) => {
		const r = await fetch(`/api/sales-agent${path}?tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر از سرور (' + r.status + ')' }))
		if (!r.ok || (j.ok === false && !('bale' in j))) throw new Error(j.error || 'خطا ' + r.status)
		return j
	}, [session])
	const load = useCallback(async () => { try { setD(await call('GET', '/alert-links')) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } }, [call])
	useEffect(() => { load() }, [load])
	const test = async () => {
		setBusy(true); setMsg(null)
		try {
			const r = await call('POST', '/alert-test', {})
			const f = (c: Ch) => (c.ok ? 'ارسال شد' : 'ناموفق: ' + (c.error || ''))
			setMsg({ ok: !!r.ok, text: `پیامِ آزمایشی به ${r.person}: بله — ${f(r.bale)} · تلگرام — ${f(r.telegram)}` })
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
	}
	const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => setMsg({ ok: true, text: 'کپی شد.' }), () => undefined) }
	const mark = (ok: boolean) => (ok ? <span className="text-success">✓ وصل</span> : <span className="text-muted-foreground">✗ هنوز Start نشده</span>)

	return (
		<div className="grid gap-2 rounded-md p-3 ring-1 ring-border" aria-label="اعلانِ لید در تلگرام و بله">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-[12.5px] font-extrabold">اعلانِ لید در تلگرام و بله</p>
				<div className="flex gap-2">
					<button type="button" onClick={load} className={`${BTN} ring-1 ring-border hover:bg-muted`}>به‌روزرسانی</button>
					<button type="button" disabled={busy || !d} onClick={test} className={`${BTN} ring-1 ring-border hover:bg-muted`}>پیامِ آزمایشی به مدیرِ فروش</button>
				</div>
			</div>
			<p className="text-[11px] leading-5 text-muted-foreground">هر کارشناس و مدیرِ فروش یک بار هر دو لینکِ خودش را باز کند و Start بزند (یا متنِ /start را در ربات بفرستد). هر لیدِ تازه جدا در بله و تلگرام برای کارشناسِ مسئول و مدیر می‌آید؛ وضعیتِ هر ارسال در «لیدها» دیده می‌شود.</p>
			{d && (!d.configured.telegram || !d.configured.bale) && <p className="text-[11px] text-error">توکنِ ربات تنظیم نشده: {[!d.configured.bale && 'بله', !d.configured.telegram && 'تلگرام'].filter(Boolean).join('، ')}</p>}
			{msg && <p role="status" className={`text-[11.5px] font-bold ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
			{d && (
				<div className="overflow-x-auto">
					<table className="w-full text-[11.5px]">
						<thead><tr className="text-muted-foreground"><th className="px-2 py-1 text-start">نام</th><th className="px-2 py-1 text-start">تلگرام (@{d.telegramBot})</th><th className="px-2 py-1 text-start">بله (@{d.baleBot})</th><th className="px-2 py-1 text-start">دستورِ دستی</th></tr></thead>
						<tbody>
							{d.people.map((p) => (
								<tr key={p.id} className="border-t border-border">
									<td className="px-2 py-1.5 font-bold">{p.name} <span className="font-normal text-muted-foreground">({ROLE[p.role] || p.role})</span></td>
									<td className="px-2 py-1.5"><a href={p.telegramLink} target="_blank" rel="noreferrer" className="text-primary underline" dir="ltr">باز کردن</a> · <button type="button" className="underline" onClick={() => copy(p.telegramLink)}>کپی</button> · {mark(p.telegramLinked)}</td>
									<td className="px-2 py-1.5"><a href={p.baleLink} target="_blank" rel="noreferrer" className="text-primary underline" dir="ltr">باز کردن</a> · <button type="button" className="underline" onClick={() => copy(p.baleLink)}>کپی</button> · {mark(p.baleLinked)}</td>
									<td className="px-2 py-1.5"><bdi dir="ltr" className="font-mono">{p.startCommand}</bdi></td>
								</tr>
							))}
							{!d.people.length && <tr><td colSpan={4} className="px-2 py-2 text-muted-foreground">کارشناس یا مدیرِ فروشِ فعالی ثبت نشده است.</td></tr>}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
