'use client'

/**
 * مرکزِ ایمپورت — رابطِ React، موتورِ آزموده‌شدهٔ اپِ کامل.
 * فایل‌ها این‌جا خوانده، تشخیص و رنگ‌گذاری می‌شوند؛ «ورود» آن‌ها را به /legacy (iframeِ پنهان، same-origin)
 * می‌فرستد که پیش از ورود بک‌آپِ سرور می‌گیرد، uniImport را اجرا و فوراً در MariaDB ذخیره می‌کند.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { Shell, Big, faNum } from '@/components/ui/kit'
import { useAromin, dataTag, ensureTenant, type ImportLogItem } from '@/lib/data'
import { KINDS, kindOf, detectImportType, type ImportKind } from '@/lib/importTypes'
import { isAdmin, type Session } from '@/lib/auth'
import KnowledgeTile from '@/components/KnowledgeTile'
import { canSeeAll, ingestAttendanceFile } from '@/lib/performance'
import Sortable from '@/components/ui/sortable'
import { CARD } from '@/components/ui/tokens'
import DealImport, { importSummary } from '@/components/ledger/DealImport'
const AttendanceStatus = lazy(() => import('@/components/performance/PerformancePage').then((m) => ({ default: m.AttendanceStatus })))

interface QItem {
	id: string
	name: string
	size: number
	buf: ArrayBuffer
	type: ImportKind
	rows: number
	hdr: string[]
	dup: boolean
	error?: string
}
interface Result {
	name: string
	type: string
	rows: number
	dup: boolean
	routed: boolean
	err: string
}
type Bridge = 'connecting' | 'ready' | 'failed'

const uid = () => Math.random().toString(36).slice(2, 10)
const faDate = (ts: number) => {
	try {
		return new Intl.DateTimeFormat('fa-IR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
	} catch {
		return '—'
	}
}
const kb = (n: number) => (n > 1048576 ? faNum(Math.round(n / 104857.6) / 10) + ' MB' : faNum(Math.round(n / 1024)) + ' KB')

function Chip({ kind, small = false }: { kind: ImportKind; small?: boolean }) {
	const k = KINDS[kind]
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full font-bold ${small ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11.5px]'}`}
			style={{ background: k.color + '1A', color: k.color }}>
			<span className="size-1.5 rounded-full" style={{ background: k.color }} />
			{k.label}
		</span>
	)
}

/** ستون‌گیریِ کاشی (lg:col-span-2) روی قابِ کشیدنی می‌نشیند؛ کارت ارتفاعِ ردیف را پر می‌کند */
const spanOf = (c: ReactElement) => (((c.props as { className?: string }).className || '').match(/lg:col-span-\d/)?.[0] || '') + ' flex flex-col [&>*:last-child]:flex-1'

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
	return (
		<div className={`overflow-hidden ${CARD} ${className}`}>
			{children}
		</div>
	)
}

ensureTenant()

export default function ImportPage({ session }: { session?: Session } = {}) {
	const { m, reload } = useAromin()
	const [queue, setQueue] = useState<QItem[]>([])
	const [results, setResults] = useState<Result[] | null>(null)
	const [status, setStatus] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const [bridge, setBridge] = useState<Bridge>('connecting')
	const [over, setOver] = useState(false)
	const frame = useRef<HTMLIFrameElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const pending = useRef<{ id: string; resolve: (v: unknown) => void } | null>(null)

	const sigs = useMemo(() => new Set(m.importLog.map((r) => r.sig).filter(Boolean) as string[]), [m.importLog])

	// پل با اپِ کامل
	useEffect(() => {
		const onMsg = (ev: MessageEvent) => {
			if (ev.origin !== location.origin) return
			const d = ev.data || {}
			if (d.aromin === 'import-ready') setBridge(d.ok ? 'ready' : 'failed')
			if (d.aromin === 'import-result' && pending.current && d.id === pending.current.id) {
				pending.current.resolve(d)
				pending.current = null
			}
		}
		window.addEventListener('message', onMsg)
		const t = window.setTimeout(() => setBridge((b) => (b === 'connecting' ? 'failed' : b)), 90000)
		return () => {
			window.removeEventListener('message', onMsg)
			window.clearTimeout(t)
		}
	}, [])

	const addFiles = useCallback(
		async (files: FileList | File[]) => {
			setResults(null)
			setStatus(null)
			const items: QItem[] = []
			for (const f of Array.from(files)) {
				if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
					items.push({ id: uid(), name: f.name, size: f.size, buf: new ArrayBuffer(0), type: 'unknown', rows: 0, hdr: [], dup: false, error: 'فقط اکسل (xlsx/xls/csv)' })
					continue
				}
				try {
					const buf = await f.arrayBuffer()
					const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
					const d = detectImportType(wb)
					items.push({ id: uid(), name: f.name, size: f.size, buf, type: d.type, rows: d.rows, hdr: d.hdr, dup: sigs.has(d.sig) })
				} catch (e) {
					items.push({ id: uid(), name: f.name, size: f.size, buf: new ArrayBuffer(0), type: 'unknown', rows: 0, hdr: [], dup: false, error: 'خواندن نشد: ' + (e as Error).message })
				}
			}
			setQueue((q) => [...q, ...items])
		},
		[sigs],
	)

	const valid = queue.filter((q) => !q.error && q.type !== 'unknown')
	// فایلِ معاملات: موتورِ بومیِ ایمپورت با پیش‌نمایشِ سالِ مالیِ ۱۴۰۵ (نه موتورِ قبلی)
	const [dealQ, setDealQ] = useState<QItem[]>([])
	const dealDone = (q: QItem, text: string, ok: boolean) => {
		setDealQ((x) => x.filter((y) => y.id !== q.id))
		setQueue((x) => x.filter((y) => y.id !== q.id))
		setResults((r) => [...(r || []), { name: q.name, type: 'deal', rows: q.rows, dup: q.dup, routed: ok, err: ok ? '' : text }])
		setStatus({ tone: ok ? 'ok' : 'info', text })
		if (ok) reload()
	}

	/** فایلِ حضور و غیاب مستقیم به «عملکرد» می‌رود (موتورِ قبلی آن را نمی‌شناسد)؛ فقط مدیران و مالی */
	const importAttendance = async (items: QItem[]): Promise<Result[]> => {
		const out: Result[] = []
		for (const q of items) {
			try {
				if (!session || !canSeeAll(session)) throw new Error('فقط مدیران و مالی فایلِ حضور را وارد می‌کنند')
				await ingestAttendanceFile(session, q.buf, q.name, 'import-center')   // آداپتورِ واحدِ حضور در lib/performance.ts
				out.push({ name: q.name, type: 'attendance', rows: q.rows, dup: false, routed: true, err: '' })
			} catch (e) {
				out.push({ name: q.name, type: 'attendance', rows: q.rows, dup: false, routed: false, err: (e as Error).message })
			}
		}
		return out
	}
	const run = async () => {
		const att = valid.filter((q) => q.type === 'attendance')
		const deals = valid.filter((q) => q.type === 'deal')
		const eng = valid.filter((q) => q.type !== 'attendance' && q.type !== 'deal')
		if (!valid.length) return
		if (deals.length) { setResults(null); setDealQ(deals) }
		if (!eng.length && !att.length) return
		if (!eng.length) {
			const r = await importAttendance(att)
			setResults(r)
			setStatus(r.every((x) => x.routed) ? { tone: 'ok', text: `${faNum(r.length)} فایلِ حضور و غیاب برای «عملکرد» ثبت شد (در همین مرورگر).` } : { tone: 'err', text: 'انجام نشد: ' + r.filter((x) => !x.routed).map((x) => x.err).join('، ') })
			setQueue((q) => q.filter((x) => !att.includes(x) || !r.find((y) => y.name === x.name && y.routed)))
			return
		}
		if (bridge !== 'ready' || !frame.current?.contentWindow) return
		const attRes = await importAttendance(att)
		setBusy(true)
		setStatus({ tone: 'info', text: 'بک‌آپ روی سرور، ورودِ داده و ذخیره…' })
		const id = uid()
		const res = (await new Promise<unknown>((resolve) => {
			pending.current = { id, resolve }
			frame.current!.contentWindow!.postMessage(
				{ aromin: 'import', id, files: eng.map((q) => ({ name: q.name, buf: q.buf })) },
				location.origin,
			)
			window.setTimeout(() => {
				if (pending.current?.id === id) {
					pending.current = null
					resolve({ ok: false, error: 'پاسخی از موتور نیامد (۲ دقیقه)' })
				}
			}, 120000)
		})) as { ok: boolean; saved?: boolean; error?: string; results?: Result[] }
		setBusy(false)
		setResults([...(res.results || []), ...attRes])
		if (res.ok) {
			setStatus({ tone: 'ok', text: `${faNum((res.results || []).length)} فایل وارد و در MariaDB ذخیره شد.` + (attRes.length ? ` ${faNum(attRes.filter((x) => x.routed).length)} فایلِ حضور برای «عملکرد» ثبت شد.` : '') })
			setQueue((q) => q.filter((x) => !valid.includes(x)))
			reload()
		} else setStatus({ tone: 'err', text: 'انجام نشد: ' + (res.error || 'نامشخص') })
	}

	const onDrop = (e: DragEvent) => {
		e.preventDefault()
		setOver(false)
		if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
	}

	// تاریخچه به تفکیکِ نوع
	const byKind = useMemo(() => {
		const g: Partial<Record<ImportKind, ImportLogItem[]>> = {}
		for (const r of m.importLog) (g[kindOf(r.type)] ||= []).push(r)
		return Object.entries(g) as [ImportKind, ImportLogItem[]][]
	}, [m.importLog])

	const bridgeLabel = bridge === 'ready' ? 'موتورِ ایمپورت آماده' : bridge === 'connecting' ? 'اتصال به موتورِ ایمپورت…' : 'موتور در دسترس نیست'
	const bridgeColor = bridge === 'ready' ? 'hsl(var(--success))' : bridge === 'connecting' ? 'hsl(var(--warning))' : 'hsl(var(--error))'

	return (
		<div className="space-y-3">
			<iframe ref={frame} src="/legacy?embed=import" title="import-engine" className="hidden" aria-hidden="true" tabIndex={-1} />

			<Sortable id="import.top" className="grid grid-cols-1 gap-3 lg:grid-cols-3" itemClass={spanOf}>
				{/* ناحیهٔ رها کردن */}
				<Card className="lg:col-span-2">
					<Shell title="ورودِ فایل" meta={<span className="inline-flex items-center gap-1.5" style={{ color: bridgeColor }}><span className="size-2 rounded-full" style={{ background: bridgeColor }} />{bridgeLabel}</span>}>
						<button
							type="button"
							onClick={() => input.current?.click()}
							onDragOver={(e) => { e.preventDefault(); setOver(true) }}
							onDragLeave={() => setOver(false)}
							onDrop={onDrop}
							className={`flex min-h-[150px] w-full flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40'}`}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-9 text-primary-ink"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
							<span className="text-[14px] font-bold text-foreground">اکسل‌ها را این‌جا بکش یا کلیک کن</span>
							<span className="text-[12px] text-muted-foreground">چند فایل با هم · نوعِ هر فایل خودکار تشخیص داده و رنگی می‌شود · خروجیِ دستگاهِ حضور (هر نفر یک شیت) هم همین‌جا</span>
						</button>
						<input ref={input} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
						{session && canSeeAll(session) && <Suspense fallback={null}><AttendanceStatus session={session} /></Suspense>}
					</Shell>
				</Card>

				{/* آمار */}
				<Card>
					<Shell title="تاریخچهٔ ایمپورت" meta={dataTag(m)}>
						<Big unit="فایل">{faNum(m.importLog.length)}</Big>
						<div className="mt-auto flex flex-wrap gap-1.5">
							{byKind.map(([k, items]) => (
								<span key={k} className="inline-flex items-center gap-1"><Chip kind={k} small /><span className="text-[11px] text-muted-foreground">{faNum(items.length)}</span></span>
							))}
							{!byKind.length && <span className="text-[12px] text-muted-foreground">هنوز فایلی وارد نشده.</span>}
						</div>
					</Shell>
				</Card>
			</Sortable>

			{/* صف */}
			{queue.length > 0 && (
				<Card>
					<Shell title="آمادهٔ ورود" meta={`${faNum(valid.length)} از ${faNum(queue.length)} قابلِ ورود`}>
						<ul className="space-y-2">
							{queue.map((q) => {
								const k = KINDS[q.type]
								return (
									<li key={q.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-border" style={{ borderInlineStart: `4px solid ${k.color}` }}>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="truncate text-[13px] font-bold text-foreground" dir="ltr">{q.name}</span>
												<Chip kind={q.type} small />
												{q.dup && <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10.5px] font-bold text-error">🔁 قبلاً وارد شده</span>}
											</div>
											<div className="mt-1 text-[11.5px] text-muted-foreground">
												{q.error ? <span className="text-error">{q.error}</span> : <>{faNum(q.rows)} ردیف · {kb(q.size)} · مقصد: {k.dest}</>}
											</div>
										</div>
										<button type="button" onClick={() => setQueue((x) => x.filter((y) => y.id !== q.id))} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground" aria-label="حذف از صف">✕</button>
									</li>
								)
							})}
						</ul>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<button
								type="button"
								disabled={!valid.length || (bridge !== 'ready' && valid.some((q) => q.type !== 'attendance' && q.type !== 'deal')) || busy || dealQ.length > 0}
								onClick={run}
								className="h-11 rounded-xl bg-gradient-to-l from-primary to-active px-6 text-[14px] font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
								{busy ? 'در حال ورود…' : `ورودِ ${faNum(valid.length)} فایل به سیستم`}
							</button>
							<button type="button" disabled={busy} onClick={() => setQueue([])} className="h-11 rounded-xl px-4 text-[13px] font-bold text-muted-foreground ring-1 ring-border transition hover:bg-muted">پاک‌کردنِ صف</button>
							<span className="text-[11.5px] text-muted-foreground">پیش از ورود، خودکار بک‌آپِ سرور گرفته می‌شود.</span>
						</div>
					</Shell>
				</Card>
			)}

			{dealQ[0] && (
				<DealImport key={dealQ[0].id} file={dealQ[0]}
					onClose={() => dealDone(dealQ[0], 'ایمپورتِ «' + dealQ[0].name + '» لغو شد.', false)}
					onDone={(r) => dealDone(dealQ[0], importSummary(r), true)} />
			)}
			{status && (
				<div className={`rounded-2xl px-4 py-3 text-[13px] font-bold ring-1 ${status.tone === 'ok' ? 'bg-success/10 text-success ring-success/30' : status.tone === 'err' ? 'bg-error/10 text-error ring-error/30' : 'bg-sky-50 text-sky-700 ring-sky-200'}`}>
					{status.text}
					{results && results.length > 0 && (
						<ul className="mt-2 space-y-1 font-normal">
							{results.map((r, i) => (
								<li key={i} className="flex flex-wrap items-center gap-2 text-[12px]">
									<Chip kind={kindOf(r.type)} small />
									<span dir="ltr">{r.name}</span>
									<span>{faNum(r.rows)} ردیف</span>
									{r.dup && <span className="text-error">🔁 تکراری</span>}
									{!r.routed && <span className="text-error">⚠ {r.err || 'فرستاده نشد'}</span>}
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			<Sortable id="import.bottom" className="grid grid-cols-1 gap-3 lg:grid-cols-3" itemClass={spanOf}>
				{/* راهنمای رنگ‌ها */}
				<Card>
					<Shell title="رنگِ هر نوع فایل">
						<ul className="space-y-2">
							{(Object.keys(KINDS) as ImportKind[]).filter((k) => k !== 'unknown').map((k) => (
								<li key={k} className="flex items-start gap-2">
									<span className="mt-1 size-3 shrink-0 rounded-[4px]" style={{ background: KINDS[k].color }} />
									<div className="min-w-0">
										<div className="text-[12.5px] font-bold" style={{ color: KINDS[k].color }}>{KINDS[k].label}</div>
										<div className="text-[11px] leading-5 text-muted-foreground">{KINDS[k].src} ← {KINDS[k].dest}</div>
									</div>
								</li>
							))}
						</ul>
					</Shell>
				</Card>

				{/* تاریخچه */}
				<Card className="lg:col-span-2">
					<Shell title="فایل‌های واردشده" meta="به تفکیکِ نوع">
						{byKind.length === 0 && <p className="text-[12px] text-muted-foreground">هنوز فایلی وارد نشده.</p>}
						<div className="space-y-2">
							{byKind.map(([k, items]) => (
								<details key={k} open className="rounded-xl ring-1 ring-border" style={{ borderInlineStart: `4px solid ${KINDS[k].color}` }}>
									<summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2">
										<Chip kind={k} />
										<span className="text-[11.5px] text-muted-foreground">{faNum(items.length)} فایل</span>
									</summary>
									<ul className="px-3 pb-2">
										{items.slice(0, 15).map((r, i) => (
											<li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-1.5 text-[12px]">
												<span className="min-w-0 truncate" dir="ltr">{r.name}</span>
												<span className="flex items-center gap-2 text-muted-foreground">
													{faNum(r.rows)} ردیف · {faDate(r.ts)}
													{r.dup ? <span className="font-bold text-error">🔁 تکراری</span> : <span className="font-bold text-success">✓ جدید</span>}
													{r.routed === false && <span className="text-error">⚠</span>}
												</span>
											</li>
										))}
									</ul>
								</details>
							))}
						</div>
					</Shell>
				</Card>
				{/* Dynamic Knowledge Base — فقط مدیر (سرور هم نقش را بررسی می‌کند) */}
				{session && isAdmin(session.role) && <Card className="lg:col-span-3"><KnowledgeTile session={session} /></Card>}
			</Sortable>


			<p className="px-1 text-[11.5px] leading-6 text-muted-foreground">
				⚠ اگر اپِ کامل (/legacy) در تبِ دیگری باز است، قبل از ایمپورت آن را ببند؛ وگرنه ذخیرهٔ بعدیِ آن تب ممکن است روی این ایمپورت بنویسد.
			</p>
		</div>
	)
}
