/**
 * تیکت‌ها روی سرور (WP-4) — فقط لایهٔ API و خواندنِ فایل.
 *
 * فایلِ تیکتِ جولیو در مرورگر خوانده می‌شود و فقط ستون‌های لازم (شماره، تاریخ ثبت، کارشناس، SLA/OLA، سرشاخه، موضوع، وضعیت، شرکت)
 * به /api/performance/tickets می‌رود؛ تاریخچه و توضیحات ارسال نمی‌شوند. نسبت‌دادن به شخص فقط روی سرور و از نگاشتِ تأییدشدهٔ نام است.
 * مسیرِ موتورِ قبلی برای داشبوردهای فعلی دست‌نخورده می‌ماند.
 */
import type { Session } from '@/lib/auth'
import { call, qs, sha256Hex } from '@/lib/attendanceApi'
import { readCallRows, type CallDetailItem } from '@/lib/callsApi'

type Row = Record<string, unknown>
export interface TicketBatch {
	id: number; fileName: string; sha256: string; source: 'import-center'; uploadedBy: string; createdAt: string
	periodFrom: string | null; periodTo: string | null; rows: number; inserted: number; updated: number; unchanged: number; conflicts: number
	skipped: { row: number; reason: string }[]; details: { conflicts?: CallDetailItem[]; updates?: { key: string; fields: string[] }[] }
}
export interface TicketPostResult { ok: true; duplicate: boolean; batch: TicketBatch; unmapped?: { kind: 'name'; key: string; rawName: string; status: string }[] }

/** همان انتخابِ aromin_tickets.pick_columns: برای هر فیلد فقط یک ستون (اول تطبیقِ دقیق، بعد زیررشته)؛ بقیه هرگز از مرورگر خارج نمی‌شوند */
const COLUMNS: Record<string, [string[], string[]]> = {
	no: [['شماره تیکت', 'تیکت'], ['تیکت']],
	date: [['تاریخ ثبت'], ['تاریخ ثبت']],
	agent: [['کارشناس', 'آخرین ارجاع به', 'تغییر وضعیت دهنده'], ['کارشناس']],
	sla: [['تاخیر SLA'], ['تاخیر sla']],
	ola: [['تاخیر OLA'], ['تاخیر ola']],
	channel: [['سرشاخه'], []],
	subject: [['موضوع اصلی', 'موضوع'], []],
	status: [['وضعیت'], []],
	company: [['شرکت'], []],
}
const NOT_NUMBER = ['نحوه', 'نوع', 'عنوان', 'موضوع', 'وضعیت', 'تاریخ']
const norm = (s: string) => s.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[آأ]/g, 'ا').replace(/[‌ ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
export function pickTicketColumns(headers: string[]): Set<string> {
	const hs = headers.map((h) => [norm(h), h] as const)
	const keep = new Set<string>()
	for (const [field, [exact, partial]] of Object.entries(COLUMNS)) {
		let hit: string | undefined = exact.map(norm).flatMap((c) => hs.filter(([n]) => n === c)).map(([, h]) => h)[0]
		for (const c of partial.map(norm)) {
			if (hit !== undefined) break
			hit = hs.find(([n]) => n.includes(c) && !(field === 'no' && NOT_NUMBER.some((w) => n.includes(w))))?.[1]
		}
		if (hit !== undefined) keep.add(hit)
	}
	return keep
}
export function projectTicketRows(rows: Row[]): Row[] {
	const keep = pickTicketColumns([...new Set(rows.flatMap((r) => Object.keys(r)))])
	return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keep.has(k))))
}

export const postTickets = (s: Session, p: { fileName: string; sha256: string; source?: 'import-center'; rows: Row[] }) =>
	call<TicketPostResult>(s, 'POST', '/api/performance/tickets', { source: 'import-center', ...p })
export const fetchTicketBatches = (s: Session) => call<{ ok: true; batches: TicketBatch[] }>(s, 'GET', '/api/performance/tickets/batches?' + qs({}))
export const deleteTickets = (s: Session, p: { batch: number } | { all: true }) =>
	call<{ ok: true; removedRows: number; removedBatches: number }>(s, 'DELETE', '/api/performance/tickets?' + qs('batch' in p ? { batch: String(p.batch) } : { all: '1' }))

/** یک فایلِ تیکت از مرکزِ ایمپورت → سرور */
export async function ingestTicketFile(s: Session, buf: ArrayBuffer, fileName: string): Promise<TicketPostResult> {
	return postTickets(s, { fileName, sha256: await sha256Hex(buf), rows: projectTicketRows(readCallRows(buf)) })
}
