// @vitest-environment jsdom
// 3.9.71: «اتاق شورا» — only ready seats can sit, the council plays, the coach's verdict shows, the encyclopedia adds entries per seat.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CouncilRoom, { shapesFor } from './CouncilRoom'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
const seat = (key: string, short: string, ready: boolean, portrait = false) => ({ key, name: short, short, initials: short[0], pillar: 'p', question: 'q', color: '#123456', brain: portrait, ready, portrait, entries: [] })
let root: Root, el: HTMLDivElement, calls: { url: string; body: Record<string, unknown> }[]
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t)) as HTMLButtonElement

beforeEach(() => {
	calls = []
	vi.stubGlobal('matchMedia', () => ({ matches: true }))            // reduced motion → the council plays instantly
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		const body = init.body ? JSON.parse(String(init.body)) : {}
		calls.push({ url, body })
		if (url.startsWith('/api/council/seats')) return { ok: true, json: async () => ({ ok: true, chair: 'تحلیل و کوچینگ فروش', default: ['alavi', 'parsi', 'bezos'], seats: [seat('alavi', 'علوی', true), seat('parsi', 'پارسی', false), seat('bezos', 'بزوس', true, true)] }) }
		if (url.startsWith('/api/council/ask')) return { ok: true, json: async () => ({ ok: true, skipped: [], cards: [{ seat: 'alavi', ok: true, stance: 'موافق', score: 8, line: 'با ارزش بفروش.', why: [] }, { seat: 'bezos', ok: true, stance: 'مشروط', score: 6, line: 'Two-way door.', why: [] }], verdict: { ok: true, label: 'مشروط', call: 'اول آزمایش کن.', carried: [], next: ['آزمایش دو هفته‌ای'] } }) }
		return { ok: true, json: async () => ({ ok: true }) }
	}))
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })

describe('CouncilRoom', () => {
	it('maps Persian letters to mouth shapes', () => {
		expect(shapesFor('بازار')).toEqual(['base', 'open'])
		expect(shapesFor('رو')).toEqual(['mid'])
	})
	it('seats only ready advisors, plays the council and shows the coach verdict', async () => {
		await act(async () => root.render(<CouncilRoom session={session} />)); await flush()
		expect(el.textContent).toContain('تحلیل و کوچینگ فروش')
		expect([...el.querySelectorAll('[data-seat]')].map((f) => f.getAttribute('data-seat'))).toEqual(['alavi', 'bezos'])
		expect(btn('پارسی').disabled).toBe(true)
		expect(el.querySelectorAll('img[src^="/council/bezos-"]').length).toBe(4)
		const ta = el.querySelector('textarea') as HTMLTextAreaElement
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'قیمت را ۲۰ درصد بالا ببریم؟')
		await act(async () => { ta.dispatchEvent(new Event('input', { bubbles: true })) })
		await act(async () => btn('شروعِ شورا').click()); await flush()
		expect(calls.find((c) => c.url.startsWith('/api/council/ask'))!.body.seats).toEqual(['alavi', 'bezos'])
		expect(el.querySelector('[data-testid=council-verdict]')!.textContent).toContain('اول آزمایش کن.')
	})
	it('adds a text entry to a seat in the encyclopedia', async () => {
		await act(async () => root.render(<CouncilRoom session={session} />)); await flush()
		await act(async () => btn('دانشنامه').click())
		await act(async () => ([...el.querySelectorAll('button[aria-expanded]')].find((b) => b.textContent?.includes('پارسی')) as HTMLButtonElement).click())
		const ta = el.querySelector('textarea[aria-label="متنِ دانشنامهٔ پارسی"]') as HTMLTextAreaElement
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'پدرام پارسی دربارهٔ سیستم‌سازیِ عملیات می‌گوید …')
		await act(async () => { ta.dispatchEvent(new Event('input', { bubbles: true })) })
		await act(async () => btn('افزودنِ متن').click()); await flush()
		expect(calls.find((c) => c.url.startsWith('/api/council/knowledge'))!.body.seat).toBe('parsi')
	})
})
