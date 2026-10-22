// 3.9.63: homepage auto-open — exact-path and first-interaction conditions, preview flag, caps.
import { describe, expect, it } from 'vitest'
import { canShow, countsAsInteraction, firstMatch, isPreviewUrl, matches, newGate, normPath, recordShow, type Caps, type Ctx, type Trigger } from './core'

const HOME: Trigger[] = [
	{ id: 'home-first-tap', when: { pathExact: '/', firstInteraction: true }, emotion: 'happy' },
	{ id: 'home-8s', when: { pathExact: '/', minSeconds: 8 }, emotion: 'happy' },
]
const ctx = (url: string, o: Partial<Ctx> = {}): Ctx => ({ url, seconds: 0, scroll: 0, returning: false, ...o })
const caps: Caps = { perSession: 1, perDay: 3, cooldownMin: 30, dismissCooldownMin: 240 }

describe('pathExact', () => {
	it('matches only the homepage, ignoring query, hash and trailing slash', () => {
		expect(normPath('/?utm=1#x')).toBe('/')
		expect(normPath('/shop/')).toBe('/shop')
		const t = HOME[1]
		expect(matches(t, ctx('https://shop.test/', { seconds: 8 }))).toBe(true)
		expect(matches(t, ctx('https://shop.test/?utm_source=x', { seconds: 9 }))).toBe(true)
		expect(matches(t, ctx('https://shop.test/product/a', { seconds: 60 }))).toBe(false)   // not substring matching
		expect(matches(t, ctx('https://shop.test/', { seconds: 7 }))).toBe(false)
	})
})

describe('firstInteraction', () => {
	it('fires on the first tap at /, before the 8 s fallback', () => {
		expect(firstMatch(HOME, ctx('https://shop.test/'), new Set())).toBeNull()
		expect(firstMatch(HOME, ctx('https://shop.test/', { interacted: true }), new Set())?.id).toBe('home-first-tap')
		expect(firstMatch(HOME, ctx('https://shop.test/', { seconds: 8 }), new Set())?.id).toBe('home-8s')
		expect(firstMatch(HOME, ctx('https://shop.test/blog', { interacted: true, seconds: 30 }), new Set())).toBeNull()
	})
	it('links, submit buttons and opted-out elements do not count as an interaction', () => {
		const el = (hit: boolean) => ({ closest: () => (hit ? {} : null) })
		expect(countsAsInteraction(el(false))).toBe(true)
		expect(countsAsInteraction(el(true))).toBe(false)
		expect(countsAsInteraction(null)).toBe(true)                 // e.g. a key press with no element target
	})
})

describe('caps and preview', () => {
	it('caps still apply to the seeded triggers', () => {
		let g = newGate()
		expect(canShow(g, 0, caps, 1_000)).toBe(true)
		g = recordShow(g, 1_000)
		expect(canShow(g, 1, caps, 2_000)).toBe(false)       // once per session
	})
	it('only ?aromin_preview=1 is a preview', () => {
		expect(isPreviewUrl('?aromin_preview=1')).toBe(true)
		expect(isPreviewUrl('?a=b&aromin_preview=1')).toBe(true)
		expect(isPreviewUrl('?aromin_preview=0')).toBe(false)
		expect(isPreviewUrl('')).toBe(false)
	})
})
