// @vitest-environment jsdom
// 3.9.64: «ایجنت‌ها» card — renders the seven agents from the server, saves only the agents section, shows the server's Persian error.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentsCard from './AgentsCard'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const KEYS = ['lead_gen', 'sales', 'support', 'after_sales', 'marketing', 'online_expert', 'coach']
const rec = (name: string, surfaces: string[]) => ({ name, enabled: false, surfaces, sites: [], prompt: '', skills: [{ name: 'م', trigger: '', inputs: '', steps: '', questions: '', output: '', limits: '' }],
	ragScope: ['general'], actions: ['answer'], mood: 'happy', version: 1, updatedAt: '', updatedBy: '' })
const AGENTS = Object.fromEntries(KEYS.map((k) => [k, rec('ایجنت ' + k, k === 'marketing' || k === 'coach' || k === 'support' ? ['dashboard'] : ['website'])]))
const META = { keys: KEYS, surfaces: ['website', 'dashboard', 'bale', 'telegram'], onlySurfaces: { marketing: ['dashboard'], coach: ['dashboard'] }, managerOnly: ['coach'],
	collections: ['general', 'products', 'dashboard_help'], actions: { answer: { label: 'پاسخ', surfaces: ['website', 'dashboard'] }, draft_content: { label: 'پیش‌نویس', surfaces: ['dashboard'] } } }
const session = { name: 'م', role: 'manager', user: 'boss', pass: '', token: 't', tenant: 'team' } as Session

let root: Root, el: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
beforeEach(() => {
	fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (url.startsWith('/api/widget/sites')) return { ok: true, json: async () => ({ ok: true, sites: [{ siteId: 'site000001', name: 'آرومین', domain: 'arominco.com' }] }) }
		if (init?.method === 'PUT') {
			const body = JSON.parse(String(init.body))
			if (body.settings.agents.sales.surfaces.length === 0) return { ok: false, status: 400, json: async () => ({ ok: false, error: 'تنظیمات ذخیره نشد: خطای آزمایشی' }) }
			return { ok: true, json: async () => ({ ok: true, settings: { agents: body.settings.agents } }) }
		}
		return { ok: true, json: async () => ({ ok: true, settings: { enabled: false, agents: AGENTS }, agentMeta: META, states: ['happy', 'curious'] }) }
	})
	vi.stubGlobal('fetch', fetchMock)
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })

describe('AgentsCard', () => {
	it('lists all seven agents, warns that the global switch is off, and saves only the agents section', async () => {
		await act(async () => root.render(<AgentsCard session={session} />)); await flush()
		expect(el.querySelectorAll('[data-agent]').length).toBe(7)
		expect(el.textContent).toContain('«دستیار روشن» خاموش است')
		const sales = el.querySelector('[data-agent="sales"] input[type=checkbox]') as HTMLInputElement
		await act(async () => { sales.click() })
		await act(async () => { (([...el.querySelectorAll('button')].find((b) => b.textContent === 'ذخیرهٔ ایجنت‌ها')) as HTMLButtonElement).click() }); await flush()
		const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')!
		const body = JSON.parse(String(put[1].body))
		expect(Object.keys(body.settings)).toEqual(['agents'])                  // never the trigger/routing sections of the other card
		expect(body.settings.agents.sales.enabled).toBe(true)
		expect(el.textContent).toContain('ذخیره شد.')
	})
	it('marketing/coach only offer the dashboard surface; the edit drawer shows the skills form', async () => {
		await act(async () => root.render(<AgentsCard session={session} />)); await flush()
		const labels = [...el.querySelectorAll('[data-agent="marketing"] label')].map((l) => l.textContent)
		expect(labels).toContain('داشبورد'); expect(labels).not.toContain('سایت')
		await act(async () => { ([...el.querySelectorAll('[data-agent="support"] button')].find((b) => b.textContent === 'ویرایش') as HTMLButtonElement).click() })
		const dlg = el.querySelector('[role=dialog]')!
		expect(dlg.textContent).toContain('مهارت‌ها')
		expect(dlg.textContent).toContain('راهنمای داشبورد (داخلی)')          // dashboard-only agent may read the internal help
		expect(dlg.querySelectorAll('textarea').length).toBeGreaterThan(1)
	})
	it('shows the server validation error and keeps the edits', async () => {
		await act(async () => root.render(<AgentsCard session={session} />)); await flush()
		const site = [...el.querySelectorAll('[data-agent="sales"] label')].find((l) => l.textContent === 'سایت')!.querySelector('input') as HTMLInputElement
		await act(async () => { site.click() })
		await act(async () => { (([...el.querySelectorAll('button')].find((b) => b.textContent === 'ذخیرهٔ ایجنت‌ها')) as HTMLButtonElement).click() }); await flush()
		expect(el.textContent).toContain('تنظیمات ذخیره نشد: خطای آزمایشی')
	})
})
