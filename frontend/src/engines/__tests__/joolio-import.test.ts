/**
 * 3.9.92 regression — Joolio deal import (دفتر فروش) and the backup that gates every import save.
 * A: every source row gets exactly one status (none silently lost) · B: re-import is idempotent (0 new, count unchanged)
 * D: independent deals of the same customer/phone stay independent · backup: payload is sent as an object (the CDN edge drops
 *    the same state as a ~2 MB escaped JSON string, so «بک‌آپِ سرور گرفته نشد» aborted every import).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDealImport, planDealImport } from '@/engines/deal-import/index.ts'
import { ledgerOf } from '@/engines/customer/index.ts'

const row = (no: string, stage: string, amount: number, extra: Record<string, unknown> = {}) => ({
	'تغییر مرحله': '10:00:00 1405/08/02', معامله: no, کارشناس: 'سارا', شرکت: 'کافه نارنج', 'شماره موبایل اصلی': '09120000000', ارزش: amount, مرحله: stage, ...extra,
})
const fresh = () => ({ fy: '1405', years: { 1405: {} }, gid: 10, people: [{ id: 1, name: 'سارا', inv: [], invY: { 1405: [] }, S: {} }] })
const opts = { mode: 'append' as const, rial: false, source: 'f.xlsx', sheet: 's' }
const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)

describe('Joolio import (3.9.92)', () => {
	const rows = [row('D-1', 'بستن', 120), row('D-2', 'بستن', 80), row('D-3', 'آغاز کردن', 0), row('D-4', 'از‌دست‌رفته', 0, { 'دلیل شکست': 'قیمت' }), row('D-5', 'بستن', 0)]

	it('A: every row is accounted for (valid + previous + duplicate + conflict + invalid = rows)', () => {
		const P = planDealImport(rows, fresh(), opts)
		expect(total(P.cnt)).toBe(rows.length)
		expect(P.cnt).toMatchObject({ valid: 4, invalid: 1 })   // D-5: won with zero value is rejected with a reason, not dropped
		expect(P.rows.find((r) => r.no === 'D-5')!.why).toMatch(/ارزش/)
	})

	it('B + D: re-import is idempotent and same-customer deals stay independent', () => {
		const full = fresh()
		applyDealImport(full, rows, { ...opts, fileName: 'f', sig: 's', custbook: null })
		const deals = () => full.people.flatMap((p) => ledgerOf(p, full, '1405'))
		expect(deals().length).toBe(4)
		expect(new Set(deals().map((d: { no: string }) => d.no))).toEqual(new Set(['D-1', 'D-2', 'D-3', 'D-4']))   // same customer + phone, 4 deals
		const again = planDealImport(rows, full, opts)
		expect(again.cnt.valid).toBe(0)
		expect(total(again.cnt)).toBe(rows.length)
		applyDealImport(full, rows, { ...opts, fileName: 'f', sig: 's', custbook: null })
		expect(deals().length).toBe(4)
	})
})

describe('backup payload (3.9.92)', () => {
	afterEach(() => vi.unstubAllGlobals())
	it('sends the state to /api/backup as an object, never as an escaped JSON string', async () => {
		const state = { fy: '1405', people: [{ id: 1, name: 'سارا' }] }
		const bodies: Record<string, unknown>[] = []
		vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === 'POST') bodies.push({ url, ...JSON.parse(String(init.body)) })
			return { ok: true, json: async () => (init?.method === 'POST' ? { ok: true } : { ok: true, full: state }) }
		}))
		vi.doMock('@/lib/auth', () => ({ activeAuthHeaders: () => ({}), activeManagerSession: () => true }))
		const { saveState } = await import('@/lib/forecastStore')
		await saveState(() => undefined, { forceBackup: true, tag: 't' })
		const b = bodies.find((x) => String(x.url).includes('/api/backup'))!
		expect(typeof b.payload).toBe('object')
		expect(b.payload).toMatchObject({ fy: '1405' })
	})
})
