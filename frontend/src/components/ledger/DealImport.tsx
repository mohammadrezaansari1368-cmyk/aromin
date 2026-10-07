'use client'

/**
 * پیش‌نمایش و ثبتِ ایمپورتِ معاملات برای دفترِ سالِ مالیِ ۱۴۰۵ (مشترک بینِ «مرکز ایمپورت» و C1).
 * خواندن در پس‌زمینه ← پیش‌نمایش روی نسخهٔ فعلیِ سرور: معتبر ۱۴۰۵ / سال‌های قبل / تکراری / نامعتبر ← ثبت روی نسخهٔ تازهٔ سرور (بک‌آپِ اجباری).
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchFull, saveState } from '@/lib/forecastStore'
import { flushLedger } from '@/lib/ledgerStore'
import { parseXlsx, type Parsed } from '@/lib/xlsxParse'
import { applyDealImport, monthsLabel, planDealImport, previousYears, TARGET_FY, type Plan, type RowStatus } from '@/engines/deal-import/index.ts'
import { custbookFromDeals } from '@/engines/customer/index.ts'
import { fa, MONTHS } from '@/engines/commission/index.ts'
import { BTN_GHOST, BTN_PRIMARY, CARD } from '@/components/ui/tokens'

export interface ImportDone { dateUpdates: number; valid: number; previous: number; years: Record<string, number>; duplicate: number; conflict: number; invalid: number; repeatN: number; created: number; name: string }
const ST_FA: Record<RowStatus, string> = { conflict: 'تعارض', invalid: 'نامعتبر', duplicate: 'تکراری', previous: 'سال قبل', valid: 'معتبر' }
const ST_ORDER: Record<RowStatus, number> = { conflict: 0, invalid: 1, duplicate: 2, previous: 3, valid: 4 }
const RIAL_KEY = 'aromin.c1.rial'
const readRial = () => { try { return localStorage.getItem(RIAL_KEY) !== '0' } catch { return true } }

const Kpi = ({ n, t, tone }: { n: number; t: string; tone: string }) => (
	<div className="rounded-md bg-muted/50 px-3 py-2.5 ring-1 ring-inset ring-border">
		<div className={`text-[22px] font-extrabold leading-none tabular-nums ${tone}`}>{fa(n)}</div>
		<div className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">{t}</div>
	</div>
)

export default function DealImport({ file, onClose, onDone }: { file: { name: string; buf: ArrayBuffer }; onClose: () => void; onDone: (r: ImportDone) => void }) {
	const [parsed, setParsed] = useState<Parsed | null>(null)
	const [full, setFull] = useState<unknown>(null)
	const [err, setErr] = useState('')
	const [mode, setMode] = useState<'append' | 'replace'>('append')
	const [rial, setRial] = useState(readRial)
	const [busy, setBusy] = useState(false)
	const [showRows, setShowRows] = useState(false)

	useEffect(() => {
		let alive = true
		setParsed(null); setErr('')
		Promise.all([parseXlsx(file.buf), flushLedger().catch(() => undefined).then(() => fetchFull())])
			.then(([p, f]) => { if (!alive) return; setParsed(p); setFull(f) })
			.catch((e) => { if (alive) setErr('خواندن نشد: ' + ((e as Error).message || e)) })
		return () => { alive = false }
	}, [file])

	const plan: Plan | null = useMemo(() => (parsed && full ? planDealImport(parsed.rows, full, { mode, rial, date1904: parsed.date1904, source: file.name, sheet: parsed.sheets[0]?.name }) : null), [parsed, full, mode, rial, file.name])
	const prevY = plan ? previousYears(plan) : []
	const bad = plan ? plan.rows.filter((r) => r.st !== 'valid') : []
	const newNames = plan ? Object.entries(plan.newNames) : []
	const [showReport, setShowReport] = useState(false)
	const sellers = plan ? Object.entries(plan.bySeller).sort((a, b) => b[1].amount - a[1].amount) : []
	const fileMonths = plan ? [...new Set(sellers.flatMap(([, s]) => Object.keys(s.months).map(Number)))].sort((a, b) => a - b) : []

	const commit = async () => {
		if (!parsed || !plan || plan.error || !(plan.total || plan.dateUpdates.length)) return
		setBusy(true); setErr('')
		try {
			try { localStorage.setItem(RIAL_KEY, rial ? '1' : '0') } catch { /* */ }
			const cb = custbookFromDeals(parsed.sheets)
			let res: ReturnType<typeof applyDealImport> | null = null
			await saveState((f) => { res = applyDealImport(f, parsed.rows, { mode, rial, date1904: parsed.date1904, source: file.name, sheet: parsed.sheets[0]?.name, fileName: file.name, sig: parsed.det.sig, custbook: cb }) }, { forceBackup: true, tag: 'پیش از ایمپورتِ معاملاتِ ۱۴۰۵ (نسخهٔ جدید)' })
			const r = res as unknown as ReturnType<typeof applyDealImport>
			onDone({ dateUpdates: r.plan.dateUpdates.length, valid: r.plan.cnt.valid, previous: r.plan.cnt.previous, years: r.plan.years, duplicate: r.plan.cnt.duplicate, conflict: r.plan.cnt.conflict, invalid: r.plan.cnt.invalid, repeatN: r.repeatN, created: r.created, name: file.name })
		} catch (e) {
			const m = (e as Error).message
			setErr(m === 'backup' ? 'بک‌آپِ سرور گرفته نشد؛ برای امنیت چیزی ثبت نشد.' : m === 'empty' ? 'دادهٔ سرور خالی است؛ چیزی ثبت نشد.' : m === 'save' ? 'ذخیره روی سرور انجام نشد.' : m)
		} finally {
			setBusy(false)
		}
	}

	return (
		<section className={`${CARD} p-4 sm:p-5`} dir="rtl" aria-label="پیش‌نمایشِ ایمپورتِ معاملات">
			<header className="mb-3 flex flex-wrap items-center gap-2">
				<h3 className="text-[14px] font-extrabold text-foreground">ایمپورتِ معاملات — سالِ مالیِ {fa(TARGET_FY)}</h3>
				<span className="min-w-0 truncate text-[12px] text-muted-foreground" dir="ltr">{file.name}</span>
			</header>
			{!plan && !err && (
				<div className="flex items-center gap-3 py-4 text-[13px] text-muted-foreground" role="status">
					<span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" aria-hidden />
					در حال خواندنِ فایل در پس‌زمینه…
				</div>
			)}
			{plan?.error && <p className="rounded-md bg-error/10 px-3 py-2 text-[13px] font-bold text-error">{plan.error}</p>}
			{plan && !plan.error && (
				<>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
						<Kpi n={plan.cnt.valid} t={`معتبر ${fa(TARGET_FY)} — ثبت می‌شود`} tone="text-success" />
						<Kpi n={plan.cnt.previous} t="سال‌های قبل — کنار گذاشته می‌شود" tone={plan.cnt.previous ? 'text-warning' : 'text-foreground'} />
						<Kpi n={plan.cnt.duplicate} t="تکراری — رد می‌شود" tone="text-foreground" />
						<Kpi n={plan.cnt.conflict} t="تعارض — تطبیق نمی‌شود، بررسی کنید" tone={plan.cnt.conflict ? 'text-error' : 'text-foreground'} />
						<Kpi n={plan.cnt.invalid} t="نامعتبر" tone={plan.cnt.invalid ? 'text-error' : 'text-foreground'} />
					</div>
					{newNames.length > 0 && (
						<p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-[12.5px] leading-6 text-foreground ring-1 ring-inset ring-warning/30" role="note">
							این نام‌ها در سیستم نیستند و با ثبت، کارشناسِ تازه ساخته می‌شود (به هیچ کارشناسِ موجودی خودکار وصل نمی‌شوند): {newNames.map(([n, c]) => `${n} (${fa(c)})`).join('، ')}. اگر املای دیگرِ یک کارشناسِ موجود است، پیش از ثبت نام را یکسان کنید.
						</p>
					)}
					<p className="mt-2 text-sm" role="status">تاریخ فروش: {plan.saleDateColumn ? `ستون «${plan.saleDateColumn}»` : 'ستون یافت نشد'} · {fa(plan.dateUpdates.length)} تاریخ خالیِ فاکتور موجود تکمیل می‌شود. {plan.missingSaleDates > 0 && `${fa(plan.missingSaleDates)} ردیف تاریخ فروش ندارد و در نمودار روزانه نمایش داده نمی‌شود.`}</p>
                    {prevY.length > 0 && (
						<p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-[12.5px] leading-6 text-foreground ring-1 ring-inset ring-warning/30" role="note">
							<b>{fa(plan.cnt.previous)}</b> ردیف از سال‌های قبل در فایل هست ({prevY.map((y) => `${fa(y)}: ${fa(plan.years[y])}`).join('، ')}) — وارد دفترِ {fa(TARGET_FY)} نمی‌شوند و دادهٔ آن سال‌ها هم تغییر نمی‌کند.
						</p>
					)}
					<p className="mt-2 text-[12px] leading-6 text-muted-foreground">
						سالِ مالی، تاریخِ فروش و ساعت: از سلولِ ستونِ «{plan.fyColumn}» (ستونِ «سال مالی» یا «ورود» اگر باشد استفاده نمی‌شود)
						{Object.keys(plan.monthsInFile).length > 0 && <> · ماه‌های ۱۴۰۵ در فایل: {monthsLabel(plan)}</>}
					</p>
					<div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
						<fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
							<legend className="sr-only">روشِ ثبت</legend>
							<label className="inline-flex items-center gap-2"><input type="radio" name="dimode" value="append" checked={mode === 'append'} onChange={() => setMode('append')} />افزودن (ردیفِ تکراری رد می‌شود)</label>
							<label className="inline-flex items-center gap-2"><input type="radio" name="dimode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />جایگزینیِ فقط ماه‌های فایل</label>
						</fieldset>
						<label className="inline-flex items-center gap-2"><input type="checkbox" checked={rial} onChange={(e) => setRial(e.target.checked)} />مبالغِ فایل ریال است (÷۱۰)</label>
					</div>
					{sellers.length > 0 && (
						<div className="mt-3">
							<button type="button" className="text-[12.5px] font-bold text-primary-ink underline-offset-4 hover:underline" aria-expanded={showReport} onClick={() => setShowReport((v) => !v)}>
								{showReport ? 'بستنِ' : 'دیدنِ'} گزارشِ اعتبارسنجی به تفکیکِ کارشناس و ماه
							</button>
							{showReport && (
								<div className="mt-2 max-h-72 overflow-auto rounded-md ring-1 ring-inset ring-border">
									<table className="w-full text-[12px] tabular-nums" aria-label="گزارشِ اعتبارسنجیِ ایمپورت">
										<thead className="sticky top-0 bg-muted text-muted-foreground">
											<tr>
												<th className="px-2 py-1.5 text-right font-bold">کارشناس</th>
												{fileMonths.map((m) => <th key={m} className="px-2 py-1.5 text-right font-bold">{MONTHS[m - 1]}</th>)}
												<th className="px-2 py-1.5 text-right font-bold">ثبت</th><th className="px-2 py-1.5 text-right font-bold">مبلغ</th>
												<th className="px-2 py-1.5 text-right font-bold">سال قبل</th><th className="px-2 py-1.5 text-right font-bold">تکراری</th>
												<th className="px-2 py-1.5 text-right font-bold">تعارض</th><th className="px-2 py-1.5 text-right font-bold">نامعتبر</th>
											</tr>
										</thead>
										<tbody>
											{sellers.map(([rep, s]) => (
												<tr key={rep} className="border-t border-border">
													<td className="px-2 py-1 font-bold">{rep}{plan.newNames[rep] ? ' (تازه)' : ''}</td>
													{fileMonths.map((m) => <td key={m} className="px-2 py-1">{s.months[m] ? fa(s.months[m].n) : '—'}</td>)}
													<td className="px-2 py-1">{fa(s.valid)}</td><td className="px-2 py-1">{fa(s.amount)}</td>
													<td className="px-2 py-1">{fa(s.previous)}</td><td className="px-2 py-1">{fa(s.duplicate)}</td>
													<td className={`px-2 py-1 ${s.conflict ? 'font-bold text-error' : ''}`}>{fa(s.conflict)}</td><td className={`px-2 py-1 ${s.invalid ? 'text-error' : ''}`}>{fa(s.invalid)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					)}
					{bad.length > 0 && (
						<div className="mt-3">
							<button type="button" className="text-[12.5px] font-bold text-primary-ink underline-offset-4 hover:underline" aria-expanded={showRows} onClick={() => setShowRows((v) => !v)}>
								{showRows ? 'بستنِ' : 'دیدنِ'} {fa(bad.length)} ردیفِ کنارگذاشته
							</button>
							{showRows && (
								<div className="mt-2 max-h-56 overflow-auto rounded-md ring-1 ring-inset ring-border">
									<table className="w-full text-[12px]">
										<thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="px-2 py-1.5 text-right font-bold">ردیف</th><th className="px-2 py-1.5 text-right font-bold">شماره</th><th className="px-2 py-1.5 text-right font-bold">وضعیت</th><th className="px-2 py-1.5 text-right font-bold">مشتری</th><th className="px-2 py-1.5 text-right font-bold">علت</th></tr></thead>
										<tbody>
											{[...bad].sort((a, b) => ST_ORDER[a.st] - ST_ORDER[b.st] || a.i - b.i).slice(0, 300).map((r) => (
												<tr key={r.i} className="border-t border-border"><td className="px-2 py-1 tabular-nums">{fa(r.i)}</td><td className="px-2 py-1">{r.no || '—'}</td><td className={`whitespace-nowrap px-2 py-1 ${r.st === 'conflict' || r.st === 'invalid' ? 'font-bold text-error' : 'text-muted-foreground'}`}>{ST_FA[r.st]}</td><td className="max-w-[220px] truncate px-2 py-1">{r.name}</td><td className="px-2 py-1 text-muted-foreground">{r.why}</td></tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					)}
				</>
			)}
			{err && <p className="mt-3 rounded-md bg-error/10 px-3 py-2 text-[13px] font-bold text-error" role="alert">{err}</p>}
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<button type="button" className={BTN_PRIMARY} disabled={busy || !plan || !!plan.error || !(plan.total || plan.dateUpdates.length)} onClick={commit}>
					{busy ? 'بک‌آپ و ثبت…' : plan && (plan.total || plan.dateUpdates.length) ? `ثبت ${fa(plan.total)} ردیف و تکمیل ${fa(plan.dateUpdates.length)} تاریخ فروش` : 'ردیفِ معتبری برای ثبت نیست'}
				</button>
				<button type="button" className={BTN_GHOST} disabled={busy} onClick={onClose}>انصراف</button>
				<span className="text-[11.5px] text-muted-foreground">پیش از ثبت، بک‌آپِ سرور گرفته می‌شود.</span>
			</div>
		</section>
	)
}

/** متنِ اعلانِ پس از ایمپورت (برای toast/وضعیت) */
export function importSummary(r: ImportDone) {
	const prev = Object.keys(r.years).filter((y) => y !== TARGET_FY).sort()
	return `${fa(r.valid)} ردیفِ ۱۴۰۵ ثبت شد · ${fa(r.dateUpdates)} تاریخ فروش تکمیل شد` + (r.repeatN ? ` (${fa(r.repeatN)} تکرار خرید)` : '') +
		(r.previous ? ` · ${fa(r.previous)} ردیف از سال‌های قبل (${prev.map((y) => fa(y)).join('، ')}) کنار گذاشته شد` : '') +
		(r.duplicate ? ` · ${fa(r.duplicate)} تکراری` : '') + (r.conflict ? ` · ${fa(r.conflict)} تعارض (ثبت نشد)` : '') + (r.invalid ? ` · ${fa(r.invalid)} نامعتبر` : '')
}
