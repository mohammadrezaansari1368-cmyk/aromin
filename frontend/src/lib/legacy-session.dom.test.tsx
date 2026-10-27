// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import LegacyHost from '../components/LegacyHost'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

it('sends a refreshed dashboard session to an already open legacy frame', async () => {
  const el = document.createElement('div'); document.body.append(el)
  const root = createRoot(el)
  const session = { user: 'synthetic', role: 'manager' as const, pass: '', name: 'Synthetic', token: 'first' }
  await act(async () => root.render(<LegacyHost session={session} panel="p-inv" reload={false} />))
  const frame = el.querySelector('iframe')!
  const send = vi.spyOn(frame.contentWindow!, 'postMessage')
  await act(async () => root.render(<LegacyHost session={{ ...session, token: 'refreshed' }} panel="p-inv" reload={false} />))
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ aromin: 'auth', token: 'refreshed' }), location.origin)
  await act(async () => root.unmount()); el.remove()
})

it('import sends current session and rejects sibling frame messages', () => {
  const source = readFileSync(resolve('src/components/ImportPage.tsx'), 'utf8')
  expect(source).toContain('token: sessionRef.current?.token')
  expect(source).toContain('ev.source !== frame.current?.contentWindow')
})

it('legacy renews an authenticated request and retries a 401 only once', async () => {
  const raw = readFileSync(resolve('../deployment/legacy.html'), 'utf8')
  const code = raw.slice(raw.indexOf('  var DASHBOARD_TOKEN="";'), raw.indexOf('  window.arominGoogleLogin='))
  const win = {} as { arominAuthenticate: (token: string) => Promise<boolean> }
  const fetch = vi.fn(async (url: string) => url === '/api/auth/session' ? { ok: true, json: async () => ({ ok: true }) } : { status: 401 })
  const request = new Function('window', 'fetch', 'acceptSession', 'aiHeaders', 'TENANT', code + '\nreturn authenticatedFetch;')(win, fetch, async () => '', () => ({}), 'synthetic')
  expect(await win.arominAuthenticate('synthetic-current')).toBe(true)
  await request('/api/backup', { method: 'POST' })
  expect(fetch.mock.calls.filter(([url]) => url === '/api/backup')).toHaveLength(2)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/session')).toHaveLength(2)
})

it('import authenticates, reloads, backs up, imports and saves; foreign sources cannot trigger it', async () => {
  const raw = readFileSync(resolve('../deployment/legacy.html'), 'utf8')
  const code = raw.slice(raw.indexOf('  (function importBridge(){'), raw.indexOf('  function _hasInv(f)'))
  const order: string[] = []
  let listener: (e: unknown) => void = () => {}
  const win: Record<string, unknown> = { addEventListener: (_: string, fn: typeof listener) => { listener = fn }, arominAuthenticate: async () => { order.push('auth'); return true } }
  win.parent = win
  const api = { on: true, ready: true, load: async () => { order.push('load'); return { ok: true, full: { people: [{ id: 1 }] } } }, save: async () => { order.push('save'); return { ok: true } } }
  const reply = vi.fn()
  const setup = 'var _appReady=true,_dbT=null,ACCESS={},BUDGET={},PERF={},SERVICE={},TICKETS=[],IMPORTLOG=[],session={role:"manager"},SESSION_TOKEN="synthetic",TENANT="synthetic",activePid=null,GM=0,PEOPLE=[];function snapshot(){return "{}"}function isAdmin(){return true}function _hasRealData(){return true}function _hasInv(){return true}function applySnapshot(){}function tenantFinish(){}function refreshGlobalMonth(){}function render(){};'
  new Function('window','API','location','XLSX','uniImport','authenticatedFetch','localStorage', setup + code)(win, api, location, { read: () => ({}) }, () => { order.push('import'); return {} }, async () => { order.push('backup'); return { json: async () => ({ ok: true }) } }, { setItem: () => {} })
  const data = { aromin: 'import', id: 'fixture', token: 'synthetic-current', files: [{ name: 'fixture.xlsx', buf: new ArrayBuffer(1) }] }
  listener({ origin: location.origin, source: { postMessage: reply }, data })
  listener({ origin: 'https://untrusted.invalid', source: win, data })
  listener({ origin: location.origin, source: win, data: { ...data, files: 'invalid' } })
  expect(order).toEqual([])
  win.postMessage = reply
  listener({ origin: location.origin, source: win, data })
  for (let i = 0; i < 20; i++) await Promise.resolve()
  expect(order).toEqual(['auth', 'load', 'backup', 'import', 'save'])
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ok: true, backup: true, saved: true }), location.origin)
  order.length = 0
  win.arominAuthenticate = async () => { order.push('auth'); return false }
  listener({ origin: location.origin, source: win, data })
  for (let i = 0; i < 20; i++) await Promise.resolve()
  expect(order).toEqual(['auth'])
  expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }), location.origin)
})
