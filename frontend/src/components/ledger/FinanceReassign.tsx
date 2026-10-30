/**
 * «انتقالِ سهمِ مالی» (فقط مدیر، 3.9.67): سهمِ «تأیید مالی و صحتِ داده»ِ یک ماه را از یک کارشناسِ مالی به دیگری منتقل می‌کند —
 * حتی برای اسنادِ تصویب‌شده (فقط finBy عوض می‌شود؛ رکوردِ تصویب و مبالغ دست نمی‌خورد). اول تعداد را نشان می‌دهد؛ دلیل لازم است.
 * سرور نقش، بک‌آپ و ممیزیِ هر سند را خودش انجام می‌دهد.
 */
import { useState } from 'react'
import { fa, MONTHS } from '@/engines/commission/index.ts'
import { BTN_GHOST, BTN_PRIMARY, INPUT } from '@/components/ui/tokens'

type Call = (body: { month: number; from: string; to: string; dry?: boolean; reason?: string }) => Promise<{ count?: number; moved?: number }>

export default function FinanceReassign({ names, fromNames, month, onRun }: { names: string[]; fromNames?: string[]; month: number | null; onRun: Call }) {
	const [open, setOpen] = useState(false)
	const [m, setM] = useState<number>(month ?? 5)
	const [from, setFrom] = useState('')
	const [to, setTo] = useState('')
	const [reason, setReason] = useState('')
	const [count, setCount] = useState<number | null>(null)
	const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const reset = () => { setCount(null); setMsg(null) }
	const act = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn() } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setBusy(false) } }
	const preview = () => act(async () => { const r = await onRun({ month: m, from, to, dry: true }); setCount(r.count ?? 0) })
	const run = () => act(async () => { const r = await onRun({ month: m, from, to, reason: reason.trim() }); setMsg({ ok: true, t: `${fa(r.moved ?? 0)} سند به نامِ «${to}» شد.` }); setCount(null) })
	const sel = `${INPUT} py-2`
	return (
		<>
			<button type="button" className={BTN_GHOST} onClick={() => { setOpen(true); setM(month ?? 5) }} aria-haspopup="dialog">انتقالِ سهمِ مالی</button>
			{open && (
				<div className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--overlay)/0.55)] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
					<div role="dialog" aria-modal="true" aria-label="انتقالِ سهمِ مالی" dir="rtl" className="grid w-full max-w-md gap-3 rounded-lg bg-card p-5 shadow-card">
						<b className="text-[15px]">انتقالِ سهمِ مالیِ یک ماه</b>
						<p className="text-[12px] text-muted-foreground">فقط نامِ «تأیید مالی و صحتِ داده» عوض می‌شود (پاداشِ مالی به نامِ شخصِ جدید)؛ رکوردِ تصویب، مبالغ و تاریخچه می‌ماند.</p>
						<label className="grid gap-1 text-[12.5px]">ماه<select className={sel} value={m} onChange={(e) => { setM(+e.target.value); reset() }}>{MONTHS.map((t, i) => <option key={t} value={i}>{t}</option>)}</select></label>
						<label className="grid gap-1 text-[12.5px]">از<select className={sel} value={from} onChange={(e) => { setFrom(e.target.value); reset() }}><option value="">—</option>{(fromNames || names).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
						<label className="grid gap-1 text-[12.5px]">به<select className={sel} value={to} onChange={(e) => { setTo(e.target.value); reset() }}><option value="">—</option>{names.filter((n) => n !== from).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
						{count === null ? (
							<button type="button" className={BTN_PRIMARY} disabled={busy || !from || !to} onClick={preview}>نمایشِ تعداد</button>
						) : (
							<>
								<p className="text-[13px]" data-testid="reassign-count">{fa(count)} سندِ {MONTHS[m]} به نامِ «{from}» است{count ? ` و به «${to}» منتقل می‌شود.` : '.'}</p>
								{count > 0 && <>
									<label className="grid gap-1 text-[12.5px]">دلیل<input className={sel} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: تأییدهای شهریور را نورا انجام داده" /></label>
									<button type="button" className={BTN_PRIMARY} disabled={busy || reason.trim().length < 3} onClick={run}>انتقالِ {fa(count)} سند</button>
								</>}
							</>
						)}
						{msg && <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.t}</p>}
						<button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setOpen(false)}>بستن</button>
					</div>
				</div>
			)}
		</>
	)
}
