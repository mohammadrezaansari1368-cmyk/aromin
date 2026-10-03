import { beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { docKey, memGet, perfReady, setPerfBackend, type KV } from './perfStore'
import {
	addTaskFile, buildDataset, clearAttendance, ingestAttendanceFile, LEGACY_TASKS_NAME, loadAttendance, loadOverrides, loadTaskFiles,
	migrateLegacyTasks, parseAttendanceWorkbook, parseTaskRows, preparePerfStore, saveEdit, taskStats, rules, DEFAULT_SETTINGS,
} from './performance'
import type { Session } from './auth'

// ---------- محیطِ مرورگرِ ساختگی: localStorage + پشتیبانِ IndexedDB (Map) ----------
const LS = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
	getItem: (k: string) => (LS.has(k) ? LS.get(k)! : null), setItem: (k: string, v: string) => void LS.set(k, String(v)), removeItem: (k: string) => void LS.delete(k),
	clear: () => LS.clear(), key: (i: number) => [...LS.keys()][i] ?? null, get length() { return LS.size },
} as Storage
const IDB = new Map<string, unknown>()
const kv: KV = { get: async (k) => structuredClone(IDB.get(k)), set: async (k, v) => void IDB.set(k, structuredClone(v)), del: async (k) => void IDB.delete(k) }
const ADMIN: Session = { name: 'مدیر', role: 'manager', user: 'مدیر', pass: 'x' }
const SALES: Session = { name: 'کیمیا', role: 'sales', user: 'کیمیا', pass: '1' }

function workbook(sheets: Record<string, (string | number | null)[][]>): ArrayBuffer {
	const wb = XLSX.utils.book_new()
	for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
	return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
const HEAD = ['نام', 'نام خانوادگي', 'تاريخ', 'روز', 'ورود 1', 'خروج 1', 'حضور']
const month = (m: string, days: number[]) => [HEAD, ...days.map((d) => ['فاطمه', 'اميري', `1405/${m}/${String(d).padStart(2, '0')}`, 'شنبه', '10:17', '18:00', null])]

beforeEach(async () => {
	LS.clear(); IDB.clear()
	setPerfBackend(kv)
	await perfReady('team')
})

describe('پارسِ شیت‌های حضور', () => {
	it('هر شیتِ معتبر = یک نفر؛ شیتِ بدونِ تاریخ نادیده و گزارش می‌شود', () => {
		const f = parseAttendanceWorkbook(workbook({ 'یاسمن': month('05', [1, 2]), 'راهنما': [['توضیح'], ['بدون تاریخ']] }), 'مرداد.xlsx')
		expect(Object.keys(f.sheets)).toEqual(['یاسمن'])
		expect(f.last?.people).toBe(1)
		expect(f.last?.skipped).toEqual(['راهنما'])
	})
	it('فایلِ خراب ← خطای واضح و هیچ ذخیره‌ای', async () => {
		await expect(ingestAttendanceFile(ADMIN, new TextEncoder().encode('not excel at all').buffer as ArrayBuffer, 'x.xlsx')).rejects.toThrow()
		expect(loadAttendance()).toBeNull()
		expect(IDB.has(docKey('attendance', 'team'))).toBe(false)
	})
	it('فقط مدیران/مالی', async () => {
		await expect(ingestAttendanceFile(SALES, workbook({ 'یاسمن': month('05', [1]) }), 'a.xlsx')).rejects.toThrow(/مدیران/)
	})
})

describe('ادغام و حفظِ ویرایشِ دستی (Override)', () => {
	it('بارگذاریِ دوباره ادغام می‌کند و Override دوباره اعمال می‌شود', async () => {
		await ingestAttendanceFile(ADMIN, workbook({ 'یاسمن': month('05', [1, 2]) }), 'مرداد.xlsx')
		await saveEdit(ADMIN, 'یاسمن', '1405/05/01', { excuse: true, note: 'جلسه' })
		const r = await ingestAttendanceFile(ADMIN, workbook({ 'یاسمن': month('06', [1]), 'نورا': month('06', [1]) }), 'شهریور.xlsx')
		expect(r.merged).toBe(true)
		const att = loadAttendance()!
		expect(att.last?.fileName).toBe('شهریور.xlsx')
		expect(att.sheets['یاسمن'].length).toBe(3)   // ۲ روزِ مرداد + ۱ روزِ شهریور
		expect(Object.keys(att.sheets).sort()).toEqual(['نورا', 'یاسمن'])
		expect(loadOverrides()['یاسمن|1405/05/01']).toEqual({ excuse: true, note: 'جلسه' })
		const ds = buildDataset(ADMIN, { people: [] })
		const row = ds.people.find((p) => p.sheetName === 'یاسمن')!.rows.find((x) => x.date === '1405/05/01')!
		expect(row.edited && row.forgivenBy).toBe('edit')
		// پایداری در IndexedDB (بعد از «Reload»)
		setPerfBackend(kv); await perfReady('team')
		expect(memGet<Record<string, unknown>>('overrides', {})['یاسمن|1405/05/01']).toBeTruthy()
		expect(loadAttendance()?.sheets['یاسمن'].length).toBe(3)
	})
	it('دادهٔ تازه برای همان روز برنده است، Override دست نمی‌خورد', async () => {
		await ingestAttendanceFile(ADMIN, workbook({ 'یاسمن': month('05', [1]) }), 'a.xlsx')
		await saveEdit(ADMIN, 'یاسمن', '1405/05/01', { entry: '10:05' })
		const newer = month('05', [1]); newer[1][4] = '11:00'
		await ingestAttendanceFile(ADMIN, workbook({ 'یاسمن': newer }), 'b.xlsx')
		expect(String(loadAttendance()!.sheets['یاسمن'][0]['ورود 1'])).toContain('11:00')
		expect(loadOverrides()['یاسمن|1405/05/01']).toEqual({ entry: '10:05' })
	})
	it('حذف از مرورگر: Overrideها فقط با تأییدِ صریح پاک می‌شوند', async () => {
		await ingestAttendanceFile(ADMIN, workbook({ 'یاسمن': month('05', [1]) }), 'a.xlsx')
		await saveEdit(ADMIN, 'یاسمن', '1405/05/01', { note: 'x' })
		await clearAttendance(ADMIN)
		expect(loadAttendance()).toBeNull()
		expect(Object.keys(loadOverrides())).toHaveLength(1)
		await clearAttendance(ADMIN, true)
		expect(Object.keys(loadOverrides())).toHaveLength(0)
	})
	it('آداپتورِ مشترک برای کادرِ ورودِ مرکز ایمپورت (source)', async () => {
		await ingestAttendanceFile(ADMIN, workbook({ 'یاسمن': month('05', [1]) }), 'شهریور.xlsx', 'import-center')
		expect(loadAttendance()?.last).toMatchObject({ fileName: 'شهریور.xlsx', people: 1, source: 'import-center' })
	})
})

const taskRows = (ids: (number | null)[], owner = 'خانم یاسمن امیری', pid = 25) => ids.map((id, i) => ({ 'وظیفه': id, 'برای': owner, 'برای ID': pid, 'عنوان': i % 2 ? 'جلسه حضوری' : 'پیگیری', 'تاریخ برنامه‌ریزی': '1405/06/19', 'ساعت برنامه‌ریزی': '11:00:00', 'تاریخ سررسید': '1405/06/19', 'ساعت سررسید': '12:00:00', 'مرحله': 'انجام شده' }))
describe('وظایف: یکتاسازی با شناسهٔ وظیفه و اتصال به موتورِ ایمپورت', () => {
	it('فایل‌های ایمپورت‌شده (handoff موتور) ثبت و با taskId یکتا می‌شوند؛ بدون‌شناسه‌ها شمرده نمی‌شوند', async () => {
		await addTaskFile(null, parseTaskRows(taskRows([1, 2, 3]), 'a.xlsx', 'import')!)
		await addTaskFile(null, parseTaskRows(taskRows([3, 4, null]), 'b.xlsx', 'import')!)
		const st = taskStats(loadTaskFiles(), rules(DEFAULT_SETTINGS))
		expect(st.tasks).toBe(4)
		expect(st.missingIds).toBe(1)
		expect(st.employees).toBe(1)
		expect(st.outside).toBe(2)   // ۲ و ۳ (حضوری) — ۳ فقط یک‌بار
	})
	it('کاشیِ قدیمی: تطبیق با موتور، ثبتِ باقی‌مانده، سپس حذفِ منبعِ قدیمی — هیچ داده‌ای گم نمی‌شود', async () => {
		await addTaskFile(null, parseTaskRows(taskRows([1, 2]), 'engine.xlsx', 'import')!)
		// قالبِ قدیمی: آرایهٔ تختِ همهٔ وظایف (نه فقط بیرون از شرکت)
		const legacy = [2, 3, 5].map((id) => ({ id: String(id), person: 'خانم یاسمن امیری', pid: '', title: 'پیگیری', date: '1405/06/19', start: 660, endDate: '1405/06/19', end: 720, stage: 'انجام شده', desc: '', contact: '', hist: 0, fileTo: '' }))
		LS.set('aromin.perf.tasks.team', JSON.stringify(legacy))
		const r = await migrateLegacyTasks()
		expect(r).toMatchObject({ removedTile: true, duplicates: 1 })
		const files = loadTaskFiles()
		expect(files.some((f) => f.name === LEGACY_TASKS_NAME)).toBe(false)
		expect(LS.has('aromin.perf.tasks.team')).toBe(false)
		const mig = files.find((f) => f.source === 'migrated')!
		expect(mig.ids.sort()).toEqual(['3', '5'])
		const st = taskStats(files, rules(DEFAULT_SETTINGS))
		expect(st.tasks).toBe(4)          // ۱،۲ (موتور) + ۳،۵ (منتقل‌شده)
		expect(st.employees).toBe(1)      // دیگر «۰ نفر» نیست
	})
	it('اگر همهٔ وظایفِ قدیمی در موتور باشند، فقط کاشی حذف می‌شود', async () => {
		await addTaskFile(null, parseTaskRows(taskRows([1, 2, 3]), 'engine.xlsx', 'import')!)
		LS.set('aromin.perf.tasks.team', JSON.stringify(parseTaskRows(taskRows([1, 2, 3]), 'x', 'manual')!.tasks))
		await preparePerfStore()
		const files = loadTaskFiles()
		expect(files.map((f) => f.source)).toEqual(['import'])
		expect(LS.has('aromin.perf.tasks.team')).toBe(false)
	})
})

describe('مهاجرتِ ذخیره‌ساز: localStorage ← IndexedDB', () => {
	it('فایلِ حضورِ قدیمی (با ویرایش‌های درونش) جدا و منتقل، و کلیدِ قدیمی بعد از نوشتن پاک می‌شود', async () => {
		const f = parseAttendanceWorkbook(workbook({ 'یاسمن': month('05', [1]) }), 'old.xlsx')
		LS.set('aromin.perf.attendance.team', JSON.stringify({ ...f, edits: { 'یاسمن|1405/05/01': { note: 'قدیمی' } } }))
		LS.set('aromin.perf.taskfiles.team', JSON.stringify([parseTaskRows(taskRows([9]), 'old-tasks.xlsx', 'import')]))
		setPerfBackend(kv); await perfReady('team')
		expect(loadAttendance()?.fileName).toBe('old.xlsx')
		expect((loadAttendance() as { edits?: unknown }).edits).toBeUndefined()
		expect(loadOverrides()['یاسمن|1405/05/01']).toEqual({ note: 'قدیمی' })
		expect(loadTaskFiles().map((t) => t.name)).toEqual(['old-tasks.xlsx'])
		expect(LS.has('aromin.perf.attendance.team') || LS.has('aromin.perf.taskfiles.team')).toBe(false)
		expect(IDB.has(docKey('attendance', 'team')) && IDB.has(docKey('overrides', 'team'))).toBe(true)
	})
})
