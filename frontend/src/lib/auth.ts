// ورود با نشست امضاشدهٔ سرور؛ رمز عبور در مرورگر نگهداری نمی‌شود.
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
	/** نام کاربریِ نشست؛ تب‌های جاسازی‌شده فقط توکن می‌گیرند. */
	user: string
	pass: string // Empty compatibility field; passwords are never retained.
	must_change_password?: boolean
	token?: string
	tenant?: string
}

/** هویت برای APIهای سمتِ سرور (دستیار، پایگاه دانش): سرور همان دفترِ کاربرانِ کسب‌وکار را راستی‌آزمایی می‌کند */
let activeSession: Session | null = null
export function clearSession() { activeSession = null }
export function activeManagerSession() { return !!activeSession && isAdmin(activeSession.role) && !activeSession.must_change_password && activeSession.tenant === currentTenant() }
export function activeAuthHeaders(): Record<string, string> {
	return activeSession?.tenant && activeSession.tenant !== currentTenant() ? {} : authHeaders(activeSession)
}

export function authHeaders(s: Pick<Session, 'user' | 'pass' | 'token' | 'tenant'> | null | undefined): Record<string, string> {
	if (s?.tenant && s.tenant !== currentTenant()) return {}
	if (s?.token) return { Authorization: `Bearer ${s.token}` }
	return {}
}

type Result = { ok: true; session: Session } | { ok: false; error: string; pending?: boolean }

async function sessionRequest(payload: Record<string, string>, path = '/api/auth/session', headers: Record<string, string> = {}): Promise<Result> {
	try {
		const tenant = currentTenant()
		const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ ...payload, tenant }) })
		const d = await r.json()
		if (!r.ok || !d.ok || !d.token || d.session?.tenant !== tenant || currentTenant() !== tenant)
			return { ok: false, error: d.error || 'ورود معتبر نیست.', pending: !!d.pending }
		const session: Session = { ...d.session, token: d.token, pass: '' }
		activeSession = session
		return { ok: true, session }
	} catch {
		return { ok: false, error: 'اتصال به سرور برقرار نشد.' }
	}
}

export async function login(user: string, pass: string): Promise<Result> {
	clearSession()
	if (!user.trim()) return { ok: false, error: 'نام کاربری را وارد کنید.' }
	return sessionRequest({ username: user.trim(), password: pass })
}

export async function changePassword(session: Session, next: string, current = ''): Promise<Result> {
	return sessionRequest({ next, current }, '/api/auth/change-password', authHeaders(session))
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
	clearSession()
	return sessionRequest({ mobile: normMobile(mobile), code })
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
	clearSession()
	return sessionRequest({ credential })
}
