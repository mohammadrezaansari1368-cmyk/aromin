'use client'

/**
 * نشانِ سه‌بعدیِ دستیار (دکمه) — React Three Fiber + مدلِ img2threejs (createAssistant.ts).
 *  - نگاه با موس: yaw/pitch با فنرِ فیزیکی (stiffness/damping) — بیرون از چرخهٔ رندرِ React (useFrame + ref)
 *  - رنگ همگام با تم: بدنه = --primary، چشم = --primary-foreground؛ با lerp جابه‌جا می‌شود
 *  - وضعیتِ دستیار: فکر کردن = تپشِ نور، اجرای ابزار = ضربهٔ مقیاس + رنگِ accent، گوش دادن/حرف زدن = چشم‌ها
 *  - prefers-reduced-motion یا قابلیتِ agentMotion خاموش → بدونِ چرخش/شناوری/پلک (فقط رنگ و نور)
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createArominAssistantSphereModel } from './createAssistant'
import { tokenHex, useTheme } from '@/lib/theme'
import type { Status } from '@/lib/agent'

/** محورِ نگاهِ مدل در حالتِ مرجع (img2threejs: agent3d/geometry.json → faceAxis) */
const FACE = new THREE.Vector3(0.442, 0.473, 0.762).normalize()
const REST = { yaw: Math.atan2(FACE.x, FACE.z), pitch: Math.asin(FACE.y) } // ≈ 30° راست، 28° بالا
const K = 140, C = 2 * Math.sqrt(140) * 0.72 // فنرِ کمی زیرمیرا
const LIM = 0.62 // حداکثر ~۳۶° تا چشم‌ها روی صورت بمانند (نه لبهٔ کره)

function Env() {
	const { gl, scene } = useThree()
	useEffect(() => {
		const pm = new THREE.PMREMGenerator(gl)
		const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture
		scene.environment = tex
		scene.environmentIntensity = 0.35
		return () => { scene.environment = null; tex.dispose(); pm.dispose() }
	}, [gl, scene])
	return null
}

function Bot({ status, pulse, still, pointer, anchor }: { status: Status; pulse: number; still: boolean; pointer: React.RefObject<{ x: number; y: number; t: number }>; anchor: React.RefObject<HTMLElement | null> }) {
	const theme = useTheme()
	const invalidate = useThree((st) => st.invalidate)
	const model = useMemo(() => createArominAssistantSphereModel({ castShadow: false, receiveShadow: false }), [])
	const parts = useMemo(() => {
		let body: THREE.MeshPhysicalMaterial | null = null
		const eyeMats = new Set<THREE.MeshPhysicalMaterial>()
		const eyeNodes: THREE.Object3D[] = []
		model.traverse((o) => {
			const m = o as THREE.Mesh
			if (!m.isMesh) return
			if (/eye/i.test(m.name)) { eyeMats.add(m.material as THREE.MeshPhysicalMaterial); if (m.parent) eyeNodes.push(m.parent) }
			else body = m.material as THREE.MeshPhysicalMaterial
		})
		const b = body as unknown as THREE.MeshPhysicalMaterial
		b.emissive = new THREE.Color(0x000000)
		return { body: b, eyes: [...eyeMats], eyeNodes }
	}, [model])
	// محورِ نگاه → +Z تا yaw/pitch بیرونی مستقیم «نگاه» را بچرخاند
	const faceFix = useMemo(() => new THREE.Quaternion().setFromUnitVectors(FACE, new THREE.Vector3(0, 0, 1)), [])
	const target = useMemo(() => ({ body: new THREE.Color(), eye: new THREE.Color(), accent: new THREE.Color() }), [])
	useEffect(() => {
		target.body.set(tokenHex('primary'))
		target.eye.set(tokenHex('primary-foreground'))
		target.accent.set(tokenHex('accent'))
		if (still) { first.current = true; invalidate() } // بدونِ حرکت: رنگِ تازه فوراً و یک فریم رندر (frameloop=demand)
	}, [theme, target, still, invalidate])
	const outer = useRef<THREE.Group>(null)
	const first = useRef(true)
	const sim = useRef({ yaw: REST.yaw, pitch: REST.pitch, vy: 0, vp: 0, s: 1, vs: 0, blinkAt: 2.5, blink: 0, flash: 0, pulse })

	useFrame((st, dt0) => {
		const dt = Math.min(dt0, 1 / 30)
		const t = st.clock.elapsedTime
		const s = sim.current
		const g = outer.current
		if (!g) return
		// رنگ‌ها: lerp به سمتِ توکن‌های تم (بارِ اول مستقیم)
		const k = first.current ? 1 : 1 - Math.exp(-dt * 6)
		first.current = false
		parts.body.color.lerp(target.body, k)
		for (const e of parts.eyes) { e.color.lerp(target.eye, k); e.emissive.lerp(target.eye, k) }
		// ابزار اجرا شد → ضربه + فلشِ accent
		if (pulse !== s.pulse) { s.pulse = pulse; s.vs += 3.2; s.flash = 1 }
		s.flash = Math.max(0, s.flash - dt * 2.2)
		const think = status === 'thinking' ? 0.5 + 0.5 * Math.sin(t * 6) : 0
		parts.body.emissive.copy(target.body).multiplyScalar(0.28 * think).lerp(target.accent, s.flash * 0.6)
		parts.body.emissiveIntensity = 1
		const glow = status === 'speaking' ? 0.9 + 0.7 * Math.abs(Math.sin(t * 11)) : status === 'thinking' || status === 'tool' ? 1.25 : 0.9
		for (const e of parts.eyes) e.emissiveIntensity += (glow - e.emissiveIntensity) * Math.min(1, dt * 10)

		if (still) { // بدونِ حرکت: نگاهِ مرجع، بدونِ شناوری/پلک
			g.rotation.set(-REST.pitch, REST.yaw, 0)
			g.position.y = 0
			g.scale.setScalar(1)
			for (const n of parts.eyeNodes) n.scale.set(1, 1, 1)
			return
		}
		// هدفِ نگاه: موس نسبت به مرکزِ دکمه؛ بعد از ۴ ثانیه بی‌حرکتی → نگاهِ مرجع
		let ty = REST.yaw, tp = REST.pitch
		const p = pointer.current, el = anchor.current
		if (p && el && performance.now() - p.t < 4000) {
			const r = el.getBoundingClientRect()
			const dx = p.x - (r.left + r.width / 2), dy = (r.top + r.height / 2) - p.y
			const D = 380
			ty = Math.max(-LIM, Math.min(LIM, Math.atan2(dx, D)))
			tp = Math.max(-LIM, Math.min(LIM, Math.atan2(dy, D)))
		}
		s.vy += (K * (ty - s.yaw) - C * s.vy) * dt; s.yaw += s.vy * dt
		s.vp += (K * (tp - s.pitch) - C * s.vp) * dt; s.pitch += s.vp * dt
		g.rotation.set(-s.pitch, s.yaw, 0)
		// شناوری + مقیاسِ فنری
		const lis = status === 'listening' ? 0.06 * Math.sin(t * 9) : 0
		s.vs += (K * (1 + lis - s.s) - C * s.vs) * dt; s.s += s.vs * dt
		g.scale.setScalar(s.s)
		g.position.y = 0.035 * Math.sin(t * (status === 'thinking' ? 3.2 : 1.6))
		// پلک: هر ۳ تا ۶ ثانیه (در گوش دادن: کشیده‌تر)
		if (t > s.blinkAt) { s.blink = 1; s.blinkAt = t + 3 + ((t * 7919) % 3) }
		s.blink = Math.max(0, s.blink - dt * 9)
		const sy = (status === 'listening' ? 1.12 : 1) * (1 - 0.85 * Math.sin(Math.PI * s.blink))
		for (const n of parts.eyeNodes) n.scale.set(1, sy, 1)
	})

	return (
		<group ref={outer}>
			<group quaternion={faceFix}>
				<primitive object={model} />
			</group>
		</group>
	)
}

export default function SmartAssistant3D({ status, pulse, still, anchor }: { status: Status; pulse: number; still: boolean; anchor: React.RefObject<HTMLElement | null> }) {
	const pointer = useRef({ x: 0, y: 0, t: 0 })
	useEffect(() => {
		if (still) return
		const on = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY, t: performance.now() } }
		window.addEventListener('pointermove', on, { passive: true })
		return () => window.removeEventListener('pointermove', on)
	}, [still])
	return (
		<Canvas
			dpr={[1, 2]}
			frameloop={still && status === 'idle' ? 'demand' : 'always'}
			gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'low-power' }}
			camera={{ position: [0, 0.05, 3.3], fov: 23 }}
			style={{ pointerEvents: 'none' }}
			aria-hidden>
			<Env />
			<hemisphereLight args={[0xffffff, 0x20121c, 0.6]} />
			<directionalLight position={[-2, 3, 4]} intensity={2.2} />
			<directionalLight position={[3, 1, -2]} intensity={0.9} color="#FCBF00" />
			<Bot status={status} pulse={pulse} still={still} pointer={pointer} anchor={anchor} />
			<ContactShadows position={[0, -0.62, 0]} opacity={0.35} scale={1.8} blur={2.4} far={1.2} resolution={128} />
		</Canvas>
	)
}
