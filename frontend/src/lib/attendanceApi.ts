/**
 * حضورِ سروری (WP-B) و نگاشتِ هویت (WP-A) — فقط لایهٔ API و کشِ حافظه.
 *
 * منبعِ حقیقتِ حضور، ویرایش‌های دستی و قواعد: /api/performance/attendance* (MariaDB، محدود به دسترسی روی سرور).
 * پارسِ اکسل همچنان در مرورگر است؛ ردیف‌های خام بدونِ تغییر فرستاده می‌شوند. IndexedDB فقط برای مهاجرتِ یک‌باره خوانده می‌شود.
 */
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { memGet, memSet, perfReady } from '@/lib/perfStore'

type Row = Record<string, unknown>
export const PERF_EVENT = 'aromin-perf'
export const notifyPerf = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(PERF_EVENT)) }
/** مجوزِ نوشتن و دیدِ کلِ سازمان (همان ATT_ADMIN_ROLES سرور) */
export const canSeeAll = (s: Session) => isAdmin(s.role) || s.role === 'finance'

/* ---------------- قراردادِ سرور ---------------- */
export type Mapping = 'confirmed' | 'suggested' | 'review' | 'none'
export interface ServerCard { cardNo: string; sheetName: string; rawName: string | null; personId: string | null; personName: string | null; mapping: Mapping; rows: Row[]; overrides: Record<string, Record<string, unknown>> }
export interface AttendanceBatch {
	id: number; fileName: string; sha256: string; source: 'import-center' | 'card' | 'migration'; uploadedBy: string; createdAt: string
	periodFrom: string | null; periodTo: string | null; sheets: number; days: number; inserted: number; updated: number; unchanged: number; skipped: { sheet: string; reason: string }[]
}
export interface ServerAttendance {
	ok: true; scope: 'organization' | 'self'; settings: Record<string, unknown>; settingsStored: boolean; cards: ServerCard[]
	batches?: AttendanceBatch[]; period: { from: string | null; to: string | null }; updatedAt: string | null
}
export interface Unmapped { cardNo: string; sheetName: string; rawName: string; status: string }
export interface PostResult { ok: true; duplicate: boolean; batch: AttendanceBatch; skipped?: { sheet: string; reason: string }[]; unmapped?: Unmapped[]; sheetCards: Record<string, string> }
export type AliasKind = 'card' | 'julio' | 'ext' | 'name'
export type AliasStatus = 'confirmed' | 'suggested' | 'review' | 'rejected'
export interface Candidate { personId: string; personName?: string | null; confidence: string; reasons: string[] }
export interface Alias {
	id: number; kind: AliasKind; key: string; raw: string; source: string; personId: string | null; personName: string | null; status: AliasStatus
	confidence: string; candidates: Candidate[]; decidedBy: string | null; decidedAt: string | null; updatedAt: string | null
}
export interface IdentityPerson { id: string; name: string; role: string; inactive: boolean }
export interface IdentityList { ok: true; people: IdentityPerson[]; aliases: Alias[]; counts: Record<AliasStatus, number> }
export interface ScanItem { kind: AliasKind; key: string; raw: string; source: string; personId?: string }

export class ApiError extends Error {
	status: number
	body: Record<string, unknown>
	constructor(status: number, body: Record<string, unknown>) {
		super(String(body.error || 'خطای ارتباط با سرور (' + status + ')'))
		this.status = status
		this.body = body
	}
}
async function call<T>(session: Session, method: string, path: string, body?: Record<string, unknown>): Promise<T> {
	const r = await fetch(path, {
		method, cache: 'no-store',
		headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(session) },
		body: body ? JSON.stringify({ tenant: currentTenant(), ...body }) : undefined,
	})
	let d: Record<string, unknown> = {}
	try { d = await r.json() } catch { /* پاسخِ غیر JSON */ }
	if (!r.ok || !d.ok) throw new ApiError(r.status, d)
	return d as T
}
const qs = (o: Record<string, string | undefined>) => Object.entries({ tenant: currentTenant(), ...o }).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v!)).join('&')

export const fetchAttendance = (s: Session, q: { start?: string; end?: string; person?: string } = {}) => call<ServerAttendance>(s, 'GET', '/api/performance/attendance?' + qs(q))
export const postAttendance = (s: Session, p: { fileName: string; sha256: string; source: AttendanceBatch['source']; sheets: Record<string, Row[]> }) => call<PostResult>(s, 'POST', '/api/performance/attendance', p)
export const deleteAttendance = (s: Session, p: { batch: number } | { all: true; overrides?: boolean }) =>
	call<{ ok: true; removedDays: number; removedBatches: number; removedOverrides: number }>(s, 'DELETE', '/api/performance/attendance?' + qs('batch' in p ? { batch: String(p.batch) } : { all: '1', overrides: p.overrides ? '1' : undefined }))
export const putOverride = (s: Session, cardNo: string, date: string, fields: Record<string, unknown> | null) =>
	call<{ ok: true; override?: Record<string, unknown> | null; skipped?: boolean }>(s, 'PUT', '/api/performance/attendance/overrides', { cardNo, date, fields })
export const putOverridesBatch = (s: Session, items: { cardNo: string; date: string; fields: Record<string, unknown> }[]) =>
	call<{ ok: true; written: number; skipped: number }>(s, 'PUT', '/api/performance/attendance/overrides/batch', { items, ifAbsent: true })
export const putSettings = (s: Session, settings: Record<string, unknown>) => call<{ ok: true; settings: Record<string, unknown> }>(s, 'PUT', '/api/performance/attendance/settings', { settings })
export const fetchIdentity = (s: Session, status = '') => call<IdentityList>(s, 'GET', '/api/identity?' + qs({ status }))
export const scanIdentity = (s: Session, items: ScanItem[]) => call<{ ok: true; created: number; updated: number; unchanged: number }>(s, 'POST', '/api/identity/scan', { items })
export const decideIdentity = (s: Session, p: { id: number; action: 'confirm' | 'reject' | 'reset'; personId?: string; updatedAt?: string | null }) =>
	call<{ ok: true; alias: Alias }>(s, 'POST', '/api/identity/decide', p)

/* ---------------- SHA-256 (crypto.subtle روی http در دسترس نیست → پیاده‌سازیِ کوچکِ خالص) ---------------- */
const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
export function sha256Pure(bytes: Uint8Array): string {
	const len = bytes.length, total = Math.ceil((len + 9) / 64) * 64
	const m = new Uint8Array(total)
	m.set(bytes); m[len] = 0x80
	const dv = new DataView(m.buffer)
	dv.setUint32(total - 8, Math.floor(len / 0x20000000)); dv.setUint32(total - 4, (len << 3) >>> 0)
	const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
	const W = new Uint32Array(64)
	const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n))
	for (let o = 0; o < total; o += 64) {
		for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4)
		for (let i = 16; i < 64; i++) {
			const a = W[i - 15], b = W[i - 2]
			W[i] = W[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + W[i - 7] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))
		}
		let [a, b, c, d, e, f, g, h] = H
		for (let i = 0; i < 64; i++) {
			const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0
			const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
			h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
		}
		H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h
	}
	return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('')
}
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data)
	const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
	if (subtle) {
		try { return Array.from(new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource)), (b) => b.toString(16).padStart(2, '0')).join('') } catch { /* ← خالص */ }
	}
	return sha256Pure(bytes)
}
/** JSONِ قطعی (کلیدهای مرتب) — ورودیِ sha برای مهاجرت */
export function canonicalJson(v: unknown): string {
	if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
	if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
	const o = v as Record<string, unknown>
	return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}'
}

/* ---------------- کشِ حافظه (موتورِ محاسبه هم‌گام است) ---------------- */
export const attendanceCache: { tenant: string; identity: string; data: ServerAttendance | null } = { tenant: '', identity: '', data: null }
const identityOf = (s: Session) => s.user + '\u0000' + s.pass
/** دادهٔ سرور برای کسب‌وکارِ جاری؛ null = هنوز بارگذاری نشده */
export const serverAttendance = (): ServerAttendance | null => (attendanceCache.tenant === currentTenant() ? attendanceCache.data : null)
export async function loadServerAttendance(session: Session): Promise<ServerAttendance> {
	const tenant = currentTenant()
	const data = await fetchAttendance(session)
	attendanceCache.tenant = tenant; attendanceCache.identity = identityOf(session); attendanceCache.data = data
	notifyPerf()
	return data
}
/** فقط برای آزمون */
export function resetAttendanceCache() { attendanceCache.tenant = ''; attendanceCache.identity = ''; attendanceCache.data = null; attempted.clear() }

/* ---------------- مهاجرتِ یک‌بارهٔ IndexedDB → سرور ---------------- */
interface LocalAttendance { fileName?: string; loadedAt?: number; sheets?: Record<string, Row[]>; last?: { fileName?: string }; edits?: Record<string, Record<string, unknown>> }
export interface MigrationResult { status: 'none' | 'done' | 'kept' | 'failed'; kept?: number; message?: string }
const attempted = new Set<string>()
const lsRead = <T,>(key: string, fb: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fb } catch { return fb } }
const lsKey = (s: string, tenant: string) => 'aromin.perf.' + s + '.' + tenant
const firstName = (rows: Row[]) => {
	const r = rows.find((x) => Object.keys(x).some((k) => /نام/.test(k))) || {}
	const v = (re: RegExp) => String(Object.entries(r).find(([k]) => re.test(k.replace(/ي/g, 'ی')))?.[1] ?? '').trim()
	return (v(/^نام$/) + ' ' + v(/^نام خانوادگی$/)).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
}
export const MIGRATION_FAILED = 'انتقال حضور به سرور انجام نشد؛ دادهٔ این مرورگر حفظ شد'
const keptMsg = (n: number) => `${n.toLocaleString('fa-IR')} شیت بدون شماره کارت منتقل نشد و در این مرورگر ماند`

/**
 * فقط مدیران/مالی؛ یک‌بار در هر نشست و کسب‌وکار. تکرار امن است (sha یکسان ← duplicate).
 * دادهٔ محلی فقط پس از موفقیتِ همهٔ مراحل پاک می‌شود؛ شیت‌های بدونِ کارت محلی می‌مانند.
 */
export async function migrateLocalAttendance(session: Session): Promise<MigrationResult> {
	if (!canSeeAll(session)) return { status: 'none' }
	const tenant = currentTenant(), once = tenant + '\u0000' + identityOf(session)
	if (attempted.has(once)) return { status: 'none' }
	attempted.add(once)
	await perfReady(tenant)
	const local = memGet<LocalAttendance | null>('attendance', null)
	const sheets = local?.sheets || {}
	const ov: Record<string, Record<string, unknown>> = { ...local?.edits, ...memGet<Record<string, Record<string, unknown>>>('overrides', {}) }
	if (!Object.keys(sheets).length) return { status: 'none' }
	const sheetOf = (key: string) => key.slice(0, key.lastIndexOf('|'))
	try {
		let sheetCards: Record<string, string>
		try {
			const r = await postAttendance(session, {
				fileName: ((local?.last?.fileName || local?.fileName || 'حضور') + ' (انتقال از مرورگر)').slice(0, 255), source: 'migration',
				sha256: await sha256Hex(canonicalJson(sheets)), sheets,
			})
			sheetCards = r.sheetCards || {}
		} catch (e) {
			// هیچ شیتی کارت ندارد ← چیزی برای انتقال نیست؛ دادهٔ محلی دست نمی‌خورد
			if (e instanceof ApiError && e.status === 400 && Array.isArray(e.body.skipped) && e.body.skipped.length === Object.keys(sheets).length) {
				return { status: 'kept', kept: e.body.skipped.length, message: keptMsg(e.body.skipped.length) }
			}
			throw e
		}
		const items = Object.entries(ov).flatMap(([k, fields]) => { const card = sheetCards[sheetOf(k)]; return card && fields ? [{ cardNo: card, date: k.slice(k.lastIndexOf('|') + 1), fields }] : [] })
		for (let i = 0; i < items.length; i += 2000) await putOverridesBatch(session, items.slice(i, i + 2000))
		const links = lsRead<Record<string, { person?: string }>>(lsKey('links', tenant), {})
		const linked = Object.entries(links).filter(([sh, l]) => l?.person && sheetCards[sh])
		if (linked.length) {
			const ids = new Map((await fetchIdentity(session)).people.map((p) => [p.name, p.id]))
			const scan: ScanItem[] = linked.flatMap(([sh, l]) => {
				const pid = ids.get(l.person!)
				return pid ? [{ kind: 'card' as const, key: sheetCards[sh], raw: firstName(sheets[sh] || []) || sh, source: 'migration', personId: pid }] : []
			})
			for (let i = 0; i < scan.length; i += 500) await scanIdentity(session, scan.slice(i, i + 500))
		}
		const skipped = Object.keys(sheets).filter((sh) => !sheetCards[sh])
		// Overrideهایی که به سرور نرفتند (شیتِ بی‌کارت یا شیتی که قبلاً حذف شده ولی ویرایش‌هایش نگه داشته شده) محلی می‌مانند
		const keep = Object.fromEntries(Object.entries(ov).filter(([k]) => !sheetCards[sheetOf(k)]))
		await memSet('attendance', skipped.length ? { ...local, edits: undefined, sheets: Object.fromEntries(skipped.map((sh) => [sh, sheets[sh]])) } : undefined)
		await memSet('overrides', Object.keys(keep).length ? keep : undefined)
		if (serverAttendance()?.settingsStored === false) {
			const st = lsRead<Record<string, unknown> | null>(lsKey('settings', tenant), null)
			if (st) { try { await putSettings(session, st) } catch { /* قواعدِ قدیمیِ نامعتبر؛ پیش‌فرضِ سرور می‌ماند */ } }
		}
		try { await loadServerAttendance(session) } catch { notifyPerf() }
		return skipped.length ? { status: 'kept', kept: skipped.length, message: keptMsg(skipped.length) } : { status: 'done' }
	} catch {
		attempted.delete(once)   // بارگذاریِ بعدی دوباره تلاش می‌کند
		return { status: 'failed', message: MIGRATION_FAILED }
	}
}
