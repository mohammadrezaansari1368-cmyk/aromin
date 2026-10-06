'use client'

/**
 * دستیارِ عامل — دکمهٔ سه‌بعدی (پایینِ چپ) + پنلِ گفت‌وگو/صدا.
 * گفتار→متن: Web Speech (SpeechRecognition, fa-IR)؛ موجِ صدا از میکروفون با AnalyserNode (بدونِ state در React).
 * متن→گفتار: speechSynthesis (اگر صدای فارسی روی دستگاه نباشد، صادقانه اعلام می‌شود).
 */
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
	clearChat, hasPersianVoice, markVoiceInput, openAgent, send, setFeature, setStatus, stopSpeaking, useAgent, type Msg,
} from '@/lib/agent'
import { isAdmin } from '@/lib/auth'

const SmartAssistant3D = lazy(() => import('./SmartAssistant3D'))

const P = (d: string) => d.split('|').map((x, i) => <path key={i} d={x} />)
const Ico = ({ d, className = 'size-[18px]' }: { d: string; className?: string }) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>{P(d)}</svg>
)
const I = {
	mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
	send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
	x: 'M18 6L6 18|M6 6l12 12',
	vol: 'M11 5L6 9H2v6h4l5 4V5z|M15.5 8.5a5 5 0 0 1 0 7|M19 5a10 10 0 0 1 0 14',
	mute: 'M11 5L6 9H2v6h4l5 4V5z|M23 9l-6 6|M17 9l6 6',
	trash: 'M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6',
	stop: 'M6 6h12v12H6z',
	check: 'M20 6L9 17l-5-5',
	alert: 'M12 9v4|M12 17h.01|M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
	tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
}
const FOCUS = 'outline-none focus-visible:ring-4 focus-visible:ring-focus/30'

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null }
const SRClass = (): (new () => SR) | null => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null

function Bubble({ m }: { m: Msg }) {
	if (m.hidden) return null
	if (m.role === 'tool') {
		const tone = m.tool?.status === 'ok' ? 'text-success bg-success/10' : m.tool?.status === 'denied' ? 'text-warning bg-warning/10' : m.tool?.status === 'cancelled' ? 'text-muted-foreground bg-muted' : 'text-error bg-error/10'
		return (
			<div className="flex justify-center">
				<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold ${tone}`}>
					<Ico d={m.tool?.status === 'ok' ? I.check : m.tool?.status === 'denied' || m.tool?.status === 'error' ? I.alert : I.tool} className="size-3.5" />
					{m.text}
				</span>
			</div>
		)
	}
	if (m.role === 'assistant' && !m.text && !m.streaming) return null
	const me = m.role === 'user'
	return (
		<div className={`flex ${me ? 'justify-start' : 'justify-end'}`}>
			<div className={`max-w-[86%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-7 ${me ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'}`}>
				{m.text}
				{m.streaming && <span className="mr-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current align-middle opacity-60" aria-hidden />}
			</div>
		</div>
	)
}

export default function AgentDock({ role }: { role: string }) {
	const a = useAgent()
	const reduce = useReducedMotion()
	const still = !!reduce || !a.features.agentMotion
	const btn = useRef<HTMLButtonElement>(null)
	const list = useRef<HTMLDivElement>(null)
	const input = useRef<HTMLTextAreaElement>(null)
	const bars = useRef<(HTMLSpanElement | null)[]>([])
	const [text, setText] = useState('')
	const [voiceErr, setVoiceErr] = useState('')
	const rec = useRef<SR | null>(null)
	const meter = useRef<{ stop: () => void } | null>(null)
	const listening = a.status === 'listening'

	useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [a.msgs])
	useEffect(() => {
		if (!a.open) return
		input.current?.focus()
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !a.confirm) { openAgent(false); btn.current?.focus() } }
		window.addEventListener('keydown', esc)
		return () => window.removeEventListener('keydown', esc)
	}, [a.open, a.confirm])

	const stopVoice = () => {
		rec.current?.stop()
		meter.current?.stop()
		meter.current = null
	}
	const startMeter = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			const ctx = new AudioContext()
			const an = ctx.createAnalyser()
			an.fftSize = 64
			ctx.createMediaStreamSource(stream).connect(an)
			const data = new Uint8Array(an.frequencyBinCount)
			let raf = 0
			const loop = () => {
				an.getByteFrequencyData(data)
				bars.current.forEach((el, i) => {
					if (!el) return
					const v = data[2 + i * 3] / 255
					el.style.transform = `scaleY(${0.2 + v * 1.4})`
				})
				raf = requestAnimationFrame(loop)
			}
			loop()
			meter.current = { stop: () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close() } }
		} catch { /* بدونِ دسترسی به میکروفون فقط موجِ نمایشی خاموش می‌ماند */ }
	}
	const toggleVoice = () => {
		setVoiceErr('')
		if (listening) { stopVoice(); return }
		const C = SRClass()
		if (!C) { setVoiceErr('این مرورگر تشخیصِ گفتار ندارد (Chrome یا Edge را امتحان کنید).'); return }
		stopSpeaking()
		const r = new C()
		r.lang = 'fa-IR'
		r.interimResults = true
		r.continuous = false
		let finalText = ''
		r.onresult = (e: any) => {
			let interim = ''
			for (let i = e.resultIndex; i < e.results.length; i++) {
				const s = e.results[i][0].transcript
				if (e.results[i].isFinal) finalText += s
				else interim += s
			}
			setText((finalText + interim).trim())
		}
		r.onerror = (e: any) => setVoiceErr(e?.error === 'not-allowed' ? 'اجازهٔ میکروفون داده نشد.' : e?.error === 'network' ? 'سرویسِ تشخیصِ گفتارِ مرورگر در دسترس نیست (اینترنت/تحریم).' : e?.error === 'no-speech' ? 'صدایی شنیده نشد.' : 'تشخیصِ گفتار ناموفق بود.')
		r.onend = () => {
			meter.current?.stop()
			meter.current = null
			rec.current = null
			setStatus('idle')
			if (finalText.trim()) { markVoiceInput(true); setText(''); send(finalText) }
		}
		rec.current = r
		setStatus('listening')
		r.start()
		startMeter()
	}
	const submit = (e?: FormEvent) => {
		e?.preventDefault()
		const q = text.trim()
		if (!q) return
		setText('')
		markVoiceInput(false)
		send(q)
	}
	const busy = a.status === 'thinking' || a.status === 'tool'
	const suggest = isAdmin(role)
		? ['فروشِ امسال چقدر است؟', 'برو به تنظیمات', 'تم را تیره کن', 'پاسخِ صوتی را روشن کن']
		: ['برو به دفتر فروش', 'پیش‌بینی و بودجه را باز کن', 'تبِ پشتیبانی کجاست؟']

	return (
		<div dir="rtl" className="pointer-events-none fixed bottom-4 left-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:left-6">
			<AnimatePresence>
				{a.open && (
					<motion.section
						role="dialog" aria-modal="false" aria-labelledby="agent-h"
						initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
						transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: 'bottom left' }}
						className="pointer-events-auto relative flex h-[min(640px,calc(100dvh-8rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_30px_80px_-28px_hsl(var(--shadow)/.55)]">
						<header className="flex items-center gap-2 border-b border-border px-4 py-3">
							<div className="min-w-0 flex-1">
								<h2 id="agent-h" className="text-[14px] font-extrabold leading-6">دستیارِ آرومین</h2>
								<p className="truncate text-[11.5px] text-muted-foreground">
									{a.status === 'listening' ? 'در حالِ شنیدن…' : a.status === 'thinking' ? 'در حالِ فکر کردن…' : a.status === 'tool' ? 'در حالِ انجامِ کار…' : a.status === 'speaking' ? 'در حالِ صحبت…' : 'بنویس یا بگو چه کاری انجام بدهم'}
								</p>
							</div>
							<button type="button" onClick={() => { setFeature('voiceReplies', !a.features.voiceReplies); if (a.features.voiceReplies) stopSpeaking() }}
								aria-pressed={a.features.voiceReplies} aria-label="پاسخِ صوتی" title={a.features.voiceReplies ? (hasPersianVoice() ? 'پاسخِ صوتی روشن' : 'پاسخِ صوتی روشن (صدای فارسی روی این دستگاه نیست)') : 'پاسخِ صوتی خاموش'}
								className={`grid size-8 place-items-center rounded-lg transition hover:bg-muted ${a.features.voiceReplies ? 'text-primary-ink' : 'text-muted-foreground'} ${FOCUS}`}>
								<Ico d={a.features.voiceReplies ? I.vol : I.mute} />
							</button>
							<button type="button" onClick={clearChat} aria-label="پاک کردنِ گفت‌وگو" title="پاک کردنِ گفت‌وگو" className={`grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted ${FOCUS}`}><Ico d={I.trash} /></button>
							<button type="button" onClick={() => { openAgent(false); btn.current?.focus() }} aria-label="بستن" className={`grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted ${FOCUS}`}><Ico d={I.x} /></button>
						</header>

						<div ref={list} aria-live="polite" className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
							{a.msgs.length === 0 ? (
								<div className="m-auto flex max-w-[300px] flex-col items-center gap-3 text-center">
									<p className="text-[13px] leading-7 text-muted-foreground">می‌توانم بین تب‌ها جابه‌جایت کنم{isAdmin(role) ? '، عددهای فروش را بخوانم، تم را عوض کنم و با تأییدِ تو یک رکورد را ویرایش کنم' : ''}.</p>
									<div className="flex flex-wrap justify-center gap-1.5">
										{suggest.map((s) => (
											<button key={s} type="button" onClick={() => send(s)} className={`rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold transition hover:bg-muted ${FOCUS}`}>{s}</button>
										))}
									</div>
								</div>
							) : (
								a.msgs.map((m) => <Bubble key={m.id} m={m} />)
							)}
							{busy && (
								<div className="flex justify-end" aria-label="در حالِ فکر کردن">
									<span className="flex gap-1 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3">
										{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: i * 0.12 + 's' }} />)}
									</span>
								</div>
							)}
						</div>

						{a.confirm && (
							<div className="absolute inset-0 z-10 grid place-items-center bg-overlay/40 p-4">
								<div role="alertdialog" aria-labelledby="agent-cf" className="w-full rounded-xl border border-border bg-card p-4 shadow-xl">
									<h3 id="agent-cf" className="text-[13.5px] font-extrabold">{a.confirm.title}</h3>
									<ul className="my-3 space-y-1 text-[12.5px]">{a.confirm.lines.map((l) => <li key={l} className="rounded-lg bg-muted px-2.5 py-1.5 font-semibold">{l}</li>)}</ul>
									<p className="mb-3 text-[11.5px] text-muted-foreground">قبل از نوشتن، از داده بک‌آپ گرفته می‌شود.</p>
									<div className="flex gap-2">
										<button type="button" autoFocus onClick={() => a.confirm?.resolve(true)} className={`h-9 flex-1 rounded-lg bg-primary text-[12.5px] font-bold text-primary-foreground transition hover:bg-hover ${FOCUS}`}>تأیید و ذخیره</button>
										<button type="button" onClick={() => a.confirm?.resolve(false)} className={`h-9 flex-1 rounded-lg border border-border text-[12.5px] font-bold transition hover:bg-muted ${FOCUS}`}>لغو</button>
									</div>
								</div>
							</div>
						)}

						<form onSubmit={submit} className="border-t border-border p-3">
							{a.pageActions.length > 0 && (
								<div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label="اقدام‌های همین صفحه">
									{a.pageActions.map((p) => (
										<button key={p.label} type="button" onClick={p.run} disabled={busy}
											className={`shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-bold text-primary-ink transition hover:bg-primary/15 disabled:opacity-50 ${FOCUS}`}>{p.label}</button>
									))}
								</div>
							)}
							{voiceErr && <p role="alert" className="mb-2 text-[11.5px] font-semibold text-error">{voiceErr}</p>}
							<div className="flex items-end gap-2">
								<button type="button" onClick={toggleVoice} aria-pressed={listening} aria-label={listening ? 'توقفِ شنیدن' : 'گفتن با صدا'}
									className={`relative grid size-10 shrink-0 place-items-center rounded-xl transition ${listening ? 'bg-error text-card' : 'bg-muted text-foreground hover:bg-muted/70'} ${FOCUS}`}>
									{listening ? (
										<span className="flex h-4 items-center gap-[3px]" aria-hidden>
											{[0, 1, 2, 3, 4].map((i) => <span key={i} ref={(el) => { bars.current[i] = el }} className="h-4 w-[3px] origin-center rounded-full bg-current transition-transform duration-75" style={{ transform: 'scaleY(0.3)' }} />)}
										</span>
									) : <Ico d={I.mic} />}
								</button>
								<textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={listening ? 'در حالِ شنیدن…' : 'مثلاً: برو به تنظیمات'}
									onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
									aria-label="پیام به دستیار"
									className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] leading-6 outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15" />
								{a.status === 'speaking' ? (
									<button type="button" onClick={stopSpeaking} aria-label="توقفِ صحبت" className={`grid size-10 shrink-0 place-items-center rounded-xl bg-muted ${FOCUS}`}><Ico d={I.stop} /></button>
								) : (
									<button type="submit" disabled={!text.trim() || busy} aria-label="ارسال" className={`grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:bg-hover disabled:opacity-40 ${FOCUS}`}><Ico d={I.send} className="size-[17px] -scale-x-100" /></button>
								)}
							</div>
						</form>
					</motion.section>
				)}
			</AnimatePresence>

			<button ref={btn} type="button" onClick={() => openAgent(!a.open)} aria-expanded={a.open} aria-label={a.open ? 'بستنِ دستیار' : 'دستیارِ هوشمند'}
				className={`group pointer-events-auto relative size-[72px] rounded-full transition active:scale-95 ${FOCUS}`}>
				{/* هالهٔ وضعیت: فکر/ابزار/شنیدن */}
				<span aria-hidden className={`absolute inset-1 rounded-full bg-primary/25 blur-md transition-opacity duration-300 ${a.status === 'idle' ? 'opacity-0' : 'opacity-100'} ${a.status !== 'idle' && !still ? 'animate-pulse' : ''}`} />
				<Suspense fallback={<span aria-hidden className="absolute inset-2 rounded-full bg-primary shadow-lg" />}>
					<span className="absolute inset-0"><SmartAssistant3D status={a.status} pulse={a.pulse} still={still} anchor={btn} /></span>
				</Suspense>
			</button>
		</div>
	)
}
