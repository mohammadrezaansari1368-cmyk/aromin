/**
 * موتورِ ایمپورتِ معاملات (جولیو/اکسل) برای دفترِ سالِ مالیِ ۱۴۰۵ — پورتِ c1ImportPlan/doImportِ اپِ کامل + ستونِ «سال مالی».
 * - سالِ مالی، تاریخِ کاملِ فروش، ساعت و ماهِ هر ردیف فقط از سلولِ ستونِ «تغییر مرحله» (lib/stage-change)؛
 *   ستونِ «سال مالی»، «ورود»، نامِ فایل و زمانِ سیستم منبع نیستند. سالِ مالی باید در سیستم تعریف شده باشد.
 * - فقط ۱۴۰۵ وارد دفتر می‌شود؛ سال‌های دیگر شمرده و گزارش می‌شوند ولی هیچ‌جا نوشته/حذف نمی‌شوند.
 * - idempotent: شمارهٔ موجود با همان مشتری، کارشناس، مبلغ و تاریخ = تکراری (در «جایگزینی» مگر ماهش جایگزین شود).
 * - تعارض: همان شماره با مشتری/کارشناس/مبلغ/تاریخِ دیگر، یا بیش از یک رکوردِ هم‌شماره → هرگز خودکار تطبیق نمی‌شود؛
 *   ردیف ثبت نمی‌شود، تاریخی تکمیل نمی‌شود و «تعارض» گزارش می‌شود (در همین فایل: هر دو ردیف کنار می‌روند).
 * - نامِ کارشناس/لیدسازِ ناشناخته حدسی به کارشناسِ موجود وصل نمی‌شود؛ در پیش‌نمایش «نامِ تازه» علامت می‌خورد.
 * - دادهٔ تاریخی (invY سال‌های دیگر) هرگز لمس نمی‌شود.
 * applyDealImport فقط روی نسخهٔ تازهٔ سرور (داخلِ saveState) اجرا می‌شود.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { saleDateKey, saleDateOf, saleTimeOf } from '@/lib/sales-date'
import { findStageChangeColumn, knownFiscalYears, parseStageChange, STAGE_ERR_FA, stageErrorText } from '@/lib/stage-change'
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

export type RowStatus = 'valid' | 'previous' | 'duplicate' | 'conflict' | 'invalid'
export interface PlanRow { i: number; no: string; name: string; rep: string; st: RowStatus; why: string; fy: string; raw?: string; date?: string; time?: string }
/** گزارشِ اعتبارسنجیِ هر کارشناس: شمارِ هر وضعیت + ردیف‌ها و مبلغِ ثبت‌شدنی به تفکیکِ ماه (۱ تا ۱۲) */
export interface SellerReport { valid: number; previous: number; duplicate: number; conflict: number; invalid: number; amount: number; months: Record<number, { n: number; amount: number }> }
export interface Plan {
 saleDateColumn: string | null
 missingSaleDates: number
 dateUpdates: { key: string; date: string; time: string }[]
	error?: string
	rows: PlanRow[]
	cnt: Record<RowStatus, number>
	years: Record<string, number>
	fySource: 'stageChange'
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
	bySeller: Record<string, SellerReport>
	/** نام‌های کارشناس/لیدسازِ ثبت‌شدنی که در سیستم نیستند (کارشناسِ تازه ساخته می‌شود) → شمارِ ردیف */
	newNames: Record<string, number>
}
const emptyPlan = (mode: 'append' | 'replace', rial: boolean, error: string): Plan => ({
	error, saleDateColumn: null, missingSaleDates: 0, dateUpdates: [], rows: [], cnt: { valid: 0, previous: 0, duplicate: 0, conflict: 0, invalid: 0 }, years: {}, fySource: 'stageChange', fyColumn: null, groups: {}, order: [], monthsInFile: {}, leadNames: {}, noRep: 0, total: 0, fyRows: 0, mode, rial, bySeller: {}, newNames: {},
})
const sameName = (a: unknown, b: unknown) => { const x = c1K(cleanName(a)), y = c1K(cleanName(b)); return !x || !y || x === y }
interface Side { name: string; rep: string; amount: number; saleDate: string; saleTime: string }
/** فیلدهای ناسازگارِ دو نسخه از یک شماره؛ مبلغ/تاریخ فقط برای فاکتور (معاملهٔ بسته) سنجیده می‌شود. خالی = داوری‌نشدنی، تعارض نیست */
function diffFields(a: Side, b: Side, invoice: boolean): string[] {
	const out: string[] = []
	if (!sameName(a.name, b.name)) out.push('نامِ مشتری')
	if (a.rep !== b.rep) out.push('کارشناس')
	if (invoice) {
		if (Math.round(a.amount) !== Math.round(b.amount)) out.push('مبلغ')
		if (a.saleDate && b.saleDate && a.saleDate !== b.saleDate) out.push('تاریخِ فروش')
		else if (a.saleTime && b.saleTime && a.saleTime !== b.saleTime) out.push('ساعتِ فروش')
	}
	return out
}

/**
 * پیش‌نمایش (بدونِ نوشتن). people/full = نسخهٔ فعلیِ داده (فقط خواندن) برای تشخیصِ تکراری.
 */
export function planDealImport(rowsJson: Record<string, unknown>[], full: any, opts: { mode: 'append' | 'replace'; rial: boolean; date1904?: boolean; source?: string; sheet?: string }): Plan {
	const { mode, rial } = opts
	if (!rowsJson || !rowsJson.length) return emptyPlan(mode, rial, 'فایل خالی بود یا خوانده نشد.')
	if (String(full?.fy) !== TARGET_FY) return emptyPlan(mode, rial, `سالِ مالیِ فعالِ سیستم «${full?.fy ?? '—'}» است؛ ایمپورتِ معاملات فقط وقتی سالِ مالیِ فعال ۱۴۰۵ است انجام می‌شود.`)
	const keys = Object.keys(rowsJson[0])
	// کلیدِ تطبیق = شمارهٔ فاکتورِ سیما (اگر ستونش در فایل باشد)، وگرنه شمارهٔ معامله (همان رفتارِ قبلی)
	const cNo = pickCol(keys, ['شماره فاکتور سیما', 'فاکتور سیما', 'شماره فاکتور', 'شماره سیما'], true) || pickCol(keys, ['معامله', 'کدمرجع', 'شماره', 'کد'])
	const cName = pickCol(keys, ['شرکت', 'مخاطب', 'نام', 'مشتری'])
	const cVal = pickCol(keys, ['ارزش', 'مبلغ', 'قیمت'])
	const stageCol = findStageChangeColumn(keys)
	const cEntry = pickCol(keys, ['ورود', 'تاریخ ثبت', 'تاریخ ایجاد', 'ثبت'])
	const cRep = pickCol(keys, ['کارشناس', 'مسئول', 'فروشنده'])
	const cReg = pickCol(keys, ['ثبت کننده', 'ثبت‌کننده', 'ثبتکننده'])
	const cStage = pickCol(keys, ['مرحله'])
	const cFail = pickCol(keys, ['دلیل شکست', 'دلیلشکست', 'علت شکست'])
	const cSrc = pickCol(keys, ['کانال تبلیغاتی', 'کانال', 'منبع', 'کمپین'])
	if (!cVal) return emptyPlan(mode, rial, 'ستونِ «ارزش» پیدا نشد.')
	if ('error' in stageCol) return emptyPlan(mode, rial, stageCol.error)
	const cChange = stageCol.col
	const fiscalYears = knownFiscalYears(full)

	const people: any[] = Array.isArray(full?.people) ? full.people : []
	// کلید = شمارهٔ فاکتور (فقط تطبیقِ دقیق پس از یکسان‌سازیِ بی‌ضرر)، در کلِ دفترِ ۱۴۰۵؛ رکوردِ موجود همیشه نسخهٔ اصل است.
	// فاکتور فقط معاملهٔ «بستن» است: ردیفِ باز/شکستِ همان شماره در ماهِ دیگر عکسِ لحظه‌ایِ جولیوست، فاکتورِ تکراری نیست.
	type Exist = Side & { m: number; locked: boolean; won: boolean; key: string }
	const exist: Record<string, Exist[]> = {}
	const known = new Set<string>()
	for (const p of people) {
		const nm = cleanName(p?.name)
		if (nm) known.add(nm)
		for (const x of ledgerOf(p, full, TARGET_FY)) {
			const k = invoiceKey(x?.no); if (!k) continue
			;(exist[k] ||= []).push({ key: saleDateKey(p.id, x.id), saleDate: saleDateOf(x, full.saleDates?.[TARGET_FY], p.id), saleTime: saleTimeOf(x, full.saleTimes?.[TARGET_FY], p.id), name: String(x.name ?? ''), amount: num(x.amount), rep: nm, m: x.month == null || x.month === '' ? 3 : +x.month, locked: isLocked(x), won: (x.funnel || 'won') === 'won' })
		}
	}
	const P = emptyPlan(mode, rial, '')
	delete P.error
	P.fyColumn = cChange
	P.saleDateColumn = cChange
	type Cand = { row: PlanRow; k: string; rep: string; noRep: boolean; lead: string; d: Deal; side: Side; conflict: string }
	const seen: Record<string, Cand> = {}, seenAny: Record<string, Cand> = {}
	const cand: Cand[] = []
	const seller = (rep: string) => (P.bySeller[rep] ||= { valid: 0, previous: 0, duplicate: 0, conflict: 0, invalid: 0, amount: 0, months: {} })
	const mark = (row: PlanRow, st: RowStatus, why: string) => { row.st = st; row.why = why; P.cnt[st]++; seller(row.rep)[st]++ }
	rowsJson.forEach((r, ix) => {
		let rep = cRep ? cleanName(r[cRep]) : '', noRep = false
		if (!rep) { rep = 'بدون کارشناس'; noRep = true }
		const row: PlanRow = { i: ix + 2, no: cNo ? String(r[cNo] ?? '').trim() : '', name: cName ? String(r[cName] ?? '').trim() : '', rep, st: 'valid', why: '', fy: '' }
		P.rows.push(row)
		const bad = (st: RowStatus, why: string) => mark(row, st, why)
		const sc = parseStageChange(r[cChange])
		row.raw = sc.raw
		const where = (why: string) => stageErrorText({ source: opts.source, sheet: opts.sheet, row: row.i, col: cChange, raw: sc.raw, why })
		if (!sc.ok) return bad('invalid', where(STAGE_ERR_FA[sc.error]))
		// سالِ مالی = سالِ همین تاریخِ معتبر، فقط اگر در سیستم تعریف شده باشد (بدونِ ساختِ خودکار یا جایگزین)
		if (!fiscalYears.has(sc.fy)) return bad('invalid', where(`سالِ مالیِ ${sc.fy} در سیستم تعریف نشده`))
		const fy = sc.fy, saleDate = sc.date, saleTime = sc.time
		row.fy = fy; row.date = saleDate; row.time = saleTime
		P.years[fy] = (P.years[fy] || 0) + 1
		if (fy !== TARGET_FY) return bad('previous', `سالِ مالیِ ${fy}`)
		const ds = { m: +saleDate.slice(5, 7) }
		P.fyRows++
		let v = num(r[cVal]); if (rial) v = Math.round(v / 10)
		const fk = cStage ? canonFunnel(r[cStage], cFail ? r[cFail] : '') : 'won'
		if (fk === 'won' && v <= 0) return bad('invalid', 'ارزشِ صفر یا نامعتبر برای معاملهٔ بسته')
		if (v < 0) v = 0
		const reg = cReg ? cleanName(r[cReg]) : ''
		const lead = reg && reg !== rep ? reg : ''
		const c: Cand = { row, k: invoiceKey(row.no), rep, noRep, lead, conflict: '', side: { name: row.name, rep, amount: v, saleDate, saleTime }, d: {
			id: 0, no: row.no, month: ds.m - 1, name: row.name, amount: String(v), close: lead ? 'nolead' : 'all', funnel: fk, settle: 'cash', kind: 'new', channel: 'official', leadGen: lead,
			saleDate, saleTime, stageChangedAt: sc.raw, entry: cEntry ? String(r[cEntry] ?? '').trim() : '', src: cSrc ? String(r[cSrc] ?? '').trim() : '', lossReason: cFail ? String(r[cFail] ?? '').trim() : '', fy: TARGET_FY,
		} }
		if (c.k) {
			const prev = fk === 'won' ? seen[c.k] : seenAny[c.k]
			if (prev) {
				// عکسِ باز/شکست کنارِ فاکتورِ همان شماره تعارض نیست؛ دو نسخهٔ ناهمسانِ یک شماره هر دو کنار می‌روند
				const diff = prev.d.funnel === fk ? diffFields(prev.side, c.side, fk === 'won') : []
				if (!diff.length) return bad('duplicate', `شمارهٔ ${row.no} در همین فایل تکراری است (ردیف ${prev.row.i})`)
				prev.conflict ||= `شمارهٔ ${prev.row.no} در ردیفِ ${row.i} همین فایل با ${diff.join('، ')} متفاوت آمده — تطبیق خودکار انجام نشد، هیچ‌کدام ثبت نشد`
				return bad('conflict', `شمارهٔ ${row.no} در ردیفِ ${prev.row.i} همین فایل با ${diff.join('، ')} متفاوت آمده — تطبیق خودکار انجام نشد، هیچ‌کدام ثبت نشد`)
			}
			if (fk === 'won') seen[c.k] = c
			seenAny[c.k] ||= c
		}
		cand.push(c)
	})
	cand.forEach((c) => (P.monthsInFile[c.d.month as number] = 1))
	for (const c of cand) {
		if (c.conflict) { mark(c.row, 'conflict', c.conflict); continue }
		// رکوردهایی که می‌مانند: در «جایگزینی»، ردیفِ قفل‌نشدهٔ همین کارشناس در ماهِ جایگزین‌شده حذف می‌شود و حساب نیست
		const live = (c.k ? exist[c.k] || [] : []).filter((e) => mode !== 'replace' || e.rep !== c.rep || !P.monthsInFile[e.m] || e.locked)
		// فاکتور (بستن): فقط با فاکتورهای هم‌شماره سنجیده می‌شود؛ ردیفِ باز/شکست با هر رکوردِ هم‌شماره (idempotent)
		const won = c.d.funnel === 'won'
		const hits = won ? live.filter((e) => e.won) : live
		if (won && hits.length > 1) { mark(c.row, 'conflict', `شمارهٔ ${c.row.no} در دفتر ${hits.length} فاکتور دارد (${[...new Set(hits.map((e) => e.rep))].join('، ')}) — تطبیق خودکار انجام نشد`); continue }
		if (hits.length) {
			const diff = [...new Set(hits.flatMap((e) => diffFields(e, c.side, won)))]
			const hit = hits[0]
			if (diff.length) { mark(c.row, 'conflict', `شمارهٔ ${c.row.no} در دفترِ «${hit.rep}» با ${diff.join('، ')} متفاوت است — تطبیق خودکار انجام نشد، چیزی تغییر نکرد`); continue }
			if (won && !hit.saleDate && c.d.saleDate) {
				P.dateUpdates.push({ key: hit.key, date: String(c.d.saleDate), time: String(c.d.saleTime || '') })
				mark(c.row, 'duplicate', 'فاکتور موجود حفظ می‌شود؛ فقط تاریخ فروشِ خالی از اکسل تکمیل می‌شود'); continue
			}
			mark(c.row, 'duplicate', `شمارهٔ ${c.row.no} از قبل در دفترِ «${hit.rep}» هست${hit.locked ? ' (سندِ قفل)' : ''} — نسخهٔ اصل حفظ شد، ردیفِ فایل ثبت نشد`); continue
		}
		mark(c.row, 'valid', '')
		const sr = seller(c.rep), mm = (c.d.month as number) + 1, amt = num(c.d.amount)
		sr.amount += amt
		const cell = (sr.months[mm] ||= { n: 0, amount: 0 }); cell.n++; cell.amount += amt
		if (c.noRep) P.noRep++
		else if (!known.has(c.rep)) P.newNames[c.rep] = (P.newNames[c.rep] || 0) + 1
		if (c.lead) { P.leadNames[c.lead] = (P.leadNames[c.lead] || 0) + 1; if (!known.has(c.lead)) P.newNames[c.lead] = (P.newNames[c.lead] || 0) + 1 }
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
export function applyDealImport(full: any, rowsJson: Record<string, unknown>[], opts: { mode: 'append' | 'replace'; rial: boolean; date1904?: boolean; source?: string; sheet?: string; fileName: string; sig: string; custbook: any | null }) {
	const P = planDealImport(rowsJson, full, opts)
	if (P.error) throw new Error(P.error)
	const people: any[] = full.people
	if (P.dateUpdates.length) {
		full.saleDates ||= {}; full.saleDates[TARGET_FY] ||= {}
		full.saleTimes ||= {}; full.saleTimes[TARGET_FY] ||= {}
		for (const update of P.dateUpdates) {
			full.saleDates[TARGET_FY][update.key] = update.date
			if (update.time) full.saleTimes[TARGET_FY][update.key] = update.time
		}
	}
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
	// گزارشِ اعتبارسنجی کنارِ همین ایمپورت می‌ماند (validate_ledger.py روی سرور می‌خواند)؛ نامِ مشتری در آن نیست
	const flagged = P.rows.filter((x) => x.st === 'conflict' || x.st === 'duplicate' || x.st === 'invalid').slice(0, 300).map((x) => ({ i: x.i, no: x.no, rep: x.rep, st: x.st, why: x.why }))
	log.push({ name: opts.fileName, type: 'deal', rows: rowsJson.length, sig: opts.sig, ts: Date.now(), dup: false, routed: true, err: '', dateUpdates: P.dateUpdates.length, fy: { valid: P.cnt.valid, previous: P.cnt.previous, duplicate: P.cnt.duplicate, conflict: P.cnt.conflict, invalid: P.cnt.invalid, years: P.years }, mode: opts.mode, report: { bySeller: P.bySeller, newNames: P.newNames, flagged } })
	if (log.length > 200) full.importLog = log.slice(-200)
	return { plan: P, created, repeatN }
}
