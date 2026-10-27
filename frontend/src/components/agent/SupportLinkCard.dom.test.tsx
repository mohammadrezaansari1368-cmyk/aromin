// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import SupportLinkCard from './SupportLinkCard'
import type { Session } from '@/lib/auth'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let cleanup = () => {}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows a safe queue projection and generates then revokes a link', async () => {
 const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === 'POST' ? (JSON.parse(String(init.body)).action === 'revoke' ? {ok:true,enabled:false} : {ok:true,enabled:true,token:'synthetic-capability'}) : {ok:true,enabled:false,requests:[{reference:'ref-demo',status:'queued',createdAt:'2026-10-27T10:00:00Z',resultNote:'<img src=x onerror=alert(1)>'}]} }))
 vi.stubGlobal('fetch', fetcher)
 const el = document.createElement('div'); document.body.append(el); const root = createRoot(el)
 cleanup = () => { act(() => root.unmount()); el.remove() }
 await act(async () => root.render(<SupportLinkCard session={{token:'synthetic',tenant:'team',role:'manager'} as Session} />))
 expect(el.textContent).toContain('ref-demo'); expect(el.querySelector('img')).toBeNull()
 await act(async () => { (Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'ساخت لینک') as HTMLButtonElement).click() })
 expect((el.querySelector('input[aria-label="لینک مشتری"]') as HTMLInputElement).value).toContain('/support#synthetic-capability')
 await act(async () => { (Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'ابطال لینک') as HTMLButtonElement).click() })
 expect(el.querySelector('input[aria-label="لینک مشتری"]')).toBeNull()
})
it('surfaces unconfigured service without inventing queue items', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => ({ok:false,json:async () => ({ok:false,error:'not_configured'})})))
 const el = document.createElement('div'); const root = createRoot(el)
 cleanup = () => { act(() => root.unmount()) }
 await act(async () => root.render(<SupportLinkCard session={{token:'synthetic'} as Session} />))
 expect(el.querySelector('[role="alert"]')?.textContent).toContain('not_configured')
 expect(el.querySelectorAll('tbody tr')).toHaveLength(0)
})
