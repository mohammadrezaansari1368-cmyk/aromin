import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { callOptsError, ingestCallFile, loadCallDaily, postCallSummary, readCallRows, resetCallsCache } from './callsApi'
import type { Session } from './auth'

const ADMIN: Session = { name: 'مدیر', role: 'manager', user: 'مدیر', pass: 'x' }
const calls: { url: string; init: RequestInit }[] = []
const ok = (body: Record<string, unknown>) => new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } })

function book(aoa: (string | number | null)[][]): ArrayBuffer {
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1')
	return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

beforeEach(() => {
	calls.length = 0
	resetCallsCache()
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return ok({ batch: { id: 1 }, duplicate: false, people: [] }) }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('readCallRows', () => {
	it('صفرِ اولِ شمارهٔ متنی و عددِ داخلی را دست نمی‌زند', () => {
		const rows = readCallRows(book([['کد کانال', 'مبدا تماس', 'مقصد تماس', 'نام مقصد'], [1001, '09000000001', 200, null]]))
		expect(rows).toEqual([{ 'کد کانال': 1001, 'مبدا تماس': '09000000001', 'مقصد تماس': 200, 'نام مقصد': null }])
	})
})

describe('callOptsError', () => {
	it('بدونِ جهت یا دوره کامل نیست؛ هیچ پیش‌فرضی ندارد', () => {
		expect(callOptsError(undefined)).toMatch(/جهت و دوره/)
		expect(callOptsError({ direction: 'in' })).toMatch(/جهت و دوره/)
		expect(callOptsError({ period: { month: '1405/06' } })).toMatch(/جهت و دوره/)
	})
	it('ماه و بازه را می‌سنجد', () => {
		expect(callOptsError({ direction: 'in', period: { month: '1405/06' } })).toBeNull()
		expect(callOptsError({ direction: 'out', period: { month: '1405/13' } })).toMatch(/ماه/)
		expect(callOptsError({ direction: 'out', period: { from: '1405/06/01', to: '1405/06/15' } })).toBeNull()
		expect(callOptsError({ direction: 'out', period: { from: '1405/06/20', to: '1405/06/01' } })).toMatch(/پس از/)
		expect(callOptsError({ direction: 'out', period: { from: '1405/07/31', to: '1405/08/01' } })).toMatch(/نامعتبر/)
	})
})

describe('API', () => {
	it('postCallSummary بدنهٔ کامل با جهت، دوره و tenant می‌فرستد', async () => {
		await postCallSummary(ADMIN, { fileName: 'c.xlsx', sha256: 'a'.repeat(64), direction: 'in', period: { month: '1405/06' }, rows: [{ داخلی: 103 }] })
		expect(calls[0].url).toBe('/api/performance/calls/summary')
		expect(calls[0].init.method).toBe('POST')
		expect(JSON.parse(String(calls[0].init.body))).toEqual({ tenant: 'team', source: 'import-center', fileName: 'c.xlsx', sha256: 'a'.repeat(64), direction: 'in', period: { month: '1405/06' }, rows: [{ داخلی: 103 }] })
	})
	it('فایلِ عملکردِ تماس بدونِ جهت/دوره اصلاً فرستاده نمی‌شود؛ ریزِ تماس با sha فایل می‌رود', async () => {
		const buf = book([['کارشناس', 'داخلی', 'تمامی رکوردها'], ['کارشناس یک', 102, 61]])
		await expect(ingestCallFile(ADMIN, 'calls', buf, 'c.xlsx')).rejects.toThrow(/جهت و دوره/)
		expect(calls).toHaveLength(0)
		await ingestCallFile(ADMIN, 'calllog', buf, 'l.xlsx')
		const body = JSON.parse(String(calls[0].init.body))
		expect(calls[0].url).toBe('/api/performance/calls/log')
		expect(body.sha256).toMatch(/^[0-9a-f]{64}$/)
		expect(body.rows).toEqual([{ کارشناس: 'کارشناس یک', داخلی: 102, 'تمامی رکوردها': 61 }])
	})
	it('آمارِ روزانه کش می‌شود و پس از تصمیمِ نگاشت دوباره خوانده می‌شود', async () => {
		const q = { start: '1405/06/01', end: '1405/06/31' }
		await loadCallDaily(ADMIN, q)
		await loadCallDaily(ADMIN, q)
		expect(calls).toHaveLength(1)
		expect(calls[0].url).toBe('/api/performance/calls/daily?tenant=team&start=1405%2F06%2F01&end=1405%2F06%2F31')
		resetCallsCache()
		await loadCallDaily(ADMIN, q)
		expect(calls).toHaveLength(2)
	})
})
