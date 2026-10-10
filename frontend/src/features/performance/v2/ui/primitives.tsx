/** Small interaction primitives — built from scratch with Aromin tokens (RTL, Persian). */
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { fa } from '../data/adapters'

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Bento frame: 6px outer, 13px inner radius, one-line title + short grey sub */
export function BentoCard({ title, sub, actions, children, className = '', label }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; label?: string }) {
	return <section className={'pv-bento ' + className} aria-label={label}>
		<div className="pv-bento-in">
			<header className="pv-bento-h"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{actions}</header>
			{children}
		</div>
	</section>
}

/** Physical key: shaped face, firm edge, pressable depth (≤120ms) */
export function TactileButton({ pressed, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
	return <button type="button" {...rest} aria-pressed={pressed} className={'pv-key ' + (pressed ? 'is-on ' : '') + className}>{children}</button>
}

/** ≤400ms scramble with Persian glyphs, revealed right→left; reduced motion = swap */
const GLYPHS = 'ابپتثجچحخدذرزسشصضطظعغفقکگلمنوهی۰۱۲۳۴۵۶۷۸۹'
export function ScrambleText({ text, className }: { text: string; className?: string }) {
	const [out, setOut] = useState(text)
	useEffect(() => {
		if (reducedMotion()) { setOut(text); return }
		let raf = 0; const t0 = performance.now()
		const step = (now: number) => {
			const p = Math.min(1, (now - t0) / 400), keep = Math.floor(p * text.length)
			// logical order is RTL reading order: the first characters (rightmost) settle first
			setOut([...text].map((c, i) => (i < keep || c === ' ' ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(''))
			if (p < 1) raf = requestAnimationFrame(step)
		}
		raf = requestAnimationFrame(step)
		return () => cancelAnimationFrame(raf)
	}, [text])
	return <span className={className} aria-label={text}><span aria-hidden>{out}</span></span>
}

/** Soft counter for TFT figures; null stays «—» */
export function CountUp({ value, format = (n: number) => fa(n) }: { value: number | null; format?: (n: number) => string }) {
	const [shown, setShown] = useState(value), from = useRef(value)
	useEffect(() => {
		if (value === null || from.current === null || reducedMotion()) { from.current = value; setShown(value); return }
		let raf = 0; const a = from.current, t0 = performance.now()
		const step = (now: number) => { const p = Math.min(1, (now - t0) / 500), e = 1 - (1 - p) ** 3; setShown(a + (value - a) * e); if (p < 1) raf = requestAnimationFrame(step); else from.current = value }
		raf = requestAnimationFrame(step)
		return () => cancelAnimationFrame(raf)
	}, [value])
	return <>{shown === null ? '—' : format(shown)}</>
}

/** Height-capped list; top/bottom fade only when there is more content */
export function ScrollFadeList({ children, max = 320, label }: { children: ReactNode; max?: number; label?: string }) {
	const ref = useRef<HTMLDivElement>(null), [edge, setEdge] = useState({ top: false, bottom: false })
	// update only on change (a fresh object every render would loop)
	const measure = () => { const el = ref.current; if (!el) return; const top = el.scrollTop > 2, bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2; setEdge((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom })) }
	useLayoutEffect(() => { measure(); const el = ref.current; if (!el) return; const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect() }, [children])
	return <div ref={ref} role="list" aria-label={label} onScroll={measure} className="pv-fade" data-top={edge.top} data-bottom={edge.bottom} style={{ maxHeight: max }}>{children}</div>
}

/** Width animates as the label changes */
export function DynamicButton({ label, onClick, disabled, tone }: { label: string; onClick: () => void; disabled?: boolean; tone?: 'ok' | 'err' }) {
	const measure = useRef<HTMLSpanElement>(null), [w, setW] = useState<number>()
	useLayoutEffect(() => { if (measure.current) setW(measure.current.offsetWidth + 32) }, [label])
	return <button type="button" className="pv-dyn" data-tone={tone} disabled={disabled} onClick={onClick} style={{ width: w }} aria-live="polite">
		<span ref={measure} className="pv-dyn-m" aria-hidden>{label}</span><span>{label}</span>
	</button>
}

/** Reward ticket with a pointer-reactive foil strip; only rendered when real reward data exists */
export function RewardTicket({ title, points, period }: { title: string; points: number; period: string }) {
	const ref = useRef<HTMLDivElement>(null)
	return <div ref={ref} className="pv-ticket" onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); ref.current!.style.setProperty('--fx', ((e.clientX - r.left) / r.width).toFixed(3)) }}>
		<div className="pv-ticket-foil" /><div className="pv-ticket-body"><b>{title}</b><span>{period}</span></div>
		<div className="pv-ticket-stub"><strong>{fa(points, 0)}</strong><small>امتیاز</small></div>
	</div>
}

/** Cabin loader: traces the Aromin mark, then fills */
let markPaths: string[] | null = null
export function AromLoader() {
	const [paths, setPaths] = useState<string[]>(markPaths || [])
	useEffect(() => {
		if (markPaths) return
		fetch('/aromin-mark.svg').then((r) => r.text()).then((t) => { markPaths = [...t.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]); setPaths(markPaths) }).catch(() => {})
	}, [])
	return <div className="pv-loader" role="status" aria-label="در حال بارگذاری">
		<svg viewBox="0 -2 100 100" aria-hidden>{(paths.length ? paths : ['M50 6 L30 40 L50 52 L70 40 Z M50 52 L50 94']).map((d, i) => <path key={i} pathLength={1} d={d} />)}</svg>
	</div>
}
