// @vitest-environment jsdom
// 3.9.66: dashboard update — SHA-256 shown, chunks carry the token + sha256, token cleared after use, status polled to the end.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReleaseCard, { b64, hex } from './ReleaseCard'
import RecipientLinks from '@/components/agent/RecipientLinks'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const FAKE = 'x'.repeat(40)
let root: Root, el: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>, last: Record<string, string> = {}
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)) }) }
const json = (j: unknown, ok = true, status = 200) => ({ ok, status, json: async () => j })

beforeEach(() => {
	last = {}
	fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (url === '/api/release/status') return json({ ok: true, enabled: true, watcher: true, current: last.state === 'ok' ? '3.9.66' : '3.9.65', pending: [], last })
		if (url === '/api/release/chunk') {
			const b = JSON.parse(String(init!.body))
			if ((init!.headers as Record<string, string>)['x-update-token'] !== FAKE) return json({ ok: false, error: 'unauthorized' }, false, 401)
			if (b.i === b.n - 1) { last = { state: 'ok', file: 'aromin-' + b.id + '.tgz' }; return json({ ok: true, complete: true, file: last.file, version: '3.9.66' }) }
			return json({ ok: true, complete: false })
		}
		if (url.startsWith('/api/agent/recipient-links')) return json({ ok: true, recipients: [{ phone: '09121112233', name: 'سارا', baleLinked: false, telegramLinked: false, baleLink: 'https://ble.ir/arominbot?start=abc', telegramLink: '', startCommand: '/start abc' }] })
		return json({})
	})
	vi.stubGlobal('fetch', fetchMock)
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })

async function choose(bytes: Uint8Array, name = 'aromin-deploy-3.9.66.tgz') {
	const input = el.querySelector('input[type=file]') as HTMLInputElement
	const f = new File([bytes as Uint8Array<ArrayBuffer>], name)
	Object.defineProperty(input, 'files', { value: [f], configurable: true })
	await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) }); await flush()
}
const typeToken = async (v: string) => {
	const t = el.querySelector('input[type=password]') as HTMLInputElement
	const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
	await act(async () => { set.call(t, v); t.dispatchEvent(new Event('input', { bubbles: true })) })
}
const clickSend = async () => { await act(async () => { ([...el.querySelectorAll('button')].find((b) => b.textContent === 'ارسال و نصب') as HTMLButtonElement).click() }); await flush(12) }

describe('ReleaseCard', () => {
	it('hashes, uploads in chunks with the token and sha256, clears the token and reports the result', async () => {
		await act(async () => root.render(<ReleaseCard pollMs={10} />)); await flush()
		expect(el.textContent).toContain('3.9.65')
		const bytes = new Uint8Array(1024 * 1024 + 7).map((_, i) => i % 251)
		await choose(bytes)
		const want = hex(await crypto.subtle.digest('SHA-256', bytes))
		expect(el.querySelector('[data-testid=sha]')!.textContent).toBe(want)
		await typeToken(FAKE)
		await clickSend()
		const chunks = fetchMock.mock.calls.filter(([u]) => u === '/api/release/chunk').map(([, i]) => JSON.parse(String(i.body)))
		expect(chunks.length).toBe(3)                                         // 512 KB chunks
		expect(chunks.every((c) => c.sha256 === want)).toBe(true)
		expect(chunks.map((c) => atob(c.data).length).reduce((a, b) => a + b, 0)).toBe(bytes.length)
		expect((el.querySelector('input[type=password]') as HTMLInputElement).value).toBe('')
		expect(el.textContent).toContain('نصب شد و سالم است')
		expect(el.textContent).toContain('3.9.66')
	})
	it('rejects a wrong file name and shows a wrong-token error', async () => {
		await act(async () => root.render(<ReleaseCard pollMs={10} />)); await flush()
		await choose(new Uint8Array([1, 2, 3]), 'other.zip')
		expect(el.textContent).toContain('فقط فایلِ aromin-deploy')
		await choose(new Uint8Array([1, 2, 3]))
		await typeToken('wrong-token-value')
		await clickSend()
		expect(el.textContent).toContain('توکنِ به‌روزرسانی نادرست است.')
	})
	it('b64 matches btoa for large inputs', () => {
		const bytes = new Uint8Array(70000).map((_, i) => i % 256)
		expect(atob(b64(bytes)).length).toBe(70000)
	})
})

describe('RecipientLinks', () => {
	it('lists phone recipients with their link status and copy button', async () => {
		const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
		await act(async () => root.render(<RecipientLinks session={session} version={0} />)); await flush()
		expect(el.querySelector('[data-testid=recipient-links]')!.textContent).toContain('09121112233')
		expect(el.textContent).toContain('بله: وصل نشده')
		expect(el.textContent).toContain('کپی لینکِ بله')
	})
})
