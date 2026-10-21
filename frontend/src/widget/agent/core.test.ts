import { describe, expect, it } from 'vitest'
import { EmotionController, EVENT_STATE, STATES, canShow, dayPart, firstMatch, greetingFor, matches, mood, newGate, recordDismiss, recordShow, type Caps, type Trigger } from './core'
import { LOOKS } from './face'

function fakeTimers() {
	let n = 0
	const q = new Map<number, { f: () => void; at: number }>()
	let now = 0
	return {
		t: { set: (f: () => void, ms: number) => { q.set(++n, { f, at: now + ms }); return n }, clear: (h: unknown) => { q.delete(h as number) } },
		advance(ms: number) {
			const end = now + ms
			for (;;) {
				const due = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
				if (!due) break
				q.delete(due[0]); now = due[1].at; due[1].f()
			}
			now = end
		},
	}
}
const caps: Caps = { perSession: 1, perDay: 3, cooldownMin: 30, dismissCooldownMin: 240 }

describe('EmotionController', () => {
	it('has a face look for all 17 states and maps every event', () => {
		expect(STATES).toHaveLength(17)
		STATES.forEach((s) => expect(LOOKS[s]).toBeTruthy())
		Object.values(EVENT_STATE).forEach((s) => expect(STATES).toContain(s))
	})
	it('transitions on runtime events, returns to neutral, then idles and sleeps', () => {
		const ft = fakeTimers(), seen: string[] = []
		const c = new EmotionController((s) => seen.push(s), ft.t, 60_000, 180_000)
		c.emit('open'); expect(c.state).toBe('happy')
		c.emit('typing'); expect(c.state).toBe('listening')
		c.emit('send'); expect(c.state).toBe('thinking')
		c.emit('reply', 'متأسفم، این مورد موجود نیست'); expect(c.state).toBe('concerned')
		ft.advance(3100); expect(c.state).toBe('neutral')
		c.emit('lead'); expect(c.state).toBe('success')
		c.emit('error'); expect(c.state).toBe('error')
		ft.advance(61_000); expect(c.state).toBe('idle')
		ft.advance(121_000); expect(c.state).toBe('sleeping')
		c.emit('wake'); expect(c.state).toBe('surprised')
		expect(seen).toContain('thinking')
	})
	it('mood keywords', () => {
		expect(mood('عالی! ثبت شد')).toBe('happy')
		expect(mood('کدام مدل؟')).toBe('curious')
		expect(mood('باشه')).toBeNull()
	})
})

describe('triggers', () => {
	const ctx = { url: 'https://www.arominco.com/product/pos-1?utm_source=ig&utm_campaign=fall', seconds: 5, scroll: 10, returning: false }
	it('AND of all conditions', () => {
		expect(matches({ id: 'a', when: { path: '/product/', minScroll: 50 } }, ctx)).toBe(false)
		expect(matches({ id: 'a', when: { path: '/product/', minScroll: 50 } }, { ...ctx, scroll: 60 })).toBe(true)
		expect(matches({ id: 'b', when: { path: '/product/*', domain: 'arominco.com', utmSource: 'ig', utmCampaign: 'fall', visitor: 'first' } }, ctx)).toBe(true)
		expect(matches({ id: 'b', when: { visitor: 'returning' } }, ctx)).toBe(false)
		expect(matches({ id: 'c', when: { minSeconds: 30 } }, ctx)).toBe(false)
		expect(matches({ id: 'd', when: { click: '.buy' } }, { ...ctx, clicked: ['.buy'] })).toBe(true)
		expect(matches({ id: 'e', when: { manual: true } }, { ...ctx, manual: ['e'] })).toBe(true)
		expect(matches({ id: 'f', when: {} }, ctx)).toBe(false)
		expect(matches({ id: 'g', enabled: false, when: { urlContains: 'pos' } }, ctx)).toBe(false)
		expect(matches({ id: 'h', when: { domain: 'evil.com' } }, ctx)).toBe(false)
	})
	it('fires each trigger once', () => {
		const ts: Trigger[] = [{ id: 'x', when: { urlContains: 'pos' } }], fired = new Set<string>()
		expect(firstMatch(ts, ctx, fired)?.id).toBe('x'); fired.add('x')
		expect(firstMatch(ts, ctx, fired)).toBeNull()
	})
})

describe('greeting by local time', () => {
	const g = { morning: 'صبح', noon: 'ظهر', afternoon: 'عصر', night: 'شب' }
	it('picks the day part', () => {
		expect([6, 12, 16, 22, 2].map((h) => greetingFor(g, new Date(2026, 9, 21, h)))).toEqual(['صبح', 'ظهر', 'عصر', 'شب', 'شب'])
		expect(dayPart(11)).toBe('noon')
		expect(greetingFor({ ...g, custom: 'ویژه' }, new Date(2026, 9, 21, 6))).toBe('ویژه')
		expect(greetingFor({}, new Date())).toContain('سلام')
	})
})

describe('popup frequency cap / cooldown', () => {
	it('session cap, cooldown, dismiss cooldown and daily cap', () => {
		const t = Date.UTC(2026, 9, 21, 8)
		let g = newGate()
		expect(canShow(g, 0, caps, t)).toBe(true)
		g = recordShow(g, t)
		expect(canShow(g, 1, caps, t + 1000)).toBe(false)                    // perSession
		expect(canShow(g, 0, caps, t + 10 * 60_000)).toBe(false)            // cooldown 30m
		expect(canShow(g, 0, caps, t + 31 * 60_000)).toBe(true)
		g = recordDismiss(g, t + 31 * 60_000)
		expect(canShow(g, 0, caps, t + 60 * 60_000)).toBe(false)            // dismissed → 4h
		expect(canShow(g, 0, caps, t + 5 * 3600_000)).toBe(true)
		g = recordShow(recordShow(g, t + 2), t + 3)
		expect(g.dayCount).toBe(3)
		expect(canShow({ ...g, dismissedAt: 0, last: 0 }, 0, caps, t + 4)).toBe(false) // perDay
	})
})

describe('critical path (client side): trigger → greeting → popup allowed once', () => {
	it('fires the configured trigger, shows the time-based greeting, then caps', () => {
		const cfg = { triggers: [{ id: 'time-30', when: { minSeconds: 30 }, message: '' }] as Trigger[], greetings: { morning: 'صبح بخیر! صاحب کسب‌وکار هستید؟' } }
		const fired = new Set<string>(), now = new Date(2026, 9, 21, 9).getTime()
		const c0 = { url: 'https://arominco.com/', seconds: 10, scroll: 0, returning: false }
		expect(firstMatch(cfg.triggers, c0, fired)).toBeNull()
		const t = firstMatch(cfg.triggers, { ...c0, seconds: 31 }, fired)!
		expect(t.id).toBe('time-30'); fired.add(t.id)
		let g = newGate(); expect(canShow(g, 0, caps, now)).toBe(true); g = recordShow(g, now)
		expect(t.message || greetingFor(cfg.greetings, new Date(now))).toContain('صاحب کسب‌وکار')
		expect(canShow(g, 1, caps, now + 1000)).toBe(false)
	})
})
