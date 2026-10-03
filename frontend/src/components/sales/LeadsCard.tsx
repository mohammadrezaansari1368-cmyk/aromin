/**
 * گزارش‌ها ← «لیدهای سایت»: فهرست، وضعیت، ارجاعِ دستیِ مدیر (با لاگ)، وضعیتِ هر اعلان، گزارش‌های روزانهٔ اکسل.
 * فایل‌ها فقط با ورودِ معتبر دانلود می‌شوند (بدونِ لینکِ عمومی).
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_GHOST, CARD, CARD_PAD, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Lead = { id: number; name: string; phone: string; city?: string; source: string; source_url?: string; product_interest?: string; summary?: string; status: string; assigned_to?: string; created_at: string; assigned_at?: string }
type Note = { lead_id: number; kind: string; status: string; attempts: number; last_error?: string }
type Report = { id: number; created_at: string; lead_count: number }
const ST: Record<string, string> = { new: 'جدید', assigned: 'ارجاع‌شده', contacted: 'تماس گرفته شد', qualified: 'واجد شرایط', won: 'موفق', lost: 'ناموفق' }
const KIND: Record<string, string> = { rep: 'کارشناس', manager: 'مدیر', customer: 'مشتری' }
const NOTE: Record<string, string> = { sent: 'text-success', failed: 'text-error', pending: 'text-warning', sending: 'text-warning' }
const inCls = `${INPUT} min-h-8 px-2 text-[12px]`

export default function LeadsCard({ session }: { session: Session }) {
	const [d, setD] = useState<{ leads: Lead[]; notifications: Note[]; reports: Report[]; reps: { id: string; name: string }[] } | null>(null)
	const [err, setErr] = useState('')
	const [busy, setBusy] = useState(false)
	const api = useCallback(async (method: string, path: string, body?: unknown) => {
		const r = await fetch(`/api/leads${path}?tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
		if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
		return j
	}, [session])
	const load = useCallback(async () => { try { setD(await api('GET', '')); setErr('') } catch (e) { setErr((e as Error).message) } }, [api])
	useEffect(() => { load() }, [load])
	const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
	const download = (r: Report) => act(async () => {
		const res = await fetch(`/api/leads/reports/${r.id}?tenant=${encodeURIComponent(currentTenant())}`, { headers: authHeaders(session) })
		if (!res.ok) throw new Error('دانلود نشد (' + res.status + ')')
		const url = URL.createObjectURL(await res.blob())
		const a = document.createElement('a'); a.href = url; a.download = `گزارش-لید-${r.id}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
	})
	if (err && !d) return <section dir="rtl" className={`mb-4 ${CARD} ${CARD_PAD} text-[12.5px] text-muted-foreground`}><b className="text-foreground">لیدهای سایت: </b>{err}</section>
	if (!d) return null
	const notesOf = (id: number) => d.notifications.filter((n) => n.lead_id === id)
	return (
		<section dir="rtl" aria-labelledby="leads-title" className={`mb-4 flex flex-col gap-3 ${CARD} ${CARD_PAD}`}>
			<header className="flex flex-wrap items-center justify-between gap-2">
				<h3 id="leads-title" className={CARD_TITLE}>لیدهای سایت <span className="font-normal text-muted-foreground">({d.leads.length.toLocaleString('fa-IR')})</span></h3>
				<div className="flex gap-2">
					<button type="button" disabled={busy} onClick={load} className={`${BTN_GHOST} min-h-8 px-3 text-[12px]`}>تازه‌سازی</button>
					<button type="button" disabled={busy} onClick={() => act(() => api('POST', '/report-now'))} className={`${BTN_GHOST} min-h-8 px-3 text-[12px]`}>گزارشِ همین حالا</button>
				</div>
			</header>
			{err && <p role="alert" className="text-[12px] font-bold text-error">{err}</p>}
			{d.leads.length === 0 ? <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">هنوز لیدی ثبت نشده است.</p> : (
				<div className="overflow-x-auto rounded-md ring-1 ring-border">
					<table className="w-full border-collapse text-[12px]">
						<thead><tr className="bg-muted/60 text-right text-[11.5px] text-muted-foreground">{['نام', 'شماره', 'شهر / محصول', 'منبع', 'وضعیت', 'کارشناس', 'اعلان‌ها', 'ثبت'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}</tr></thead>
						<tbody>
							{d.leads.map((l) => (
								<tr key={l.id} className="border-t border-border/80 align-top hover:bg-muted/30">
									<td className="px-3 py-2 font-bold" title={l.summary || ''}>{l.name}</td>
									<td className="whitespace-nowrap px-3 py-2 tabular-nums" dir="ltr">{l.phone}</td>
									<td className="px-3 py-2">{l.city || '—'}{l.product_interest && <div className="text-muted-foreground">{l.product_interest}</div>}{l.source_url && <a href={l.source_url} target="_blank" rel="noreferrer noopener" className="text-[11px] text-primary-ink underline">صفحه</a>}</td>
									<td className="px-3 py-2">{l.source}</td>
									<td className="px-3 py-2"><select aria-label={'وضعیتِ ' + l.name} className={inCls} value={l.status} disabled={busy} onChange={(e) => act(() => api('POST', `/${l.id}/status`, { status: e.target.value }))}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
									<td className="px-3 py-2">{isAdmin(session.role) ? (
										<select aria-label={'ارجاعِ ' + l.name} className={inCls} value={d.reps.find((r) => r.name === l.assigned_to)?.id || ''} disabled={busy} onChange={(e) => e.target.value && act(() => api('POST', `/${l.id}/assign`, { repId: e.target.value }))}>
											<option value="">{l.assigned_to || '— بدونِ کارشناس —'}</option>
											{d.reps.filter((r) => r.name !== l.assigned_to).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
										</select>) : (l.assigned_to || '—')}</td>
									<td className="px-3 py-2">{notesOf(l.id).map((n, i) => <div key={i} className={NOTE[n.status] || ''} title={n.last_error || ''}>{KIND[n.kind] || n.kind}: {n.status === 'sent' ? 'ارسال شد' : n.status === 'failed' ? 'ناموفق' : 'در صف'}{n.attempts > 1 ? ` (${n.attempts.toLocaleString('fa-IR')} تلاش)` : ''}</div>)}</td>
									<td className="whitespace-nowrap px-3 py-2 tabular-nums">{l.created_at}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{d.reports.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 text-[12px]">
					<b>گزارش‌های روزانه:</b>
					{d.reports.map((r) => <button key={r.id} type="button" disabled={busy} onClick={() => download(r)} className={`${BTN_GHOST} min-h-8 rounded-full px-3 text-[12px]`}>{r.created_at} · {r.lead_count.toLocaleString('fa-IR')} لید</button>)}
				</div>
			)}
		</section>
	)
}
