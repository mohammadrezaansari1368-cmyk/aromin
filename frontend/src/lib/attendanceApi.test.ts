import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'
import { docKey, memGet, memSet, perfReady, setPerfBackend, type KV } from './perfStore'
import { canonicalJson, loadServerAttendance, migrateLocalAttendance, MIGRATION_FAILED, resetAttendanceCache, sha256Hex, sha256Pure } from './attendanceApi'
import { fakeAttendanceServer } from './attendanceServerFake'
import { ingestAttendanceFile, parseAttendanceWorkbook } from './performance'
import type { Session } from './auth'

const LS = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
	getItem: (k: string) => (LS.has(k) ? LS.get(k)! : null), setItem: (k: string, v: string) => void LS.set(k, String(v)), removeItem: (k: string) => void LS.delete(k),
	clear: () => LS.clear(), key: (i: number) => [...LS.keys()][i] ?? null, get length() { return LS.size },
} as Storage
const IDB = new Map<string, unknown>()
const kv: KV = { get: async (k) => structuredClone(IDB.get(k)), set: async (k, v) => void IDB.set(k, structuredClone(v)), del: async (k) => void IDB.delete(k) }
const ADMIN: Session = { name: 'مدیر', role: 'manager', user: 'مدیر', pass: 'x' }
const SALES: Session = { name: 'لیلا', role: 'sales', user: 'لیلا', pass: '1' }

const HEAD = ['شماره کارت', 'نام', 'نام خانوادگي', 'تاريخ', 'روز', 'ورود 1', 'خروج 1', 'حضور']
const month = (card: number | null, m: string, days: number[]) => [HEAD, ...days.map((d) => [card, 'زهرا', 'كريمي', `1405/${m}/${String(d).padStart(2, '0')}`, 'شنبه', '10:17', '18:00', null])]
function workbook(sheets: Record<string, (string | number | null)[][]>): ArrayBuffer {
	const wb = XLSX.utils.book_new()
	for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
	return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
let srv: ReturnType<typeof fakeAttendanceServer>
beforeEach(async () => {
	LS.clear(); IDB.clear(); resetAttendanceCache()
	srv = fakeAttendanceServer([{ id: '2', name: 'زهرا کریمی' }])
	vi.stubGlobal('fetch', vi.fn(srv.fetch))
	setPerfBackend(kv)
	await perfReady('team')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('sha256Hex', () => {
	const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
	it('crypto.subtle و مسیرِ خالص (http بدونِ subtle) یکسان‌اند', async () => {
		expect(await sha256Hex('abc')).toBe(ABC)
		vi.stubGlobal('crypto', {})
		expect(await sha256Hex('abc')).toBe(ABC)
		expect(await sha256Hex(new TextEncoder().encode('abc').buffer as ArrayBuffer)).toBe(ABC)
	})
	it('پیاده‌سازیِ خالص در مرزهای بلوک با node:crypto برابر است', () => {
		for (const n of [0, 55, 56, 63, 64, 65, 1000]) {
			const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255)
			expect(sha256Pure(b)).toBe(createHash('sha256').update(b).digest('hex'))
		}
	})
	it('canonicalJson کلیدها را مرتب می‌کند', () => {
		expect(canonicalJson({ b: 1, a: [{ d: null, c: 'x' }] })).toBe('{"a":[{"c":"x","d":null}],"b":1}')
	})
})

describe('ingestAttendanceFile ← سرور', () => {
	it('sha256 فایل، شیت‌ها و source را می‌فرستد و تکراری را برمی‌گرداند', async () => {
		const buf = workbook({ 'کریمی': month(9, '06', [1, 2]) })
		const r = await ingestAttendanceFile(ADMIN, buf, 'شهریور.xlsx', 'import-center')
		const post = srv.st.calls.find((c) => c.method === 'POST')!
		expect(post.body).toMatchObject({ tenant: 'team', fileName: 'شهریور.xlsx', source: 'import-center', sha256: await sha256Hex(buf) })
		expect(Object.keys(post.body!.sheets as object)).toEqual(['کریمی'])
		expect(r).toMatchObject({ duplicate: false, people: 1, total: 1 })
		expect(r.unmapped.map((u) => u.cardNo)).toEqual(['9'])
		const again = await ingestAttendanceFile(ADMIN, buf, 'شهریور.xlsx', 'import-center')
		expect(again.duplicate).toBe(true)
		expect(srv.st.batches).toHaveLength(1)
	})
	it('کاربرِ غیرمدیر پیش از هر fetch خطا می‌گیرد', async () => {
		await expect(ingestAttendanceFile(SALES, workbook({ 'کریمی': month(9, '06', [1]) }), 'a.xlsx')).rejects.toThrow(/مدیران/)
		expect(fetch).not.toHaveBeenCalled()
	})
})

describe('مهاجرتِ یک‌بارهٔ IndexedDB ← سرور', () => {
	const seed = async (sheets: Record<string, (string | number | null)[][]>, overrides: Record<string, unknown> = {}) => {
		const f = parseAttendanceWorkbook(workbook(sheets), 'قدیمی.xlsx')
		await memSet('attendance', f)
		if (Object.keys(overrides).length) await memSet('overrides', overrides)
		await loadServerAttendance(ADMIN)
		return f
	}
	const local = () => [IDB.has(docKey('attendance', 'team')), IDB.has(docKey('overrides', 'team'))]

	it('موفق: شیت‌ها و Overrideها (ifAbsent) منتقل و اسنادِ محلی پاک می‌شوند', async () => {
		await seed({ 'کریمی': month(9, '06', [1, 2]) }, { 'کریمی|1405/06/01': { note: 'جلسه' } })
		srv.st.overrides.set('9', { '1405/06/02': { note: 'سرور' } })
		const r = await migrateLocalAttendance(ADMIN)
		expect(r.status).toBe('done')
		const post = srv.st.calls.find((c) => c.method === 'POST')!
		expect(post.body).toMatchObject({ source: 'migration', fileName: 'قدیمی.xlsx (انتقال از مرورگر)' })
		const batch = srv.st.calls.find((c) => c.path.endsWith('/overrides/batch'))!
		expect(batch.body).toMatchObject({ ifAbsent: true, items: [{ cardNo: '9', date: '1405/06/01', fields: { note: 'جلسه' } }] })
		expect(srv.st.overrides.get('9')).toEqual({ '1405/06/01': { note: 'جلسه' }, '1405/06/02': { note: 'سرور' } })
		expect(local()).toEqual([false, false])
		expect(memGet('attendance', null)).toBeNull()
	})
	it('POSTِ ناموفق ← هیچ چیز پاک نمی‌شود و بارِ بعد دوباره تلاش می‌شود', async () => {
		await seed({ 'کریمی': month(9, '06', [1]) }, { 'کریمی|1405/06/01': { note: 'x' } })
		srv.st.fail['POST /api/performance/attendance'] = 500
		expect(await migrateLocalAttendance(ADMIN)).toEqual({ status: 'failed', message: MIGRATION_FAILED })
		expect(local()).toEqual([true, true])
		delete srv.st.fail['POST /api/performance/attendance']
		expect((await migrateLocalAttendance(ADMIN)).status).toBe('done')
	})
	it('شکستِ دستهٔ Override ← دادهٔ محلی حفظ می‌شود', async () => {
		await seed({ 'کریمی': month(9, '06', [1]) }, { 'کریمی|1405/06/01': { note: 'x' } })
		srv.st.fail['PUT /api/performance/attendance/overrides/batch'] = 403
		expect((await migrateLocalAttendance(ADMIN)).status).toBe('failed')
		expect(local()).toEqual([true, true])
	})
	it('شیتِ بدونِ کارت محلی می‌ماند (با Overrideهای خودش)', async () => {
		await seed({ 'کریمی': month(9, '06', [1]), 'بی‌کارت': month(null, '06', [1]) }, { 'بی‌کارت|1405/06/01': { note: 'y' }, 'کریمی|1405/06/01': { note: 'x' } })
		const r = await migrateLocalAttendance(ADMIN)
		expect(r).toMatchObject({ status: 'kept', kept: 1 })
		expect(r.message).toMatch(/بدون شماره کارت/)
		expect(Object.keys(memGet<{ sheets: object }>('attendance', { sheets: {} }).sheets)).toEqual(['بی‌کارت'])
		expect(memGet('overrides', {})).toEqual({ 'بی‌کارت|1405/06/01': { note: 'y' } })
		// بارِ بعد: فقط شیتِ بی‌کارت ← سرور ۴۰۰ می‌دهد، ولی چیزی پاک نمی‌شود
		resetAttendanceCache(); await loadServerAttendance(ADMIN)
		expect((await migrateLocalAttendance(ADMIN)).status).toBe('kept')
		expect(local()).toEqual([true, true])
	})
	it('Overrideِ شیتی که دیگر محلی نیست (نگه‌داشته پس از حذف) پاک نمی‌شود', async () => {
		await seed({ 'کریمی': month(9, '06', [1]) }, { 'کریمی|1405/06/01': { note: 'x' }, 'حذف‌شده|1405/05/03': { code: 'leave' } })
		expect((await migrateLocalAttendance(ADMIN)).status).toBe('done')
		expect(memGet('attendance', null)).toBeNull()
		expect(memGet('overrides', {})).toEqual({ 'حذف‌شده|1405/05/03': { code: 'leave' } })
	})
	it('تکراری (تبِ دوم یا تلاشِ دوباره) موفقیت حساب می‌شود', async () => {
		const f = await seed({ 'کریمی': month(9, '06', [1]) })
		srv.st.batches.push({ id: 99, sha256: await sha256Hex(canonicalJson(f.sheets)) } as never)
		expect((await migrateLocalAttendance(ADMIN)).status).toBe('done')
		expect(srv.st.calls.filter((c) => c.method === 'POST')).toHaveLength(1)
		expect(local()).toEqual([false, false])
	})
	it('3.9.92: نگاشتِ هویت حذف شد — پیوندِ محلی به سرور نمی‌رود؛ قواعدِ محلی فقط اگر سرور ندارد', async () => {
		LS.set('aromin.perf.links.team', JSON.stringify({ 'کریمی': { person: 'زهرا کریمی' } }))
		LS.set('aromin.perf.settings.team', JSON.stringify({ workEnd: '17:00' }))
		await seed({ 'کریمی': month(9, '06', [1]) })
		await migrateLocalAttendance(ADMIN)
		expect(srv.st.calls.some((c) => c.path.startsWith('/api/identity'))).toBe(false)
		expect(srv.st.settings).toEqual({ workEnd: '17:00' })
	})
	it('برای فروش اجرا نمی‌شود و دادهٔ محلی دست نمی‌خورد', async () => {
		await seed({ 'کریمی': month(9, '06', [1]) })
		vi.mocked(fetch).mockClear()
		expect((await migrateLocalAttendance(SALES)).status).toBe('none')
		expect(fetch).not.toHaveBeenCalled()
		expect(local()).toEqual([true, false])
	})
})
