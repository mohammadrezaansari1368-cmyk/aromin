/**
 * انواعِ فایلِ ایمپورت — هر نوع یک رنگِ ثابت.
 * detectImportType کلمه‌به‌کلمه همان منطقِ اپِ کامل است (شروع-اینجا.html → detectImportType)
 * تا پیش‌نمایشِ React با مسیرِ واقعیِ موتور یکی باشد.
 */
import * as XLSX from 'xlsx'

export type ImportKind =
	| 'deal'
	| 'contact'
	| 'tasks'
	| 'ticket'
	| 'calllog'
	| 'calls'
	| 'volume'
	| 'monthly'
	| 'pl'
	| 'churn'
	| 'attendance'
	| 'unknown'

export interface KindMeta {
	label: string
	color: string
	dest: string
	src: string
}

export const KINDS: Record<ImportKind, KindMeta> = {
	deal: { label: 'معاملات', color: '#004991', dest: 'دفتر فروش · قیف · پورسانت · پرتفوی', src: 'جولیو › Deal' },
	contact: { label: 'اشخاص و شرکت‌ها', color: '#910D6A', dest: 'دفترچهٔ مخاطبین · موبایل · پرتفوی', src: 'جولیو › Contact' },
	tasks: { label: 'وظایف', color: '#0E8A7E', dest: 'عملکرد · ردیابِ وظیفه · اهمال‌کاری', src: 'جولیو › Task' },
	ticket: { label: 'تیکت‌ها', color: '#E0701A', dest: 'تیم پشتیبانی · SLA', src: 'جولیو › Ticket' },
	calllog: { label: 'ریزِ تماس', color: '#5B3FC4', dest: 'مواجهه با مشتری · پیکِ ساعت', src: 'جولیو › گزارشِ ریزِ تماس' },
	calls: { label: 'عملکردِ تماس', color: '#0284C7', dest: 'آمارِ تماسِ هر کارشناس', src: 'جولیو › عملکردِ تماس' },
	volume: { label: 'حجمِ فروش', color: '#B7791F', dest: 'پیش‌بینی · رتبهٔ محصول', src: 'اکسلِ محصول/بستن' },
	monthly: { label: 'فروشِ ماهانه', color: '#1E8E3E', dest: 'پیش‌بینیِ ماهانهٔ بودجه', src: 'اکسلِ فروردین…اسفند' },
	pl: { label: 'سود و زیان', color: '#C0264B', dest: 'پیش‌بینی و بودجه', src: 'شیت‌های ماهانه' },
	churn: { label: 'چان‌ریت', color: '#475569', dest: 'نرخِ ریزش و ماندگاری', src: 'اکسلِ چندساله' },
	attendance: { label: 'حضور و غیاب', color: '#7C3AED', dest: 'عملکرد · حضور، دیرکرد، کسر و اضافه‌کار (فقط مدیران و مالی)', src: 'خروجیِ دستگاهِ حضور' },
	unknown: { label: 'نامشخص', color: '#9CA3AF', dest: 'شناخته نشد — وارد نمی‌شود', src: '—' },
}

export const kindOf = (t: string): ImportKind => (t in KINDS ? (t as ImportKind) : 'unknown')

const _nh = (s: unknown) =>
	String(s == null ? '' : s)
		.replace(/[يیۍ]/g, 'ی')
		.replace(/[كک]/g, 'ک')
		.replace(/[‌\s]/g, '')

export interface Detected {
	type: ImportKind
	rows: number
	sheet: string
	hdr: string[]
	sig: string
}

export function detectImportType(wb: XLSX.WorkBook): Detected {
	const s0 = wb.SheetNames[0]
	let aoa: unknown[][] = []
	try {
		aoa = XLSX.utils.sheet_to_json(wb.Sheets[s0], { header: 1, defval: '' }) as unknown[][]
	} catch {
		/* empty */
	}
	const hdr = ((aoa[0] as unknown[]) || []).map(_nh)
	const has = (...a: string[]) => a.some((x) => hdr.indexOf(_nh(x)) > -1)
	let t: ImportKind = 'unknown'
	// فقط در اپِ جدید: خروجیِ دستگاهِ حضور (به موتورِ قبلی فرستاده نمی‌شود؛ بقیهٔ تشخیص‌ها عیناً همان موتور است)
	if (has('تاریخ') && has('ورود1') && (has('حضور') || has('خروج1'))) return { type: 'attendance', rows: Math.max(0, aoa.length - 1), sheet: s0, hdr, sig: 'attendance|' + wb.SheetNames.join(',') }
	if (has('کدکانال') || (has('مبداتماس') && has('مقصدتماس'))) t = 'calllog'
	else if (has('وضعیتتماس') || has('مدتتماس') || has('مدتمکالمه')) t = 'calls'
	else if (has('وظیفه') && has('بابت') && has('برای')) t = 'tasks'
	else if ((has('وضعیت') || has('اولویت')) && (has('برای') || has('کارشناس') || has('مسئول')) && (has('بابت') || has('مهلتانجام(دقیقه)'))) t = 'tasks'
	else if (has('تیکت') && (has('سرشاخه') || has('موضوعاصلی'))) t = 'ticket'
	else if (has('مرحله') && has('ارزش') && has('شرکت')) t = 'deal'
	else if (has('ثبت') && (has('ثبت‌کننده') || has('ثبتکننده'))) t = 'contact'
	else if (has('محصول') && has('بستن')) t = 'volume'
	else if (has('فروردین') && has('اسفند')) t = 'monthly'
	else if ((wb.SheetNames || []).some((n) => /فروردین|اردیبهشت|خرداد/.test(String(n)))) t = 'pl'
	else if (hdr.some((h) => /^سال/.test(h) || /^\d{2,4}$/.test(h))) t = 'churn'
	const rows = Math.max(0, aoa.length - 1)
	return { type: t, rows, sheet: s0, hdr, sig: t + '|' + rows + '|' + hdr.slice(0, 8).join(',') }
}
