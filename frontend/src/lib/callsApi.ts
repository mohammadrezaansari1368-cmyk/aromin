/**
 * تماس‌ها روی سرور (WP-C) — فقط لایهٔ API، خواندنِ فایل و کشِ حافظه.
 *
 * ریزِ تماس (calllog) و عملکردِ تماس (calls) در مرورگر به ردیفِ خام تبدیل و بدون تغییر به /api/performance/calls/* فرستاده می‌شوند.
 * نسبت‌دادن به شخص فقط روی سرور و فقط از نگاشتِ تأییدشده (جولیو/داخلی) است؛ هیچ شخصی ساخته نمی‌شود.
 * مسیرِ موتورِ قبلی برای داشبوردهای فعلی دست‌نخورده می‌ماند (تا WP-3).
 */
import * as XLSX from 'xlsx'
import type { Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { parseJ } from '@/lib/jalali'
import { call, qs, sha256Hex } from '@/lib/attendanceApi'

type Row = Record<string, unknown>
export type CallKind = 'calllog' | 'calls'
export type CallDirection = 'in' | 'out'
export type CallPeriod = { month: string } | { from: string; to: string }
export interface CallOpts { direction?: CallDirection; period?: CallPeriod }

export interface CallDetailItem { key: string; reason: string; fields?: string[]; rows?: number[] }
export interface CallBatch {
	id: number; kind: CallKind; fileName: string; sha256: string; source: 'import-center'; uploadedBy: string; createdAt: string
	direction: CallDirection | null; periodFrom: string | null; periodTo: string | null; rows: number
	inserted: number; updated: number; unchanged: number; conflicts: number
	skipped: { row: number; reason: string }[]; details: { conflicts?: CallDetailItem[]; updates?: CallDetailItem[] }
}
export interface CallUnmapped { kind: 'julio' | 'ext'; key: string; rawName: string; status: string }
export interface CallPostResult {
	ok: true; duplicate: boolean; batch: CallBatch; unmapped?: CallUnmapped[]
	warnings?: { overlaps: { from: string; to: string }[]; sums: string[] }
}
export interface DayStat {
	date: string | null; in: number; inAnswered: number; inMissed: number; out: number; outAnswered: number; outUnanswered: number
	internal: number; answered: number; missed: number; talkSec: number; totalSec: number; afterHours: number
}
export interface QueueStat { ext: string; date: string; in: number; inAnswered: number; inMissed: number; talkSec: number; totalSec: number; afterHours: number }
export interface CallDaily {
	ok: true; scope: 'organization' | 'self'; period: { from: string; to: string }; settings: { workStart: string; workEnd: string }
	people: { personId: string; personName: string | null; days: DayStat[]; totals: DayStat }[]; queues: QueueStat[]
	unassigned?: { date: string; in: number; inMissed: number; out: number; internal: number; unknown: number }[]
	issues?: { kind: 'julio' | 'ext'; key: string; raw: string; reason: string; calls: number }[]; updatedAt: string | null
}
export interface CallSummaryRow {
	periodFrom: string; periodTo: string; direction: CallDirection; ext: string; agentName: string | null; personId: string | null; personName: string | null
	total: number; answered: number; noAnswer: number; busy: number; failed: number; talkSec: number
}
export interface CallLogParty { ext: string | null; julio: string | null; phone: string | null; contact: string | null; name: string | null; personId: string | null }
export interface CallLogRow {
	channelCode: string; date: string; time: string | null; direction: 'in' | 'out' | 'internal' | 'unknown'; origin: CallLogParty; dest: CallLogParty
	totalSec: number | null; talkSec: number | null; channelStatus: string; callStatus: string; syncAt: string | null; batchId: number
}

/** شیتِ اول؛ مقدارِ خام (raw) بدونِ trim تا صفرِ اولِ شمارهٔ متنی بماند */
export function readCallRows(buf: ArrayBuffer): Row[] {
	const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
	const ws = wb.Sheets[wb.SheetNames[0]]
	return ws ? XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true }) : []
}

/** خطای انتخابِ جهت/دورهٔ فایلِ «عملکردِ تماس»، یا null وقتی کامل است (سرور هم همین را می‌سنجد) */
export function callOptsError(o: CallOpts | undefined): string | null {
	if (!o?.direction || !o.period) return 'جهت و دورهٔ فایلِ عملکردِ تماس را انتخاب کنید'
	if ('month' in o.period) return /^\d{4}\/\d{2}$/.test(o.period.month) && +o.period.month.slice(5) >= 1 && +o.period.month.slice(5) <= 12 ? null : 'ماه نامعتبر است'
	const f = parseJ(o.period.from), t = parseJ(o.period.to)
	if (!f || !t) return 'تاریخِ دوره نامعتبر است (YYYY/MM/DD)'
	if (f.j > t.j) return 'آغازِ دوره پس از پایانِ آن است'
	return null
}

export const postCallLog = (s: Session, p: { fileName: string; sha256: string; source?: 'import-center'; rows: Row[] }) =>
	call<CallPostResult>(s, 'POST', '/api/performance/calls/log', { source: 'import-center', ...p })
export const postCallSummary = (s: Session, p: { fileName: string; sha256: string; source?: 'import-center'; direction: CallDirection; period: CallPeriod; rows: Row[] }) =>
	call<CallPostResult>(s, 'POST', '/api/performance/calls/summary', { source: 'import-center', ...p })
export const fetchCallDaily = (s: Session, q: { start: string; end: string; person?: string }) => call<CallDaily>(s, 'GET', '/api/performance/calls/daily?' + qs(q))
export const fetchCallLog = (s: Session, q: { start: string; end: string; person?: string; direction?: string; offset?: number; limit?: number }) =>
	call<{ ok: true; total: number; rows: CallLogRow[] }>(s, 'GET', '/api/performance/calls/log?' + qs({ ...q, offset: q.offset === undefined ? undefined : String(q.offset), limit: q.limit === undefined ? undefined : String(q.limit) }))
export const fetchCallSummary = (s: Session, q: { direction?: CallDirection; start?: string; end?: string } = {}) =>
	call<{ ok: true; rows: CallSummaryRow[] }>(s, 'GET', '/api/performance/calls/summary?' + qs(q))
export const fetchCallBatches = (s: Session, kind?: CallKind) => call<{ ok: true; batches: CallBatch[] }>(s, 'GET', '/api/performance/calls/batches?' + qs({ kind }))
export const deleteCalls = (s: Session, p: { batch: number } | { all: true; kind: CallKind }) =>
	call<{ ok: true; removedRows: number; removedBatches: number }>(s, 'DELETE', '/api/performance/calls?' + qs('batch' in p ? { batch: String(p.batch) } : { all: '1', kind: p.kind }))

/** یک فایلِ ریز/عملکردِ تماس از مرکزِ ایمپورت → سرور */
export async function ingestCallFile(s: Session, kind: CallKind, buf: ArrayBuffer, fileName: string, opts?: CallOpts): Promise<CallPostResult> {
	const rows = readCallRows(buf), sha256 = await sha256Hex(buf)
	if (kind === 'calllog') return postCallLog(s, { fileName, sha256, rows })
	const err = callOptsError(opts)
	if (err) throw new Error(err)
	return postCallSummary(s, { fileName, sha256, rows, direction: opts!.direction!, period: opts!.period! })
}

/* ---------------- کشِ آمارِ روزانه (مصرف‌کننده: WP-3) ---------------- */
const callsCache = new Map<string, Promise<CallDaily>>()
export function loadCallDaily(s: Session, q: { start: string; end: string; person?: string }): Promise<CallDaily> {
	const key = [currentTenant(), s.user, q.start, q.end, q.person || ''].join('|')
	let p = callsCache.get(key)
	if (!p) {
		p = fetchCallDaily(s, q).catch((e) => { callsCache.delete(key); throw e })
		callsCache.set(key, p)
	}
	return p
}
/** پس از ایمپورت یا تصمیمِ نگاشتِ جولیو/داخلی */
export const resetCallsCache = () => callsCache.clear()
