// React Bits — CountUp + FadeContent (TS + Tailwind) by David Haz, MIT + Commons Clause, github.com/DavidHDev/react-bits
// (vendored: the registry and npm scope are unreachable from the office network). 3.9.88: Persian digits via Intl, reduced motion respected.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

export function CountUp({ to, from = 0, duration = 2, delay = 0, startWhen = true, decimals = 0, locale = 'fa-IR', className = '' }: {
	to: number; from?: number; duration?: number; delay?: number; startWhen?: boolean; decimals?: number; locale?: string; className?: string
}) {
	const ref = useRef<HTMLSpanElement>(null)
	const reduce = useReducedMotion()
	const mv = useMotionValue(from)
	const spring = useSpring(mv, { damping: 20 + 40 * (1 / duration), stiffness: 100 * (1 / duration) })
	const inView = useInView(ref, { once: true, margin: '0px' })
	const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
	useEffect(() => { if (ref.current) ref.current.textContent = fmt(reduce ? to : from) }, []) // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (!inView || !startWhen) return
		if (reduce) { if (ref.current) ref.current.textContent = fmt(to); return }
		const t = setTimeout(() => mv.set(to), delay * 1000)
		return () => clearTimeout(t)
	}, [inView, startWhen, to, delay, reduce]) // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => spring.on('change', (v) => { if (ref.current) ref.current.textContent = fmt(Number(v.toFixed(decimals))) }), [spring, decimals, locale]) // eslint-disable-line react-hooks/exhaustive-deps
	return <span ref={ref} className={`tabular-nums ${className}`} />
}

export function FadeContent({ children, blur = true, duration = 600, delay = 0, threshold = 0.1, className = '' }: {
	children: ReactNode; blur?: boolean; duration?: number; delay?: number; threshold?: number; className?: string
}) {
	const ref = useRef<HTMLDivElement>(null)
	const [shown, setShown] = useState(false)
	useEffect(() => {
		const el = ref.current
		if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return }
		const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold })
		io.observe(el)
		return () => io.disconnect()
	}, [threshold])
	return (
		<div ref={ref} className={`motion-reduce:!opacity-100 motion-reduce:!filter-none motion-reduce:!transition-none ${className}`}
			style={{ opacity: shown ? 1 : 0, filter: blur && !shown ? 'blur(8px)' : 'none', transition: `opacity ${duration}ms ease-out ${delay}ms, filter ${duration}ms ease-out ${delay}ms` }}>
			{children}
		</div>
	)
}
