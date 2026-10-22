/**
 * The council table (3.9.75): a slowly turning dotted Earth — 4.6k land points from Natural Earth 110m (world-atlas, public domain),
 * precomputed into /council/land-dots.json — on a dark ocean sphere with a Fresnel rim glow, tilted so its top reads as a round table.
 * Plain three.js (already a dependency); no motion when the user prefers reduced motion.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

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
		const camera = new THREE.OrthographicCamera(-1.06, 1.06, 1.06, -1.06, 0.1, 10)
		camera.position.z = 3
		const earth = new THREE.Group()
		earth.rotation.x = -0.3                         // pole tilted away: the visible cap is ~20–70°N (Iran, Europe, Asia)
		scene.add(earth)
		earth.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ color: 0x0b1d2e })))
		const grid = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1.001, 24, 16)),
			new THREE.LineBasicMaterial({ color: 0x37bdf8, transparent: true, opacity: 0.05 }))
		earth.add(grid)
		const rim = new THREE.Mesh(new THREE.SphereGeometry(1.04, 64, 48), new THREE.ShaderMaterial({
			transparent: true, side: THREE.BackSide, depthWrite: false,
			vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
			fragmentShader: 'varying vec3 n; void main(){ float i = pow(0.75 - dot(n, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.22,0.74,0.97,1.0) * i; }',
		}))
		scene.add(rim)
		const dot = document.createElement('canvas'); dot.width = dot.height = 32
		const g = dot.getContext('2d')
		if (g) { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill() }
		let dots: THREE.Points | null = null
		let alive = true
		fetch('/council/land-dots.json').then((r) => r.json()).then((a: number[]) => {
			if (!alive) return
			const pos = new Float32Array((a.length / 2) * 3)
			for (let i = 0; i < a.length; i += 2) {
				const lat = (a[i] * Math.PI) / 180, lon = (a[i + 1] * Math.PI) / 180, j = (i / 2) * 3
				pos[j] = 1.006 * Math.cos(lat) * Math.sin(lon); pos[j + 1] = 1.006 * Math.sin(lat); pos[j + 2] = 1.006 * Math.cos(lat) * Math.cos(lon)
			}
			const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
			dots = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.022, map: new THREE.CanvasTexture(dot), color: 0xa6e4ff, transparent: true, opacity: 1, alphaTest: 0.2, depthWrite: false }))
			earth.add(dots)
		}).catch(() => undefined)
		const resize = () => { const s = el.clientWidth || 1; renderer.setSize(s, el.clientHeight || s, false) }
		resize()
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(el)
		const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
		let raf = 0
		const tick = () => { if (!still) earth.rotation.y += 0.0016; renderer.render(scene, camera); raf = requestAnimationFrame(tick) }
		tick()
		return () => {
			alive = false; cancelAnimationFrame(raf); ro?.disconnect()
			scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.() })
			renderer.dispose(); renderer.domElement.remove()
		}
	}, [])
	return <div ref={host} className={className} style={style} aria-hidden="true" data-testid="council-globe" />
}
