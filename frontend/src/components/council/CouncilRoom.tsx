/**
 * «Council Room» (3.9.75) — the Roast Room UI (MIT, github.com/nateherkai/roast-room) rebuilt in React with its own markup and styles
 * (council.css): top bar + stepper, the stage with seats behind the table edge, nameplates, spotlight, word-by-word captions,
 * playback speed / skip, the «Key points» feed and the verdict sheet. The table is a turning Earth (Globe.tsx).
 * Seats speak from their brain or the «Library» (KB collection council); the coach agent chairs and writes the verdict. Managers only.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import Globe from './Globe'
import './council.css'

type Seat = { key: string; name: string; short: string; initials: string; pillar: string; question: string; color: string; brain: boolean; ready: boolean; portrait: boolean; entries: { id: string; filename: string; chars: number }[] }
type Card = { seat: string; ok: boolean; stance?: string; score?: number; line?: string; why?: string[]; frameworks?: string[]; math?: string; risk?: string; test?: string; model?: string; error?: string }
type Verdict = { ok: boolean; label?: string; call?: string; carried?: string[]; dissent?: string; conditions?: string[]; kill?: string; next?: string[]; model?: string; error?: string }
type Result = { cards: Card[]; verdict: Verdict; skipped: string[] }
type Shape = 'base' | 'open' | 'mid' | 'blink'
type Geo = Record<string, { x: number; head: number; size: number; plate: number; top: number }>

async function api<T>(session: Session, path: string, body?: unknown, method?: string): Promise<T> {
	const r = await fetch(path + (path.includes('?') ? '&' : '?') + 'tenant=' + encodeURIComponent(currentTenant()),
		{ method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' })
	const j = await r.json().catch(() => ({ ok: false, error: 'Invalid response (' + r.status + ')' }))
	if (!r.ok || j.ok === false) throw new Error(j.error || 'Error ' + r.status)
	return j as T
}

/** Persian visemes (Latin as a fallback): open ا آ ع and a final ه · round و ؤ ُ and wide ی ئ → mid · lips ب پ م ف → base.
 * Other consonants add no shape; diacritics and ZWNJ are stripped first (damma ُ counts as round). Repeats collapse. */
export function shapesFor(word: string): Shape[] {
	const w = word.toLowerCase().replace(/‌/g, '').replace(/[ً-َِ-ْٰ]/g, '')
	const out: Shape[] = []
	Array.from(w).forEach((ch, i, all) => {
		const s: Shape | null = 'اآعaei'.includes(ch) || (ch === 'ه' && i === all.length - 1) ? 'open'
			: 'وؤُیئouwy'.includes(ch) ? 'mid' : 'بپمفbmpf'.includes(ch) ? 'base' : null
		if (s && s !== out[out.length - 1]) out.push(s)
	})
	return out.length ? out : ['mid']
}
/** Pause after a word that ends a clause */
export const pauseAfter = (word: string) => (/[.!؟?،]$/.test(word) ? 340 : /[؛:]$/.test(word) ? 170 : 25)
const ORDER_KEY = 'aromin.council.order'
/** Dr. Alavi always sits in the middle of the table (3.9.80) */
export const pinAlavi = <T,>(xs: T[], key: (x: T) => string): T[] => {
	const i = xs.findIndex((x) => key(x) === 'alavi')
	if (i < 0) return xs
	const rest = xs.filter((_, j) => j !== i)
	rest.splice(Math.floor(rest.length / 2), 0, xs[i])
	return rest
}
const readOrder = (): string[] => { try { const v = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const saveOrder = (v: string[]) => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(v)) } catch { /* private mode */ } }

/** The original's drawn bust for a seat without a portrait — moving eyes and mouth in the seat's colour. */
function DrawnBust({ seat, shape, cls }: { seat: Seat; shape: Shape; cls: string }) {
	const eyes = shape === 'blink' ? <path d="M226 250h30M304 250h30" stroke="#1d2733" strokeWidth="7" strokeLinecap="round" />
		: <><circle cx="241" cy="250" r="11" fill="#1d2733" /><circle cx="319" cy="250" r="11" fill="#1d2733" /><circle cx="245" cy="246" r="3.5" fill="#fff" /><circle cx="323" cy="246" r="3.5" fill="#fff" /></>
	const mouth = shape === 'open' ? <ellipse cx="280" cy="318" rx="24" ry="17" fill="#5a2430" /> : shape === 'mid' ? <ellipse cx="280" cy="316" rx="20" ry="8" fill="#5a2430" />
		: <path d="M256 312q24 16 48 0" fill="none" stroke="#5a2430" strokeWidth="7" strokeLinecap="round" />
	return (
		<svg className={cls} viewBox="0 0 560 560"><g transform="translate(-14 -64) scale(1.05)">
			<path d="M70 640c0-160 86-250 210-250s210 90 210 250z" fill={seat.color} /><path d="M232 384h96l-48 58z" fill="#e9eef3" />
			<rect x="248" y="330" width="64" height="70" rx="22" fill="#d9b49a" /><ellipse cx="280" cy="250" rx="112" ry="128" fill="#e8c4a8" />
			<path d="M168 236c0-90 50-122 112-122s112 32 112 122c-20-46-60-64-112-64s-92 18-112 64z" fill="#3a4654" />{eyes}{mouth}
			<text x="280" y="540" textAnchor="middle" fontWeight="800" fontSize="54" fill="rgba(255,255,255,.92)">{seat.initials}</text></g></svg>
	)
}
const FRAMES: Record<string, Shape[]> = {}          // seats with talking frames on disk (the original twelve)
for (const k of ['bezos', 'graham', 'garyvee', 'martell', 'buffett', 'musk', 'alavi', 'sadeghin', 'raftari']) FRAMES[k] = ['base', 'open', 'mid', 'blink']
const src = (s: Seat, shape: Shape = 'base') => `/council/${s.key}-${FRAMES[s.key]?.includes(shape) ? shape : 'base'}.webp`

function Bust({ seat, shape }: { seat: Seat; shape: Shape }) {
	return (
		<div className="bust" data-shape={shape}>
			{(['base', 'open', 'mid', 'blink'] as Shape[]).map((sh) => seat.portrait
				? <img key={sh} className={sh} src={src(seat, sh)} alt="" draggable={false} />
				: <DrawnBust key={sh} seat={seat} shape={sh} cls={sh} />)}
		</div>
	)
}

const STANCE: Record<string, string> = { موافق: 'endorse', مخالف: 'dissent', مشروط: 'amend' }
const STANCE_EN: Record<string, string> = { موافق: 'ENDORSE', مخالف: 'DISSENT', مشروط: 'AMEND' }
const vClass = (l = '') => (/انجام نده|نکن/.test(l) ? 'dont' : /انجام بده/.test(l) ? '' : 'amend')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const STEPS = [['setup', 'Brief'], ['round1', 'Openings'], ['verdict', 'Verdict']] as const

export default function CouncilRoom({ session }: { session: Session }) {
	const [seats, setSeats] = useState<Seat[]>([])
	const [chair, setChair] = useState('')
	const [pick, setPick] = useState<string[]>([])
	const [mode, setMode] = useState<'full' | 'quick'>('full')
	const [question, setQuestion] = useState('')
	const [asked, setAsked] = useState('')
	const [busy, setBusy] = useState(false)
	const [err, setErr] = useState('')
	const [res, setRes] = useState<Result | null>(null)
	const [shapes, setShapes] = useState<Record<string, Shape>>({})
	const [speaker, setSpeaker] = useState<string | null>(null)
	const [said, setSaid] = useState<{ seat: string | null; words: string[]; n: number; tag: string } | null>(null)
	const [heard, setHeard] = useState<string[]>([])
	const [done, setDone] = useState(false)
	const [sheet, setSheet] = useState(false)
	const [tab, setTab] = useState<'feed' | 'lib'>('feed')
	const [speed, setSpeed] = useState(1)
	const [geo, setGeo] = useState<Geo>({})
	const [box, setBox] = useState({ W: 0, H: 0, narrow: false, gx: 0, gy: 0, gr: 0, ctop: 0 })
	const stage = useRef<HTMLDivElement>(null)
	const skip = useRef(false)
	const speedRef = useRef(1)
	speedRef.current = speed

	const load = useCallback(() => api<{ seats: Seat[]; default: string[]; chair: string }>(session, '/api/council/seats').then((j) => {
		setSeats(j.seats); setChair(j.chair)
		const ready = (k: string) => !!j.seats.find((s) => s.key === k)?.ready
		const saved = readOrder().filter(ready).slice(0, 7)
		setPick((p) => (p.length ? p : saved.length >= 2 ? saved : j.default.filter(ready)))
	}, (e) => setErr((e as Error).message)), [session])
	useEffect(() => { load() }, [load])
	useEffect(() => { if (seats.length && pick.length) saveOrder(pick) }, [pick, seats.length])

	// ---- drag and drop around the table (pointer events: mouse + touch); keyboard: Alt+←/→ moves, Delete unseats
	const [drag, setDrag] = useState<{ key: string; from: 'seat' | 'chip'; x: number; y: number; slot: number; out: boolean; moved: boolean } | null>(null)
	const [announce, setAnnounce] = useState('')
	const slotAt = (clientX: number, n: number) => {
		const r = stage.current?.getBoundingClientRect()
		if (!r || n <= 1) return 0
		const f = (clientX - r.left) / r.width
		return Math.max(0, Math.min(n - 1, Math.round(((f - 0.1) / 0.8) * (n - 1))))
	}
	const outside = (x: number, y: number) => { const r = stage.current?.getBoundingClientRect(); return !r || x < r.left || x > r.right || y < r.top || y > r.bottom }
	const nameOf = (k: string) => seats.find((s) => s.key === k)?.name || k
	const startDrag = (e: React.PointerEvent, key: string, from: 'seat' | 'chip') => {
		if (busy || (res && !done) || e.button > 0) return
		;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
		setDrag({ key, from, x: e.clientX, y: e.clientY, slot: pick.indexOf(key), out: false, moved: false })
	}
	const moveDrag = (e: React.PointerEvent) => {
		if (!drag) return
		const n = drag.from === 'chip' && !pick.includes(drag.key) ? pick.length + 1 : pick.length
		setDrag({ ...drag, x: e.clientX, y: e.clientY, slot: slotAt(e.clientX, n), out: outside(e.clientX, e.clientY), moved: drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6 })
	}
	const endDrag = () => {
		const d = drag
		setDrag(null)
		if (!d || !d.moved) return false
		setPick((p) => {
			const rest = p.filter((k) => k !== d.key)
			if (d.out) {
				if (!p.includes(d.key) || p.length <= 2) return p
				setAnnounce(nameOf(d.key) + ' از میز برخاست.')
				return rest
			}
			if (!p.includes(d.key) && p.length >= 7) { setAnnounce('میز پر است (حداکثر ۷ صندلی).'); return p }
			rest.splice(Math.min(d.slot, rest.length), 0, d.key)
			setAnnounce(nameOf(d.key) + ' در جایگاهِ ' + (Math.min(d.slot, rest.length - 1) + 1).toLocaleString('fa-IR') + ' نشست.')
			return rest
		})
		return true
	}
	const seatKey = (e: React.KeyboardEvent, key: string) => {
		if (busy || (res && !done)) return
		const i = pick.indexOf(key)
		if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			e.preventDefault()
			const j = Math.max(0, Math.min(pick.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))
			if (j === i) return
			setPick((p) => { const q = [...p]; q.splice(i, 1); q.splice(j, 0, key); return q })
			setAnnounce(nameOf(key) + ' در جایگاهِ ' + (j + 1).toLocaleString('fa-IR') + ' نشست.')
		} else if (e.key === 'Delete' && pick.length > 2) {
			e.preventDefault(); setPick((p) => p.filter((k) => k !== key)); setAnnounce(nameOf(key) + ' از میز برخاست.')
		}
	}

	const by = (k: string | null) => seats.find((s) => s.key === k)
	const table = pinAlavi(pick.map(by).filter(Boolean) as Seat[], (s) => s.key)
	const [panelOpen, setPanelOpen] = useState(() => { try { return localStorage.getItem('aromin.council.panel') === '1' } catch { return false } })
	const togglePanel = (open?: boolean) => setPanelOpen((v) => { const n = open ?? !v; try { localStorage.setItem('aromin.council.panel', n ? '1' : '0') } catch { /* private mode */ } return n })

	// The table is a globe seen from the front; seats sit along its far edge (middle seat farthest, ends nearest), as in the original.
	useLayoutEffect(() => {
		const el = stage.current
		if (!el) return
		const lay = () => {
			const W = el.clientWidth, narrow = W < 760
			const H = narrow ? Math.round(W * 0.7) : el.clientHeight
			const gr = W * (narrow ? 0.62 : 0.46), gx = W / 2, gy = H * (narrow ? 1.02 : 0.86) + gr * (narrow ? 0.5 : 0.36)
			const edge = (x: number) => gy - Math.sqrt(Math.max(0, gr * gr - (x - gx) ** 2))
			const n = table.length
			const xs = n === 1 ? [0.5] : table.map((_, i) => 0.1 + (0.8 * i) / (n - 1))
			const fit = Math.min(1, 6 / Math.max(1, n - 1))
			const g: Geo = {}
			let low = 0
			table.forEach((s, i) => {
				const x = W * xs[i], d = ((x - gx) / gr) ** 2
				const size = H * (narrow ? 0.46 + 0.08 * d : 0.3 + 0.06 * d) * fit
				const bottom = edge(x) + size * 0.2
				g[s.key] = { x, head: bottom - size * 0.72, size, plate: edge(x) + H * 0.01, top: bottom - size }
				if (i > 0 && i < n - 1) low = Math.max(low, edge(x) + H * 0.04)
			})
			setGeo(g)
			setBox({ W, H, narrow, gx, gy, gr, ctop: narrow ? H : Math.max(low, H * 0.45) + H * 0.035 })
		}
		lay()
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(lay) : null
		ro?.observe(el)
		return () => ro?.disconnect()
	}, [pick.join(','), seats.length])     // eslint-disable-line react-hooks/exhaustive-deps

	// idle blinking: every seat on its own random 2.4–6.6 s clock, never while that seat is mid-word (as in the original)
	const speakingRef = useRef<string | null>(null)
	speakingRef.current = speaker
	useEffect(() => {
		if (reduced()) return
		const timers: number[] = []
		const blink = (k: string) => {
			if (speakingRef.current !== k) {
				setShapes((s) => ({ ...s, [k]: 'blink' }))
				timers.push(window.setTimeout(() => setShapes((s) => (s[k] === 'blink' ? { ...s, [k]: 'base' } : s)), 130))
			}
			timers.push(window.setTimeout(() => blink(k), 2400 + Math.random() * 4200))
		}
		pick.forEach((k, i) => timers.push(window.setTimeout(() => blink(k), 600 + i * 530)))
		return () => timers.forEach(clearTimeout)
	}, [pick])

	// optional Persian voice (Web Speech, fa-IR only; never a third-party TTS) — off by default
	const [voice, setVoice] = useState(false)
	const faVoice = () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('fa')) : undefined)

	const wait = (ms: number) => (skip.current ? Promise.resolve() : sleep(ms / speedRef.current))
	const mouthWord = async (seat: string, word: string) => {
		const sh = shapesFor(word.replace(/[^\p{L}ُ]/gu, ''))
		const per = Math.max(60, (Array.from(word).length * 55) / (sh.length + 1))
		for (const x of sh) { setShapes((s) => ({ ...s, [seat]: x })); await wait(per) }
		setShapes((s) => ({ ...s, [seat]: 'base' })); await wait(per + pauseAfter(word))
	}
	const speakVoice = (seat: string, words: string[], v: SpeechSynthesisVoice) => new Promise<void>((resolve) => {
		const u = new SpeechSynthesisUtterance(words.join(' '))
		u.voice = v; u.lang = v.lang; u.rate = speedRef.current
		const starts = words.reduce<number[]>((a, w, i) => [...a, i ? a[i - 1] + words[i - 1].length + 1 : 0], [])
		u.onboundary = (e) => {
			const i = Math.max(0, starts.findIndex((s, j) => e.charIndex >= s && (j === starts.length - 1 || e.charIndex < starts[j + 1])))
			setSaid({ seat, words, n: i + 1, tag: 'Opening' }); void mouthWord(seat, words[i])
		}
		u.onend = () => resolve(); u.onerror = () => resolve()
		speechSynthesis.speak(u)
	})
	const play = async (r: Result) => {
		skip.current = reduced()
		setSaid({ seat: null, words: ['Openings:', 'each', 'seat', 'takes', 'a', 'position.'], n: 6, tag: 'The floor is open' }); await wait(1400)
		for (const c of r.cards.filter((x) => x.ok && x.line)) {
			const words = c.line!.split(/\s+/).filter(Boolean)
			setSpeaker(c.seat)
			const v = voice && !skip.current ? faVoice() : undefined
			if (v) await speakVoice(c.seat, words, v)
			for (let i = 0; !v && i < words.length && !skip.current; i++) {
				setSaid({ seat: c.seat, words, n: i + 1, tag: 'Opening' })
				await mouthWord(c.seat, words[i])
			}
			setSaid({ seat: c.seat, words, n: words.length, tag: 'Opening' }); setShapes((s) => ({ ...s, [c.seat]: 'base' }))
			setHeard((h) => [...h, c.seat]); await wait(1300)
		}
		setHeard(r.cards.filter((x) => x.ok).map((x) => x.seat))
		setSpeaker(null); setSaid(null); setDone(true)
	}

	const convene = async () => {
		const seatsNow = pinAlavi(mode === 'quick' ? pick.slice(0, 4) : pick, (k) => k)
		setBusy(true); setErr(''); setRes(null); setDone(false); setSaid(null); setHeard([]); setAsked(question.trim()); setSpeed(1)
		try {
			const r = await api<Result>(session, '/api/council/ask', { question: question.trim(), seats: seatsNow })
			setRes(r); setBusy(false); await play(r)
		} catch (e) { setErr((e as Error).message); setBusy(false) }
	}
	const reset = () => { setRes(null); setDone(false); setAsked(''); setSaid(null); setHeard([]) }
	const toggle = (k: string) => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 7 ? [...p, k] : p))
	const step = done ? 'verdict' : res || busy ? 'round1' : 'setup'
	const live = !!res && !done
	const cards = Object.fromEntries((res?.cards || []).filter((c) => c.ok).map((c) => [c.seat, c])) as Record<string, Card>
	const opts = res ? [...new Set(res.cards.filter((c) => c.ok).map((c) => c.stance || ''))].map((st) => {
		const cs = res.cards.filter((c) => c.ok && c.stance === st)
		return { st, n: cs.length, avg: Math.round(cs.reduce((a, c) => a + (c.score || 0), 0) / Math.max(1, cs.length) * 10) / 10 }
	}).sort((a, b) => b.n - a.n) : []
	const sp = speaker ? geo[speaker] : null

	return (
		<div className="rr" data-testid="council">
			<header className="topbar">
				<div className="brand"><img className="brand-logo" src="/aromin-mark.svg" alt="AROMIN" /><span className="brand-rule" aria-hidden="true" /><span className="brand-name">Council Room</span></div>
				<ol className="stepper" aria-label="Council progress">{STEPS.map(([k, l], i) => (
					<li key={k} className={k === step ? 'active' : STEPS.findIndex((x) => x[0] === step) > i ? 'done' : ''}>{l}</li>))}</ol>
				<div className="top-actions">
					<span className="usage">Chair: {chair || 'Coach agent'}</span>
					<button className="ghost" type="button" aria-pressed={voice} title="Persian voice (fa-IR) from this browser, if it has one" onClick={() => setVoice((v) => !v)}>Voice {voice ? 'on' : 'off'}</button>
					{res && <button className="ghost" type="button" onClick={reset}>New question</button>}
				</div>
			</header>
			{asked && (
				<div className="topic">
					<div><div className="label">On the table</div><h1>{asked}</h1></div>
					{opts.length > 0 && <div className="options">{opts.map((o, i) => (
						<div key={o.st} className={`opt ${i === 0 ? 'lead' : ''}`}><span className="id">{'ABC'[i] || '•'}</span><span className="bar"><i style={{ width: `${o.avg * 10}%` }} /></span>
							<span className="val">{STANCE_EN[o.st] ? o.avg : '—'}</span><span className="label" style={{ gridColumn: 2, gridRow: 1 }}>{STANCE_EN[o.st] || o.st} · {o.n}</span></div>))}</div>}
				</div>
			)}
			{err && <p role="alert" style={{ color: 'var(--dissent)', margin: '12px 24px 0', fontSize: 13 }}>{err}</p>}
			<p className="sr-only" aria-live="polite" data-testid="council-announce">{announce}</p>
			{drag?.moved && by(drag.key) && (
				<div className={`drag-ghost ${drag.out ? 'out' : ''}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
					<img src={by(drag.key)!.portrait ? src(by(drag.key)!) : '/aromin-mark.svg'} alt="" />
				</div>
			)}

			<main className={`layout ${panelOpen ? '' : 'collapsed'}`}>
				<section aria-label="The council table">
					<div ref={stage} className={`stage ${live ? 'live' : ''} ${box.narrow ? 'narrow' : ''}`} data-testid="council-stage" style={box.narrow ? { paddingTop: box.H } : undefined}>
						<div className="wall" aria-hidden="true" />
						<div className={`spot ${sp ? 'on' : ''}`} style={sp ? { left: sp.x, top: sp.head, width: sp.size * 1.9, height: sp.size * 1.9 } : undefined} aria-hidden="true" />
						{table.map((s) => {
							const g = geo[s.key]
							if (!g) return null
							const on = speaker === s.key, c = cards[s.key]
							return (
								<button key={s.key} type="button" className={`seat ${on ? 'speaking' : ''} ${busy ? 'thinking' : ''} ${drag?.key === s.key && drag.moved ? 'dragging' : ''}`} data-seat={s.key}
									aria-label={s.name + ' — Alt+←/→ جابه‌جا، Delete برخاستن'}
									style={{ left: g.x - g.size / 2, top: g.top, width: g.size, height: g.size, zIndex: 10 + Math.round(((g.x - box.gx) / box.gr) ** 2 * 10), transform: on ? 'scale(1.05)' : undefined }}
									onPointerDown={(e) => startDrag(e, s.key, 'seat')} onPointerMove={moveDrag} onPointerUp={() => { if (!endDrag()) setTab('feed') }}
									onPointerCancel={() => setDrag(null)} onKeyDown={(e) => seatKey(e, s.key)}>
									<Bust seat={s} shape={shapes[s.key] || 'base'} />
									<span className="think" aria-hidden="true"><i /><i /><i /></span>
									{done && c?.stance && <span className={`vote ${STANCE[c.stance]}`}>{STANCE_EN[c.stance]}</span>}
								</button>
							)
						})}
						<Globe className="globe" style={{ left: box.gx - box.gr, top: box.gy - box.gr, width: box.gr * 2, height: box.gr * 2 }} />
						{drag?.moved && !drag.out && (() => {
							const n = drag.from === 'chip' && !pick.includes(drag.key) ? pick.length + 1 : pick.length
							const x = box.W * (n === 1 ? 0.5 : 0.1 + (0.8 * drag.slot) / Math.max(1, n - 1))
							const y = box.gy - Math.sqrt(Math.max(0, box.gr ** 2 - (x - box.gx) ** 2))
							return <span className="drop-slot" style={{ left: x, top: y }} aria-hidden="true" />
						})()}
						{table.map((s) => {
							const g = geo[s.key], c = cards[s.key]
							return g && (
								<div key={s.key} className={`nameplate ${speaker === s.key ? 'speaking' : ''}`} style={{ left: g.x, top: g.plate }}>
									<b>{s.short}</b>{!(heard.includes(s.key) && c) && <small>{s.pillar}</small>}
									{heard.includes(s.key) && c && <div className="meta"><span className={`chip ${STANCE[c.stance || '']}`}>{STANCE_EN[c.stance || ''] || c.stance}</span><span className="score">{c.score}/10</span></div>}
								</div>
							)
						})}

						<div className="center" style={box.narrow ? { position: 'relative', padding: '16px 18px 56px' } : { left: box.W * 0.2, width: box.W * 0.6, top: box.ctop, height: box.H - box.ctop - box.H * 0.09 }}>
							{!res && !busy && (
								<form className="composer" onSubmit={(e) => { e.preventDefault(); if (question.trim().length >= 10 && pick.length >= 2) convene() }}>
									<h2 dir="rtl">برای چه تصمیمی کمک می‌خواهید؟</h2>
									<textarea rows={3} dir="auto" minLength={10} required value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Decision"
										placeholder="تصمیم، گزینه‌ها، چند عدد (فروش، نقدینگی، تیم) و نظرِ خودتان را بنویسید…" />
									<div className="samples" aria-label="Seats">{seats.map((s) => (
										<button key={s.key} type="button" aria-pressed={pick.includes(s.key)} disabled={!s.ready} title={s.ready ? s.question + ' — drag onto the table' : 'Library is empty'}
											onPointerDown={(e) => startDrag(e, s.key, 'chip')} onPointerMove={moveDrag} onPointerUp={() => { if (!endDrag()) toggle(s.key) }} onPointerCancel={() => setDrag(null)}
											onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.key) } }}>{s.short}</button>))}</div>
									<div className="composer-row">
										<div className="mode" role="radiogroup" aria-label="Council size">
											<label><input type="radio" name="rr-mode" checked={mode === 'full'} onChange={() => setMode('full')} /><span>شورای کامل <small>{Math.min(7, pick.length).toLocaleString('fa-IR')} صندلی</small></span></label>
											<label><input type="radio" name="rr-mode" checked={mode === 'quick'} onChange={() => setMode('quick')} /><span>سریع <small>۴ صندلی</small></span></label>
										</div>
										<button className="convene" type="submit" disabled={busy || question.trim().length < 10 || pick.length < 2}>تشکیلِ جلسهٔ شورا</button>
									</div>
								</form>
							)}
							{busy && <div className="caption"><div className="cap-head"><span className="cap-who">The Chair</span><span className="cap-tag">Seats are thinking</span></div>
								<p className="cap-text chair">Each seat reads its brain and the live numbers<span className="dots"><i /><i /><i /></span></p></div>}
							{said && (
								<div className="caption" aria-live="polite" data-testid="council-caption">
									<div className="cap-head">{said.seat && <span className="cap-av"><img src={by(said.seat)?.portrait ? src(by(said.seat)!) : '/aromin-mark.svg'} alt="" /></span>}
										<span className="cap-who">{said.seat ? by(said.seat)?.name : 'The Chair'}</span><span className="cap-tag">{said.tag}</span></div>
									<p className={`cap-text ${said.seat ? '' : 'chair'}`} dir="auto">{said.words.map((w, i) => <span key={i} className={`w ${i < said.n ? 'on' : ''}`}>{w} </span>)}</p>
								</div>
							)}
							{done && res && (
								<div className="plate" data-testid="council-verdict">
									<p dir="auto">{res.verdict.ok ? `${res.verdict.label} — ${res.verdict.call}` : `Chair: ${res.verdict.error}`}</p>
									<div className="row"><button type="button" onClick={() => setSheet(true)}>Read the verdict</button><button type="button" className="alt" onClick={reset}>New question</button></div>
								</div>
							)}
						</div>
						<div className="chair-plate" data-testid="council-chair" aria-label={'رئیسِ جلسه: ' + (chair || 'ایجنتِ کوچ')}>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3l7 7-3 3-7-7z M10.5 6.5l-7 7 3 3 7-7 M3 21h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
							<span><small>رئیسِ جلسه</small><b>{chair || 'ایجنتِ کوچ'}</b></span>
						</div>
						{live && (
							<div className="playbar">
								<span className="queue">{heard.length}/{res!.cards.filter((c) => c.ok).length} spoken</span>
								<div className="speed" role="radiogroup" aria-label="Playback speed">{[1, 1.6, 2.5].map((v) => <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)}>{v}x</button>)}</div>
								<button type="button" className="skip" onClick={() => { skip.current = true }}>Skip ahead</button>
							</div>
						)}
					</div>
				</section>

				<aside className={`panel ${panelOpen ? '' : 'rail'}`} aria-label="Key points" data-testid="council-panel">
					<div className="tabs" role="tablist">
						<button type="button" className="ptoggle" aria-label={panelOpen ? 'بستنِ پنل' : 'باز کردنِ پنل'} aria-expanded={panelOpen} onClick={() => togglePanel()}>
							<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M15 4v16" stroke="currentColor" strokeWidth="1.7" /></svg>
						</button>
						<button type="button" role="tab" aria-selected={panelOpen && tab === 'feed'} title="Key points" onClick={() => { setTab('feed'); togglePanel(true) }}><span className="tl">Key points</span><span className="ti" aria-hidden="true">≡</span></button>
						<button type="button" role="tab" aria-selected={panelOpen && tab === 'lib'} title="Library" onClick={() => { setTab('lib'); togglePanel(true) }}><span className="tl">Library</span><span className="ti" aria-hidden="true">📚</span></button>
					</div>
					{!panelOpen ? null : tab === 'feed' ? (
						<div className="tabpanel">{heard.length === 0 && <div className="empty">One line per seat as the council talks.</div>}
							{heard.map((k) => { const c = cards[k], s = by(k); return c && s && (
								<div key={k} className="feed-card"><div className="h"><img className="av" src={s.portrait ? src(s) : '/aromin-mark.svg'} alt="" />{s.name}<span className="r">{STANCE_EN[c.stance || ''] || c.stance} · {c.score}/10</span></div>
									<p dir="auto">{c.line}</p>
									{!!c.frameworks?.length && <div className="fw">{c.frameworks.map((f, i) => <span key={i} dir="auto">{f}</span>)}</div>}
									{c.why?.map((w, i) => <p key={i} dir="auto" className="why">• {w}</p>)}
									{c.math && <p dir="auto" className="kv"><b>Math</b> {c.math}</p>}
									{c.risk && <p dir="auto" className="kv"><b>Risk</b> {c.risk}</p>}
									{c.test && <p dir="auto" className="kv"><b>Test</b> {c.test}</p>}
									{c.model && <p className="model">{c.model}</p>}</div>) })}
							{res && res.skipped.length > 0 && <div className="empty">Not seated (empty library): {res.skipped.map((k) => by(k)?.short).join(', ')}</div>}
						</div>
					) : <Library session={session} seats={seats} reload={load} />}
				</aside>
			</main>
			<p className="disclaimer">Simulated advisors built from each person's public work. They are not the people and do not speak for them.</p>

			{sheet && res?.verdict.ok && (
				<div className="rr rr-sheet" role="dialog" aria-modal="true" aria-label="Verdict" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false) }}>
					<div className="sheet-inner">
						<div className="v-top"><div><div className="label">The verdict · chaired by {chair}</div><span className={`v-label ${vClass(res.verdict.label)}`} dir="auto">{res.verdict.label}</span></div>
							<button type="button" className="ghost" onClick={() => setSheet(false)}>Close</button></div>
						<p className="v-call" dir="auto">{res.verdict.call}</p>
						{!!res.verdict.carried?.length && <><h4>What carried the room</h4><ul dir="auto">{res.verdict.carried.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
						{res.verdict.dissent && <><h4>Strongest objection</h4><p dir="auto" style={{ margin: 0 }}>{res.verdict.dissent}</p></>}
						{!!res.verdict.conditions?.length && <><h4>Conditions</h4><ul dir="auto">{res.verdict.conditions.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
						{res.verdict.kill && <><h4>Kill criterion</h4><p dir="auto" style={{ margin: 0 }}>{res.verdict.kill}</p></>}
						{!!res.verdict.next?.length && <><h4>Next steps</h4><ol dir="auto">{res.verdict.next.map((x, i) => <li key={i}>{x}</li>)}</ol></>}
					</div>
				</div>
			)}
		</div>
	)
}

function Library({ session, seats, reload }: { session: Session; seats: Seat[]; reload: () => void }) {
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
	const del = (id: string) => { if (window.confirm('Delete this entry?')) run(() => api(session, '/api/knowledge/' + encodeURIComponent(id), undefined, 'DELETE')) }
	return (
		<div className="tabpanel" data-testid="council-kb">
			{msg && <p role="alert" style={{ color: 'var(--dissent)', fontSize: 12.5, margin: 0 }}>{msg}</p>}
			{seats.map((s) => (
				<div key={s.key} className="feed-card" style={{ cursor: 'default' }}>
					<button type="button" className="h" style={{ background: 'none', border: 0, padding: 0, width: '100%', color: 'inherit' }} aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>
						<img className="av" src={s.portrait ? src(s) : '/aromin-mark.svg'} alt="" />{s.name}
						<span className="r">{s.brain ? 'brain' : ''}{s.entries.length ? `${s.brain ? ' + ' : ''}${s.entries.length} entries` : s.brain ? '' : 'empty'}</span></button>
					{open === s.key && (
						<div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
							{s.entries.map((e) => <div key={e.id} className="lib-row"><span className="n">{e.filename}</span><span>{e.chars.toLocaleString()} chars</span><button type="button" className="ghost" disabled={busy} onClick={() => del(e.id)}>Delete</button></div>)}
							<textarea className="lib-in" dir="auto" aria-label={'Library text for ' + s.short} placeholder="Talk transcript, book notes, interview…" value={text} onChange={(e) => setText(e.target.value)} />
							<div style={{ display: 'flex', gap: 8 }}>
								<button type="button" className="btn-w" disabled={busy || text.trim().length < 20} onClick={() => addText(s.key)}>Add text</button>
								<label className="ghost" style={{ cursor: 'pointer' }}>Upload file<input type="file" hidden accept=".txt,.md,.pdf,.docx,.html,.csv,.json" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(s.key, f); e.target.value = '' }} /></label>
							</div>
						</div>
					)}
				</div>
			))}
		</div>
	)
}
