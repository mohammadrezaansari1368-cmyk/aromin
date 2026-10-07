/**
 * ستونِ «تغییر مرحله»ِ خروجیِ Joolio — تنها منبعِ سالِ مالی، تاریخِ کاملِ دفترِ فروش و ساعت.
 * ساختارِ واقعی (بررسیِ ۳ فایل، ۳۲۲۱ ردیف): یک سلولِ متنی «HH:MM:SS YYYY/MM/DD» (مثلاً «16:32:51 1405/06/31»).
 * سالِ مالی = سالِ همان تاریخِ معتبر و فقط اگر در سیستم تعریف شده باشد؛ هیچ ستونِ دیگری (ورود، «سال مالی»، نامِ فایل، زمانِ سیستم) منبع نیست.
 * همتای پایتونی: deployment/aromin_stage.py — هر دو با deployment/tests/fixtures/stage_change_vectors.json آزموده می‌شوند.
 */
import { parseJ } from './jalali'

export const STAGE_CHANGE_HEADER = 'تغییر مرحله'
export type StageErr = 'empty' | 'not_text' | 'bad_format' | 'invalid_date' | 'invalid_time'
export type StageChange =
	| { ok: true; raw: string; date: string; time: string; fy: string }
	| { ok: false; raw: string; error: StageErr }

export const STAGE_ERR_FA: Record<StageErr, string> = {
	empty: 'خالی است',
	not_text: 'نوعِ سلول متنِ «ساعت تاریخ» نیست (عدد یا تاریخِ اکسل حدس زده نمی‌شود)',
	bad_format: 'قالب «ساعت تاریخ» نیست',
	invalid_date: 'تاریخِ شمسیِ نامعتبر (روز/ماه/کبیسه)',
	invalid_time: 'ساعتِ نامعتبر',
}

const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
/** کلیدِ مقایسهٔ هدر: نیم‌فاصله/فاصله حذف، ی/ي/ى و ک/ك یکسان (همان قراردادِ pickCol) */
export const headerKey = (s: unknown) => String(s ?? '').replace(/[‌‏‎]/g, '').replace(/\s+/g, '').replace(/[يیى]/g, 'ی').replace(/[كک]/g, 'ک').trim()

/** فقط هدرِ دقیقِ «تغییر مرحله» (پس از نرمال‌سازی). نسخه‌های تکراریِ SheetJS («…_1») = چندمعنایی → خطا، نه انتخابِ اولی. */
export function findStageChangeColumn(keys: string[]): { col: string } | { error: string } {
	const want = headerKey(STAGE_CHANGE_HEADER)
	const hits = keys.filter((k) => { const n = headerKey(k); return n === want || n.replace(/_\d+$/, '') === want })
	if (!hits.length) return { error: `ستونِ «${STAGE_CHANGE_HEADER}» پیدا نشد؛ سالِ مالی و تاریخِ فروش فقط از این ستون خوانده می‌شود.` }
	if (hits.length > 1) return { error: `ستونِ «${STAGE_CHANGE_HEADER}» چند بار آمده (${hits.join('، ')})؛ کدام معتبر است مبهم است.` }
	return { col: hits[0] }
}

const TIME = '(\\d{1,2}):(\\d{2})(?::(\\d{2}))?'
const DATE = '(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})'
const TIME_FIRST = new RegExp(`^${TIME}\\s+${DATE}$`) // شواهدِ فایل‌های واقعی
const DATE_FIRST = new RegExp(`^${DATE}(?:\\s+${TIME})?$`) // قراردادِ قبلیِ excelSaleDate (بدونِ ابهام)
const p2 = (n: number | string) => String(n).padStart(2, '0')

export function parseStageChange(value: unknown): StageChange {
	if (value == null || (typeof value === 'string' && !value.trim())) return { ok: false, raw: value == null ? '' : String(value), error: 'empty' }
	if (typeof value !== 'string') return { ok: false, raw: String(value), error: 'not_text' }
	const raw = value
	const s = latin(value).replace(/\s+/g, ' ').trim()
	let y = '', mo = '', d = '', h = '', mi = '', se: string | undefined
	let m = s.match(TIME_FIRST)
	if (m) [, h, mi, se, y, mo, d] = m
	else if ((m = s.match(DATE_FIRST))) [, y, mo, d, h, mi, se] = m
	else return { ok: false, raw, error: 'bad_format' }
	const j = parseJ(`${y}/${mo}/${d}`)
	if (!j) return { ok: false, raw, error: 'invalid_date' }
	let time = ''
	if (h !== undefined && h !== '') {
		if (+h > 23 || +mi > 59 || (se !== undefined && +se > 59)) return { ok: false, raw, error: 'invalid_time' }
		time = `${p2(h)}:${p2(mi)}` + (se !== undefined ? `:${p2(se)}` : '')
	}
	return { ok: true, raw, date: j.j, time, fy: j.j.slice(0, 4) }
}

/** سال‌های مالیِ تعریف‌شده در سیستم (قراردادِ مدل: کلیدهای full.years + سالِ فعال) */
export function knownFiscalYears(full: { years?: Record<string, unknown>; fy?: unknown } | null | undefined): Set<string> {
	const out = new Set(Object.keys(full?.years || {}).filter((y) => /^\d{4}$/.test(y)))
	if (/^\d{4}$/.test(String(full?.fy ?? ''))) out.add(String(full?.fy))
	return out
}

/** پیامِ خطای کامل برای پیش‌نمایش: منبع، sheet، ردیف، ستون، مقدارِ خام (کوتاه‌شده) و علت */
export function stageErrorText(e: { source?: string; sheet?: string; row: number; col: string; raw: string; why: string }) {
	const raw = e.raw.length > 40 ? e.raw.slice(0, 40) + '…' : e.raw
	return `${e.source ? `«${e.source}» · ` : ''}${e.sheet ? `برگهٔ «${e.sheet}» · ` : ''}ردیف ${e.row} · ستون «${e.col}» · مقدار «${raw}»: ${e.why}`
}
