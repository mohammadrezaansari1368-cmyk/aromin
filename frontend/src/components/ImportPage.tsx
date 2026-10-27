'use client'

/**
 * مرکزِ ایمپورت — رابطِ React، موتورِ آزموده‌شدهٔ اپِ کامل.
 * فایل‌ها این‌جا خوانده، تشخیص و رنگ‌گذاری می‌شوند؛ «ورود» آن‌ها را به /legacy (iframeِ پنهان، same-origin)
 * می‌فرستد که پیش از ورود بک‌آپِ سرور می‌گیرد، uniImport را اجرا و فوراً در MariaDB ذخیره می‌کند.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { Shell, Big, faNum } from '@/components/ui/kit'
import { useAromin, dataTag, ensureTenant, currentTenant, type ImportLogItem } from '@/lib/data'
import { KINDS, kindOf, detectImportType, type ImportKind } from '@/lib/importTypes'
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import KnowledgeTile from '@/components/KnowledgeTile'
import { canSeeAll } from '@/lib/performance'
import Sortable from '@/components/ui/sortable'
import { CARD } from '@/components/ui/tokens'
import DealImport, { importSummary } from '@/components/ledger/DealImport'
const HarikanStatus = lazy(() => import('@/components/performance/HarikanStatus'))
const IdentityReview = lazy(() => import('@/components/identity/IdentityReview'))
import CallSummaryOptions from '@/components/import/CallSummaryOptions'
import { callOptsError, ingestCallFile, resetCallsCache, type CallDetailItem, type CallOpts } from '@/lib/callsApi'
import { ingestTicketFile } from '@/lib/ticketsApi'

interface QItem {
	id: string
	name: string
	size: number
	sig?: string
	hash?: string
	duplicateContent?: boolean
	buf: ArrayBuffer
	/** فقط «عملکردِ تماس»: جهت و دوره (بدونِ پیش‌فرض) */
	callOpts?: CallOpts
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
	note?: string
	conflicts?: CallDetailItem[]
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
			style={{ background: `color-mix(in srgb, ${k.color} 10%, transparent)`, color: k.color }}>
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
	const [queue, setQueueState] = useState<QItem[]>([])
	const setQueue = useCallback((update: QItem[] | ((q: QItem[]) => QItem[])) => {
		setQueueState(previous => {
			const next = typeof update === 'function' ? update(previous) : update
			const seen = new Set<string>()
			return next.map(item => {
				const duplicateContent = !!item.hash && seen.has(item.hash)
				if (item.hash) seen.add(item.hash)
				return duplicateContent === !!item.duplicateContent ? item : { ...item, duplicateContent }
			})
		})
	}, [])
	const [results, setResults] = useState<Result[] | null>(null)
	const [status, setStatus] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const [bridge, setBridge] = useState<Bridge>('connecting')
	const [over, setOver] = useState(false)
	const sessionRef = useRef(session)
	sessionRef.current = session
	const frame = useRef<HTMLIFrameElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const pending = useRef<{ id: string; resolve: (v: unknown) => void } | null>(null)

	const sendAuth = useCallback(() => {
		if (session?.token) frame.current?.contentWindow?.postMessage({ aromin: 'auth', token: session.token }, location.origin)
	}, [session?.token])
	useEffect(() => { sendAuth() }, [sendAuth])

	const queueRef = useRef<QItem[]>([])
	queueRef.current = queue
	const sigs = useMemo(() => new Set(m.importLog.map((r) => r.sig).filter(Boolean) as string[]), [m.importLog])

	// پل با اپِ کامل
	useEffect(() => {
		const onMsg = (ev: MessageEvent) => {
			if (ev.origin !== location.origin || ev.source !== frame.current?.contentWindow) return
			const d = ev.data
			if (!d || typeof d !== 'object' || Array.isArray(d)) return
			if (d.aromin === 'import-ready' && typeof d.ok === 'boolean') setBridge(d.ok ? 'ready' : 'failed')
			if (d.aromin === 'import-result' && typeof d.ok === 'boolean' && pending.current && d.id === pending.current.id) {
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
			const seen = new Set(queueRef.current.map(q => q.hash).filter(Boolean))
			for (const f of Array.from(files)) {
				if (!/\.(xlsx|xls|csv)$/i.test(f.name) || f.size === 0 || f.size > 25 * 1024 * 1024) {
					items.push({ id: uid(), name: f.name, size: f.size, buf: new ArrayBuffer(0), type: 'unknown', rows: 0, hdr: [], dup: false, error: 'فایل خالی، بیش از ۲۵ مگابایت یا قالب نامعتبر؛ فقط xlsx/xls/csv' })
					continue
				}
				try {
					const buf = await f.arrayBuffer()
					const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
					const d = detectImportType(wb)
					const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('')
					items.push({ id: uid(), name: f.name, size: f.size, buf, type: d.type, rows: d.rows, hdr: d.hdr, sig: d.sig, hash, duplicateContent: seen.has(hash), dup: sigs.has(d.sig) })
					seen.add(hash)
				} catch (e) {
					items.push({ id: uid(), name: f.name, size: f.size, buf: new ArrayBuffer(0), type: 'unknown', rows: 0, hdr: [], dup: false, error: 'خواندن نشد: ' + (e as Error).message })
				}
			}
			setQueue((q) => [...q, ...items])
		},
		[sigs],
	)

	const valid = queue.filter((q) => !q.error && !q.duplicateContent && q.type !== 'unknown')
	// فایلِ معاملات: موتورِ بومیِ ایمپورت با پیش‌نمایشِ سالِ مالیِ ۱۴۰۵ (نه موتورِ قبلی)
	const [dealQ, setDealQ] = useState<QItem[]>([])
	const dealDone = (q: QItem, text: string, ok: boolean) => {
		setDealQ((x) => x.filter((y) => y.id !== q.id))
		setQueue((x) => x.filter((y) => y.id !== q.id))
		setResults((r) => [...(r || []), { name: q.name, type: 'deal', rows: q.rows, dup: q.dup, routed: ok, err: ok ? '' : text }])
		setStatus({ tone: ok ? 'ok' : 'info', text })
		if (ok) reload()
	}

	/** 3.9.68: حضور و غیاب فقط از اپِ هاریکان می‌آید (MCP)؛ فایلِ حضور دیگر وارد نمی‌شود */
	const importAttendance = async (items: QItem[]): Promise<Result[]> =>
		items.map((q) => ({ name: q.name, type: 'attendance' as const, rows: q.rows, dup: false, routed: false, err: 'حضور و غیاب از اپِ هاریکان می‌آید؛ فایلِ حضور دیگر وارد نمی‌شود.' }))
	/** ریز/عملکردِ تماس برای مدیران و مالی علاوه بر موتورِ قبلی به سرور هم می‌رود (WP-C)؛ داشبوردهای فعلی همچنان از موتورِ قبلی‌اند */
	const importCalls = async (items: QItem[]): Promise<Result[]> => {
		const out: Result[] = []
		if (!session || !canSeeAll(session)) return out
		for (const q of items) {
			const kind = q.type as 'calllog' | 'calls'
			try {
				const r = await ingestCallFile(session, kind, q.buf, q.name, q.callOpts)
				const b = r.batch, warn = r.warnings ? [...r.warnings.sums, ...r.warnings.overlaps.map((o) => `دورهٔ هم‌پوشان ${o.from}–${o.to}`)] : []
				const note = r.duplicate ? 'سرور: این فایل قبلاً ثبت شده است (تکراری)'
					: [`سرور: ${faNum(b.inserted)} جدید · ${faNum(b.updated)} به‌روز · ${faNum(b.conflicts)} تعارض`, r.unmapped?.length ? `${faNum(r.unmapped.length)} شناسه نیازمند تأیید نگاشت` : '', ...warn].filter(Boolean).join(' · ')
				out.push({ name: q.name, type: kind, rows: q.rows, dup: r.duplicate, routed: true, err: '', note, conflicts: b.details?.conflicts?.length ? b.details.conflicts : undefined })
			} catch (e) {
				out.push({ name: q.name, type: kind, rows: q.rows, dup: false, routed: false, err: 'سرور: ' + (e as Error).message })
			}
		}
		if (out.some((r) => r.routed)) resetCallsCache()
		return out
	}
	/** تیکتِ جولیو برای مدیران و مالی علاوه بر موتورِ قبلی به جدولِ سروری هم می‌رود (WP-4)؛ کارشناس فقط با نگاشتِ تأییدشده به شخص می‌رسد */
	const importTickets = async (items: QItem[]): Promise<Result[]> => {
		const out: Result[] = []
		if (!session || !canSeeAll(session)) return out
		for (const q of items) {
			try {
				const r = await ingestTicketFile(session, q.buf, q.name)
				const b = r.batch
				const note = r.duplicate ? 'سرور: این فایل قبلاً ثبت شده است (تکراری)'
					: [`سرور: ${faNum(b.inserted)} جدید · ${faNum(b.updated)} به‌روز · ${faNum(b.conflicts)} تعارض`, r.unmapped?.length ? `${faNum(r.unmapped.length)} کارشناس نیازمند تأیید نگاشت` : ''].filter(Boolean).join(' · ')
				out.push({ name: q.name, type: 'ticket', rows: q.rows, dup: r.duplicate, routed: true, err: '', note, conflicts: b.details?.conflicts?.length ? b.details.conflicts : undefined })
			} catch (e) {
				out.push({ name: q.name, type: 'ticket', rows: q.rows, dup: false, routed: false, err: 'سرور: ' + (e as Error).message })
			}
		}
		return out
	}
	const callsBlocked = !!session && canSeeAll(session) && valid.some((q) => q.type === 'calls' && callOptsError(q.callOpts))
	const run = async () => {
		if (callsBlocked) return
		const att = valid.filter((q) => q.type === 'attendance')
		const deals = valid.filter((q) => q.type === 'deal')
		const eng = valid.filter((q) => q.type !== 'attendance' && q.type !== 'deal')
		if (!valid.length) return
		if (deals.length) { setResults(null); setDealQ(deals) }
		if (!eng.length && !att.length) return
		if (!eng.length) {
			const r = await importAttendance(att)
			setResults(r)
			setStatus(r.every((x) => x.routed) ? { tone: 'ok', text: `${faNum(r.length)} فایلِ حضور و غیاب روی سرور ثبت شد.` } : { tone: 'err', text: 'انجام نشد: ' + r.filter((x) => !x.routed).map((x) => x.err).join('، ') })
			setQueue((q) => q.filter((x) => !att.includes(x) || !r.find((y) => y.name === x.name && y.routed)))
			return
		}
		if (bridge !== 'ready' || !frame.current?.contentWindow) return
		const attRes = await importAttendance(att)
		const callRes = await importCalls(eng.filter((q) => q.type === 'calllog' || q.type === 'calls'))
		const ticketRes = await importTickets(eng.filter((q) => q.type === 'ticket'))
		setBusy(true)
		setStatus({ tone: 'info', text: 'بک‌آپ روی سرور، ورودِ داده و ذخیره…' })
		const id = uid()
		const res = (await new Promise<unknown>((resolve) => {
			pending.current = { id, resolve }
			frame.current!.contentWindow!.postMessage(
				{ aromin: 'import', id, token: sessionRef.current?.token, files: eng.map((q) => ({ name: q.name, buf: q.buf })) },
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
		setResults([...(res.results || []), ...attRes, ...callRes, ...ticketRes])
		// a failed server upload keeps its file in the queue for retry, even when the legacy engine succeeded
		const serverFailed = [...attRes, ...callRes, ...ticketRes].filter((x) => !x.routed)
		if (res.ok) {
			setStatus({ tone: serverFailed.length ? 'err' : 'ok', text: `${faNum((res.results || []).length)} فایل وارد و ذخیره شد.` + (attRes.length ? ` ${faNum(attRes.filter((x) => x.routed).length)} فایلِ حضور روی سرور ثبت شد.` : '')
				+ (serverFailed.length ? ` ارسال به سرور برای ${faNum(serverFailed.length)} فایل انجام نشد و در صف ماند: ` + serverFailed.map((x) => x.err).join('، ') : '') })
			setQueue((q) => q.filter((x) => !valid.includes(x) || serverFailed.some((y) => y.name === x.name)))
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

	const deleteHistory = async (entry: ImportLogItem) => {
		if (!session || !isAdmin(session.role) || !window.confirm('این مورد از تاریخچه حذف شود؟ داده‌های واردشده حفظ می‌شوند.')) return
		try {
			const r = await fetch('/api/import-history/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: JSON.stringify({ tenant: currentTenant(), entry }) })
			const result = await r.json()
			if (!r.ok || !result.ok) throw new Error(result.error || 'حذف انجام نشد')
			reload()
		} catch (e) { setStatus({ tone: 'err', text: (e as Error).message }) }
	}

	const bridgeLabel = bridge === 'ready' ? 'موتورِ ایمپورت آماده' : bridge === 'connecting' ? 'اتصال به موتورِ ایمپورت…' : 'موتور در دسترس نیست'
	const bridgeColor = bridge === 'ready' ? 'hsl(var(--success))' : bridge === 'connecting' ? 'hsl(var(--warning))' : 'hsl(var(--error))'

	return (
		<div className="space-y-3">
			<iframe ref={frame} onLoad={sendAuth} src="/legacy?embed=import" title="import-engine" className="hidden" aria-hidden="true" tabIndex={-1} />

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
							<span className="text-[12px] text-muted-foreground">چند فایل با هم · نوعِ هر فایل خودکار تشخیص داده و رنگی می‌شود · حضور و غیاب از اپِ هاریکان می‌آید (فایلِ حضور لازم نیست)</span>
						</button>
						<input ref={input} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
						{session && canSeeAll(session) && <Suspense fallback={null}><HarikanStatus session={session} /></Suspense>}
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
				{/* نگاشتِ هویت (کارت‌های حضور، کاربرانِ جولیو) — فقط مدیران/مالی */}
				{session && canSeeAll(session) && <Card key="identity" className="lg:col-span-3"><Suspense fallback={null}><IdentityReview session={session} /></Suspense></Card>}
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
												<Chip kind={q.type} small /><span className="rounded bg-muted px-2 py-0.5 text-xs" dir="ltr">{q.name.split('.').pop()?.toUpperCase()}</span>
												{q.duplicateContent && <span className="text-xs text-error">فایل تکراری در صف — وارد نمی‌شود</span>}{q.dup && <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10.5px] font-bold text-error">سابقهٔ فایل مشابه</span>}
											</div>
											<div className="mt-1 text-[11.5px] text-muted-foreground">
												{q.error ? <span className="text-error">{q.error}</span> : <>{faNum(q.rows)} ردیف · {kb(q.size)} · مقصد: {k.dest}</>}
											</div>
											{q.type === 'calls' && !q.error && session && canSeeAll(session) && (
												<CallSummaryOptions value={q.callOpts} onChange={(callOpts) => setQueue((x) => x.map((y) => (y.id === q.id ? { ...y, callOpts } : y)))} />
											)}
										</div>
										<button type="button" onClick={() => setQueue((x) => x.filter((y) => y.id !== q.id))} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground" aria-label="حذف از صف">✕</button>
									</li>
								)
							})}
						</ul>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<button
								type="button"
								disabled={!valid.length || (bridge !== 'ready' && valid.some((q) => q.type !== 'attendance' && q.type !== 'deal')) || busy || dealQ.length > 0 || callsBlocked}
								onClick={run}
								className="h-11 rounded-xl bg-gradient-to-l from-primary to-active px-6 text-[14px] font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
								{busy ? 'در حال ورود…' : `ورودِ ${faNum(valid.length)} فایل به سیستم`}
							</button>
							<button type="button" disabled={busy} onClick={() => setQueue([])} className="h-11 rounded-xl px-4 text-[13px] font-bold text-muted-foreground ring-1 ring-border transition hover:bg-muted">پاک‌کردنِ صف</button>
							<span className="text-[11.5px] text-muted-foreground">{callsBlocked ? 'جهت و دورهٔ فایلِ عملکردِ تماس را انتخاب کنید' : 'پیش از ورود، خودکار بک‌آپِ سرور گرفته می‌شود.'}</span>
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
				<div className={`rounded-2xl px-4 py-3 text-[13px] font-bold ring-1 ${status.tone === 'ok' ? 'bg-success/10 text-success ring-success/30' : status.tone === 'err' ? 'bg-error/10 text-error ring-error/30' : 'bg-secondary/10 text-secondary-ink ring-secondary/30'}`}>
					{status.text}
					{results && results.length > 0 && (
						<ul className="mt-2 space-y-1 font-normal">
							{results.map((r, i) => (
								<li key={i} className="flex flex-wrap items-center gap-2 text-[12px]">
									<Chip kind={kindOf(r.type)} small />
									<span dir="ltr">{r.name}</span>
									<span>{faNum(r.rows)} ردیف</span>
									{r.dup && <span className="text-error">🔁 تکراری</span>}
									{r.note && <span className={r.dup ? 'text-error' : 'text-warning'}>{r.note}</span>}
									{!r.routed && <span className="text-error">⚠ {r.err || 'فرستاده نشد'}</span>}
									{r.conflicts && (
										<details className="w-full text-warning"><summary className="cursor-pointer">{faNum(r.conflicts.length)} تعارض (ردیفِ موجود دست‌نخورده ماند)</summary>
											<ul className="mt-1 space-y-0.5" dir="ltr">{r.conflicts.map((c) => <li key={c.key + c.reason}>{c.key} · {c.reason}{c.fields?.length ? ' · ' + c.fields.join(', ') : ''}</li>)}</ul>
										</details>
									)}
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
													{r.routed === false ? <span className="font-bold text-error">ناموفق</span> : r.dup ? <span className="font-bold text-error">🔁 تکراری</span> : <span className="font-bold text-success">✓ جدید</span>}
													{session && isAdmin(session.role) && <button type="button" aria-label={`حذف تاریخچهٔ ${r.name}`} onClick={() => deleteHistory(r)} className="rounded px-2 py-1 text-error focus-visible:ring-2 focus-visible:ring-ring">حذف</button>}
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
