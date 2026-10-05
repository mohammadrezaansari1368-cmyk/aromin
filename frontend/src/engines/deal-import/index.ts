/**
 * موتورِ ایمپورتِ معاملات (جولیو/اکسل) برای دفترِ سالِ مالیِ ۱۴۰۵ — پورتِ c1ImportPlan/doImportِ اپِ کامل + ستونِ «سال مالی».
 * - سالِ مالیِ هر ردیف از ستونِ «سال مالی» خوانده می‌شود؛ نبودِ این ستون مانع ثبت است؛ تاریخ فقط ماهِ معامله را مشخص می‌کند.
 * - فقط ۱۴۰۵ وارد دفتر می‌شود؛ سال‌های دیگر شمرده و گزارش می‌شوند ولی هیچ‌جا نوشته/حذف نمی‌شوند.
 * - idempotent: شمارهٔ فاکتورِ موجود در دفترِ همان کارشناس = تکراری (در «افزودن» همیشه؛ در «جایگزینی» مگر ماهش جایگزین شود).
 * - دادهٔ تاریخی (invY سال‌های دیگر) هرگز لمس نمی‌شود.
 * applyDealImport فقط روی نسخهٔ تازهٔ سرور (داخلِ saveState) اجرا می‌شود.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { freshS, invoiceKey, isLocked, num, MONTHS, type Deal } from '../commission/index.ts'
import { classifyKinds, ledgerOf } from '../customer/index.ts'

export const VERSION = '1.0.0'
export const TARGET_FY = '1405'

const nk = (s: unknown) => String(s).replace(/‌/g, '').replace(/\s+/g, '').replace(/[يی]/g, 'ی').replace(/[كک]/g, 'ک').trim()
/** همان pickCol: اول تطبیقِ دقیق، بعد جزئی */
export function pickCol(keys: string[], cands: string[], exactOnly = false): string | null {
	for (const c of cands) { const n = nk(c); const k = keys.find((x) => nk(x) === n); if (k) return k }
	if (exactOnly) return null
	for (const c of cands) { const n = nk(c); const k = keys.find((x) => nk(x).indexOf(n) > -1); if (k) return k }
	return null
}
export function canonFunnel(stageStr: unknown, failReason: unknown): Deal['funnel'] {
	if (failReason && String(failReason).trim()) return 'lost'
	const s = String(stageStr || '').replace(/‌/g, '').replace(/\s/g, '')
	if (!s) return 'won'
	if (/شکست|ازدست|باخت|لغو|ناموفق|مردود|ردشد/.test(s)) return 'lost'
	if (/بستن|برنده|فروخته|فروش‌رفته/.test(s)) return 'won'
	if (/واجدشرایط|صلاحیت/.test(s)) return 'qualify'
	if (/پیشبرد|پیشروی|مذاکره|پیشفاکتور|پیشنهاد|ارائه/.test(s)) return 'advance'
	if (/آغاز|شروع|جدید|ورودی|اولیه|تماساولیه/.test(s)) return 'start'
	return 'advance'
}
export const cleanName = (s: unknown) => String(s || '').replace(/‌/g, ' ').replace(/^\s*(خانم|آقای|جناب|سرکار|مهندس|دکتر)\s+/g, '').replace(/\s+/g, ' ').trim()
const c1Norm = (v: unknown) =>
	String(v == null ? '' : v).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[يیى]/g, 'ی').replace(/[كک]/g, 'ک').replace(/‌/g, ' ').toLowerCase()
export const c1K = (v: unknown) => c1Norm(v).replace(/\s+/g, '')
const dateOf = (v: unknown) => { const m = c1Norm(v).match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); return m ? { y: m[1], m: +m[2] } : null }
const yearOf = (v: unknown) => { const m = c1Norm(v).match(/(1[34]\d\d)/); return m ? m[1] : '' }

export type RowStatus = 'valid' | 'previous' | 'duplicate' | 'invalid'
export interface PlanRow { i: number; no: string; name: string; st: RowStatus; why: string; fy: string }
export interface Plan {
	error?: string
	rows: PlanRow[]
	cnt: Record<RowStatus, number>
	years: Record<string, number>
	fySource: 'column' | 'date'
	fyColumn: string | null
	groups: Record<string, Deal[]>
	order: string[]
	monthsInFile: Record<number, 1>
	leadNames: Record<string, number>
	noRep: number
	total: number
	fyRows: number
	mode: 'append' | 'replace'
	rial: boolean
}
const emptyPlan = (mode: 'append' | 'replace', rial: boolean, error: string): Plan => ({
	error, rows: [], cnt: { valid: 0, previous: 0, duplicate: 0, invalid: 0 }, years: {}, fySource: 'date', fyColumn: null, groups: {}, order: [], monthsInFile: {}, leadNames: {}, noRep: 0, total: 0, fyRows: 0, mode, rial,
})

/**
 * پیش‌نمایش (بدونِ نوشتن). people/full = نسخهٔ فعلیِ داده (فقط خواندن) برای تشخیصِ تکراری.
 */
export function planDealImport(rowsJson: Record<string, unknown>[], full: any, opts: { mode: 'append' | 'replace'; rial: boolean }): Plan {
	const { mode, rial } = opts
	if (!rowsJson || !rowsJson.length) return emptyPlan(mode, rial, 'فایل خالی بود یا خوانده نشد.')
	if (String(full?.fy) !== TARGET_FY) return emptyPlan(mode, rial, `سالِ مالیِ فعالِ سیستم «${full?.fy ?? '—'}» است؛ ایمپورتِ معاملات فقط وقتی سالِ مالیِ فعال ۱۴۰۵ است انجام می‌شود.`)
	const keys = Object.keys(rowsJson[0])
	// کلیدِ تطبیق = شمارهٔ فاکتورِ سیما (اگر ستونش در فایل باشد)، وگرنه شمارهٔ معامله (همان رفتارِ قبلی)
	const cNo = pickCol(keys, ['شماره فاکتور سیما', 'فاکتور سیما', 'شماره فاکتور', 'شماره سیما'], true) || pickCol(keys, ['معامله', 'کدمرجع', 'شماره', 'کد'])
	const cName = pickCol(keys, ['شرکت', 'مخاطب', 'نام', 'مشتری'])
	const cVal = pickCol(keys, ['ارزش', 'مبلغ', 'قیمت'])
	const cFy = pickCol(keys, ['سال مالی', 'سالمالی', 'سال‌مالی', 'fiscal year', 'fiscalyear', 'fy', 'سال'], true)
	const cDate = pickCol(keys, ['تغییر مرحله', 'تاریخ', 'ورود'])
	const cEntry = pickCol(keys, ['ورود', 'تاریخ ثبت', 'تاریخ ایجاد', 'ثبت'])
	const cRep = pickCol(keys, ['کارشناس', 'مسئول', 'فروشنده'])
	const cReg = pickCol(keys, ['ثبت کننده', 'ثبت‌کننده', 'ثبتکننده'])
	const cStage = pickCol(keys, ['مرحله'])
	const cFail = pickCol(keys, ['دلیل شکست', 'دلیلشکست', 'علت شکست'])
	const cSrc = pickCol(keys, ['کانال تبلیغاتی', 'کانال', 'منبع', 'کمپین'])
	if (!cVal) return emptyPlan(mode, rial, 'ستونِ «ارزش» پیدا نشد.')
	if (!cFy) return emptyPlan(mode, rial, 'ستون «سال مالی» الزامی است؛ سال از تاریخ حدس زده نمی‌شود.')

	const people: any[] = Array.isArray(full?.people) ? full.people : []
	// کلید = شمارهٔ فاکتور (فقط تطبیقِ دقیق پس از یکسان‌سازیِ بی‌ضرر)، در کلِ دفترِ ۱۴۰۵؛ رکوردِ موجود همیشه نسخهٔ اصل است.
	// فاکتور فقط معاملهٔ «بستن» است: ردیفِ باز/شکستِ همان شماره در ماهِ دیگر عکسِ لحظه‌ایِ جولیوست، فاکتورِ تکراری نیست.
	const exist: Record<string, { rep: string; m: number; locked: boolean; won: boolean }[]> = {}
	for (const p of people) {
		const nm = cleanName(p?.name)
		for (const x of ledgerOf(p, full, TARGET_FY)) {
			const k = invoiceKey(x?.no); if (!k) continue
			;(exist[k] ||= []).push({ rep: nm, m: x.month == null || x.month === '' ? 3 : +x.month, locked: isLocked(x), won: (x.funnel || 'won') === 'won' })
		}
	}
	const seenAny: Record<string, number> = {}
	const P = emptyPlan(mode, rial, '')
	delete P.error
	P.fySource = cFy ? 'column' : 'date'
	P.fyColumn = cFy
	const seen: Record<string, number> = {}
	const cand: { row: PlanRow; k: string; rep: string; noRep: boolean; lead: string; d: Deal }[] = []
	rowsJson.forEach((r, ix) => {
		const row: PlanRow = { i: ix + 2, no: cNo ? String(r[cNo] ?? '').trim() : '', name: cName ? String(r[cName] ?? '').trim() : '', st: 'valid', why: '', fy: '' }
		P.rows.push(row)
		const bad = (st: RowStatus, why: string) => { row.st = st; row.why = why; P.cnt[st]++ }
		let ds = cDate ? dateOf(r[cDate]) : null
		if (!ds && cEntry) ds = dateOf(r[cEntry])
		let fy = ''
		if (cFy) {
			fy = yearOf(r[cFy])
			if (!fy) return bad('invalid', 'سالِ مالی خالی یا نامعتبر')
		} else {
			if (!ds) return bad('invalid', 'تاریخ ندارد؛ سالِ مالی نامشخص')
			if (!/^1[34]\d\d$/.test(ds.y) || ds.m < 1 || ds.m > 12) return bad('invalid', 'تاریخِ نامعتبر')
			fy = ds.y
		}
		row.fy = fy
		P.years[fy] = (P.years[fy] || 0) + 1
		if (fy !== TARGET_FY) return bad('previous', `سالِ مالیِ ${fy}`)
		// ماه: از تاریخِ همان ردیف (سالِ ۱۴۰۵)؛ بدونِ تاریخ ← نامعتبر (ماه معلوم نیست)
		if (!ds || ds.m < 1 || ds.m > 12) return bad('invalid', 'ماهِ معامله معلوم نیست (تاریخ ندارد)')
		P.fyRows++
		let v = num(r[cVal]); if (rial) v = Math.round(v / 10)
		const fk = cStage ? canonFunnel(r[cStage], cFail ? r[cFail] : '') : 'won'
		if (fk === 'won' && v <= 0) return bad('invalid', 'ارزشِ صفر یا نامعتبر برای معاملهٔ بسته')
		if (v < 0) v = 0
		const k = invoiceKey(row.no)
		if (k) {
			const prev = fk === 'won' ? seen[k] : seenAny[k]
			if (prev) return bad('duplicate', `شمارهٔ ${row.no} در همین فایل تکراری است (ردیف ${prev})`)
			if (fk === 'won') seen[k] = row.i
			seenAny[k] ||= row.i
		}
		let rep = cRep ? cleanName(r[cRep]) : '', noRep = false
		if (!rep) { rep = 'بدون کارشناس'; noRep = true }
		const reg = cReg ? cleanName(r[cReg]) : ''
		const lead = reg && reg !== rep ? reg : ''
		cand.push({ row, k, rep, noRep, lead, d: {
			id: 0, no: row.no, month: ds.m - 1, name: row.name, amount: String(v), close: lead ? 'nolead' : 'all', funnel: fk, settle: 'cash', kind: 'new', channel: 'official', leadGen: lead,
			stageChangedAt: cDate ? String(r[cDate] ?? '').trim() : '', entry: cEntry ? String(r[cEntry] ?? '').trim() : '', src: cSrc ? String(r[cSrc] ?? '').trim() : '', lossReason: cFail ? String(r[cFail] ?? '').trim() : '', fy: TARGET_FY,
		} })
	})
	cand.forEach((c) => (P.monthsInFile[c.d.month as number] = 1))
	for (const c of cand) {
		// رکوردهایی که می‌مانند: در «جایگزینی»، ردیفِ قفل‌نشدهٔ همین کارشناس در ماهِ جایگزین‌شده حذف می‌شود و حساب نیست
		const live = (c.k ? exist[c.k] || [] : []).filter((e) => mode !== 'replace' || e.rep !== c.rep || !P.monthsInFile[e.m] || e.locked)
		// فاکتور (بستن): تکراری فقط اگر فاکتورِ دیگری با همین شماره باشد؛ ردیفِ باز/شکست: اگر همین معامله هست (idempotent)
		const hit = c.d.funnel === 'won' ? live.find((e) => e.won) : live[0]
		if (hit) { c.row.st = 'duplicate'; c.row.why = `شمارهٔ ${c.row.no} از قبل در دفترِ «${hit.rep}» هست${hit.locked ? ' (سندِ قفل)' : ''} — نسخهٔ اصل حفظ شد، ردیفِ فایل ثبت نشد`; P.cnt.duplicate++; continue }
		P.cnt.valid++
		if (c.noRep) P.noRep++
		if (c.lead) P.leadNames[c.lead] = (P.leadNames[c.lead] || 0) + 1
		if (!P.groups[c.rep]) { P.groups[c.rep] = []; P.order.push(c.rep) }
		P.groups[c.rep].push(c.d)
	}
	P.total = P.cnt.valid
	return P
}

export const monthsLabel = (P: Plan) => Object.keys(P.monthsInFile).map((k) => MONTHS[+k] || k).join('، ')
export const previousYears = (P: Plan) => Object.keys(P.years).filter((y) => y !== TARGET_FY).sort()

/**
 * ثبت روی نسخهٔ تازهٔ سرور (mutator). دوباره برنامه‌ریزی می‌کند تا تکراری‌ها روی دادهٔ همین لحظه سنجیده شوند.
 * فقط دفترِ ۱۴۰۵ (inv + invY['1405'] یکسان)، gid، people (کارشناسِ تازه)، importLog و custbook تغییر می‌کنند.
 */
export function applyDealImport(full: any, rowsJson: Record<string, unknown>[], opts: { mode: 'append' | 'replace'; rial: boolean; fileName: string; sig: string; custbook: any | null }) {
	const P = planDealImport(rowsJson, full, opts)
	if (P.error) throw new Error(P.error)
	const people: any[] = full.people
	let gid = Math.max(+full.gid || 1, 1 + Math.max(0, ...people.map((p) => +p.id || 0), ...people.flatMap((p) => Object.values(p.invY || { _: p.inv || [] }).flat().map((d: any) => +d?.id || 0))))
	const nextId = () => gid++
	const byName = (nm: string) => { let f: any = null; for (const p of people) if (cleanName(p.name) === nm) f = p; return f }
	const commit = (p: any, arr: Deal[]) => { p.invY = p.invY || {}; p.invY[TARGET_FY] = arr; if (String(full.fy) === TARGET_FY) p.inv = arr }
	let created = 0
	const added = new Set<Deal>()
	for (const rep of P.order) {
		let person = byName(rep)
		if (!person) { person = { id: nextId(), name: rep, inv: [], invY: {}, S: freshS(), role: 'sales' }; people.push(person); created++ }
		let arr: Deal[] = ledgerOf(person, full, TARGET_FY).slice()
		// جایگزینی هرگز فاکتورِ بستهٔ مالی را حذف نمی‌کند
		if (opts.mode === 'replace') arr = arr.filter((x: Deal) => isLocked(x) || !P.monthsInFile[x.month == null || x.month === '' ? 3 : +x.month])
		for (const d of P.groups[rep]) { const nd = { ...d, id: nextId() }; added.add(nd); arr.push(nd) }
		commit(person, arr)
	}
	// لیدسازانی که کارشناس نیستند (همان doImport)
	for (const nm of Object.keys(P.leadNames)) if (!P.order.includes(nm) && !byName(nm)) { people.push({ id: nextId(), name: nm, inv: [], invY: {}, S: freshS(), role: 'sales' }); created++ }
	full.gid = gid
	if (!full.years || typeof full.years !== 'object') full.years = {}
	if (!full.years[TARGET_FY]) full.years[TARGET_FY] = { budget: full.budget || {}, targets: full.targets || {} }
	if (opts.custbook) full.custbook = opts.custbook
	// نوعِ مشتری: فقط ردیف‌های تازه از روی کلِ تاریخچه (ردیف‌های قدیمی دست نمی‌خورند مگر کاربر «اصلاح» بزند)
	const { kinds } = classifyKinds(full, TARGET_FY)
	let repeatN = 0
	people.forEach((p, pi) => ledgerOf(p, full, TARGET_FY).forEach((d: Deal) => { if (added.has(d)) { d.kind = kinds.get(pi + ':' + d.id) || 'new'; if (d.kind === 'repeat') repeatN++ } }))
	const log = Array.isArray(full.importLog) ? full.importLog : (full.importLog = [])
	log.push({ name: opts.fileName, type: 'deal', rows: rowsJson.length, sig: opts.sig, ts: Date.now(), dup: false, routed: true, err: '', fy: { valid: P.cnt.valid, previous: P.cnt.previous, duplicate: P.cnt.duplicate, invalid: P.cnt.invalid, years: P.years } })
	if (log.length > 200) full.importLog = log.slice(-200)
	return { plan: P, created, repeatN }
}
