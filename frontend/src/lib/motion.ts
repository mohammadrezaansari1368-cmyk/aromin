// 3.9.72: GSAP — cards rise in on every tab change and each section reveals once as it scrolls into view (Lenis drives the scroll).
// Nothing runs with prefers-reduced-motion; clearProps leaves no inline styles behind.
import { useLayoutEffect, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useTabReveal(root: RefObject<HTMLElement | null>, key: string) {
	useLayoutEffect(() => {
		const el = root.current
		if (!el || reducedMotion()) return
		const ctx = gsap.context(() => {
			gsap.from(el.children, { y: 18, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out', clearProps: 'transform,opacity' })
			gsap.utils.toArray<HTMLElement>('section', el).slice(1).forEach((s) => {
				gsap.from(s, { y: 24, opacity: 0, duration: 0.55, ease: 'power2.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: s, start: 'top 92%', once: true } })
			})
		}, el)
		return () => ctx.revert()
	}, [root, key])
}
