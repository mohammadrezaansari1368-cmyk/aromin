'use client'

/**
 * چیدمانِ کشیدنیِ کاشی‌ها برای تب‌های بومی (هم‌رفتار با دستگیرهٔ کارت‌های اپِ کامل).
 * - هر فرزند یک کاشی است؛ دستگیرهٔ ⠿ بالای کاشی: کشیدن با ماوس/لمس، یا فوکوس + ↑/↓ (و ←/→).
 * - ترتیب برای هر کاربر جدا در localStorage: aromin.tiles.<user>.<listId> — فقط ظاهر؛ هیچ داده‌ای تغییر نمی‌کند.
 * - کاشیِ جدید که در ترتیبِ ذخیره‌شده نیست، سرِ جای پیش‌فرضش می‌آید.
 */

import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { motion, MotionConfig } from 'motion/react'

let tileUser = '_'
/** AppShell بعد از ورود صدا می‌زند تا ترتیب‌ها per-user باشند */
export const setTileUser = (u: string) => { tileUser = u || '_' }
const keyOf = (list: string) => 'aromin.tiles.' + tileUser + '.' + list
export function loadOrder(list: string): string[] {
	try { const v = JSON.parse(localStorage.getItem(keyOf(list)) || '[]'); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}
export function saveOrder(list: string, keys: string[]) {
	try { localStorage.setItem(keyOf(list), JSON.stringify(keys)) } catch { /* حالتِ خصوصی */ }
}
function arrange(keys: string[], saved: string[]): string[] {
	if (!saved.length) return keys
	const known = saved.filter((k) => keys.includes(k))
	const out = [...known]
	// کاشیِ جدید: بعد از همسایهٔ پیش‌فرضش
	keys.forEach((k, i) => {
		if (out.includes(k)) return
		const prev = keys.slice(0, i).reverse().find((p) => out.includes(p))
		out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k)
	})
	return out
}

/** ترتیبِ ذخیره‌شده روی کلیدهای فعلی (کلیدِ تازه کنارِ همسایهٔ پیش‌فرضش) — برای ستون‌های دفتر هم استفاده می‌شود */
export const arrangeOrder = (keys: string[], saved: string[]) => arrange(keys, saved)

export function Grip({ label, onPointerDown, onKeyDown }: { label: string; onPointerDown: (e: React.PointerEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void }) {
	return (
		<button
			type="button"
			aria-label={label}
			title="برای جابه‌جایی بکشید (یا ↑/↓)"
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			className="tile-grip absolute left-1/2 top-1 z-20 grid h-5 w-10 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full text-muted-foreground opacity-40 transition hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 active:cursor-grabbing group-hover/tile:opacity-100 [@media(hover:none)]:opacity-70">
			<svg viewBox="0 0 20 8" className="h-2 w-5" fill="currentColor" aria-hidden><circle cx="4" cy="2" r="1.3" /><circle cx="10" cy="2" r="1.3" /><circle cx="16" cy="2" r="1.3" /><circle cx="4" cy="6" r="1.3" /><circle cx="10" cy="6" r="1.3" /><circle cx="16" cy="6" r="1.3" /></svg>
		</button>
	)
}

/** server (اختیاری): ترتیب برای هر کاربر روی سرور هم خوانده/نوشته می‌شود؛ labelOf: نامِ کاشی برای دستگیره و اعلانِ صفحه‌خوان */
export default function Sortable({ id, children, className = 'flex flex-col gap-4', itemClass, server, labelOf }: {
	id: string; children: ReactNode; className?: string; itemClass?: (child: ReactElement) => string
	server?: { load: () => Promise<string[] | null>; save: (keys: string[]) => void | Promise<void> }; labelOf?: (key: string) => string
}) {
	const items = Children.toArray(children).filter(isValidElement) as ReactElement[]
	const keys = items.map((c) => String(c.key))
	const sig = keys.join('|')
	const [order, setOrder] = useState<string[]>(() => arrange(keys, loadOrder(id)))
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => setOrder((o) => arrange(keys, o.length ? o : loadOrder(id))), [sig, id])
	const [drag, setDrag] = useState<string | null>(null)
	const [msg, setMsg] = useState('')
	const srv = useRef(server)
	srv.current = server
	// ترتیبِ ذخیره‌شده روی سرور (اگر هست) بر localStorage مقدم است
	useEffect(() => {
		let alive = true
		srv.current?.load().then((o) => { if (alive && o && o.length) { setOrder(arrange(keys, o)); saveOrder(id, o) } })
		return () => { alive = false }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id])
	const persist = (k: string, o: string[]) => {
		const previous = arrange(keys, loadOrder(id))
		saveOrder(id, o)
		Promise.resolve(srv.current?.save(o)).catch(() => { saveOrder(id, previous); setOrder(previous); setMsg('ذخیره نشد؛ ترتیب قبلی بازگردانده شد') })
		setMsg(`«${labelOf ? labelOf(k) : k}» به جایگاهِ ${(o.indexOf(k) + 1).toLocaleString('fa-IR')} از ${o.length.toLocaleString('fa-IR')} رفت`)
	}
	const refs = useRef(new Map<string, HTMLDivElement>())
	const live = useRef(order)
	live.current = order

	const move = useCallback((k: string, to: number) => {
		setOrder((o) => {
			const from = o.indexOf(k)
			if (from < 0 || to < 0 || to >= o.length || to === from) return o
			const n = [...o]; n.splice(from, 1); n.splice(to, 0, k)
			return n
		})
	}, [])

	const start = (k: string) => (e: React.PointerEvent) => {
		if (e.button !== 0) return
		e.preventDefault()
		setDrag(k)
		let y = e.clientY, x = e.clientX, raf = 0
		const pick = () => {
			// کاشیِ زیرِ اشاره‌گر → جای جدید (نیمهٔ بالا/پایین؛ در ردیف‌های افقی، نیمهٔ راست/چپ)
			const o = live.current
			for (const other of o) {
				if (other === k) continue
				const r = refs.current.get(other)?.getBoundingClientRect()
				if (!r || y < r.top || y > r.bottom || x < r.left || x > r.right) continue
				const me = refs.current.get(k)?.getBoundingClientRect()
				const sameRow = me && Math.abs(me.top - r.top) < 8
				const after = sameRow ? x < r.left + r.width / 2 : y > r.top + r.height / 2 // RTL: چپ = بعد
				const ti = o.indexOf(other), fi = o.indexOf(k)
				const to = after ? (fi < ti ? ti : ti + 1) : fi < ti ? ti - 1 : ti
				move(k, Math.max(0, Math.min(o.length - 1, to)))
				break
			}
		}
		const tick = () => {
			if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 70) window.scrollBy(0, 14)
			pick()
			raf = requestAnimationFrame(tick)
		}
		const onMove = (ev: PointerEvent) => { y = ev.clientY; x = ev.clientX }
		// روی window گوش می‌دهیم: جابه‌جاییِ گرهٔ کاشی در DOM، pointer capture را آزاد می‌کند
		const end = () => {
			cancelAnimationFrame(raf)
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', end)
			window.removeEventListener('pointercancel', end)
			setDrag(null)
			persist(k, live.current)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', end)
		window.addEventListener('pointercancel', end)
		raf = requestAnimationFrame(tick)
	}
	const key = (k: string) => (e: React.KeyboardEvent) => {
		const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : 0
		if (!d) return
		e.preventDefault()
		const to = live.current.indexOf(k) + d
		if (to < 0 || to >= live.current.length) return
		move(k, to)
		const n = [...live.current]; n.splice(n.indexOf(k), 1); n.splice(to, 0, k)
		persist(k, n)
		requestAnimationFrame(() => (e.target as HTMLElement).focus())
	}

	const byKey = new Map(items.map((c) => [String(c.key), c]))
	return (
		<MotionConfig reducedMotion="user">
			<span className="sr-only" aria-live="polite">{msg}</span>
			<div className={className}>
				{order.map((k, i) => {
					const c = byKey.get(k)
					if (!c) return null
					return (
						<motion.div
							key={k}
							layout="position"
							transition={{ type: 'spring', stiffness: 520, damping: 40 }}
							ref={(n: HTMLDivElement | null) => { if (n) refs.current.set(k, n); else refs.current.delete(k) }}
							className={`group/tile relative min-w-0 ${drag === k ? 'z-30 rounded-2xl opacity-90 ring-2 ring-primary/50' : ''} ${itemClass ? itemClass(c) : ''}`}>
							<Grip label={labelOf ? `جابه‌جاییِ «${labelOf(k)}» — جایگاهِ ${i + 1} از ${order.length}` : `جابه‌جایی کاشی ${i + 1} از ${order.length}`} onPointerDown={start(k)} onKeyDown={key(k)} />
							{c}
						</motion.div>
					)
				})}
			</div>
		</MotionConfig>
	)
}
