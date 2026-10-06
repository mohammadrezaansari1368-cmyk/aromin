'use client'

/**
 * بازبینیِ img2threejs برای نشانِ سه‌بعدیِ دستیار — فقط در ?agent-preview (نه در اپ).
 * قاب دقیقاً مثلِ مرجع: بوم ۸۱۹×۱۰۲۴، مرکزِ کره (412, 510.5)px، شعاع 215.25px، دوربینِ متعامد از روبه‌رو.
 *   &stripped  → رنگِ تختِ مرجع (بدنه سیاه، چشم سفید) برای مقایسهٔ سیلوئت/مرزِ رنگ
 *   &albedo    → رنگِ تختِ spec برای گیتِ رنگِ tier-1 (از material-pass به بعد)
 *   &view=three-quarter|side → زاویه‌های مداری   ·   بدونِ پارامتر → رندرِ نورپردازی‌شده با رنگِ تم
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createArominAssistantSphereModel } from './createAssistant'

const W = 819, H = 1024, CX = 412, CY = 510.5, RPX = 215.25

export default function AgentPreview() {
	const host = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const qs = new URLSearchParams(location.search)
		const stripped = qs.has('stripped')
		const view = qs.get('view') || 'front'
		const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
		renderer.setPixelRatio(1)
		renderer.setSize(W, H)
		renderer.setClearColor(qs.has('bg') ? parseInt(qs.get('bg')!, 16) : 0xf9f9f9, 1) // &bg=808080: گیتِ رنگ (چشمِ سفید روی زمینهٔ سفید در ماسک دیده نمی‌شود)
		renderer.toneMapping = THREE.NeutralToneMapping
		host.current!.appendChild(renderer.domElement)
		const scene = new THREE.Scene()
		const pmrem = new THREE.PMREMGenerator(renderer)
		scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
		scene.environmentIntensity = 0.35
		const model = createArominAssistantSphereModel({ castShadow: false, receiveShadow: false })
		if (qs.has('albedo')) { // گیتِ رنگِ tier-1: رنگِ تختِ هر قطعه = colorMaterialRecipe همان spec (بدنه #910D6A، چشم #FFFFFF)
			model.traverse((o) => {
				const m = o as THREE.Mesh
				if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color: /eye/i.test(m.name) ? 0xffffff : 0x910d6a })
			})
		} else if (stripped) {
			model.traverse((o) => {
				const m = o as THREE.Mesh
				if (!m.isMesh) return
				const eye = /eye/i.test(m.name)
				m.material = new THREE.MeshBasicMaterial({ color: eye ? 0xf9f9f9 : 0x0a0a0a })
			})
		} else {
			const cs = getComputedStyle(document.documentElement)
			const tok = (n: string) => new THREE.Color(`hsl(${cs.getPropertyValue(n).trim().replace(/ /g, ', ')})`)
			model.traverse((o) => {
				const m = o as THREE.Mesh
				if (!m.isMesh) return
				const mat = m.material as THREE.MeshPhysicalMaterial
				if (/eye/i.test(m.name)) { mat.color = tok('--primary-foreground'); mat.emissive = tok('--primary-foreground'); mat.emissiveIntensity = 0.9 }
				else mat.color = tok('--primary')
			})
			scene.add(new THREE.HemisphereLight(0xffffff, 0x20121c, 0.6))
			const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-2, 3, 4); scene.add(key)
			const rim = new THREE.DirectionalLight(0xfcbf00, 0.9); rim.position.set(3, 1, -2); scene.add(rim)
		}
		scene.add(model)
		// متعامد؛ ۱ واحد = 2·RPX پیکسل (کره قطرِ ۱)
		const u = 1 / (2 * RPX)
		const cam = new THREE.OrthographicCamera((-W / 2) * u, (W / 2) * u, (H / 2) * u, (-H / 2) * u, 0.1, 20)
		const off = new THREE.Vector3((W / 2 - CX) * u, (CY - H / 2) * u, 0) // مرکزِ کره روی همان پیکسلِ مرجع
		const az = view === 'three-quarter' ? Math.PI / 4 : view === 'side' ? Math.PI / 2 : 0
		cam.position.set(Math.sin(az) * 5, 0, Math.cos(az) * 5)
		cam.lookAt(0, 0, 0)
		cam.updateMatrixWorld()
		const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
		cam.position.addScaledVector(right, off.x).addScaledVector(up, off.y)
		renderer.render(scene, cam)
		;(window as unknown as { __agentParts?: unknown; __agentModel?: unknown }).__agentParts = model.children.map((c) => c.name); (window as unknown as { __agentModel?: unknown }).__agentModel = model
		if (qs.has('glb')) { // خروجیِ GLB برای استفادهٔ بیرونی (رنگِ پیش‌فرضِ بنفش؛ در اپ رنگ از تم می‌آید)
			model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).name = /eye/i.test(m.name) ? 'eye-light' : 'body-gloss' })
			import('three/examples/jsm/exporters/GLTFExporter.js').then(({ GLTFExporter }) =>
				new GLTFExporter().parse(model, (buf) => {
					const b = new Uint8Array(buf as ArrayBuffer); let s = ''
					for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
					;(window as unknown as { __agentGlb?: string }).__agentGlb = btoa(s)
				}, () => {}, { binary: true }))
		}
		document.body.dataset.ready = '1'
		return () => { renderer.dispose(); pmrem.dispose(); renderer.domElement.remove() }
	}, [])
	return <div ref={host} style={{ width: W, height: H }} />
}
