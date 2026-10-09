import { useCallback, useEffect, useState } from 'react'
import { authHeaders, roleLabel, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { buildDataset, PERF_EVENT, preparePerfStore, type Dataset } from '@/lib/performance'

/**
 * تنها ورودیِ همهٔ نماهای «حضور و عملکرد»: فروشگاهِ موجود (فقط خواندن) + حضورِ بارگذاری‌شده،
 * با محدودیتِ دسترسی که داخلِ buildDataset و پیش از تحلیل اعمال می‌شود.
 */
export function usePerformance(session: Session, enabled = true) {
	const [full, setFull] = useState<{ people?: [] } | null | undefined>(undefined)
	const identity = session.user + '\u0000' + session.pass
	const [loadedIdentity, setLoadedIdentity] = useState('')
	const [err, setErr] = useState('')
	const [ver, setVer] = useState(0)
	const [ds, setDs] = useState<Dataset | null>(null)
	useEffect(() => {
		if (!enabled) return
		let alive = true
		setFull(undefined); setDs(null); setErr('')
		fetch(`/api/performance/source?tenant=${encodeURIComponent(currentTenant())}`, { headers: authHeaders(session) }).then(async r => { const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'خطای دریافت عملکرد'); return d.full })
			.then((f) => { if (alive) { setFull(f || null); setLoadedIdentity(identity); setErr('') } })
			.catch((e) => { if (alive) { setFull(null); setDs(null); setErr(e.message) } })
		return () => { alive = false }
	}, [ver, enabled, session.user, session.pass])
	// ذخیره‌سازِ IndexedDB باید پیش از اولین محاسبه آماده باشد (+ مهاجرتِ یک‌بارهٔ دادهٔ قدیمی)
	const [storeReady, setStoreReady] = useState(false)
	useEffect(() => { let alive = true; preparePerfStore().finally(() => { if (alive) setStoreReady(true) }); return () => { alive = false } }, [])
	useEffect(() => {
		if (!full || !storeReady || loadedIdentity !== identity) return
		const run = () => setDs(buildDataset(session, full, (r) => roleLabel(r as Session['role'])))
		run()
		window.addEventListener(PERF_EVENT, run)
		return () => window.removeEventListener(PERF_EVENT, run)
	}, [full, session, storeReady, loadedIdentity, identity])
	const reload = useCallback(() => setVer((v) => v + 1), [])
	return { ds: loadedIdentity === identity ? ds : null, loading: !err && (full === undefined || !storeReady || !ds), err, reload }
}
