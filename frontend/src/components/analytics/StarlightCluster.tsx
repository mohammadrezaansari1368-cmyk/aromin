'use client'

/**
 * آمپرهای دیجیتالِ «Starlight Cluster» (بستهٔ طراحی) — بالای تبِ «تحلیل مدیریتی»، کدهای B22–B32.
 * یک کاشیِ لوگو، یک کاشیِ سه‌گیج (توان · سرعت · باتری) و ۹ گیجِ تکی؛ هر کاشی آسمانِ پرستارهٔ خودش و «فیلمِ» ورود دارد.
 * همهٔ گیج‌ها فقط `useStarlightData()` را می‌خوانند (فعلاً شبیه‌ساز؛ به داده وصل نیست).
 * هندسه، رنگ و زمان‌بندی عیناً از README بسته؛ کاشی‌ها با دستگیرهٔ ⠿ جابه‌جا می‌شوند.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Sortable from '@/components/ui/sortable'
import logoUrl from '@/assets/starlight-logo.png'
import { useStarlightData, type StarlightData } from './starlightData'
import { BTN_GHOST, CARD, CARD_PAD, CARD_TITLE } from '@/components/ui/tokens'

const ACC = '#e8eeff', WARN = 'oklch(0.8 0.13 70)'
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const ease = (x: number) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const pt = (r: number, a: number) => [+(100 + r * Math.sin((a * Math.PI) / 180)).toFixed(2), +(100 - r * Math.cos((a * Math.PI) / 180)).toFixed(2)]
const pad = (n: number) => String(n).padStart(2, '0')

type Key = 'speed' | 'rpm' | 'power' | 'battery' | 'range' | 'motor' | 'fuel' | 'cabin' | 'clock'
type Tick = { x1: number; y1: number; x2: number; y2: number; w: number; base: number; f: number }
type Label = { x: number; y: number; txt: string; f: number }
type Cfg = { label: string; fa: string; unit: string; min: number; max: number; major: number; minor: number; get: (s: StarlightData) => number; txt: (v: number, s: StarlightData) => string; warn?: (s: StarlightData) => boolean; lab?: (v: number) => string; ticks?: Tick[]; labels?: Label[] }

const CFG = {
	speed: { label: 'SPEED', fa: 'سرعت', unit: 'KM/H', min: 0, max: 280, major: 40, minor: 4, get: (s) => s.speed, txt: (v) => String(Math.round(v)) },
	rpm: { label: 'ENGINE', fa: 'دورِ موتور', unit: 'RPM × 1000', min: 0, max: 7, major: 1, minor: 5, get: (s) => s.rpm / 1000, txt: (v) => v.toFixed(1), warn: (s) => s.rpm > 6000 },
	power: { label: 'POWER', fa: 'توان', unit: '%', min: 0, max: 100, major: 20, minor: 4, get: (s) => s.power, txt: (v) => String(Math.round(v)) },
	battery: { label: 'BATTERY', fa: 'باتری', unit: '%', min: 0, max: 100, major: 25, minor: 5, get: (s) => s.battery, txt: (v) => String(Math.round(v)), warn: (s) => s.battery < 20 },
	range: { label: 'RANGE', fa: 'پیمایش', unit: 'KM', min: 0, max: 900, major: 150, minor: 3, get: (s) => s.range, txt: (v) => String(Math.round(v)), warn: (s) => s.range < 80 },
	motor: { label: 'MOTOR TEMP', fa: 'دمای موتور', unit: '°C', min: 20, max: 120, major: 20, minor: 4, get: (s) => s.motorTemp, txt: (v) => String(Math.round(v)), warn: (s) => s.motorTemp > 95 },
	fuel: { label: 'FUEL', fa: 'سوخت', unit: '%', min: 0, max: 100, major: 25, minor: 5, get: (s) => s.fuel, txt: (v) => String(Math.round(v)), lab: (v) => (v === 0 ? 'E' : v === 100 ? 'F' : v === 50 ? '½' : ''), warn: (s) => s.fuel < 15 },
	cabin: { label: 'CABIN', fa: 'دمای کابین', unit: '°C', min: 10, max: 30, major: 5, minor: 5, get: (s) => s.cabin, txt: (v) => v.toFixed(1) },
	clock: { label: 'TIME', fa: 'ساعت', unit: '', min: 0, max: 24, major: 3, minor: 3, get: (s) => s.now.getHours() + s.now.getMinutes() / 60, txt: (_v, s) => `${pad(s.now.getHours())}:${pad(s.now.getMinutes())}` },
} as Record<Key, Cfg>
for (const c of Object.values(CFG)) {
	const steps = Math.round(((c.max - c.min) / c.major) * c.minor)
	const ticks: Tick[] = [], labels: Label[] = []; c.ticks = ticks; c.labels = labels
	for (let i = 0; i <= steps; i++) {
		const v = c.min + (i * c.major) / c.minor, a = -135 + (i / steps) * 270, maj = i % c.minor === 0
		const [x1, y1] = pt(maj ? 76 : 80, a), [x2, y2] = pt(85, a)
		ticks.push({ x1, y1, x2, y2, w: maj ? 1.1 : 0.5, base: maj ? 0.9 : 0.35, f: i / steps })
		if (maj) { const [x, y] = pt(62, a); labels.push({ x, y, txt: c.lab ? c.lab(v) : String(+v.toFixed(1)), f: i / steps }) }
	}
}

type TileDef = { id: string; code: string; title: string; wide: boolean; logo?: boolean; gauges: [Key, string][] }
const SINGLES: Key[] = ['speed', 'rpm', 'power', 'battery', 'range', 'motor', 'fuel', 'cabin', 'clock']
const TILES: TileDef[] = [
	{ id: 'logo', code: 'B22', title: 'Welcome', wide: true, logo: true, gauges: [] },
	{ id: 'triple', code: 'B23', title: 'Cluster', wide: true, gauges: [['power', '27%'], ['speed', '36%'], ['battery', '27%']] },
	...SINGLES.map((k, i) => ({ id: k, code: 'B' + (24 + i), title: CFG[k].label, wide: false, gauges: [[k, '86%']] as [Key, string][] })),
]

/* ---------------- آسمانِ پرستاره ---------------- */
type Star = { x: number; y: number; s: number; layer: number; f: number; p: number; d: number; px: number; c: string }
function makeStars(seed: number, n: number): Star[] {
	const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
	const out: Star[] = []
	for (let i = 0; i < n; i++) {
		const g = (r() + r() + r()) / 3 - 0.5, x = r() * 1.2 - 0.1, layer = r() < 0.55 ? 0 : r() < 0.66 ? 1 : 2, c = r()
		out.push({ x, y: 0.55 + g * 0.8 - (x - 0.5) * 0.18, s: [0.5, 0.8, 1.2][layer] + r() * [0.6, 0.9, 1.4][layer], layer, f: 0.5 + r() * 2.5, p: r() * 6.28, d: r(), px: [0.004, 0.012, 0.024][layer], c: c < 0.85 ? '255,255,255' : c < 0.95 ? '170,204,255' : '255,230,179' })
	}
	return out
}
function makeSprites() {
	const sprites: Record<string, HTMLCanvasElement> = {}
	for (const c of ['255,255,255', '170,204,255', '255,230,179']) {
		const sc = document.createElement('canvas'); sc.width = sc.height = 32
		const x = sc.getContext('2d')!, g = x.createRadialGradient(16, 16, 0, 16, 16, 16)
		g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, `rgba(${c},0.9)`); g.addColorStop(0.3, `rgba(${c},0.25)`); g.addColorStop(1, `rgba(${c},0)`)
		x.fillStyle = g; x.fillRect(0, 0, 32, 32); sprites[c] = sc
	}
	return sprites
}

/* ---------------- یک گیج ---------------- */
// پیشرفتِ روشن‌شدنِ درجه‌ها (۰…۱، گام ۰٫۰۲)؛ بعد از فیلم ثابت = ۱ ← لایه‌های memo دیگر رندر نمی‌شوند
const tickPhase = (lt: number) => Math.round(clamp((lt - 0.9) / 1.55, 0, 1) * 50) / 50
const tickOpAt = (p: number) => (x: number) => (p >= 1 ? 1 : clamp((0.9 + p * 1.55 - 0.9 - x * 1.2) / 0.35, 0, 1))
const Ticks = memo(function Ticks({ k, p }: { k: Key; p: number }) {
	const op = tickOpAt(p)
	return <>{(CFG[k].ticks ?? []).map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#e8eeff" strokeWidth={t.w} opacity={+(t.base * op(t.f)).toFixed(2)} strokeLinecap="round" />)}</>
})
const Labels = memo(function Labels({ k, p }: { k: Key; p: number }) {
	const op = tickOpAt(p)
	return <>{(CFG[k].labels ?? []).map((l, i) => (
		<div key={i} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2 tabular-nums" style={{ left: `${l.x / 2}%`, top: `${l.y / 2}%`, fontSize: '4.6cqw', fontWeight: 300, color: '#e3e8f4', opacity: +op(l.f).toFixed(2) }}>{l.txt}</div>
	))}</>
})
function gaugeView(key: Key, lt: number, s: StarlightData, big: boolean) {
	const c = CFG[key], val = c.get(s), frac = clamp((val - c.min) / (c.max - c.min), 0, 1)
	const up = ease((lt - 2.2) / 1.1), down = ease((lt - 3.4) / 1.2)
	const f = lt < 3.4 ? up : 1 + (frac - 1) * down
	const warn = c.warn ? c.warn(s) : false
	return {
		c, value: c.txt(val, s), frac, f, warn,
		font: key === 'clock' ? '15cqw' : big ? '20cqw' : '18cqw',
		color: warn ? WARN : ACC, text: warn ? WARN : '#f4f6ff',
		needleOp: clamp((lt - 2) / 0.3, 0, 1), textOp: clamp((lt - 3.9) / 0.7, 0, 1),
	}
}
function Dial({ k, size, lt, s, big }: { k: Key; size: string; lt: number; s: StarlightData; big: boolean }) {
	const g = gaugeView(k, lt, s, big)
	const warnFa = g.warn ? ' — هشدار' : ''
	const p = tickPhase(lt), dash = `${(424.1 * g.f).toFixed(1)} 565.5`
	return (
		<div role="img" aria-label={`${g.c.fa}: ${g.value} ${g.c.unit}${warnFa}`} className="relative aspect-square max-h-full" style={{ width: size, containerType: 'inline-size' }}>
			<svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible" aria-hidden>
				<circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" strokeLinecap="round" transform="rotate(135 100 100)" style={{ strokeDasharray: '424.1 565.5' }} />
				{/* درخشش با خطِ پهنِ کم‌رنگ زیرِ خطِ اصلی (به‌جای filter که در هر به‌روزرسانی گران است) */}
				<circle cx="100" cy="100" r="90" fill="none" stroke={g.color} strokeWidth="3.2" strokeOpacity="0.12" strokeLinecap="round" transform="rotate(135 100 100)" style={{ strokeDasharray: dash }} />
				<circle cx="100" cy="100" r="90" fill="none" stroke={g.color} strokeWidth="1.8" strokeOpacity="0.22" strokeLinecap="round" transform="rotate(135 100 100)" style={{ strokeDasharray: dash }} />
				<circle cx="100" cy="100" r="90" fill="none" stroke={g.color} strokeWidth="0.9" strokeLinecap="round" transform="rotate(135 100 100)" style={{ strokeDasharray: dash }} />
				<Ticks k={k} p={p} />
				<g transform={`rotate(${(-135 + g.f * 270).toFixed(2)} 100 100)`} opacity={g.needleOp}>
					<line x1="100" y1="42" x2="100" y2="12" stroke={g.color} strokeWidth="4.5" strokeOpacity="0.14" strokeLinecap="round" />
					<line x1="100" y1="42" x2="100" y2="12" stroke={g.color} strokeWidth="1.4" strokeLinecap="round" />
					<circle cx="100" cy="12" r="4.5" fill="#fff" fillOpacity="0.16" />
					<circle cx="100" cy="12" r="1.8" fill="#fff" />
				</g>
			</svg>
			<Labels k={k} p={p} />
			<div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: '1cqw', opacity: g.textOp }}>
				<div className="tabular-nums" style={{ fontSize: g.font, fontWeight: 200, lineHeight: 1, color: g.text, textShadow: '0 0 14px rgba(220,230,255,0.55)' }}>{g.value}</div>
				<div style={{ fontSize: '3.4cqw', letterSpacing: '0.2em', color: '#8d93a1' }}>{g.c.unit}</div>
				<div style={{ fontSize: '3.2cqw', letterSpacing: '0.2em', color: '#b4b9c4', marginTop: '1cqw' }}>{Math.round(g.frac * 100)}%</div>
			</div>
			<div aria-hidden className="absolute inset-x-0 text-center" style={{ bottom: '12%', fontSize: '3.6cqw', letterSpacing: '0.3em', color: '#b4b9c4', opacity: g.textOp }}>{g.c.label}</div>
		</div>
	)
}

/* ---------------- بخشِ کامل ---------------- */
const OPEN_KEY = 'aromin.starlight.open'
const REDUCED = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function StarlightCluster() {
	const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } })
	const toggle = () => setOpen((o) => { try { localStorage.setItem(OPEN_KEY, o ? '0' : '1') } catch { /* خصوصی */ } return !o })
	return (
		<section dir="rtl" aria-labelledby="sl-title" className={`mb-4 ${CARD} ${CARD_PAD}`}>
			<header className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
				<div className="min-w-0">
					<h2 id="sl-title" className={CARD_TITLE}>آمپرهای دیجیتال <span className="font-medium text-muted-foreground" dir="ltr">· Starlight</span></h2>
					<p className="text-[11.5px] text-muted-foreground">B22–B32 · دادهٔ شبیه‌سازی‌شده؛ هنوز به دادهٔ سیستم وصل نیست.</p>
				</div>
				<div className="flex items-center gap-2">
					<span title="دادهٔ نمونه — در انتظارِ اتصال به منبعِ واقعی" className="rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] font-bold text-accent-ink ring-1 ring-accent/35">نمونه</span>
					<button type="button" onClick={toggle} aria-expanded={open} aria-controls="sl-body" className={`${BTN_GHOST} min-h-8 px-3 text-[12px]`}>{open ? 'جمع کردن' : 'نمایش'}</button>
				</div>
			</header>
			{open && <ClusterBody />}
		</section>
	)
}

function ClusterBody() {
	const data = useStarlightData()
	const reduced = useRef(REDUCED()).current
	const t0 = useRef(performance.now())
	const now = useCallback(() => (performance.now() - t0.current) / 1000, [])
	// در حالتِ «کاهشِ حرکت» فیلمِ ورود پخش نمی‌شود
	const start = useRef<Record<string, number>>(Object.fromEntries(TILES.map((t, i) => [t.id, reduced ? -100 : i * 0.3])))
	const [t, setT] = useState(0)
	const canvases = useRef(new Map<string, HTMLCanvasElement>())
	const stars = useRef(new Map<string, Star[]>())
	const visible = useRef(new Set<string>())
	const io = useRef<IntersectionObserver | null>(null)

	useEffect(() => {
		io.current = new IntersectionObserver((es) => es.forEach((e) => { const id = (e.target as HTMLElement).dataset.sl!; if (e.isIntersecting) visible.current.add(id); else visible.current.delete(id) }))
		canvases.current.forEach((cv) => io.current!.observe(cv))
		const sprites = makeSprites()
		let raf = 0, lastDraw = -1, lastState = 0
		const draw = () => {
			raf = requestAnimationFrame(draw)
			if (document.hidden) return
			const tt = now(), k = Math.min(devicePixelRatio || 1, 1.5)
			if (tt - lastDraw < (reduced ? 1 : 0.04)) return
			lastDraw = tt
			const tw = reduced ? 0 : tt
			for (const [id, cv] of canvases.current) {
				if (!visible.current.has(id)) continue
				const w = Math.round(cv.clientWidth * k), h = Math.round(cv.clientHeight * k), lt = tt - start.current[id]
				if (!w || !h) continue
				if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
				const ctx = cv.getContext('2d')
				if (!ctx) continue
				ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter'
				const drift = Math.sin(tw * 0.08 + id.length)
				for (const st of stars.current.get(id) || []) {
					const ap = clamp(lt - st.layer * 0.3 - st.d * 1.2, 0, 1)
					const a = (1 - Math.pow(1 - ap, 3)) * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(tw * st.f + st.p)))
					if (a < 0.02) continue
					const x = (st.x + drift * st.px) * w, y = st.y * h, rr = st.s * k * 5
					ctx.globalAlpha = a; ctx.drawImage(sprites[st.c], x - rr, y - rr, rr * 2, rr * 2)
				}
				ctx.globalAlpha = 1
			}
			const intro = Object.values(start.current).some((s) => tt - s < 6)
			if (intro && tt - lastState > 0.05) { lastState = tt; setT(tt) }
		}
		raf = requestAnimationFrame(draw)
		return () => { cancelAnimationFrame(raf); io.current?.disconnect(); io.current = null }
	}, [now, reduced])
	// بعد از فیلم، عقربه‌ها بدونِ نرمی دنبالِ داده می‌روند (هر ۲۵۰ms با خودِ داده)
	useEffect(() => { setT(now()) }, [data, now])

	// رفرنسِ پایدار برای هر کاشی (وگرنه هر رندر بوم جدا/وصل می‌شد و ستاره‌ها چشمک می‌زدند)
	const refCbs = useRef(new Map<string, (el: HTMLCanvasElement | null) => void>())
	const canvasRef = (id: string, i: number, wide: boolean) => {
		let cb = refCbs.current.get(id)
		if (!cb) {
			cb = (el) => {
				if (el) {
					canvases.current.set(id, el); el.dataset.sl = id
					if (!stars.current.has(id)) stars.current.set(id, makeStars(i * 7919 + 13, wide ? 420 : 220))
					io.current?.observe(el)
				} else { const old = canvases.current.get(id); if (old) io.current?.unobserve(old); canvases.current.delete(id); visible.current.delete(id) }
			}
			refCbs.current.set(id, cb)
		}
		return cb
	}
	const replay = (id: string) => { if (!reduced) { start.current[id] = now(); setT(now()) } }
	const replayAll = () => { if (reduced) return; const n = now(); TILES.forEach((tl, i) => (start.current[tl.id] = n + i * 0.3)); setT(n) }

	return (
		<div id="sl-body">
			<div className="mb-2 flex items-center justify-end gap-4 px-1 text-[11px] text-muted-foreground" dir="ltr">
				<span className="flex items-center gap-2" dir="rtl"><span className="size-1.5 rounded-full" style={{ background: data.live ? '#8fe3b0' : '#7d8391' }} />{data.live ? 'دادهٔ زنده' : 'دادهٔ شبیه‌سازی‌شده'}</span>
				{!reduced && <button type="button" onClick={replayAll} className="rounded-lg px-2 py-1 font-bold transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">پخشِ دوبارهٔ همه</button>}
			</div>
			<Sortable id="analytics.starlight" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3" itemClass={(c) => ((c.props as { 'data-wide'?: boolean })['data-wide'] ? 'col-span-full' : '')}>
				{TILES.map((tile, i) => {
					const lt = t - start.current[tile.id]
					return (
						<div key={tile.id} data-wide={tile.wide || undefined} dir="ltr" role="group" aria-label={`کاشی ${tile.code} — ${tile.logo ? 'لوگو' : tile.gauges.map(([k]) => CFG[k].fa).join('، ')}`}
							className="relative overflow-hidden rounded-[14px] bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
							style={{ width: '100%', aspectRatio: tile.wide ? '3 / 1' : '1 / 1', minHeight: 220, fontFamily: "'Outfit', Vazirmatn, sans-serif" }}>
							<canvas ref={canvasRef(tile.id, i, tile.wide)} aria-hidden className="absolute inset-0 size-full" />
							<div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.8) 100%)' }} />
							{tile.logo && (
								<div className="absolute inset-0 grid place-items-center" style={{ opacity: clamp((lt - 1.5) / 1.5, 0, 1) }}>
									<div aria-hidden className="absolute left-1/2 top-1/2 size-[420px] rounded-full" style={{ transform: `translate(-50%,-50%) scale(${reduced ? 1 : (1 + 0.1 * (0.5 - 0.5 * Math.cos((t * Math.PI) / 3))).toFixed(3)})`, background: 'radial-gradient(circle, rgba(200,220,255,0.3) 0%, rgba(150,180,255,0.08) 32%, rgba(0,0,0,0) 64%)' }} />
									<img src={logoUrl} alt="آرومین" className="relative w-24" style={{ filter: 'drop-shadow(0 0 14px rgba(255,255,255,0.5)) brightness(1.08)' }} />
								</div>
							)}
							{tile.gauges.length > 0 && (
								<div className="absolute inset-0 flex items-center justify-center gap-[2%] px-[3%] py-[4%]">
									{tile.gauges.map(([k, size], gi) => <Dial key={k} k={k} size={size} lt={lt - (tile.gauges.length > 1 ? Math.abs(gi - 1) * 0.35 : 0)} s={data} big={tile.gauges.length > 1 && gi === 1} />)}
								</div>
							)}
							<div className="absolute left-[18px] top-[14px] text-[10px] uppercase tracking-[0.3em] text-[#6f7582]">{tile.title} <span className="tracking-normal text-[#4b505b]">{tile.code}</span></div>
							{!reduced && <button type="button" onClick={() => replay(tile.id)} aria-label={`پخشِ دوبارهٔ کاشی ${tile.code}`} className="absolute right-4 top-3 rounded px-1.5 py-1 text-[10px] uppercase tracking-[0.24em] text-[#6f7582] transition hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">Replay</button>}
						</div>
					)
				})}
			</Sortable>
		</div>
	)
}
