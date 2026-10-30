// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { usePerf, type Read } from '../data/hooks'
import { clearPerfCache, PERF_CACHE_TTL } from '../data/perfCache'
import InstrumentCluster from '../cluster/InstrumentCluster'
import type { Session } from '@/lib/auth'
import { DEFAULT_SETTINGS, processSheet, rules } from '@/lib/performanceDays'

vi.mock('@/lib/auth', () => ({ authHeaders: () => ({}) }))
vi.mock('@/lib/data', () => ({ currentTenant: () => 'synthetic' }))

const session = { user: 'wo3', pass: 'synthetic', role: 'manager' } as Session
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
let reads: Read<{ value: number }>, mounts: number, unmounts: number
let pending: ((value: unknown) => void)[]
function Cluster() {
 useEffect(() => { mounts++; return () => { unmounts++ } }, [])
 return <InstrumentCluster main={null} side={null} minis={[]} title="Synthetic" period="Period"
  contracts={reads.data!.value} avgContract={null} workdays={null} activeId="" onSelect={() => {}} onConnect={() => {}} />
}
function Harness() {
 reads = usePerf(session, 'summary', { start: '1405/07/01' })
 return reads.loading ? <p>Loading</p> : reads.data ? <Cluster /> : <p>Error</p>
}
async function resolve(value: number) {
 await act(async () => { pending.shift()!({ ok: true, json: async () => ({ ok: true, value }) }) })
}

beforeEach(() => {
 vi.useFakeTimers(); clearPerfCache(); mounts = unmounts = 0; pending = []
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
 vi.stubGlobal('matchMedia', () => ({ matches: true }))
 vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => pending.push(resolve))))
 host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
 await act(async () => root.unmount()); host.remove(); clearPerfCache(); vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('WO3 stale while revalidate', () => {
 it('uses Zurvan holiday and closure codes in the Excel-free attendance analysis', () => {
  for (const status of ['holiday', 'closure']) {
   const result = processSheet([{ 'شماره کارت': '10', 'تاریخ': '1405/07/01', status }], 'Synthetic', rules(DEFAULT_SETTINGS),
    { person: 'Synthetic', personHow: 'manual', owner: null, ownerName: '', ownerHow: 'none' }, null, null, {}, '')
   expect(result?.rows[0].code).toBe('official_holiday')
  }
 })
 it('keeps the mounted cluster and data through expiry and invalidation', async () => {
  await act(async () => root.render(<Harness />))
  expect(reads.loading).toBe(true)
  await resolve(20)
  const cluster = host.querySelector('.pv-cabin')
  await act(async () => { vi.advanceTimersByTime(PERF_CACHE_TTL) })
  expect(reads).toMatchObject({ data: { value: 20 }, loading: false, refreshing: true })
  expect(host.querySelector('.pv-cabin')).toBe(cluster)
  await resolve(21)
  await act(async () => clearPerfCache())
  expect(reads).toMatchObject({ data: { value: 21 }, loading: false, refreshing: true })
  await resolve(22)
  expect(reads).toMatchObject({ data: { value: 22 }, loading: false, refreshing: false })
  expect(mounts).toBe(1); expect(unmounts).toBe(0)
 })
 it('keeps stale data on a failed background request', async () => {
  await act(async () => root.render(<Harness />)); await resolve(20)
  await act(async () => clearPerfCache())
  await act(async () => { pending.shift()!({ ok: false, json: async () => ({ error: 'Synthetic failure' }) }) })
  expect(reads).toMatchObject({ data: { value: 20 }, loading: false, refreshing: false, error: 'Synthetic failure' })
  expect(unmounts).toBe(0)
 })
 it('starts independent source and summary requests without directory enablement and never clears on filter change', () => {
  const page = readFileSync(resolvePath(import.meta.dirname, '../PerformancePageV2.tsx'), 'utf8')
  expect(page).not.toContain('clearPerfCache')
  expect(page).not.toContain('!!directory.data')
  expect(page).not.toContain("from '@/components/performance/PerformanceWorkspace'")
  expect(page).not.toMatch(/import \{[^}]*processSheet[^}]*\} from '@\/lib\/performance'/)
 })
})
