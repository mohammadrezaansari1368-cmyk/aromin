'use client'

/**
 * ورود با کدِ پیامکی — الگوی «Secure Vault Access» از STEA Code Drop #004 (MIT).
 * همان صحنه‌ها: خانه‌های رقم → پرشِ مداری → حلقهٔ بارگذاری با درصد → انفجارِ موفقیت / لرزشِ خطا → ارسالِ دوباره.
 * تفاوت‌ها با نمونه: ۶ رقم (کدِ نبض‌کار)، تأییدِ واقعی با /api/otp/verify (نه تصادفیِ نمونه)، فارسی/تم.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { requestOtp, verifyOtp, type Session } from '@/lib/auth'
import './vault.css'

const LEN = 6
const ORBIT_MS = 1600 + 180
const RESEND_S = 60
type Phase = 'idle' | 'orbit' | 'loading' | 'success' | 'error'
const faNum = (s: string | number) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const toLat = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const TEXT = {
	idle: ['کدِ دسترسی را وارد کنید', ''],
	loading: ['در حالِ بررسی…', 'کد را به‌صورتِ امن بررسی می‌کنیم.'],
	success: ['دسترسی تأیید شد', 'خوش آمدید؛ در حالِ ورود…'],
	error: ['تأیید ناموفق بود', 'کدی که وارد کردید درست نیست.'],
}
const CONFETTI = ['hsl(var(--success))', '#34d399', '#910D6A', '#004991', '#FCBF00', 'hsl(var(--primary))', '#f472b6', '#22d3ee']
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p) } catch { /* */ } }
const now = () => performance.now()
/** ۲۴ ذرهٔ جشن در جهت‌های تصادفی (همان پارامترهای نمونه) — فقط در لحظهٔ موفقیت ساخته می‌شود */
function makeConfetti(): CSSProperties[] {
	const out: CSSProperties[] = []
	for (let i = 0; i < 24; i++) {
		const a = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.25
		const d = 90 + Math.random() * 70
		const size = 6 + Math.random() * 10
		const c = CONFETTI[i % CONFETTI.length]
		out.push({ background: c, boxShadow: `0 0 12px ${c}`, width: size, height: size, animationDelay: `${0.1 + Math.random() * 0.15}s`,
			borderRadius: i % 4 === 0 ? 2 : i % 4 === 1 ? '50% 0 50% 0' : '50%', ['--cx' as string]: `${Math.cos(a) * d}px`, ['--cy' as string]: `${Math.sin(a) * d}px` })
	}
	return out
}

export default function VaultOtp({ mobile, onLogin, onBack }: { mobile: string; onLogin: (s: Session) => void; onBack: () => void }) {
	const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''))
	const [phase, setPhase] = useState<Phase>('idle')
	const [pct, setPct] = useState(0)
	const [err, setErr] = useState('')
	const [shake, setShake] = useState(false)
	const [left, setLeft] = useState(RESEND_S)
	const [resending, setResending] = useState(false)
	const [confetti, setConfetti] = useState<CSSProperties[]>([])
	const [titleKey, setTitleKey] = useState<keyof typeof TEXT>('idle')
	const inputs = useRef<(HTMLInputElement | null)[]>([])
	const card = useRef<HTMLDivElement>(null)
	const light = useRef<HTMLDivElement>(null)
	const timers = useRef<number[]>([])
	const raf = useRef(0)
	const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }
	const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(raf.current) }
	useEffect(() => () => clearAll(), [])
	useEffect(() => { const t = window.setTimeout(() => inputs.current[0]?.focus(), 300); return () => clearTimeout(t) }, [])
	useEffect(() => {
		if (left <= 0) return
		const t = window.setTimeout(() => setLeft((l) => l - 1), 1000)
		return () => clearTimeout(t)
	}, [left])

	const masked = mobile.length >= 11 ? mobile.slice(0, 4) + '•••' + mobile.slice(-4) : mobile
	const sub = titleKey === 'idle' ? `کدِ ${faNum(LEN)} رقمی به ⁦${faNum(masked)}⁩ پیامک شد.` /* LRI…PDI: شماره در متنِ راست‌به‌چپ برعکس نشود */ : titleKey === 'error' && err ? err : TEXT[titleKey][1]

	const reset = useCallback((focus = true) => {
		clearAll()
		setPhase('idle'); setTitleKey('idle'); setErr(''); setShake(false); setPct(0); setConfetti([])
		setDigits(Array(LEN).fill(''))
		if (focus) window.setTimeout(() => inputs.current[0]?.focus(), 30)
	}, [])

	const splash = () => setConfetti(makeConfetti())

	const verify = (code: string) => {
		if (phase === 'orbit' || phase === 'loading' || phase === 'success') return
		clearAll()
		setPhase('orbit')
		const t0 = now()
		// درخواستِ واقعی همان لحظه شروع می‌شود؛ انیمیشن فقط منتظرش می‌ماند
		const result = verifyOtp(mobile, code).catch(() => ({ ok: false as const, error: 'به سرور وصل نشدم.' }))
		later(() => {
			setPhase('loading'); setTitleKey('loading')
			const start = now()
			let done: Awaited<typeof result> | null = null
			result.then((r) => { done = r })
			const tick = (now: number) => {
				const p = Math.min((now - start) / 2000, 1)
				const eased = 1 - Math.pow(1 - p, 2.2)
				const ready = done && now - start > 600
				setPct(ready ? 100 : Math.round(eased * 90))
				if (ready) {
					const r = done!
					if (r.ok) {
						setPhase('success'); vibrate([30, 40, 60]); splash()
						later(() => setTitleKey('success'), 250)
						later(() => onLogin(r.session), 1900) // نشانِ «تأیید شد» در ۱٫۲ثانیه ظاهر می‌شود؛ کمی بماند
					} else {
						setPhase('error'); setErr(r.error || TEXT.error[1]); setTitleKey('error'); vibrate([20, 60, 20])
						setShake(true); later(() => setShake(false), 500)
						later(() => reset(true), 2000) // برخلافِ نمونه: فوکوس برمی‌گردد تا کاربر بلافاصله دوباره بنویسد
					}
					return
				}
				raf.current = requestAnimationFrame(tick)
			}
			raf.current = requestAnimationFrame(tick)
		}, Math.max(0, ORBIT_MS - (now() - t0)))
	}

	const setFrom = (i: number, raw: string) => {
		if (phase === 'orbit' || phase === 'loading' || phase === 'success') return
		if (phase === 'error') reset(false)
		const v = toLat(raw).replace(/\D/g, '')
		const next = phase === 'error' ? Array(LEN).fill('') : [...digits]
		if (v.length > 1) { // چسباندن / پرکردنِ خودکارِ کدِ پیامک
			for (let k = 0; k < LEN; k++) next[k] = v[k] || ''
			setDigits(next)
			const full = next.join('')
			if (full.length === LEN) { vibrate(15); inputs.current[LEN - 1]?.blur(); verify(full) } else inputs.current[Math.min(v.length, LEN - 1)]?.focus()
			return
		}
		next[i] = v
		setDigits(next)
		if (v) {
			vibrate(15)
			if (i < LEN - 1) inputs.current[i + 1]?.focus()
			else if (next.every(Boolean)) verify(next.join(''))
		}
	}

	const resend = async () => {
		if (left > 0 || resending) return
		setResending(true)
		const r = await requestOtp(mobile)
		setResending(false)
		if (r.ok) { reset(true); setLeft(RESEND_S) } else { setErr(r.error || 'ارسالِ دوباره ناموفق بود.'); setTitleKey('error') }
	}

	const orbitNodes = digits.map((d, i) => {
		const a = (i / LEN) * Math.PI * 2 - Math.PI / 2
		return { d, style: { ['--dx' as string]: `${Math.cos(a) * 70}px`, ['--dy' as string]: `${Math.sin(a) * 70}px`, animationDelay: `${i * 60}ms` } as CSSProperties }
	})

	return (
		<div ref={card} dir="rtl" className={`va-card ${shake ? 'va-shake' : ''} ${phase === 'success' ? 'va-success-tint' : ''}`}
			onPointerMove={(e) => {
				if (e.pointerType !== 'mouse' || !light.current || !card.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
				const r = card.current.getBoundingClientRect()
				light.current.style.opacity = '1'; light.current.style.left = `${e.clientX - r.left}px`; light.current.style.top = `${e.clientY - r.top}px`
			}}
			onPointerLeave={() => { if (light.current) light.current.style.opacity = '0' }}>
			<div ref={light} className="va-pointer" aria-hidden />
			<div className="va-noise" aria-hidden />
			<div aria-live="polite">
				<h1 className="va-title">{TEXT[titleKey][0]}</h1>
				<p className="va-sub">{sub}</p>
			</div>

			<div className="va-stage">
				<div dir="ltr" role="group" aria-label="کدِ تأیید" className={`va-inputs ${phase !== 'idle' && phase !== 'error' ? 'va-hidden' : ''}`} style={phase === 'loading' || phase === 'success' ? { display: 'none' } : undefined}>
					{digits.map((d, i) => (
						<input key={i} ref={(el) => { inputs.current[i] = el }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
							aria-label={`رقمِ ${faNum(i + 1)}`} maxLength={i === 0 ? LEN : 1}
							className={`va-pill ${d ? 'va-filled' : ''} ${phase === 'error' ? 'va-error' : ''}`}
							onChange={(e) => {
								const v = toLat(e.target.value).replace(/\D/g, '')
								// خانهٔ اول چند رقم می‌پذیرد (پرکردنِ خودکارِ کدِ پیامک)؛ اگر فقط یک رقم به رقمِ قبلی اضافه شد، همان رقمِ تازه
								setFrom(i, i === 0 && d && v.length === 2 ? v.slice(-1) : v)
							}}
							onKeyDown={(e) => { if (e.key === 'Backspace') { if (phase === 'error') reset(false); if (!d && i > 0) inputs.current[i - 1]?.focus() } }}
							onFocus={(e) => { if (phase === 'error') reset(false); e.target.select() }}
							onPaste={(e) => { const t = e.clipboardData.getData('text'); if (toLat(t).replace(/\D/g, '').length > 1) { e.preventDefault(); setFrom(0, t) } }} />
					))}
				</div>

				<div className={`va-orbit ${phase === 'orbit' ? 'va-active' : ''}`} aria-hidden>
					<div className={`va-ring ${phase === 'orbit' ? 'va-spin' : ''}`}>
						{phase === 'orbit' && orbitNodes.map((n, i) => <div key={i} className="va-node va-fly" style={n.style}>{n.d}</div>)}
					</div>
				</div>

				<div className={`va-loading ${phase === 'loading' ? 'va-active' : ''}`} role={phase === 'loading' ? 'status' : undefined} aria-label={phase === 'loading' ? `در حالِ بررسی، ${faNum(pct)} درصد` : undefined}>
					{phase === 'loading' && (
						<div className="va-core">
							<div className="va-lring" />
							<div className="va-lpulse" />
							<div className="va-linner">{faNum(pct)}</div>
						</div>
					)}
				</div>

				<div className={`va-success ${phase === 'success' ? 'va-active' : ''}`} aria-hidden={phase !== 'success'}>
					<div className="va-flash" />
					<div className="va-bubble" />
					<div className="va-bubble" />
					<div className="va-bubble" />
					{confetti.map((s, i) => <div key={i} className="va-confetti" style={s} />)}
					{phase === 'success' && (
						<div className="va-vault"><svg className="va-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg></div>
					)}
					<div className="va-badge">تأیید شد</div>
				</div>
			</div>

			<div className={`va-err ${phase === 'error' ? 'va-show' : ''}`} role="alert">{phase === 'error' ? 'کد را دوباره وارد کنید.' : ''}</div>

			{phase !== 'success' && (
				<button type="button" className="va-resend" onClick={resend} disabled={left > 0 || resending}>
					کد را دریافت نکردید؟<span>{resending ? 'در حالِ ارسال…' : left > 0 ? `ارسالِ دوباره (${faNum(left)})` : 'ارسالِ دوباره'}</span>
				</button>
			)}
			{phase !== 'success' && (
				<button type="button" onClick={onBack} className="va-resend" style={{ marginTop: 0 }}>تغییرِ شمارهٔ موبایل</button>
			)}
		</div>
	)
}
