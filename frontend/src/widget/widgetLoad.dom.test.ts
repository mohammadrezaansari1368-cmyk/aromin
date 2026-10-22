// @vitest-environment jsdom
// Behavioural check of public/widget.js in a DOM: which scripts it requests, and when.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SRC = readFileSync(resolve(process.cwd(), 'public/widget.js'), 'utf8')   // vitest runs in frontend/
const CFG = { ok: true, enabled: true, title: 'آرومین', welcome: 'سلام', color: '#004991', placeholder: '', desktop: { side: 'right', bottom: 24, offset: 24 }, mobile: { side: 'right', bottom: 16, offset: 16 } }

const injected = () => [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src).filter((u) => /widget-(bot|agent)\.js/.test(u))
const bot = () => injected().filter((u) => u.includes('widget-bot.js'))
const flush = () => new Promise((r) => setTimeout(r, 0))

async function boot(search = '') {
	window.history.replaceState(null, '', '/' + search)
	document.body.innerHTML = '<p id="page">صفحه</p><a id="nav" href="/other">لینک</a>'
	const s = document.createElement('script'); s.setAttribute('data-site-id', 's1'); s.src = 'https://dash.test/widget.js'
	document.body.appendChild(s)
	new Function(SRC)()                                     // currentScript is null → it finds script[data-site-id]
	for (let i = 0; i < 5; i++) await flush()
	const host = document.querySelector('aromin-chat-widget') as HTMLElement & { shadowRoot: ShadowRoot }
	return host.shadowRoot
}

beforeEach(() => {
	localStorage.clear()
	vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ status: 200, json: async () => (String(url).endsWith('/config') ? CFG : { ok: true }) })))
	;(window as unknown as { __arominWidget_s1?: number }).__arominWidget_s1 = undefined
})
afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; document.body.innerHTML = '' })

describe('widget.js loading', () => {
	it('page load, page clicks and scroll never request the 3D bot', async () => {
		await boot()
		expect(bot()).toEqual([])
		document.getElementById('page')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
		document.getElementById('page')!.click()
		window.dispatchEvent(new Event('scroll'))
		expect(bot()).toEqual([])
	})
	it('the popup bubble (inside .w) does not load it; the launcher does, exactly once', async () => {
		const root = await boot()
		const bubble = document.createElement('div'); bubble.className = 'ag-pop'; root.querySelector('.w')!.appendChild(bubble)
		bubble.dispatchEvent(new Event('pointerenter')); bubble.dispatchEvent(new Event('pointerdown', { bubbles: true }))
		expect(bot()).toEqual([])
		const btn = root.querySelector('.btn') as HTMLButtonElement
		btn.dispatchEvent(new Event('pointerenter'))
		btn.click()                                           // opening the panel too: still one request
		expect(bot().length).toBe(1)
	})
	it('asset version query comes from the single APP_VERSION placeholder (dev build → v=dev)', async () => {
		const root = await boot()
		;(root.querySelector('.btn') as HTMLButtonElement).click()
		expect(bot()[0]).toMatch(/widget-bot\.js\?v=dev$/)
		expect(SRC).not.toMatch(/BOT_V = '\d/)
		expect(SRC.match(/__AROMIN_APP_VERSION__/g)?.length).toBe(1)
	})
	it('?aromin_preview=1 sends no telemetry and marks chat as preview', async () => {
		const root = await boot('?aromin_preview=1')
		const f = fetch as unknown as ReturnType<typeof vi.fn>
		;(root.querySelector('.btn') as HTMLButtonElement).click()
		expect(f.mock.calls.some(([u]) => String(u).endsWith('/event'))).toBe(false)
		const ta = root.querySelector('textarea') as HTMLTextAreaElement; ta.value = 'سلام'
		root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
		await flush()
		const chat = f.mock.calls.find(([u]) => String(u).endsWith('/chat'))
		expect(chat && JSON.parse(chat[1].body).preview).toBe(true)
	})
})
