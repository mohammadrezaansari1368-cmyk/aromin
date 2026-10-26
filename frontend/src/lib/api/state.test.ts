import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/auth'
import { createLayoutSaver, loadLayout, LAYOUT_LIST, SAVE_ERROR, SESSION_ERROR, type SavedLayout } from './state'

let tenant = 'team'
vi.mock('@/lib/data', () => ({ currentTenant: () => tenant }))
const session = (user = 'alice'): Session => ({ user, name: user, role: 'manager', pass: '', tenant, token: 'synthetic-session' })
const layout: SavedLayout = [{ id: 'phone', size: 'sm' }]
const ids = ['phone', 'channels']
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
let stored: Map<string, string>
let fetcher: ReturnType<typeof vi.fn>
const savers: ReturnType<typeof createLayoutSaver>[] = []
function saver(s: Session | null, callback = vi.fn()) {
  const result = createLayoutSaver(s, callback)
  savers.push(result)
  return result
}
beforeEach(() => {
  tenant = 'team'
  vi.useFakeTimers()
  stored = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => stored.set(k, v),
  })
  fetcher = vi.fn().mockResolvedValue(reply({ ok: true }))
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => {
  savers.splice(0).forEach((s) => s.dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('debounces and posts only tenant, dedicated list and encoded order with Bearer', async () => {
  const s = session()
  const store = saver(s)
  store.save(layout)
  await vi.advanceTimersByTimeAsync(799)
  expect(fetcher.mock.calls.length).toBe(0)
  store.save([{ id: 'channels', size: 'wide' }])
  await vi.advanceTimersByTimeAsync(800)
  expect(fetcher.mock.calls.length).toBe(1)
  const [url, options] = fetcher.mock.calls[0]
  expect(url).toBe('/api/ui-layout')
  expect(options.method).toBe('POST')
  // Compare presence/validity as booleans so assertion output never includes credentials.
  expect(options.headers.Authorization === `Bearer ${s.token}`).toBe(true)
  expect(JSON.parse(options.body)).toEqual({ tenant: 'team', list: LAYOUT_LIST, order: ['channels:wide'] })
})

it('isolates two users and two tenants and never caches credentials', async () => {
  saver(session()).save(layout)
  saver(session('bob')).save([{ id: 'channels', size: 'lg' }])
  tenant = 'other'
  saver(session()).save([{ id: 'phone', size: 'tall' }])
  expect(stored.size).toBe(3)
  fetcher.mockRejectedValue(new Error('offline'))
  expect(await loadLayout(session(), ids)).toEqual([{ id: 'phone', size: 'tall' }])
  tenant = 'team'
  expect(await loadLayout(session('bob'), ids)).toEqual([{ id: 'channels', size: 'lg' }])
  expect(await loadLayout(session(), ids)).toEqual(layout)
  expect([...stored].some(([k, v]) => (k + v).includes(session().token!))).toBe(false)
  expect([...stored.values()].every((v) => JSON.parse(v).every((w: object) => Object.keys(w).sort().join() === 'id,size'))).toBe(true)
})

it('loads server order with session headers and ignores garbage and duplicate entries', async () => {
  const s = session()
  fetcher.mockResolvedValue(reply({ ok: true, order: ['phone:wide', 'unknown:sm', 'channels:bad', null, {}, { id: 'channels', size: 'sm' }, 'phone:lg', 'channels:tall:extra', 'channels:lg'] }))
  expect(await loadLayout(s, ids)).toEqual([{ id: 'phone', size: 'wide' }, { id: 'channels', size: 'lg' }])
  expect(fetcher.mock.calls[0][0]).toBe('/api/ui-layout?tenant=team&list=dashboard.widgets')
  expect(fetcher.mock.calls[0][1].headers.Authorization === `Bearer ${s.token}`).toBe(true)
  expect(fetcher.mock.calls.length).toBe(1)
})

it('reads full legacy location for session.user only when the server slot is empty', async () => {
  fetcher.mockResolvedValueOnce(reply({ ok: true, order: [] }))
    .mockResolvedValueOnce(reply({ ok: true, full: { dashboardLayout: { alice: layout, bob: [{ id: 'channels', size: 'lg' }] } }, state: { dashboardLayout: { alice: [] } } }))
  expect(await loadLayout(session(), ids)).toEqual(layout)
  expect(fetcher.mock.calls[1][0]).toBe('/api/state?tenant=team')
  expect(stored.size).toBe(1)
  expect(fetcher.mock.calls.every(([, options]) => !options.method)).toBe(true)
})

it('uses scoped cache after empty migration and ignores the old global cache', async () => {
  stored.set('aromin.dash.layout', JSON.stringify([{ id: 'channels', size: 'lg' }]))
  saver(session()).save(layout)
  fetcher.mockResolvedValueOnce(reply({ ok: true, order: [] })).mockResolvedValueOnce(reply({ ok: true, full: {} }))
  expect(await loadLayout(session(), ids)).toEqual(layout)
})

it.each([null, 'mismatch', 'tokenless'] as const)('keeps %s sessions entirely local', async (kind) => {
  const s = kind === null ? null : { ...session(), ...(kind === 'mismatch' ? { tenant: 'elsewhere' } : { token: undefined }) }
  const store = saver(s)
  store.save(layout)
  await vi.advanceTimersByTimeAsync(800)
  await store.retry()
  expect(await loadLayout(s, ids)).toEqual(layout)
  expect(fetcher.mock.calls.length).toBe(0)
})

it.each(['http', 'body', 'network', '401'])('surfaces %s save failure and clears it after retry', async (failure) => {
  const onError = vi.fn()
  const store = saver(session(), onError)
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'))
  else fetcher.mockResolvedValueOnce(reply({ ok: failure === 'http' }, failure === '401' ? 401 : failure === 'http' ? 500 : 200))
  store.save(layout)
  await vi.advanceTimersByTimeAsync(800)
  expect(onError).toHaveBeenLastCalledWith(failure === '401' ? SESSION_ERROR : SAVE_ERROR)
  expect(stored.size).toBe(1)
  await store.retry()
  expect(onError).toHaveBeenLastCalledWith(null)
})

it('cancels pending writes on disposal or tenant changes', async () => {
  const first = saver(session())
  first.save(layout)
  first.dispose()
  saver(session()).save(layout)
  tenant = 'other'
  await vi.advanceTimersByTimeAsync(800)
  expect(fetcher.mock.calls.length).toBe(0)
})

it('does not migrate after a failed authenticated read', async () => {
  fetcher.mockResolvedValue(reply({ ok: true, order: [] }, 401))
  await loadLayout(session(), ids)
  expect(fetcher.mock.calls.length).toBe(1)
})
