import { isActivePerson } from './people'
/**
 * موتورِ «حضور و عملکرد» — Data → Analysis → Reconciliation → Permissions → Presentation → Export.
 *
 * منطقِ محاسبه عیناً از «ابزار تحلیل حضور و غیاب — آرومین» (همان قواعد، همان کدهای روز، همان کسرِ دیرکرد
 * و اضافه‌کارِ جلسه) آمده است؛ هیچ عددی ساخته یا حدس زده نمی‌شود.
 *
 * منابعِ داده (به ترتیبِ اولویت):
 *  - وظایف: فروشگاهِ موجودِ اپ — people[].perf.dailyTasks / dayStatus / dayType (همان ایمپورتِ جولیو). فقط خواندنی.
 *  - حضور و غیاب: در سیستم ذخیره نشده است؛ تنها منبعِ واقعی اکسلِ دستگاهِ حضور است که در همین مرورگر
 *    بارگذاری می‌شود (localStorage، مثلِ ابزارِ اصلی) — هیچ تغییری در پایگاه‌داده یا بلابِ /api/state داده نمی‌شود.
 *  - وظایفِ خامِ جولیو (اختیاری، fallback): فقط برای «اضافه‌کارِ جلسه» و «بخشودگیِ دیرکرد» که به ساعتِ وظیفه نیاز دارند.
 *
 * دسترسی: scope قبل از هر محاسبه اعمال می‌شود (کارمند فقط شیتِ خودش؛ مدیران/مالی همه) و همهٔ خروجی‌ها
 * (نمودار، KPI، گزارش، اکسل، چاپ) فقط از همان دیتاستِ محدود‌شده ساخته می‌شوند.
 */
import * as XLSX from 'xlsx'
import { isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { memGet, memSet, perfReady } from '@/lib/perfStore'

/* ---------------- کمکی‌ها (همان ابزار) ---------------- */
export function norm(s: unknown): string {
	if (s === null || s === undefined) return ''
	return String(s).replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/أ/g, 'ا').replace(/آ/g, 'ا')
		.replace(/[ ‌‏‎]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}
export function parseTimeToMinutes(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null
	if (typeof v === 'number') return v > 0 && v < 1 ? Math.round(v * 24 * 60) : null
	if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes()
	const s = String(v).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
	const m = s.match(/^(\d{1,3}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
	if (!m) return null
	let h = parseInt(m[1])
	const mm = parseInt(m[2])
	if (h > 23 && !m[3]) return null
	if (m[3]) { const pm = /pm/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0 }
	if (h === 0 && mm === 0) return null
	return h * 60 + mm
}
function parseClock(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null
	if (typeof v === 'number') return v >= 0 && v < 1 ? Math.round(v * 1440) : null
	const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/)
	return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null
}
const isTimeValue = (v: unknown) => parseTimeToMinutes(v) !== null
export function hhmm(m: number | null | undefined): string {
	if (m === null || m === undefined || isNaN(m)) return '—'
	const r = Math.round(m)
	return String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0')
}
type Row = Record<string, unknown>
const colMap = (columns: string[]) => { const map: Record<string, string> = {}; for (const c of columns) map[norm(c)] = c; return map }
const cell = (row: Row, cmap: Record<string, string>, name: string) => { const k = cmap[norm(name)]; return k === undefined ? null : row[k] }
function dayNum(d: string): number | null {
	const m = String(d || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
	if (!m) return null
	const y = +m[1], mo = +m[2], da = +m[3]
	return y * 372 + (mo <= 6 ? (mo - 1) * 31 : 186 + (mo - 7) * 30) + da
}
export function normDate(d: unknown): string {
	const m = String(d || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
	return m ? m[1] + '/' + m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') : ''
}
function extractNote(row: Row, columns: string[]): string {
	const cmap = colMap(columns)
	const notes: string[] = []
	const push = (v: unknown) => {
		if (v === null || v === undefined || typeof v === 'number' || v instanceof Date) return
		const s = String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
		if (!s || s === 'nan' || s === '-' || s === '—' || isTimeValue(s)) return
		if (!notes.includes(s)) notes.push(s)
	}
	push(cell(row, cmap, 'حضور'))
	for (const i of [1, 2, 3]) { push(cell(row, cmap, 'ورود ' + i)); push(cell(row, cmap, 'خروج ' + i)) }
	for (const col of columns) if (String(col).startsWith('__EMPTY') || String(col).startsWith('Unnamed')) push(row[col])
	return notes.join(' / ')
}
function getPunches(row: Row, columns: string[]): number[] {
	const cmap = colMap(columns)
	const out: number[] = []
	for (const i of [1, 2, 3]) for (const c of ['ورود ' + i, 'خروج ' + i]) { const m = parseTimeToMinutes(cell(row, cmap, c)); if (m !== null) out.push(m) }
	return out
}
function autoCategorize(note: string, presentMin: number | null, dayName: string): Code {
	const n = norm(note)
	const worked = !!(presentMin && presentMin > 0)
	if (n.includes('استعلاجی') || n.includes('مریض')) return 'sick'
	if (n.includes('مرخصی')) return 'leave'
	if (n.includes('ماموریت')) return 'mission'
	if (n.includes('جلسه')) return 'meeting'
	if (n.includes('تعطیل رسمی') || n.includes('رسمی')) return worked ? 'official_worked' : 'official_holiday'
	if (n.includes('تولد')) return worked ? 'birthday_worked' : 'birthday'
	if (norm(dayName) === 'جمعه') return worked ? 'friday_worked' : 'friday'
	if (!worked && !n) return 'absent'
	return 'present'
}

/* ---------------- کدهای روز (همان ابزار) ---------------- */
export type Code = 'present' | 'official_worked' | 'friday_worked' | 'birthday_worked' | 'official_holiday' | 'friday' | 'birthday' | 'leave' | 'sick' | 'mission' | 'meeting' | 'absent'
export const CATEGORY_LABELS: Record<Code, string> = {
	present: 'حضور', official_worked: 'کارکرد در تعطیل رسمی', friday_worked: 'کارکرد در جمعه', birthday_worked: 'کارکرد در تعطیل تولد',
	official_holiday: 'تعطیل رسمی', friday: 'تعطیل (جمعه)', birthday: 'تعطیل تولد مدیر', leave: 'مرخصی', sick: 'مرخصی استعلاجی',
	mission: 'ماموریت اداری', meeting: 'جلسه حضوری بیرون', absent: 'غیبت',
}
const HOLIDAY_CODES: Code[] = ['official_holiday', 'friday', 'birthday']
const HOLIDAY_WORKED_CODES: Code[] = ['official_worked', 'friday_worked', 'birthday_worked']
const HOLIDAY_ALL_CODES = HOLIDAY_CODES.concat(HOLIDAY_WORKED_CODES)
const WORKDAY_CODES: Code[] = ['present', 'meeting', 'mission', ...HOLIDAY_WORKED_CODES]
const MISSION_CODES: Code[] = ['mission', ...HOLIDAY_WORKED_CODES]
const LATE_CODES: Code[] = ['present', 'meeting', 'mission']
const REGULAR_CODES: Code[] = ['present', 'meeting', 'mission']

/* ---------------- تنظیمات (همان پیش‌فرض‌های ابزار) ---------------- */
export interface Settings { workStart: string; workEnd: string; dailyWork: string; restDuration: number | string; lateThreshold: number | string; lateDeduct: string; meetingDefault: number | string; taskKeywords: string }
export const DEFAULT_SETTINGS: Settings = { workStart: '10:00', workEnd: '18:00', dailyWork: '07:30', restDuration: 30, lateThreshold: 15, lateDeduct: '08:00', meetingDefault: 60, taskKeywords: 'حضوری' }
export interface Rules { workStart: number; workEnd: number; dailyWork: number; rest: number; lateThreshold: number; fullDay: number; lateDeduct: number; meetingDefault: number; keywords: string[] }
export function rules(s: Settings): Rules {
	const rest = String(s.restDuration).includes(':') ? (parseTimeToMinutes(s.restDuration) || 0) : Math.max(0, parseInt(String(s.restDuration)) || 0)
	const dailyWork = parseTimeToMinutes(s.dailyWork) ?? 450
	return {
		workStart: parseTimeToMinutes(s.workStart) ?? 600, workEnd: parseTimeToMinutes(s.workEnd) ?? 1080, dailyWork, rest,
		lateThreshold: Math.max(0, parseInt(String(s.lateThreshold)) || 0), fullDay: dailyWork + rest, lateDeduct: parseTimeToMinutes(s.lateDeduct) || 480,
		meetingDefault: Math.max(0, parseInt(String(s.meetingDefault)) || 0), keywords: String(s.taskKeywords || '').split(/[,،]/).map(norm).filter(Boolean),
	}
}


/* ---------------- وظایفِ جولیو ---------------- */
/** یک وظیفه (فقط ستون‌های لازم). pid = «برای ID» جولیو — شناسهٔ معتبرِ کاربر در جولیو */
export interface RawTask { id: string; person: string; pid: string; title: string; date: string; start: number | null; endDate: string; end: number | null; stage: string; desc: string; contact: string; hist: number; fileTo: string }
/** هر فایلِ وظایف جدا نگه داشته می‌شود تا بشود حذفش کرد؛ فقط وظایفِ «بیرون از شرکت» (زیرمجموعهٔ گسترده) ذخیره می‌شوند */
export interface TaskFile { name: string; loadedAt: number; total: number; missingIds?: number; ids: string[]; owners: { name: string; pid: string; n: number }[]; tasks: RawTask[]; source: 'import' | 'manual' | 'migrated' }
const DONE_STAGES = ['انجام شده', 'ارجاع و انجام شده', 'اجرا شده'].map(norm)
// وضعیتِ وظیفهٔ حضوری از روی توضیحات (متن قبلاً norm شده: آ ← ا)
const CANCEL_RE = /کنسل|لغو/
const REMIND_RE = /یاداوری|یادآوری|یاد اوری/
const NOT_HELD_RE = /انجام نشد|برگزار نشد|هماهنگ نکردم|نیومد|نیامد|نرفتیم|نرفتم/
export type SessionStatus = 'held' | 'cancelled' | 'reminder' | 'notheld'
export const SESSION_LABEL: Record<SessionStatus, string> = { held: '✓ برگزار شده', cancelled: '✗ لغو', reminder: '✗ یادآوری', notheld: '✗ برگزار نشده' }
/** زیرمجموعهٔ گسترده برای ذخیره؛ فیلترِ نهایی با «عنوان وظیفه بیرون از شرکت» در تنظیمات انجام می‌شود */
const OUTSIDE_RE = /حضور|جلسه|ویزیت|ملاقات|بیرون/
export const stripTitle = (name: string) => norm(name).replace(/^(اقای|خانم|آقای|جناب|سرکار|مهندس|دکتر)\s+/g, '').trim()

export function parseTaskRows(rows: Row[], name: string, source: TaskFile['source'] = 'manual'): TaskFile | null {
	if (!rows.length) return null
	const cmap = colMap(Array.from(new Set(rows.flatMap((r) => Object.keys(r)))))
	if (!cmap[norm('عنوان')] || !cmap[norm('برای')] || !cmap[norm('تاریخ برنامه‌ریزی')]) return null
	const histKey = Object.keys(cmap).find((k) => k.includes('تاریخچه'))
	const fileTo = rows.map((r) => normDate(cell(r, cmap, 'ثبت'))).filter(Boolean).sort().pop() || ''
	const ids = new Set<string>(), owners = new Map<string, { name: string; pid: string; n: number }>(), tasks: RawTask[] = []
	let missingIds = 0
	for (const r of rows) {
		const id = String(cell(r, cmap, 'وظیفه') ?? '').replace(/\.0$/, '').trim()
		const person = String(cell(r, cmap, 'برای') || '').replace(/\s+/g, ' ').trim()
		const pid = String(cell(r, cmap, 'برای ID') ?? '').replace(/\.0$/, '').trim()
		if (id) { if (ids.has(id)) continue; ids.add(id) } else missingIds++
		if (person) { const ok = pid || 'n:' + stripTitle(person); const o = owners.get(ok) || { name: person, pid, n: 0 }; o.n++; owners.set(ok, o) }
		const date = normDate(cell(r, cmap, 'تاریخ برنامه‌ریزی'))
		const title = String(cell(r, cmap, 'عنوان') || '').trim()
		if (!date || !OUTSIDE_RE.test(norm(title))) continue
		tasks.push({
			id, person, pid, title, date,
			start: parseClock(cell(r, cmap, 'ساعت برنامه‌ریزی')), endDate: normDate(cell(r, cmap, 'تاریخ سررسید')), end: parseClock(cell(r, cmap, 'ساعت سررسید')),
			stage: String(cell(r, cmap, 'مرحله') || '').trim(), desc: String(cell(r, cmap, 'توضیحات') || '').replace(/\s+/g, ' ').trim().slice(0, 300),
			contact: String(cell(r, cmap, 'مخاطب') || '').replace(/\.0$/, '').trim().slice(0, 60),
			hist: typeof r.__histLen === 'number' ? r.__histLen : histKey ? String(r[cmap[histKey]] || '').length : 0, fileTo,
		})
	}
	return { name, loadedAt: Date.now(), total: ids.size, missingIds, ids: [...ids], owners: [...owners.values()], tasks, source }
}
export function parseTaskWorkbook(buffer: ArrayBuffer, name: string): TaskFile | null {
	const wb = XLSX.read(buffer, { type: 'array' })
	for (const sn of wb.SheetNames) {
		const f = parseTaskRows(XLSX.utils.sheet_to_json<Row>(wb.Sheets[sn], { defval: null, raw: true }), name)
		if (f) return f
	}
	return null
}
/** همهٔ فایل‌ها با هم؛ «شناسهٔ وظیفه» کلیدِ یکتاست (کاملِ‌ترین نسخه = تاریخچهٔ بلندتر) */
export function mergedTasks(files: TaskFile[]): RawTask[] {
	const byId = new Map<string, RawTask>()
	for (const f of files) for (const t of f.tasks) {
		const key = t.id || t.person + '|' + t.date + '|' + t.start + '|' + t.title
		const p = byId.get(key)
		if (!p || t.hist >= p.hist) byId.set(key, { ...t, fileTo: [t.fileTo, p && p.fileTo].filter(Boolean).sort().pop() || '' })
	}
	return [...byId.values()]
}
export function taskStats(files: TaskFile[], R: Rules) {
	const ids = new Set<string>(); let noId = 0   // ردیفِ بدونِ «شناسهٔ وظیفه» در شمارِ یکتا حساب نمی‌شود (فقط هشدار)
	const owners = new Map<string, { key: string; name: string; pid: string; n: number }>()
	for (const f of files) {
		f.ids.forEach((i) => ids.add(i)); f.tasks.forEach((t) => { if (t.id) ids.add(t.id) }); noId += f.missingIds || 0
		for (const o of f.owners.length ? f.owners : ownersFromTasks(f.tasks)) { const key = ownerKey(o); const e = owners.get(key) || { key, name: o.name, pid: o.pid, n: 0 }; e.n = Math.max(e.n, o.n); owners.set(key, e) }
	}
	// مالکِ بدونِ «برای ID» (دادهٔ قدیمی) با همنامِ دارای ID یکی می‌شود — هر نفر یک‌بار شمرده شود
	for (const [key, o] of [...owners]) {
		if (!key.startsWith('name:')) continue
		const twin = [...owners.values()].find((x) => x.pid && stripTitle(x.name) === key.slice(5))
		if (twin) { twin.n = Math.max(twin.n, o.n); owners.delete(key) }
	}
	const outside = mergedTasks(files).filter((t) => R.keywords.some((k) => norm(t.title).includes(k)))
	return { missingIds: noId, tasks: ids.size, employees: owners.size, outside: outside.length, owners: [...owners.values()].sort((a, b) => b.n - a.n) }
}
export const ownerKey = (o: { name: string; pid: string }) => (o.pid ? 'id:' + o.pid : 'name:' + stripTitle(o.name))
const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))

/* ---------------- نگاشتِ اشخاص (قابلِ مدیریت؛ هیچ نامی در داده عوض نمی‌شود) ---------------- */
/** امتیاز: نام‌خانوادگی ۲ + نامِ کوچک ۱ + نامِ شیت (نامِ شناخته‌شده) ۱ — حداقل ۲؛ «قوی» = ۳ به بالا */
export function matchName(firstName: string, lastName: string, sheetName: string, names: string[]): { name: string; score: number; firstMatches: boolean } | null {
	const lastTokens = norm(lastName).split(' ').filter((w) => w.length >= 3)
	const sheetTokens = norm(sheetName).split(' ').filter((w) => w.length >= 3)
	const first = norm(firstName)
	let best: string | null = null, bestScore = 0
	for (const p of names) {
		const pn = stripTitle(p), tokens = pn.split(' ')
		let score = 0
		if (lastTokens.some((lt) => pn.includes(lt))) score += 2
		if (first && tokens[0] === first) score += 1
		if (sheetTokens.some((st) => tokens.includes(st))) score += 1
		if (score > bestScore) { bestScore = score; best = p }
	}
	if (!best || bestScore < 2) return null
	return { name: best, score: bestScore, firstMatches: !!first && stripTitle(best).split(' ')[0] === first }
}
export interface PersonLink { person?: string; owner?: string }
export type LinkHow = 'manual' | 'strong' | 'weak' | 'none'
export interface ResolvedLink { person: string | null; personHow: LinkHow; owner: string | null; ownerName: string; ownerHow: LinkHow }
export function resolveLink(first: string, last: string, sheet: string, peopleNames: string[], owners: { key: string; name: string; pid: string }[], manual: PersonLink | undefined): ResolvedLink {
	let person: string | null = null, personHow: LinkHow = 'none'
	if (manual?.person && peopleNames.includes(manual.person)) { person = manual.person; personHow = 'manual' }
	else { const m = matchName(first, last, sheet, peopleNames); if (m) { person = m.name; personHow = m.score >= 3 ? 'strong' : 'weak' } }
	let owner: string | null = null, ownerName = '', ownerHow: LinkHow = 'none'
	const mo = manual?.owner ? owners.find((o) => o.key === manual.owner) : undefined
	if (mo) { owner = mo.key; ownerName = mo.name; ownerHow = 'manual' }
	else if (owners.length) {
		// ۱) نامِ کاملِ شخصِ سیستم = نامِ کاربرِ جولیو (بدونِ عنوان) → قطعی
		const exact = person ? owners.find((o) => stripTitle(o.name) === norm(person)) : undefined
		if (exact) { owner = exact.key; ownerName = exact.name; ownerHow = 'strong' }
		else {
			const m = matchName(first, last, sheet + (person ? ' ' + person : ''), owners.map((o) => o.name))
			const o = m && owners.find((x) => x.name === m.name)
			if (o && m) { owner = o.key; ownerName = o.name; ownerHow = m.score >= 3 ? 'strong' : 'weak' }
		}
	}
	return { person, personHow, owner, ownerName, ownerHow }
}

/* ---------------- دادهٔ وظایف از فروشگاهِ موجود ---------------- */
export interface StoreTasks { daily: Record<string, number>; status: Record<string, Record<string, number>>; types: Record<string, Record<string, number>>; firstDate: string; lastDate: string }
export function storeTasksOf(person: { perf?: Record<string, unknown> } | undefined): StoreTasks | null {
	const pf = person?.perf as Record<string, unknown> | undefined
	const src = (pf?.dailyTasks && typeof pf.dailyTasks === 'object' ? pf.dailyTasks : null) as Record<string, number> | null
	if (!src || !Object.keys(src).length) return null
	// کلیدِ تاریخ یکدست (۱۴۰۵/۵/۳ ← ۱۴۰۵/۰۵/۰۳) — فقط در حافظه، دادهٔ فروشگاه دست نمی‌خورد
	const byDate = <T,>(o: Record<string, T> | undefined) => { const m: Record<string, T> = {}; for (const [d, v] of Object.entries(o || {})) { const n = normDate(d); if (n) m[n] = v } return m }
	const daily = byDate(src), status = byDate(pf?.dayStatus as Record<string, Record<string, number>>)
	const days = Object.keys(daily).concat(Object.keys(status)).sort()
	return { daily, status, types: byDate(pf?.dayType as Record<string, Record<string, number>>), firstDate: days[0] || '', lastDate: days[days.length - 1] || '' }
}

/* ---------------- ویرایشِ دستیِ ردیف (همان ساختارِ ابزارِ حضورغیاب) ---------------- */
export interface RowEdit { code?: Code; entry?: string; exit?: string; present?: string; overtime?: string; excuse?: boolean; note?: string }

/* ---------------- تحلیلِ یک شیت ---------------- */
export type Recon = 'Matched' | 'Missing' | 'Mismatch' | null
export interface Meeting extends RawTask { held: boolean; status: SessionStatus; dur: number; durSource: 'task' | 'default'; overtime: number; inClock: number; reason: string }
export interface DayRow {
	date: string; day: string; entry: string; lastExit: string; presentMin: number | null; inMin: number | null; outMin: number | null; note: string
	code: Code; label: string; isLate: boolean; lateMinutes: number; lateExcused: boolean; forgivenBy: '' | 'meeting' | 'mission' | 'edit'; deductibleLate: number; deficitMin: number
	meetings: Meeting[]; hasMeeting: boolean; overtime: number | null; incomplete: boolean; edited: boolean; editNote: string
	tasks: number | null; taskDone: number | null; recon: Recon; reconWhy: string
}
export interface PersonPerf {
	inactive?: boolean
	sheetName: string; displayName: string; person: string | null; personHow: LinkHow; ownerName: string; ownerHow: LinkHow; team: string
	rows: DayRow[]; monthFrom: string; monthTo: string; hasStoreTasks: boolean; storeFirst: string; storeLast: string; hasRaw: boolean
}
export const WORKED = (r: DayRow) => WORKDAY_CODES.includes(r.code) && ((r.presentMin || 0) > 0 || r.code === 'meeting' || r.code === 'mission')

export function processSheet(rawRows: Row[], sheetName: string, R: Rules, link: ResolvedLink, store: StoreTasks | null, ownerTasks: RawTask[] | null, edits: Record<string, RowEdit>, team: string): PersonPerf | null {
	if (!rawRows || !rawRows.length) return null
	const columns = Array.from(new Set(rawRows.flatMap((r) => Object.keys(r))))
	const cmap = colMap(columns)
	const firstName = String(cell(rawRows[0], cmap, 'نام') || '').trim()
	const lastName = String(cell(rawRows[0], cmap, 'نام خانوادگی') || '').trim()
	// نامِ رسمیِ فایل (برای گزارشِ وکیل) با حروفِ فارسیِ یکدست (ي/ك عربیِ دستگاه ← ی/ک)
	const displayName = ((firstName + ' ' + lastName).trim() || sheetName).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ')
	const haveRaw = ownerTasks !== null
	const tasksByDate: Record<string, RawTask[]> = {}
	for (const t of ownerTasks || []) if (R.keywords.some((k) => norm(t.title).includes(k))) (tasksByDate[t.date] = tasksByDate[t.date] || []).push(t)
	const dates = rawRows.map((r) => normDate(cell(r, cmap, 'تاریخ'))).filter(Boolean).sort()

	const rows: DayRow[] = []
	for (const r of rawRows) {
		const date = normDate(cell(r, cmap, 'تاریخ'))
		if (!date) continue // ردیفِ جمعِ ماه
		const day = String(cell(r, cmap, 'روز') || '').replace(/ /g, ' ').trim()
		const punches = getPunches(r, columns)
		const rawNote = extractNote(r, columns)
		let rawPresent = parseTimeToMinutes(cell(r, cmap, 'حضور'))
		const incomplete = punches.length % 2 === 1
		if (rawPresent === null && punches.length >= 2) {
			if (!incomplete) { rawPresent = 0; for (let i = 0; i < punches.length; i += 2) rawPresent += Math.max(0, punches[i + 1] - punches[i]) }
			else rawPresent = Math.max(...punches) - punches[0]
		}
		const ed = edits[sheetName + '|' + date]
		const has = (v: unknown) => v !== undefined && v !== null && v !== ''
		const entryMin = ed && has(ed.entry) ? parseTimeToMinutes(ed.entry) : punches.length ? punches[0] : null
		const exitMin = ed && has(ed.exit) ? parseTimeToMinutes(ed.exit) : punches.length >= 2 ? Math.max(...punches) : null
		const presentMin = ed && has(ed.present) ? parseTimeToMinutes(ed.present) : rawPresent
		const meetings: Meeting[] = (tasksByDate[date] || []).map((t) => {
			const done = DONE_STAGES.includes(norm(t.stage)), dn = norm(t.desc)
			const status: SessionStatus = !done ? 'notheld' : CANCEL_RE.test(dn) ? 'cancelled' : REMIND_RE.test(dn) ? 'reminder' : NOT_HELD_RE.test(dn) ? 'notheld' : 'held'
			const held = status === 'held'
			let dur: number | null = null, durSource: Meeting['durSource'] = 'default'
			if (t.start !== null && t.end !== null && t.endDate) {
				const d = ((dayNum(t.endDate) || 0) - (dayNum(t.date) || 0)) * 1440 + t.end - t.start
				if (d >= 15 && d <= 240) { dur = d; durSource = 'task' } // ۱۵ دقیقه تا ۴ ساعت = مدتِ واقعی
			}
			if (dur === null) dur = R.meetingDefault
			const start = t.start !== null ? t.start : R.workStart
			const inClock = entryMin !== null && exitMin !== null ? overlap(start, start + dur, entryMin, exitMin) : 0
			const overtime = held ? Math.max(0, dur - inClock) : 0
			return { ...t, held, status, dur, durSource, overtime, inClock, reason: held ? 'برگزار شده' : !done ? 'مرحله: ' + (t.stage || '—') : SESSION_LABEL[status].slice(2) + ' (طبق توضیحات)' }
		})
		const hasMeeting = meetings.some((m) => m.held)
		let code = autoCategorize(rawNote, rawPresent, day)
		if (code === 'absent' && hasMeeting) code = 'meeting'
		if (ed?.code && CATEGORY_LABELS[ed.code]) code = ed.code
		let isLate = false, lateMinutes = 0
		if (LATE_CODES.includes(code) && entryMin !== null && entryMin > R.workStart + R.lateThreshold) { isLate = true; lateMinutes = entryMin - R.workStart }
		let forgivenBy: DayRow['forgivenBy'] = ''
		if (isLate) {
			if (ed && ed.excuse !== undefined) forgivenBy = ed.excuse ? 'edit' : ''
			else if (hasMeeting) forgivenBy = 'meeting'
			else if (code === 'meeting' || code === 'mission') forgivenBy = 'mission'
		}
		const lateExcused = !!forgivenBy
		const deficitMin = REGULAR_CODES.includes(code) && presentMin && presentMin > 0 ? Math.max(0, R.fullDay - presentMin) : 0
		const autoOvertime = haveRaw ? meetings.filter((m) => m.held).reduce((a, m) => a + m.overtime, 0) : null
		const overtime = ed && has(ed.overtime) ? parseTimeToMinutes(ed.overtime) || 0 : autoOvertime
		// تطبیقِ وظیفه ↔ حضور (کلید: شخص + تاریخ؛ وظایف از فروشگاهِ موجود؛ بیرون از بازهٔ دادهٔ وظایف = N/A)
		let tasks: number | null = null, taskDone: number | null = null, recon: Recon = null, reconWhy = 'دادهٔ وظایف برای این شخص در سیستم نیست'
		const faD = (s: string) => s.replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c])
		if (store) {
			if (date > store.lastDate || date < store.firstDate) reconWhy = 'بیرون از بازهٔ دادهٔ وظایف (' + faD(store.firstDate) + ' تا ' + faD(store.lastDate) + ')'
			else {
				tasks = Number(store.daily[date] || 0)
				taskDone = store.status[date] ? Number(store.status[date].done || 0) : null
				const row = { code, presentMin } as DayRow
				const worked = WORKED(row)
				if (worked && tasks > 0) { recon = 'Matched'; reconWhy = 'حضور + ' + tasks.toLocaleString('fa-IR') + ' وظیفه' }
				else if (worked && tasks === 0) { recon = 'Missing'; reconWhy = 'حضور دارد ولی وظیفه‌ای ثبت نشده' }
				else if (!worked && tasks > 0) { recon = 'Mismatch'; reconWhy = tasks.toLocaleString('fa-IR') + ' وظیفه در روزِ ' + CATEGORY_LABELS[code] }
				else reconWhy = 'نه حضور، نه وظیفه (ارزیابی نمی‌شود)'
			}
		}
		rows.push({
			date, day, entry: hhmm(entryMin), lastExit: hhmm(exitMin), presentMin, inMin: entryMin, outMin: exitMin, note: rawNote,
			code, label: CATEGORY_LABELS[code], isLate, lateMinutes, lateExcused, forgivenBy, deductibleLate: isLate && !lateExcused ? lateMinutes : 0, deficitMin,
			meetings, hasMeeting, overtime, incomplete: incomplete && !(ed && has(ed.present)), edited: !!ed, editNote: ed?.note || '',
			tasks, taskDone, recon, reconWhy,
		})
	}
	return {
		sheetName, displayName, person: link.person, personHow: link.personHow, ownerName: link.ownerName, ownerHow: link.ownerHow, team,
		rows, monthFrom: dates[0] || '', monthTo: dates[dates.length - 1] || '', hasStoreTasks: !!store, storeFirst: store?.firstDate || '', storeLast: store?.lastDate || '', hasRaw: haveRaw,
	}
}

/* ---------------- ذخیره در همین مرورگر (IndexedDB؛ بدونِ تغییرِ پایگاه‌داده) ---------------- */
/** فایلِ حضورِ ادغام‌شده: هر شیت = یک نفر؛ ردیف‌ها با کلیدِ پایدارِ «شیت|تاریخ» ادغام می‌شوند */
export interface AttendanceFile {
	fileName: string; loadedAt: number; sheets: Record<string, Row[]>
	/** آخرین فایلِ واردشده (برای «فعلی: …») */
	last?: { fileName: string; loadedAt: number; people: number; skipped: string[]; source: 'card' | 'import-center' }
	/** نسخهٔ قدیمی: ویرایش‌ها درونِ همین شیء بودند — فقط برای مهاجرت خوانده می‌شود */
	edits?: Record<string, RowEdit>
}
const k = (s: string) => 'aromin.perf.' + s + '.' + currentTenant()
const read = <T,>(key: string, fb: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fb } catch { return fb } }
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); return true } catch { return false } }
export const loadAttendance = () => memGet<AttendanceFile | null>('attendance', null)
/** ویرایش‌های دستی (Override) جدا از دادهٔ خام؛ کلید = «شیت|تاریخ» */
export const loadOverrides = (): Record<string, RowEdit> => ({ ...(loadAttendance()?.edits || {}), ...memGet<Record<string, RowEdit>>('overrides', {}) })
export const loadTaskFiles = (): TaskFile[] => memGet<TaskFile[]>('taskfiles', [])
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(k('settings'), {}) })
export const loadLinks = () => read<Record<string, PersonLink>>(k('links'), {})
export const PERF_EVENT = 'aromin-perf'
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(PERF_EVENT)) }
/** هر نوشتن اول منتظرِ بارگذاریِ کش از IndexedDB می‌ماند تا روی دادهٔ موجود ننویسد */
const ready = () => perfReady(currentTenant())

/** مجوزِ دیدنِ همه (همان نقش‌های مدیریتی + مالی که دسترسیِ کاملِ فعلی را دارند) */
export const canSeeAll = (s: Session) => isAdmin(s.role) || s.role === 'finance'
const guard = (s: Session, what: string) => { if (!canSeeAll(s)) throw new Error('فقط مدیران و مالی ' + what + '.') }

/** پارسِ خروجیِ دستگاهِ حضور: شیت‌های بدونِ ستونِ «تاریخ» نادیده گرفته و گزارش می‌شوند */
export function parseAttendanceWorkbook(buffer: ArrayBuffer, fileName: string, source: 'card' | 'import-center' = 'card'): AttendanceFile {
	let wb: XLSX.WorkBook
	try { wb = XLSX.read(buffer, { type: 'array', cellDates: false }) } catch { throw new Error('فایل خوانده نشد؛ اکسلِ سالم (xlsx/xls) انتخاب کنید.') }
	const sheets: Record<string, Row[]> = {}, skipped: string[] = []
	for (const name of wb.SheetNames) {
		const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: null, raw: true })
		if (rows.some((r) => normDate(cell(r, colMap(Object.keys(r)), 'تاریخ')))) sheets[name] = rows
		else skipped.push(name)
	}
	if (!Object.keys(sheets).length) throw new Error('در این فایل شیتی با ستونِ «تاریخ» (قالبِ خروجیِ دستگاهِ حضور) پیدا نشد.')
	const loadedAt = Date.now()
	return { fileName, loadedAt, sheets, last: { fileName, loadedAt, people: Object.keys(sheets).length, skipped, source } }
}
/** کلیدِ پایدارِ ردیف: تاریخِ نرمال (ردیفِ جمعِ ماه کلید ندارد) */
const rowDate = (r: Row) => normDate(cell(r, colMap(Object.keys(r)), 'تاریخ'))
/**
 * ادغامِ فایلِ تازه با دادهٔ قبلی — چیزی دور ریخته نمی‌شود: شیتِ هم‌نام ردیف‌به‌ردیف با کلیدِ تاریخ ادغام می‌شود
 * (دادهٔ تازه برای همان روز برنده است)، شیت‌های قبلیِ غایب در فایلِ تازه می‌مانند. Overrideها جدا هستند و دست نمی‌خورند.
 */
export function mergeAttendance(prev: AttendanceFile | null, next: AttendanceFile): AttendanceFile {
	if (!prev) return next
	const sheets: Record<string, Row[]> = { ...prev.sheets }
	for (const [name, rows] of Object.entries(next.sheets)) {
		const old = sheets[name] || []
		const byDate = new Map<string, Row>()
		for (const r of old) { const d = rowDate(r); if (d) byDate.set(d, r) }
		for (const r of rows) { const d = rowDate(r); if (d) byDate.set(d, r) }
		sheets[name] = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, r]) => r)
	}
	const { edits: _drop, ...rest } = prev
	void _drop
	return { ...rest, fileName: next.fileName, loadedAt: next.loadedAt, sheets, last: next.last }
}
/** آداپتورِ مشترکِ ورودِ فایلِ حضور — هم کارتِ «فایل حضور و غیاب» و هم کادرِ «ورودِ فایل» مرکز ایمپورت از همین استفاده می‌کنند */
export async function ingestAttendanceFile(s: Session, buffer: ArrayBuffer, fileName: string, source: 'card' | 'import-center' = 'card') {
	guard(s, 'فایلِ حضور را بارگذاری می‌کنند')
	await ready()
	const parsed = parseAttendanceWorkbook(buffer, fileName, source)   // خطا ← هیچ ذخیرهٔ ناقصی انجام نمی‌شود
	const prev = loadAttendance()
	const merged = mergeAttendance(prev, parsed)
	await memSet('attendance', merged)
	notify()
	return { people: parsed.last!.people, skipped: parsed.last!.skipped, total: Object.keys(merged.sheets).length, merged: !!prev }
}
/** حذف از این مرورگر: دادهٔ خام و مشتق؛ Overrideها فقط با تأییدِ صریح (withOverrides) */
export async function clearAttendance(s: Session, withOverrides = false) {
	guard(s, 'فایلِ حضور را حذف می‌کنند')
	await ready()
	await memSet('attendance', undefined)
	if (withOverrides) await memSet('overrides', undefined)
	notify()
}
/** سازگاری با کدِ قبلی */
export async function saveAttendance(s: Session, f: AttendanceFile | null) {
	if (!f) return clearAttendance(s)
	guard(s, 'فایلِ حضور را بارگذاری می‌کنند')
	await ready()
	await memSet('attendance', mergeAttendance(loadAttendance(), f))
	notify()
}
/** ویرایشِ دستی ← استورِ Override (جدا از دادهٔ خام)؛ null = حذفِ ویرایش */
export async function saveEdit(s: Session, sheet: string, date: string, e: RowEdit | null) {
	guard(s, 'ردیفِ حضور را ویرایش می‌کنند')
	await ready()
	const ov = loadOverrides()
	if (e) ov[sheet + '|' + date] = e; else delete ov[sheet + '|' + date]
	await memSet('overrides', ov)
	notify()
}
export async function addTaskFile(s: Session | null, f: TaskFile) {
	if (s) guard(s, 'فایلِ وظایف را اضافه می‌کنند')
	await ready()
	const files = loadTaskFiles().filter((x) => !(x.name === f.name && x.total === f.total))
	files.push(f)
	await memSet('taskfiles', files)
	notify()
}
export async function removeTaskFile(s: Session, name: string, loadedAt: number) {
	guard(s, 'فایلِ وظایف را حذف می‌کنند')
	await ready()
	await memSet('taskfiles', loadTaskFiles().filter((x) => !(x.name === name && x.loadedAt === loadedAt)))
	notify()
}
export function saveSettings(s: Session, st: Settings) {
	guard(s, 'قواعد را تغییر می‌دهند')
	write(k('settings'), st)
	notify()
}
export function saveLink(s: Session, sheet: string, link: PersonLink | null) {
	guard(s, 'نگاشتِ اشخاص را تغییر می‌دهند')
	const m = loadLinks()
	if (link && (link.person || link.owner)) m[sheet] = link; else delete m[sheet]
	write(k('links'), m)
	notify()
}

/* ---------------- مهاجرتِ کاشیِ قدیمیِ «وظایفِ بارگذاری‌شدهٔ قبلی» ---------------- */
export const LEGACY_TASKS_NAME = 'وظایفِ بارگذاری‌شدهٔ قبلی'
const LEGACY_KEY = () => k('tasks')
/** مالکانِ وظایف از خودِ ردیف‌ها (کاشیِ قدیمی مالک نداشت → «۰ نفر») */
export function ownersFromTasks(tasks: RawTask[]) {
	const m = new Map<string, { name: string; pid: string; n: number }>()
	for (const t of tasks) {
		if (!t.person) continue
		const key = ownerKey({ name: t.person, pid: t.pid || '' })
		const o = m.get(key) || { name: t.person, pid: t.pid || '', n: 0 }
		o.n++
		m.set(key, o)
	}
	return [...m.values()]
}
/**
 * وظایفِ آپلودِ دستیِ نسخهٔ قبلی را با دادهٔ موتورِ ایمپورت تطبیق می‌دهد (کلید = شناسهٔ وظیفه):
 * تکراری‌ها کنار گذاشته می‌شوند، باقی‌مانده به‌عنوانِ منبعِ «منتقل‌شده» در فهرستِ ایمپورت ثبت می‌شود،
 * و فقط پس از ثبتِ موفق، منبعِ قدیمی (کلیدِ localStorage و ورودیِ کاشی) حذف می‌شود.
 */
export async function migrateLegacyTasks(legacyFromLs?: RawTask[]): Promise<{ migrated: number; duplicates: number; removedTile: boolean }> {
	await ready()
	const files = loadTaskFiles()
	const legacyEntry = files.filter((f) => f.name === LEGACY_TASKS_NAME)
	const lsTasks = legacyFromLs ?? read<RawTask[]>(LEGACY_KEY(), [])
	const legacy: RawTask[] = [...legacyEntry.flatMap((f) => f.tasks), ...lsTasks].map((t) => ({ ...t, pid: t.pid || '', contact: t.contact || '' }))
	const legacyIds = new Set<string>([...legacyEntry.flatMap((f) => f.ids), ...lsTasks.map((t) => t.id)].filter(Boolean))
	if (!legacy.length && !legacyIds.size) return { migrated: 0, duplicates: 0, removedTile: false }
	const rest = files.filter((f) => f.name !== LEGACY_TASKS_NAME)
	const known = new Set(rest.flatMap((f) => f.ids.concat(f.tasks.map((t) => t.id))).filter(Boolean))
	const extraIds = [...legacyIds].filter((id) => !known.has(id))
	const extraTasks = legacy.filter((t) => !t.id || !known.has(t.id))
	const dedup = new Map<string, RawTask>()
	for (const t of extraTasks) dedup.set(t.id || t.person + '|' + t.date + '|' + t.start + '|' + t.title, t)
	const next = [...rest]
	if (extraIds.length || dedup.size) {
		const tasks = [...dedup.values()]
		next.push({ name: 'وظایفِ منتقل‌شده از بارگذاریِ دستی', loadedAt: Date.now(), total: extraIds.length || tasks.length, ids: extraIds, owners: ownersFromTasks(tasks), tasks, source: 'migrated' })
	}
	await memSet('taskfiles', next)          // اول ثبتِ امن…
	try { localStorage.removeItem(LEGACY_KEY()) } catch { /* */ }   // …بعد حذفِ منبعِ قدیمی
	notify()
	return { migrated: extraIds.length || dedup.size, duplicates: legacyIds.size - extraIds.length, removedTile: true }
}
/** آماده‌سازیِ ذخیره‌ساز برای کسب‌وکارِ جاری + مهاجرتِ یک‌بارهٔ وظایفِ قدیمی */
export async function preparePerfStore() {
	await perfReady(currentTenant())
	if (loadTaskFiles().some((f) => f.name === LEGACY_TASKS_NAME) || read<RawTask[]>(LEGACY_KEY(), []).length) {
		try { await migrateLegacyTasks() } catch { /* بعداً دوباره تلاش می‌شود؛ هیچ داده‌ای حذف نشده */ }
	}
}
/**
 * همان فایلِ وظایفی که در «مرکز ایمپورت» یا تبِ عملکرد وارد می‌شود، برای جلسات/اضافه‌کار هم کافی است:
 * موتورِ قبلی بعد از importTasks ردیف‌ها را (فقط به والد، هم‌دامنه) می‌فرستد و این‌جا در همین مرورگر ثبت می‌شود.
 */
export function listenTaskImports(s: Session) {
	if (!canSeeAll(s)) return () => {}
	const on = (ev: MessageEvent) => {
		if (ev.origin !== location.origin) return
		const m = ev.data as { aromin?: string; name?: string; rows?: Row[] } | null
		if (!m || m.aromin !== 'tasks-raw' || !Array.isArray(m.rows)) return
		const f = parseTaskRows(m.rows, String(m.name || 'وظایفِ ایمپورت‌شده'), 'import'); if (f) addTaskFile(null, f).catch(() => { /* فضای مرورگر */ })
	}
	window.addEventListener('message', on)
	return () => window.removeEventListener('message', on)
}

/* ---------------- دیتاستِ محدود به دسترسی ---------------- */
export interface Dataset {
	people: PersonPerf[]; unmatched: number; file: AttendanceFile | null; R: Rules; settings: Settings; scopeAll: boolean; self: string
	taskFiles: TaskFile[]; stats: ReturnType<typeof taskStats>; peopleNames: string[]; teams: string[]
}
type StorePerson = { name: string; role?: string; perf?: Record<string, unknown>; inactive?: boolean }
/**
 * همهٔ نماها از همین تابع می‌خوانند. محدودیتِ دسترسی **قبل از تحلیل** اعمال می‌شود:
 * برای کارمند فقط شیت(های)ی که به شخصِ خودش نگاشت شده پردازش می‌شود و بقیه اصلاً وارد محاسبه نمی‌شوند.
 */
export function buildDataset(session: Session, full: { people?: StorePerson[]; performanceScoped?: boolean; organizationScope?: boolean } | null, roleName: (r: string) => string = (r) => r): Dataset {
	const settings = loadSettings()
	const R = rules(settings)
	const file = loadAttendance()
	const overrides = loadOverrides()
	const scopeAll = canSeeAll(session)
	const self = full?.performanceScoped && !isAdmin(session.role) ? full.people?.[0]?.name || session.name : session.name
	const allPeople = (full?.people || []).filter((p) => p && p.name)
	const peopleNames = allPeople.map((p) => p.name) // فقط برای نگاشتِ نامِ شیت (بدونِ داده)
	const byName = new Map(allPeople.map((p) => [p.name, p]))
	const taskFiles = loadTaskFiles()
	const stats = taskStats(taskFiles, R)
	const allTasks = mergedTasks(taskFiles)
	const links = loadLinks()
	const out: PersonPerf[] = []
	let unmatched = 0
	if (file) {
		for (const [name, raw] of Object.entries(file.sheets)) {
			const cm = colMap(Array.from(new Set(raw.flatMap((r) => Object.keys(r)))))
			const f0 = raw[0] || {}
			const link = resolveLink(String(cell(f0, cm, 'نام') || ''), String(cell(f0, cm, 'نام خانوادگی') || ''), name, peopleNames, stats.owners, links[name])
			// scope قبل از پردازش
			if (!scopeAll && link.person !== self) continue
			const sp = link.person ? byName.get(link.person) : undefined
            if (full?.performanceScoped && (!sp || !['manual', 'strong'].includes(link.personHow))) continue
			const store = sp && (scopeAll || sp.name === self) ? storeTasksOf(sp) : null
			const ownerTasks = link.owner && (!full?.performanceScoped || ['manual', 'strong'].includes(link.ownerHow)) ? allTasks.filter((t) => ownerKey({ name: t.person, pid: t.pid }) === link.owner || (!t.pid && !!link.ownerName && stripTitle(t.person) === stripTitle(link.ownerName))) : null
			const p = processSheet(raw, name, R, link, store, taskFiles.length ? ownerTasks : null, overrides, sp?.role ? roleName(sp.role) : 'بدون تیم')
			if (p && p.rows.length) { if (full?.performanceScoped && sp) p.displayName = sp.name; p.inactive = !!sp?.inactive; out.push(p); if (!p.person) unmatched++ }
		}
	}
	const teams = Array.from(new Set(out.map((p) => p.team)))
	return {
		people: out, unmatched, file: scopeAll && (!full?.performanceScoped || full.organizationScope) ? file : file ? { fileName: file.fileName, loadedAt: file.loadedAt, sheets: {} } : null, R, settings, scopeAll, self,
		taskFiles: scopeAll && (!full?.performanceScoped || full.organizationScope) ? taskFiles : [], stats: scopeAll && (!full?.performanceScoped || full.organizationScope) ? stats : { missingIds: 0, tasks: 0, employees: 0, outside: 0, owners: [] }, peopleNames: scopeAll ? allPeople.filter(isActivePerson).map(p => p.name) : [], teams,
	}
}

/* ---------------- فیلتر و تجمیع ---------------- */
export type AttFilter = '' | 'work' | 'late' | 'absent' | 'leave' | 'sick' | 'mission' | 'holiday'
export type TaskFilter = '' | 'held' | 'notheld' | 'nosession'
export interface Filter { from: string; to: string; person: string; team: string; status: '' | 'Matched' | 'Missing' | 'Mismatch'; att: AttFilter; task: TaskFilter; q: string }
export const EMPTY_FILTER: Filter = { from: '', to: '', person: '', team: '', status: '', att: '', task: '', q: '' }
export const personIn = (p: PersonPerf, f: Filter) => (!f.person || p.sheetName === f.person) && (!f.team || p.team === f.team)
const attOk = (r: DayRow, a: AttFilter) =>
	!a || (a === 'work' ? WORKED(r) : a === 'late' ? r.isLate : a === 'absent' ? r.code === 'absent' : a === 'leave' ? r.code === 'leave' : a === 'sick' ? r.code === 'sick' : a === 'mission' ? MISSION_CODES.includes(r.code) : HOLIDAY_ALL_CODES.includes(r.code))
const taskOk = (r: DayRow, t: TaskFilter) => !t || (t === 'held' ? r.meetings.some((m) => m.held) : t === 'notheld' ? r.meetings.some((m) => !m.held) : r.meetings.length === 0)
export function filterRows(p: PersonPerf, f: Filter): DayRow[] {
	return p.rows.filter((r) => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) && attOk(r, f.att) && taskOk(r, f.task) && (!f.status || r.recon === f.status))
}
/** فقط بازهٔ تاریخ (برای جمع‌های رسمیِ هر نفر: کسرِ روز روی کلِ بازه حساب می‌شود، نه روی زیرمجموعهٔ فیلترشده) */
const periodRows = (p: PersonPerf, f: Filter) => p.rows.filter((r) => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to))

/** خلاصهٔ رسمیِ یک نفر در بازه — همان ساختارِ «جزئیاتِ کارمند» */
export function personSummary(p: PersonPerf, f: Filter, R: Rules) {
	const rows = periodRows(p, f)
	const count = (codes: Code[]) => rows.filter((r) => codes.includes(r.code)).length
	const sum = (list: DayRow[]) => list.reduce((a, r) => a + (r.presentMin || 0), 0)
	const late = rows.filter((r) => r.isLate)
	const lateTotal = late.reduce((a, r) => a + r.lateMinutes, 0)
	const forgiven = late.filter((r) => r.lateExcused)
	const forgivenMin = forgiven.reduce((a, r) => a + r.lateMinutes, 0)
	const byMeeting = late.filter((r) => r.forgivenBy === 'meeting')
	const deductible = lateTotal - forgivenMin
	const deductedDays = Math.floor(deductible / R.lateDeduct)
	const workDays = count(WORKDAY_CODES)
	const regular = rows.filter((r) => REGULAR_CODES.includes(r.code) && (r.presentMin || 0) > 0)
	const inRows = rows.filter((r) => r.inMin !== null && REGULAR_CODES.includes(r.code)), outRows = rows.filter((r) => r.outMin !== null && REGULAR_CODES.includes(r.code))
	const sessions = rows.flatMap((r) => r.meetings)
	return {
		from: rows[0]?.date || '', to: rows[rows.length - 1]?.date || '', days: rows.length,
		workDays, deductedDays, workDaysFinal: workDays - deductedDays, missionDays: count(MISSION_CODES), officeMission: count(['mission']),
		absent: count(['absent']), sick: count(['sick']), leave: count(['leave']), holidayWorked: count(HOLIDAY_WORKED_CODES),
		lateCount: late.length, lateTotal, forgivenCount: forgiven.length, forgivenMin, meetingForgivenCount: byMeeting.length, meetingForgivenMin: byMeeting.reduce((a, r) => a + r.lateMinutes, 0),
		deductible, remaining: deductible - deductedDays * R.lateDeduct,
		overtime: p.hasRaw || rows.some((r) => r.overtime !== null) ? rows.reduce((a, r) => a + (r.overtime || 0), 0) : null,
		total: sum(rows.filter((r) => WORKDAY_CODES.includes(r.code))), regularMin: sum(rows.filter((r) => REGULAR_CODES.includes(r.code))), holidayMin: sum(rows.filter((r) => HOLIDAY_WORKED_CODES.includes(r.code))),
		underFull: regular.filter((r) => (r.presentMin || 0) < R.fullDay).length, regularDays: regular.length, deficit: rows.reduce((a, r) => a + r.deficitMin, 0),
		avgIn: inRows.length ? inRows.reduce((a, r) => a + (r.inMin || 0), 0) / inRows.length : null, avgOut: outRows.length ? outRows.reduce((a, r) => a + (r.outMin || 0), 0) / outRows.length : null,
		holidays: rows.filter((r) => HOLIDAY_ALL_CODES.includes(r.code)).map((r) => ({ date: r.date, day: r.day, label: r.label, worked: HOLIDAY_WORKED_CODES.includes(r.code) })),
		sessionsTotal: sessions.length, sessionsHeld: sessions.filter((m) => m.held).length, sessionOvertime: sessions.reduce((a, m) => a + m.overtime, 0),
		incomplete: rows.filter((r) => r.incomplete).length, edited: rows.filter((r) => r.edited).length,
	}
}
export type PersonSummary = ReturnType<typeof personSummary>

export interface ReconRow { person: string; date: string; day: string; attendance: string; hours: string; tasks: string; done: string; status: Exclude<Recon, null>; why: string }
export function reconRows(d: Dataset, f: Filter): ReconRow[] {
	const q = norm(f.q)
	const out: ReconRow[] = []
	for (const p of d.people) {
		if (!personIn(p, f)) continue
		for (const r of filterRows(p, f)) {
			if (!r.recon) continue
			const row: ReconRow = { person: p.displayName, date: r.date, day: r.day, attendance: r.label, hours: r.presentMin ? hhmm(r.presentMin) : '—', tasks: r.tasks == null ? '—' : String(r.tasks), done: r.taskDone == null ? '—' : String(r.taskDone), status: r.recon, why: r.reconWhy }
			if (q && !norm(Object.values(row).join(' ')).includes(q)) continue
			out.push(row)
		}
	}
	return out.sort((a, b) => (a.date === b.date ? a.person.localeCompare(b.person, 'fa') : a.date < b.date ? -1 : 1))
}
/** جلسات/کارهای حضوریِ بیرون از شرکت ↔ حضورِ ثبت‌شده */
export interface SessionRow { person: string; date: string; day: string; time: string; dur: number; defaultDur: boolean; attendance: string; overtime: number; held: boolean; status: SessionStatus; reason: string; title: string; contact: string; desc: string }
export function sessionRows(d: Dataset, f: Filter): SessionRow[] {
	const q = norm(f.q)
	const out: SessionRow[] = []
	for (const p of d.people) {
		if (!personIn(p, f)) continue
		for (const r of filterRows(p, f)) for (const m of r.meetings) {
			const row: SessionRow = {
				person: p.displayName, date: r.date, day: r.day, time: m.start != null ? hhmm(m.start) : '—', dur: m.dur, defaultDur: m.durSource === 'default',
				attendance: r.inMin != null ? hhmm(r.inMin) + ' – ' + (r.outMin != null ? hhmm(r.outMin) : '—') : 'ثبت نشده', overtime: m.overtime, held: m.held, status: m.status, reason: m.reason,
				title: m.title, contact: m.contact, desc: m.desc,
			}
			if (q && !norm([row.person, row.date, row.title, row.contact, row.desc].join(' ')).includes(q)) continue
			out.push(row)
		}
	}
	return out.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date < b.date ? -1 : 1))
}
/** گزارشِ دیرکرد با جمعِ تجمعیِ قابلِ کسر */
export interface LateRow { date: string; day: string; entry: string; minutes: number; forgiven: boolean; reason: string; cumulative: number; note: string }
export function lateRows(p: PersonPerf, f: Filter): LateRow[] {
	let cum = 0
	const why = { meeting: 'بخشوده — جلسهٔ حضوری', mission: 'بخشوده — مأموریت/جلسه', edit: 'بخشوده — ویرایش دستی', '': 'قابل کسر' } as const
	return periodRows(p, f).filter((r) => r.isLate).map((r) => {
		if (!r.lateExcused) cum += r.lateMinutes
		return { date: r.date, day: r.day, entry: r.entry, minutes: r.lateMinutes, forgiven: r.lateExcused, reason: why[r.forgivenBy], cumulative: cum, note: [r.editNote, r.note].filter(Boolean).join(' / ') }
	})
}
/** سری‌های روزانه برای نمودار (فقط از دیتاستِ محدود‌شده) */
export function dailySeries(d: Dataset, f: Filter) {
	const map = new Map<string, { date: string; present: number; expected: number; hours: number; late: number; deductible: number; overtime: number; hasOT: boolean; matched: number; missing: number; mismatch: number }>()
	for (const p of d.people) {
		if (!personIn(p, f)) continue
		for (const r of filterRows(p, f)) {
			const e = map.get(r.date) || { date: r.date, present: 0, expected: 0, hours: 0, late: 0, deductible: 0, overtime: 0, hasOT: false, matched: 0, missing: 0, mismatch: 0 }
			if (!HOLIDAY_ALL_CODES.includes(r.code)) e.expected++
			if (WORKED(r)) e.present++
			e.hours += (r.presentMin || 0) / 60
			e.late += r.lateMinutes; e.deductible += r.deductibleLate
			if (r.overtime !== null) { e.overtime += r.overtime; e.hasOT = true }
			if (r.recon === 'Matched') e.matched++; else if (r.recon === 'Missing') e.missing++; else if (r.recon === 'Mismatch') e.mismatch++
			map.set(r.date, e)
		}
	}
	return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => ({ ...e, hours: Math.round(e.hours * 10) / 10, rate: e.expected ? Math.round((e.present / e.expected) * 1000) / 10 : null }))
}
/** جمعِ شاخص‌ها روی فیلتر. روزِ کسر برای هر نفر جدا floor می‌شود و بعد جمع می‌خورد. */
export function totals(d: Dataset, f: Filter) {
	let people = 0, expected = 0, present = 0, minutes = 0, workedDays = 0, late = 0, lateCount = 0, forgiven = 0, forgivenCount = 0, deductible = 0, deductedDays = 0, deficit = 0
	let missionMin = 0, missionDays = 0, holidayMin = 0, absent = 0, leave = 0, sick = 0, matched = 0, missing = 0, mismatch = 0
	let overtime = 0, anyOT = false, tasks = 0, anyStore = false, sessions = 0, held = 0, sessionOT = 0, meetingForgiven = 0, anyRaw = false
	for (const p of d.people) {
		if (!personIn(p, f)) continue
		people++
		if (p.hasStoreTasks) anyStore = true
		if (p.hasRaw) anyRaw = true
		let pDed = 0
		for (const r of filterRows(p, f)) {
			if (!HOLIDAY_ALL_CODES.includes(r.code)) expected++
			if (WORKED(r)) { present++; workedDays++ }
			if (r.presentMin && WORKDAY_CODES.includes(r.code)) minutes += r.presentMin
			if (r.overtime !== null) { overtime += r.overtime; anyOT = true }
			if (r.isLate) { lateCount++; late += r.lateMinutes }
			if (r.lateExcused) { forgivenCount++; forgiven += r.lateMinutes; if (r.forgivenBy === 'meeting') meetingForgiven++ }
			pDed += r.deductibleLate
			deficit += r.deficitMin
			if (MISSION_CODES.includes(r.code)) { missionDays++; missionMin += r.presentMin || 0 }
			if (HOLIDAY_WORKED_CODES.includes(r.code)) holidayMin += r.presentMin || 0
			if (r.code === 'absent') absent++; else if (r.code === 'leave') leave++; else if (r.code === 'sick') sick++
			if (r.tasks !== null) tasks += r.tasks
			if (r.recon === 'Matched') matched++; else if (r.recon === 'Missing') missing++; else if (r.recon === 'Mismatch') mismatch++
			for (const m of r.meetings) { sessions++; if (m.held) held++; sessionOT += m.overtime }
		}
		deductible += pDed; deductedDays += Math.floor(pDed / d.R.lateDeduct)
	}
	const evaluated = matched + missing + mismatch
	return {
		people, expected, present, rate: expected ? (present / expected) * 100 : null, minutes, avgMinutes: workedDays ? minutes / workedDays : null, workedDays,
		overtime: anyOT ? overtime : null, late, lateCount, forgiven, forgivenCount, meetingForgiven, deductible, deductedDays, deficit, missionMin, missionDays, holidayMin, absent, leave, sick,
		tasks: anyStore ? tasks : null, matched, missing, mismatch, evaluated, matchedPct: evaluated ? (matched / evaluated) * 100 : null,
		sessions: anyRaw ? sessions : null, held: anyRaw ? held : null, sessionOT: anyRaw ? sessionOT : null,
	}
}

/* ---------------- خروجی ---------------- */
type Cell = string | number
function saveBook(sheets: { name: string; rows: Cell[][]; cols?: number[] }[], file: string) {
	const wb = XLSX.utils.book_new()
	wb.Workbook = { Views: [{ RTL: true }] } // راست‌به‌چپ (SheetJS این را در sheetView می‌نویسد)
	for (const s of sheets) {
		const ws = XLSX.utils.aoa_to_sheet(s.rows)
		if (s.cols) ws['!cols'] = s.cols.map((wch) => ({ wch }))
		XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
	}
	XLSX.writeFile(wb, file)
}
const STATUS_FA: Record<string, string> = { Matched: 'تطبیق', Missing: 'وظیفه ثبت نشده', Mismatch: 'ناهمخوان' }
export const NA = 'N/A'
const T = (m: number | null | undefined) => (m == null ? NA : hhmm(m))
export function exportRecon(rows: ReconRow[], sessions: SessionRow[], label: string) {
	saveBook([
		{ name: 'تطبیق وظیفه و حضور', cols: [22, 12, 10, 22, 10, 10, 10, 16, 40], rows: [
			['گزارش تطبیق وظیفه و حضور — ' + label], [],
			['شخص', 'تاریخ', 'روز', 'حضور', 'کارکرد', 'وظایف', 'انجام‌شده', 'وضعیت', 'توضیح'],
			...rows.map((r) => [r.person, r.date, r.day, r.attendance, r.hours, r.tasks, r.done, STATUS_FA[r.status] + ' (' + r.status + ')', r.why]),
		] },
		{ name: 'جلسات و کارهای حضوری', cols: [22, 12, 8, 10, 16, 10, 22, 30, 40], rows: sessionSheet(sessions, label) },
	], 'گزارش_تطبیق_وظیفه_و_حضور.xlsx')
}
function sessionSheet(s: SessionRow[], label: string): Cell[][] {
	const held = s.filter((x) => x.held)
	return [
		['تطبیق با اکسل وظایف — جلسات / کارهای حضوری بیرون — ' + label],
		['برگزار شده: ' + held.length, 'اضافه‌کار: ' + hhmm(held.reduce((a, x) => a + x.overtime, 0))], [],
		['شخص', 'تاریخ', 'ساعت', 'مدت', 'حضور ثبت‌شده', 'اضافه‌کار', 'وضعیت', 'عنوان / مخاطب', 'توضیحات وظیفه'],
		...s.map((x) => [x.person, x.date, x.time, hhmm(x.dur) + (x.defaultDur ? ' *' : ''), x.attendance, x.held ? hhmm(x.overtime) : '—', SESSION_LABEL[x.status] + (x.held ? '' : ' — ' + x.reason), x.title + (x.contact ? ' / ' + x.contact : ''), x.desc]),
		...(s.some((x) => x.defaultDur) ? [[], [defaultDurNote(s.find((x) => x.defaultDur)!.dur)]] : []),
	]
}
/** متنِ یکسانِ توضیحِ مدتِ پیش‌فرض (UI و اکسل) */
export const defaultDurNote = (min: number) => `* مدت پیش‌فرض (${min.toLocaleString('fa-IR')} دقیقه)، چون ساعت سررسید وظیفه معتبر نبود.`
export interface LawyerRow {
	name: string; person: string; from: string; to: string; presentDays: number; regularMin: number; holidayMin: number; overtime: number | null
	lateTotal: number; forgiven: number; deductible: number; deductedDays: number; remaining: number; deficit: number; missionDays: number; leave: number; sick: number; absent: number; totalMin: number; workDaysFinal: number; status: string
}
export function lawyerRows(d: Dataset, f: Filter): LawyerRow[] {
	return d.people.filter((p) => personIn(p, f)).map((p) => {
		const s = personSummary(p, f, d.R)
		const n = (x: number) => x.toLocaleString('fa-IR')
		const status = [s.absent ? `${n(s.absent)} روز غیبت` : '', s.deductedDays ? `${n(s.deductedDays)} روز کسر بابتِ دیرکرد` : ''].filter(Boolean).join('، ') || 'بدونِ غیبت و کسر'
		return {
			name: p.displayName, person: p.person || '', from: s.from, to: s.to, presentDays: s.workDays, regularMin: s.regularMin, holidayMin: s.holidayMin, overtime: s.overtime,
			lateTotal: s.lateTotal, forgiven: s.forgivenMin, deductible: s.deductible, deductedDays: s.deductedDays, remaining: s.remaining, deficit: s.deficit,
			missionDays: s.missionDays, leave: s.leave, sick: s.sick, absent: s.absent, totalMin: s.total, workDaysFinal: s.workDaysFinal, status,
		}
	})
}
export function exportLawyer(rows: LawyerRow[], period: string, basis: string[]) {
	saveBook([{ name: 'گزارش کارکرد', cols: [6, 24, 12, 12, 10, 12, 12, 12, 10, 10, 12, 10, 10, 10, 10, 10, 10, 12, 12, 26], rows: [
		['گزارش کارکردِ کارکنان برای وکیل / اداره کار — شرکت آرومین'], ['دوره: ' + period], [],
		['ردیف', 'نام و نام خانوادگی', 'از', 'تا', 'روز حضور', 'ساعات کار عادی', 'ساعات تعطیل', 'اضافه‌کار', 'مجموع تأخیر', 'تأخیر بخشوده', 'تأخیر قابل کسر', 'روز کسرشده', 'مانده تأخیر', 'کسرکار', 'مأموریت (روز)', 'مرخصی (روز)', 'غیبت (روز)', 'جمع ساعات', 'جمع روز کاری (نهایی)', 'خلاصه وضعیت'],
		...rows.map((r, i) => [i + 1, r.name, r.from, r.to, r.presentDays, hhmm(r.regularMin), hhmm(r.holidayMin), T(r.overtime), hhmm(r.lateTotal), hhmm(r.forgiven), hhmm(r.deductible), r.deductedDays, hhmm(r.remaining), hhmm(r.deficit), r.missionDays, r.leave, r.absent, hhmm(r.totalMin), r.workDaysFinal, r.status]),
		[], ['مبنای محاسبه:'], ...basis.map((b, i) => [(i + 1) + '. ' + b]), [], ['', 'تهیه‌کننده: نام و امضا', '', '', '', 'مدیرعامل: نام، امضا و مهر'],
	] }], 'گزارش_کارکرد_وکیل_اداره_کار.xlsx')
}
export function exportPerson(p: PersonPerf, s: PersonSummary, rows: DayRow[], late: LateRow[], sessions: SessionRow[]) {
	const period = s.from + ' تا ' + s.to
	saveBook([
		{ name: 'خلاصه', cols: [34, 30], rows: [['عملکرد — ' + p.displayName], [period], [], ...summaryLines(s).map((l) => [l[0], l[1] + (l[2] ? ' — ' + l[2] : '')])] },
		{ name: 'کارکرد روزانه', cols: [12, 10, 8, 10, 10, 16, 14, 18, 16, 30], rows: [
			['تاریخ', 'روز', 'ورود', 'آخرین خروج', 'کارکرد', 'دیرکرد', 'جلسه / اضافه‌کار', 'وضعیت', 'تطبیق وظایف', 'یادداشت'],
			...rows.map((r) => [r.date, r.day, r.entry, r.lastExit, r.presentMin ? hhmm(r.presentMin) : '—', r.isLate ? hhmm(r.lateMinutes) + (r.lateExcused ? ' (بخشوده)' : '') : '—', r.overtime == null ? NA : r.overtime ? hhmm(r.overtime) : '—', r.label + (r.edited ? ' ✎' : ''), r.recon ? STATUS_FA[r.recon] : '—', [r.editNote, r.note].filter(Boolean).join(' / ')]),
		] },
		{ name: 'دیرکردها', cols: [12, 10, 10, 12, 24, 16, 30], rows: [
			['تاریخ', 'روز', 'ساعت ورود', 'دقایق دیرکرد', 'وضعیت', 'جمع تجمعی قابل کسر', 'یادداشت'],
			...late.map((l) => [l.date, l.day, l.entry, l.minutes, l.reason, hhmm(l.cumulative), l.note]),
		] },
		{ name: 'جلسات حضوری', cols: [22, 12, 8, 10, 16, 10, 22, 30, 40], rows: sessionSheet(sessions, period) },
	], 'گزارش_عملکرد_' + p.displayName.replace(/\s+/g, '_') + '.xlsx')
}
/** خطوطِ «جزئیاتِ کارمند» با همان ترتیبِ خواسته‌شده: [عنوان، مقدار، توضیح] */
export function summaryLines(s: PersonSummary): [string, string, string?][] {
	const n = (x: number) => x.toLocaleString('fa-IR')
	const day = (x: number) => n(x) + ' روز'
	return [
		['تعداد روز کارکرد نهایی', day(s.workDaysFinal), `${n(s.workDays)} روز کارکرد − ${n(s.deductedDays)} روز کسر بابت دیرکرد`],
		['تعداد مأموریت', day(s.missionDays)],
		['تعداد غیبت', day(s.absent)],
		['تعداد دیرکرد', day(s.lateCount)],
		['مجموع دیرکرد', hhmm(s.lateTotal)],
		['دیرکرد بخشوده', day(s.forgivenCount), hhmm(s.forgivenMin)],
		['دیرکرد قابل کسر', hhmm(s.deductible)],
		['روز کسرشده', day(s.deductedDays)],
		['مانده', hhmm(s.remaining)],
		['دیرکرد بخشوده بابت جلسه حضوری', day(s.meetingForgivenCount) + ' — ' + hhmm(s.meetingForgivenMin)],
		['اضافه‌کار جلسات', T(s.overtime), s.overtime == null ? 'فایلِ وظایفِ این شخص بارگذاری نشده' : undefined],
		['مجموع کارکرد کل', hhmm(s.total)],
		['کارکرد روز عادی', hhmm(s.regularMin)],
		['کارکرد تعطیل', hhmm(s.holidayMin)],
		['روز زیر ' + '۰۸:۰۰', n(s.underFull) + ' / ' + n(s.regularDays)],
		['میانگین ورود', T(s.avgIn)],
		['میانگین خروج', T(s.avgOut)],
		['مرخصی', day(s.leave)],
		['مریضی', day(s.sick)],
		['مأموریت اداری', day(s.officeMission)],
	]
}
export function lawyerBasis(R: Rules, haveRaw: boolean): string[] {
	return [
		`ساعت کار موظف روزانه: ${hhmm(R.dailyWork)} کار + ${R.rest} دقیقه استراحت = ${hhmm(R.fullDay)} (از ${hhmm(R.workStart)} تا ${hhmm(R.workEnd)}).`,
		'روز حضور = روزهای حضور، جلسه/مأموریتِ بیرون و کار در تعطیل؛ مرخصی، استعلاجی، غیبت و تعطیل در آن نیست.',
		`تأخیر: ورود بعد از ${hhmm(R.workStart + R.lateThreshold)}؛ مقدار از ${hhmm(R.workStart)} شمرده می‌شود.`,
		`تأخیرِ قابلِ کسر = مجموع تأخیر − تأخیرِ بخشوده (جلسهٔ حضوریِ برگزارشده، مأموریت، یا ویرایشِ مجاز). هر ${hhmm(R.lateDeduct)} تأخیرِ قابلِ کسر = ۱ روز کسر؛ مانده حفظ می‌شود.`,
		`کسرکار = کمبودِ ساعتِ حضور نسبت به ${hhmm(R.fullDay)} در روزهای عادیِ دارای حضور.`,
		haveRaw ? `اضافه‌کار = بخشی از جلسه‌های حضوریِ برگزارشده (وظایف جولیو) که خارج از ورود/خروجِ ثبت‌شده بوده؛ اگر زمانِ سررسید معتبر نبود، مدت ${R.meetingDefault} دقیقه فرض شده است.` : 'اضافه‌کار: فایلِ وظایفِ جولیو بارگذاری نشده، پس اضافه‌کار محاسبه‌شدنی نیست (N/A).',
		'همهٔ اعداد از خروجیِ دستگاهِ حضور و داده‌های ثبت‌شدهٔ سیستم است؛ هر موردِ فاقدِ داده N/A درج شده است.',
	]
}
/** چاپ / PDF: فقط بخشِ علامت‌خورده چاپ می‌شود (PDF = «ذخیره به‌صورتِ PDF» در پنجرهٔ چاپِ مرورگر) */
export function printSection(el: HTMLElement | null) {
	if (!el) return
	el.setAttribute('data-print', '1')
	document.body.classList.add('printing')
	const done = () => { document.body.classList.remove('printing'); el.removeAttribute('data-print'); window.removeEventListener('afterprint', done) }
	window.addEventListener('afterprint', done)
	window.print()
	setTimeout(done, 1500)
}
