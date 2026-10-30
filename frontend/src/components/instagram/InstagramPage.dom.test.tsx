// @vitest-environment jsdom
// 3.9.73: Instagram tab — live analysis feed, panel sections, and a reply is sent only after the manager confirms.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InstagramPage from './InstagramPage'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
const PANEL = { at: '2026-10-22T05:00:00Z', profile: { username: 'aromin.online', followers_count: 296, media_count: 65 }, average: 300,
	analysis: [{ id: 'm1', hook: '۳ اشتباهِ صندوق‌داری؟', score: 1400, likes: 40, comments: 2, views: 900, x: 4.7, reason: 'هوکِ عددی' }],
	viral: { patterns: ['هوکِ سؤالی'], note: 'یادداشت', compare: {} }, plan: [{ day: 'شنبه', idea: 'ایده', hook: 'هوکِ آماده', format: 'ریل' }], summary: '',
	inbox: [{ id: 'c:c1', kind: 'comment', from: 'cafe_a', text: 'قیمت؟', agent: 'sales', category: 'مذاکره و فروش', reply: 'در دایرکت می‌گوییم' }] }
let root: Root, el: HTMLDivElement, posts: { url: string; body: Record<string, unknown> }[], liveRuns: number
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement

beforeEach(() => {
	posts = []; liveRuns = 0
	vi.stubGlobal('confirm', () => true)
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		if (init.body) posts.push({ url, body: JSON.parse(String(init.body)) })
		const j = url.startsWith('/api/instagram/status') ? { ok: true, keySet: true, connected: true, username: 'aromin.online', enabled: true, lastRun: null, running: false }
			: url.startsWith('/api/instagram/panel') ? { ok: true, panel: PANEL }
				: url.startsWith('/api/instagram/live') ? (liveRuns++, { ok: true, running: false, events: [{ n: 1, t: '08:00:01', kind: 'done', text: '✅ پنل به‌روز شد' }] })
					: { ok: true, started: true }
		return { ok: true, json: async () => j }
	}))
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('InstagramPage', () => {
	it('renders the four sections and sends a reply only on click', async () => {
		await act(async () => root.render(<InstagramPage session={session} goSettings={() => {}} />)); await flush()
		for (const id of ['ig-analysis', 'ig-viral', 'ig-inbox', 'ig-plan']) expect(el.querySelector(`[data-testid=${id}]`)).not.toBeNull()
		expect(el.textContent).toContain('هوکِ عددی')
		expect(posts.length).toBe(0)
		await act(async () => btn('ارسال').click()); await flush()
		expect(posts[0]).toEqual({ url: '/api/instagram/reply?tenant=team', body: { id: 'c:c1', text: 'در دایرکت می‌گوییم' } })
		expect(btn('فرستاده شد').disabled).toBe(true)
	})
	it('streams the live analysis feed', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true })
		await act(async () => root.render(<InstagramPage session={session} goSettings={() => {}} />)); await flush()
		await act(async () => btn('تحلیلِ زنده').click()); await flush()
		await act(async () => { vi.advanceTimersByTime(1100) }); await flush()
		expect(liveRuns).toBeGreaterThan(0)
		expect(el.querySelector('[data-testid=ig-live]')!.textContent).toContain('✅ پنل به‌روز شد')
	})
})
