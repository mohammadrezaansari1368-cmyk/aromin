/**
 * موتورِ پورسانت (L2) — پورتِ خط‌به‌خطِ اپِ کامل (شروع-اینجا.html: STAGES/CLOSE/stagesOf/wDeal/commAmount/engine/channelCalc/period).
 * بدونِ هیچ اثرِ جانبی: ورودی تغییر نمی‌کند (rec(i)ِ قدیمی S.months را پر می‌کرد؛ این‌جا فقط پیش‌فرض خوانده می‌شود).
 * وزن‌های هفت مرحله از S.weights خوانده می‌شوند؛ پیش‌فرض = ۵/۱۰/۲۰/۱۵/۳۵/۱۰/۵ (جمع ۱۰۰).
 * بدونِ import تا با `node file.ts` هم اجرا شود (آزمونِ برابری با موتورِ قبلی).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export const VERSION = '1.0.0'

export type StageKey = 'lead' | 'pre' | 'funnel' | 'follow' | 'close' | 'post' | 'fin'
export type Weights = Record<StageKey, number>
export type FunnelKey = 'start' | 'qualify' | 'advance' | 'won' | 'lost'
export type Settle = 'cash' | 'check' | 'hold'

export interface Deal {
	id: number
	no?: string
	name?: string
	month?: number | string | null
	amount?: string | number
	funnel?: FunnelKey | string
	stages?: StageKey[]
	close?: string
	mgrShare?: boolean
	settle?: Settle | string
	kind?: 'repeat' | 'new' | string
	channel?: 'official' | 'unofficial' | string
	leadGen?: string
	supportGen?: string
	supportSla?: boolean
	finBy?: string
	src?: string
	lossReason?: string
	entry?: string
	fy?: string
	taskFollow?: number
	taskPost?: number
	[k: string]: unknown
}
export interface Tier { cap: number; rate: number }
export interface MonthCfg { base: number; threshold: number; tiers: Tier[]; milestones?: { at: number; amount: number; name: string }[] }
export interface CommS { year?: string; weights: Weights; officialDeduct?: number; months?: Record<string, { active: boolean | null; cfg: MonthCfg }> }

export const DEFAULT_WEIGHTS: Weights = { lead: 5, pre: 10, funnel: 20, follow: 15, close: 35, post: 10, fin: 5 }
export const DEFAULT_CFG: MonthCfg = {
	base: 17326400, threshold: 25,
	tiers: [
		{ cap: 40, rate: 3.0 }, { cap: 52, rate: 3.6 }, { cap: 65, rate: 4.3 }, { cap: 80, rate: 4.6 }, { cap: 100, rate: 4.9 },
		{ cap: 200, rate: 4.9 }, { cap: 300, rate: 4.9 }, { cap: 400, rate: 4.9 },
		{ cap: 500, rate: 4.9 }, { cap: 600, rate: 4.9 }, { cap: 700, rate: 4.9 },
	],
	milestones: [{ at: 40, amount: 800000, name: 'تحقق هدف اصلی' }, { at: 52, amount: 1200000, name: 'تحقق هدف کشش' }],
}
export const freshS = (): CommS => ({ year: '۱۴۰۵', weights: { ...DEFAULT_WEIGHTS }, officialDeduct: 10, months: {} })

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
export const STAGES: { k: StageKey; t: string; short: string }[] = [
	{ k: 'lead', t: 'ایجاد لید', short: 'لید' },
	{ k: 'pre', t: 'واجد شرایط و پیش‌فاکتور', short: 'پیش‌فاکتور' },
	{ k: 'funnel', t: 'پیشبرد در قیف', short: 'قیف' },
	{ k: 'follow', t: 'پیگیری', short: 'پیگیری' },
	{ k: 'close', t: 'بستن قرارداد', short: 'بستن' },
	{ k: 'post', t: 'پیگیری پس از فروش', short: 'پس‌ازفروش' },
	{ k: 'fin', t: 'تأیید مالی و صحت داده', short: 'مالی' },
]
export const STAGE_KEYS = STAGES.map((s) => s.k)
export const CLOSE: { v: string; t: string; short: string; stages: StageKey[] }[] = [
	{ v: 'all', t: 'چرخه‌ی کامل — همه‌ی مراحل', short: 'چرخه‌ی کامل', stages: ['lead', 'pre', 'funnel', 'follow', 'close', 'post', 'fin'] },
	{ v: 'lead', t: 'فقط ایجاد لید', short: 'ایجاد لید', stages: ['lead'] },
	{ v: 'lpre', t: 'ایجاد لید و پیش‌فاکتور', short: 'لید و پیش‌فاکتور', stages: ['lead', 'pre'] },
	{ v: 'fun', t: 'پیشروی در قیف', short: 'پیشروی در قیف', stages: ['funnel'] },
	{ v: 'fol', t: 'پیگیری', short: 'پیگیری', stages: ['follow'] },
	{ v: 'funfol', t: 'پیشروی در قیف و پیگیری', short: 'قیف و پیگیری', stages: ['funnel', 'follow'] },
	{ v: 'close', t: 'مذاکره و بستن قرارداد', short: 'بستن قرارداد', stages: ['close'] },
	{ v: 'joint', t: 'مشارکت مشترک در بستن (با مدیر)', short: 'مشارکت در بستن', stages: ['follow', 'close'] },
	{ v: 'mid', t: 'پیش‌فاکتور تا بستن (لید با دیگری)', short: 'میانه تا بستن', stages: ['pre', 'funnel', 'follow', 'close'] },
	{ v: 'nolead', t: 'همه به‌جز ایجاد لید (لید با دیگری)', short: 'به‌جز لید', stages: ['pre', 'funnel', 'follow', 'close', 'post', 'fin'] },
	{ v: 'post', t: 'پیگیری پس از فروش و وفادارسازی', short: 'پس از فروش', stages: ['post'] },
	{ v: 'fin', t: 'تأیید مالی و صحت داده', short: 'مالی', stages: ['fin'] },
]
export const SETTLE: { v: Settle; t: string }[] = [{ v: 'cash', t: 'نقد ۷۰٪ به بالا' }, { v: 'check', t: 'چک معتبر' }, { v: 'hold', t: 'معلق یا تأییدنشده' }]
export const FUNNEL: { k: FunnelKey; t: string }[] = [
	{ k: 'start', t: 'آغاز' }, { k: 'qualify', t: 'واجد شرایط' }, { k: 'advance', t: 'پیشبرد' }, { k: 'won', t: 'بستن' }, { k: 'lost', t: 'شکست' },
]
export const KIND = [{ v: 'repeat', t: 'تکرار خرید' }, { v: 'new', t: 'مشتری جدید' }]
export const CHANNEL = [{ v: 'official', t: 'رسمی' }, { v: 'unofficial', t: 'غیررسمی' }]

/* ---------- قالب‌بندی (همان fa/sep/mil/pct/faGroup/num) ---------- */
const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
export const fa = (s: unknown) => String(s).replace(/[0-9]/g, (d) => FA[+d])
export function sep(n: number) {
	n = Math.round(n || 0)
	const g = n < 0
	n = Math.abs(n)
	return (g ? '−' : '') + fa(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))
}
export const mil = (n: number) => fa((Math.round((n || 0) / 1e5) / 10).toFixed(1)) + 'M'
export const pct = (n: number) => fa((Math.round((n || 0) * 10) / 10).toString()) + '٪'
const latin = (v: unknown) =>
	String(v == null ? '' : v)
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
export function faGroup(v: unknown) {
	let s = latin(v).replace(/[^\d]/g, '')
	s = s.replace(/^0+(?=\d)/, '')
	if (s === '') return ''
	return fa(s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))
}
export function num(v: unknown) {
	if (v == null) return 0
	const f = parseFloat(latin(v).replace(/[^\d.-]/g, ''))
	return isFinite(f) ? f : 0
}
export const rawDigits = (v: unknown) => latin(v).replace(/[^\d]/g, '')
export const label = (l: { v: string; t: string }[], v: unknown) => l.find((x) => x.v === v)?.t ?? ''

/* ---------- مراحل و وزن ---------- */
export const roleOf = (v: unknown) => CLOSE.find((c) => c.v === v) ?? CLOSE[0]
/** مراحلِ یک معامله: از d.stages، وگرنه از نقشِ قدیمیِ d.close؛ لید/پس‌ازفروش/مالی اگر به شخصِ دیگری رفته باشد حذف می‌شود */
export function stagesOf(d: Deal): StageKey[] {
	let base: StageKey[] = Array.isArray(d.stages) ? d.stages.slice() : roleOf(d.close || 'all').stages.slice()
	if (d.leadGen) base = base.filter((s) => s !== 'lead')
	if (d.supportGen && d.supportSla) base = base.filter((s) => s !== 'post')
	if (d.finBy) base = base.filter((s) => s !== 'fin')
	return base
}
/** وزنِ معامله = جمعِ وزنِ مراحلِ تیک‌خورده؛ مشارکتِ مدیر = نصفِ اعتبارِ بستن */
export function wDeal(d: Deal, W: Weights | 'full'): number {
	if (W === 'full') return 100
	let s = 0
	for (const k of stagesOf(d)) {
		let w = W[k] || 0
		if (k === 'close' && d.mgrShare) w = w / 2
		s += w
	}
	return s
}
export const isFullDeal = (d: Deal) => stagesOf(d).length === STAGES.length && !d.mgrShare
export const funnelOf = (d: Deal): FunnelKey => (d.funnel as FunnelKey) || 'won'
export const funLabel = (k: string) => FUNNEL.find((f) => f.k === k)?.t ?? k
export const monthOf = (d: Deal) => {
	let k = d.month == null || d.month === '' ? 3 : +d.month
	if (!(k >= 0 && k <= 11)) k = 3
	return k
}
/** مبلغِ قابلِ پورسانت پس از کسرِ خودکارِ فاکتورِ رسمی */
export function commAmount(d: Deal, S: Pick<CommS, 'officialDeduct'>): number {
	const a = num(d.amount)
	if (d.channel === 'official') return a * (1 - (S.officialDeduct || 0) / 100)
	return a
}
/** نقش‌ها n/7 (لیدِ واگذارشده شمرده نمی‌شود) — همان c1RoleSum */
export function roleCount(d: Deal) {
	const has = !!d.leadGen
	return stagesOf(d).filter((k) => !(k === 'lead' && has)).length
}
/** مبنای پورسانتِ یک ردیف (بعد از کسرِ رسمی و وزن؛ معلق = ۰) — همان basisCell */
export function rowBasis(d: Deal, S: CommS) {
	const ca = commAmount(d, S), w = wDeal(d, S.weights || DEFAULT_WEIGHTS) / 100
	return { ca, w, basis: d.settle === 'hold' ? 0 : ca * w, held: d.settle === 'hold' }
}

/* ---------- ماه/پله ---------- */
export function cfgOf(S: CommS, i: number): { active: boolean | null; cfg: MonthCfg } {
	const r = S.months && S.months[i]
	return r && r.cfg ? r : { active: null, cfg: DEFAULT_CFG }
}
export function engine(sales: number, cfg: MonthCfg) {
	let prev = cfg.threshold * 1e6, total = 0
	for (let i = 0; i < cfg.tiers.length; i++) {
		const cap = cfg.tiers[i].cap * 1e6, r = cfg.tiers[i].rate / 100
		let used = sales > prev ? Math.min(sales, cap) - prev : 0
		if (used < 0) used = 0
		total += used * r
		prev = cap
	}
	const ms = 0 // پاداشِ مقطوع به «پاداش عملکرد» منتقل شده (همان موتورِ قبلی)
	return { commission: total, mile: ms, over: Math.max(0, sales - prev), payout: total + ms }
}
export function channelCalc(cash: number, check: number, hold: number, cfg: MonthCfg) {
	const eligible = cash + check
	const e = engine(eligible, cfg), full = engine(eligible + hold, cfg)
	const cashCom = eligible > 0 ? e.commission * (cash / eligible) : 0
	const checkCom = eligible > 0 ? e.commission * (check / eligible) : 0
	const pendCom = full.commission - e.commission, pendMile = full.mile - e.mile
	return {
		eligible, cash, check, hold, commission: e.commission, mile: e.mile, over: e.over, payout: e.payout,
		cashCom, checkCom, pendBase: hold, pendCom, pendMile, payNow: cashCom + e.mile, payCheck: checkCom, payPend: pendCom + pendMile,
	}
}
type Ch = ReturnType<typeof channelCalc>
const zAcc = () => ({ gross: 0, n: 0, eligible: 0, commission: 0, mile: 0, over: 0, payout: 0, cash: 0, check: 0, hold: 0, payNow: 0, payCheck: 0, payPend: 0 })
export type Period = ReturnType<typeof period>

/**
 * محاسبهٔ دوره — همان period()ِ اپِ کامل. GM = 'all' | 0..11 (فیلترِ سراسریِ ماه، فقط روی شمارشِ قیف و پولِ ماه‌ها).
 * W: وزن‌ها (پیش‌فرض S.weights) یا 'full'.
 */
export function period(inv: Deal[], S: CommS, opts: { GM?: 'all' | number; W?: Weights | 'full' } = {}) {
	const W = opts.W || S.weights || DEFAULT_WEIGHTS
	const GM = opts.GM ?? 'all'
	const inGM = (d: Deal) => GM === 'all' || (d.month == null || d.month === '' ? 3 : +d.month) === +GM
	const B: { idx: number; n: number; gross: number; off: { cash: number; check: number; hold: number; gross: number; n: number }; uno: { cash: number; check: number; hold: number; gross: number; n: number } }[] = []
	for (let i = 0; i < 12; i++) B[i] = { idx: i, n: 0, gross: 0, off: { cash: 0, check: 0, hold: 0, gross: 0, n: 0 }, uno: { cash: 0, check: 0, hold: 0, gross: 0, n: 0 } }
	const funnel: Record<string, { k: string; t: string; n: number; gross: number }> = {}
	FUNNEL.forEach((s) => (funnel[s.k] = { k: s.k, t: s.t, n: 0, gross: 0 }))
	for (const d of inv) {
		if (!inGM(d)) continue
		const fk = funnelOf(d), a = num(d.amount)
		if (!funnel[fk]) funnel[fk] = { k: fk, t: funLabel(fk), n: 0, gross: 0 }
		funnel[fk].n++; funnel[fk].gross += a
		if (fk !== 'won') continue
		const k = monthOf(d)
		const b = B[k], val = commAmount(d, S) * (wDeal(d, W) / 100)
		b.gross += a; b.n++
		const ch = d.channel === 'unofficial' ? b.uno : b.off
		ch.gross += a; ch.n++
		if (d.settle === 'hold') ch.hold += val
		else if (d.settle === 'check') ch.check += val
		else ch.cash += val
	}
	const T = {
		gross: 0, hold: 0, eligible: 0, commission: 0, mile: 0, over: 0, rep: 0, indep: 0, nInv: 0,
		cashBase: 0, checkBase: 0, pendBase: 0, payNow: 0, payCheck: 0, payPend: 0, off: zAcc(), uno: zAcc(),
		months: [] as any[], byStage: {} as Record<string, { k: string; t: string; n: number; basis: number }>,
		byClose: {} as Record<string, { v: string; t: string; n: number; gross: number; basis: number; max: number }>,
		leadBonus: {} as Record<string, { id: string; n: number; base: number; basis: number }>,
		supportBonus: {} as Record<string, { id: string; n: number; base: number; basis: number }>,
		financeBonus: {} as Record<string, { id: string; n: number; base: number; basis: number }>,
		funnel, activeMonths: [] as any[], nMonths: 0, payout: 0, baseTotal: 0, total: 0, eff: 0, indRatio: 0, repRatio: 0, holdRatio: 0, offPayout: 0, unoPayout: 0,
	}
	const months: any[] = []
	for (let j = 0; j < 12; j++) {
		const m: any = B[j], r = cfgOf(S, j), c = r.cfg
		m.cfg = c
		m.active = r.active === null || r.active === undefined ? m.n > 0 : !!r.active
		const off: Ch = channelCalc(m.off.cash, m.off.check, m.off.hold, c)
		const uno: Ch = channelCalc(m.uno.cash, m.uno.check, m.uno.hold, c)
		m.offc = off; m.unoc = uno
		m.eligible = off.eligible + uno.eligible
		m.commission = off.commission + uno.commission
		m.mile = off.mile + uno.mile
		m.over = off.over + uno.over
		m.payout = off.payout + uno.payout
		m.hold = off.hold + uno.hold
		m.eff = m.eligible > 0 ? (m.payout / m.eligible) * 100 : 0
		m.total = m.active ? c.base + m.payout : 0
		months.push(m)
		if (!m.active) continue
		T.gross += m.gross; T.nInv += m.n
		T.eligible += m.eligible; T.commission += m.commission; T.mile += m.mile; T.over += m.over; T.hold += m.hold
		for (const kk of ['off', 'uno'] as const) {
			const cc = kk === 'off' ? off : uno, tt = T[kk], src = kk === 'off' ? m.off : m.uno
			tt.eligible += cc.eligible; tt.commission += cc.commission; tt.mile += cc.mile
			tt.over += cc.over; tt.payout += cc.payout; tt.cash += cc.cash; tt.check += cc.check; tt.hold += cc.hold
			tt.payNow += cc.payNow; tt.payCheck += cc.payCheck; tt.payPend += cc.payPend
			tt.gross += src.gross; tt.n += src.n
		}
		T.cashBase += off.cash + uno.cash
		T.checkBase += off.check + uno.check
		T.pendBase += off.hold + uno.hold
		T.payNow += off.payNow + uno.payNow
		T.payCheck += off.payCheck + uno.payCheck
		T.payPend += off.payPend + uno.payPend
	}
	STAGES.forEach((s) => (T.byStage[s.k] = { k: s.k, t: s.t, n: 0, basis: 0 }))
	const wts: Weights = W === 'full' ? { lead: 100, pre: 100, funnel: 100, follow: 100, close: 100, post: 100, fin: 100 } : W
	T.byClose = { all: { v: 'all', t: 'چرخه‌ی کامل', n: 0, gross: 0, basis: 0, max: 0 }, partial: { v: 'partial', t: 'مشارکتی', n: 0, gross: 0, basis: 0, max: 0 } }
	const bonus = (map: Record<string, { id: string; n: number; base: number; basis: number }>, id: string, basis: number, rate: number) => {
		if (!map[id]) map[id] = { id, n: 0, base: 0, basis: 0 }
		map[id].n++; map[id].basis += basis; map[id].base += basis * rate
	}
	for (const d of inv) {
		const k = d.month == null || d.month === '' ? 3 : +d.month
		if (!months[k] || !months[k].active) continue
		if (funnelOf(d) !== 'won') continue
		const a = num(d.amount), ca = commAmount(d, S), w = wDeal(d, W) / 100
		const full = isFullDeal(d), b = full ? T.byClose.all : T.byClose.partial
		b.n++; b.gross += a; if (a > b.max) b.max = a
		if (d.settle === 'hold') continue
		b.basis += ca * w
		if (full) T.indep += ca * w
		if (d.kind === 'repeat') T.rep += ca * w
		for (const sk of stagesOf(d)) {
			let sw = wts[sk] || 0
			if (sk === 'close' && d.mgrShare) sw = sw / 2
			T.byStage[sk].n++; T.byStage[sk].basis += ca * (sw / 100)
		}
		// نرخِ مرزی (پله‌ای که مبنای ماه در آن است) — همان mRate
		const mRate = (() => {
			const cfgm = cfgOf(S, k).cfg, elig = months[k].eligible
			if (!(elig > 0)) return 0
			let prev = cfgm.threshold * 1e6
			if (elig <= prev) return 0
			for (let ti = 0; ti < cfgm.tiers.length; ti++) {
				const cap = cfgm.tiers[ti].cap * 1e6
				if (elig <= cap || ti === cfgm.tiers.length - 1) return cfgm.tiers[ti].rate / 100
				prev = cap
			}
			return months[k].commission / elig
		})()
		if (d.leadGen) bonus(T.leadBonus, d.leadGen, ca * ((wts.lead || 0) / 100), mRate)
		if (d.supportGen && d.supportSla) bonus(T.supportBonus, d.supportGen, ca * ((wts.post || 0) / 100), mRate)
		if (d.finBy) bonus(T.financeBonus, d.finBy, ca * ((wts.fin || 0) / 100), mRate)
	}
	T.months = months
	T.activeMonths = months.filter((m) => m.active)
	T.nMonths = T.activeMonths.length
	T.payout = T.commission + T.mile
	T.baseTotal = T.activeMonths.reduce((s, m) => s + m.cfg.base, 0)
	T.total = T.baseTotal + T.payout
	T.eff = T.eligible > 0 ? (T.payout / T.eligible) * 100 : 0
	T.indRatio = T.eligible > 0 ? (T.indep / T.eligible) * 100 : 0
	T.repRatio = T.eligible > 0 ? (T.rep / T.eligible) * 100 : 0
	T.holdRatio = T.hold + T.eligible > 0 ? (T.hold / (T.hold + T.eligible)) * 100 : 0
	T.offPayout = T.off.commission + T.off.mile
	T.unoPayout = T.uno.commission + T.uno.mile
	return T
}

/* ---------- وضعیت‌های توجهِ دفتر (C1) ---------- */
export type Att = 'dup' | 'hold' | 'check' | 'fin'
export const ATT: { k: Att; t: string; sig: string; na: string; naHint: string }[] = [
	{ k: 'dup', t: 'شمارهٔ تکراری', sig: 'خطرِ دوباره‌شماری', na: 'رفع تکرار', naHint: 'شمارهٔ فاکتور را اصلاح کن' },
	{ k: 'hold', t: 'معلق', sig: 'پورسانت مسدود', na: 'رفع تعلیق', naHint: 'وضعیت تسویه را بررسی کن' },
	{ k: 'check', t: 'چک در انتظار وصول', sig: 'پورسانت پس از وصول', na: 'وصول شد', naHint: 'ثبتِ وصولِ چک (تسویه: نقد)' },
	{ k: 'fin', t: 'بدون تأیید مالی', sig: 'بسته، تأیید مالی ثبت نشده', na: 'تأیید مالی', naHint: 'انتخابِ کارشناسِ مالیِ تأییدکننده' },
]
/** شماره‌های فاکتورِ تکراری در یک دفتر — فقط تکرارِ دقیقِ شمارهٔ فاکتور میان معاملاتِ بسته (کلید = invoiceKey) */
export const dupSet = (inv: Deal[]): Set<string> => dupInvoices(inv)
export function attIs(d: Deal, k: Att, dup: Set<string>) {
	if (k === 'dup') return isInvoice(d) && dup.has(invoiceKey(d.no))
	if (k === 'hold') return d.settle === 'hold'
	if (k === 'check') return d.settle === 'check'
	if (k === 'fin') return funnelOf(d) === 'won' && !d.finBy
	return false
}
export const attPrimary = (d: Deal, dup: Set<string>): Att | '' => (['dup', 'hold', 'check', 'fin'] as Att[]).find((k) => attIs(d, k, dup)) || ''

/* ---------- سندِ مالی: شمارهٔ فاکتور، تکراریِ واقعی، وضعیت ---------- */
/** کلیدِ فاکتور: فقط تفاوت‌های بی‌ضرر (ارقام فارسی/عربی، فاصله، ی/ک، حروفِ بزرگ/کوچک) یکسان می‌شوند؛ خودِ شماره هرگز تغییر نمی‌کند */
export const invoiceKey = (no: unknown) =>
	String(no == null ? '' : no).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[\u064A\u06CC\u0649]/g, '\u06CC').replace(/[\u0643\u06A9]/g, '\u06A9').replace(/[\s\u200c]+/g, '').toLowerCase()
/** فقط معاملهٔ «بستن» فاکتور دارد؛ ردیف‌های باز/شکست همان معامله در ماه‌های دیگر (عکسِ لحظه‌ایِ جولیو) فاکتور نیستند */
export const isInvoice = (d: Deal) => funnelOf(d) === 'won' && !!invoiceKey(d.no)
/** شماره‌هایی که دقیقاً در بیش از یک فاکتور (معاملهٔ بسته) آمده‌اند */
export function dupInvoices(deals: Iterable<Deal>): Set<string> {
	const seen = new Set<string>(), dup = new Set<string>()
	for (const d of deals) {
		if (!isInvoice(d)) continue
		const k = invoiceKey(d.no)
		if (seen.has(k)) dup.add(k); else seen.add(k)
	}
	return dup
}
export type FinState = 'draft' | 'submitted' | 'approved' | 'closed'
export const finStateOf = (d: Deal): FinState => (d.finClosed ? 'closed' : d.finState === 'approved' ? 'approved' : d.finState === 'submitted' ? 'submitted' : 'draft')
/** سندِ قفل: در انتظار تصویب / تصویب‌شده / بسته — فقط مسیرهای سرور تغییرش می‌دهند */
export const isLocked = (d: Deal | null | undefined) => !!d && finStateOf(d) !== 'draft'
export const FIN_STATE_LABEL: Record<FinState, string> = { draft: 'قابل ویرایش', submitted: 'در انتظار تصویب', approved: 'تصویب‌شده', closed: 'بسته‌شده' }
export const SERVER_FIELDS = ['finState', 'finApproval', 'finAudit', 'finClosed', 'finReopen'] as const
