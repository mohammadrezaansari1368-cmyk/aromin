import { describe, expect, it } from 'vitest'
import { commAmount, DEFAULT_WEIGHTS, freshS, period, roleCount, rowBasis, STAGES, STAGE_KEYS, stagesOf, wDeal, type Deal } from '../commission/index.ts'
import { classifyKinds, custbookFromDeals, ledgerOf } from '../customer/index.ts'
import { applyDealImport, planDealImport } from '../deal-import/index.ts'
import { applyOps } from '../../lib/ledgerStore'

const W = DEFAULT_WEIGHTS
const deal = (o: Partial<Deal> = {}): Deal => ({ id: 1, no: '100', name: 'مشتری', month: 0, amount: '100000000', funnel: 'won', stages: [...STAGE_KEYS], settle: 'cash', kind: 'new', channel: 'unofficial', leadGen: '', ...o })

describe('هفت مرحلهٔ پورسانت', () => {
	it('وزن‌ها دقیقاً ۵/۱۰/۲۰/۱۵/۳۵/۱۰/۵ و جمع ۱۰۰', () => {
		expect(STAGES.map((s) => s.k)).toEqual(['lead', 'pre', 'funnel', 'follow', 'close', 'post', 'fin'])
		expect(STAGE_KEYS.map((k) => W[k])).toEqual([5, 10, 20, 15, 35, 10, 5])
		expect(STAGE_KEYS.reduce((s, k) => s + W[k], 0)).toBe(100)
		expect(freshS().weights).toEqual(W)
	})
	it('هر مرحله به‌تنهایی = وزنِ خودش؛ چرخهٔ کامل = ۱۰۰', () => {
		for (const k of STAGE_KEYS) expect(wDeal(deal({ stages: [k] }), W)).toBe(W[k])
		expect(wDeal(deal(), W)).toBe(100)
		expect(roleCount(deal())).toBe(7)
	})
	it('مشارکتِ مدیر نصفِ بستن؛ لیدساز/مالی/پشتیبانِ در مهلت سهمِ خودشان را می‌برند', () => {
		expect(wDeal(deal({ mgrShare: true }), W)).toBe(100 - 17.5)
		expect(wDeal(deal({ leadGen: 'علی' }), W)).toBe(95)
		expect(roleCount(deal({ leadGen: 'علی' }))).toBe(6)
		expect(wDeal(deal({ finBy: 'مالی' }), W)).toBe(95)
		expect(wDeal(deal({ supportGen: 'پشتیبان', supportSla: true }), W)).toBe(90)
		expect(wDeal(deal({ supportGen: 'پشتیبان', supportSla: false }), W)).toBe(100)
		expect(stagesOf(deal({ stages: undefined, close: 'nolead' }))).toEqual(['pre', 'funnel', 'follow', 'close', 'post', 'fin'])
	})
	it('کسرِ رسمی و مبنای ردیف (معلق = ۰)', () => {
		const S = freshS()
		expect(commAmount(deal({ channel: 'official' }), S)).toBe(90000000)
		expect(rowBasis(deal({ channel: 'official', stages: ['close'] }), S).basis).toBeCloseTo(90000000 * 0.35)
		expect(rowBasis(deal({ settle: 'hold' }), S).basis).toBe(0)
	})
	it('period: پله‌ها، نقد/چک/معلق، سهمِ مراحل', () => {
		const S = freshS()
		const inv = [deal({ id: 1, amount: '30000000' }), deal({ id: 2, amount: '20000000', settle: 'check' }), deal({ id: 3, amount: '10000000', settle: 'hold' }), deal({ id: 4, funnel: 'advance' })]
		const T = period(inv, S)
		expect(T.eligible).toBe(50000000)
		expect(T.commission).toBeCloseTo((40e6 - 25e6) * 0.03 + (50e6 - 40e6) * 0.036)
		expect(T.funnel.advance.n).toBe(1)
		expect(T.byStage.close.basis).toBeCloseTo(50e6 * 0.35)
		expect(T.payNow + T.payCheck).toBeCloseTo(T.commission)
		expect(T.payPend).toBeGreaterThan(0)
	})
})

/* ---------- ایمپورت: سالِ مالی، تاریخ و ساعت فقط از سلولِ «تغییر مرحله» ---------- */
const person = (id: number, name: string, inv: Deal[] = []) => ({ id, name, role: 'sales', S: freshS(), inv, invY: { '1405': inv } })
const blob = (extra: Record<string, unknown> = {}) => {
	const p1 = person(1, 'سارا', [deal({ id: 10, no: 'A-1', name: 'کافه رشت', month: 0 })])
	;(p1.invY as Record<string, Deal[]>)['1404'] = [deal({ id: 5, no: 'OLD-1', name: 'کافه قدیمی', month: 5 })]
	return { fy: '1405', gid: 20, years: { '1405': {}, '1404': {}, '1403': {} }, people: [p1, person(2, 'نیما')], importLog: [], ...extra } as any
}
// ساختارِ واقعیِ خروجیِ Joolio: «ورود» (تاریخ)، «تغییر مرحله» (ساعت تاریخ)، «معامله» (شناسهٔ یکتا)؛ بدونِ ستونِ «سال مالی»
const R = (o: Record<string, unknown>) => ({ 'ورود': '1405/02/01', 'تغییر مرحله': '10:00:00 1405/02/10', 'معامله': '', 'شرکت': 'مشتری', 'ارزش': 5000000, 'کارشناس': 'سارا', 'مرحله': 'بستن', ...o })
const opts = { mode: 'append' as const, rial: false }

describe('ایمپورت — منبعِ سالِ مالی و تاریخ = «تغییر مرحله»', () => {
	it('۱) ایمپورتِ معتبر بدونِ ستونِ «سال مالی»', () => {
		const P = planDealImport([R({ 'معامله': 'N1', 'تغییر مرحله': '16:32:51 1405/06/31' })], blob(), opts)
		expect(P.error).toBeUndefined()
		expect(P.cnt.valid).toBe(1)
		const d = P.groups['سارا'][0]
		expect([d.saleDate, d.saleTime, d.fy, d.month, d.stageChangedAt]).toEqual(['1405/06/31', '16:32:51', '1405', 5, '16:32:51 1405/06/31'])
	})
	it('۲) ستونِ قدیمیِ «سال مالی» منبع را override نمی‌کند', () => {
		const P = planDealImport([R({ 'معامله': 'N1', 'سال مالی': '1404' }), R({ 'معامله': 'N2', 'سال مالی': '1405', 'تغییر مرحله': '09:00:00 1404/11/02' })], blob(), opts)
		expect(P.rows.map((r) => [r.no, r.fy, r.st])).toEqual([['N1', '1405', 'valid'], ['N2', '1404', 'previous']])
	})
	it('۳) سالِ ستونِ «ورود» جایگزینِ سالِ مالی نمی‌شود', () => {
		const P = planDealImport([R({ 'معامله': 'N1', 'ورود': '1404/12/20', 'تغییر مرحله': '08:15:00 1405/01/05' })], blob(), opts)
		expect([P.rows[0].fy, P.rows[0].st, P.groups['سارا'][0].saleDate]).toEqual(['1405', 'valid', '1405/01/05'])
	})
	it('۴) خطای روشن: سالِ مالیِ تعریف‌نشده، ستونِ مفقود و ستونِ مبهم', () => {
		const P = planDealImport([R({ 'معامله': 'N1', 'تغییر مرحله': '10:00:00 1406/01/01' })], blob(), { ...opts, source: 'deal.xlsx', sheet: 'Worksheet' })
		expect(P.rows[0].st).toBe('invalid')
		expect(P.rows[0].why).toContain('سالِ مالیِ 1406 در سیستم تعریف نشده')
		for (const part of ['«deal.xlsx»', 'برگهٔ «Worksheet»', 'ردیف 2', 'ستون «تغییر مرحله»', '10:00:00 1406/01/01']) expect(P.rows[0].why).toContain(part)
		const noCol = R({ 'معامله': 'N1' }); delete (noCol as Record<string, unknown>)['تغییر مرحله']
		expect(planDealImport([{ ...noCol, 'سال مالی': '1405', 'تاریخ': '1405/02/02' }], blob(), opts).error).toContain('تغییر مرحله')
		expect(planDealImport([{ ...R({ 'معامله': 'N1' }), 'تغییر مرحله_1': '10:00:00 1405/02/10' }], blob(), opts).error).toContain('چند بار')
	})
	it('۵) سه نوع رقم، حفظِ مقدارِ خام و ساعت، ردِ تاریخِ نامعتبر', () => {
		const rows = [R({ 'معامله': 'N1', 'تغییر مرحله': '۱۶:۳۲:۵۱ ۱۴۰۵/۰۶/۳۱' }), R({ 'معامله': 'N2', 'تغییر مرحله': '١٦:٣٢:٥١ ١٤٠٥/٠٦/٣١' }), R({ 'معامله': 'N3', 'تغییر مرحله': '16:32:51 1405/07/31' }), R({ 'معامله': 'N4', 'تغییر مرحله': '' })]
		const P = planDealImport(rows, blob(), opts)
		expect(P.rows.map((r) => r.st)).toEqual(['valid', 'valid', 'invalid', 'invalid'])
		expect(P.groups['سارا'].map((d) => [d.saleDate, d.saleTime, d.stageChangedAt])).toEqual([['1405/06/31', '16:32:51', '۱۶:۳۲:۵۱ ۱۴۰۵/۰۶/۳۱'], ['1405/06/31', '16:32:51', '١٦:٣٢:٥١ ١٤٠٥/٠٦/٣١']])
		expect(P.rows[2].why).toContain('تاریخِ شمسیِ نامعتبر')
		expect(P.rows[2].raw).toBe('16:32:51 1405/07/31')
	})
	it('۶) جابه‌جاییِ ستون‌ها نتیجه را عوض نمی‌کند (تشخیص با هدر، نه شمارهٔ ستون)', () => {
		const rows = [R({ 'معامله': 'N1' }), R({ 'معامله': 'N2', 'تغییر مرحله': '11:11:11 1405/03/03' })]
		const rev = rows.map((r) => Object.fromEntries(Object.entries(r).reverse()))
		const a = planDealImport(rows, blob(), opts), b = planDealImport(rev, blob(), opts)
		expect(JSON.stringify(b.groups)).toBe(JSON.stringify(a.groups))
		expect(b.cnt).toEqual(a.cnt)
	})
	it('۷) پیش‌نمایش = ثبتِ نهایی؛ بار دوم هیچ (idempotent)؛ inv و invY یکسان؛ سال‌های قبل دست‌نخورده', () => {
		const full = blob()
		const before1404 = JSON.stringify(full.people[0].invY['1404'])
		// N1 دو بار، عیناً یکسان (تکراری)؛ A-1 همان فاکتورِ موجود با همان مشتری و مبلغ (تکراری + تکمیلِ تاریخ)
		const rows = [R({ 'معامله': 'N1', 'تغییر مرحله': '16:32:51 1405/06/31' }), R({ 'معامله': 'N2', 'تغییر مرحله': '10:00:00 1404/03/03' }), R({ 'معامله': 'N1', 'تغییر مرحله': '16:32:51 1405/06/31' }), R({ 'معامله': 'A-1', 'شرکت': 'کافه رشت', 'ارزش': 100000000 })]
		const preview = planDealImport(rows, full, opts)
		const r = applyDealImport(full, rows, { ...opts, fileName: 'f.xlsx', sig: 's', custbook: null })
		expect(r.plan.cnt).toEqual(preview.cnt)
		expect(preview.cnt).toEqual({ valid: 1, previous: 1, duplicate: 2, conflict: 0, invalid: 0 })
		expect(r.plan.rows.map((x) => [x.st, x.fy, x.date, x.time])).toEqual(preview.rows.map((x) => [x.st, x.fy, x.date, x.time]))
		const sara = full.people[0]
		expect(sara.inv).toBe(sara.invY['1405'])
		const n1 = sara.inv.find((d: Deal) => d.no === 'N1')
		expect([n1.saleDate, n1.saleTime, n1.fy]).toEqual(['1405/06/31', '16:32:51', '1405'])
		expect(JSON.stringify(sara.invY['1404'])).toBe(before1404)
		expect(planDealImport(rows, full, opts).cnt.valid).toBe(0)
		expect(new Set(sara.inv.map((d: Deal) => d.id)).size).toBe(sara.inv.length)
	})
	it('تکمیلِ تاریخ و ساعتِ خالیِ فاکتورِ موجود (بدونِ رکوردِ تازه)', () => {
		const full = blob()
		const r = applyDealImport(full, [R({ 'معامله': 'A-1', 'شرکت': 'کافه رشت', 'ارزش': 100000000, 'تغییر مرحله': '12:30:00 1405/01/20' })], { ...opts, fileName: 'f', sig: 's', custbook: null })
		expect(r.plan.dateUpdates).toEqual([{ key: '1:10', date: '1405/01/20', time: '12:30:00' }])
		expect([full.saleDates['1405']['1:10'], full.saleTimes['1405']['1:10'], full.people[0].inv.length]).toEqual(['1405/01/20', '12:30:00', 1])
	})
	it('جایگزینی فقط ماه‌های فایل را عوض می‌کند', () => {
		const full = blob()
		full.people[0].inv.push(deal({ id: 11, no: 'A-2', month: 1 }))
		applyDealImport(full, [R({ 'معامله': 'N9', 'تغییر مرحله': '10:00:00 1405/02/20' })], { mode: 'replace', rial: false, fileName: 'f', sig: 's', custbook: null })
		expect(full.people[0].inv.map((d: Deal) => d.no)).toEqual(['A-1', 'N9'])
	})
	it('سالِ مالیِ فعالِ سیستم غیرِ ۱۴۰۵ → هیچ ثبتی', () => {
		expect(planDealImport([R({})], blob({ fy: '1404' }), opts).error).toBeTruthy()
	})
})

/* ---------- مشتری جدید / تکرار خرید ---------- */
describe('نوعِ مشتری روی کلِ تاریخچه', () => {
	it('خریدِ بستهٔ ماهِ قبل = تکرار؛ معاملهٔ باز قبلی ≠ تکرار؛ ترتیبِ قطعی', () => {
		const inv = [deal({ id: 1, name: 'کافه الف', month: 0, funnel: 'advance' }), deal({ id: 2, name: 'کافه الف', month: 1 }), deal({ id: 3, name: 'کافه  الف', month: 3 }), deal({ id: 4, name: 'کافه ب', month: 2 })]
		const full = { fy: '1405', people: [person(1, 'x', inv)] }
		const { kinds } = classifyKinds(full)
		expect([1, 2, 3, 4].map((i) => kinds.get('0:' + i))).toEqual(['new', 'new', 'repeat', 'new'])
		expect(classifyKinds(full).changes).toEqual(classifyKinds(full).changes)
	})
	it('خریدِ سالِ قبل (invY یا پرتفویِ جولیو) = تکرار', () => {
		const p = person(1, 'x', [deal({ id: 1, name: 'کافه قدیمی' }), deal({ id: 2, name: 'نانوایی' })])
		;(p.invY as Record<string, Deal[]>)['1404'] = [deal({ id: 9, name: 'کافه قدیمی' })]
		const cb = custbookFromDeals([{ name: 's', aoa: [['شرکت', 'ارزش', 'مرحله', 'ورود'], ['نانوایی', '1', 'بستن', '1403/05/01'], ['نانوایی', '1', 'شکست', '1404/05/01']] }])
		const { kinds } = classifyKinds({ fy: '1405', people: [p], custbook: cb })
		expect(kinds.get('0:1')).toBe('repeat')
		expect(kinds.get('0:2')).toBe('repeat')
	})
	it('هویت با موبایلِ مخاطب: دو نامِ متفاوت با یک موبایل = یک مشتری', () => {
		const inv = [deal({ id: 1, name: 'رستوران ساحل', month: 0 }), deal({ id: 2, name: 'ساحل گیلان', month: 2 })]
		const contacts = [{ name: 'رستوران ساحل', mob: '09121234567' }, { comp: 'ساحل گیلان', mob: '۰۹۱۲۱۲۳۴۵۶۷' }]
		expect(classifyKinds({ fy: '1405', people: [person(1, 'x', inv)], contacts }).kinds.get('0:2')).toBe('repeat')
		expect(classifyKinds({ fy: '1405', people: [person(1, 'x', inv)] }).kinds.get('0:2')).toBe('new')
	})
})

describe('ذخیرهٔ دفتر', () => {
	it('patch/add/del روی نسخهٔ سرور؛ inv و invY همیشه یکی', () => {
		const full = blob()
		applyOps(full, [
			{ t: 'patch', ref: { pid: 1, pname: 'سارا', id: 10 }, patch: { settle: 'check', close: undefined } },
			{ t: 'add', ref: { pid: 2, pname: 'نیما', id: 30 }, deal: deal({ id: 30, no: 'Z' }) },
		])
		expect(full.people[0].inv[0].settle).toBe('check')
		expect(full.people[1].inv).toBe(full.people[1].invY['1405'])
		expect(ledgerOf(full.people[1], full, '1405').map((d: Deal) => d.no)).toEqual(['Z'])
		expect(full.gid).toBe(31)
		applyOps(full, [{ t: 'del', ref: { pid: 2, pname: 'نیما', id: 30 } }])
		expect(full.people[1].inv.length).toBe(0)
		expect(() => applyOps(full, [{ t: 'patch', ref: { pid: 1, pname: 'سارا', id: 999 }, patch: { no: 'x' } }])).toThrow()
	})
})

describe('قفلِ شماره، یکتایی و بستنِ مالی', () => {
	const blob2 = () => {
		const a = person(1, 'سارا', [deal({ id: 10, no: 'A-1', name: 'کافه رشت' }), deal({ id: 11, no: '', name: 'تازه' })])
		const b = person(2, 'نیما', [deal({ id: 20, no: 'B-1', name: 'نانوایی', finBy: 'مالی', finClosed: { by: 'مالی', ts: 1 } })])
		return { fy: '1405', gid: 30, years: { '1405': {} }, people: [a, b], importLog: [] } as any
	}
	it('شمارهٔ فاکتور هرگز از رابط تغییر نمی‌کند (حتی خالی)', () => {
		const f = blob2()
		expect(() => applyOps(f, [{ t: 'patch', ref: { pid: 1, pname: 'سارا', id: 10 }, patch: { no: 'X' } }])).toThrow(/غیرقابلِ تغییر/)
		expect(() => applyOps(f, [{ t: 'patch', ref: { pid: 1, pname: 'سارا', id: 11 }, patch: { no: 'A-2' } }])).toThrow(/غیرقابلِ تغییر/)
		expect(f.people[0].inv.map((d: Deal) => d.no)).toEqual(['A-1', ''])
	})
	it('فاکتورِ بستهٔ مالی: ویرایش/حذف/باز کردن از مسیرِ ذخیره ممنوع', () => {
		const f = blob2(), ref = { pid: 2, pname: 'نیما', id: 20 }
		expect(() => applyOps(f, [{ t: 'patch', ref, patch: { settle: 'hold' } }])).toThrow(/بسته/)
		expect(() => applyOps(f, [{ t: 'del', ref }])).toThrow(/بسته/)
		expect(() => applyOps(f, [{ t: 'patch', ref: { pid: 1, pname: 'سارا', id: 10 }, patch: { finClosed: { by: 'x' } } }])).toThrow()
		expect(() => applyOps(f, [{ t: 'person-del', ref: { pid: 2, pname: 'نیما' } }])).toThrow(/حذف نمی‌شود/)
		expect(f.people[1].inv[0].settle).toBe('cash')
	})
	it('ایمپورت: شمارهٔ موجود با دادهٔ دیگر = تعارض، تکرارِ عینی = تکراری؛ جایگزینی فاکتورِ بسته را حذف نمی‌کند', () => {
		const f = blob2()
		const P = planDealImport([R({ 'معامله': 'B-1', 'کارشناس': 'سارا' }), R({ 'معامله': 'C-1', 'کارشناس': 'سارا' }), R({ 'معامله': 'C-1', 'کارشناس': 'سارا' })], f, { mode: 'append', rial: false })
		// B-1 در دفترِ نیما با مشتری و مبلغِ دیگر → تعارض (تطبیقِ خودکار نه)؛ C-1 دو بار عیناً → یکی تکراری
		expect(P.cnt).toEqual({ valid: 1, previous: 0, duplicate: 1, conflict: 1, invalid: 0 })
		expect(P.rows[0].why).toContain('نامِ مشتری، کارشناس، مبلغ')
		applyDealImport(f, [R({ 'معامله': 'Z-9', 'کارشناس': 'نیما', 'تاریخ تغییر مرحله': '1405/01/10' })], { mode: 'replace', rial: false, fileName: 'f', sig: 's', custbook: null })
		expect(f.people[1].inv.map((d: Deal) => d.no)).toEqual(['B-1', 'Z-9'])
	})
	it('ستونِ شمارهٔ فاکتورِ سیما کلیدِ تطبیق است', () => {
		const P = planDealImport([R({ 'معامله': 'J-1', 'شماره فاکتور': 'S-77' })], blob2(), { mode: 'append', rial: false })
		expect(P.groups['سارا'][0].no).toBe('S-77')
	})
	it('کارشناس: افزودن/تغییرِ نام بی‌تکرار، حذف با تقسیمِ دوبارهٔ تارگت', () => {
		const f = blob2()
		f.people[0].level = 'mid'; f.people[1].role = 'support'
		f.budget = { 0: 100 }; f.targets = { 1: [1], 2: [1] }
		applyOps(f, [{ t: 'person-add', person: { id: 0, name: 'کیان' } }])
		expect(f.people.at(-1).name).toBe('کیان')
		expect(f.people.at(-1).inv).toBe(f.people.at(-1).invY['1405'])
		expect(() => applyOps(f, [{ t: 'person-add', person: { id: 0, name: 'کیان' } }])).toThrow(/از قبل/)
		applyOps(f, [{ t: 'person-patch', ref: { pid: 1, pname: 'سارا' }, patch: { name: 'سارا ک' } }])
		applyOps(f, [{ t: 'patch', ref: { pid: 1, pname: 'سارا', id: 10 }, patch: { settle: 'check' } }])   // صفِ قدیمی با نامِ قبلی هم پیدا می‌شود
		expect(f.people[0].inv[0].settle).toBe('check')
		const kian = f.people.at(-1)
		applyOps(f, [{ t: 'person-del', ref: { pid: kian.id, pname: 'کیان' } }])
		expect(f.people.length).toBe(2)
		expect(Object.keys(f.targets)).toEqual(['1'])
		expect(f.targets['1'][0]).toBe(100e6)
	})
})

import { dupInvoices, finStateOf, invoiceKey, isLocked } from '../commission/index.ts'
describe('فاکتورِ تکراری = فقط تطبیقِ دقیقِ شماره میان فاکتورها (معاملهٔ بسته)', () => {
	it('شماره‌های متفاوت هرگز تکراری نیستند', () => {
		const inv = Array.from({ length: 60 }, (_, i) => deal({ id: i, no: String(3000 + i) }))
		expect(dupInvoices(inv).size).toBe(0)
		expect(dupInvoices([deal({ no: '3045' }), deal({ no: '30450' }), deal({ no: '3045-1' }), deal({ no: 'A3045' })]).size).toBe(0)
	})
	it('همان معامله در ماه‌های دیگر (باز/شکست) فاکتورِ تکراری نیست — همان ۴۲/۴۹ گزارشِ نادرستِ قبلی', () => {
		const snapshots = [
			deal({ id: 1, no: '2583', month: 4, funnel: 'advance' }), deal({ id: 2, no: '2583', month: 3, funnel: 'qualify' }), deal({ id: 3, no: '2583', month: 5, funnel: 'lost' }),
			deal({ id: 4, no: '3045', month: 4, funnel: 'advance' }), deal({ id: 5, no: '3045', month: 5, funnel: 'won' }),
			deal({ id: 6, no: '3140', month: 3, funnel: 'qualify' }), deal({ id: 7, no: '3140', month: 5, funnel: 'won' }),
		]
		expect(dupInvoices(snapshots).size).toBe(0)
	})
	it('فقط شمارهٔ دقیقاً یکسان در دو فاکتور = تکراری (یکسان‌سازیِ بی‌ضرر: فاصله، ارقامِ فارسی)', () => {
		expect([...dupInvoices([deal({ id: 1, no: '3381', month: 4 }), deal({ id: 2, no: ' ۳۳۸۱ ', month: 3 })])]).toEqual(['3381'])
		expect(invoiceKey('۳۳ ۸۱')).toBe('3381')
	})
})

describe('سندِ تصویب‌شده/در انتظار/بسته: فقط‌خواندنی', () => {
	const blob3 = () => ({ fy: '1405', gid: 30, people: [person(1, 'سارا', [
		deal({ id: 10, no: 'A-1', finState: 'approved', finApproval: { cash: 1 } }), deal({ id: 11, no: 'A-2', finState: 'submitted' }), deal({ id: 12, no: 'A-3' }),
	])] }) as any
	it('وضعیت‌ها', () => {
		const f = blob3()
		expect(f.people[0].inv.map(finStateOf)).toEqual(['approved', 'submitted', 'draft'])
		expect(f.people[0].inv.map(isLocked)).toEqual([true, true, false])
	})
	it('ویرایش/حذفِ سندِ قفل و دست‌کاریِ وضعیت از مسیرِ ذخیره رد می‌شود', () => {
		const f = blob3(), ref = (id: number) => ({ pid: 1, pname: 'سارا', id })
		expect(() => applyOps(f, [{ t: 'patch', ref: ref(10), patch: { amount: '1' } }])).toThrow(/قفل/)
		expect(() => applyOps(f, [{ t: 'del', ref: ref(11) }])).toThrow(/قفل/)
		expect(() => applyOps(f, [{ t: 'patch', ref: ref(12), patch: { finState: 'approved' } }])).toThrow(/سرور/)
		expect(() => applyOps(f, [{ t: 'add', ref: ref(13), deal: deal({ id: 13, finApproval: { cash: 1 } }) }])).toThrow()
		applyOps(f, [{ t: 'patch', ref: ref(12), patch: { amount: '5' } }])
		expect(f.people[0].inv[2].amount).toBe('5')
		expect(f.people[0].inv[0].amount).toBe('100000000')
	})
	it('ایمپورت: جایگزینی سندِ قفل را حذف نمی‌کند؛ فاکتورِ تازه برای معامله‌ای که فقط عکسِ باز دارد ثبت می‌شود', () => {
		const f = blob3()
		f.people[0].inv.push(deal({ id: 14, no: 'S-1', month: 2, funnel: 'advance' }))
		const P = planDealImport([R({ 'معامله': 'S-1', 'کارشناس': 'سارا', 'تاریخ تغییر مرحله': '1405/05/02' }), R({ 'معامله': 'A-3', 'کارشناس': 'سارا', 'مرحله': 'پیشبرد' })], f, { mode: 'append', rial: false })
		expect(P.cnt).toEqual({ valid: 1, previous: 0, duplicate: 1, conflict: 0, invalid: 0 })
		applyDealImport(f, [R({ 'معامله': 'N-1', 'کارشناس': 'سارا', 'تاریخ تغییر مرحله': '1405/01/05' })], { mode: 'replace', rial: false, fileName: 'f', sig: 's', custbook: null })
		expect(f.people[0].inv.filter((d: Deal) => isLocked(d)).map((d: Deal) => d.no)).toEqual(['A-1', 'A-2'])
	})
})
