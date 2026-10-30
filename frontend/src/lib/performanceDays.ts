/** Attendance day analysis; no Excel dependency. */
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
export type Row = Record<string, unknown>
export const colMap = (columns: string[]) => { const map: Record<string, string> = {}; for (const c of columns) map[norm(c)] = c; return map }
export const cell = (row: Row, cmap: Record<string, string>, name: string) => { const k = cmap[norm(name)]; return k === undefined ? null : row[k] }
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
export const HOLIDAY_WORKED_CODES: Code[] = ['official_worked', 'friday_worked', 'birthday_worked']
export const HOLIDAY_ALL_CODES = HOLIDAY_CODES.concat(HOLIDAY_WORKED_CODES)
export const WORKDAY_CODES: Code[] = ['present', 'meeting', 'mission', ...HOLIDAY_WORKED_CODES]
export const MISSION_CODES: Code[] = ['mission', ...HOLIDAY_WORKED_CODES]
const LATE_CODES: Code[] = ['present', 'meeting', 'mission']
export const REGULAR_CODES: Code[] = ['present', 'meeting', 'mission']

/* ---------------- تنظیمات (همان پیش‌فرض‌های ابزار) ---------------- */
export interface Settings { workStart: string; workEnd: string; dailyWork: string; restDuration: number | string; lateThreshold: number | string; lateDeduct: string; meetingDefault: number | string; taskKeywords: string; overtimeByLateExit: boolean }
export const DEFAULT_SETTINGS: Settings = { workStart: '10:00', workEnd: '18:00', dailyWork: '07:30', restDuration: 30, lateThreshold: 15, lateDeduct: '08:00', meetingDefault: 60, taskKeywords: 'حضوری', overtimeByLateExit: false }
export interface Rules { workStart: number; workEnd: number; dailyWork: number; rest: number; lateThreshold: number; fullDay: number; lateDeduct: number; meetingDefault: number; keywords: string[]; otLateExit: boolean }
export function rules(s: Settings): Rules {
	const rest = String(s.restDuration).includes(':') ? (parseTimeToMinutes(s.restDuration) || 0) : Math.max(0, parseInt(String(s.restDuration)) || 0)
	const dailyWork = parseTimeToMinutes(s.dailyWork) ?? 450
	return {
		workStart: parseTimeToMinutes(s.workStart) ?? 600, workEnd: parseTimeToMinutes(s.workEnd) ?? 1080, dailyWork, rest,
		lateThreshold: Math.max(0, parseInt(String(s.lateThreshold)) || 0), fullDay: dailyWork + rest, lateDeduct: parseTimeToMinutes(s.lateDeduct) || 480,
		meetingDefault: Math.max(0, parseInt(String(s.meetingDefault)) || 0), keywords: String(s.taskKeywords || '').split(/[,،]/).map(norm).filter(Boolean),
		otLateExit: s.overtimeByLateExit === true,
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
		const deviceCode = r.status === 'holiday' || r.status === 'closure' ? 'official_holiday' : r.status
		if (typeof deviceCode === 'string' && ['present', 'leave', 'sick', 'absent', 'official_holiday', 'mission'].includes(deviceCode)) code = deviceCode as Code
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
		// خروج بعد از پایانِ موظفی (اختیاری)؛ اضافه‌کارِ جلسه فقط بیرون از ورود/خروج است، پس دوبار شمرده نمی‌شود
		const lateExitOT = R.otLateExit && WORKDAY_CODES.includes(code) && exitMin !== null && exitMin > R.workEnd ? exitMin - R.workEnd : 0
		const overtime = ed && has(ed.overtime) ? parseTimeToMinutes(ed.overtime) || 0 : autoOvertime === null && !lateExitOT ? null : (autoOvertime || 0) + lateExitOT
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
