import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findStageChangeColumn, knownFiscalYears, parseStageChange } from './stage-change'
import { excelSaleDate, saleDateOf, saleTimeOf } from './sales-date'
import { financeControl, rolesPatch } from './ledger-roles'
import type { Deal } from '@/engines/commission'

// همان بردارهایی که deployment/tests/test_stage_dates.py برای پیاده‌سازیِ پایتونی می‌خواند
const V = JSON.parse(readFileSync(new URL('../../../deployment/tests/fixtures/stage_change_vectors.json', import.meta.url), 'utf-8'))

describe('تجزیهٔ «تغییر مرحله» — بردارهای مشترک با پایتون', () => {
	for (const c of V.cases) it(JSON.stringify(c.in), () => {
		const r = parseStageChange(c.in) as Record<string, unknown>
		expect(r.ok).toBe(c.ok)
		for (const k of ['date', 'time', 'fy', 'error']) if (k in c) expect(r[k]).toBe(c[k])
		if (c.ok) expect(r.raw).toBe(c.in)
	})
	for (const h of V.headers) it('هدر ' + JSON.stringify(h.keys), () => {
		const r = findStageChangeColumn(h.keys)
		if (h.error) expect('error' in r).toBe(true)
		else expect(r).toEqual({ col: h.col })
	})
	it('سال‌های مالیِ معتبر فقط از مدل', () => {
		expect([...knownFiscalYears({ years: { 1404: {}, '1405': {}, bad: {} }, fy: '1405' })].sort()).toEqual(['1404', '1405'])
	})
})

describe('تاریخ و ساعتِ دفتر و گزارش‌ها از همان قرارداد', () => {
	const d = (o: Partial<Deal>) => ({ id: 1, ...o }) as Deal
	it('قالبِ واقعیِ «ساعت تاریخ» خوانده می‌شود (قبلاً خالی می‌شد)', () => {
		expect(excelSaleDate('16:32:51 1405/06/31')).toBe('1405/06/31')
	})
	it('دادهٔ قبلیِ دارای مقدارِ خام بدونِ ایمپورتِ مجدد درست نمایش داده می‌شود', () => {
		const x = d({ stageChangedAt: '16:32:51 1405/06/31' })
		expect([saleDateOf(x, {}, 7), saleTimeOf(x, {}, 7)]).toEqual(['1405/06/31', '16:32:51'])
	})
	it('مقدارِ ثبت‌شده بر مقدارِ خام مقدم است؛ خامِ نامعتبر حدس زده نمی‌شود', () => {
		expect(saleDateOf(d({ saleDate: '1405/06/30', stageChangedAt: '16:32:51 1405/06/31' }))).toBe('1405/06/30')
		expect(saleDateOf(d({ stageChangedAt: 'نامعلوم' }))).toBe('')
	})
})

describe('بخشِ جمع‌شونده: payload و مجوزها', () => {
	const base = { id: 9, stages: ['lead', 'close'], mgrShare: true, finBy: 'نورا' } as Deal
	it('۱۱) بسته/بی‌تغییر بودنِ بخش هیچ فیلدی را حذف یا reset نمی‌کند', () => {
		expect(rolesPatch(base, { stages: ['close', 'lead'], mgrShare: true })).toEqual({})
	})
	it('ویرایشِ مجاز فقط همان فیلدها را می‌فرستد', () => {
		expect(rolesPatch(base, { stages: ['lead', 'pre', 'close'], mgrShare: false })).toEqual({ stages: ['lead', 'pre', 'close'], close: undefined, mgrShare: false })
	})
	it('مجوزِ تأیید مالی: مالی تا پیش از ثبت؛ پس از ثبت فقط مدیر؛ فروش هرگز؛ سندِ قفل هرگز', () => {
		const fresh = { id: 1 } as Deal
		expect(financeControl('finance', fresh).editable).toBe(true)
		expect(financeControl('finance', base).editable).toBe(false)
		expect(financeControl('manager', base).editable).toBe(true)
		expect(financeControl('sales', fresh).editable).toBe(false)
		expect(financeControl('manager', { ...base, finState: 'approved' } as Deal).editable).toBe(false)
	})
})
