/** Same endpoints, params and auth headers as v1; AbortController per request + in-memory cache keyed by filter. */
import { useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'

const cache = new Map<string, unknown>()
export interface Read<T> { data?: T; error?: string; loading: boolean }

export function usePerf<T>(session: Session, view: string, params: Record<string, string>, enabled = true): Read<T> {
	const key = view + '?' + new URLSearchParams({ tenant: currentTenant(), ...params }).toString()
	const ck = session.user + '\u0000' + key
	const [state, setState] = useState<{ ck: string; data?: T; error?: string }>({ ck: '' })
	useEffect(() => {
		if (!enabled || cache.has(ck)) return
		const ac = new AbortController()
		fetch('/api/performance/' + key, { headers: authHeaders(session), signal: ac.signal })
			.then(async (r) => { const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'دریافت داده ناموفق بود'); return d as T })
			.then((data) => { cache.set(ck, data); setState({ ck, data }) })
			.catch((e) => { if (e.name !== 'AbortError') setState({ ck, error: e.message }) })
		return () => ac.abort()
	}, [ck, key, enabled, session])
	if (!enabled) return { loading: false }
	if (cache.has(ck)) return { data: cache.get(ck) as T, loading: false }
	return state.ck === ck ? { data: state.data, error: state.error, loading: false } : { loading: true }
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
