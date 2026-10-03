import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { googleConfig, googleSignIn, login, normMobile, requestOtp, type Session } from '@/lib/auth'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import VaultOtp from '@/components/login/VaultOtp'

const Emblem3D = lazy(() => import('@/components/login/emblem/Emblem3D'))

/**
 * ورود / ثبت‌نام — چیدمانِ دوپنلیِ کشویی (STEA Drop #002) در راست‌به‌چپ، با نشانِ سه‌بعدیِ آرومین.
 * عمق با رنگ ساخته می‌شود (مِش بنفش/آبی/طلایی)، نه سایه؛ فقط یک دکمهٔ پُرِ اصلی در هر فرم.
 * ورود: رمز عبور · کدِ پیامکی · Google. ثبت‌نام: با Gmail → درخواست برای تأییدِ مدیر (دسترسیِ خودکار نمی‌دهد).
 */
type Mode = 'login' | 'register'
type Method = 'password' | 'otp'
type GoogleCfg = { enabled: boolean; clientId: string | null }

export function LoginPage({ onLogin }: { onLogin: (s: Session) => void }) {
	const [mode, setMode] = useState<Mode>('login')
	const [google, setGoogle] = useState<GoogleCfg>({ enabled: false, clientId: null })
	useEffect(() => { googleConfig().then(setGoogle) }, [])

	return (
		<div dir="rtl" className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-4 text-foreground sm:p-6">
			<ThemeSwitcher className="absolute left-4 top-4 z-20" />
			{/* مِشِ رنگیِ پس‌زمینه */}
			<div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(40% 45% at 12% 18%, hsl(var(--primary)/.14), transparent 70%), radial-gradient(35% 40% at 88% 85%, hsl(var(--accent)/.14), transparent 70%), radial-gradient(30% 35% at 85% 10%, hsl(var(--secondary)/.10), transparent 70%)' }} />

			<motion.main
				initial={{ opacity: 0, y: 14 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.15 }}
				className="relative w-full max-w-[880px] overflow-hidden rounded-[28px] border-8 border-card bg-card shadow-[0_30px_90px_-30px_hsl(var(--shadow)/.35)] sm:aspect-[880/560]">
				{/* دسکتاپ: پنلِ رنگیِ کشویی */}
				<motion.section
					className="absolute inset-y-0 left-0 z-20 hidden w-1/2 overflow-hidden rounded-[20px] sm:block"
					animate={{ x: mode === 'login' ? '0%' : '100%' }}
					transition={{ type: 'spring', stiffness: 120, damping: 20 }}>
					<Hero mode={mode} onSwitch={setMode} />
				</motion.section>

				{/* موبایل: نوارِ بالای فرم */}
				<div className="relative overflow-hidden rounded-[20px] sm:hidden">
					<Hero mode={mode} onSwitch={setMode} compact />
				</div>

				{/* فرم‌ها: ورود سمتِ راست، ثبت‌نام سمتِ چپ */}
				<div className="relative sm:absolute sm:inset-0">
					<AnimatePresence mode="popLayout" initial={false}>
						{mode === 'login' ? (
							<motion.div key="login" className="sm:absolute sm:inset-y-0 sm:right-0 sm:w-1/2"
								initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35 }}>
								<LoginForm google={google} onLogin={onLogin} onRegister={() => setMode('register')} />
							</motion.div>
						) : (
							<motion.div key="register" className="sm:absolute sm:inset-y-0 sm:left-0 sm:w-1/2"
								initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.35 }}>
								<RegisterForm google={google} onLogin={onLogin} onBack={() => setMode('login')} />
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</motion.main>
		</div>
	)
}

/* ---------------- پنلِ رنگی با نشانِ سه‌بعدی ---------------- */
function Hero({ mode, onSwitch, compact }: { mode: Mode; onSwitch: (m: Mode) => void; compact?: boolean }) {
	const login = mode === 'login'
	const s = compact ? 96 : 190
	return (
		<div className={`relative flex h-full flex-col items-center justify-center text-center text-white ${compact ? 'gap-2 px-5 py-5' : 'gap-4 p-8'}`}
			style={{ background: 'radial-gradient(60% 55% at 22% 18%, rgba(0,73,145,.85), transparent 70%), radial-gradient(55% 50% at 85% 90%, rgba(252,191,0,.42), transparent 70%), linear-gradient(150deg,#910D6A 0%,#6E0A50 55%,#3A0A33 100%)' }}>
			{/* هالهٔ روشن پشتِ نشان تا قطعهٔ بنفش روی زمینهٔ بنفش گم نشود */}
			<div className="relative grid place-items-center">
				<span aria-hidden className="absolute rounded-full" style={{ width: s * 1.05, height: s * 1.05, background: 'radial-gradient(closest-side, rgba(255,255,255,.34), rgba(255,255,255,.10) 60%, transparent)' }} />
				<Suspense fallback={<img src="/aromin-mark.svg" alt="" style={{ width: s, height: s }} />}>
					<Emblem3D size={s} />
				</Suspense>
			</div>
			<h2 className={`font-extrabold tracking-tight ${compact ? 'text-lg' : 'text-[26px]'}`}>{login ? 'تازه به آرومین آمده‌اید؟' : 'قبلاً عضو شده‌اید؟'}</h2>
			{!compact && (
				<p className="max-w-[260px] text-[13.5px] leading-7 text-white/80">
					{login ? 'با حسابِ Gmail درخواستِ عضویت بدهید؛ بعد از تأییدِ مدیر وارد می‌شوید.' : 'با رمز عبور، کدِ پیامکی یا حسابِ Google وارد شوید.'}
				</p>
			)}
			<button type="button" onClick={() => onSwitch(login ? 'register' : 'login')}
				className="rounded-full border border-white/60 px-6 py-2 text-[13px] font-bold transition hover:bg-card hover:text-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
				{login ? 'ثبت‌نام' : 'ورود'}
			</button>
		</div>
	)
}

/* ---------------- فرمِ ورود ---------------- */
function LoginForm({ google, onLogin, onRegister }: { google: GoogleCfg; onLogin: (s: Session) => void; onRegister: () => void }) {
	const [method, setMethod] = useState<Method>('password')
	const [msg, setMsg] = useState('')
	const [vault, setVault] = useState<string | null>(null) // موبایلی که کدش ارسال شد → صفحهٔ «Secure Vault»
	if (vault) return <Panel><VaultOtp mobile={vault} onLogin={onLogin} onBack={() => setVault(null)} /></Panel>
	return (
		<Panel>
			<img src="/aromin-logo.webp" alt="آرومین" className="mb-1 h-7 w-auto self-center" />
			<h1 className="text-center text-[24px] font-extrabold tracking-tight">خوش آمدید</h1>
			<p className="mb-1 text-center text-[12.5px] text-muted-foreground">به سامانهٔ فروشِ آرومین وارد شوید.</p>

			<div role="tablist" aria-label="روشِ ورود" className="grid grid-cols-2 rounded-xl bg-muted p-1 text-[12.5px] font-bold">
				{([['password', 'رمز عبور'], ['otp', 'کدِ پیامکی']] as [Method, string][]).map(([k, t]) => (
					<button key={k} type="button" role="tab" aria-selected={method === k} onClick={() => { setMethod(k); setMsg('') }}
						className={`h-9 rounded-lg transition ${method === k ? 'bg-card text-primary-ink shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
						{t}
					</button>
				))}
			</div>

			{method === 'password' ? <PasswordForm onLogin={onLogin} setMsg={setMsg} /> : <OtpForm setMsg={setMsg} onSent={setVault} />}
			<p role="alert" className="min-h-[18px] text-center text-[12px] font-semibold text-error">{msg}</p>

			{google.enabled && google.clientId && (
				<>
					<Divider>یا</Divider>
					<GoogleButton clientId={google.clientId} text="signin_with" onCredential={async (c) => {
						const r = await googleSignIn(c)
						if (r.ok) onLogin(r.session)
						else setMsg(r.error)
					}} />
				</>
			)}
			<button type="button" onClick={onRegister} className="mt-1 text-center text-[12.5px] font-bold text-primary-ink underline-offset-4 hover:underline sm:hidden">
				حساب ندارید؟ ثبت‌نام با Gmail
			</button>
		</Panel>
	)
}

function PasswordForm({ onLogin, setMsg }: { onLogin: (s: Session) => void; setMsg: (m: string) => void }) {
	const [user, setUser] = useState('')
	const [pass, setPass] = useState('')
	const [show, setShow] = useState(false)
	const [busy, setBusy] = useState(false)
	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		setMsg('')
		const r = await login(user, pass)
		setBusy(false)
		if (r.ok) onLogin(r.session)
		else setMsg(r.error)
	}
	return (
		<form onSubmit={submit} className="flex flex-col gap-3">
			<Field label="نام کاربری" id="lg-user">
				<input id="lg-user" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required className={inputCls} />
			</Field>
			<Field label="رمز عبور" id="lg-pass">
				<div className="relative">
					<input id="lg-pass" value={pass} onChange={(e) => setPass(e.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" required className={inputCls + ' pl-11'} />
					<button type="button" onClick={() => setShow(!show)} aria-label={show ? 'مخفی‌کردن رمز' : 'نمایش رمز'}
						className="absolute left-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[17px]"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{show && <path d="M4 4l16 16" />}</svg>
					</button>
				</div>
			</Field>
			<PrimaryButton busy={busy}>{busy ? 'در حال بررسی…' : 'ورود'}</PrimaryButton>
		</form>
	)
}

function OtpForm({ setMsg, onSent }: { setMsg: (m: string) => void; onSent: (mobile: string) => void }) {
	const [mobile, setMobile] = useState('')
	const [busy, setBusy] = useState(false)
	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		setMsg('')
		const r = await requestOtp(mobile)
		setBusy(false)
		if (!r.ok) return setMsg(r.error || 'ارسالِ کد ناموفق بود.')
		onSent(normMobile(mobile))
	}
	return (
		<form onSubmit={submit} className="flex flex-col gap-3">
			<Field label="شمارهٔ موبایل" id="lg-mobile">
				<input id="lg-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="0912…" required className={inputCls + ' text-left'} />
			</Field>
			<PrimaryButton busy={busy}>{busy ? 'در حالِ ارسال…' : 'ارسالِ کد'}</PrimaryButton>
		</form>
	)
}

/* ---------------- فرمِ ثبت‌نام (Gmail) ---------------- */
function RegisterForm({ google, onLogin, onBack }: { google: GoogleCfg; onLogin: (s: Session) => void; onBack: () => void }) {
	const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
	return (
		<Panel>
			<h1 className="text-center text-[24px] font-extrabold tracking-tight">ثبت‌نام در آرومین</h1>
			<p className="text-center text-[13px] leading-7 text-muted-foreground">
				با حسابِ Gmail ثبت‌نام کنید. درخواستِ شما برای مدیر فرستاده می‌شود و بعد از تأیید، با همین حساب وارد می‌شوید.
			</p>
			<ol className="my-1 space-y-2 text-[12.5px] text-foreground">
				{['روی «ثبت‌نام با Google» بزنید', 'مدیر درخواست را تأیید و نقشِ شما را تعیین می‌کند', 'از این به بعد با همان دکمه وارد شوید'].map((t, i) => (
					<li key={t} className="flex items-center gap-2">
						<span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-extrabold text-primary-ink">{'۱۲۳'[i]}</span>
						{t}
					</li>
				))}
			</ol>
			{google.enabled && google.clientId ? (
				<GoogleButton clientId={google.clientId} text="signup_with" onCredential={async (c) => {
					const r = await googleSignIn(c)
					if (r.ok) onLogin(r.session)
					else setMsg({ t: r.error, ok: r.pending })
				}} />
			) : (
				<div className="rounded-xl border border-dashed border-border bg-muted p-3 text-center text-[12.5px] leading-6 text-muted-foreground">
					ثبت‌نام با Google هنوز روی سرور فعال نشده است.
				</div>
			)}
			{msg && <p role="status" className={`text-center text-[12.5px] font-semibold ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.t}</p>}
			<button type="button" onClick={onBack} className="mt-1 text-center text-[12.5px] font-bold text-primary-ink underline-offset-4 hover:underline sm:hidden">
				حساب دارید؟ ورود
			</button>
		</Panel>
	)
}

/* ---------------- دکمهٔ رسمیِ Google (Google Identity Services) ---------------- */
type Gsi = { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } }
let gsiLoading: Promise<Gsi | null> | null = null
function loadGsi(): Promise<Gsi | null> {
	const w = window as unknown as { google?: Gsi }
	if (w.google?.accounts?.id) return Promise.resolve(w.google)
	if (!gsiLoading)
		gsiLoading = new Promise((res) => {
			const s = document.createElement('script')
			s.src = 'https://accounts.google.com/gsi/client'
			s.async = true
			s.onload = () => res((window as unknown as { google?: Gsi }).google ?? null)
			s.onerror = () => { gsiLoading = null; res(null) }
			document.head.appendChild(s)
		})
	return gsiLoading
}
function GoogleButton({ clientId, text, onCredential }: { clientId: string; text: 'signin_with' | 'signup_with'; onCredential: (c: string) => void }) {
	const box = useRef<HTMLDivElement>(null)
	const cb = useRef(onCredential)
	useEffect(() => { cb.current = onCredential }, [onCredential])
	const [failed, setFailed] = useState(false)
	useEffect(() => {
		let dead = false
		loadGsi().then((g) => {
			if (dead) return
			if (!g || !box.current) return setFailed(true)
			g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential?: string }) => r.credential && cb.current(r.credential), ux_mode: 'popup', locale: 'fa' })
			g.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', shape: 'pill', text, width: 280, locale: 'fa' })
		})
		return () => { dead = true }
	}, [clientId, text])
	return failed ? (
		<p className="text-center text-[12px] text-muted-foreground">سرویسِ Google در دسترس نیست (اینترنت/فیلتر).</p>
	) : (
		<div ref={box} className="flex min-h-[44px] justify-center" />
	)
}

/* ---------------- اجزا ---------------- */
function Panel({ children }: { children: ReactNode }) {
	return <div className="flex h-full w-full items-center justify-center px-6 py-7 sm:px-10"><div className="flex w-full max-w-[300px] flex-col gap-3">{children}</div></div>
}
function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
	return (
		<label htmlFor={id} className="block">
			<span className="mb-1.5 block text-[11.5px] font-bold text-muted-foreground">{label}</span>
			{children}
		</label>
	)
}
function Divider({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
			<span className="h-px flex-1 bg-border" />
			{children}
			<span className="h-px flex-1 bg-border" />
		</div>
	)
}
function PrimaryButton({ busy, children }: { busy: boolean; children: ReactNode }) {
	return (
		<button type="submit" disabled={busy}
			className="mt-1 h-11 w-full rounded-xl bg-gradient-to-l from-primary to-active text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:translate-y-0 disabled:opacity-60">
			{children}
		</button>
	)
}
const inputCls =
	'h-11 w-full rounded-xl border border-border bg-background/50 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15'
