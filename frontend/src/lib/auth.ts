// ورود — همان منطقِ doLoginِ اپِ کامل: کاربرها از snapshotِ سرور (users)، هم‌گام با کارشناسان (syncUsers)،
// بررسیِ رمز و «قطعِ همکاری». نقش و دسترسیِ تب‌ها همان اپِ کامل است.
// سه راهِ ورود: رمز عبور · کدِ پیامکی (نبض‌کار، راستی‌آزمایی روی سرور) · حسابِ Google (راستی‌آزمایی روی سرور).
import { currentTenant } from '@/lib/data'

export type Role = 'manager' | 'sales' | 'finance' | 'support' | 'salesmgr' | 'accmgr' | 'online'
/** نقش‌های مدیریتی = دسترسیِ کامل (همان ADMIN_ROLES در اپِ کامل و server.py) */
export const isAdmin = (role: string | undefined) => role === 'manager' || role === 'salesmgr' || role === 'accmgr'

export const ROLES: { id: Role; label: string }[] = [
	{ id: 'manager', label: 'مدیر' },
	{ id: 'salesmgr', label: 'مدیر فروش' },
	{ id: 'accmgr', label: 'مدیر حساب' },
	{ id: 'sales', label: 'کارشناس فروش' },
	{ id: 'online', label: 'کارشناس آنلاین' },
	{ id: 'finance', label: 'کارشناس مالی' },
	{ id: 'support', label: 'کارشناس پشتیبانی' },
]

export const roleLabel = (r: Role | string) => ROLES.find((x) => x.id === r)?.label ?? String(r)

export interface Session {
	name: string
	role: Role
	/** نام‌کاربری و رمز فقط در حافظهٔ صفحه — برای ورودِ خودکارِ تب‌های جاسازی‌شده. */
	user: string
	pass: string
}

/** هویت برای APIهای سمتِ سرور (دستیار، پایگاه دانش): سرور همان دفترِ کاربرانِ کسب‌وکار را راستی‌آزمایی می‌کند */
export function authHeaders(s: Pick<Session, 'user' | 'pass'> | null | undefined): Record<string, string> {
	return s?.user && s?.pass ? { 'X-Aromin-User': encodeURIComponent(s.user), 'X-Aromin-Pass': encodeURIComponent(s.pass) } : {}
}

export interface UserRec {
	pass: string
	role: string
	person?: string
	email?: string
	mobile?: string
}
export interface PersonRec {
	name: string
	role?: string
	inactive?: boolean
	leftDate?: string
	mobile?: string
	email?: string
}
type Result = { ok: true; session: Session } | { ok: false; error: string; pending?: boolean }

const firstName = (full: string) => String(full || '').trim().split(/\s+/)[0] || ''
const tenantQs = () => `tenant=${encodeURIComponent(currentTenant())}`

/** کاربرها همان‌طور که اپِ کامل می‌بیند (users + syncUsers). */
export async function loadDirectory(): Promise<{ USERS: Record<string, UserRec>; PEOPLE: PersonRec[] } | null> {
	try {
		const r = await fetch(`/api/state?${tenantQs()}`, { cache: 'no-store' })
		if (!r.ok) return null
		const full = ((await r.json()).full || {}) as { users?: Record<string, UserRec>; people?: PersonRec[] }
		const USERS: Record<string, UserRec> = { ...(full.users || {}) }
		const PEOPLE = full.people || []
		for (const p of PEOPLE) {
			const f = firstName(p.name)
			if (!f) continue
			if (!USERS[f]) USERS[f] = { pass: '123', role: p.role || 'sales', person: p.name }
			else USERS[f] = { ...USERS[f], role: p.role || USERS[f].role, person: p.name }
		}
		if (!USERS['مدیر']) USERS['مدیر'] = { pass: '123', role: 'manager', person: '' }
		if (!USERS['مالی']) USERS['مالی'] = { pass: '123', role: 'finance', person: '' }
		if (!USERS['پشتیبان']) USERS['پشتیبان'] = { pass: '123', role: 'support', person: '' }
		return { USERS, PEOPLE }
	} catch {
		return null
	}
}

function sessionOf(u: string, rec: UserRec, PEOPLE: PersonRec[]): Result {
	if (rec.person) {
		const p = PEOPLE.find((x) => x.name === rec.person)
		if (p?.inactive) return { ok: false, error: `همکاری شما${p.leftDate ? ` در تاریخِ ${p.leftDate}` : ''} پایان یافته و دسترسی غیرفعال است.` }
	}
	return { ok: true, session: { name: rec.person || u, role: (rec.role as Role) || 'sales', user: u, pass: String(rec.pass) } }
}

export async function login(user: string, pass: string): Promise<Result> {
	const u = String(user || '').trim()
	if (!u) return { ok: false, error: 'نام کاربری را وارد کنید.' }
	const dir = await loadDirectory()
	if (!dir) return { ok: false, error: 'اتصال به سرور برقرار نشد.' }
	const rec = dir.USERS[u]
	if (!rec) return { ok: false, error: 'کاربری با این نام پیدا نشد.' }
	if (rec.pass !== String(pass || '')) return { ok: false, error: 'رمز عبور درست نیست.' }
	return sessionOf(u, rec, dir.PEOPLE)
}

/* ---------- ورود با کدِ پیامکی ---------- */
export const normMobile = (x: string) => {
	let s = String(x || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '')
	if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2)
	if (s.length === 10 && s[0] === '9') s = '0' + s
	return s
}

export async function requestOtp(mobile: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const r = await fetch('/api/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: normMobile(mobile), tenant: currentTenant() }) })
		const d = await r.json()
		return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'ارسالِ کد ناموفق بود.' }
	} catch {
		return { ok: false, error: 'اتصال به سرور برقرار نشد.' }
	}
}

/** کد روی سرور راستی‌آزمایی می‌شود؛ بعد موبایل مثلِ loginByMobileِ اپِ کامل به کاربر نگاشت می‌شود. */
export async function verifyOtp(mobile: string, code: string): Promise<Result> {
	const m = normMobile(mobile)
	try {
		const r = await fetch('/api/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: m, code }) })
		const d = await r.json()
		if (!d || !d.ok) return { ok: false, error: (d && d.error) || 'کد تأیید نشد.' }
	} catch {
		return { ok: false, error: 'اتصال به سرور برقرار نشد.' }
	}
	const dir = await loadDirectory()
	if (!dir) return { ok: false, error: 'اتصال به سرور برقرار نشد.' }
	let uname = Object.keys(dir.USERS).find((u) => dir.USERS[u].mobile && normMobile(dir.USERS[u].mobile!) === m)
	if (!uname) {
		const per = dir.PEOPLE.find((p) => p.mobile && normMobile(p.mobile) === m)
		if (per) uname = Object.keys(dir.USERS).find((u) => dir.USERS[u].person === per.name)
	}
	if (!uname) return { ok: false, error: 'این شماره به هیچ کاربری وصل نیست (موبایلِ کارشناس را در «تیم» ثبت کنید).' }
	return sessionOf(uname, dir.USERS[uname], dir.PEOPLE)
}

/* ---------- ورود / ثبت‌نام با Google ---------- */
export async function googleConfig(): Promise<{ enabled: boolean; clientId: string | null }> {
	try {
		const d = await (await fetch('/api/auth/google/config', { cache: 'no-store' })).json()
		return { enabled: !!(d && d.enabled && d.clientId), clientId: (d && d.clientId) || null }
	} catch {
		return { enabled: false, clientId: null }
	}
}

export async function googleSignIn(credential: string): Promise<Result> {
	let d: { ok?: boolean; user?: string; error?: string; pending?: boolean }
	try {
		d = await (await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential, tenant: currentTenant() }) })).json()
	} catch {
		return { ok: false, error: 'اتصال به سرور برقرار نشد.' }
	}
	if (!d || !d.ok || !d.user) return { ok: false, error: (d && d.error) || 'ورود با Google ناموفق بود.', pending: !!(d && d.pending) }
	const dir = await loadDirectory()
	if (!dir || !dir.USERS[d.user]) return { ok: false, error: 'حسابِ کاربری پیدا نشد.' }
	return sessionOf(d.user, dir.USERS[d.user], dir.PEOPLE)
}
