// @vitest-environment jsdom
// 3.9.75: Council Room (Roast Room UI) — only ready seats can be picked, the council plays, the coach's verdict shows, the Library adds entries.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CouncilRoom, { shapesFor } from './CouncilRoom'
import type { Session } from '@/lib/auth'

vi.mock('./Globe', () => ({ default: () => <div data-testid="council-globe" /> }))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
const seat = (key: string, short: string, ready: boolean, portrait = true) => ({ key, name: 'Dr. ' + short, short, initials: short[0], pillar: 'p', question: 'q', color: '#123456', brain: false, ready, portrait, entries: [] })
let root: Root, el: HTMLDivElement, calls: { url: string; body: Record<string, unknown> }[]
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement

beforeEach(() => {
	calls = []
	vi.stubGlobal('matchMedia', () => ({ matches: true }))            // reduced motion → the council plays instantly
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		const body = init.body ? JSON.parse(String(init.body)) : {}
		calls.push({ url, body })
		if (url.startsWith('/api/council/seats')) return { ok: true, json: async () => ({ ok: true, chair: 'Coach', default: ['alavi', 'raftari', 'bezos'], seats: [seat('alavi', 'Alavi', true), seat('raftari', 'Raftari', false), seat('bezos', 'Bezos', true)] }) }
		if (url.startsWith('/api/council/ask')) return { ok: true, json: async () => ({ ok: true, skipped: [], cards: [{ seat: 'alavi', ok: true, stance: 'موافق', score: 8, line: 'با ارزش بفروش.', why: [] }, { seat: 'bezos', ok: true, stance: 'مشروط', score: 6, line: 'Two-way door.', why: [] }], verdict: { ok: true, label: 'مشروط', call: 'اول آزمایش کن.', carried: ['Alavi: value'], next: ['آزمایش دو هفته‌ای'] } }) }
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
	it('seats only ready advisors around the globe, plays the council and shows the verdict sheet', async () => {
		await act(async () => root.render(<CouncilRoom session={session} />)); await flush()
		expect(el.querySelector('[data-testid=council-globe]')).not.toBeNull()
		expect(el.textContent).toContain('What decision do you need help with?')
		expect(btn('Raftari').disabled).toBe(true)
		expect(el.querySelectorAll('img[src^="/council/bezos-"]').length).toBeGreaterThan(0)
		const ta = el.querySelector('textarea') as HTMLTextAreaElement
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'قیمت اشتراک را ۲۰ درصد بالا ببریم؟')
		await act(async () => { ta.dispatchEvent(new Event('input', { bubbles: true })) })
		await act(async () => btn('Convene the council').click()); await flush()
		expect(calls.find((c) => c.url.startsWith('/api/council/ask'))!.body.seats).toEqual(['alavi', 'bezos'])
		expect(el.querySelector('[data-testid=council-verdict]')!.textContent).toContain('اول آزمایش کن.')
		await act(async () => btn('Read the verdict').click())
		expect(document.querySelector('[aria-label=Verdict]')!.textContent).toContain('آزمایش دو هفته‌ای')
	})
	it('adds a text entry to a seat in the Library', async () => {
		await act(async () => root.render(<CouncilRoom session={session} />)); await flush()
		await act(async () => btn('Library').click())
		await act(async () => ([...el.querySelectorAll('button[aria-expanded]')].find((b) => b.textContent?.includes('Raftari')) as HTMLButtonElement).click())
		const ta = el.querySelector('textarea[aria-label="Library text for Raftari"]') as HTMLTextAreaElement
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Nader Raftari on running a century-old restaurant …')
		await act(async () => { ta.dispatchEvent(new Event('input', { bubbles: true })) })
		await act(async () => btn('Add text').click()); await flush()
		expect(calls.find((c) => c.url.startsWith('/api/council/knowledge'))!.body.seat).toBe('raftari')
	})
})
