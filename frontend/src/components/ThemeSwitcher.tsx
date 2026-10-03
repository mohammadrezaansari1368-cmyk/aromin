'use client'

/** انتخابِ تم (۳ رنگِ برند) + روشن/تیره — ذخیره‌شده؛ بعد از رفرش هم می‌ماند. */
import { useEffect, useRef, useState } from 'react'
import { THEMES, setTheme, useTheme } from '@/lib/theme'
import { FOCUS } from '@/components/ui/tokens'

const P = (d: string) => d.split('|').map((x, i) => <path key={i} d={x} />)
const Ico = ({ d, className = 'size-[18px]' }: { d: string; className?: string }) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>{P(d)}</svg>
)
const SUN = 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4'
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'
const PALETTE = 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.5a1.5 1.5 0 0 0-1.1 2.5A1.5 1.5 0 0 1 14.3 21 10 10 0 0 1 12 22z|M7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z|M11 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z|M16 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'

export default function ThemeSwitcher({ className = '' }: { className?: string }) {
	const s = useTheme()
	const [open, setOpen] = useState(false)
	const box = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!open) return
		const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
		document.addEventListener('mousedown', out)
		document.addEventListener('keydown', esc)
		return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
	}, [open])
	const btn = FOCUS
	return (
		<div ref={box} className={className || 'relative'} dir="rtl">
			<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-label="تمِ رنگی"
				className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-bold text-foreground transition hover:bg-muted ${btn}`}>
				<Ico d={PALETTE} />
				<span className="hidden -space-x-1 space-x-reverse sm:flex" aria-hidden>
					{THEMES.find((t) => t.id === s.theme)!.swatch.map((c) => <span key={c} className="size-2.5 rounded-full ring-2 ring-card" style={{ background: c }} />)}
				</span>
			</button>
			{open && (
				<div role="dialog" aria-label="تمِ رنگی" className="absolute left-0 top-11 z-50 w-[248px] rounded-lg border border-border bg-card p-3 text-card-foreground shadow-[0_20px_50px_-20px_hsl(var(--shadow)/.45)]">
					<div className="mb-2 text-[11.5px] font-bold text-muted-foreground">رنگِ اصلی</div>
					<div role="radiogroup" aria-label="رنگِ اصلی" className="flex flex-col gap-1">
						{THEMES.map((t) => {
							const on = t.id === s.theme
							return (
								<button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setTheme({ theme: t.id })}
									className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-right text-[13px] font-bold transition ${on ? 'bg-primary/10 text-primary-ink' : 'hover:bg-muted'} ${btn}`}>
									<span className="flex -space-x-1.5 space-x-reverse" aria-hidden>
										{t.swatch.map((c, i) => <span key={c} className={`${i ? 'size-3.5' : 'size-5'} self-center rounded-full ring-2 ring-card`} style={{ background: c }} />)}
									</span>
									<span className="flex-1">{t.label}</span>
									{on && <Ico d="M20 6L9 17l-5-5" className="size-4" />}
								</button>
							)
						})}
					</div>
					<div className="mb-2 mt-3 text-[11.5px] font-bold text-muted-foreground">روشنایی</div>
					<div role="radiogroup" aria-label="روشنایی" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
						{([['light', 'روشن', SUN], ['dark', 'تیره', MOON]] as const).map(([m, l, d]) => {
							const on = s.mode === m
							return (
								<button key={m} type="button" role="radio" aria-checked={on} onClick={() => setTheme({ mode: m })}
									className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-bold transition ${on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'} ${btn}`}>
									<Ico d={d} className="size-4" />{l}
								</button>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
