// 3.9.89: thin wrappers over the ORIGINAL React Bits CountUp / FadeContent (ui/reactbits/, copied from the offline react-bits skill)
// so the call sites keep their props (FadeContent delay/duration in ms here; React Bits takes seconds).
import type { ReactNode } from 'react'
import RBCountUp from '@/components/ui/reactbits/CountUp'
import RBFadeContent from '@/components/ui/reactbits/FadeContent'

export function CountUp({ to, from = 0, duration = 2, delay = 0, startWhen = true, decimals, className = '' }: {
	to: number; from?: number; duration?: number; delay?: number; startWhen?: boolean; decimals?: number; className?: string
}) {
	return <RBCountUp to={to} from={from} duration={duration} delay={delay} startWhen={startWhen} decimals={decimals} separator="," className={`tabular-nums ${className}`} />
}

export function FadeContent({ children, blur = true, duration = 600, delay = 0, threshold = 0.1, className = '' }: {
	children: ReactNode; blur?: boolean; duration?: number; delay?: number; threshold?: number; className?: string
}) {
	return <RBFadeContent blur={blur} duration={duration / 1000} delay={delay / 1000} threshold={threshold} className={className}>{children}</RBFadeContent>
}
