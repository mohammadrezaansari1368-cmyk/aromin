/**
 * The council table (3.9.77): a turning dotted Earth — 4.6k land points from Natural Earth 110m (world-atlas, public domain) in
 * /council/land-dots.json — on a lit ocean sphere with a double Fresnel atmosphere, warm city lights, a tilted orbit ring, a starfield,
 * and brand-coloured light arcs that fly from Rasht (AROMIN) and Tehran to world hubs. Iran faces the room at start.
 * Plain three.js (already a dependency); everything stands still when the user prefers reduced motion.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const HUBS: [number, number][] = [[37.28, 49.58], [35.69, 51.39], [25.2, 55.27], [41.0, 28.97], [51.5, -0.12], [50.11, 8.68], [31.23, 121.47],
	[19.07, 72.88], [40.71, -74.0], [55.75, 37.62], [1.35, 103.82], [-33.87, 151.2], [48.86, 2.35], [35.68, 139.69]]
const ROUTES: [number, number][] = [[0, 2], [0, 3], [1, 4], [1, 6], [0, 9], [1, 7], [0, 5], [1, 8], [0, 10], [1, 13], [0, 12], [1, 11]]
const vec = (lat: number, lon: number, r = 1) => {
	const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180
	return new THREE.Vector3(r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b))
}

export default function Globe({ className, style }: { className?: string; style?: React.CSSProperties }) {
	const host = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const el = host.current
		if (!el) return
		let renderer: THREE.WebGLRenderer
		try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch { return }     // no WebGL → the CSS glow stays
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
		el.appendChild(renderer.domElement)
		const scene = new THREE.Scene()
		const camera = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, 0.1, 20)
		camera.position.z = 5
		const time = { value: 0 }

		// starfield behind the planet
		const sp = new Float32Array(900 * 3), ss = new Float32Array(900)
		for (let i = 0; i < 900; i++) { sp[i * 3] = (Math.random() * 2 - 1) * 1.12; sp[i * 3 + 1] = (Math.random() * 2 - 1) * 1.12; sp[i * 3 + 2] = -3; ss[i] = Math.random() }
		const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('seed', new THREE.BufferAttribute(ss, 1))
		scene.add(new THREE.Points(sg, new THREE.ShaderMaterial({
			transparent: true, depthWrite: false, uniforms: { time },
			vertexShader: 'attribute float seed; varying float s; uniform float time; void main(){ s = 0.35 + 0.65 * abs(sin(time*0.6 + seed*40.0)); gl_PointSize = 1.0 + seed*1.6; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
			fragmentShader: 'varying float s; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(0.75,0.88,1.0, s*(1.0-d*2.0)*0.55); }',
		})))

		const earth = new THREE.Group()
		earth.rotation.x = -0.3                                       // pole tilted away: the visible cap is ~20–70°N
		const spin = new THREE.Group(); spin.rotation.y = (-50 * Math.PI) / 180   // Iran (≈50°E) faces the room
		earth.add(spin); scene.add(earth)

		// lit ocean: deep navy, sun from the upper left, brighter limb
		spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
			vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); v = normalize((modelViewMatrix*vec4(position,1.0)).xyz); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
			fragmentShader: 'varying vec3 n; varying vec3 v; void main(){ float sun = max(dot(n, normalize(vec3(-0.5,0.6,0.7))), 0.0); float rim = pow(1.0 - max(dot(n, vec3(0.0,0.0,1.0)),0.0), 2.5);'
				+ ' vec3 c = mix(vec3(0.02,0.07,0.13), vec3(0.05,0.17,0.29), sun) + vec3(0.13,0.45,0.75)*rim*0.55; gl_FragColor = vec4(c,1.0); }',
		})))
		spin.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1.002, 36, 18)), new THREE.LineBasicMaterial({ color: 0x37bdf8, transparent: true, opacity: 0.035 })))

		// atmosphere: inner additive halo + outer back-side glow
		const halo = (r: number, side: THREE.Side, pow: number, k: number) => new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.ShaderMaterial({
			transparent: true, side, depthWrite: false, blending: THREE.AdditiveBlending,
			vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
			fragmentShader: `varying vec3 n; void main(){ float i = pow(${side === THREE.BackSide ? '0.78 - dot(n, vec3(0.0,0.0,1.0))' : '1.0 - abs(dot(n, vec3(0.0,0.0,1.0)))'}, ${pow.toFixed(1)}); gl_FragColor = vec4(0.22,0.74,0.97,1.0) * i * ${k.toFixed(2)}; }`,
		}))
		scene.add(halo(1.12, THREE.BackSide, 3.0, 1.0))
		earth.add(halo(1.01, THREE.FrontSide, 4.0, 0.55))

		// tilted orbit ring
		const ring = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.0025, 8, 200), new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.18 }))
		ring.rotation.set(1.25, 0.25, 0); scene.add(ring)

		const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); if (g) { const r = g.createRadialGradient(16, 16, 0, 16, 16, 15); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32) } return new THREE.CanvasTexture(c) })()
		let alive = true
		fetch('/council/land-dots.json').then((r) => r.json()).then((a: number[]) => {
			if (!alive) return
			const n = a.length / 2, pos = new Float32Array(n * 3), seed = new Float32Array(n)
			for (let i = 0; i < n; i++) { const p = vec(a[i * 2], a[i * 2 + 1], 1.006); pos.set([p.x, p.y, p.z], i * 3); seed[i] = Math.random() }
			const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
			spin.add(new THREE.Points(geo, new THREE.ShaderMaterial({
				transparent: true, depthWrite: false, uniforms: { time, map: { value: dotTex } },
				vertexShader: 'attribute float seed; varying float s; varying float c; uniform float time; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vec3 nn = normalize(normalMatrix*position);'
					+ ' s = smoothstep(-0.1, 0.6, nn.z) * (0.55 + 0.45*max(dot(nn, normalize(vec3(-0.5,0.6,0.7))),0.0)); c = step(0.94, seed) * (0.6 + 0.4*sin(time*2.0 + seed*90.0));'
					+ ' gl_PointSize = (c > 0.0 ? 5.0 : 3.2) * (1.0 + seed*0.4); gl_Position = projectionMatrix*mv; }',
				fragmentShader: 'uniform sampler2D map; varying float s; varying float c; void main(){ vec4 t = texture2D(map, gl_PointCoord); vec3 col = mix(vec3(0.62,0.88,1.0), vec3(1.0,0.78,0.25), c); gl_FragColor = vec4(col, t.a * max(s, c*s*1.6)); if (gl_FragColor.a < 0.03) discard; }',
			})))
		}).catch(() => undefined)
		// Iran in the flag's three colours (green / white / red stripes by latitude), denser and brighter than the rest of the world
		fetch('/council/iran-dots.json').then((r) => r.json()).then((a: number[]) => {
			if (!alive) return
			const FLAG = [[0.14, 0.62, 0.25], [1, 1, 1], [0.85, 0.0, 0.0]]
			const n = a.length / 3, pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
			for (let i = 0; i < n; i++) { const p = vec(a[i * 3], a[i * 3 + 1], 1.009); pos.set([p.x, p.y, p.z], i * 3); col.set(FLAG[a[i * 3 + 2]], i * 3) }
			const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
			spin.add(new THREE.Points(geo, new THREE.ShaderMaterial({
				transparent: true, depthWrite: false, uniforms: { map: { value: dotTex } },
				vertexShader: 'attribute vec3 color; varying vec3 vc; varying float s; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vec3 nn = normalize(normalMatrix*position); s = smoothstep(-0.1, 0.5, nn.z); vc = color; gl_PointSize = 4.6; gl_Position = projectionMatrix*mv; }',
				fragmentShader: 'uniform sampler2D map; varying vec3 vc; varying float s; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vc, t.a * s); if (gl_FragColor.a < 0.05) discard; }',
			})))
		}).catch(() => undefined)

		// light arcs between hubs (purple → gold), drawn and faded on a loop
		const arcs = ROUTES.map(([a, b], i) => {
			const A = vec(...HUBS[a]), B = vec(...HUBS[b]), N = 64, pts: THREE.Vector3[] = []
			const lift = 0.12 + A.distanceTo(B) * 0.22
			for (let k = 0; k <= N; k++) { const t = k / N; pts.push(A.clone().lerp(B, t).normalize().multiplyScalar(1 + Math.sin(Math.PI * t) * lift)) }
			const geo = new THREE.BufferGeometry().setFromPoints(pts)
			const col = new Float32Array((N + 1) * 3)
			for (let k = 0; k <= N; k++) { const t = k / N; col.set([0.57 + 0.42 * t, 0.05 + 0.7 * t, 0.42 - 0.42 * t], k * 3) }
			geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
			const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
			spin.add(line)
			return { line, geo, N, delay: i * 0.55 }
		})
		// pulsing beacons on Rasht (AROMIN) and Tehran
		const beacons = [0, 1].map((h) => {
			const p = vec(...HUBS[h], 1.012)
			const m = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 32), new THREE.MeshBasicMaterial({ color: h ? 0x8fdcff : 0xfcbf00, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
			m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2)); spin.add(m)
			return m
		})

		const resize = () => { const s = el.clientWidth || 1; renderer.setSize(s, el.clientHeight || s, false) }
		resize()
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(el)
		const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
		const clock = new THREE.Clock()
		let raf = 0
		const tick = () => {
			const t = still ? 6 : clock.getElapsedTime()
			time.value = t
			if (!still) { spin.rotation.y += 0.0012; ring.rotation.z += 0.0006 }
			arcs.forEach((a) => {
				const cyc = ((t - a.delay) % 7 + 7) % 7
				a.geo.setDrawRange(0, Math.max(2, Math.round(Math.min(1, cyc / 1.8) * a.N)))
				;(a.line.material as THREE.LineBasicMaterial).opacity = cyc < 4.5 ? 0.85 : Math.max(0, 0.85 * (1 - (cyc - 4.5) / 1.5))
			})
			beacons.forEach((b, i) => { const k = 1 + ((t * 0.8 + i * 0.5) % 1) * 2.2; b.scale.setScalar(k); (b.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (k - 1) / 2.2) })
			renderer.render(scene, camera)
			raf = requestAnimationFrame(tick)
		}
		tick()
		return () => {
			alive = false; cancelAnimationFrame(raf); ro?.disconnect()
			scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.() })
			dotTex.dispose(); renderer.dispose(); renderer.domElement.remove()
		}
	}, [])
	return <div ref={host} className={className} style={style} aria-hidden="true" data-testid="council-globe" />
}
