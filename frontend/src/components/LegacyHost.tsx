'use client'

/**
 * میزبانِ واحدِ موتورِ اپِ کامل برای تب‌هایی که هنوز بومی نشده‌اند.
 * فقط «یک» نمونه در کلِ اپ (نه یکی برای هر تب) تا دو نسخه از داده هم‌زمان در حافظه نباشد:
 *  - ورود به تب: پیامِ open (در صورتِ نیاز با reload از سرور) → همان پنل با پوستهٔ طراحیِ جدید.
 *  - خروج به تبِ بومی: flush (ذخیرهٔ فوریِ تغییرات) پیش از باز شدنِ تبِ بومی.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Session } from '@/lib/auth'
import { legacyVars, useTheme } from '@/lib/theme'

export interface LegacyHostHandle {
	flush: () => Promise<void>
	/** بعد از نوشتنِ داده از بیرون (مثلاً تأییدِ عضویت): پنلِ فعلی را از سرور تازه کن. */
	reload: () => void
}
type Phase = 'boot' | 'loading' | 'ok' | 'denied' | 'error'

const LegacyHost = forwardRef<LegacyHostHandle, { session: Session; panel: string | null; reload: boolean }>(function LegacyHost({ session, panel, reload }, ref) {
	const frame = useRef<HTMLIFrameElement>(null)
	const [phase, setPhase] = useState<Phase>('boot')
	const [err, setErr] = useState('')
	const [h, setH] = useState(900)
	const authed = useRef(false)
	const [ready, setReady] = useState(false)
	const first = useRef(panel || 'p-inv')
	const cur = useRef<string | null>(null)
	const waits = useRef(new Map<string, (d: Record<string, unknown>) => void>())
	const seq = useRef(0)

	const send = useCallback((m: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(m, location.origin), [])
	const ask = useCallback(
		(m: Record<string, unknown>, ms: number) =>
			new Promise<Record<string, unknown> | null>((res) => {
				const id = 'h' + ++seq.current
				const t = window.setTimeout(() => { waits.current.delete(id); res(null) }, ms)
				waits.current.set(id, (d) => { window.clearTimeout(t); res(d) })
				send({ ...m, id })
			}),
		[send],
	)
	const sendAuth = useCallback(() => send({ aromin: 'auth', user: session.user, pass: session.pass }), [send, session])
	// تمِ رابط کاربری → پوستهٔ اپِ کامل (فقط ظاهر)
	const theme = useTheme()
	const sendTheme = useCallback(() => send({ aromin: 'theme', mode: theme.mode, vars: legacyVars() }), [send, theme])
	useEffect(() => { sendTheme() }, [sendTheme])

	useImperativeHandle(ref, () => ({
		flush: async () => { if (authed.current) await ask({ aromin: 'flush' }, 6000) },
		reload: () => { if (authed.current && cur.current) ask({ aromin: 'open', panel: cur.current, reload: true }, 30000) },
	}), [ask])

	useEffect(() => {
		const onMsg = (ev: MessageEvent) => {
			if (ev.origin !== location.origin || ev.source !== frame.current?.contentWindow) return
			const d = ev.data || {}
			if (d.aromin !== 'embed') return
			if (d.id && waits.current.has(d.id)) { waits.current.get(d.id)!(d); waits.current.delete(d.id) }
			if (d.type === 'ready') { sendTheme(); sendAuth() }
			if (d.type === 'height' && d.h > 200) setH(d.h)
			if (d.type === 'auth') {
				if (authed.current) return
				if (!d.ok) { setErr(d.error || 'ورود ناموفق'); setPhase('error'); return }
				authed.current = true
				cur.current = first.current
				setReady(true)
				setPhase(d.tab === false ? 'denied' : 'ok')
			}
		}
		window.addEventListener('message', onMsg)
		const t = window.setTimeout(() => setPhase((p) => (p === 'boot' ? 'error' : p)), 90000)
		return () => { window.removeEventListener('message', onMsg); window.clearTimeout(t) }
	}, [sendAuth, sendTheme])

	// تغییرِ تب: پنلِ جدید را در همان نمونه باز کن
	useEffect(() => {
		if (!panel || !ready || (panel === cur.current && !reload)) return
		let live = true
		setPhase('loading')
		ask({ aromin: 'open', panel, reload }, 30000).then((d) => {
			if (!live) return
			cur.current = panel
			if (!d) { setErr('پاسخی از موتور نیامد'); setPhase('error'); return }
			setPhase(d.tab === false ? 'denied' : 'ok')
		})
		return () => { live = false }
	}, [panel, reload, ready, ask])

	// تبِ بومی فعال شد ← موتور «پارک» می‌شود (ذخیرهٔ خودکار خاموش) تا نسخهٔ قدیمیِ حافظه‌اش روی ویرایش‌های بومی ننشیند.
	// (پیش از این، AppShell تغییراتِ این موتور را flush کرده است؛ ورودِ دوباره = بارگذاریِ تازه + خروج از پارک)
	useEffect(() => { if (!panel && ready) send({ aromin: 'park' }) }, [panel, ready, send])

	const visible = !!panel
	return (
		<div className={visible ? 'relative' : 'hidden'} aria-hidden={!visible}>
			{(phase === 'boot' || phase === 'loading') && (
				<div className="grid min-h-[320px] place-items-center rounded-[20px] bg-card ring-1 ring-border">
					<div className="flex flex-col items-center gap-3 text-muted-foreground">
						<span className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
						<span className="text-[13px]">در حال بارگذاری…</span>
					</div>
				</div>
			)}
			{(phase === 'denied' || phase === 'error') && (
				<div className="rounded-[20px] bg-card p-6 text-center ring-1 ring-border">
					<p className="text-[14px] font-bold">{phase === 'denied' ? 'این بخش برای نقشِ شما در دسترس نیست.' : 'این بخش باز نشد.'}</p>
					{err && <p className="mt-1 text-[12px] text-error">{err}</p>}
					{phase === 'error' && <button onClick={() => location.reload()} className="mt-3 rounded-xl px-4 py-2 text-[13px] font-bold text-primary-ink ring-1 ring-border hover:bg-muted">تلاشِ دوباره</button>}
				</div>
			)}
			<iframe
				ref={frame}
				src={`/legacy?embed=${encodeURIComponent(first.current)}`}
				title="آرومین"
				onLoad={sendAuth}
				className={`w-full rounded-[20px] border-0 bg-transparent transition-opacity duration-300 ${phase === 'ok' ? 'opacity-100' : 'pointer-events-none absolute inset-x-0 top-0 h-0 opacity-0'}`}
				style={phase === 'ok' ? { height: h } : undefined}
			/>
		</div>
	)
})

export default LegacyHost
