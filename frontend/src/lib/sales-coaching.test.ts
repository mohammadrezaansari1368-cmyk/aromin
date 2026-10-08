import { describe, expect, it } from 'vitest'
import type { Deal } from '@/engines/commission'
import { coachingFromJozve } from './sales-coaching'

const D = (o: Partial<Deal>): Deal => ({ id: 1, no: '1', name: 'مشتری', month: 0, amount: '10000000', funnel: 'won', settle: 'cash', kind: 'new', ...o } as Deal)
const many = (n: number, o: (i: number) => Partial<Deal>) => Array.from({ length: n }, (_, i) => D({ id: i + 1, no: String(i + 1), name: 'مشتری ' + i, ...o(i) }))
const ids = (xs: { id: string; tone: string }[]) => xs.map((x) => x.tone + ':' + x.id)

describe('C9 بر اساسِ جزوه', () => {
	it('نرخ تبدیلِ ≥۲۵٪ قوت؛ زیرِ ۱۵٪ ضعف در بستن + پیشنهادِ تمرینِ بستن', () => {
		const good = coachingFromJozve({ deals: [...many(5, () => ({})), ...many(10, () => ({ funnel: 'advance' }))] })
		expect(ids(good)).toContain('strength:conversion')
		const bad = coachingFromJozve({ deals: [D({}), ...many(9, () => ({ funnel: 'lost' }))] })
		expect(ids(bad)).toEqual(expect.arrayContaining(['weakness:conversion', 'action:closing', 'weakness:lost', 'action:revive']))
	})
	it('نمونهٔ کم داوری نمی‌شود (بدونِ حدس)', () => {
		expect(coachingFromJozve({ deals: [D({}), D({ funnel: 'lost' })] })).toEqual([])
	})
	it('پارتو: وابستگی به ۲۰٪ مشتریان ضعف است و پیشنهادِ بزرگ‌کردنِ بازار دارد', () => {
		const deals = many(10, (i) => ({ amount: i === 0 ? '900000000' : '1000000' }))
		expect(ids(coachingFromJozve({ deals }))).toEqual(expect.arrayContaining(['weakness:pareto', 'action:market']))
		expect(ids(coachingFromJozve({ deals: many(10, () => ({})) }))).toContain('strength:pareto')
	})
	it('سرعت، توقف و پیگیری', () => {
		const fast = many(5, () => ({ entry: '1405/06/01', stageChangedAt: '10:00:00 1405/06/11' }))
		const r = coachingFromJozve({ deals: fast, stagnant: 2, follow: 3, today: '1405/07/01' })
		expect(ids(r)).toEqual(expect.arrayContaining(['strength:speed', 'weakness:stagnant', 'action:chunk', 'weakness:follow', 'action:follow-plan']))
		expect(r.find((x) => x.id === 'speed')!.text).toContain('۱۰ روز')
	})
	it('میانگینِ فاکتور فقط در مقایسه با تیم داوری می‌شود', () => {
		const mine = many(3, () => ({ amount: '50000000' }))
		const team = [...mine, ...many(6, () => ({ amount: '10000000' }))]
		expect(ids(coachingFromJozve({ deals: mine, teamDeals: team }))).toContain('strength:ticket')
		expect(ids(coachingFromJozve({ deals: mine }))).not.toContain('strength:ticket')
	})
	it('هر مورد مرجعِ جزوه دارد', () => {
		const r = coachingFromJozve({ deals: [D({}), ...many(9, () => ({ funnel: 'lost', settle: 'hold' }))], stagnant: 1, follow: 1 })
		expect(r.length).toBeGreaterThan(3)
		for (const x of r) expect(x.ref).toMatch(/^جزوه/)
	})
})
