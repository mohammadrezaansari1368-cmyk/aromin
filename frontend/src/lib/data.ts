'use client'

/**
 * لایهٔ دادهٔ آرومین — همان دادهٔ اپِ کامل را می‌خواند: /api/state?tenant=<کسب‌وکار>
 * (اپِ کامل در tenant ذخیره می‌کند؛ /api/state بدونِ tenant نسخهٔ قدیمیِ جدولِ snapshots است).
 */

import { useCallback, useEffect, useState } from 'react'

export interface Deal {
	amount: string | number
	funnel: string
	channel: string
	month: number
}
export interface Person {
	id: number | string
	name: string
	role: string
	inactive?: boolean
	inv?: Deal[]
}
export interface Ticket {
	no?: string
	co?: string
	agent?: string
	met?: boolean
	matched?: boolean
}
export interface ImportLogItem {
	name: string
	type: string
	rows: number
	sig?: string
	ts: number
	dup?: boolean
	routed?: boolean
	err?: string
}
export interface AppState {
	people: Person[]
	BUDGET: Record<string, number>
	tickets: Ticket[]
	importLog: ImportLogItem[]
	fy?: string
	ts?: number
	forecast?: { monthlyBlended?: number[]; monthlyForecast?: number[]; targetYear?: number; fcTargetYear?: string; fcUnit?: string; ytd?: { year?: number; months?: number[] } | null }
}

export interface Metrics {
	real: boolean
	loading?: boolean
	tenant: string
	updatedAt?: number
	people: number
	totalDeals: number
	won: number
	lost: number
	open: number
	wonMillion: number
	budgetMillion: number
	targetPct: number
	conversion: number
	wonByMonth: number[]
	budgetByMonth: number[]
	funnel: { name: string; v: number }[]
	channels: { name: string; v: number }[]
	agents: { name: string; v: number }[]
	tickets: { total: number; met: number; slaPct: number; matched: number; byAgent: { name: string; v: number; met: number }[] }
	importLog: ImportLogItem[]
	/** پیش‌بینیِ ماهانهٔ سالِ هدف (میلیون تومان) از تبِ پیش‌بینی. */
	fcByMonth: number[]
	fcYearMillion: number
	fcYear: number
	/** واقعیِ ماه‌های دارای داده در برابرِ پیش‌بینیِ همان ماه‌ها (٪). */
	fcVsActualPct: number
	fcMonths: number
}

const num = (a: unknown) => parseInt(String(a ?? '').replace(/[^0-9]/g, ''), 10) || 0

const FUNNEL_FA: Record<string, string> = {
	start: 'شروع',
	qualify: 'ارزیابی',
	advance: 'پیشنهاد',
	won: 'بستن (موفق)',
	lost: 'ازدست‌رفته',
}
const CH_FA: Record<string, string> = { official: 'رسمی', unofficial: 'غیررسمی' }

/** کسب‌وکارِ فعال — اپِ کامل آن را به‌صورت JSON {id,industry,name} در aromin.lastTenant نگه می‌دارد. */
export function currentTenant(): string {
	try {
		const raw = localStorage.getItem('aromin.lastTenant')
		if (!raw) return 'team'
		const o = JSON.parse(raw)
		return (o && typeof o === 'object' && o.id) || (typeof o === 'string' && o) || 'team'
	} catch {
		return 'team'
	}
}

/** اگر هنوز کسب‌وکاری انتخاب نشده، پیش‌فرض (team) را ثبت کن تا اپِ کامل در iframe منتظرِ انتخاب نماند. */
export function ensureTenant() {
	try {
		if (!localStorage.getItem('aromin.lastTenant'))
			localStorage.setItem('aromin.lastTenant', JSON.stringify({ id: 'team', industry: '', name: 'آرومین (پیش‌فرض)' }))
	} catch {
		/* ignore */
	}
}

export function compute(s: AppState, tenant: string): Metrics {
	let won = 0
	let lost = 0
	let open = 0
	let wonSum = 0
	let totalDeals = 0
	const fCount: Record<string, number> = {}
	const chCount: Record<string, number> = {}
	const wonByMonth = new Array(12).fill(0)
	const wonActive = new Array(12).fill(0)
	const agentWon: Record<string, number> = {}

	for (const p of s.people || []) {
		for (const d of p.inv || []) {
			totalDeals++
			fCount[d.funnel] = (fCount[d.funnel] || 0) + 1
			chCount[d.channel] = (chCount[d.channel] || 0) + 1
			if (d.funnel === 'won') {
				const a = num(d.amount)
				won++
				wonSum += a
				wonByMonth[Math.max(0, Math.min(11, d.month | 0))] += a / 1e6
				const mm = d.month == null || (d.month as unknown) === '' ? -1 : +d.month
				if (!p.inactive && mm >= 0 && mm <= 11) wonActive[mm] += a / 1e6
				agentWon[p.name] = (agentWon[p.name] || 0) + a
			} else if (d.funnel === 'lost') lost++
			else open++
		}
	}

	const budgetByMonth = Array.from({ length: 12 }, (_, i) => Number(s.BUDGET?.[String(i)] || 0))
	const budgetMillion = budgetByMonth.reduce((a, b) => a + b, 0)
	const wonMillion = wonSum / 1e6

	const tk = s.tickets || []
	const tAgent: Record<string, { v: number; met: number }> = {}
	for (const t of tk) {
		const k = t.agent || '—'
		tAgent[k] = tAgent[k] || { v: 0, met: 0 }
		tAgent[k].v++
		if (t.met) tAgent[k].met++
	}
	const tMet = tk.filter((t) => t.met).length
	const fcRaw = (s.forecast?.monthlyBlended || []).slice(0, 12)
	const fcByMonth = Array.from({ length: 12 }, (_, i) => Math.round((Number(fcRaw[i]) || 0) / 1e6))
	const fcBase = s.forecast?.monthlyForecast || []
	// همان actualByMonthِ تبِ پیش‌بینی: فایلِ ماهانهٔ سالِ هدف، وگرنه معاملاتِ won
	const fc = s.forecast || {}
	const ty = parseInt(String(fc.fcTargetYear || ''), 10) || 0
	const ytdOk = !!(fc.ytd && fc.ytd.year === ty && Array.isArray(fc.ytd.months))
	const uf = fc.fcUnit === 'rial' ? 0.1 : 1
	const act = wonActive.map((v, i) => (ytdOk && Number(fc.ytd!.months![i]) > 0 ? (Number(fc.ytd!.months![i]) * uf) / 1e6 : v))
	let fA = 0, fF = 0, fN = 0
	if (fcBase.length) for (let i = 0; i < 12; i++) if (act[i] > 0) { fA += act[i]; fF += (Number(fcBase[i]) || 0) / 1e6; fN++ }

	return {
		real: true,
		tenant,
		updatedAt: s.ts,
		people: (s.people || []).length,
		totalDeals,
		won,
		lost,
		open,
		wonMillion: Math.round(wonMillion),
		budgetMillion: Math.round(budgetMillion),
		targetPct: budgetMillion ? Math.round((wonMillion / budgetMillion) * 100) : 0,
		conversion: totalDeals ? Math.round((won / totalDeals) * 100) : 0,
		wonByMonth: wonByMonth.map((v) => Math.round(v)),
		budgetByMonth,
		funnel: Object.entries(fCount).map(([k, v]) => ({ name: FUNNEL_FA[k] || k, v })).sort((a, b) => b.v - a.v),
		channels: Object.entries(chCount).map(([k, v]) => ({ name: CH_FA[k] || k, v })).sort((a, b) => b.v - a.v),
		agents: Object.entries(agentWon).map(([name, v]) => ({ name, v: Math.round(v / 1e6) })).sort((a, b) => b.v - a.v).slice(0, 5),
		tickets: {
			total: tk.length,
			met: tMet,
			slaPct: tk.length ? Math.round((tMet / tk.length) * 100) : 0,
			matched: tk.filter((t) => t.matched).length,
			byAgent: Object.entries(tAgent).map(([name, o]) => ({ name, v: o.v, met: o.met })).sort((a, b) => b.v - a.v),
		},
		importLog: (s.importLog || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)),
		fcByMonth,
		fcYearMillion: fcByMonth.reduce((a, b) => a + b, 0),
		fcYear: Number(s.forecast?.targetYear) || 0,
		fcVsActualPct: fF ? Math.round((fA / fF) * 100) : 0,
		fcMonths: fN,
	}
}

const ZERO_TICKETS = { total: 0, met: 0, slaPct: 0, matched: 0, byAgent: [] }

/** دادهٔ نمونه وقتی سرور در دسترس نیست (لوکال). */
const DEMO: Metrics = {
	real: false,
	tenant: 'team',
	people: 11,
	totalDeals: 1075,
	won: 140,
	lost: 225,
	open: 710,
	wonMillion: 4269,
	budgetMillion: 26857,
	targetPct: 16,
	conversion: 13,
	wonByMonth: [0, 0, 0, 2100, 2169, 0, 0, 0, 0, 0, 0, 0],
	budgetByMonth: [1069, 1974, 2480, 3946, 2951, 1785, 2380, 2380, 2677, 2082, 1249, 1884],
	funnel: [
		{ name: 'شروع', v: 541 },
		{ name: 'ازدست‌رفته', v: 225 },
		{ name: 'بستن (موفق)', v: 140 },
		{ name: 'ارزیابی', v: 113 },
		{ name: 'پیشنهاد', v: 56 },
	],
	channels: [
		{ name: 'رسمی', v: 1059 },
		{ name: 'غیررسمی', v: 16 },
	],
	agents: [
		{ name: 'کارشناس ۱', v: 980 },
		{ name: 'کارشناس ۲', v: 760 },
		{ name: 'کارشناس ۳', v: 610 },
	],
	tickets: ZERO_TICKETS,
	importLog: [],
	fcByMonth: [1069, 1974, 2480, 3946, 2951, 1740, 2320, 2320, 2610, 2030, 1218, 1837],
	fcYearMillion: 26494,
	fcYear: 1405,
	fcVsActualPct: 174,
	fcMonths: 6,
}

/** حالتِ بارگذاری: صفر، نه عددِ نمونه. */
const EMPTY: Metrics = {
	...DEMO,
	real: false,
	loading: true,
	people: 0,
	totalDeals: 0,
	won: 0,
	lost: 0,
	open: 0,
	wonMillion: 0,
	budgetMillion: 0,
	targetPct: 0,
	conversion: 0,
	wonByMonth: new Array(12).fill(0),
	budgetByMonth: new Array(12).fill(0),
	funnel: [],
	channels: [],
	agents: [],
	fcByMonth: new Array(12).fill(0),
	fcYearMillion: 0,
	fcVsActualPct: 0,
	fcMonths: 0,
}

export const dataTag = (m: Metrics) =>
	m.loading ? 'در حال بارگذاری…' : m.real ? 'داده‌ی واقعی' : 'نمونه (آفلاین)'

const nonEmpty = (...c: unknown[]) =>
	(c.find((b) => b && typeof b === 'object' && Object.keys(b as object).length) as Record<string, number>) || {}

async function load(tenant: string): Promise<AppState | null> {
	for (const url of [`/api/state?tenant=${encodeURIComponent(tenant)}`, '/api/state']) {
		try {
			const r = await fetch(url, { cache: 'no-store' })
			if (!r.ok) continue
			const d = await r.json()
			const full = d.full || d.state || {}
			const people = full.people || d.people || []
			if (!people.length) continue
			const fy = full.fy
			return {
				people,
				BUDGET: nonEmpty(fy && full.years?.[fy]?.budget, full.budget, full.BUDGET, d.BUDGET),
				tickets: full.tickets || d.tickets || [],
				importLog: full.importLog || [],
				fy,
				ts: full.ts,
				forecast: full.forecast || {},
			}
		} catch {
			/* next */
		}
	}
	return null
}

export function useAromin(): { m: Metrics; loading: boolean; reload: () => void } {
	const [m, setM] = useState<Metrics | null>(null)
	const [ver, setVer] = useState(0)
	const reload = useCallback(() => setVer((v) => v + 1), [])
	useEffect(() => {
		let alive = true
		const tenant = currentTenant()
		load(tenant).then((s) => {
			if (alive) setM(s ? compute(s, tenant) : DEMO)
		})
		return () => {
			alive = false
		}
	}, [ver])
	return { m: m ?? EMPTY, loading: m === null, reload }
}
