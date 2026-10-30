import { isActivePerson } from './people'
/**
 * موتورِ «حضور و عملکرد» — Data → Analysis → Reconciliation → Permissions → Presentation → Export.
 *
 * منطقِ محاسبه عیناً از «ابزار تحلیل حضور و غیاب — آرومین» (همان قواعد، همان کدهای روز، همان کسرِ دیرکرد
 * و اضافه‌کارِ جلسه) آمده است؛ هیچ عددی ساخته یا حدس زده نمی‌شود.
 *
 * منابعِ داده (به ترتیبِ اولویت):
 *  - وظایف: فروشگاهِ موجودِ اپ — people[].perf.dailyTasks / dayStatus / dayType (همان ایمپورتِ جولیو). فقط خواندنی.
 *  - حضور و غیاب: روی سرور (/api/performance/attendance، lib/attendanceApi.ts) — اکسلِ دستگاه در مرورگر پارس و ردیف‌های خام
 *    به سرور فرستاده می‌شود؛ ویرایش‌های دستی و قواعد هم روی سرور‌اند. شخصِ هر کارت فقط با نگاشتِ تأییدشده (نه تطبیقِ نام).
 *  - وظایفِ خامِ جولیو (اختیاری، fallback): فقط برای «اضافه‌کارِ جلسه» و «بخشودگیِ دیرکرد» که به ساعتِ وظیفه نیاز دارند.
 *
 * دسترسی: scope قبل از هر محاسبه اعمال می‌شود (کارمند فقط شیتِ خودش؛ مدیران/مالی همه) و همهٔ خروجی‌ها
 * (نمودار، KPI، گزارش، اکسل، چاپ) فقط از همان دیتاستِ محدود‌شده ساخته می‌شوند.
 */
import * as XLSX from 'xlsx'
import { isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { memGet, memSet, perfReady } from '@/lib/perfStore'
import {
	ApiError, canSeeAll, canonicalJson, deleteAttendance, loadServerAttendance, notifyPerf, postAttendance, putOverride, putSettings, serverAttendance, sha256Hex,
	type AttendanceBatch, type ServerCard, type Unmapped,
} from '@/lib/attendanceApi'
export { canSeeAll, PERF_EVENT } from '@/lib/attendanceApi'

export * from './performanceDays'
import { MISSION_CODES, HOLIDAY_ALL_CODES, WORKDAY_CODES, REGULAR_CODES, HOLIDAY_WORKED_CODES, ownersFromTasks } from './performanceDays'
import { norm, hhmm, normDate, type Code, type Settings, DEFAULT_SETTINGS, type Rules, rules, type RawTask, type TaskFile, type SessionStatus, SESSION_LABEL, stripTitle, parseTaskRows, mergedTasks, taskStats, ownerKey, type PersonLink, resolveLink, storeTasksOf, type RowEdit, type Recon, type DayRow, type PersonPerf, WORKED, processSheet, cell, colMap, type Row } from './performanceDays'

export function parseTaskWorkbook(buffer: ArrayBuffer, name: string): TaskFile | null {
	const wb = XLSX.read(buffer, { type: 'array' })
	for (const sn of wb.SheetNames) {
		const f = parseTaskRows(XLSX.utils.sheet_to_json<Row>(wb.Sheets[sn], { defval: null, raw: true }), name)
		if (f) return f
	}
	return null
}
/** همهٔ فایل‌ها با هم؛ «شناسهٔ وظیفه» کلیدِ یکتاست (کاملِ‌ترین نسخه = تاریخچهٔ بلندتر) */
/* ---------------- حضور روی سرور (کشِ attendanceApi)؛ وظایف و نگاشتِ جولیو هنوز در همین مرورگر ---------------- */
/** دیدِ حضور: هر کارت = یک «شیت» با کلیدِ یکتای «نامِ شیت · کارت N»؛ ردیف‌ها خامِ دستگاه‌اند */
export interface AttendanceFile {
	fileName: string; loadedAt: number; sheets: Record<string, Row[]>
	/** آخرین فایلِ واردشده (برای «فعلی: …») */
	last?: { fileName: string; loadedAt: number; people: number; skipped: string[]; source: 'card' | 'import-center' | 'migration' }
	/** دستهٔ ایمپورت‌های سرور (فقط مدیران/مالی) */
	batches?: AttendanceBatch[]
	/** نسخهٔ قدیمی: ویرایش‌ها درونِ همین شیء بودند — فقط برای مهاجرت خوانده می‌شود */
	edits?: Record<string, RowEdit>
}
const k = (s: string) => 'aromin.perf.' + s + '.' + currentTenant()
const read = <T,>(key: string, fb: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fb } catch { return fb } }
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); return true } catch { return false } }
export const sheetKeyOf = (c: Pick<ServerCard, 'sheetName' | 'cardNo'>) => `${c.sheetName} · کارت ${c.cardNo}`
const serverCards = () => serverAttendance()?.cards || []
/** کارتِ سرورِ یک کلیدِ شیت (برای ویرایش و نگاشت) */
export const cardOfSheet = (key: string): ServerCard | undefined => serverCards().find((c) => sheetKeyOf(c) === key)
const tsOf = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? 0 : t }
export function loadAttendance(): AttendanceFile | null {
	const d = serverAttendance()
	if (!d || (!d.cards.length && !d.batches?.length)) return null
	const sheets: Record<string, Row[]> = {}
	for (const c of d.cards) sheets[sheetKeyOf(c)] = c.rows
	const b = d.batches?.[0]
	const loadedAt = tsOf(b?.createdAt || d.updatedAt)
	return {
		fileName: b?.fileName || '', loadedAt, sheets, batches: d.batches,
		last: b ? { fileName: b.fileName, loadedAt, people: b.sheets, skipped: (b.skipped || []).map((x) => x.sheet), source: b.source } : undefined,
	}
}
/** ویرایش‌های دستی (Override) جدا از دادهٔ خام؛ کلید = «کلیدِ شیت|تاریخ» */
export const loadOverrides = (): Record<string, RowEdit> => {
	const out: Record<string, RowEdit> = {}
	for (const c of serverCards()) for (const [date, e] of Object.entries(c.overrides || {})) out[sheetKeyOf(c) + '|' + date] = e as RowEdit
	return out
}
export const loadTaskFiles = (): TaskFile[] => memGet<TaskFile[]>('taskfiles', [])
/** قواعد: سرور (همهٔ مرورگرها یکسان) ← نسخهٔ محلیِ قدیمی ← پیش‌فرض */
export const loadSettings = (): Settings => {
	const st = serverAttendance()?.settings as Partial<Settings> | undefined
	return { ...DEFAULT_SETTINGS, ...(st || read<Partial<Settings>>(k('settings'), {})) }
}
export const loadLinks = () => read<Record<string, PersonLink>>(k('links'), {})
const notify = notifyPerf
/** هر نوشتن اول منتظرِ بارگذاریِ کش از IndexedDB می‌ماند تا روی دادهٔ موجود ننویسد */
const ready = () => perfReady(currentTenant())

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
/** آداپتورِ مشترکِ ورودِ فایلِ حضور: پارس در مرورگر ← sha256 فایل ← سرور (تکراری = بدونِ نوشتن) ← بارگذاریِ دوباره */
export async function ingestAttendanceFile(s: Session, buffer: ArrayBuffer, fileName: string, source: 'card' | 'import-center' = 'card') {
	guard(s, 'فایلِ حضور را بارگذاری می‌کنند')
	const parsed = parseAttendanceWorkbook(buffer, fileName, source)   // خطا ← هیچ چیزی فرستاده نمی‌شود
	return postParsed(s, parsed, await sha256Hex(buffer), source)
}
async function postParsed(s: Session, parsed: AttendanceFile, sha256: string, source: AttendanceBatch['source']) {
	const prev = loadAttendance()
	let r
	try { r = await postAttendance(s, { fileName: parsed.fileName, sha256, source, sheets: parsed.sheets }) } catch (e) {
		const sk = e instanceof ApiError && Array.isArray(e.body.skipped) ? (e.body.skipped as { sheet: string; reason: string }[]) : []
		throw sk.length ? new Error((e as Error).message + ' (' + sk.map((x) => x.sheet + ': ' + x.reason).join('، ') + ')') : e
	}
	const data = await loadServerAttendance(s)
	const serverSkipped = (r.skipped || []).map((x) => x.sheet)
	return {
		people: Object.keys(r.sheetCards || {}).length || parsed.last?.people || 0, skipped: [...(parsed.last?.skipped || []), ...serverSkipped],
		total: data.cards.length, merged: !!prev, duplicate: r.duplicate, unmapped: (r.unmapped || []) as Unmapped[],
	}
}
/** حذف از سرور: همهٔ روزها و دسته‌ها؛ Overrideها فقط با تأییدِ صریح (withOverrides). نگاشتِ هویت دست نمی‌خورد */
export async function clearAttendance(s: Session, withOverrides = false) {
	guard(s, 'فایلِ حضور را حذف می‌کنند')
	await deleteAttendance(s, { all: true, overrides: withOverrides })
	await loadServerAttendance(s)
}
/** حذفِ یک دستهٔ ایمپورت (روزهایی که دستهٔ بعدی بازنویسی کرده می‌مانند) */
export async function removeAttendanceBatch(s: Session, batch: number) {
	guard(s, 'فایلِ حضور را حذف می‌کنند')
	const r = await deleteAttendance(s, { batch })
	await loadServerAttendance(s)
	return r
}
/** سازگاری با کدِ قبلی: همان مسیرِ سرور (sha از محتوای قطعیِ شیت‌ها) */
export async function saveAttendance(s: Session, f: AttendanceFile | null) {
	if (!f) return clearAttendance(s)
	guard(s, 'فایلِ حضور را بارگذاری می‌کنند')
	const source = f.last?.source || 'card'
	await postParsed(s, f, await sha256Hex(canonicalJson(f.sheets)), source)
}
/** ویرایشِ دستی ← Override روی سرور (جدا از دادهٔ خام)؛ null = حذفِ ویرایش */
export async function saveEdit(s: Session, sheet: string, date: string, e: RowEdit | null) {
	guard(s, 'ردیفِ حضور را ویرایش می‌کنند')
	const card = cardOfSheet(sheet)
	if (!card) throw new Error('کارتِ این شیت روی سرور پیدا نشد؛ صفحه را دوباره بارگذاری کنید.')
	const r = await putOverride(s, card.cardNo, date, (e as Record<string, unknown> | null) || null)
	if (r.override) card.overrides = { ...card.overrides, [date]: r.override }
	else { const { [date]: _gone, ...rest } = card.overrides || {}; void _gone; card.overrides = rest }
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
export async function saveSettings(s: Session, st: Settings) {
	guard(s, 'قواعد را تغییر می‌دهند')
	const r = await putSettings(s, st as unknown as Record<string, unknown>)
	const d = serverAttendance()
	if (d) { d.settings = r.settings; d.settingsStored = true }
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
type StorePerson = { id?: string | number; name: string; role?: string; perf?: Record<string, unknown>; inactive?: boolean }
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
			const card = cardOfSheet(name)
			const sheet = card?.sheetName || name
			// کاربرِ جولیو هنوز از نام/نگاشتِ محلی؛ شخصِ حضور فقط از نگاشتِ تأییدشدهٔ کارت روی سرور
			const link = resolveLink(String(cell(f0, cm, 'نام') || ''), String(cell(f0, cm, 'نام خانوادگی') || ''), sheet, peopleNames, stats.owners, links[name] || links[sheet])
			const confirmed = card?.mapping === 'confirmed' && !!card.personName
			link.person = confirmed ? card!.personName : null
			link.personHow = confirmed ? 'manual' : 'none'
			// scope قبل از پردازش
			if (!scopeAll && link.person !== self) continue
			const sp = confirmed ? allPeople.find((p) => p.id != null && String(p.id) === card!.personId) || byName.get(card!.personName!) : undefined
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
		haveRaw ? `اضافه‌کار = بخشی از جلسه‌های حضوریِ برگزارشده (وظایف جولیو) که خارج از ورود/خروجِ ثبت‌شده بوده؛ اگر زمانِ سررسید معتبر نبود، مدت ${R.meetingDefault} دقیقه فرض شده است.` : R.otLateExit ? 'اضافه‌کارِ جلسه: فایلِ وظایفِ جولیو بارگذاری نشده (N/A).' : 'اضافه‌کار: فایلِ وظایفِ جولیو بارگذاری نشده، پس اضافه‌کار محاسبه‌شدنی نیست (N/A).',
		...(R.otLateExit ? [`اضافه‌کار از خروجِ دیرتر = خروج بعد از ${hhmm(R.workEnd)} (پایانِ موظفی) در روزهای کارکرد؛ با اضافه‌کارِ جلسه جمع می‌شود و دوبار شمرده نمی‌شود.`] : []),
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
