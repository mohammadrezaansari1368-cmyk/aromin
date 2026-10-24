// @vitest-environment jsdom
// 3.9.68: live tiles — deal numbers from the state, gauges say «داده‌ای نیست» without data, the forecast bento shows engine numbers,
// and the Harikan status replaces the attendance upload.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dealKpis, niceScale, radarAxes } from './liveKpis'
import ForecastBento from '@/components/forecast/ForecastBento'
import { GaugeTile } from '@/components/dashboard/gauges/GaugeTiles'
import { setLiveGauges, GAUGE_SPECS } from '@/components/dashboard/gauges/kpi'
import HarikanStatus from '@/components/performance/HarikanStatus'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const TODAY = '1405/07/30'
const deal = (x: Record<string, unknown>) => ({ funnel: 'won', amount: 10_000_000, month: 6, ...x })

describe('dealKpis', () => {
	const state = {
		fy: '1405', BUDGET: { '6': 100 },          // Mehr budget: 100 million
		people: [{ name: 'سارا', inv: [
			deal({ saleDate: TODAY, settle: 'cash', name: 'کافه الف' }),
			deal({ saleDate: '1405/07/29', settle: 'check', name: 'کافه ب', kind: 'repeat' }),
			deal({ saleDate: '1405/07/10', settle: 'hold', amount: 20_000_000, name: 'کافه ج' }),
			{ funnel: 'advance', amount: 5_000_000, entry: '1405/05/01' },                       // open > 40 days
			{ funnel: 'advance', amount: 5_000_000, entry: '1405/07/25' },
		], invY: { '1404': [deal({ name: 'کافه الف' }), deal({ name: 'کافه قدیمی' })] } }],
	}
	it('computes today, the 14-day series, the settlement split, budget left, staleness and retention', () => {
		const k = dealKpis(state, TODAY)
		expect(k.salesTodayM).toBe(10)
		expect(k.salesByDayM).toHaveLength(14)
		expect(k.salesByDayM.slice(-2)).toEqual([10, 10])
		expect([k.cashM, k.checkM, k.heldM]).toEqual([10, 10, 20])
		expect(k.heldSharePct).toBe(50)
		expect(k.monthWonM).toBe(40)
		expect(k.remainingBudgetPct).toBe(60)
		expect(k.stale40).toBe(1)
		expect(k.funnelSpeedPct).toBe(50)
		expect(k.repeatSharePct).toBe(25)
		expect(k.retentionPct).toBe(50)                 // 1 of 2 last-year customers bought again
	})
	it('empty state gives nulls, never invented numbers', () => {
		const k = dealKpis({ people: [] }, TODAY)
		expect([k.cashSharePct, k.remainingBudgetPct, k.retentionPct, k.funnelSpeedPct]).toEqual([null, null, null, null])
		expect(Object.values(radarAxes(null, k, null)).every((v) => v === null)).toBe(true)
	})
	it('nice scales', () => {
		expect(niceScale(37)).toEqual({ max: 50, step: 10 })
		expect(niceScale(0, 10)).toEqual({ max: 10, step: 2 })
		expect(niceScale(130)).toEqual({ max: 200, step: 40 })
	})
})

let root: Root, el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

describe('tiles', () => {
	it('a gauge without data says «داده‌ای نیست»; with data it shows the business label and value', async () => {
		await act(async () => root.render(<GaugeTile id="tach" />))
		expect(el.textContent).toContain('داده‌ای نیست')
		expect(el.textContent).not.toContain('نمونه')
		await act(async () => setLiveGauges({
			readings: { tach: { value: 7, trend: null, updatedAt: 1 }, speed: { value: 0, trend: null, updatedAt: 1 }, fuel: { value: 0, trend: null, updatedAt: 1 }, temp: { value: 0, trend: null, updatedAt: 1 }, power: { value: 0, trend: null, updatedAt: 1 } },
			specs: { tach: { ...GAUGE_SPECS.tach, label: 'تماس‌های پاسخ‌دادهٔ امروز', unit: 'تماس', max: 10, step: 2, redFrom: undefined } },
			empty: { tach: false, speed: true, fuel: true, temp: true, power: true },
		}))
		expect(el.textContent).toContain('تماس‌های پاسخ‌دادهٔ امروز')
		expect(el.textContent).not.toContain('داده‌ای نیست')          // the value itself animates (needle sweep)
	})
	it('forecast bento renders engine numbers and empty states', async () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))   // reduced motion → final numbers at once
		const forecast = Array(12).fill(100_000_000), actual = [120_000_000, 90_000_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		await act(async () => root.render(<ForecastBento year={1405} target={1_200_000_000} safeTarget={1_000_000_000} forecast={forecast} actual={actual}
			channels={[{ name: 'رسمی', value: 150_000_000 }, { name: 'غیررسمی', value: 60_000_000 }]} settle={{ cash: 100_000_000, check: 70_000_000, hold: 40_000_000 }} month={1} readiness={67} />))
		await flush()
		const q = (id: string) => el.querySelector(`[data-testid=${id}]`)!.textContent!
		expect(q('fb-hero')).toContain('۱٫۲ میلیارد')              // 12 × 100M forecast
		expect(q('fb-hero')).toContain('جلوتر از برنامه')          // 210M actual vs 200M share to Ordibehesht
		expect(q('fb-target')).toContain('۱۸٪')                    // 210 / 1200 = 17.5 → 18
		expect(q('fb-channels')).toContain('۷۱٫۴٪')
		expect(q('fb-settle')).toContain('معلق تا وصول')
		await act(async () => root.render(<ForecastBento year={1405} target={0} safeTarget={0} forecast={null} actual={Array(12).fill(0)} channels={[]} settle={{ cash: 0, check: 0, hold: 0 }} month={0} readiness={0} />))
		expect(el.textContent).toContain('فروشِ هدف وارد نشده')
		expect(el.textContent).toContain('هنوز پیش‌بینیِ ماهانه یا فروشِ واقعی ثبت نشده')
	})
	it('Harikan status shows the last exports and unmatched codes', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, lastDay: { key: '1405/07/29', people: 5, at: 'x' }, lastMonth: null, days: 4, unmatched: ['10001', '10003'], archive: { at: 'x', moved: { days: 120 } } }) })))
		const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
		await act(async () => root.render(<HarikanStatus session={session} />)); await flush()
		const t = el.querySelector('[data-testid=harikan-status]')!.textContent!
		expect(t).toContain('1405/07/29')
		expect(t).toContain('هنوز نرسیده')
		expect(t).toContain('۲ کدِ پرسنلی')
		expect(t).toContain('۱۲۰ روز')
	})
})
