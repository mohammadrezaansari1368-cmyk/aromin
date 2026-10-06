/**
 * موتورِ مشتری (L2) — «مشتری جدید / تکرار خرید» روی کلِ تاریخچهٔ موجود، قطعی (deterministic):
 * - هویتِ مشتری: موبایلِ دفترچهٔ مخاطبین (اگر نامِ مشتری/شرکت دقیقاً با یک مخاطب با موبایلِ یکتا جور شود)، وگرنه نامِ نرمال‌شده (custNorm).
 * - تاریخچه: معاملاتِ «بسته» (won) در همهٔ سال‌های دفتر (invY)، ماه‌های قبلِ همین سال، و سال‌های قبل در پرتفویِ معاملات (custbook).
 * - معاملهٔ باز یا ناتمام هرگز مشتری را «تکرار خرید» نمی‌کند؛ فقط خریدِ بستهٔ قبلی.
 * - ترتیبِ درونِ سال: ماه ← تاریخِ ورود ← شمارهٔ کارشناس ← شناسه (همیشه همان نتیجه).
 * پورتِ custImport (حالتِ معاملات) هم این‌جاست؛ فقط کلیدِ custbook را می‌سازد.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const VERSION = '1.0.0'

export const custNorm = (s: unknown) =>
	String(s == null ? '' : s).replace(/[يیۍ]/g, 'ی').replace(/[كک]/g, 'ک').replace(/‌/g, '').replace(/[\s.،,()\-–—]/g, '').toLowerCase()
const latin = (v: unknown) => String(v == null ? '' : v).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
export function normMobile(s: unknown) {
	let t = latin(s).replace(/[^\d]/g, '')
	if (t.startsWith('0098')) t = t.slice(4); else if (t.startsWith('98') && t.length === 12) t = t.slice(2)
	if (t.length === 10 && t[0] === '9') t = '0' + t
	return /^09\d{9}$/.test(t) ? t : ''
}
/** yyyy/mm/dd → عدد برای مرتب‌سازی (۰ = نامعلوم) */
export function jOrd(s: unknown) {
	const m = latin(s).match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
	return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0
}

/** کلیدِ هویتِ مشتری: موبایل (از مخاطبین، فقط اگر یکتا) یا نامِ نرمال‌شده */
export function customerKeyer(contacts: any[] | undefined) {
	const byName = new Map<string, string | null>()
	for (const c of contacts || []) {
		const mob = normMobile(c?.mob) || normMobile(c?.mob2)
		if (!mob) continue
		for (const n of [c?.comp, c?.name]) {
			const k = custNorm(n)
			if (!k) continue
			const cur = byName.get(k)
			if (cur === undefined) byName.set(k, mob)
			else if (cur !== mob) byName.set(k, null) // دو موبایلِ متفاوت برای یک نام → مبهم؛ نام کافی است
		}
	}
	return (name: unknown) => {
		const k = custNorm(name)
		if (!k) return ''
		const m = byName.get(k)
		return m ? 'm:' + m : 'n:' + k
	}
}

export interface KindChange { pi: number; id: number; from: string; to: 'new' | 'repeat' }

/** دفترِ یک سال برای یک نفر — همان منبعی که اپِ کامل می‌خواند (invY[fy]، وگرنه inv برای سالِ فعال) */
export function ledgerOf(p: any, full: any, fy: string): any[] {
	if (p?.invY && Array.isArray(p.invY[fy])) return p.invY[fy]
	return String(full?.fy) === fy && Array.isArray(p?.inv) ? p.inv : []
}

/**
 * نوعِ مشتریِ هر معاملهٔ سالِ fy. خروجی: نقشه «pi:id» → new|repeat و فهرستِ ردیف‌هایی که با مقدارِ فعلی فرق دارند.
 */
export function classifyKinds(full: any, fy = '1405') {
	const keyOf = customerKeyer(full?.contacts)
	const people: any[] = Array.isArray(full?.people) ? full.people : []
	const closedBefore = new Set<string>()
	// سال‌های قبل: دفترِ همان سال‌ها
	people.forEach((p) => {
		for (const y of Object.keys(p?.invY || {})) {
			if (!(+y < +fy)) continue
			for (const d of p.invY[y] || []) if ((d?.funnel || 'won') === 'won') { const k = keyOf(d?.name); if (k) closedBefore.add(k) }
		}
	})
	// سال‌های قبل: پرتفویِ معاملاتِ جولیو (فقط «بستن»، سالِ هر خرید از تاریخِ ورود)
	const cb = full?.custbook
	if (cb && cb.mode === 'deals' && Array.isArray(cb.custs)) {
		for (const c of cb.custs) {
			if ((c?.years || []).some((y: number) => y > 0 && y < +fy)) { const k = keyOf(c?.disp); if (k) closedBefore.add(k) }
		}
	}
	const rows: { pi: number; d: any; m: number; e: number; key: string }[] = []
	people.forEach((p, pi) => {
		for (const d of ledgerOf(p, full, fy)) {
			const mm = d?.month == null || d?.month === '' ? 3 : +d.month
			rows.push({ pi, d, m: mm >= 0 && mm <= 11 ? mm : 3, e: jOrd(d?.entry), key: keyOf(d?.name) })
		}
	})
	rows.sort((a, b) => a.m - b.m || a.e - b.e || a.pi - b.pi || (+a.d.id || 0) - (+b.d.id || 0))
	const seen = new Set(closedBefore)
	const kinds = new Map<string, 'new' | 'repeat'>()
	const changes: KindChange[] = []
	for (const r of rows) {
		const to: 'new' | 'repeat' = r.key && seen.has(r.key) ? 'repeat' : 'new'
		kinds.set(r.pi + ':' + r.d.id, to)
		if ((r.d.kind || 'new') !== to) changes.push({ pi: r.pi, id: r.d.id, from: r.d.kind || 'new', to })
		if (r.key && (r.d.funnel || 'won') === 'won') seen.add(r.key)
	}
	return { kinds, changes }
}

/** پرتفویِ مشتری از فایلِ معاملات — همان custImport (حالتِ deals)؛ null اگر فایلِ معامله نبود */
export function custbookFromDeals(sheets: { name: string; aoa: unknown[][] }[]) {
	let best: { recs: { cust: string; val: number; agent: string; date: string }[]; sheet: string } | null = null
	for (const { name, aoa } of sheets) {
		if (!aoa.length) continue
		const hdr = ((aoa[0] as unknown[]) || []).map((h) => String(h || '').replace(/‌/g, '').replace(/\s+/g, ''))
		const find = (ns: string[]) => hdr.findIndex((h) => ns.includes(h))
		const stage = find(['مرحله']), val = find(['ارزش']), comp = find(['شرکت']), ag = find(['کارشناس']), ent = find(['ورود'])
		if (!(stage >= 0 && val >= 0 && comp >= 0)) continue
		const recs: { cust: string; val: number; agent: string; date: string }[] = []
		for (let i = 1; i < aoa.length; i++) {
			const r = (aoa[i] as unknown[]) || []
			if (String(r[stage] || '').trim() !== 'بستن') continue
			const cn = String(r[comp] || '').trim()
			if (!cn) continue
			recs.push({ cust: cn, val: parseFloat(String(r[val] || '').replace(/[^\d.]/g, '')) || 0, agent: String((ag >= 0 ? r[ag] : '') || '').trim() || '—', date: String((ent >= 0 ? r[ent] : '') || '') })
		}
		if (recs.length && (!best || recs.length > best.recs.length)) best = { recs, sheet: name }
	}
	if (!best) return null
	const dMon = (s: string) => { const m = String(s || '').match(/(\d{4})\D+(\d{1,2})/); return m ? parseInt(m[1], 10) * 12 + parseInt(m[2], 10) : 0 }
	const byCust: Record<string, typeof best.recs> = {}
	best.recs.forEach((d) => { const k = custNorm(d.cust); if (k) (byCust[k] ||= []).push(d) })
	const agents: Record<string, any> = {}, custCount: Record<string, number> = {}, custs: any[] = []
	let refMon = 0
	const T = { custN: 0, repCustN: 0, newDeals: 0, repDeals: 0, newRev: 0, repRev: 0 }
	for (const k of Object.keys(byCust)) {
		const arr = byCust[k]
		arr.sort((a, b) => dMon(a.date) - dMon(b.date) || String(a.date).localeCompare(String(b.date)))
		custCount[k] = arr.length; T.custN++; if (arr.length >= 2) T.repCustN++
		let total = 0
		const yrs: Record<number, 1> = {}
		arr.forEach((d, i) => {
			const a = d.agent || '—'
			const o = agents[a] || (agents[a] = { name: a, newC: 0, repC: 0, newRev: 0, repRev: 0, custs: {} })
			o.custs[k] = 1; total += d.val
			const y = parseInt((String(d.date).match(/(\d{4})/) || [])[1], 10) || 0
			if (y) yrs[y] = 1
			if (i === 0) { o.newC++; o.newRev += d.val; T.newDeals++; T.newRev += d.val } else { o.repC++; o.repRev += d.val; T.repDeals++; T.repRev += d.val }
		})
		const lastD = arr[arr.length - 1], lm = dMon(lastD.date)
		if (lm > refMon) refMon = lm
		custs.push({ disp: arr[0].cust, norm: k, agent: lastD.agent || '—', n: arr.length, val: total, first: arr[0].date, last: lastD.date, lastMon: lm, years: Object.keys(yrs).map(Number).sort() })
	}
	const agArr = Object.keys(agents).map((a) => { const o = agents[a]; return { name: o.name, newC: o.newC, repC: o.repC, newRev: o.newRev, repRev: o.repRev, custN: Object.keys(o.custs).length } })
	return { mode: 'deals', sheet: best.sheet, ts: Date.now(), agents: agArr, totals: T, custCount, custs, refMon }
}
