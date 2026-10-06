'use client'

/**
 * نشانِ سه‌بعدیِ آرومین — مدلِ روالی ساخته‌شده با img2threejs (logo3d/object-sculpt-spec.json → createAromin.ts).
 * هندسهٔ هر سه قطعه از اندازه‌گیریِ خودِ لوگو آمده (مثلثِ متساوی‌الاضلاع، شکافِ Y از مرکزِ ثقل، گوشهٔ ۰٫۰۷۲L، شکاف ۰٫۰۶۳L).
 * پالایشِ دستی (مجاز در pipeline): اکسترودِ بِوِل‌دار و لاکِ براقِ یکدست به‌جای بافت‌های نمونه‌برداری‌شده.
 * سه‌بعدی فقط وقتی بارگذاری می‌شود که لازم باشد (import پویا) تا صفحهٔ ورود سبک بماند؛ بدونِ WebGL → لوگوی تخت.
 */
import { useEffect, useRef, useState } from 'react'

type Mode = 'hero' | 'front'

const COLORS: Record<string, string> = { 'segment-top': '#015198', 'segment-left': '#8B0A71', 'segment-right': '#FDBE11' }
// جهتِ بیرون‌رفتنِ هر قطعه در انیمیشنِ «سرهم‌شدن» (از مرکزِ ثقل به سمتِ مرکزِ قطعه)
const OUT: Record<string, [number, number]> = { 'segment-top': [0, 1], 'segment-left': [-0.866, -0.5], 'segment-right': [0.866, -0.5] }

export default function Emblem3D({ className = '', mode = 'hero', size = 220, view = 'front', fitRef = false, stripped = false }: { className?: string; mode?: Mode; size?: number; view?: 'front' | 'three-quarter' | 'side'; fitRef?: boolean; stripped?: boolean }) {
	const host = useRef<HTMLDivElement>(null)
	const [fallback, setFallback] = useState(false)

	useEffect(() => {
		const el = host.current
		if (!el) return
		let dead = false
		let cleanup = () => {}
		;(async () => {
			let THREE: typeof import('three')
			let factory: typeof import('./createAromin')
			let RoomEnv: typeof import('three/examples/jsm/environments/RoomEnvironment.js')
			try {
				;[THREE, factory, RoomEnv] = await Promise.all([import('three'), import('./createAromin'), import('three/examples/jsm/environments/RoomEnvironment.js')])
			} catch {
				if (!dead) setFallback(true)
				return
			}
			if (dead) return
			let renderer: import('three').WebGLRenderer
			try {
				renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: mode === 'front' })
			} catch {
				setFallback(true)
				return
			}
			const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || mode === 'front'
			renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
			factory.configureArominEmblemRenderer(renderer)
			renderer.toneMapping = THREE.NeutralToneMapping // ACES رنگِ برند را روشن و صورتی می‌کرد
			renderer.toneMappingExposure = 1.12
			el.appendChild(renderer.domElement)
			renderer.domElement.style.width = '100%'
			renderer.domElement.style.height = '100%'

			const scene = new THREE.Scene()
			const pmrem = new THREE.PMREMGenerator(renderer)
			scene.environment = pmrem.fromScene(new RoomEnv.RoomEnvironment(), 0.04).texture
			scene.environmentIntensity = 0.35
			const camera = new THREE.PerspectiveCamera(mode === 'front' ? 18 : 28, 1, 0.1, 50)
			camera.position.set(0, 0, mode === 'front' ? 3.6 : 2.55)
			// fitRef: همان کادرِ لوگوی مرجع (۳۵۹×۳۰۰، ارتفاعِ لوگو ۴۸٪، مرکز ۹٫۵px بالاتر) برای مقایسهٔ منصفانه
			if (fitRef) { camera.position.set(0, 0.056, 5.19); camera.lookAt(0, 0.056, 0) }

			// نورها طبقِ spec: کلید، پرکننده، لبهٔ طلایی
			const key = new THREE.DirectionalLight(0xffffff, 1.6)
			key.position.set(2, 3, 4)
			scene.add(key, new THREE.HemisphereLight(0xf3e9f7, 0x1a0d18, 0.45))
			const rim = new THREE.DirectionalLight(0xfcbf00, 1.2)
			rim.position.set(-3, 1, -2)
			scene.add(rim)

			const model = factory.createArominEmblemModel()
			const runtime = model.userData.sculptRuntime as { meshes: Record<string, import('three').Mesh> } | undefined
			const segs: { mesh: import('three').Mesh; id: string }[] = []
			const meshes = runtime?.meshes ?? {}
			for (const id of Object.keys(COLORS)) {
				const m = meshes[id] ?? (model.getObjectByName(id) as import('three').Mesh | undefined)
				if (!m || !(m as import('three').Mesh).isMesh) continue
				// پالایشِ دستی: همان نقاطِ پروفایل، با بِوِل برای لبهٔ نرم و براق
				const old = m.geometry as import('three').ExtrudeGeometry
				const shape = (old.parameters?.shapes as import('three').Shape) ?? null
				if (shape) {
					const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 5, steps: 1, curveSegments: 8 })
					g.translate(0, 0, -0.08)
					m.geometry.dispose()
					m.geometry = g
				}
				;(m.material as import('three').Material).dispose?.()
				m.material = stripped
					? new THREE.MeshStandardMaterial({ color: '#9a9a9a', roughness: 0.8 }) // بدونِ مواد: فقط فرم/سیلوئت
					: new THREE.MeshPhysicalMaterial({ color: COLORS[id], metalness: 0.05, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.14 })
				segs.push({ mesh: m, id })
			}
			scene.add(model)
			// مانیفستِ قطعه‌ها برای دروازهٔ part-coverageِ img2threejs (فقط در پیش‌نمایش)
			if (mode === 'front') {
				const parts = segs.map((s) => ({ name: s.id, kind: 'part', module: s.id, triangles: Math.round(((s.mesh.geometry.index?.count ?? s.mesh.geometry.attributes.position.count) / 3)) }))
				;(window as unknown as { __emblemParts?: unknown }).__emblemParts = { model: 'aromin-emblem', parts, unnamedMeshes: 0, integralMeshes: 0 }
			}
			if (mode === 'front' && view === 'three-quarter') model.rotation.set(-0.3, 0.62, 0)
			if (mode === 'front' && view === 'side') model.rotation.set(0, 1.25, 0)
			// سایهٔ تماسیِ نرم زیرِ نشان
			const shadowTex = (() => {
				const c = document.createElement('canvas')
				c.width = c.height = 128
				const x = c.getContext('2d')!
				const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64)
				gr.addColorStop(0, 'rgba(20,6,18,0.45)')
				gr.addColorStop(1, 'rgba(20,6,18,0)')
				x.fillStyle = gr
				x.fillRect(0, 0, 128, 128)
				return new THREE.CanvasTexture(c)
			})()
			const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }))
			shadow.position.set(0, -0.47, -0.05)
			shadow.rotation.x = -Math.PI / 2.4
			if (mode === 'hero') scene.add(shadow)

			const resize = () => {
				const w = el.clientWidth || size
				const h = el.clientHeight || size
				renderer.setSize(w, h, false)
				camera.aspect = w / h
				camera.updateProjectionMatrix()
			}
			resize()
			const ro = new ResizeObserver(resize)
			ro.observe(el)

			// تعامل: کج‌شدن با اشاره‌گر (پارالاکس) + شناوریِ آرام
			let tx = 0, ty = 0, cx = 0, cy = 0
			const onMove = (e: PointerEvent) => {
				const r = el.getBoundingClientRect()
				tx = ((e.clientX - r.left) / r.width - 0.5) * 2
				ty = ((e.clientY - r.top) / r.height - 0.5) * 2
			}
			if (!reduce) window.addEventListener('pointermove', onMove)
			const t0 = performance.now()
			let raf = 0
			const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4)
			const frame = () => {
				const t = (performance.now() - t0) / 1000
				if (!reduce) {
					const a = ease((t - 0.15) / 1.1) // سرهم‌شدن در ۱٫۱ ثانیه
					for (const s of segs) {
						const [ox, oy] = OUT[s.id]
						const k = (1 - a) * 0.55
						s.mesh.position.set(ox * k, oy * k, (1 - a) * 0.4)
						s.mesh.rotation.set(0, 0, (1 - a) * (s.id === 'segment-top' ? 0.6 : s.id === 'segment-left' ? -0.6 : 0.6))
					}
					cx += (tx - cx) * 0.06
					cy += (ty - cy) * 0.06
					model.rotation.y = cx * 0.45 + Math.sin(t * 0.6) * 0.18 * a
					model.rotation.x = cy * 0.3 + Math.cos(t * 0.5) * 0.06
					model.position.y = Math.sin(t * 1.1) * 0.025
				}
				renderer.render(scene, camera)
				if (!reduce) raf = requestAnimationFrame(frame)
			}
			frame()
			if (reduce) setTimeout(() => renderer.render(scene, camera), 50)

			cleanup = () => {
				cancelAnimationFrame(raf)
				window.removeEventListener('pointermove', onMove)
				ro.disconnect()
				scene.traverse((o) => {
					const m = o as import('three').Mesh
					if (m.isMesh) {
						m.geometry.dispose()
						;(m.material as import('three').Material).dispose()
					}
				})
				shadowTex.dispose()
				pmrem.dispose()
				renderer.dispose()
				renderer.domElement.remove()
			}
		})()
		return () => {
			dead = true
			cleanup()
		}
	}, [mode, size, view, fitRef, stripped])

	return (
		<div ref={host} className={`relative ${className}`} style={fitRef ? { width: '100vw', height: '100vh' } : { width: size, height: size }} role="img" aria-label="نشانِ آرومین">
			{fallback && <img src="/aromin-mark.svg" alt="" className="size-full object-contain" />}
		</div>
	)
}
