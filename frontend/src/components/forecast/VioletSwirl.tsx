/**
 * «گردابِ بنفش» — پس‌زمینهٔ WebGL برای کاشیِ اصلیِ بنتوی پیش‌بینی: fbm با domain-warp روی پالتِ آرومین.
 * خاموش می‌شود: بیرون از دیدرس (IntersectionObserver)، تبِ پنهان (visibilitychange)، یا prefers-reduced-motion (یک فریمِ ثابت).
 * بدونِ WebGL: گرادیانِ CSS با همان رنگ‌ها.
 */
import { useEffect, useRef, useState } from 'react'

const VERT_SRC = `
attribute vec2 a_position;
void main() {
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG_SRC = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colors[4];

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		v += amp * noise(p);
		p = p * 2.0 + vec2(1.7, 9.2);
		amp *= 0.5;
	}
	return v;
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution.xy;
	vec2 p = uv * 2.0 - 1.0;
	p.x *= u_resolution.x / u_resolution.y;
	float t = u_time * 0.06;

	vec2 q = vec2(fbm(p + t), fbm(p + vec2(1.3, 2.1) - t));
	vec2 r = vec2(fbm(p + 3.6 * q + vec2(1.7, 9.2) + t * 0.7), fbm(p + 3.6 * q + vec2(8.3, 2.8) - t * 0.7));
	float swirl = fbm(p + 3.4 * r);

	float angle = atan(p.y, p.x);
	float radius = length(p);
	swirl += 0.14 * sin(angle * 3.0 + radius * 4.0 - u_time * 0.15);

	vec3 col = mix(u_colors[0], u_colors[1], smoothstep(0.1, 0.65, swirl));
	col = mix(col, u_colors[2], smoothstep(0.35, 0.85, r.x));
	float glint = pow(clamp(q.x * r.y, 0.0, 1.0), 4.0);
	col = mix(col, u_colors[3], glint * 0.5);

	gl_FragColor = vec4(col, 1.0);
}
`

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16)
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const PALETTE = ['#004991', '#910D6A', '#3b0764', '#FCBF00'].map(hexToRgb)
const FALLBACK_GRADIENT = 'radial-gradient(120% 120% at 15% 10%, #004991 0%, #3b0764 45%, #910D6A 75%, #FCBF00 100%)'

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type)
	if (!shader) return null
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null }
	return shader
}
function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
	const program = gl.createProgram()
	if (!program) return null
	gl.attachShader(program, vs)
	gl.attachShader(program, fs)
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null }
	return program
}

function useReducedMotion() {
	const [r, setR] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
	useEffect(() => {
		const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
		if (!mq) return
		const u = () => setR(mq.matches)
		mq.addEventListener?.('change', u)
		return () => mq.removeEventListener?.('change', u)
	}, [])
	return r
}

export default function VioletSwirl({ className = '' }: { className?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const [supported, setSupported] = useState(true)
	const reduced = useReducedMotion()

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const gl = (canvas.getContext('webgl') ?? (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)) as WebGLRenderingContext | null
		if (!gl) { setSupported(false); return }
		const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
		const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
		const program = vs && fs ? linkProgram(gl, vs, fs) : null
		if (!program) { setSupported(false); return }
		gl.useProgram(program)

		const buf = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, buf)
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
		const posLoc = gl.getAttribLocation(program, 'a_position')
		gl.enableVertexAttribArray(posLoc)
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

		const uRes = gl.getUniformLocation(program, 'u_resolution')
		const uTime = gl.getUniformLocation(program, 'u_time')
		const uColors = gl.getUniformLocation(program, 'u_colors')
		const colorsFlat = new Float32Array(PALETTE.flat())

		let raf = 0
		let visible = true
		let destroyed = false
		const t0 = performance.now()

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
			const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
			const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
			if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h) }
		}
		const draw = (time: number) => {
			resize()
			gl.uniform2f(uRes, canvas.width, canvas.height)
			gl.uniform1f(uTime, reduced ? 0 : (time - t0) / 1000)
			gl.uniform3fv(uColors, colorsFlat)
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
		}
		const loop = (time: number) => {
			if (destroyed || !visible || document.hidden) { raf = 0; return }
			draw(time)
			raf = requestAnimationFrame(loop)
		}

		draw(performance.now())
		if (!reduced) raf = requestAnimationFrame(loop)

		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting
			if (visible && !reduced && !raf && !destroyed && !document.hidden) raf = requestAnimationFrame(loop)
		})
		io.observe(canvas)

		const onVisibility = () => { if (!document.hidden && visible && !reduced && !raf && !destroyed) raf = requestAnimationFrame(loop) }
		document.addEventListener('visibilitychange', onVisibility)

		const ro = new ResizeObserver(() => { if (reduced) draw(performance.now()) })
		ro.observe(canvas)

		return () => {
			destroyed = true
			cancelAnimationFrame(raf)
			io.disconnect()
			ro.disconnect()
			document.removeEventListener('visibilitychange', onVisibility)
			gl.deleteBuffer(buf)
			gl.deleteProgram(program)
			gl.deleteShader(vs)
			gl.deleteShader(fs)
		}
	}, [reduced])

	return (
		<div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
			{supported ? <canvas ref={canvasRef} className="absolute inset-0 size-full" /> : <div className="absolute inset-0" style={{ background: FALLBACK_GRADIENT }} />}
		</div>
	)
}
