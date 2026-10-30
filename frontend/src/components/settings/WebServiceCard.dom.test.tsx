// @vitest-environment jsdom
// 3.9.69: «وب سرویس» — create a key (password required) → shown once → listed by prefix only → revoke.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebServiceCard from './WebServiceCard'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
const FAKE_KEY = 'ark_' + 'k'.repeat(40)
let root: Root, el: HTMLDivElement, keys: Record<string, unknown>[], fetchMock: ReturnType<typeof vi.fn>
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement
const type = async (sel: string, v: string) => {
	const t = el.querySelector(sel) as HTMLInputElement
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(t, v)
	await act(async () => { t.dispatchEvent(new Event('input', { bubbles: true })) })
}
beforeEach(() => {
	keys = []
	fetchMock = vi.fn(async (url: string, init: RequestInit) => {
		const body = init.body ? JSON.parse(String(init.body)) : {}
		if (url.endsWith('/revoke')) { keys = keys.map((k) => ({ ...k, revoked: true })); return { ok: true, json: async () => ({ ok: true, revoked: true }) } }
		if (init.method === 'POST') {
			if (body.password !== 'pw') return { ok: false, status: 403, json: async () => ({ ok: false, error: 'رمزِ فعلیِ حساب نادرست است.' }) }
			keys = [{ id: 1, name: body.name, prefix: FAKE_KEY.slice(0, 12), scopes: body.scopes, createdBy: 'م', createdAt: '۱۴۰۵/۰۷/۳۰', lastUsedAt: null, revoked: false, revokedAt: null }]
			return { ok: true, json: async () => ({ ok: true, key: FAKE_KEY }) }
		}
		return { ok: true, json: async () => ({ ok: true, endpoint: '/api/mcp', legacyToken: true, keys,
			scopes: [{ key: 'attendance:write', label: 'ثبتِ خروجیِ کارکرد (هاریکان)', tools: ['save_attendance_export'] }, { key: 'agent:ask', label: 'پرسش از ایجنتِ آرومین', tools: ['ask_aromin_agent'] }] }) }
	})
	vi.stubGlobal('fetch', fetchMock)
	vi.stubGlobal('confirm', () => true)
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })

describe('WebServiceCard', () => {
	it('creates a key once, lists it by prefix, and revokes it', async () => {
		await act(async () => root.render(<WebServiceCard session={session} />)); await flush()
		expect(el.textContent).toContain('/api/mcp')
		expect(el.textContent).toContain('ثبتِ خروجیِ کارکرد (هاریکان)')
		await type('input[aria-label="نامِ کلید"]', 'پلِ هاریکان')
		await type('input[type=password]', 'wrong')
		await act(async () => btn('ساختِ کلید').click()); await flush()
		expect(el.textContent).toContain('رمزِ فعلیِ حساب نادرست است.')
		await type('input[type=password]', 'pw')
		await act(async () => btn('ساختِ کلید').click()); await flush()
		expect(el.querySelector('[data-testid=ws-fresh]')!.textContent).toContain(FAKE_KEY)
		const list = el.querySelector('[data-testid=ws-keys]')!.textContent!
		expect(list).toContain(FAKE_KEY.slice(0, 12)); expect(list).not.toContain(FAKE_KEY)
		await act(async () => btn('ذخیره کردم').click())
		expect(el.textContent).not.toContain(FAKE_KEY)                          // gone after the user confirms
		await act(async () => btn('باطل کردن').click()); await flush()
		expect(el.textContent).toContain('باطل‌شده')
	})
})
