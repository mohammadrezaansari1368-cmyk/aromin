/**
 * تمِ رابط کاربری — ۳ تم (رنگِ اصلیِ برند) × روشن/تیره. فقط ظاهر؛ هیچ داده‌ای را لمس نمی‌کند.
 * ذخیره در localStorage['aromin.ui.theme'] (کلیدِ جدا از «aromin.theme» اپِ کامل).
 * اسکریپتِ کوچکِ index.html همین را قبل از رندر اعمال می‌کند تا رنگ پرش نکند.
 */
import { useSyncExternalStore } from 'react'

export type ThemeName = 'purple' | 'blue' | 'gold'
export type Mode = 'light' | 'dark'
export interface ThemeState { theme: ThemeName; mode: Mode }

export const THEMES: { id: ThemeName; label: string; swatch: [string, string, string] }[] = [
	{ id: 'purple', label: 'بنفشِ آرومین', swatch: ['#910D6A', '#004991', '#FCBF00'] },
	{ id: 'blue', label: 'آبیِ آرومین', swatch: ['#004991', '#910D6A', '#FCBF00'] },
	{ id: 'gold', label: 'طلاییِ آرومین', swatch: ['#FCBF00', '#004991', '#910D6A'] },
]
const KEY = 'aromin.ui.theme'
const EVT = 'aromin-theme'

function read(): ThemeState {
	let s: Partial<ThemeState> = {}
	try { s = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { /* حالتِ خصوصی/مسدود */ }
	const theme = THEMES.some((t) => t.id === s.theme) ? (s.theme as ThemeName) : 'purple'
	const mode: Mode = s.mode === 'dark' || s.mode === 'light' ? s.mode : typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
	return { theme, mode }
}
let state = read()

function apply(s: ThemeState) {
	const r = document.documentElement
	r.dataset.theme = s.theme
	r.dataset.mode = s.mode
}
apply(state)

export function setTheme(next: Partial<ThemeState>) {
	state = { ...state, ...next }
	apply(state)
	try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* */ }
	window.dispatchEvent(new CustomEvent(EVT, { detail: state }))
}
const sub = (cb: () => void) => { window.addEventListener(EVT, cb); return () => window.removeEventListener(EVT, cb) }
export const useTheme = () => useSyncExternalStore(sub, () => state)
export const getTheme = () => state

/** مقدارِ یک توکن به hex (برای SVG/Canvas که var() نمی‌فهمند، مثلِ عقربه‌ها) */
export function tokenHex(name: string): string {
	const v = getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim()
	const m = v.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
	if (!m) return '#910D6A'
	const h = +m[1], s = +m[2] / 100, l = +m[3] / 100
	const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
	const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
	return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** توکن‌هایی که اپِ کاملِ جاسازی‌شده (iframe) لازم دارد — نام‌ها همان متغیرهای پوستهٔ EMBED */
export function legacyVars(): Record<string, string> {
	const c = (n: string) => tokenHex(n)
	return {
		'--e-primary': c('primary'), '--e-primary-2': c('active'), '--e-on-primary': c('primary-foreground'), '--e-primary-ink': c('primary-ink'),
		'--e-secondary': c('secondary'), '--e-accent': c('accent'), '--e-on-accent': c('accent-foreground'), '--e-card': c('card'), '--e-bg': c('bg'), '--e-muted': c('muted'),
		'--e-line': c('border'), '--e-ink': c('text'), '--e-ink-3': c('muted-foreground'), '--e-shadow': c('shadow'),
		'--e-success': c('success'), '--e-warning': c('warning'), '--e-error': c('error'),
	}
}
