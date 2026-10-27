// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth'
import InstagramConnectorCard from './InstagramConnectorCard'
const api = vi.hoisted(() => vi.fn(async (_s, action) => action === 'status' ? {keySet:true} : {url:'https://example.com/oauth'}))
vi.mock('./igApi', () => ({igApi:api}))
vi.mock('@/components/settings/SecretField', () => ({ default: () => null, messengersApi: async () => ({secrets:{}, keyConfigured:true}) }))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
it('creates a connection link with reauth and opens a new tab', async () => {
 const opened = vi.spyOn(window, 'open').mockReturnValue(null)
 const el = document.createElement('div'), root = createRoot(el)
 try {
  await act(async () => root.render(<InstagramConnectorCard session={{role:'manager'} as Session} />))
  const input = el.querySelector('input[type=password]') as HTMLInputElement
  await act(async () => {
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'fake-password')
   input.dispatchEvent(new Event('input', {bubbles:true}))
  })
  const button = Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'ساخت لینکِ اتصال')
  expect(button).toBeDefined()
  await act(async () => button!.click())
  expect(api).toHaveBeenCalledWith(expect.anything(), 'link', {password:'fake-password'})
  expect(opened).toHaveBeenCalledWith('https://example.com/oauth', '_blank', 'noopener,noreferrer')
 } finally { act(() => root.unmount()); opened.mockRestore() }
})
