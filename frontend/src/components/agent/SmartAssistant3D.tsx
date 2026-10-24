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
import type { EmotionState } from '@/widget/agent/core'
import { buildFaceRig, EXPR, REACTION_OF, type Expr, type MouthShape } from './expressions3d'

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

const NUM: (keyof Expr)[] = ['eyeSY', 'eyeSX', 'eyeDY', 'eyeAsym', 'browY', 'browRot', 'browAsym', 'mouthS', 'pitch', 'yaw', 'roll', 'hop', 'jitter', 'pop', 'sink', 'tintK', 'face', 'eyeArc']
const SHAPES: MouthShape[] = ['smile', 'frown', 'o', 'line', 'smirk']

function Bot({ status, pulse, still, pointer, anchor, emotion = 'neutral' }: { status: Status; pulse: number; still: boolean; pointer: React.RefObject<{ x: number; y: number; t: number }>; anchor: React.RefObject<HTMLElement | null>; emotion?: EmotionState }) {
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
		const rig = eyeMats.size ? buildFaceRig(model, [...eyeMats][0]) : null
		return { body: b, eyes: [...eyeMats], eyeNodes, rig }
	}, [model])
	// current blended expression (3.9.79): numbers ease toward the target reaction every frame
	const ex = useRef({ ...EXPR.neutral, w: { smile: EXPR.neutral.mouthS, frown: 0, o: 0, line: 0, smirk: 0 } as Record<MouthShape, number>, tintC: new THREE.Color(0) })
	const tmpTint = useMemo(() => new THREE.Color(), [])
	// 3.9.81: anger = the whole body turns red and smoke puffs rise from the top of the head
	const RED = useMemo(() => new THREE.Color(0xe0141e), [])
	const bodyBase = useMemo(() => new THREE.Color(), [])
	const smoke = useMemo(() => {
		const c = document.createElement('canvas'); c.width = c.height = 64
		const x = c.getContext?.('2d')
		if (!x) return [] as THREE.Sprite[]
		const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
		gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
		x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
		const tex = new THREE.CanvasTexture(c)
		return Array.from({ length: 8 }, (_, i) => {
			const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x5c5c5c, transparent: true, opacity: 0, depthWrite: false }))
			sp.userData.ph = i / 8; sp.userData.side = i % 2 ? 1 : -1
			return sp
		})
	}, [])
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
	const sim = useRef({ yaw: REST.yaw, pitch: REST.pitch, vy: 0, vp: 0, s: 1, vs: 0, blinkAt: 2.5, blink: 0, flash: 0, pulse, ang: 0 })

	useFrame((st, dt0) => {
		const dt = Math.min(dt0, 1 / 30)
		const t = st.clock.elapsedTime
		const s = sim.current
		const g = outer.current
		if (!g) return
		// رنگ‌ها: lerp به سمتِ توکن‌های تم (بارِ اول مستقیم)
		const k = first.current ? 1 : 1 - Math.exp(-dt * 6)
		first.current = false
		bodyBase.lerp(target.body, k)
		s.ang += ((emotion === 'angry' || emotion === 'annoyed' ? 1 : 0) - s.ang) * (still ? 1 : 1 - Math.exp(-dt * 5))
		parts.body.color.copy(bodyBase).lerp(RED, 0.85 * s.ang)
		smoke.forEach((sp, i) => {
			const ph = still ? 0.15 + 0.7 * sp.userData.ph : (t * 0.5 + sp.userData.ph) % 1
			sp.position.set(sp.userData.side * (0.2 + 0.1 * ph + 0.03 * Math.sin(ph * 7 + i)), 0.34 + ph * 0.3, 0.12)
			sp.scale.setScalar(0.09 + ph * 0.2)
			;(sp.material as THREE.SpriteMaterial).opacity = s.ang * (1 - ph) * Math.min(1, ph * 6)
		})
		for (const e of parts.eyes) { e.color.lerp(target.eye, k); e.emissive.lerp(target.eye, k) }
		// ابزار اجرا شد → ضربه + فلشِ accent
		if (pulse !== s.pulse) { s.pulse = pulse; s.vs += 3.2; s.flash = 1 }
		s.flash = Math.max(0, s.flash - dt * 2.2)
		const reaction = emotion === 'neutral' || emotion === 'idle' || emotion === 'speaking'
			? (status === 'thinking' || status === 'tool' ? 'thinking' : status === 'listening' ? 'listening' : REACTION_OF[emotion])
			: REACTION_OF[emotion] || 'neutral'
		const tgt = EXPR[reaction]
		const e = ex.current, ke = still ? 1 : 1 - Math.exp(-dt * 9)
		for (const f of NUM) (e as unknown as Record<string, number>)[f] += ((tgt[f] as number) - (e[f] as number)) * ke
		for (const sh of SHAPES) e.w[sh] += ((sh === tgt.mouth ? tgt.mouthS : 0) - e.w[sh]) * (still ? 1 : 1 - Math.exp(-dt * 14))
		e.tintC.lerp(tmpTint.set(tgt.tint), ke)
		const think = status === 'thinking' ? 0.5 + 0.5 * Math.sin(t * 6) : 0
		parts.body.emissive.copy(target.body).multiplyScalar(0.28 * think).lerp(target.accent, s.flash * 0.6).lerp(e.tintC, Math.min(1, e.tintK))
		const rig = parts.rig
		if (rig) {
			rig.brows.forEach((b, i) => { b.mesh.rotation.z = Math.PI / 2 - b.side * e.browRot; b.mesh.position.y = e.browY + (i === 0 ? e.browAsym : 0) })
			for (const sh of SHAPES) rig.mouths[sh].scale.setScalar(Math.max(0.0001, e.w[sh]))
			for (const a of rig.arcs) a.scale.setScalar(Math.max(0.0001, e.eyeArc))
		}
		parts.body.emissiveIntensity = 1
		const glow = status === 'speaking' ? 0.9 + 0.7 * Math.abs(Math.sin(t * 11)) : status === 'thinking' || status === 'tool' ? 1.25 : 0.9
		for (const e of parts.eyes) e.emissiveIntensity += (glow - e.emissiveIntensity) * Math.min(1, dt * 10)

		function applyEyes(blink: number) {
			const r = parts.rig
			if (!r) { for (const n of parts.eyeNodes) n.scale.set(e.eyeSX, e.eyeSY * blink, 1); return }
			r.eyes.forEach((ey, i) => {
				ey.node.scale.set(e.eyeSX, Math.max(0.04, e.eyeSY * blink * (i === 1 ? 1 - e.eyeAsym : 1)), 1)
				ey.node.position.copy(ey.base).addScaledVector(ey.up, e.eyeDY)
			})
		}
		if (still) { // بدونِ حرکت: نگاهِ مرجع، بدونِ شناوری/پلک
			g.rotation.set(-REST.pitch * (1 - e.face) + e.pitch, REST.yaw * (1 - e.face) + e.yaw, e.roll)
			g.position.set(0, -e.sink, 0)
			g.scale.setScalar(e.pop)
			applyEyes(1)
			return
		}
		// هدفِ نگاه: موس نسبت به مرکزِ دکمه؛ بعد از ۴ ثانیه بی‌حرکتی → نگاهِ مرجع
		let ty = REST.yaw * (1 - e.face), tp = REST.pitch * (1 - e.face)
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
		g.rotation.set(-s.pitch + e.pitch, s.yaw + e.yaw, e.roll)
		// شناوری + مقیاسِ فنری
		const lis = status === 'listening' ? 0.06 * Math.sin(t * 9) : 0
		s.vs += (K * ((1 + lis) * e.pop - s.s) - C * s.vs) * dt; s.s += s.vs * dt
		g.scale.setScalar(s.s)
		g.position.y = 0.035 * Math.sin(t * (status === 'thinking' ? 3.2 : 1.6)) + e.hop * 0.06 * Math.abs(Math.sin(t * 7.5)) - e.sink
		g.position.x = e.jitter * 0.012 * Math.sin(t * 48)
		// پلک: هر ۳ تا ۶ ثانیه (در گوش دادن: کشیده‌تر)
		if (t > s.blinkAt) { s.blink = 1; s.blinkAt = t + 3 + ((t * 7919) % 3) }
		s.blink = Math.max(0, s.blink - dt * 9)
		applyEyes(1 - 0.85 * Math.sin(Math.PI * s.blink))
	})

	return (
		<group ref={outer}>
			<group quaternion={faceFix}>
				<primitive object={model} />
			</group>
			{smoke.map((sp, i) => <primitive key={i} object={sp} />)}
		</group>
	)
}

export default function SmartAssistant3D({ status, pulse, still, anchor, emotion }: { status: Status; pulse: number; still: boolean; anchor: React.RefObject<HTMLElement | null>; emotion?: EmotionState }) {
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
			frameloop={still && status === 'idle' && (!emotion || emotion === 'neutral') ? 'demand' : 'always'}
			gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'low-power' }}
			camera={{ position: [0, 0.05, 3.3], fov: 23 }}
			style={{ pointerEvents: 'none' }}
			aria-hidden>
			<Env />
			<hemisphereLight args={[0xffffff, 0x20121c, 0.6]} />
			<directionalLight position={[-2, 3, 4]} intensity={2.2} />
			<directionalLight position={[3, 1, -2]} intensity={0.9} color="#FCBF00" />
			<Bot status={status} pulse={pulse} still={still} pointer={pointer} anchor={anchor} emotion={emotion} />
			<ContactShadows position={[0, -0.62, 0]} opacity={0.35} scale={1.8} blur={2.4} far={1.2} resolution={128} />
		</Canvas>
	)
}
