import { useCallback, useEffect, useState } from 'react'
import { roleLabel, type Session } from '@/lib/auth'
import { fetchFull } from '@/lib/forecastStore'
import { buildDataset, PERF_EVENT, preparePerfStore, type Dataset } from '@/lib/performance'

/**
 * تنها ورودیِ همهٔ نماهای «حضور و عملکرد»: فروشگاهِ موجود (فقط خواندن) + حضورِ بارگذاری‌شده،
 * با محدودیتِ دسترسی که داخلِ buildDataset و پیش از تحلیل اعمال می‌شود.
 */
export function usePerformance(session: Session, enabled = true) {
	const [full, setFull] = useState<{ people?: [] } | null | undefined>(undefined)
	const [err, setErr] = useState('')
	const [ver, setVer] = useState(0)
	const [ds, setDs] = useState<Dataset | null>(null)
	useEffect(() => {
		if (!enabled) return
		let alive = true
		fetchFull()
			.then((f) => { if (alive) { setFull(f || null); setErr('') } })
			.catch(() => { if (alive) { setFull(null); setErr('دادهٔ سیستم از سرور خوانده نشد؛ تطبیقِ وظایف N/A است.') } })
		return () => { alive = false }
	}, [ver, enabled])
	// ذخیره‌سازِ IndexedDB باید پیش از اولین محاسبه آماده باشد (+ مهاجرتِ یک‌بارهٔ دادهٔ قدیمی)
	const [storeReady, setStoreReady] = useState(false)
	useEffect(() => { let alive = true; preparePerfStore().finally(() => { if (alive) setStoreReady(true) }); return () => { alive = false } }, [])
	useEffect(() => {
		if (full === undefined || !storeReady) return
		const run = () => setDs(buildDataset(session, full, (r) => roleLabel(r as Session['role'])))
		run()
		window.addEventListener(PERF_EVENT, run)
		return () => window.removeEventListener(PERF_EVENT, run)
	}, [full, session, storeReady])
	const reload = useCallback(() => setVer((v) => v + 1), [])
	return { ds, loading: full === undefined || !storeReady || !ds, err, reload }
}
