'use client'

/**
 * کیتِ مشترکِ داشبورد — بلوک‌های پایه به سبکِ پرامپتِ ویجت‌گرید،
 * تا «تک‌تکِ کاشی‌ها و تب‌ها» یکدست باشند. فقط توکن‌های تم + رنگِ برند.
 */

import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react'

export type Tone = 'ok' | 'warn' | 'err' | 'idle'

export const DOT: Record<Tone, string> = {
	ok: 'bg-success',
	warn: 'bg-warning',
	err: 'bg-error',
	idle: 'bg-muted-foreground/60',
}
export const TEXT: Record<Tone, string> = {
	ok: 'text-success',
	warn: 'text-warning',
	err: 'text-error',
	idle: 'text-muted-foreground',
}
export const ACCENT = 'bg-primary'
export const HEAT = [
	'bg-foreground/[0.06]',
	'bg-primary/25',
	'bg-primary/45',
	'bg-primary/65',
	'bg-primary/90',
]

/* ---------- دادهٔ زندهٔ شبیه‌سازی ---------- */

const LiveContext = createContext(true)

export function LiveProvider({ children }: { children: ReactNode }) {
	const [live, setLive] = useState(true)
	useEffect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setLive(false)
	}, [])
	return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
}

export function useTick(ms = 2500) {
	const live = useContext(LiveContext)
	const [tick, setTick] = useState(0)
	useEffect(() => {
		if (!live) return
		const id = window.setInterval(() => {
			if (!document.hidden) setTick((t) => t + 1)
		}, ms)
		return () => window.clearInterval(id)
	}, [live, ms])
	return tick
}

export function noise(seed: number) {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
	return x - Math.floor(x)
}

export const faNum = (v: number) =>
	v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })

/* ---------- بلوک‌ها ---------- */

export function Shell({
	title,
	meta,
	children,
}: {
	title: string
	meta?: ReactNode
	children: ReactNode
}) {
	return (
		<section className="@container flex h-full flex-col gap-4 p-4 sm:p-5" dir="rtl">
			<header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[14px] leading-none">
				<h3 className="truncate text-[12px] tracking-[0.08em] text-muted-foreground">{title}</h3>
				{meta && <span className="shrink-0 text-muted-foreground">{meta}</span>}
			</header>
			<div className="flex min-h-0 flex-1 flex-col">{children}</div>
		</section>
	)
}

export function Big({ children, unit }: { children: ReactNode; unit?: string }) {
	return (
		<p className="text-[28px] leading-none font-extrabold tracking-tight text-foreground tabular-nums @[240px]:text-[32px]">
			{children}
			{unit && <span className="pr-1 text-[13px] font-normal tracking-normal text-muted-foreground">{unit}</span>}
		</p>
	)
}

export function Delta({
	value,
	against,
	good = 'up',
}: {
	value: number
	against: string
	good?: 'up' | 'down'
}) {
	const up = value >= 0
	const tone: Tone = up === (good === 'up') ? 'ok' : 'err'
	return (
		<span className={`text-[13px] tabular-nums ${TEXT[tone]}`}>
			<span aria-hidden="true">{up ? '▲' : '▼'} </span>
			{faNum(Math.abs(value))}٪<span className="sr-only"> {against}</span>
		</span>
	)
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
	return (
		<span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
			{pulse && <span className={`absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:hidden ${DOT[tone]}`} />}
			<span className={`relative size-2 rounded-full ${DOT[tone]}`} />
		</span>
	)
}

export function Row({ children, value }: { children: ReactNode; value: ReactNode }) {
	return (
		<div className="flex items-center gap-2 text-[13px]">
			<dt className="flex min-w-0 items-center gap-2 truncate text-foreground">{children}</dt>
			<dd className="mr-auto text-muted-foreground tabular-nums">{value}</dd>
		</div>
	)
}

/** میله‌های اسپارک‌لاین (آخرین میله برجسته). */
export function Bars({ data, height = 44 }: { data: number[]; height?: number }) {
	const max = Math.max(1, ...data)
	return (
		<div className="mt-auto flex items-end gap-[3px]" style={{ height }}>
			{data.map((d, i) => (
				<span
					key={i}
					className={`flex-1 rounded-full transition-[height] duration-700 motion-reduce:transition-none ${i === data.length - 1 ? ACCENT : 'bg-foreground/15'}`}
					style={{ height: `${(d / max) * 100}%` }}
				/>
			))}
		</div>
	)
}

/** ردیفِ میله‌ای افقی (نام + میله + مقدار). */
export function BarRow({
	name,
	value,
	max,
	lead = false,
}: {
	name: string
	value: number
	max: number
	lead?: boolean
}) {
	return (
		<div className="flex items-center gap-3 text-[13px]">
			<span className={`w-[110px] shrink-0 truncate ${lead ? 'text-foreground' : 'text-muted-foreground'}`}>{name}</span>
			<span className="h-[4px] flex-1 rounded-full bg-foreground/10">
				<span
					className={`block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${lead ? ACCENT : 'bg-secondary/55'}`}
					style={{ width: `${(value / max) * 100}%` }}
				/>
			</span>
			<span className="w-[52px] shrink-0 text-left text-muted-foreground tabular-nums">{faNum(value)}</span>
		</div>
	)
}
