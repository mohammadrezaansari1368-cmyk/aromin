/** چهرهٔ احساسیِ دستیار (3.9.81): به‌جای شکلکِ زردِ SVG، همان رباتِ سه‌بعدیِ آرومین در حالت‌های مختلف (/agent/<reaction>.webp)؛ عصبانی = قرمز با دود از سر. LOOKS برای سازگاری و آزمون می‌ماند. */
import type { EmotionState } from './core'

type Look = { m: string; bl: number; br: number; eye: number; by?: number; cls?: string }
const SMILE = 'M22 41 Q32 49 42 41', FLAT = 'M24 43 L40 43', FROWN = 'M23 46 Q32 39 41 46', OPEN = 'M24 40 Q32 52 40 40 Z', O = 'M29 42 Q32 38 35 42 Q32 47 29 42 Z'
export const LOOKS: Record<EmotionState, Look> = {
	neutral: { m: 'M23 42 Q32 45 41 42', bl: 0, br: 0, eye: 1 },
	idle: { m: 'M24 42 Q32 44 40 42', bl: 0, br: 0, eye: 0.85 },
	listening: { m: 'M25 42 Q32 45 39 42', bl: -6, br: 6, eye: 1.1, by: -1 },
	thinking: { m: 'M25 43 Q30 41 39 44', bl: -10, br: 0, eye: 0.9, by: -2, cls: 'think' },
	speaking: { m: OPEN, bl: 0, br: 0, eye: 1, cls: 'talk' },
	happy: { m: SMILE, bl: -4, br: 4, eye: 0.9, cls: 'cheek' },
	laugh: { m: OPEN, bl: -8, br: 8, eye: 0.35, cls: 'cheek bounce' },
	curious: { m: 'M25 42 Q32 45 39 41', bl: -12, br: 4, eye: 1.15, by: -2 },
	surprised: { m: O, bl: -6, br: 6, eye: 1.3, by: -4 },
	concerned: { m: FROWN, bl: 12, br: -12, eye: 1 },
	confused: { m: 'M23 44 Q28 41 32 44 Q36 47 41 43', bl: -12, br: 10, eye: 1 },
	serious: { m: FLAT, bl: 6, br: -6, eye: 0.9 },
	annoyed: { m: FLAT, bl: 14, br: -14, eye: 0.6 },
	angry: { m: FROWN, bl: 22, br: -22, eye: 0.8, cls: 'hot' },
	success: { m: SMILE, bl: -6, br: 6, eye: 0.9, cls: 'cheek star' },
	error: { m: FROWN, bl: 10, br: -10, eye: 1, cls: 'err' },
	sleeping: { m: 'M27 43 Q32 45 37 43', bl: 0, br: 0, eye: 0.1, cls: 'zz' },
	sad: { m: FROWN, bl: -14, br: 14, eye: 0.75, by: 1 },
	fear: { m: O, bl: -16, br: 16, eye: 1.25, by: -3 },
	disgust: { m: 'M23 44 Q30 40 35 44 Q38 46 41 42', bl: 10, br: -4, eye: 0.6 },
	smug: { m: 'M25 43 Q34 45 41 40', bl: 4, br: -8, eye: 0.45, by: 1 },
}

/** EmotionState → one of the rendered 3D reactions in public/agent */
export const FACE_OF: Record<EmotionState, string> = {
	neutral: 'listening', idle: 'listening', listening: 'listening', thinking: 'lookdown', speaking: 'joy', happy: 'joy', laugh: 'joy', curious: 'listening',
	surprised: 'surprise', concerned: 'sadness', confused: 'fear', serious: 'lookdown', annoyed: 'anger', angry: 'anger', success: 'joy', error: 'sadness',
	sleeping: 'sleep', sad: 'sadness', fear: 'fear', disgust: 'disgust', smug: 'lookdown',
}
// widget-agent.js runs as a classic script from the dashboard origin: the images live next to it
const CS = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null
const FACE_BASE = CS && CS.src ? new URL(CS.src).origin : ''

export const FACE_SVG = '<img class="af" alt="" aria-hidden="true" draggable="false" decoding="async">'

export const FACE_CSS = `
.af{width:100%;height:100%;display:block;object-fit:contain;transform-origin:50% 90%;animation:af-breathe 4s ease-in-out infinite}
.af.talk,.af.speaking{animation:af-talk .5s ease-in-out infinite alternate}
.af.happy,.af.laugh,.af.success{animation:af-hop .55s cubic-bezier(.3,.7,.4,1) 2}
.af.angry,.af.annoyed{animation:af-shake .12s linear 6}
.af.surprised{animation:af-pop .35s ease-out 1}
@keyframes af-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes af-talk{from{transform:translateY(0)}to{transform:translateY(-2px) scale(1.02)}}
@keyframes af-hop{0%,100%{transform:translateY(0)}45%{transform:translateY(-18%)}}
@keyframes af-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
@keyframes af-pop{0%{transform:scale(.85)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.af{animation:none!important}}
`

/** حالت را روی چهره اعمال می‌کند: فقط کلاس و تصویرِ همان واکنشِ سه‌بعدی (بدونِ بازسازیِ DOM) */
export function applyState(el: Element, s: EmotionState) {
	const L = LOOKS[s] || LOOKS.neutral
	// keep the host's own sizing class (widget.js header avatar «hav») — 3.9.83: without it the avatar filled the phone screen
	el.setAttribute('class', (el.classList.contains('hav') ? 'hav ' : '') + 'af ' + s + ' ' + (L.cls || ''))
	const src = FACE_BASE + '/agent/' + (FACE_OF[s] || 'listening') + '.webp'
	if (el.getAttribute('src') !== src) el.setAttribute('src', src)
	el.setAttribute('data-state', s)
}
