// @vitest-environment jsdom
// 3.9.67: skills from GitHub — preview shows text + scripts that are not run, install needs the password, toggle, remove.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SkillInstaller from './SkillInstaller'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session
const PV = { id: 'abcdefabcdef', name: 'pricing-objections', description: 'اعتراضِ قیمت', body: '# اعتراض\nاول ارزش', source: { url: 'https://github.com/o/r/tree/' + 'a'.repeat(40) + '/p', sha: 'a'.repeat(40) }, ignored: ['p/scripts/run.py'], notRun: ['p/scripts/run.py'], size: 40 }
let root: Root, el: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement
const type = async (sel: string, v: string) => {
	const t = el.querySelector(sel) as HTMLInputElement
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(t, v)
	await act(async () => { t.dispatchEvent(new Event('input', { bubbles: true })) })
}
beforeEach(() => {
	fetchMock = vi.fn(async (url: string, init: RequestInit) => {
		const b = JSON.parse(String(init.body))
		if (url.endsWith('/preview')) return { ok: true, json: async () => ({ ok: true, skill: PV }) }
		if (url.endsWith('/install')) return b.password === 'pw' ? { ok: true, json: async () => ({ ok: true }) } : { ok: false, status: 403, json: async () => ({ ok: false, error: 'رمزِ فعلیِ حساب نادرست است.' }) }
		return { ok: true, json: async () => ({ ok: true, removed: 1 }) }
	})
	vi.stubGlobal('fetch', fetchMock)
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })

describe('SkillInstaller', () => {
	it('preview → wrong password refused → install with password → reload', async () => {
		const onChanged = vi.fn(), onToggle = vi.fn()
		await act(async () => root.render(<SkillInstaller session={session} agent="sales" installed={[]} onToggle={onToggle} onChanged={onChanged} />))
		await type('input[dir=ltr]', 'https://github.com/o/r/tree/main/p')
		await act(async () => btn('پیش‌نمایش').click()); await flush()
		const pv = el.querySelector('[data-testid=skill-preview]')!
		expect(pv.textContent).toContain('pricing-objections')
		expect(pv.textContent).toContain('اجرا نمی‌شود')
		expect(pv.textContent).toContain('اول ارزش')
		expect(btn('نصب').disabled).toBe(true)
		await type('input[type=password]', 'wrong'); await act(async () => btn('نصب').click()); await flush()
		expect(el.textContent).toContain('رمزِ فعلیِ حساب نادرست است.')
		await type('input[type=password]', 'pw'); await act(async () => btn('نصب').click()); await flush()
		const inst = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/install')).map(([, i]) => JSON.parse(String(i.body)))
		expect(inst.at(-1)).toMatchObject({ url: 'https://github.com/o/r/tree/main/p', agents: ['sales'], password: 'pw' })
		expect(onChanged).toHaveBeenCalled()
		expect(el.textContent).toContain('نصب شد (خاموش)')
	})
	it('lists installed skills with toggle and remove', async () => {
		const onChanged = vi.fn(), onToggle = vi.fn()
		vi.stubGlobal('confirm', () => true)
		await act(async () => root.render(<SkillInstaller session={session} agent="sales" installed={[{ id: PV.id, name: PV.name, description: '', enabled: false, source: PV.source }]} onToggle={onToggle} onChanged={onChanged} />))
		await act(async () => (el.querySelector('[data-testid=skills] input[type=checkbox]') as HTMLInputElement).click())
		expect(onToggle).toHaveBeenCalledWith(PV.id, true)
		await act(async () => btn('حذف').click()); await flush()
		expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/agent/skills/remove')
		expect(onChanged).toHaveBeenCalled()
	})
})
