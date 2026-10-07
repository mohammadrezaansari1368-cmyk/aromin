/* eslint-disable @typescript-eslint/no-explicit-any */
// ایمپورتِ کاملِ تازهٔ Joolio: idempotent، تعارض‌ها خودکار تطبیق نمی‌شوند، گزارشِ اعتبارسنجی به تفکیکِ کارشناس/ماه/سال
import { describe, expect, it } from 'vitest'
import { freshS, type Deal } from '../commission/index.ts'
import { applyDealImport, planDealImport } from '../deal-import/index.ts'

const person = (id: number, name: string, inv: Deal[] = []) => ({ id, name, role: 'sales', S: freshS(), inv, invY: { '1405': inv } })
const empty = () => ({ fy: '1405', gid: 10, years: { '1405': {}, '1404': {} }, people: [person(1, 'سارا'), person(2, 'نیما')], importLog: [] }) as any
// همان ساختارِ خروجیِ Joolio: ستون‌های تکراریِ «شرکت»/«ثبت‌کننده» با پسوندِ _1 (SheetJS)
const J = (deal: string, o: Record<string, unknown> = {}) => ({ 'معامله': deal, 'شرکت': 'مشتری ' + deal, 'شرکت_1': '', 'ارزش': 1000000, 'کارشناس': 'سارا', 'ثبت‌کننده': 'سارا', 'مرحله': 'بستن', 'ورود': '1405/01/01', 'تغییر مرحله': '10:00:00 1405/02/10', ...o })
const opts = { mode: 'append' as const, rial: false }
const apply = (full: any, rows: any[]) => applyDealImport(full, rows, { ...opts, fileName: 'joolio.xlsx', sig: 's', custbook: null })
const ledger = (full: any) => JSON.stringify(full.people.map((p: any) => [p.name, p.invY]))

const fileRows = () => [
	J('5001', { 'تغییر مرحله': '16:32:51 1405/06/31' }),
	J('5002', { 'کارشناس': 'نیما', 'ثبت‌کننده': 'سارا', 'ارزش': 2000000, 'تغییر مرحله': '08:00:00 1405/06/01' }),
	J('5003', { 'تغییر مرحله': '09:15:00 1405/05/05' }),
	J('5004', { 'تغییر مرحله': '11:00:00 1404/12/29' }),
	J('5005', { 'مرحله': 'پیشبرد', 'ارزش': 0, 'تغییر مرحله': '12:00:00 1405/04/02' }),
	J('5006', { 'تغییر مرحله': 'بستن' }),
]

describe('ایمپورتِ کاملِ تازه — idempotent و بدونِ Duplicate', () => {
	it('بارِ اول ثبت؛ تاریخ، ماه، ساعت و مقدارِ خام از همان سلول؛ بارِ دوم هیچ تغییری', () => {
		const full = empty()
		const r = apply(full, fileRows())
		expect(r.plan.cnt).toEqual({ valid: 4, previous: 1, duplicate: 0, conflict: 0, invalid: 1 })
		const all: Deal[] = full.people.flatMap((p: any) => p.invY['1405'])
		const d1 = all.find((d) => d.no === '5001')!
		expect([d1.saleDate, d1.saleTime, d1.month, d1.fy, d1.stageChangedAt]).toEqual(['1405/06/31', '16:32:51', 5, '1405', '16:32:51 1405/06/31'])
		for (const d of all) expect(d.stageChangedAt).toMatch(/^\d\d:\d\d:\d\d 1405\/\d\d\/\d\d$/)
		for (const d of all) expect(+String(d.saleDate).slice(5, 7) - 1).toBe(d.month)
		const snapshot = ledger(full)
		const again = planDealImport(fileRows(), full, opts)
		expect(again.cnt).toEqual({ valid: 0, previous: 1, duplicate: 4, conflict: 0, invalid: 1 })
		expect(again.dateUpdates).toEqual([])
		apply(full, fileRows())
		expect(ledger(full)).toBe(snapshot)
		const nos = full.people.flatMap((p: any) => p.invY['1405'].map((d: Deal) => d.no))
		expect(new Set(nos).size).toBe(nos.length)
	})
	it('ترتیبِ ردیف‌ها نتیجه را عوض نمی‌کند', () => {
		const a = planDealImport(fileRows(), empty(), opts), b = planDealImport(fileRows().reverse(), empty(), opts)
		expect(b.cnt).toEqual(a.cnt)
		expect(b.bySeller).toEqual(a.bySeller)
	})
})

describe('تعارض و name mismatch — هرگز تطبیقِ خودکار', () => {
	it('همان شماره در دفتر با مشتریِ دیگر → تعارض؛ نه رکوردِ تازه، نه تکمیلِ تاریخ', () => {
		const full = empty()
		full.people[0].invY['1405'].push({ id: 3, no: '5001', name: 'کافه رشت', month: 5, amount: '1000000', funnel: 'won' })
		const before = ledger(full)
		const r = apply(full, [J('5001', { 'تغییر مرحله': '16:32:51 1405/06/31' })])
		expect(r.plan.cnt.conflict).toBe(1)
		expect(r.plan.rows[0].why).toContain('نامِ مشتری')
		expect(r.plan.dateUpdates).toEqual([])
		expect(ledger(full)).toBe(before)
		expect(full.saleDates).toBeUndefined()
	})
	it('همان شماره با کارشناس، مبلغ یا تاریخِ دیگر → تعارض با نامِ فیلد', () => {
		const base = () => { const f = empty(); f.people[0].invY['1405'].push({ id: 3, no: '5001', name: 'مشتری 5001', month: 1, amount: '1000000', funnel: 'won', saleDate: '1405/02/10' }); return f }
		expect(planDealImport([J('5001', { 'کارشناس': 'نیما' })], base(), opts).rows[0].why).toContain('کارشناس')
		expect(planDealImport([J('5001', { 'ارزش': 1500000 })], base(), opts).rows[0].why).toContain('مبلغ')
		expect(planDealImport([J('5001', { 'تغییر مرحله': '10:00:00 1405/02/11' })], base(), opts).rows[0].why).toContain('تاریخِ فروش')
		expect(planDealImport([J('5001')], base(), opts).rows[0].st).toBe('duplicate')
		// یکسان‌سازیِ بی‌ضرر: «ي/ك»، نیم‌فاصله و عنوان تعارض نمی‌سازد
		const f = base(); f.people[0].invY['1405'][0].name = 'آقای مشتري 5001'
		expect(planDealImport([J('5001')], f, opts).rows[0].st).toBe('duplicate')
	})
	it('دو نسخهٔ ناهمسانِ یک شماره در همین فایل → هر دو تعارض، هیچ‌کدام ثبت نمی‌شود', () => {
		const P = planDealImport([J('5001'), J('5001', { 'ارزش': 9000000 }), J('5002'), J('5002')], empty(), opts)
		expect(P.rows.map((r) => r.st)).toEqual(['conflict', 'conflict', 'valid', 'duplicate'])
		expect(P.total).toBe(1)
	})
	it('بیش از یک فاکتورِ هم‌شماره در دفتر → تعارض (مبهم)', () => {
		const full = empty()
		full.people[0].invY['1405'].push({ id: 3, no: '5001', name: 'مشتری 5001', month: 1, amount: '1000000', funnel: 'won' })
		full.people[1].invY['1405'].push({ id: 4, no: '5001', name: 'مشتری 5001', month: 1, amount: '1000000', funnel: 'won' })
		const P = planDealImport([J('5001')], full, opts)
		expect([P.rows[0].st, P.dateUpdates.length]).toEqual(['conflict', 0])
		expect(P.rows[0].why).toContain('2 فاکتور')
	})
	it('عکسِ باز کنارِ فاکتورِ همان شماره تعارض نیست', () => {
		const P = planDealImport([J('5001'), J('5001', { 'مرحله': 'پیشبرد', 'ارزش': 0 })], empty(), opts)
		expect(P.rows.map((r) => r.st)).toEqual(['valid', 'duplicate'])
	})
	it('نامِ کارشناس/لیدسازِ ناشناخته علامت می‌خورد و به کارشناسِ مشابه وصل نمی‌شود', () => {
		const P = planDealImport([J('5001', { 'کارشناس': 'سارا احمدی', 'ثبت‌کننده': 'رضا' }), J('5002')], empty(), opts)
		expect(P.newNames).toEqual({ 'سارا احمدی': 1, 'رضا': 1 })
		expect(P.order).toEqual(['سارا احمدی', 'سارا'])
	})
})

describe('گزارشِ اعتبارسنجی', () => {
	it('به تفکیکِ کارشناس، ماه، سالِ مالی، تکراری و تعارض', () => {
		const full = empty()
		full.people[1].invY['1405'].push({ id: 3, no: '5003', name: 'دیگری', month: 4, amount: '1000000', funnel: 'won' })
		const P = planDealImport([...fileRows(), J('5001', { 'تغییر مرحله': '16:32:51 1405/06/31' })], full, opts)
		expect(P.years).toEqual({ '1405': 5, '1404': 1 })
		expect(P.bySeller['سارا']).toEqual({ valid: 2, previous: 1, duplicate: 1, conflict: 1, invalid: 1, amount: 1000000 + 0, months: { 6: { n: 1, amount: 1000000 }, 4: { n: 1, amount: 0 } } })
		expect(P.bySeller['نیما']).toEqual({ valid: 1, previous: 0, duplicate: 0, conflict: 0, invalid: 0, amount: 2000000, months: { 6: { n: 1, amount: 2000000 } } })
	})
	it('گزارش در importLog می‌ماند، بدونِ نامِ مشتری', () => {
		const full = empty()
		apply(full, fileRows())
		const log = full.importLog.at(-1)
		expect(log.fy).toMatchObject({ valid: 4, previous: 1, conflict: 0, invalid: 1, years: { '1405': 4, '1404': 1 } })
		expect(Object.keys(log.report.bySeller).sort()).toEqual(['سارا', 'نیما'])
		expect(log.report.flagged.map((x: any) => [x.no, x.st])).toEqual([['5006', 'invalid']])
		expect(JSON.stringify(log.report)).not.toContain('مشتری')
	})
})
