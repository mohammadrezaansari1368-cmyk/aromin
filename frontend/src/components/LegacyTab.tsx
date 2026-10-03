'use client'

/**
 * تبِ جاسازی‌شده از اپِ کامل — دقیقاً همان صفحه و همان موتور (مثلاً پیش‌بینی و بودجه).
 * /legacy?embed=<panel> در قاب؛ ورودِ خودکار با همان حساب؛ ارتفاعِ قاب خودکار.
 */
import { useEffect, useRef, useState } from 'react'
import type { Session } from '@/lib/auth'

type Phase = 'loading' | 'ok' | 'denied' | 'error'

export default function LegacyTab({ panel, session }: { panel: string; session: Session }) {
	const frame = useRef<HTMLIFrameElement>(null)
	const [phase, setPhase] = useState<Phase>('loading')
	const [err, setErr] = useState('')
	const [h, setH] = useState(900)

	const sendAuth = () => {
		frame.current?.contentWindow?.postMessage({ aromin: 'auth', user: session.user, pass: session.pass }, location.origin)
	}

	useEffect(() => {
		const onMsg = (ev: MessageEvent) => {
			if (ev.origin !== location.origin || ev.source !== frame.current?.contentWindow) return
			const d = ev.data || {}
			if (d.aromin !== 'embed' || d.panel !== panel) return
			if (d.type === 'ready') sendAuth()
			if (d.type === 'height' && d.h > 200) setH(d.h)
			if (d.type === 'auth') {
				if (!d.ok) {
					setErr(d.error || 'ورود ناموفق')
					setPhase('error')
				} else setPhase(d.tab === false ? 'denied' : 'ok')
			}
		}
		window.addEventListener('message', onMsg)
		const t = window.setTimeout(() => setPhase((p) => (p === 'loading' ? 'error' : p)), 90000)
		return () => {
			window.removeEventListener('message', onMsg)
			window.clearTimeout(t)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [panel])

	return (
		<div className="relative">
			{phase === 'loading' && (
				<div className="grid min-h-[320px] place-items-center rounded-[20px] bg-card ring-1 ring-border">
					<div className="flex flex-col items-center gap-3 text-muted-foreground">
						<span className="size-8 animate-spin rounded-full border-[3px] border-[#910D6A]/20 border-t-[#910D6A]" />
						<span className="text-[13px]">در حال بارگذاری…</span>
					</div>
				</div>
			)}
			{(phase === 'denied' || phase === 'error') && (
				<div className="rounded-[20px] bg-card p-6 text-center ring-1 ring-border">
					<p className="text-[14px] font-bold text-foreground">
						{phase === 'denied' ? 'این بخش برای نقشِ شما در دسترس نیست.' : 'این بخش باز نشد.'}
					</p>
					{err && <p className="mt-1 text-[12px] text-rose-600">{err}</p>}
					<a href={`/legacy#${panel}`} className="mt-3 inline-block rounded-xl px-4 py-2 text-[13px] font-bold text-[#910D6A] ring-1 ring-border hover:bg-muted">باز کردن در اپِ کامل</a>
				</div>
			)}
			<iframe
				ref={frame}
				src={`/legacy?embed=${encodeURIComponent(panel)}`}
				title={panel}
				onLoad={sendAuth}
				className={`w-full rounded-[20px] border-0 bg-transparent transition-opacity duration-300 ${phase === 'ok' ? 'opacity-100' : 'pointer-events-none absolute inset-x-0 top-0 h-0 opacity-0'}`}
				style={phase === 'ok' ? { height: h } : undefined}
			/>
		</div>
	)
}
