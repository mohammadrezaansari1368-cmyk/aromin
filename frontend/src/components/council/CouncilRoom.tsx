/**
 * «اتاق شورا» (3.9.71) — بومی‌سازیِ Roast Room (MIT، github.com/nateherkai/roast-room): صندلی‌های مشاور دورِ میز دربارهٔ یک تصمیم حرف می‌زنند
 * (قاب‌های دهان و پلک مثلِ نسخهٔ اصلی) و ایجنتِ «تحلیل و کوچینگ فروش» رئیسِ جلسه است و رأی می‌دهد.
 * «دانشنامه»: مدخل‌های هر صندلی (مجموعهٔ council در پایگاه دانش)؛ صندلیِ بی‌دانشنامه نمی‌نشیند. فقط مدیر.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Seat = { key: string; name: string; short: string; initials: string; pillar: string; question: string; color: string; brain: boolean; ready: boolean; portrait: boolean; entries: { id: string; filename: string; chars: number }[] }
type Card = { seat: string; ok: boolean; stance?: string; score?: number; line?: string; why?: string[]; error?: string }
type Verdict = { ok: boolean; label?: string; call?: string; carried?: string[]; dissent?: string; next?: string[]; error?: string }
type Result = { cards: Card[]; verdict: Verdict; skipped: string[] }
type Shape = 'base' | 'open' | 'mid' | 'blink'

async function api<T>(session: Session, path: string, body?: unknown, method?: string): Promise<T> {
	const r = await fetch(path + (path.includes('?') ? '&' : '?') + 'tenant=' + encodeURIComponent(currentTenant()),
		{ method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' })
	const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
	if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
	return j as T
}

/** دهان برای هر واژهٔ فارسی/لاتین: مصوت‌های باز → open، و/او → mid، لب‌ها (ب م پ ف) → base */
export function shapesFor(word: string): Shape[] {
	const out: Shape[] = []
	for (const ch of word.toLowerCase()) {
		const s: Shape | null = 'اآعaei'.includes(ch) ? 'open' : 'ویouwy'.includes(ch) ? 'mid' : 'بمپفmbpf'.includes(ch) ? 'base' : null
		if (s && s !== out[out.length - 1]) out.push(s)
	}
	return out.length ? out : ['mid']
}

/** نیم‌تنهٔ کشیده‌شده (صندلی‌های بی‌پرتره) — همان طرحِ نسخهٔ اصلی با دهان و پلکِ متحرک */
function DrawnBust({ seat, shape }: { seat: Seat; shape: Shape }) {
	const eyes = shape === 'blink'
		? <path d="M226 250h30M304 250h30" stroke="#1d2733" strokeWidth="7" strokeLinecap="round" />
		: <><circle cx="241" cy="250" r="11" fill="#1d2733" /><circle cx="319" cy="250" r="11" fill="#1d2733" /></>
	const mouth = shape === 'open' ? <ellipse cx="280" cy="318" rx="24" ry="17" fill="#5a2430" />
		: shape === 'mid' ? <ellipse cx="280" cy="316" rx="20" ry="8" fill="#5a2430" />
			: <path d="M256 312q24 16 48 0" fill="none" stroke="#5a2430" strokeWidth="7" strokeLinecap="round" />
	return (
		<svg viewBox="0 0 560 560" className="size-full" aria-hidden="true"><g transform="translate(-14 -64) scale(1.05)">
			<path d="M70 640c0-160 86-250 210-250s210 90 210 250z" fill={seat.color} />
			<rect x="248" y="330" width="64" height="70" rx="22" fill="#d9b49a" />
			<ellipse cx="280" cy="250" rx="112" ry="128" fill="#e8c4a8" />
			<path d="M168 236c0-90 50-122 112-122s112 32 112 122c-20-46-60-64-112-64s-92 18-112 64z" fill="#3a4654" />
			{eyes}{mouth}
			<text x="280" y="545" textAnchor="middle" fontWeight="800" fontSize="64" fill="rgba(255,255,255,.92)">{seat.initials}</text>
		</g></svg>
	)
}

function Bust({ seat, shape }: { seat: Seat; shape: Shape }) {
	if (!seat.portrait) return <DrawnBust seat={seat} shape={shape} />
	return (
		<div className="relative size-full">{(['base', 'open', 'mid', 'blink'] as Shape[]).map((s) => (
			<img key={s} src={`/council/${seat.key}-${s}.webp`} alt="" draggable={false} className={`absolute inset-0 size-full object-contain transition-none ${s === shape ? 'opacity-100' : 'opacity-0'}`} />
		))}</div>
	)
}

const STANCE: Record<string, string> = { موافق: 'text-success', مخالف: 'text-error', مشروط: 'text-warning' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function CouncilRoom({ session }: { session: Session }) {
	const [seats, setSeats] = useState<Seat[]>([])
	const [chair, setChair] = useState('')
	const [pick, setPick] = useState<string[]>([])
	const [view, setView] = useState<'room' | 'kb'>('room')
	const [question, setQuestion] = useState('')
	const [busy, setBusy] = useState(false)
	const [err, setErr] = useState('')
	const [res, setRes] = useState<Result | null>(null)
	const [shapes, setShapes] = useState<Record<string, Shape>>({})
	const [speaker, setSpeaker] = useState<string | null>(null)
	const [said, setSaid] = useState<{ seat: string; words: string[]; n: number } | null>(null)
	const [done, setDone] = useState(false)
	const skip = useRef(false)

	const load = useCallback(() => api<{ seats: Seat[]; default: string[]; chair: string }>(session, '/api/council/seats').then((j) => {
		setSeats(j.seats); setChair(j.chair)
		setPick((p) => (p.length ? p : j.default.filter((k) => j.seats.find((s) => s.key === k)?.ready)))
	}, (e) => setErr((e as Error).message)), [session])
	useEffect(() => { load() }, [load])

	// پلک زدنِ گاه‌به‌گاه تا اتاق زنده باشد
	useEffect(() => {
		if (reduced()) return
		const t = setInterval(() => {
			const k = pick[Math.floor(Math.random() * pick.length)]
			if (!k || k === speaker) return
			setShapes((s) => ({ ...s, [k]: 'blink' })); setTimeout(() => setShapes((s) => ({ ...s, [k]: 'base' })), 140)
		}, 1400)
		return () => clearInterval(t)
	}, [pick, speaker])

	const by = (k: string) => seats.find((s) => s.key === k)
	const table = pick.map(by).filter(Boolean) as Seat[]

	const play = async (r: Result) => {
		skip.current = reduced()
		for (const c of r.cards.filter((x) => x.ok && x.line)) {
			const words = c.line!.split(/\s+/).filter(Boolean)
			setSpeaker(c.seat)
			for (let i = 0; i < words.length; i++) {
				if (skip.current) break
				setSaid({ seat: c.seat, words, n: i + 1 })
				const sh = shapesFor(words[i].replace(/[^\p{L}]/gu, ''))
				const per = Math.max(170, words[i].length * 60) / (sh.length + 1)
				for (const x of sh) { setShapes((s) => ({ ...s, [c.seat]: x })); await sleep(per) }
				setShapes((s) => ({ ...s, [c.seat]: 'base' })); await sleep(per + (/[.!؟?]$/.test(words[i]) ? 320 : 40))
			}
			setSaid({ seat: c.seat, words, n: words.length }); setShapes((s) => ({ ...s, [c.seat]: 'base' }))
			if (!skip.current) await sleep(900)
		}
		setSpeaker(null); setDone(true)
	}

	const ask = async () => {
		setBusy(true); setErr(''); setRes(null); setDone(false); setSaid(null)
		try {
			const r = await api<Result>(session, '/api/council/ask', { question: question.trim(), seats: pick })
			setRes(r); setBusy(false); await play(r)
		} catch (e) { setErr((e as Error).message); setBusy(false) }
	}

	const toggle = (k: string) => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 7 ? [...p, k] : p))

	return (
		<section dir="rtl" className={`flex flex-col gap-4 ${CARD} ${CARD_PAD}`} data-testid="council">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<div><h2 className={CARD_TITLE}>اتاق شورا</h2><p className={CARD_SUB}>رئیسِ جلسه: {chair || 'ایجنتِ کوچ'} · شبیه‌سازی از منابعِ عمومی، نه خودِ اشخاص.</p></div>
				<div className="flex gap-1 rounded-full bg-muted p-1 text-[12.5px]">
					{(['room', 'kb'] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? 'bg-card font-semibold shadow-card' : 'text-muted-foreground'}`}>{v === 'room' ? 'جلسه' : 'دانشنامه'}</button>)}
				</div>
			</header>
			{err && <p role="alert" className="text-[12.5px] text-error">{err}</p>}

			{view === 'room' ? (<>
				<div className="relative overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top,#2b2f3a,#0d0f14)] px-3 pb-4 pt-6" data-testid="council-stage">
					<div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-4">
						{table.map((s) => {
							const on = speaker === s.key
							return (
								<figure key={s.key} className={`flex w-[92px] flex-col items-center gap-1 transition duration-300 ${speaker && !on ? 'opacity-55' : ''} ${on ? 'scale-110' : ''}`} data-seat={s.key}>
									<div className={`size-[84px] overflow-hidden rounded-full bg-black/30 ring-2 ${on ? 'ring-white' : 'ring-white/10'}`}><Bust seat={s} shape={shapes[s.key] || 'base'} /></div>
									<figcaption className="text-center leading-tight"><b className="block text-[12px] text-white">{s.short}</b><span className="text-[10.5px] text-white/55">{s.pillar}</span></figcaption>
								</figure>
							)
						})}
					</div>
					<div className="mx-auto mt-4 h-3 w-4/5 rounded-full bg-gradient-to-b from-[#6b4a2f] to-[#3c2a1b] shadow-[0_8px_20px_rgba(0,0,0,.5)]" aria-hidden="true" />
					<div className="mt-4 min-h-14 rounded-xl bg-white/5 px-4 py-3 text-[14px] leading-7 text-white" aria-live="polite" data-testid="council-caption">
						{said ? <><b className="ml-2 text-white/70">{by(said.seat)?.short}:</b>{said.words.map((w, i) => <span key={i} className={i < said.n ? '' : 'opacity-25'}>{w} </span>)}</>
							: <span className="text-white/45">{busy ? 'صندلی‌ها فکر می‌کنند…' : 'تصمیم را بنویسید تا شورا شروع کند.'}</span>}
					</div>
					{res && !done && <button type="button" className="absolute left-3 top-3 rounded-full bg-white/10 px-3 py-1 text-[11.5px] text-white" onClick={() => { skip.current = true }}>رد کردن</button>}
				</div>

				<div className="flex flex-wrap gap-1.5" aria-label="صندلی‌ها">{seats.map((s) => (
					<button key={s.key} type="button" disabled={!s.ready || busy} onClick={() => toggle(s.key)} title={s.ready ? s.question : 'دانشنامه خالی است'}
						className={`rounded-full px-3 py-1 text-[12px] transition ${pick.includes(s.key) ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'} disabled:opacity-40`}>{s.short}{!s.ready && ' ·خالی'}</button>
				))}</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<textarea className={`${INPUT} min-h-20 py-2`} maxLength={2000} placeholder="تصمیم، گزینه‌ها، عددها و تمایلِ خودتان…" aria-label="تصمیم" value={question} onChange={(e) => setQuestion(e.target.value)} />
					<button type="button" className={`${BTN_PRIMARY} sm:self-end`} disabled={busy || question.trim().length < 8 || pick.length < 2} onClick={ask}>{busy ? 'در جلسه…' : 'شروعِ شورا'}</button>
				</div>

				{res && done && (
					<div className="grid gap-3" data-testid="council-verdict">
						{res.verdict.ok ? (
							<div className="rounded-2xl bg-muted/60 p-4">
								<div className="flex flex-wrap items-baseline gap-2"><b className="text-[17px]">{res.verdict.label}</b><span className="text-[13.5px]">{res.verdict.call}</span></div>
								{!!res.verdict.carried?.length && <ul className="mt-2 list-disc pr-5 text-[12.5px]">{res.verdict.carried.map((x, i) => <li key={i}>{x}</li>)}</ul>}
								{res.verdict.dissent && <p className="mt-1 text-[12.5px] text-muted-foreground">مخالفت: {res.verdict.dissent}</p>}
								{!!res.verdict.next?.length && <ol className="mt-2 list-decimal pr-5 text-[12.5px] font-semibold">{res.verdict.next.map((x, i) => <li key={i}>{x}</li>)}</ol>}
							</div>
						) : <p className="text-[12.5px] text-error">رأیِ رئیس: {res.verdict.error}</p>}
						<div className="grid gap-2 sm:grid-cols-2">{res.cards.filter((c) => c.ok).map((c) => (
							<div key={c.seat} className="rounded-xl bg-muted/40 p-3 text-[12.5px]">
								<b>{by(c.seat)?.short}</b> <span className={STANCE[c.stance || ''] || ''}>{c.stance} · {c.score}/10</span>
								<p className="mt-1">{c.line}</p>
							</div>
						))}</div>
						{!!res.skipped.length && <p className="text-[12px] text-muted-foreground">ننشستند (دانشنامه خالی): {res.skipped.map((k) => by(k)?.short).join('، ')}</p>}
					</div>
				)}
			</>) : <Encyclopedia session={session} seats={seats} reload={load} />}
		</section>
	)
}

function Encyclopedia({ session, seats, reload }: { session: Session; seats: Seat[]; reload: () => void }) {
	const [open, setOpen] = useState<string | null>(null)
	const [text, setText] = useState('')
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState('')
	const run = async (fn: () => Promise<unknown>) => { setBusy(true); setMsg(''); try { await fn(); reload() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
	const addText = (seat: string) => run(async () => { await api(session, '/api/council/knowledge', { seat, text }); setText('') })
	const addFile = (seat: string, f: File) => run(async () => {
		const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''
		for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
		await api(session, '/api/council/knowledge', { seat, filename: f.name, data: btoa(bin) })
	})
	const del = (id: string) => { if (window.confirm('این مدخل حذف شود؟')) run(() => api(session, '/api/knowledge/' + encodeURIComponent(id), undefined, 'DELETE')) }
	return (
		<div className="grid gap-2" data-testid="council-kb">
			{msg && <p role="alert" className="text-[12.5px] text-error">{msg}</p>}
			{seats.map((s) => (
				<div key={s.key} className="rounded-xl bg-muted/40 p-3">
					<button type="button" className="flex w-full items-center gap-3 text-right" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}>
						<span className="size-10 shrink-0 overflow-hidden rounded-full bg-black/20"><Bust seat={s} shape="base" /></span>
						<span className="min-w-0 flex-1"><b className="text-[13.5px]">{s.name}</b><span className="block truncate text-[12px] text-muted-foreground">{s.pillar}</span></span>
						<span className={`text-[11.5px] ${s.ready ? 'text-success' : 'text-muted-foreground'}`}>{s.brain ? 'مغزِ آماده' : ''}{s.entries.length ? ` · ${s.entries.length} مدخل` : s.brain ? '' : 'خالی'}</span>
					</button>
					{open === s.key && (
						<div className="mt-3 grid gap-2">
							{s.entries.map((e) => <div key={e.id} className="flex items-center gap-2 text-[12px]"><span className="flex-1 truncate">{e.filename}</span><span className="text-muted-foreground">{e.chars.toLocaleString('fa-IR')} نویسه</span><button type="button" className={BTN_DANGER} disabled={busy} onClick={() => del(e.id)}>حذف</button></div>)}
							<textarea className={`${INPUT} min-h-20 py-2`} placeholder="متنِ سخنرانی، کتاب، مصاحبه یا یادداشت دربارهٔ این شخص…" aria-label={'متنِ دانشنامهٔ ' + s.short} value={text} onChange={(e) => setText(e.target.value)} />
							<div className="flex flex-wrap gap-2">
								<button type="button" className={BTN_PRIMARY} disabled={busy || text.trim().length < 20} onClick={() => addText(s.key)}>افزودنِ متن</button>
								<label className={`${BTN_GHOST} cursor-pointer`}>بارگذاریِ فایل<input type="file" hidden accept=".txt,.md,.pdf,.docx,.html,.csv,.json" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(s.key, f); e.target.value = '' }} /></label>
							</div>
						</div>
					)}
				</div>
			))}
		</div>
	)
}
