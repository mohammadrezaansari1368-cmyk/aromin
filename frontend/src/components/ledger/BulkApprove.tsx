'use client'

/**
 * دکمهٔ «تصویب اسناد» (فقط کارشناسِ مالی و مدیر) + پنجرهٔ مرحله‌به‌مرحله:
 * ۱ مقدار پورسانت نقد · ۲ مقدار پورسانت معلق · ۳ تأییدِ صحت · ۴ تاریخ ثبت سند (شمسی) · ۵ ثبت در سیستمِ مالی · ← تصویبِ همهٔ اسنادِ دوره با یک دکمه.
 * سرور دوباره نقش و فرم را می‌سنجد؛ سندهای تصویب‌شده فقط‌خواندنی می‌شوند.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { fa, faGroup, rawDigits, sep } from '@/engines/commission/index.ts'
import { parseJ, todayJ } from '@/lib/jalali'
import type { ApprovalInput } from '@/lib/ledgerStore'
import { BTN, BTN_GHOST, BTN_PRIMARY, INPUT } from '@/components/ui/tokens'

const amountOk = (v: string) => !/[^\d۰-۹٬,\s]/.test(v) && /^\d{1,15}$/.test(rawDigits(v))
const longJ = (iso: string) => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00')) } catch { return '' } }

export default function BulkApprove({ count, scope, totals, confirmationKey, suggest, onApprove }: {
	confirmationKey: string; count: number; scope: string; totals: { official: number; unofficial: number }; suggest: { cash: number; pending: number }
	onApprove: (v: ApprovalInput) => Promise<{ approved: number }>
}) {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button type="button" onClick={() => setOpen(true)} disabled={!count} aria-haspopup="dialog"
				title={count ? `تصویبِ ${fa(count)} سندِ این دوره` : 'سندِ قابلِ تصویبی در این دوره نیست'}
				className="group relative inline-flex shrink-0 flex-col items-center rounded-full bg-[hsl(var(--text)/0.88)] px-1 pb-[7px] pt-1 outline-none transition focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45">
				<span className="relative inline-flex min-h-11 items-center gap-2 rounded-full bg-error px-6 text-[15px] font-black tracking-tight text-bg shadow-[inset_0_-6px_0_hsl(var(--text)/0.28),inset_0_2px_0_hsl(var(--bg)/0.35)] transition-transform duration-75 group-active:translate-y-[5px] group-active:shadow-[inset_0_-1px_0_hsl(var(--text)/0.28)] group-disabled:translate-y-0">
					تصویب اسناد
				</span>
			</button>
			{open && <Wizard confirmationKey={confirmationKey} count={count} scope={scope} totals={totals} suggest={suggest} onApprove={onApprove} onClose={() => setOpen(false)} />}
		</>
	)
}

function Wizard({ count, scope, totals, confirmationKey, suggest, onApprove, onClose }: { confirmationKey: string; count: number; scope: string; totals: { official: number; unofficial: number }; suggest: { cash: number; pending: number }; onApprove: (v: ApprovalInput) => Promise<{ approved: number }>; onClose: () => void }) {
	const [step, setStep] = useState(0)
	const [confirmedKey, setConfirmedKey] = useState('')
	const confirmed = confirmedKey === confirmationKey
	const setConfirmed = (value: boolean) => setConfirmedKey(value ? confirmationKey : '')
	const [cash, setCash] = useState(() => faGroup(Math.round(suggest.cash)))
	const [pending, setPending] = useState(() => faGroup(Math.round(suggest.pending)))
	const [c1, setC1] = useState(false)
	const [date, setDate] = useState(() => fa(todayJ()))
	const [c2, setC2] = useState(false)
	const [busy, setBusy] = useState(false)
	const [err, setErr] = useState('')
	const [done, setDone] = useState<number | null>(null)
	const box = useRef<HTMLDivElement>(null)
	const dj = parseJ(date)
	const valid = [confirmed, amountOk(cash), amountOk(pending), c1, !!dj, c2]
	const N = valid.length
	const okAll = valid.every(Boolean)
	const go = (d: number) => setStep((s) => Math.max(0, Math.min(N, s + d)))
	const next = () => { if (step < N && valid[step]) go(1) }
	// فوکوس روی ورودیِ هر مرحله؛ Tab داخلِ پنجره می‌ماند؛ Esc می‌بندد
	useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()) }, [step, done])
	useEffect(() => { const prev = document.activeElement as HTMLElement | null; return () => prev?.focus() }, [])
	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose() }
		else if (e.key === 'Enter' && step < N && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); next() }
		else if (e.key === 'Tab') {
			const f = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || [])]
			if (!f.length) return
			const i = f.indexOf(document.activeElement as HTMLElement)
			if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() }
		}
	}
	const submit = async () => {
		if (!okAll || !dj) return
		setBusy(true); setErr('')
		try { const r = await onApprove({ cash: rawDigits(cash), pending: rawDigits(pending), regDateJ: dj.j, confirmAccuracy: c1, confirmRegistered: c2 }); setDone(r.approved) }
		catch (e) { setErr((e as Error).message) }
		finally { setBusy(false) }
	}
	const money = (id: string, label: string, v: string, set: (x: string) => void, hint: number) => (
		<Q title={label}>
			<div className="flex items-center gap-2">
				<input id={id} data-autofocus value={v} onChange={(e) => set(faGroup(e.target.value))} dir="ltr" inputMode="numeric" autoComplete="off" aria-label={label} aria-invalid={!amountOk(v)} aria-describedby={id + '-h'}
					className={`${INPUT} min-h-12 text-left text-[18px] font-bold tabular-nums`} />
				<span className="shrink-0 text-[12px] text-muted-foreground">تومان</span>
			</div>
			<p id={id + '-h'} className={`mt-2 text-[12px] ${amountOk(v) ? 'text-muted-foreground' : 'font-bold text-error'}`} role={amountOk(v) ? undefined : 'alert'}>
				{amountOk(v) ? `پیشنهادِ سیستم برای این دوره: ${sep(hint)} تومان` : 'عدد وارد کن (صفر هم مجاز است).'}
			</p>
		</Q>
	)
	const confirm = (id: string, label: string, v: boolean, set: (x: boolean) => void) => (
		<Q title="تأیید">
			<label htmlFor={id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${v ? 'border-primary/40 bg-primary/[0.06]' : 'border-border hover:bg-muted/60'}`}>
				<input id={id} data-autofocus type="checkbox" className="size-5 shrink-0" checked={v} onChange={(e) => set(e.target.checked)} />
				<span className="text-[14px] font-bold leading-7 text-foreground">{label}</span>
			</label>
		</Q>
	)
	const summary = `آیا ${fa(count)} ردیف به مبلغ رسمی ${sep(totals.official)} تومان و مبلغ غیررسمی ${sep(totals.unofficial)} تومان برای ${scope} را تأیید می‌کنید؟`
	const steps: ReactNode[] = [
        confirm('ba-scope', summary, confirmed, setConfirmed),
		money('ba-cash', 'مقدار پورسانت نقد', cash, setCash, suggest.cash),
		money('ba-pend', 'مقدار پورسانت معلق', pending, setPending, suggest.pending),
		confirm('ba-c1', 'با علم و آگاهی کامل صحت اطلاعات را تأیید می‌کنم', c1, setC1),
		<Q key="d" title="تاریخ ثبت سند">
			<div className="flex items-center gap-2">
				<input id="ba-date" data-autofocus value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" inputMode="numeric" aria-label="تاریخ ثبت سند" aria-invalid={!dj} aria-describedby="ba-date-h" className={`${INPUT} min-h-12 text-left text-[18px] font-bold tabular-nums`} />
				<button type="button" onClick={() => setDate(fa(todayJ()))} className={`${BTN_GHOST} min-h-12`}>امروز</button>
			</div>
			<p id="ba-date-h" role={dj ? undefined : 'alert'} className={`mt-2 text-[12px] ${dj ? 'text-muted-foreground' : 'font-bold text-error'}`}>{dj ? longJ(dj.iso) : 'تاریخِ شمسیِ معتبر، مثلِ ۱۴۰۵/۰۷/۰۹'}</p>
		</Q>,
		confirm('ba-c2', 'سندها را در سیستم مالی در این تاریخ ثبت کردم', c2, setC2),
	]
	return (
		<div className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--overlay)/0.55)] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
			<motion.div ref={box} role="dialog" aria-modal="true" aria-labelledby="ba-title" dir="rtl" onKeyDown={onKey}
				initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }}
				className="w-full max-w-[460px] rounded-lg bg-card p-5 text-card-foreground ring-1 ring-inset ring-border shadow-card">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 id="ba-title" className="text-[16px] font-extrabold">تصویبِ اسناد</h2>
						<p className="mt-0.5 text-[12px] text-muted-foreground">{fa(count)} سند · {scope}</p>
					</div>
					<button type="button" onClick={onClose} disabled={busy} aria-label="بستن" className={`${BTN} size-9 px-0 text-muted-foreground hover:bg-muted`}>✕</button>
				</div>
				{done === null ? (
					<>
						<div className="mt-4">
							<div className="flex items-center justify-between text-[12px] font-bold text-muted-foreground">
								<span>{step < N ? `مرحلهٔ ${fa(step + 1)} از ${fa(N)}` : 'مرور و تصویب'}</span>
								<span className="tabular-nums">{fa(valid.filter(Boolean).length)}/{fa(N)}</span>
							</div>
							<div className="mt-1.5 flex gap-1" aria-hidden>
								{valid.map((v, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i === step ? 'bg-primary' : v ? 'bg-primary/45' : 'bg-muted'}`} />)}
							</div>
						</div>
						<div className="mt-5 min-h-[150px]">
							{step < N ? steps[step] : (
								<Q title="مرور">
                                    <p className="mb-3 text-sm font-bold" data-approval-summary>{summary}</p>
                                    {!confirmed && <button type="button" className={BTN_GHOST} onClick={() => setStep(0)}>اطلاعات تغییر کرده؛ تأیید دوبارهٔ ردیف‌ها</button>}
									<dl className="divide-y divide-border rounded-lg border border-border text-[13px]">
										{[['مقدار پورسانت نقد', sep(+rawDigits(cash) || 0) + ' تومان'], ['مقدار پورسانت معلق', sep(+rawDigits(pending) || 0) + ' تومان'], ['تاریخ ثبت سند', dj ? fa(dj.j) : '—'], ['صحتِ اطلاعات', c1 ? 'تأیید شد' : '—'], ['ثبت در سیستمِ مالی', c2 ? 'تأیید شد' : '—']].map(([k, v], i) => (
											<div key={k} className="flex items-center justify-between gap-3 px-3 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="flex items-center gap-2 font-bold tabular-nums">{v}<button type="button" onClick={() => setStep(i < 2 ? i + 1 : i === 2 ? 4 : i === 3 ? 3 : 5)} className="text-[11.5px] font-bold text-primary-ink underline-offset-4 hover:underline">ویرایش</button></dd></div>
										))}
									</dl>
									<p className="mt-3 text-[12px] text-muted-foreground">پس از تصویب، این {fa(count)} سند فقط‌خواندنی می‌شوند و فقط با دسترسیِ مدیر (با دلیل) باز می‌شوند.</p>
								</Q>
							)}
						</div>
						{err && <p role="alert" className="mt-3 text-[12.5px] font-bold text-error">{err}</p>}
						<div className="mt-5 flex items-center justify-between gap-2">
							<button type="button" className={BTN_GHOST} onClick={() => go(-1)} disabled={step === 0 || busy}>قبلی</button>
							{step < N
								? <button type="button" className={BTN_PRIMARY} onClick={next} disabled={!valid[step]}>بعدی</button>
								: <button type="button" data-autofocus className={`${BTN_PRIMARY} min-h-11 px-5 text-[14px]`} onClick={submit} disabled={!okAll || busy}>{busy ? 'در حالِ تصویب…' : `تصویب همهٔ اسناد (${fa(count)})`}</button>}
						</div>
					</>
				) : (
					<div className="mt-6 flex flex-col items-center gap-3 text-center" role="status">
						<span className="grid size-12 place-items-center rounded-full bg-success/15 text-success"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12l4 4 10-10" /></svg></span>
						<p className="text-[15px] font-extrabold">{fa(done)} سند تصویب و قفل شد</p>
						<button type="button" data-autofocus className={BTN_PRIMARY} onClick={onClose}>بستن</button>
					</div>
				)}
			</motion.div>
		</div>
	)
}

function Q({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section>
			<h3 className="mb-3 text-[15px] font-extrabold text-foreground">{title}</h3>
			{children}
		</section>
	)
}
