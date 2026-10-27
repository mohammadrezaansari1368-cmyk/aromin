// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import GoogleSettings from './GoogleSettings'
import type { Session } from '@/lib/auth'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
it.each([new TypeError('Failed to fetch'), new DOMException('aborted', 'AbortError')])('explains network failure %s', async error => {
 const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ok:true, configured:true, enabled:false}) }).mockRejectedValueOnce(error)
 vi.stubGlobal('fetch', fetcher)
 const el = document.createElement('div'), root = createRoot(el)
 try {
  await act(async () => root.render(<GoogleSettings session={{role:'manager'} as Session} />))
  await act(async () => (Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'آزمایش اتصال')!).click())
  expect(el.textContent).toContain('اتصال به سرور برقرار نشد یا زمان‌بر شد')
  expect(fetcher.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal)
 } finally { act(() => root.unmount()); vi.unstubAllGlobals() }
})
