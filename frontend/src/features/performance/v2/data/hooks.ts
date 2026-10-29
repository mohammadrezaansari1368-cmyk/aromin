/** Same endpoints, params and auth headers as v1; AbortController per request + in-memory cache keyed by filter. */
import { useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'

import { perfCacheGeneration, readPerfCache, writePerfCache, subscribePerfCache, perfCacheRemaining } from './perfCache'
export { clearPerfCache } from './perfCache'
export interface Read<T> { data?: T; error?: string; loading: boolean }

export function usePerf<T>(session: Session, view: string, params: Record<string, string>, enabled = true): Read<T> {
	const key = view + '?' + new URLSearchParams({ tenant: currentTenant(), ...params }).toString()
	const ck = session.user + '\u0000' + key
 const [version, setVersion] = useState(0)
 const [state, setState] = useState<{ ck: string; error?: string }>({ ck: '' })
 useEffect(() => subscribePerfCache(() => { setState({ ck: '' }); setVersion((v) => v + 1) }), [])
 useEffect(() => {
  if (!enabled) return
  const ac = new AbortController(), generation = perfCacheGeneration()
  let timer: ReturnType<typeof setTimeout>
  const refresh = () => setVersion((v) => v + 1)
  const cached = readPerfCache<T>(ck)
  if (cached !== undefined) { timer = setTimeout(refresh, perfCacheRemaining(ck)); return () => clearTimeout(timer) }
  setState({ ck: '' })
  fetch('/api/performance/' + key, { headers: authHeaders(session), signal: ac.signal })
   .then(async (r) => { const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'دریافت داده ناموفق بود'); return d as T })
   .then((data) => {
    if (ac.signal.aborted || generation !== perfCacheGeneration()) return
    writePerfCache(ck, data, generation); setState({ ck }); timer = setTimeout(refresh, perfCacheRemaining(ck))
   })
   .catch((e) => { if (!ac.signal.aborted) setState({ ck, error: e.message }) })
  return () => { ac.abort(); clearTimeout(timer) }
 }, [ck, key, enabled, session, version])
 if (!enabled) return { loading: false }
 const data = readPerfCache<T>(ck)
 if (data !== undefined) return { data, loading: false }
 return state.ck === ck && state.error ? { error: state.error, loading: false } : { loading: true }
}

/** Excel export: same /details paging (200) and same columns as v1. */
export async function exportDetails(session: Session, params: Record<string, string>, onProgress: (done: number, total: number) => void) {
	let rows: Record<string, unknown>[] = [], total = 0
	for (let i = 0; ; i += 200) {
		const r = await fetch('/api/performance/details?' + new URLSearchParams({ tenant: currentTenant(), ...params, offset: String(i), limit: '200' }), { headers: authHeaders(session) })
		const data = await r.json()
		if (!r.ok || !data.ok) throw new Error(data.error || 'خروجی ناموفق بود')
		rows = rows.concat(data.rows); total = data.total; onProgress(rows.length, total)
		if (rows.length >= data.total || !data.rows.length) break
	}
	const XLSX = await import('xlsx'), book = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'عملکرد')
	XLSX.writeFile(book, 'performance.xlsx')
	return total
}
