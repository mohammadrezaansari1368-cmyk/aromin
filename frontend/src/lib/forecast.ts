/**
 * موتورِ «پیش‌بینی فروش و بودجه‌بندی» — انتقالِ خط‌به‌خطِ renderForecast و توابعِ کمکیِ اپِ کامل.
 * همان کلیدهای FORECAST (data-fc)، همان فرمول‌ها و همان قالبِ ذخیره؛ تا دادهٔ دو نسخه یکی بماند.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Form = Record<string, string | boolean>
export type Extra = Record<string, any>

export const MN = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

/* ---------- قالب‌بندیِ اعداد (کپیِ دقیقِ اپِ کامل) ---------- */
const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
export const fa = (s: unknown) => String(s).replace(/[0-9]/g, (d) => FA[+d])
export function sep(n: number) {
	n = Math.round(n || 0)
	const g = n < 0
	n = Math.abs(n)
	return (g ? '−' : '') + fa(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))
}
export function faGroup(v: unknown) {
	let s = String(v == null ? '' : v)
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[^\d]/g, '')
	s = s.replace(/^0+(?=\d)/, '')
	if (s === '') return ''
	return fa(s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))
}
export const pct = (n: number) => fa((Math.round((n || 0) * 10) / 10).toString()) + '٪'
const faToLat = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
/** fnum(id) — همان پارسِ مقدارِ ورودی. */
export function fnum(v: unknown) {
	if (v == null || typeof v === 'boolean') return 0
	const s = faToLat(String(v)).replace(/[٬،,\s]/g, '').replace(/[^\d.-]/g, '')
	return parseFloat(s) || 0
}
/** گروه‌بندیِ فیلدهای چندمقداری (دلفی/تیم فروش). */
export function fcGroupList(str: string) {
	return faToLat(String(str))
		.split(/[،;\n]+/)
		.map((s) => {
			const d = s.replace(/[^\d]/g, '')
			return d ? faGroup(d) : ''
		})
		.filter((s) => s !== '')
		.join('، ')
}
function fcList(v: unknown) {
	return faToLat(String(v ?? ''))
		.split(/[،;\n]+/)
		.map((s) => parseFloat(s.replace(/[^\d.-]/g, '')))
		.filter((x) => isFinite(x) && x > 0)
}
function fcMed(arr: number[]) {
	if (!arr.length) return 0
	const a = arr.slice().sort((x, y) => x - y)
	const m = Math.floor(a.length / 2)
	return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
const coNum = (v: unknown) => +String(v == null ? '' : v).replace(/[^\d.-]/g, '') || 0

/* ---------- فیلدها و پیش‌فرض‌های HTML ---------- */
export const DEFAULTS: Form = {
	fcIndustry: '', fcHorizon: '3', fcHorizonUnit: '1', fcStrategy: 'survive', fcUsd: '۱۸۷٬۵۱۵',
	fcRevenue: '0', fcVolume: '0', fcMktPct: '10', fcUnitPrice: '0',
	fcY1: '0', fcD1: '0', fcY2: '0', fcD2: '0', fcY3: '0', fcD3: '0',
	fcM1: '0', fcM2: '', fcM3: '', fcM4n: '0', fcM4a: '0', fcM4r: '0', fcM4rep: '1', fcM4type: '', fcM4real: false,
	fcM4share: '100', fcM4brand: '0', fcM4aware: '0', fcM4chan: '0', fcM4comp: '0',
	fcAlpha: '0.7', fcFixed: '0', fcMargin: '0', fcCapWorkers: '0', fcCapDaily: '0', fcCapDays: '26', fcCapP: '0',
	fcUnit: 'rial', fcTargetYear: '1405',
	fcUse1: true, fcUse2: true, fcUse3: true, fcUse4: true, fcUse5: true, fcUse6: true, fcUse7: true, fcUse8: true, fcUse9: true,
	fcC1: '50', fcC2: '50', fcC3: '50', fcC4: '50', fcC5: '50', fcC6: '50', fcRisk: '50', fcOblig: '5', fcAsset: '5',
}
export const FC_IDS = Object.keys(DEFAULTS)
/** فیلدهای پولیِ سه‌رقم‌سه‌رقم (کلاسِ grp در اپِ کامل). */
export const GRP = new Set(['fcRevenue', 'fcVolume', 'fcUnitPrice', 'fcY1', 'fcY2', 'fcY3', 'fcD1', 'fcD2', 'fcD3', 'fcM1', 'fcM4n', 'fcM4a', 'fcFixed', 'fcCapP'])
for (const id of GRP) DEFAULTS[id] = faGroup(DEFAULTS[id])

/* ---------- پروفایل‌های صنعت ---------- */
export interface Industry {
	strategy: string; mkt: number; margin: number; buyer: number; rep: number; unit: string
	season: number[]; peak: string; low: string; lunar: { ramadan: number; muharram: number }; cal: string; note: string
}
export const FC_INDUSTRY: Record<string, Industry> = {
	soft: {
		strategy: 'grow', mkt: 12, margin: 30, buyer: 10, rep: 1, unit: 'لایسنس / دستگاه',
		season: [0.85, 1.35, 1.1, 0.95, 0.6, 0.9, 1.2, 1.2, 1.35, 1.05, 0.9, 0.95],
		peak: 'اردیبهشت (کلوزینگ B2B) · مهر–آبان (تصمیم‌سازی) · آذر (بودجهٔ دولتی)', low: 'مرداد (ضعیف‌ترین ماه) و ماه رمضان (رکود B2B)',
		lunar: { ramadan: 0.7, muharram: 0.85 },
		cal: 'طبقِ جزوه: اردیبهشت بالاترین حجمِ قراردادهای سازمانی؛ مهر و آبان فازِ تصمیم‌سازی؛ آذر آخرین ماهِ مصرفِ بودجهٔ دولتی (~۷۰٪ اقتصاد دولتی است، موجش به همه می‌رسد)؛ مرداد ضعیف‌ترین ماهِ ۸ سالِ اخیر.',
		note: '<b>آرومین — نرم‌افزار و سخت‌افزار (B2B):</b> حاشیهٔ نرم‌افزار ~۴۰٪ و سخت‌افزار ~۸٪؛ با ترکیبِ درآمدیِ ۷۰٪/۳۰٪ → میانگینِ ترکیبی ~۳۰٪. چرخهٔ فروش بلند، بازاریابی ۱۰–۱۵٪، استراتژیِ <b>رشد</b>. واحد: «لایسنس/دستگاه» با قیمتِ واحدِ بالا. نرخِ نفوذِ سالانه به صنفِ هدف ~۱۰٪. اوجِ فروش طبقِ الگوی فصلی: اردیبهشت (کلوزینگ B2B)، مهر–آبان (تصمیم‌سازی) و آذر (بودجهٔ دولتی)؛ کف: مرداد و رمضان.',
	},
	food: {
		strategy: 'hold', mkt: 6, margin: 35, buyer: 20, rep: 12, unit: 'سفارش / کاور',
		season: [1.4, 1.05, 1.0, 0.95, 0.7, 0.95, 1.0, 0.95, 0.95, 1.05, 0.95, 1.35],
		peak: 'نوروز/فروردین (FMCG تا ۵ برابر) و اسفند (خرید عید)', low: 'مرداد (ضعیف‌ترین ماه)',
		lunar: { ramadan: 1.5, muharram: 0.9 },
		cal: 'طبقِ جزوه: نوروز اوجِ FMCG و نظافتی؛ اسفند خریدِ عید؛ دی (یلدا/سرما) خوب؛ مرداد ضعیف‌ترین ماه. <b>ماه رمضان</b> برای B2Cِ غذایی (رستوران/ساندویچی/دل‌وجگر) <b>رونق</b> دارد — چون قمری است هر سال جابه‌جا می‌شود؛ آن ماه را دستی بالاتر ببر.',
		note: '<b>کافه، رستوران و صنعت غذایی (B2C):</b> حاشیهٔ پایین‌تر (~۳۰–۴۰٪)، حجمِ بالا و قیمتِ واحدِ پایین. واحد: «سفارش/کاور». بازاریابی ۵–۸٪، استراتژیِ <b>حفظ</b>. نرخِ تبدیلِ بازدیدکننده به خریدار ~۲۰٪. فصلی: اوج در نوروز (FMCG) و اسفند (خریدِ عید)، کف در مرداد (ضعیف‌ترین ماهِ سال)؛ رمضان برای B2Cِ غذایی رونق دارد (خودکار). کلید: تکرارِ خرید و وفاداری.',
	},
	gym: {
		strategy: 'hold', mkt: 10, margin: 55, buyer: 15, rep: 12, unit: 'اشتراک / عضو',
		season: [1.4, 1.1, 1.0, 0.7, 0.6, 0.9, 1.4, 1.15, 1.0, 0.95, 0.95, 0.9],
		peak: 'فروردین (تصمیمِ سالِ نو) و مهر (بعد از تابستان)', low: 'تیر–مرداد (تابستان) و ماه رمضان',
		lunar: { ramadan: 0.55, muharram: 0.95 },
		cal: 'همسو با روانِ فصلیِ جزوه: فروردین موجِ تصمیمِ سالِ نو؛ مهر روانِ «بازگشت به روتین» (مثلِ بازگشت به مدرسه)؛ تابستان (تیر–مرداد) کف به‌خاطر سفر و گرما؛ <b>ماه رمضان</b> (قمری، متغیر) به‌خاطر روزه افت دارد — آن ماه را دستی پایین‌تر ببر.',
		note: '<b>باشگاه بدنسازی (اشتراکی):</b> مدلِ عضویت/تمدید، حاشیهٔ ~۵۰–۶۰٪ با هزینهٔ ثابتِ بالا. واحد: «اشتراک/عضو». بازاریابی ۸–۱۲٪، استراتژیِ <b>حفظ</b> چون <b>ماندگاریِ اعضا (کاهشِ چان‌ریت)</b> از جذب مهم‌تر است. نرخِ تبدیل ~۱۵٪. اوجِ ثبت‌نام: فروردین (تصمیمِ سالِ نو) و مهر (بعد از تابستان)، افت در تابستان.',
	},
}
export const INDUSTRY_OPTS: [string, string][] = [
	['', '— عمومی (بدون پیش‌فرضِ صنعتی) —'],
	['soft', 'آرومین — نرم‌افزار و سخت‌افزار (B2B)'],
	['food', 'کافه، رستوران و صنعت غذایی'],
	['gym', 'باشگاه بدنسازی (اشتراکی)'],
]
/** اعمالِ پیش‌فرض‌های صنعت (fcApplyIndustry با setDefaults). */
export function industryDefaults(k: string): Partial<Form> {
	const pr = FC_INDUSTRY[k]
	if (!pr) return {}
	const o: Partial<Form> = { fcStrategy: pr.strategy, fcMktPct: String(pr.mkt), fcMargin: String(pr.margin), fcM4r: String(pr.buyer) }
	if (pr.rep) o.fcM4rep = String(pr.rep)
	return o
}

export const M4TYPES: Record<string, { r: number; note: string }> = {
	cafe: { r: 10, note: 'کافه/رستوران (فروش نرم‌افزار به این صنف): نفوذ سالانهٔ استاندارد حدود ۱۰٪ از بازار هدف.' },
	b2b: { r: 70, note: 'B2B صنعتی/کارخانه (مثال جزوه): حدود ۷۰٪ از کارخانه‌های هدف در یک سال خرید می‌کنند.' },
	brand: { r: 40, note: 'کالا/خدمات مصرفیِ برندِ خاص (مثال جزوه): حدود ۴۰٪ بازار از آن برند استفاده می‌کنند.' },
	retail: { r: 20, note: 'خرده‌فروشی حضوری: نرخ تبدیل بازدیدکننده به خریدار حدود ۲۰٪.' },
	warm: { r: 30, note: 'لید گرم/معرفی‌شده: نرخ تبدیل حدود ۲۵ تا ۳۵٪.' },
	ecom: { r: 3, note: 'فروشگاه اینترنتی (ای‌کامرس): نرخ تبدیل جهانی حدود ۲ تا ۳٪.' },
	saas: { r: 5, note: 'SaaS سرد/عمومی: نرخ تبدیل بازار سرد حدود ۳ تا ۷٪.' },
}
export const M4TYPE_OPTS: [string, string][] = [
	['', '— انتخاب کن تا نرخ پر شود —'],
	['cafe', 'کافه/رستوران (نرم‌افزار به این صنف) — ۱۰٪'],
	['b2b', 'B2B صنعتی/کارخانه (جزوه) — ۷۰٪'],
	['brand', 'کالا/خدمات برندِ خاص (جزوه) — ۴۰٪'],
	['retail', 'خرده‌فروشی حضوری — ۲۰٪'],
	['warm', 'لید گرم/معرفی‌شده — ۳۰٪'],
	['ecom', 'فروشگاه اینترنتی (ای‌کامرس) — ۳٪'],
	['saas', 'SaaS سرد/عمومی — ۵٪'],
]
export const M4REAL_MSG = ' مشتری‌ها ~۴۰٪ اغراق می‌کنند؛ طبق جزوه تیکِ «ضریب واقع‌گرایی ۰٫۶۵×» را بزن.'
export const MARGIN_STD: [string, string][] = [
	['', '— انتخاب کن تا حاشیه پر شود —'],
	['70', 'نرم‌افزار / SaaS — ۷۰٪'], ['25', 'سخت‌افزار و الکترونیک (خرده‌فروشی) — ۲۵٪'], ['65', 'کافه / رستوران / فست‌فود — ۶۵٪'],
	['60', 'باشگاه / فیتنس — ۶۰٪'], ['33', 'خرده‌فروشیِ عمومی — ۳۳٪'], ['15', 'عمده‌فروشی و پخش — ۱۵٪'], ['37', 'تولید / ماشین‌آلات — ۳۷٪'],
	['23', 'تولیدِ موادِ غذایی — ۲۳٪'], ['25', 'ساخت‌وساز — ۲۵٪'], ['45', 'فروشگاه اینترنتی (ای‌کامرس) — ۴۵٪'], ['54', 'محصولاتِ سلامت / دارو — ۵۴٪'],
	['50', 'خدماتِ حرفه‌ای / مشاوره — ۵۰٪'],
]
export const STRAT_FA: Record<string, string> = { survive: 'بقا', hold: 'حفظ', grow: 'رشد' }
export const FC_USD_HIST: Record<number, number> = { 1403: 80000, 1404: 93000 }
export const LEVELW: Record<string, number> = { senior: 1.5, mid: 1.0, junior: 0.6 }

/* ---------- رمضان/محرم (تقویمِ اسلامیِ مرورگر) ---------- */
const _lunarCache: Record<number, { ramadan: number; muharram: number }> = {}
export function findLunarMonths(py: number) {
	py = +py || 0
	if (!py) return { ramadan: -1, muharram: -1 }
	if (_lunarCache[py]) return _lunarCache[py]
	const res = { ramadan: -1, muharram: -1 }
	try {
		const pFmt = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric' })
		const iFmt = new Intl.DateTimeFormat('en-u-ca-islamic', { month: 'numeric' })
		const gStart = new Date(Date.UTC(py + 621, 2, 18))
		for (let d = 0; d < 380; d++) {
			const dt = new Date(gStart.getTime() + d * 86400000)
			const pp = pFmt.formatToParts(dt)
			const yy = +pp.find((p) => p.type === 'year')!.value
			const mm = +pp.find((p) => p.type === 'month')!.value
			if (yy !== py) continue
			const im = +iFmt.formatToParts(dt).find((p) => p.type === 'month')!.value
			if (im === 9 && res.ramadan < 0) res.ramadan = mm - 1
			if (im === 1 && res.muharram < 0) res.muharram = mm - 1
			if (res.ramadan >= 0 && res.muharram >= 0) break
		}
	} catch {
		/* مرورگرِ بدونِ تقویمِ اسلامی */
	}
	_lunarCache[py] = res
	return res
}

/** نوتِ صنعت (fcApplyIndustry بدونِ setDefaults). */
export function industryNote(k: string, targetYear: number): string {
	const pr = FC_INDUSTRY[k]
	if (!pr) return ''
	let h = pr.note + " <span style='color:var(--fc-petrol)'>واحدِ فروش: <b>" + pr.unit + '</b>.</span>'
	if (pr.season)
		h += " <span style='color:var(--fc-brass)'>الگوی فصلی — اوج: <b>" + (pr.peak || '—') + '</b> · کف: <b>' + (pr.low || '—') + '</b>؛ بودجهٔ ماه‌های پیش‌بینی طبقِ همین الگو توزیع می‌شود.</span>' + (pr.cal ? "<br><span style='color:var(--fc-ink2)'>" + pr.cal + '</span>' : '')
	if (pr.lunar) {
		const ty2 = targetYear || 0
		const L = findLunarMonths(ty2)
		if (!(L.ramadan < 0 && L.muharram < 0)) {
			const rEff = pr.lunar.ramadan, mEff = pr.lunar.muharram
			h += "<br><span style='color:var(--fc-petrol)'>🌙 خودکار برای سال <b>" + fa(ty2) + '</b>: رمضان ≈ <b>' + (L.ramadan >= 0 ? MN[L.ramadan] : '—') + '</b> (' + (rEff >= 1 ? '+' : '−') + fa(Math.round(Math.abs(rEff - 1) * 100)) + '٪) · محرم ≈ <b>' + (L.muharram >= 0 ? MN[L.muharram] : '—') + '</b> (' + (mEff >= 1 ? '+' : '−') + fa(Math.round(Math.abs(mEff - 1) * 100)) + '٪) — خودکار در توزیعِ ماهانه اعمال شد.</span>'
		}
	}
	return h
}

/* ---------- راهنما ---------- */
const EX: Record<string, Record<string, string>> = {
	'۱': { food: 'مدیرِ کافه: «امسال ~۱۲۰ هزار فیش می‌فروشیم.»', gym: 'مدیرِ باشگاه: «امسال ~۸۰۰ عضو.»', soft: 'مدیرعامل: «امسال ~۲۵۰ قرارداد.»', general: 'مدیر: «امسال ~X واحد می‌فروشیم.»' },
	'۲': { food: 'سه کارشناس: ۱۰۰k/۱۲۰k/۱۵۰k فیش → میانه ۱۲۰k', gym: '۷۰۰/۸۰۰/۹۵۰ عضو → میانه ۸۰۰', soft: '۲۰۰/۲۵۰/۳۲۰ قرارداد → میانه ۲۵۰', general: 'سه تخمین → عددِ وسط' },
	'۳': { food: '۳ صندوق‌دار هرکدام ~۴۰k فیش → ۱۲۰k', gym: '۴ فروشندهٔ عضویت هرکدام ~۲۰۰ → ۸۰۰', soft: '۵ فروشنده هرکدام ~۵۰ قرارداد → ۲۵۰', general: 'جمعِ تخمینِ فروشنده‌ها' },
	'۴': { food: '۵۰٬۰۰۰ ساکنِ محله × ۲۰٪ مشتری × ۳۰۰k × ۱۲ بار/سال', gym: '۲۰٬۰۰۰ نفر × ۱۵٪ × ۲۴M اشتراکِ سالانه × ۱ بار', soft: '۱۰٬۰۰۰ کافه/رستورانِ استان × ۱۰٪ × ۷۸M × ۱ بار', general: 'تعدادِ بازار × نرخِ خرید × میانگین × تکرار' },
	'۵': { food: 'فیشِ ۳ سال: ۹۰k→۱۰۵k→۱۲۰k ⇒ روند ⇒ ~۱۳۵k', gym: '۶۰۰→۷۰۰→۸۰۰ عضو ⇒ ~۹۰۰', soft: '۱۵۰→۲۰۰→۲۵۰ قرارداد ⇒ ~۳۰۰', general: 'ادامهٔ خطِ روندِ ۳ سال' },
	'۶': { food: '(۹۰+۱۰۵+۱۲۰)/۳ = ۱۰۵k فیش (کف)', gym: '(۶۰۰+۷۰۰+۸۰۰)/۳ = ۷۰۰ عضو', soft: '(۱۵۰+۲۰۰+۲۵۰)/۳ = ۲۰۰ قرارداد', general: 'میانگینِ سادهٔ ۳ سال' },
	'۷': { food: 'سطح ۳۰۰M/ماه، روند +۲۰M ⇒ ماهِ بعد ~۳۲۰M، بعدتر ~۳۴۰M', gym: 'سطح ۵۰ عضو/ماه، روند +۵ ⇒ ماهِ بعد ~۵۵', soft: 'سطح ۲۰ قرارداد/ماه، روند +۲ ⇒ ماهِ بعد ~۲۲', general: 'سطحِ فعلی + ادامهٔ روندِ اخیر' },
	'۸': { food: 'هزینهٔ ثابتِ کافه ۲۰۰M ÷ حاشیهٔ ۶۵٪ = ~۳۰۸M فروشِ لازم', gym: 'هزینهٔ ثابت ۱۵۰M ÷ ۶۰٪ = ۲۵۰M', soft: 'هزینهٔ ثابت ۵۰۰M ÷ ۳۰٪ = ~۱٫۶۷B', general: 'هزینهٔ ثابت ÷ حاشیه' },
	'۹': { food: '۱ کافه × ۴۰۰ فیش/روز × ۳۰ روز × ۳۰۰k = ۳٫۶B/ماه', gym: 'سقفِ ۱۰۰۰ عضو × ۲M = ۲B/ماه', soft: '۵ فروشنده × ۲ قرارداد/روز × ۲۶ روز × ۷۸M', general: 'سقفِ تحویلِ ماهانه × قیمت' },
}
export const GUIDE: string[][] = [
	['۱', 'نظر مدیریتی', 'Executive Opinion', 'عددِ شهودیِ مدیرعامل.', 'عددِ دستیِ مدیر · پیشنهاد: فروشِ‌آخرین‌سال × تورم/دلار × استراتژی', 'سریع؛ داده کم (ریسکِ اغراق)'],
	['۲', 'تکنیک دلفی', 'Delphi', 'چند کارشناس → میانه.', 'میانه( اعدادِ کارشناسان )', 'تصمیم‌های بزرگ'],
	['۳', 'نظرسنجی تیم فروش', 'Sales-force Composite', 'تخمینِ هر فروشنده → جمع.', 'Σ ( تخمینِ هر فروشنده )', 'تیمِ نزدیک به بازار'],
	['۴', 'عمقِ بازار / مشتری', 'Market Depth', 'پتانسیلِ بازار (سپس تعدیلِ فصل ۱۸).', 'تعداد × نرخِ‌خرید٪ × میانگینِ‌خرید × تکرارِ‌سالانه × واقع‌گرایی', 'وقتی عمقِ بازار را می‌دانی'],
	['۵', 'رگرسیون', 'Linear Regression', 'روندِ خطیِ ۳ سال → سالِ بعد.', 'trend(y₁,y₂,y₃) → سالِ بعد', 'روندِ باثبات'],
	['۶', 'میانگین متحرک', 'Moving Average', 'میانگینِ ۳ سالِ اخیر = کفِ عادی.', '(y₁ + y₂ + y₃) ÷ ۳', 'کفِ فروشِ عادی'],
	['۷', 'هموارسازی نمایی', 'Holt', 'سطح + روند روی سریِ ماهانه.', 'Lₜ = α·xₜ + (1−α)(Lₜ₋₁+Tₜ₋₁) · Tₜ = β(Lₜ−Lₜ₋₁)+(1−β)Tₜ₋₁ · ŷ = Σ(L+k·T) · α=۰٫۷ β=۰٫۱۵', 'سریِ ماهانه با روند'],
	['۸', 'نقطهٔ سربه‌سر', 'Break-even', 'حداقلِ فروشِ پوششِ هزینه.', 'هزینهٔ‌ثابت ÷ ( حاشیهٔ‌سود٪ ÷ ۱۰۰ )', 'مدلِ بقا'],
	['۹', 'ظرفیت', 'Capacity', 'سقفِ تحویل = سقفِ فروش.', 'نیرو × ظرفیتِ‌روزانه × روزهای‌فعال × ۱۲ × قیمت', 'وقتی تقاضا بیشتر از عرضه'],
]
export const guideEx = (n: string, ind: string) => {
	const e = EX[n] || {}
	return e[ind || 'general'] || e.general || '—'
}
export const IND_FA: Record<string, string> = { food: 'کافه/رستوران', gym: 'باشگاه', soft: 'آرومین (نرم‌افزار)', general: 'عمومی' }

/* ---------- عادی‌سازی (همان کارهای خودکارِ ابتدای renderForecast) ---------- */
export function normalize(f: Form, x: Extra, changedId?: string): Form {
	const o = { ...f }
	if (x.hist && x.hist.length) {
		const maxHY = x.hist.reduce((m: number, h: any) => Math.max(m, h.year), 0)
		const curY = fnum(o.fcTargetYear)
		if (changedId !== 'fcTargetYear' && (!curY || curY <= maxHY)) o.fcTargetYear = String(maxHY + 1)
	}
	const up = fnum(o.fcUnitPrice), R = fnum(o.fcRevenue)
	if (up > 0 && R > 0 && changedId !== 'fcVolume') o.fcVolume = faGroup(Math.round(R / up))
	return o
}

/** fcFillAnnual — پرکردنِ جدولِ سه‌ساله از داده‌ی ماهانه. */
export function fillAnnual(f: Form, x: Extra): { f: Form; warn: number[] } | null {
	const h = x.hist
	if (!h || !h.length) return null
	const o = { ...f }
	const k = o.fcUnit === 'toman' ? 1 : 0.1
	const ys = h.slice(-3)
	const ids = ['fcY1', 'fcY2', 'fcY3'], dids = ['fcD1', 'fcD2', 'fcD3']
	const off = 3 - ys.length, warn: number[] = []
	for (let s = 0; s < off; s++) { o[ids[s]] = ''; o[dids[s]] = '' }
	ys.forEach((yr: any, i: number) => {
		const slot = off + i
		o[ids[slot]] = faGroup(Math.round((yr.total || 0) * k))
		if (yr.dollar > 0 && yr.total > 0) {
			const rate = Math.round((yr.total * k) / yr.dollar)
			if (rate >= 10000 && rate <= 500000) o[dids[slot]] = faGroup(rate)
			else { o[dids[slot]] = ''; warn.push(yr.year) }
		} else o[dids[slot]] = ''
	})
	return { f: o, warn }
}

/** برچسبِ سال‌های جدولِ سه‌ساله. */
export function yearLabels(f: Form, x: Extra): number[] {
	const ty = fnum(f.fcTargetYear) || 1405
	let yrs: number[]
	if (x.hist && x.hist.length) {
		yrs = x.hist.slice(-3).map((h: any) => h.year)
		while (yrs.length < 3) yrs.unshift((yrs[0] || ty - 1) - 1)
	} else yrs = [ty - 3, ty - 2, ty - 1]
	return yrs
}

/** fcSuggestBase — پیشنهادِ روش ۱ و ۲. */
export function suggestBase(f: Form, x: Extra) {
	const n = (id: string) => fnum(f[id])
	const yv = [n('fcY1'), n('fcY2'), n('fcY3')], dv = [n('fcD1'), n('fcD2'), n('fcD3')]
	let li = -1
	for (let i = 2; i >= 0; i--) if (yv[i] > 0) { li = i; break }
	if (li < 0) return null
	const lastY = yv[li]
	let prevI = -1
	for (let j = li - 1; j >= 0; j--) if (yv[j] > 0) { prevI = j; break }
	const usdNow = n('fcUsd'), dLast = dv[li]
	let infl: number, src: string
	if (dLast > 0 && usdNow > 0) { infl = usdNow / dLast - 1; src = 'جهش دلار (از ' + sep(dLast) + ' به ' + sep(usdNow) + ' تومان)' }
	else if (prevI >= 0 && dLast > 0 && dv[prevI] > 0) { infl = dLast / dv[prevI] - 1; src = 'رشد دلارِ دو سال اخیر (از ' + sep(dv[prevI]) + ' به ' + sep(dLast) + ' تومان)' }
	else if (prevI >= 0 && yv[prevI] > 0) { infl = lastY / yv[prevI] - 1; src = 'رشد نامیِ فروش دو سال اخیر' }
	else { infl = 0.4; src = 'تورم فرضیِ ایران (۴۰٪)' }
	if (!isFinite(infl)) infl = 0.4
	infl = Math.max(0.15, Math.min(2.5, infl))
	const strat = (f.fcStrategy as string) || 'hold'
	let real = ({ survive: 0, hold: 0.05, grow: 0.15 } as Record<string, number>)[strat]
	if (real == null) real = 0.05
	const stratName = STRAT_FA[strat] || 'حفظ'
	const yrLbl = 'سال ' + fa(yearLabels(f, x)[li]) + (li === 2 ? ' (جدیدترین)' : '')
	const m1 = Math.round(lastY * (1 + infl) * (1 + real))
	return { lastY, yrLbl, infl, src, stratName, m1, cons: Math.round(lastY * (1 + infl) * 0.92), base: m1, opt: Math.round(m1 * 1.15) }
}

/* ---------- محاسبهٔ کامل (renderForecast) ---------- */
export interface Ctx {
	people: any[]
}

export function compute(f: Form, x: Extra, ctx: Ctx) {
	const n = (id: string) => fnum(f[id])
	const usd = n('fcUsd')
	const strat = (f.fcStrategy as string) || 'hold'
	const stratTxt: Record<string, string> = {
		survive: '«بقا» یعنی امسال نه سود می‌خواهی نه از جیب می‌دهی؛ فقط نیرو، برند و حضورت را حفظ کن (مدل نقطه‌ی سربه‌سر). بودجه‌ی بازاریابی راهنما: ۳ تا ۵٪.',
		hold: '«حفظ» یعنی سهم بازار فعلی را نگه دار؛ نه عقب بمان نه ریسک توسعه. بودجه‌ی بازاریابی راهنما: ۵ تا ۸٪.',
		grow: '«رشد» یعنی از پنجره‌ی بحران برای گرفتن سهم بازار استفاده کن — پرریسک ولی پرثمر. بودجه‌ی بازاریابی راهنما: ۱۰ تا ۱۵٪.',
	}
	// هرم سه‌گانه
	const R = n('fcRevenue'), V = n('fcVolume'), mp = n('fcMktPct')
	const Hm = Math.max(1, Math.min(12, Math.round(n('fcHorizon') * (n('fcHorizonUnit') || 1))))
	const mkt = (R * mp) / 100, avgP = V > 0 ? R / V : 0, perMonth = R / 12, perHorizon = (R * Hm) / 12
	const gRec = ({ survive: [3, 5], hold: [5, 8], grow: [10, 15] } as Record<string, number[]>)[strat] || [5, 8]
	const warn = mp < gRec[0] || mp > gRec[1] ? ' درصد فعلی («' + fa(mp) + '٪») با راهنمای استراتژی «' + STRAT_FA[strat] + '» (' + fa(gRec[0]) + ' تا ' + fa(gRec[1]) + '٪) هم‌خوان نیست.' : ''
	const perNote = Hm < 12 ? ' · <b>همهٔ اعدادِ هرم سالانه‌اند</b>؛ «افق دید (' + fa(Hm) + ' ماه)» فقط همان هدفِ سالانه را به دوره می‌بُرد (کاشیِ طلایی)، پس دیگر قیمت/حجم به‌هم نمی‌ریزد.' : ''
	const pyramidNote = 'ترتیب درست: اول عددِ فروش، بعد بودجه به‌عنوان درصدی از آن (مثل مالیات، نه باقی‌مانده).' + warn + perNote + (usd > 0 && R > 0 ? ' · معادل دلاریِ فروش هدف: <b>$' + sep(Math.round(R / usd)) + '</b>' : '')

	// داده‌ی تاریخی
	const yrs = yearLabels(f, x)
	const y = [n('fcY1'), n('fcY2'), n('fcY3')], d = [n('fcD1'), n('fcD2'), n('fcD3')]
	const dol = [0, 1, 2].map((i) => (d[i] > 0 ? y[i] / d[i] : 0))
	const gr = (a: number, b: number) => (a > 0 ? (b / a - 1) * 100 : null)
	const g2 = gr(y[0], y[1]), g3 = gr(y[1], y[2])
	const grs = [g2, g3].filter((v): v is number => v != null)
	const avgG = grs.length ? grs.reduce((a, b) => a + b, 0) / grs.length : 0
	const ma3 = (y[0] + y[1] + y[2]) / ((y[0] > 0 ? 1 : 0) + (y[1] > 0 ? 1 : 0) + (y[2] > 0 ? 1 : 0) || 1)
	const next = y[2] > 0 ? y[2] * (1 + avgG / 100) : 0
	const dg = dol[0] > 0 && dol[2] > 0 ? (dol[2] / dol[0] - 1) * 100 : null
	const histNote =
		dg != null
			? dg < 0
				? 'هشدار: فروش ریالی رشد کرده اما فروش <b>دلاری</b> ' + pct(Math.abs(dg)) + ' کوچک شده — یعنی از تورم جا مانده‌ای.'
				: 'فروش دلاری هم ' + pct(dg) + ' رشد کرده؛ رشد واقعی داشته‌ای، نه صرفاً تورمی.'
			: 'نرخ دلار هر سال را هم پر کن تا رشد واقعی (دلاری) را ببینی و از تورم گول نخوری.'

	// سناریوهای تورمی
	const scen = [50, 70, 120].map((s) => ({ s, need: R * (1 + s / 100), real: R / (1 + s / 100), loss: (1 - 1 / (1 + s / 100)) * 100 }))

	// آمادگی
	const cs = [n('fcC1'), n('fcC2'), n('fcC3'), n('fcC4'), n('fcC5'), n('fcC6')]
	const ready = cs.reduce((a, b) => a + b, 0) / 6
	const tol = ready >= 70 ? { t: 'تخمینِ معتبر', u: 'تولرانس ۱۰ تا ۲۰٪', c: '#1E8E3E' } : ready >= 40 ? { t: 'نیمه‌قابل‌اتکا', u: 'مؤلفه‌های ضعیف را تقویت کن', c: 'var(--fc-brass)' } : { t: 'حدس، نه تخمین', u: 'داده کافی نداری', c: 'var(--fc-rose)' }

	// ═══ نه روش ═══
	const mR: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
	mR[1] = n('fcM1')
	const l2 = fcList(f.fcM2); mR[2] = l2.length ? fcMed(l2) : 0
	const l3 = fcList(f.fcM3); mR[3] = l3.length ? l3.reduce((a, b) => a + b, 0) : 0
	const m4real = f.fcM4real ? 0.65 : 1
	const m4rep = n('fcM4rep') || 1
	const m4depth = ((n('fcM4n') * n('fcM4a') * n('fcM4r')) / 100) * m4rep * m4real
	const sh = String(f.fcM4share ?? '').trim() !== '' ? n('fcM4share') : 100
	const aB = 1 + n('fcM4brand') / 100, aA = 1 + n('fcM4aware') / 100, aC = 1 + n('fcM4chan') / 100, aK = 1 + n('fcM4comp') / 100
	mR[4] = m4depth * (sh / 100) * aB * aA * aC * aK
	let m4adjNote: string | null = null
	if (m4depth > 0 && (sh !== 100 || aB !== 1 || aA !== 1 || aC !== 1 || aK !== 1)) {
		m4adjNote = 'آبشارِ فصل ۱۸: پتانسیلِ بازار <b>' + sep(Math.round(m4depth)) + '</b> × سهم ' + fa(sh) + '٪ = ' + sep(Math.round((m4depth * sh) / 100)) +
			' → ×برند(' + (aB >= 1 ? '+' : '−') + fa(Math.abs(n('fcM4brand'))) + '٪) ×اورنس(' + (aA >= 1 ? '+' : '−') + fa(Math.abs(n('fcM4aware'))) + '٪) ×کانال(' + (aC >= 1 ? '+' : '−') + fa(Math.abs(n('fcM4chan'))) + '٪) ×رقبا(' + (aK >= 1 ? '+' : '−') + fa(Math.abs(n('fcM4comp'))) + '٪) = <b>' + sep(Math.round(mR[4])) + '</b> تومان (پتانسیلِ فروش).'
	}
	mR[5] = next
	mR[6] = y[0] > 0 || y[1] > 0 || y[2] > 0 ? ma3 : 0
	;(() => {
		const a = n('fcAlpha') || 0.5, b = 0.15
		const uf = f.fcUnit === 'toman' ? 1 : 0.1
		const series: number[] = []
		;(x.hist || []).forEach((yr: any) => (yr.months || []).forEach((v: number) => { if (v > 0) series.push(v * uf) }))
		if (x.ytd && Array.isArray(x.ytd.months)) x.ytd.months.forEach((v: number) => { if (v > 0) series.push(v * uf) })
		if (series.length < 3) {
			const seq = [y[0], y[1], y[2]].filter((v) => v > 0)
			mR[7] = seq.length < 2 ? (seq.length ? seq[0] : 0) : seq[1] + (seq[1] - seq[0])
			return
		}
		let L = series[0], T = series[1] - series[0]
		for (let i = 1; i < series.length; i++) { const pL = L; L = a * series[i] + (1 - a) * (pL + T); T = b * (L - pL) + (1 - b) * T }
		let sum = 0
		for (let k = 1; k <= 12; k++) sum += Math.max(0, L + k * T)
		mR[7] = Math.max(0, sum)
	})()
	const fx = n('fcFixed'), mg = n('fcMargin')
	mR[8] = mg > 0 ? fx / (mg / 100) : 0
	const cw = n('fcCapWorkers') || 1, cd = n('fcCapDaily'), cdays = n('fcCapDays') || 26, cp = n('fcCapP')
	const monthlyUnits = cw * cd * cdays
	mR[9] = monthlyUnits * 12 * cp
	const monthlyRial = monthlyUnits * cp
	const capNote =
		cd > 0
			? 'ظرفیتِ ماهانه = ' + faGroup(cw) + ' × ' + faGroup(cd) + ' روزانه × ' + faGroup(cdays) + ' روز = <b>' + faGroup(monthlyUnits) + '</b> واحد/فیش در ماه' +
				(cp > 0 ? ' × ' + sep(cp) + ' = <b>' + sep(monthlyRial) + '</b> تومان/ماه → سالانه <b>' + sep(mR[9]) + '</b>' + (usd > 0 ? " ≈ <b style='direction:ltr;display:inline-block'>$" + sep(Math.round(monthlyRial / usd)) + '</b>/ماه' : '') : '') +
				". <span style='color:var(--fc-brass)'>سقفِ فروش = سقفِ تحویل.</span>"
			: '<b>مثالِ کافه:</b> نیرو <b>۱</b> × فیشِ روزانه <b>۴۰۰</b> × <b>۳۰</b> روز × میانگینِ فیش <b>۳۰۰٬۰۰۰</b> = <b>۳٫۶ میلیارد تومان/ماه</b> (۴۳٫۲ میلیارد سالانه). برای تولیدی: نیرو × ظرفیتِ هر نفر × روز × قیمت. (این روش برای <b>تقاضا > عرضه</b> است؛ خروجی با تورم/فصل بین ماه‌ها پخش و معادلِ دلاری‌اش نشان داده می‌شود.)'
	const filled: number[] = []
	for (let k = 1; k <= 9; k++) if (mR[k] > 0) filled.push(mR[k])
	const consensus = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : 0
	const median = fcMed(filled)
	const spread = filled.length >= 2 ? [Math.min(...filled), Math.max(...filled)] : null
	const spreadPct = filled.length >= 2 && consensus > 0 ? ((Math.max(...filled) - Math.min(...filled)) / consensus) * 100 : 0
	const methodsNote =
		filled.length < 2
			? 'حداقل دو روش را پر کن تا میانگین معنا پیدا کند. جزوه می‌گوید اکثر شرکت‌ها ۵ روش را اجرا می‌کنند.'
			: spreadPct > 60
				? 'پراکندگی روش‌ها زیاد است (' + pct(spreadPct) + ' حول میانگین) — هنوز اجماع نداری؛ فرض‌ها را بازبینی کن یا روش‌های داده‌محور (۵ و ۶) را جدی‌تر بگیر.'
				: 'روش‌ها نسبتاً هم‌گرا هستند (' + pct(spreadPct) + ' پراکندگی حول میانگین). تخمین <b>' + sep(consensus) + '</b> تومان قابل‌اتکاست.'

	// ═══ پیش‌بینی ماهانه ═══
	const ty = n('fcTargetYear')
	let monthly: null | {
		sel: number[]; perM: Record<number, number[]>; fin: number[]; actualM: number[] | null; nAct: number; blTot: number; colTot: number[]
		histRows: { year: number; months: number[]; total: number; dsales: number; drate: number; rateOk: boolean; g: number | null }[]
		peak: [number, number]; low: [number, number]; blended: number[]; lastHistTotal: number
	} = null
	if (x.hist && x.hist.length) {
		const _uf = f.fcUnit === 'toman' ? 1 : 0.1
		const hist = x.hist.map((yr: any) => ({ year: yr.year, months: yr.months.map((v: number) => v * _uf), total: yr.total * _uf, dollar: yr.dollar }))
		const manualRate: Record<number, number> = {}
		;[0, 1, 2].forEach((i) => { const yy = yrs[i], rr = d[i]; if (yy > 0 && rr > 0) manualRate[yy] = rr })
		let prevTot = 0
		const histRows = hist.map((yr: any) => {
			const drateExcel = yr.dollar > 0 ? Math.round(yr.total / yr.dollar) : 0
			const excelOk = drateExcel >= 10000 && drateExcel <= 500000
			const drate = excelOk ? drateExcel : manualRate[yr.year] || 0
			const dsales = excelOk ? yr.dollar : drate > 0 ? Math.round(yr.total / drate) : 0
			const rateOk = drate >= 10000 && drate <= 500000
			const g = prevTot > 0 ? (yr.total / prevTot - 1) * 100 : null
			prevTot = yr.total
			return { year: yr.year, months: yr.months, total: yr.total, dsales, drate, rateOk, g }
		})
		const prof: number[] = []
		let pc = 0
		for (let m = 0; m < 12; m++) prof[m] = 0
		hist.forEach((yr: any) => { if (yr.total > 0) { for (let m = 0; m < 12; m++) prof[m] += yr.months[m] / yr.total; pc++ } })
		if (pc > 0) { for (let m = 0; m < 12; m++) prof[m] /= pc } else { for (let m = 0; m < 12; m++) prof[m] = 1 / 12 }
		const psum = prof.reduce((a, b) => a + b, 0) || 1
		for (let m = 0; m < 12; m++) prof[m] /= psum
		const alpha = n('fcAlpha') || 0.5
		const perMonthAgg = (fn: (v: number[]) => number) => {
			const out: number[] = []
			for (let m = 0; m < 12; m++) { const vals: number[] = []; hist.forEach((yr: any) => { if (yr.months[m] > 0) vals.push(yr.months[m]) }); out[m] = fn(vals) }
			return out
		}
		const methodMonthly = (k: number): number[] => {
			if (k === 6) return perMonthAgg((v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0))
			if (k === 7) {
				const b7 = 0.3, ser: number[] = []
				hist.forEach((yr: any) => { for (let mm = 0; mm < 12; mm++) if (yr.months[mm] > 0) ser.push(yr.months[mm]) })
				let N7 = 0
				if (x.ytd && x.ytd.year === ty && x.ytd.months) x.ytd.months.forEach((v: number) => { if (v > 0) { ser.push(v * _uf); N7++ } })
				const out7: number[] = []
				if (ser.length < 2) { for (let z = 0; z < 12; z++) out7[z] = ser[0] || 0; return out7 }
				let L7 = ser[0], T7 = ser[1] - ser[0]
				for (let t7 = 1; t7 < ser.length; t7++) { const pL7 = L7; L7 = alpha * ser[t7] + (1 - alpha) * (pL7 + T7); T7 = b7 * (L7 - pL7) + (1 - b7) * T7 }
				for (let m7 = 0; m7 < 12; m7++) {
					if (m7 < N7 && x.ytd && x.ytd.months[m7] > 0) out7[m7] = x.ytd.months[m7] * _uf
					else out7[m7] = Math.max(0, L7 + (m7 - N7 + 1) * T7)
				}
				return out7
			}
			if (k === 5)
				return perMonthAgg((v) => {
					const nn = v.length
					if (nn < 2) return nn ? v[0] : 0
					let sx = 0, sy = 0, sxy = 0, sxx = 0
					for (let i = 0; i < nn; i++) { sx += i; sy += v[i]; sxy += i * v[i]; sxx += i * i }
					const den = nn * sxx - sx * sx || 1, bb = (nn * sxy - sx * sy) / den, aa = (sy - bb * sx) / nn
					return Math.max(0, aa + bb * nn)
				})
			return prof.map((s) => (mR[k] || 0) * s)
		}
		const sel: number[] = []
		for (let k = 1; k <= 9; k++) { const avail = k === 5 || k === 6 || k === 7 ? true : mR[k] > 0; if (f['fcUse' + k] && avail) sel.push(k) }
		const perM: Record<number, number[]> = {}
		sel.forEach((k) => { perM[k] = methodMonthly(k) })
		const blended: number[] = []
		for (let m = 0; m < 12; m++) { let s = 0, c = 0; sel.forEach((k) => { const v = perM[k][m]; if (v > 0) { s += v; c++ } }); blended[m] = c ? s / c : 0 }
		let actualM: number[] | null = null, nAct = 0
		const ytd = x.ytd
		if (ytd && ytd.year === ty && Array.isArray(ytd.months)) { actualM = ytd.months.map((v: number) => (v || 0) * _uf); nAct = actualM!.filter((v) => v > 0).length }
		const fin: number[] = []
		for (let m = 0; m < 12; m++) fin[m] = actualM && actualM[m] > 0 ? actualM[m] : blended[m]
		;(() => {
			const base = FC_INDUSTRY[f.fcIndustry as string]
			if (!base || !base.season) return
			const pr = base.season.slice()
			if (base.lunar) {
				const lun = findLunarMonths(ty)
				if (lun.ramadan >= 0 && base.lunar.ramadan) pr[lun.ramadan] *= base.lunar.ramadan
				if (lun.muharram >= 0 && base.lunar.muharram) pr[lun.muharram] *= base.lunar.muharram
			}
			const idx: number[] = []
			let sum = 0, wSum = 0
			for (let m = 0; m < 12; m++) if (!(actualM && actualM[m] > 0)) { idx.push(m); sum += fin[m] || 0; wSum += pr[m] || 0 }
			if (sum > 0 && wSum > 0) idx.forEach((m) => { fin[m] = (sum * (pr[m] || 0)) / wSum })
		})()
		const colTot = sel.map((k) => perM[k].reduce((a, b) => a + b, 0))
		const blTot = fin.reduce((a, b) => a + b, 0)
		let pk = 0, pkm = 0, lo = Infinity, lom = 0
		for (let m = 0; m < 12; m++) { if (fin[m] > pk) { pk = fin[m]; pkm = m } if (fin[m] < lo) { lo = fin[m]; lom = m } }
		monthly = { sel, perM, fin, actualM, nAct, blTot, colTot, histRows, peak: [pkm, pk], low: [lom, lo], blended, lastHistTotal: hist.length ? hist[hist.length - 1].total : 0 }
	}
	// ذخیرهٔ خودکارِ ملاک‌ها (مثلِ renderForecast)
	const derived: Extra = {}
	if (monthly) { derived.monthlyForecast = monthly.blended.slice(); derived.monthlyBlended = monthly.fin.slice(); derived.targetYear = ty }
	const monthlyForecast: number[] | null = monthly ? monthly.blended : x.monthlyForecast && x.monthlyForecast.length ? x.monthlyForecast : null
	const monthlyBlended: number[] | null = monthly ? monthly.fin : x.monthlyBlended || null

	// ریسک
	const risk = n('fcRisk'), oblig = n('fcOblig'), asset = n('fcAsset')
	const safety = Math.max(0, Math.min(40, ((oblig - 1) / 9) * 20 + ((100 - risk) / 100) * 15 + ((10 - asset) / 9) * 5))
	const safeT = R * (1 - safety / 100)

	// واقعی در برابر پیش‌بینی (actualByMonth)
	const act: number[] = []
	for (let m = 0; m < 12; m++) act[m] = 0
	const ufA = f.fcUnit === 'rial' ? 0.1 : 1
	const ytdOk = x.ytd && x.ytd.year === ty && Array.isArray(x.ytd.months)
	if (ytdOk) x.ytd.months.forEach((v: number, m: number) => { if (v > 0) act[m] = v * ufA })
	;(ctx.people || []).forEach((p: any) => {
		if (p.inactive) return
		;(p.inv || []).forEach((dd: any) => {
			const fn = dd.funnel || 'won'
			if (fn !== 'won') return
			const m = dd.month == null || dd.month === '' ? -1 : +dd.month
			if (m < 0 || m > 11) return
			if (!(ytdOk && x.ytd.months[m] > 0)) act[m] += coNum(dd.amount)
		})
	})
	const va = { rows: [] as { m: number; f: number; a: number; diff: number; vr: number }[], sumA: 0, sumF: 0, nM: 0 }
	if (monthlyForecast) {
		for (let m = 0; m < 12; m++) {
			if (!(act[m] > 0)) continue
			const fv = monthlyForecast[m] || 0, a = act[m], diff = a - fv
			va.rows.push({ m, f: fv, a, diff, vr: fv > 0 ? (diff / fv) * 100 : 0 })
			va.sumA += a; va.sumF += fv
		}
		for (let i = 0; i < 12; i++) if (act[i] > 0) va.nM++
	}

	return {
		usd, strat, stratNote: stratTxt[strat] || '', R, V, mp, Hm, mkt, avgP, perMonth, perHorizon, pyramidNote,
		yrs, y, d, dol, g2, g3, grs, avgG, ma3, next, dg, histNote, scen, ready, tol,
		mR, m4depth, m4adjNote, capNote, filled, consensus, median, spread, methodsNote,
		ty, monthly, derived, monthlyForecast, monthlyBlended, safety, safeT, va,
		alpha: n('fcAlpha') || 0.5,
	}
}
export type Result = ReturnType<typeof compute>
