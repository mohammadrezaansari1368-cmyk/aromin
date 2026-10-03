/**
 * ذخیرهٔ دفترِ فروش (C1) — روی همان بلابِ سرور، فقط کلیدهای موتورِ پورسانت/دفتر:
 * people[i].inv و people[i].invY['1405'] (همیشه یکسان؛ اپِ کامل دفترِ سال را از invY می‌خواند)، و در ایمپورت: gid, years, importLog, custbook.
 * ویرایش‌های پشتِ‌سرِهم در صف جمع و با یک «خواندنِ تازه ← اعمالِ همان تغییرها ← نوشتن» ذخیره می‌شوند (saveState: بک‌آپِ اولِ جلسه، سریالی).
 * هر تغییر با شناسهٔ کارشناس + نام + شناسهٔ فاکتور پیدا می‌شود؛ اگر روی سرور پیدا نشد، به‌جای حدس، خطا برمی‌گردد.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { saveState } from '@/lib/forecastStore'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { ledgerOf } from '@/engines/customer/index.ts'
import { freshS, invoiceKey, isInvoice, isLocked as lockedDoc, num, SERVER_FIELDS, type Deal } from '@/engines/commission/index.ts'

export const LEDGER_FY = '1405'
export interface Ref { pid: number | string; pname: string; id: number }
export interface PRef { pid: number | string; pname: string }
type Op =
	| { t: 'patch'; ref: Ref; patch: Partial<Deal> }
	| { t: 'add'; ref: Ref; deal: Deal }
	| { t: 'del'; ref: Ref }
	| { t: 'person-add'; person: { id: number; name: string } }
	| { t: 'person-patch'; ref: PRef; patch: { name?: string; level?: string; role?: string } }
	| { t: 'person-del'; ref: PRef }
	| { t: 'year-add'; y: string }

/** نقضِ قاعدهٔ دامنه (شمارهٔ قفل، فاکتورِ بستهٔ مالی، …) — تکرار نمی‌شود، از صف حذف می‌شود */
export class LedgerRule extends Error {}
/** سندِ قفل (در انتظار تصویب / تصویب‌شده / بسته) — فقط مسیرهای سرور تغییرش می‌دهند */
export const isClosed = (d: Deal | undefined | null) => lockedDoc(d)
/** آیا این شماره در فاکتورِ (معاملهٔ بستهٔ) دیگری از دفترِ ۱۴۰۵ آمده؟ — فقط تطبیقِ دقیقِ شماره */
export function numberTaken(full: any, no: unknown, except?: Deal): boolean {
	const k = invoiceKey(no)
	if (!k) return false
	return (full?.people || []).some((p: any) => ledgerOf(p, full, LEDGER_FY).some((d: Deal) => d !== except && isInvoice(d) && invoiceKey(d.no) === k))
}
const LEVELW: Record<string, number> = { senior: 1.5, mid: 1.0, junior: 0.6 }
/** همان redistributeTargetsِ اپِ کامل: بودجهٔ ماهانهٔ تیم بین کارشناسانِ فروشِ فعال بر اساسِ وزنِ سطح */
function redistributeTargets(full: any) {
	const fy = String(full.fy || LEDGER_FY)
	const yd = (full.years && full.years[fy]) || {}
	const targets = yd.targets || full.targets || {}
	if (!Object.keys(targets).length) return
	const budget = yd.budget || full.budget || {}
	const pool = (full.people || []).filter((p: any) => !p?.inactive && ((p?.role || 'sales') === 'sales' || ((p?.role) === 'salesmgr' && !!full.salesCrisis)))
	const nt: Record<string, number[]> = {}
	if (pool.length) {
		const sumW = pool.reduce((s: number, p: any) => s + (LEVELW[p.level || 'junior'] || 1), 0) || 1
		for (const p of pool) {
			const w = (LEVELW[p.level || 'junior'] || 1) / sumW
			nt[p.id] = Array.from({ length: 12 }, (_, m) => Math.round((num(budget[m]) || 0) * 1e6 * w))
		}
	}
	full.targets = nt
	if (full.years && full.years[fy]) full.years[fy].targets = nt
}

let queue: Op[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null
type Status = { state: 'idle' | 'pending' | 'saving' | 'error'; error?: string }
let status: Status = { state: 'idle' }
const subs = new Set<(s: Status) => void>()
const emit = (s: Status) => { status = s; subs.forEach((f) => f(s)) }
export const ledgerStatus = () => status
export function onLedgerStatus(f: (s: Status) => void) { subs.add(f); return () => { subs.delete(f) } }

function findPerson(full: any, ref: PRef) {
	const people: any[] = full.people || []
	// شناسه‌ها یکتا هستند (اپِ قدیم از 3.9.9 یکتا می‌کند)؛ نام فقط برای اطمینان/سازگاری
	const byId = people.filter((p) => String(p.id) === String(ref.pid))
	return byId.find((p) => String(p.name || '') === ref.pname) || (byId.length === 1 ? byId[0] : undefined)
		|| people.find((p) => String(p.name || '') === ref.pname)
}
/** دفترِ ۱۴۰۵ را قابلِ نوشتن می‌کند و inv/invY را یکی نگه می‌دارد */
function ledgerW(full: any, p: any): any[] {
	const arr = ledgerOf(p, full, LEDGER_FY)
	p.invY = p.invY || {}
	p.invY[LEDGER_FY] = arr
	if (String(full.fy) === LEDGER_FY) p.inv = arr
	return arr
}
export function applyOps(full: any, ops: Op[]) {
	let gid = +full.gid || 1
	for (const op of ops) {
		if (op.t === 'year-add') {
			full.years = full.years && typeof full.years === 'object' ? full.years : {}
			if (!full.years[op.y]) full.years[op.y] = { budget: {}, targets: {} }
			continue
		}
		if (op.t === 'person-add') {
			const name = op.person.name.trim()
			if (!name) throw new LedgerRule('نامِ کارشناس خالی است.')
			if ((full.people || []).some((p: any) => String(p.name || '').trim() === name)) throw new LedgerRule('کارشناسی با نامِ «' + name + '» از قبل هست.')
			const id = Math.max(+op.person.id, gid, 1 + Math.max(0, ...(full.people || []).map((p: any) => +p.id || 0)))
			;(full.people ||= []).push({ id, name, inv: [], invY: { [LEDGER_FY]: [] }, S: freshS() })
			if (String(full.fy) === LEDGER_FY) { const np = full.people[full.people.length - 1]; np.inv = np.invY[LEDGER_FY] }
			gid = Math.max(gid, id + 1)
			continue
		}
		const p = findPerson(full, op.ref)
		if (!p) throw new LedgerRule('کارشناسِ «' + op.ref.pname + '» روی سرور پیدا نشد؛ صفحه را تازه کن.')
		if (op.t === 'person-patch') {
			const { name, level, role } = op.patch
			if (name !== undefined) {
				const n = name.trim()
				if (!n) throw new LedgerRule('نامِ کارشناس خالی است.')
				if ((full.people || []).some((x: any) => x !== p && String(x.name || '').trim() === n)) throw new LedgerRule('کارشناسی با نامِ «' + n + '» از قبل هست.')
				p.name = n
			}
			if (level !== undefined) p.level = level
			if (role !== undefined) p.role = role
			continue
		}
		if (op.t === 'person-del') {
			if ((full.people || []).length <= 1) throw new LedgerRule('حداقل یک کارشناس باید بماند.')
			const all = [...(p.inv || []), ...Object.values(p.invY || {}).flat()] as Deal[]
			if (all.some(isClosed)) throw new LedgerRule('این کارشناس سندِ تصویب‌شده/بسته دارد و حذف نمی‌شود.')
			full.people = full.people.filter((x: any) => x !== p)
			if (full.targets && full.targets[p.id]) delete full.targets[p.id]
			redistributeTargets(full)
			continue
		}
		const arr = ledgerW(full, p)
		if (op.t === 'add') {
			if (SERVER_FIELDS.some((f) => op.deal[f])) throw new LedgerRule('وضعیتِ مالیِ سند فقط از مسیرِ واحدِ مالی تعیین می‌شود.')
			if (!arr.some((d) => d.id === op.deal.id)) arr.push({ ...op.deal })
			gid = Math.max(gid, +op.deal.id + 1)
			continue
		}
		const i = arr.findIndex((d) => d.id === op.ref.id)
		if (i < 0) {
			if (op.t === 'del') continue // قبلاً حذف شده
			throw new LedgerRule('فاکتورِ «' + op.ref.id + '» در دفترِ ' + op.ref.pname + ' روی سرور نیست (شاید در تبِ دیگری تغییر کرده)؛ صفحه را تازه کن.')
		}
		const d = arr[i]
		if (isClosed(d)) throw new LedgerRule('سندِ «' + (d.no || d.name || '') + '» قفل است (در انتظار تصویب / تصویب‌شده / بسته) و قابلِ ' + (op.t === 'del' ? 'حذف' : 'ویرایش') + ' نیست.')
		if (op.t === 'del') { arr.splice(i, 1); continue }
		if (SERVER_FIELDS.some((f) => f in op.patch)) throw new LedgerRule('وضعیتِ مالیِ سند فقط از مسیرِ سرور تغییر می‌کند.')
		if ('no' in op.patch) throw new LedgerRule('شمارهٔ فاکتور (سیما) غیرقابلِ تغییر است.')
		for (const [k, v] of Object.entries(op.patch)) {
			if (v === undefined) delete d[k]
			else d[k] = v
		}
	}
	full.gid = gid
}

async function flushNow(): Promise<void> {
	if (timer) { clearTimeout(timer); timer = null }
	if (inflight) await inflight.catch(() => undefined)
	if (!queue.length) return
	const ops = queue
	queue = []
	emit({ state: 'saving' })
	inflight = saveState((full) => applyOps(full, ops), { tag: 'react-ledger' })
	try {
		await inflight
		emit(queue.length ? { state: 'pending' } : { state: 'idle' })
	} catch (e) {
		// قاعدهٔ دامنه نقض شده (مثلاً فاکتور در این فاصله بستهٔ مالی شد): تکرارش فایده ندارد ← از صف بیرون
		if (!(e instanceof LedgerRule)) queue = ops.concat(queue) // خطای شبکه/سرور: دوباره در صف؛ «تلاش دوباره»
		const m = (e as Error).message
		emit({ state: 'error', error: m === 'backup' ? 'بک‌آپِ سرور گرفته نشد؛ برای امنیت ذخیره نشد.' : m === 'empty' ? 'دادهٔ سرور خالی است؛ ذخیره نشد.' : m === 'save' || /^http/.test(m) ? 'ذخیره روی سرور انجام نشد.' : m })
		throw e
	} finally {
		inflight = null
	}
}
function schedule() {
	emit({ state: 'pending' })
	if (timer) clearTimeout(timer)
	timer = setTimeout(() => { flushNow().catch(() => undefined) }, 600)
}
export function queueOp(op: Op) {
	// چند ویرایشِ پشتِ‌سرِهمِ یک فاکتور در یک تغییر ادغام شود
	if (op.t === 'patch') {
		const last = queue.find((q) => q.t === 'patch' && q.ref.id === op.ref.id && q.ref.pname === op.ref.pname) as Extract<Op, { t: 'patch' }> | undefined
		if (last) { Object.assign(last.patch, op.patch); schedule(); return }
	}
	queue.push(op)
	schedule()
}
/** تغییرِ فوری (کارشناس/سال): اول صف خالی می‌شود، بعد همین تغییر روی نسخهٔ تازهٔ سرور؛ حذفِ کارشناس با بک‌آپِ اجباری */
export async function applyNow(op: Op): Promise<void> {
	await flushNow()
	emit({ state: 'saving' })
	try {
		await saveState((full) => applyOps(full, [op]), { tag: 'react-ledger-' + op.t, forceBackup: op.t === 'person-del' })
		emit({ state: 'idle' })
	} catch (e) {
		const m = (e as Error).message
		emit({ state: 'error', error: e instanceof LedgerRule ? m : m === 'backup' ? 'بک‌آپِ سرور گرفته نشد؛ برای امنیت ذخیره نشد.' : 'ذخیره روی سرور انجام نشد.' })
		throw e
	}
}
/** پیش از رفتن به تبِ دیگر/خروج: همهٔ ویرایش‌ها ذخیره شوند */
export const flushLedger = () => flushNow()
export const ledgerDirty = () => queue.length > 0 || !!inflight

if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', (e) => { if (ledgerDirty()) { e.preventDefault(); e.returnValue = '' } })
}

/* ---------- بستنِ مالی / بازگشایی — فقط سرور می‌نویسد (هویت با هدرهای ورود؛ نقش روی سرور سنجیده می‌شود) ---------- */
async function c1Call(session: Session, path: string, body: Record<string, unknown>) {
	await flushNow() // اول ویرایش‌های در صف بنشینند تا سرور روی آخرین نسخه کار کند
	const r = await fetch('/api/c1/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: JSON.stringify({ tenant: currentTenant(), ...body }) })
	const d = await r.json().catch(() => null)
	if (!d || !d.ok) throw new Error((d && d.error) || 'سرور پاسخ نداد.')
	return d
}
/** ارسال برای تصویب (صاحبِ سند، مدیر، مالی) */
export const submitDocs = (session: Session, ids: number[]) => c1Call(session, 'submit', { ids }) as Promise<{ submitted: number; skipped: string[] }>
/** برگرداندنِ «در انتظار تصویب» به پیش‌نویس */
export const withdrawDoc = (session: Session, id: number, reason = '') => c1Call(session, 'withdraw', { id, reason })
export interface ApprovalInput { cash: string; pending: string; regDateJ: string; confirmAccuracy: boolean; confirmRegistered: boolean }
/** «تصویب سند» (فقط کارشناسِ مالی؛ سرور دوباره اعتبارسنجی می‌کند) */
export const approveDoc = (session: Session, id: number, v: ApprovalInput) => c1Call(session, 'approve', { id, ...v }) as Promise<{ approval?: Record<string, unknown>; already?: boolean }>
/** تصویبِ یک‌جای اسنادِ دوره (کارشناسِ مالی یا مدیر) */
export const approveBatch = (session: Session, ids: number[], v: ApprovalInput) => c1Call(session, 'approve-batch', { ids, ...v }) as Promise<{ approved: number; already: number; skipped: string[] }>
/** بستنِ مالی (فقط کارشناسِ مالی، فقط سندِ تصویب‌شده؛ idempotent) */
export const closeDeals = (session: Session, ids: number[]) => c1Call(session, 'close', { ids }) as Promise<{ closed: number; already: number; skipped: string[] }>
/** ارسالِ کدِ پیامکی برای بازگشایی */
export const requestReopenCode = (session: Session, id: number) => c1Call(session, 'reopen-code', { id }) as Promise<{ to?: string }>
/** بازگشایی ← پیش‌نویس: مدیر بدونِ کد؛ بقیه با کدِ پیامکی؛ دلیل اجباری */
export const reopenDeal = (session: Session, id: number, reason: string, code?: string) => c1Call(session, 'reopen', { id, reason, code: code || '' }) as Promise<{ via: string }>

/* ---------- چیدمانِ کاشی‌ها برای هر کاربر روی سرور ---------- */
export async function loadLayout(session: Session, list: string): Promise<string[] | null> {
	try {
		const r = await fetch(`/api/ui-layout?tenant=${encodeURIComponent(currentTenant())}&list=${encodeURIComponent(list)}`, { headers: authHeaders(session), cache: 'no-store' })
		const d = await r.json().catch(() => null)
		return d && d.ok && Array.isArray(d.order) ? d.order.map(String) : null
	} catch { return null }
}
export function saveLayout(session: Session, list: string, order: string[]) {
	fetch('/api/ui-layout', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: JSON.stringify({ tenant: currentTenant(), list, order }) }).catch(() => undefined)
}
