/** چهرهٔ احساسیِ دستیار: SVG/CSSِ اختصاصیِ آرومین (بدونِ دارایی کپی‌شده). رنگ‌ها: آبی #004991، بنفش #910D6A، زرد #FCBF00. */
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

export const FACE_SVG = '<svg class="af" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g class="af-b">' +
	'<circle class="af-h" cx="32" cy="32" r="28"/><circle class="af-ck" cx="17" cy="40" r="4"/><circle class="af-ck" cx="47" cy="40" r="4"/>' +
	'<g class="af-g"><ellipse class="af-e" cx="23" cy="30" rx="3.6" ry="4.6"/><ellipse class="af-e" cx="41" cy="30" rx="3.6" ry="4.6"/></g>' +
	'<path class="af-br l" d="M17 21 L28 21"/><path class="af-br r" d="M36 21 L47 21"/><path class="af-m" d="M23 42 Q32 45 41 42"/>' +
	'<text class="af-z" x="46" y="16">z</text><text class="af-s" x="48" y="15">✦</text></g></svg>'

export const FACE_CSS = `
.af{width:100%;height:100%;display:block;overflow:visible}
.af-h{fill:#FCBF00;stroke:#004991;stroke-width:2.5}
.af-e{fill:#004991;transform-box:fill-box;transform-origin:center;transform:scaleY(var(--eye,1));transition:transform .25s}
.af-g{transform:translate(var(--gx,0px),var(--gy,0px));transition:transform .2s}
.af-br{stroke:#004991;stroke-width:2.6;stroke-linecap:round;fill:none;transform-box:fill-box;transform-origin:center;transition:transform .3s}
.af-br.l{transform:translateY(var(--by,0px)) rotate(var(--bl,0deg))}.af-br.r{transform:translateY(var(--by,0px)) rotate(var(--br,0deg))}
.af-m{fill:none;stroke:#910D6A;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round;transition:d .25s}
.af.talk .af-m,.af.laugh .af-m,.af.surprised .af-m{fill:#910D6A}
.af-ck{fill:#910D6A;opacity:0;transition:opacity .3s}.af.cheek .af-ck{opacity:.28}
.af-z,.af-s{font:700 10px sans-serif;fill:#004991;opacity:0}.af.zz .af-z{opacity:1;animation:af-z 2.4s infinite}.af.star .af-s{opacity:1;fill:#910D6A}
.af.err .af-h{stroke:#910D6A}.af.hot .af-h{fill:#ffb199}
.af-b{transform-origin:32px 34px;animation:af-breathe 4s ease-in-out infinite}
.af .af-e{animation:af-blink 5s infinite}.af.zz .af-e{animation:none}
.af.talk .af-m{animation:af-talk .32s ease-in-out infinite alternate}
.af.bounce .af-b{animation:af-bounce .5s ease-in-out infinite alternate}
.af.think .af-g{--gx:2px;--gy:-2px}
@keyframes af-blink{0%,94%,100%{transform:scaleY(var(--eye,1))}96%{transform:scaleY(.08)}}
@keyframes af-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
@keyframes af-talk{from{transform:scaleY(.6)}to{transform:scaleY(1)}}
@keyframes af-bounce{from{transform:translateY(0)}to{transform:translateY(-2px)}}
@keyframes af-z{0%{transform:translate(0,0);opacity:0}30%{opacity:1}100%{transform:translate(4px,-6px);opacity:0}}
.af-m{transform-box:fill-box;transform-origin:center}
@media (prefers-reduced-motion:reduce){.af *,.af{animation:none!important;transition:none!important}}
`

/** حالت را روی SVG اعمال می‌کند (فقط ویژگی و متغیرِ CSS؛ بدونِ بازسازیِ DOM) */
export function applyState(svg: SVGElement, s: EmotionState) {
	const L = LOOKS[s] || LOOKS.neutral
	svg.setAttribute('class', 'af ' + s + ' ' + (L.cls || ''))
	svg.querySelector('.af-m')?.setAttribute('d', L.m)
	const st = (svg as unknown as HTMLElement).style
	st.setProperty('--eye', String(L.eye)); st.setProperty('--bl', L.bl + 'deg'); st.setProperty('--br', L.br + 'deg'); st.setProperty('--by', (L.by || 0) + 'px')
	svg.setAttribute('data-state', s)
}
