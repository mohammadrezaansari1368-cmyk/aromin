'use client'

/**
 * دکمهٔ «بازگرداندن تصویب» (فقط مدیر) — همتای «تصویب اسناد»، برای همهٔ اسنادِ تصویب‌شده/بستهٔ همین دوره و کارشناس:
 * ۱ تأییدِ فهرست · ۲ دلیل · ۳ کدِ ۶رقمیِ تلگرام (به چتِ ادمینِ ربات) ← بازگرداندن به پیش‌نویس.
 * سرور نقش، کد (فقط برای همین مجموعه)، بک‌آپ و ممیزیِ هر سند را خودش انجام می‌دهد.
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { fa, sep } from '@/engines/commission/index.ts'
import { BTN, BTN_GHOST, BTN_PRIMARY, INPUT } from '@/components/ui/tokens'

export default function BulkReopen({ count, scope, totals, confirmationKey, onCode, onReopen }: {
	count: number; scope: string; totals: { official: number; unofficial: number }; confirmationKey: string
	onCode: (reason: string) => Promise<unknown>; onReopen: (reason: string, code: string) => Promise<{ reopened?: number }>
}) {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button type="button" onClick={() => setOpen(true)} disabled={!count} aria-haspopup="dialog"
				title={count ? `بازگرداندنِ تصویبِ ${fa(count)} سندِ این دوره` : 'سندِ تصویب‌شده‌ای در این دوره نیست'}
				className="group relative inline-flex shrink-0 flex-col items-center rounded-full bg-[hsl(var(--text)/0.88)] px-1 pb-[7px] pt-1 outline-none transition focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45">
				<span className="relative inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 text-[15px] font-black tracking-tight text-bg shadow-[inset_0_-6px_0_hsl(var(--text)/0.28),inset_0_2px_0_hsl(var(--bg)/0.35)] transition-transform duration-75 group-active:translate-y-[5px] group-active:shadow-[inset_0_-1px_0_hsl(var(--text)/0.28)] group-disabled:translate-y-0">
					<svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
					بازگرداندن تصویب
				</span>
			</button>
			{open && <Wizard count={count} scope={scope} totals={totals} confirmationKey={confirmationKey} onCode={onCode} onReopen={onReopen} onClose={() => setOpen(false)} />}
		</>
	)
}

function Wizard({ count, scope, totals, confirmationKey, onCode, onReopen, onClose }: {
	count: number; scope: string; totals: { official: number; unofficial: number }; confirmationKey: string
	onCode: (reason: string) => Promise<unknown>; onReopen: (reason: string, code: string) => Promise<{ reopened?: number }>; onClose: () => void
}) {
	const [step, setStep] = useState(0)
	const [confirmedKey, setConfirmedKey] = useState('')
	const confirmed = confirmedKey === confirmationKey
	const [reason, setReason] = useState('')
	const [sent, setSent] = useState(false)
	const [code, setCode] = useState('')
	const [busy, setBusy] = useState(false)
	const [err, setErr] = useState('')
	const [done, setDone] = useState<number | null>(null)
	const box = useRef<HTMLDivElement>(null)
	const okReason = reason.trim().length >= 3
	const valid = [confirmed, okReason]
	useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()) }, [step, sent, done])
	useEffect(() => { const prev = document.activeElement as HTMLElement | null; return () => prev?.focus() }, [])
	const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
	const send = () => act(async () => { await onCode(reason.trim()); setSent(true); setCode('') })
	const submit = () => act(async () => { const r = await onReopen(reason.trim(), code.trim()); setDone(r.reopened ?? count) })
	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose() }
		else if (e.key === 'Tab') {
			const f = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || [])]
			if (!f.length) return
			const i = f.indexOf(document.activeElement as HTMLElement)
			if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() }
		}
	}
	const summary = `آیا ${fa(count)} سندِ تصویب‌شده به مبلغ رسمی ${sep(totals.official)} تومان و مبلغ غیررسمی ${sep(totals.unofficial)} تومان برای ${scope} به پیش‌نویس برگردد؟`
	return (
		<div className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--overlay)/0.55)] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
			<motion.div ref={box} role="dialog" aria-modal="true" aria-labelledby="br-title" dir="rtl" onKeyDown={onKey}
				initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }}
				className="w-full max-w-[460px] rounded-lg bg-card p-5 text-card-foreground ring-1 ring-inset ring-border shadow-card">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 id="br-title" className="text-[16px] font-extrabold">بازگرداندنِ تصویبِ اسناد</h2>
						<p className="mt-0.5 text-[12px] text-muted-foreground">{fa(count)} سند · {scope}</p>
					</div>
					<button type="button" onClick={onClose} disabled={busy} aria-label="بستن" className={`${BTN} size-9 px-0 text-muted-foreground hover:bg-muted`}>✕</button>
				</div>
				{done === null ? (
					<>
						<div className="mt-4 flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i === step ? 'bg-secondary' : i < step ? 'bg-secondary/45' : 'bg-muted'}`} />)}</div>
						<div className="mt-5 min-h-[140px]">
							{step === 0 && (
								<label htmlFor="br-ok" className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 ${confirmed ? 'border-secondary/40 bg-secondary/[0.06]' : 'border-border hover:bg-muted/60'}`}>
									<input id="br-ok" data-autofocus type="checkbox" className="size-5 shrink-0" checked={confirmed} onChange={(e) => setConfirmedKey(e.target.checked ? confirmationKey : '')} />
									<span className="text-[14px] font-bold leading-7">{summary}</span>
								</label>
							)}
							{step === 1 && (
								<>
									<label htmlFor="br-reason" className="mb-2 block text-[15px] font-extrabold">دلیلِ بازگرداندن</label>
									<input id="br-reason" data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} className={`${INPUT} min-h-12 text-[14px]`} placeholder="مثلاً اصلاحِ مبلغِ پورسانت" maxLength={300}
										onKeyDown={(e) => { if (e.key === 'Enter' && okReason) { e.preventDefault(); setStep(2) } }} />
									<p className="mt-2 text-[12px] text-muted-foreground">در تاریخچهٔ هر سند ثبت می‌شود.</p>
								</>
							)}
							{step === 2 && (!sent ? (
								<>
									<p className="mb-3 text-[14px] font-bold leading-7">برای تأیید، یک کدِ ۶رقمی به ربات تلگرامِ آرومین فرستاده می‌شود.</p>
									<button type="button" data-autofocus className={`${BTN_PRIMARY} min-h-11`} disabled={busy} onClick={send}>{busy ? 'در حالِ ارسال…' : 'ارسالِ کد به تلگرام'}</button>
								</>
							) : (
								<form onSubmit={(e) => { e.preventDefault(); if (code.trim()) submit() }}>
									<label htmlFor="br-code" className="mb-2 block text-[13px] font-bold">کدِ تلگرام (اعتبار ۵ دقیقه)</label>
									<div className="flex flex-wrap items-center gap-2">
										<input id="br-code" data-autofocus className={`${INPUT} min-h-12 w-40 text-left text-[18px] font-bold tracking-[0.3em]`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
											value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d۰-۹]/g, ''))} />
										<button type="button" className={BTN_GHOST} disabled={busy} onClick={send}>ارسالِ دوباره</button>
									</div>
									<button type="submit" className={`${BTN_PRIMARY} mt-4 min-h-11 px-5 text-[14px]`} disabled={busy || code.trim().length < 6}>{busy ? 'در حالِ بازگرداندن…' : `بازگرداندنِ همهٔ اسناد (${fa(count)})`}</button>
								</form>
							))}
						</div>
						{err && <p role="alert" className="mt-3 text-[12.5px] font-bold text-error">{err}</p>}
						<div className="mt-5 flex items-center justify-between gap-2">
							<button type="button" className={BTN_GHOST} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>قبلی</button>
							{step < 2 && <button type="button" className={BTN_PRIMARY} onClick={() => setStep((s) => s + 1)} disabled={!valid[step]}>بعدی</button>}
						</div>
					</>
				) : (
					<div className="mt-6 flex flex-col items-center gap-3 text-center" role="status">
						<span className="grid size-12 place-items-center rounded-full bg-secondary/15 text-secondary-ink"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12l4 4 10-10" /></svg></span>
						<p className="text-[15px] font-extrabold">{fa(done)} سند به پیش‌نویس برگشت</p>
						<button type="button" data-autofocus className={BTN_PRIMARY} onClick={onClose}>بستن</button>
					</div>
				)}
			</motion.div>
		</div>
	)
}
