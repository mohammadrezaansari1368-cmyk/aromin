/**
 * منبعِ دادهٔ آمپرهای «استارلایت» (B23–B31) — 3.9.68: دادهٔ واقعی (نقشهٔ تأییدشده در docs/TILE-MAP.md).
 * اسم‌های فیلدها همان بستهٔ طراحی است؛ معنای هرکدام:
 * speed = فروشِ امروز (میلیون تومان) · rpm = تماسِ پاسخ‌داده در ساعت · power = نرخِ تبدیل ٪ · battery = حضورِ امروز ٪ (هاریکان)
 * range = کیلومترِ مأموریتِ ماه (هاریکان) · motorTemp = معاملاتِ بازِ بیش از ۴۰ روز · fuel = باقی‌ماندهٔ تارگتِ ماه ٪ · cabin = تیکت‌های باز
 * has[key] = آن منبع داده دارد؛ وگرنه آمپر «—» نشان می‌دهد. scale[key] = سقفِ صفحه برای کمیت‌های بی‌سقف.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@/lib/auth'
import { useAromin } from '@/lib/data'
import { niceScale, useServerLive } from '@/lib/liveKpis'

export type StarlightKey = 'speed' | 'rpm' | 'power' | 'battery' | 'range' | 'motor' | 'fuel' | 'cabin'
export type StarlightData = {
	speed: number; rpm: number; power: number; battery: number; range: number; motorTemp: number; fuel: number; cabin: number
	now: Date; live: boolean; has: Partial<Record<StarlightKey, boolean>>; scale: Partial<Record<StarlightKey, number>>
}

export function useStarlightData(session?: Session | null): StarlightData {
	const { m } = useAromin()
	const live = useServerLive(session ?? null)
	const [now, setNow] = useState(() => new Date())
	useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id) }, [])
	return useMemo(() => {
		const x = m.real ? m.live : undefined
		const sales = x?.salesByDayM || []
		return {
			speed: x?.salesTodayM ?? 0, rpm: live?.calls?.perHour ?? 0, power: m.real ? m.conversion : 0,
			battery: live?.attendance?.pct ?? 0, range: live?.attendance?.missionKm ?? 0, motorTemp: x?.stale40 ?? 0,
			fuel: x?.remainingBudgetPct ?? 0, cabin: live?.tickets?.open ?? 0, now, live: !!(x || live),
			has: { speed: !!x, rpm: !!live?.calls, power: m.real && m.totalDeals > 0, battery: live?.attendance?.pct != null,
				range: live?.attendance?.missionKm != null, motor: !!x, fuel: x?.remainingBudgetPct != null, cabin: !!live?.tickets },
			scale: {
				speed: niceScale(Math.max(x?.salesTodayM || 0, ...sales) * 1.2, 10).max,
				rpm: niceScale((live?.calls?.perHour || 0) * 1.5, 5).max,
				range: niceScale((live?.attendance?.missionKm || 0) * 1.3, 100).max,
				motor: niceScale((x?.stale40 || 0) * 1.5, 10).max,
				cabin: niceScale((live?.tickets?.open || 0) * 1.5, 10).max,
			},
		}
	}, [m, live, now])
}
