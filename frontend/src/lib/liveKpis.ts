/**
 * 3.9.68: real numbers for the former sample tiles (A15–A26, B23–B31; mapping approved by the owner, docs/TILE-MAP.md).
 * Deal/budget numbers come from the same /api/state the dashboard already reads (computed here, in the browser);
 * calls, tickets, website leads and Harikan attendance come from GET /api/dashboard/live (managers and finance only).
 * Every value is null when its source has no data — tiles then say «داده‌ای نیست», never a demo number.
 */
import { useEffect, useState } from 'react'
import { activeAuthHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { canSeeAll } from '@/lib/attendanceApi'
import { saleDateOf } from '@/lib/sales-date'
import { isStagnant } from '@/lib/ledger-analysis'
import { parseJ, todayJ } from '@/lib/jalali'
import type { Deal as EngineDeal } from '@/engines/commission'

type AnyDeal = Record<string, unknown> & { amount?: unknown; funnel?: string; month?: number; settle?: string; kind?: string; name?: string }
type AnyPerson = { name?: string; inactive?: boolean; inv?: AnyDeal[]; invY?: Record<string, AnyDeal[]> }
type AnyState = { people?: AnyPerson[]; BUDGET?: Record<string, number>; fy?: string }

export interface DealKpis {
	today: string
	salesTodayM: number
	salesByDayM: number[]           // last 14 days, oldest → today
	monthWonM: number
	monthBudgetM: number | null
	remainingBudgetPct: number | null
	wonM: number
	cashM: number; checkM: number; heldM: number
	cashSharePct: number | null; heldSharePct: number | null
	monthCashM: number
	stale40: number
	funnelSpeedPct: number | null      // open deals still inside the 40-day window
	repeatSharePct: number | null
	retentionPct: number | null
}

const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0 }
const won = (d: AnyDeal) => (d.funnel || 'won') === 'won'
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const key = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()

function shiftJ(day: string, n: number): string {
	const p = parseJ(day)
	if (!p) return day
	return todayJ(new Date(Date.parse(p.iso) + n * 86400000 + 6 * 3600000))   // noon-ish UTC → same Tehran day
}

/** Deal-based numbers for the live tiles; pure (tested). */
export function dealKpis(s: AnyState | null | undefined, today = todayJ()): DealKpis {
	const people = (s?.people || []).filter(Boolean)
	const deals = people.flatMap((p) => p.inv || [])
	const days = Array.from({ length: 14 }, (_, i) => shiftJ(today, i - 13))
	const byDay = new Map(days.map((d) => [d, 0]))
	const month = today.slice(0, 7), mIdx = +today.slice(5, 7) - 1
	let wonA = 0, cash = 0, check = 0, held = 0, monthWon = 0, monthCash = 0, repeat = 0, salesToday = 0
	for (const d of deals) {
		if (!won(d)) continue
		const a = num(d.amount), date = saleDateOf(d as unknown as EngineDeal)
		wonA += a
		if (d.settle === 'hold') held += a
		else if (d.settle === 'check' || d.settle === 'cash_after_check') check += a
		else cash += a
		if (d.kind === 'repeat') repeat += a
		if (byDay.has(date)) byDay.set(date, byDay.get(date)! + a)
		if (date === today) salesToday += a
		if (date.startsWith(month + '/') || (!date && ((d.month ?? -1) | 0) === mIdx)) { monthWon += a; if (d.settle !== 'hold' && d.settle !== 'check' && d.settle !== 'cash_after_check') monthCash += a }
	}
	const budget = Number(s?.BUDGET?.[String(mIdx)] || 0)          // million toman, same as the «بودجهٔ ماهانه» tile
	// retention: customers who bought last fiscal year and again this year
	const fy = String(s?.fy || today.slice(0, 4)), prev = String(+fy - 1)
	const prevCustomers = new Set(people.flatMap((p) => (p.invY?.[prev] || []).filter(won).map((d) => key(d.name))).filter(Boolean))
	const thisCustomers = new Set(deals.filter(won).map((d) => key(d.name)).filter(Boolean))
	const kept = [...prevCustomers].filter((c) => thisCustomers.has(c)).length
	const openDeals = deals.filter((d) => !['won', 'lost'].includes(d.funnel || 'won')).length
	const stale40 = deals.filter((d) => isStagnant(d as unknown as EngineDeal, today)).length
	return {
		today,
		salesTodayM: salesToday / 1e6,
		salesByDayM: days.map((d) => byDay.get(d)! / 1e6),
		monthWonM: monthWon / 1e6,
		monthBudgetM: budget || null,
		remainingBudgetPct: budget ? Math.max(0, Math.round((1 - monthWon / 1e6 / budget) * 1000) / 10) : null,
		wonM: wonA / 1e6, cashM: cash / 1e6, checkM: check / 1e6, heldM: held / 1e6,
		cashSharePct: pct(cash, wonA), heldSharePct: pct(held, wonA),
		monthCashM: monthCash / 1e6,
		stale40,
		funnelSpeedPct: pct(openDeals - stale40, openDeals),
		repeatSharePct: pct(repeat, wonA),
		retentionPct: prevCustomers.size ? pct(kept, prevCustomers.size) : null,
	}
}

export interface ServerLive {
	today: string | null
	calls: { today: number; perHour: number; byDay: number[]; answeredPct: number | null } | null
	tickets: { open: number; slaPct: number | null } | null
	leads: { month: number } | null
	attendance: { day: string; present: number; absent: number; leave: number; mission: number; pct: number | null; missionKm: number | null; month?: string } | null
	sources: Record<string, string | null>
}

/** GET /api/dashboard/live every 2 minutes (managers/finance only; others get null). */
export function useServerLive(session: Session | null): ServerLive | null {
	const [d, setD] = useState<ServerLive | null>(null)
	const allowed = !!session && canSeeAll(session)
	useEffect(() => {
		if (!allowed) return
		let alive = true
		const load = () => fetch('/api/dashboard/live?tenant=' + encodeURIComponent(currentTenant()), { headers: activeAuthHeaders(), cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.ok) setD(j as ServerLive) }).catch(() => undefined)
		load()
		const t = window.setInterval(load, 120000)
		return () => { alive = false; window.clearInterval(t) }
	}, [allowed])
	return d
}

/** The six radar axes of A18 (0–100; null = no data for that axis). */
export function radarAxes(conversion: number | null, k: DealKpis, live: ServerLive | null): Record<string, number | null> {
	return {
		'نرخ تبدیل': conversion,
		'تکرار خرید': k.repeatSharePct,
		'حفظ مشتری': k.retentionPct,
		'سرعت قیف': k.funnelSpeedPct,
		'پاسخ تماس': live?.calls?.answeredPct ?? null,
		'SLA تیکت': live?.tickets?.slaPct ?? null,
	}
}

/** A nice scale maximum ≥ v (1, 2, 2.5, 5 × 10ⁿ) and a step that divides it into 5. */
export function niceScale(v: number, floor = 5): { max: number; step: number } {
	const x = Math.max(floor, v || 0)
	const p = Math.pow(10, Math.floor(Math.log10(x)))
	const max = [1, 2, 2.5, 5, 10].map((m) => m * p).find((c) => c >= x) || 10 * p
	return { max, step: max / 5 }
}
