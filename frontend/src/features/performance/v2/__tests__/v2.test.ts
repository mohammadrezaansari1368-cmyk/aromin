import { describe, expect, it } from 'vitest'
import { yearDays } from '@/components/performance/PerformanceWorkspace'
import { angle, goodness, PARK, ratio, START, SWEEP } from '../lib/gaugeMath'
import { statusVisual } from '../lib/statusVisual'
import { gaugeMax, groupIssues, tasksMetric, toDays, toMetric, toPerson, toStatus } from '../data/adapters'
import { yearStats } from '../sections/YearHeatmap'
import { shift } from '../sections/CommandBar'

describe('gaugeMath', () => {
	it('null parks the needle; max=0 is 0; clamps both ends', () => {
		expect(ratio(null, 10)).toBeNull(); expect(angle(null)).toBe(PARK)
		expect(ratio(5, 0)).toBe(0); expect(ratio(-3, 10)).toBe(0); expect(ratio(30, 10)).toBe(1)
		expect(angle(1)).toBe(START + SWEEP); expect(ratio(Number.NaN, 10)).toBeNull()
	})
	it('invert flips goodness only', () => { expect(goodness(0.2)).toBe(0.2); expect(goodness(0.2, true)).toBe(0.8); expect(goodness(null, true)).toBeNull() })
})

describe('statusVisual', () => {
	it('five states', () => {
		expect(statusVisual('valid')).toMatchObject({ needle: 'value', arc: 'full', center: 'value', hidden: false })
		expect(statusVisual('partial')).toMatchObject({ arc: 'hatched', center: 'value*' })
		expect(statusVisual('not_computable')).toMatchObject({ needle: 'parked', arc: 'off', center: 'dash' })
		expect(statusVisual('irrelevant').hidden).toBe(true)
		expect(statusVisual('error')).toMatchObject({ needle: 'parked', arc: 'error', center: 'bang' })
	})
})

describe('adapter', () => {
	it('maps API statuses; unknown → not_computable', () => {
		expect(toStatus('no_data')).toBe('not_computable'); expect(toStatus('not_applicable')).toBe('irrelevant'); expect(toStatus('???')).toBe('not_computable')
	})
	it('never turns «not computable» into 0', () => {
		const m = toMetric({ id: 'efficiency', status: 'no_data', value: 0, numerator: 0 })
		expect([m.value, m.numerator, m.status]).toEqual([null, null, 'not_computable'])
		expect(toMetric({ id: 'x', status: 'valid' }).status).toBe('not_computable') // valid without a value
		expect(toMetric(undefined)).toMatchObject({ value: null, records: 0, target: null })
	})
	it('missing person fields are safe', () => {
		expect(toPerson({ id: '7' })).toMatchObject({ name: '—', unit: 'other', tasks: null, metrics: [] })
		expect(tasksMetric(undefined).status).toBe('not_computable'); expect(tasksMetric(0).value).toBe(0)
	})
	it('daily rows filtered; issues merged by reason', () => {
		expect(toDays({ days: [{ date: '1405/01/01', value: 2, status: 'valid' }, { date: 'bad', value: 1, status: 'valid' }] as never })).toEqual([{ date: '1405/01/01', value: 2 }])
		expect(groupIssues([{ reason: 'a' }, { reason: 'a' }, { reason: 'b' }])).toEqual([{ reason: 'a', count: 2 }, { reason: 'b', count: 1 }])
	})
	it('gauge max: % → 100, target×1.25, else team max', () => {
		expect(gaugeMax(toMetric({ id: 'e', unit: '٪', status: 'valid', value: 40 }), [])).toBe(100)
		expect(gaugeMax(toMetric({ id: 'a', unit: 'x', status: 'valid', value: 4, target: 8 }), [])).toBe(10)
		expect(gaugeMax(toMetric({ id: 'a', unit: 'x', status: 'valid', value: 4 }), [9, null])).toBe(9)
	})
})

describe('Jalali calendar', () => {
	it('leap lengths and Saturday-first weeks', () => {
		expect(yearDays(1403)).toHaveLength(366); expect(yearDays(1404)).toHaveLength(365)
		expect(yearDays(1404).find((d) => d.date === '1404/01/02')?.weekday).toBe(0) // Saturday
	})
	it('annual total never invented', () => { expect(yearStats([], '1405/01/01').total).toBeNull(); expect(yearStats([{ date: '1405/01/01', value: 0 }], '1405/01/01').total).toBe(0) })
	it('period stepper wraps years', () => {
		expect(shift({ kind: 'month', year: 1405, month: 1, from: '', to: '' }, -1)).toMatchObject({ year: 1404, month: 12 })
		expect(shift({ kind: 'quarter', year: 1405, month: 11, from: '', to: '' }, 1)).toMatchObject({ year: 1406, month: 2 })
	})
})

import { achieve, dailyTarget, effortOf, workingDays } from '../lib/effort'
describe('effortOf (port of the classic engine)', () => {
	it('no data → none, never 0 hours', () => { const e = effortOf(undefined); expect([e.perDay, e.zone]).toEqual([null, 'none']); expect(effortOf({ talkIn: 100 }).zone).toBe('none') })
	it('task minutes are capped per task (default 30)', () => {
		const e = effortOf({ taskMins: [10, 45, 300], activeDays: 1 })
		expect(e.taskMin).toBe(10 + 30 + 30); expect(effortOf({ taskMins: [10, 45, 300], activeDays: 1 }, 60).taskMin).toBe(10 + 45 + 60)
	})
	it('talk: in+out, else the call-log talkMin; effortMin when no task list', () => {
		expect(effortOf({ talkIn: 60, talkOut: 30, talkMin: 999, activeDays: 1 }).talkMin).toBe(90)
		expect(effortOf({ talkMin: 120, activeDays: 1 }).talkMin).toBe(120)
		expect(effortOf({ effortMin: 50, activeDays: 1 }).taskMin).toBe(50)
	})
	it('zones at the booklet boundaries', () => {
		const z = (h: number) => effortOf({ talkMin: h * 60, activeDays: 1 }).zone
		expect([z(3.9), z(4), z(6), z(6.5), z(7.5), z(7.6)]).toEqual(['low', 'normal', 'normal', 'good', 'good', 'burnout'])
	})
	it('targets and working days', () => {
		expect(achieve(150, 300)).toBe(50); expect(achieve(5, null)).toBeNull(); expect(achieve(null, 10)).toBeNull()
		const month = [{ date: '1405/07/01', weekday: 2 }, { date: '1405/07/02', weekday: 6 }, { date: '1405/07/03', weekday: 0 }]
		expect(workingDays(month, new Set(['1405/07/03']))).toBe(1); expect(dailyTarget(300, 0)).toBeNull(); expect(dailyTarget(300, 25)).toBe(12)
	})
})
