/**
 * 3D reactions for the assistant sphere (3.9.79) — Grok-companion style: the face is light on a glossy ball, so a reaction is
 * eye shape + 3D brows + a 3D mouth + head motion + a body tint. Seven named reactions (joy, anger, surprise, sadness, fear, disgust,
 * look-down) plus the working states; every EmotionState from widget/agent/core maps to one of them.
 * Pure data + a builder; SmartAssistant3D blends the numbers every frame.
 */
import * as THREE from 'three'
import type { EmotionState } from '@/widget/agent/core'

export type Reaction = 'neutral' | 'joy' | 'anger' | 'surprise' | 'sadness' | 'fear' | 'disgust' | 'lookdown' | 'thinking' | 'listening' | 'sleep'
export type MouthShape = 'smile' | 'frown' | 'o' | 'line' | 'smirk'
export type Expr = {
	eyeSY: number; eyeSX: number; eyeDY: number; eyeAsym: number      // eye height / width / vertical shift / right-eye extra squint
	browY: number; browRot: number; browAsym: number                     // brow lift, slant (+ = inner ends down, angry), one-brow raise
	mouth: MouthShape; mouthS: number                                    // mouth shape and size
	pitch: number; yaw: number; roll: number                             // head offset (+pitch = chin down)
	hop: number; jitter: number; pop: number; sink: number               // bounce, tremble, scale pop, vertical sink
	tint: number; tintK: number                                          // body tint colour and strength
	face: number; eyeArc: number                                         // 1 = turn the face to the viewer; ^ ^ arc eyes (joy)
}
const E = (o: Partial<Expr>): Expr => ({ eyeSY: 1, eyeSX: 1, eyeDY: 0, eyeAsym: 0, browY: 0, browRot: 0, browAsym: 0, mouth: 'smile', mouthS: 0.55,
	pitch: 0, yaw: 0, roll: 0, hop: 0, jitter: 0, pop: 1, sink: 0, tint: 0x000000, tintK: 0, face: 0.8, eyeArc: 0, ...o })

export const EXPR: Record<Reaction, Expr> = {
	neutral: E({ face: 0 }),
	joy: E({ eyeArc: 1, eyeSY: 0.05, eyeDY: 0.006, browY: 0.012, browRot: -0.18, mouth: 'smile', mouthS: 1.25, hop: 1, pop: 1.06, tint: 0xfcbf00, tintK: 0.13 }),
	anger: E({ eyeSY: 0.5, eyeSX: 1.08, browY: -0.014, browRot: 0.55, mouth: 'frown', mouthS: 0.95, pitch: 0.14, jitter: 0.55, tint: 0xff2d2d, tintK: 0.45 }),
	surprise: E({ eyeSY: 1.38, eyeSX: 1.22, browY: 0.032, browRot: -0.22, mouth: 'o', mouthS: 1.15, pitch: -0.14, pop: 1.12, tint: 0x8fdcff, tintK: 0.11 }),
	sadness: E({ eyeSY: 0.68, eyeDY: -0.008, browY: 0.012, browRot: -0.5, mouth: 'frown', mouthS: 0.85, pitch: 0.26, sink: 0.05, tint: 0x3d6dff, tintK: 0.19 }),
	fear: E({ eyeSY: 1.25, eyeSX: 0.82, browY: 0.028, browRot: -0.55, mouth: 'o', mouthS: 0.7, pitch: -0.1, yaw: -0.12, jitter: 1, pop: 0.94, tint: 0x9b5de5, tintK: 0.14 }),
	disgust: E({ eyeSY: 0.75, eyeAsym: 0.45, browRot: 0.2, browAsym: 0.02, mouth: 'smirk', mouthS: 1, yaw: 0.38, roll: 0.14, pitch: 0.06, tint: 0x6bbf3a, tintK: 0.19 }),
	lookdown: E({ eyeSY: 0.45, eyeDY: -0.014, browY: -0.004, browRot: 0.12, mouth: 'smirk', mouthS: 0.8, pitch: -0.36, roll: -0.08 }),
	thinking: E({ face: 0.3, eyeSY: 0.9, eyeDY: 0.012, browAsym: 0.016, mouth: 'line', mouthS: 0.7, yaw: 0.22, pitch: -0.08 }),
	listening: E({ face: 0.5, eyeSY: 1.12, browY: 0.008, mouth: 'smile', mouthS: 0.6 }),
	sleep: E({ eyeSY: 0.08, mouth: 'line', mouthS: 0.55, pitch: 0.2, sink: 0.03 }),
}

export const REACTION_OF: Record<EmotionState, Reaction> = {
	neutral: 'neutral', idle: 'neutral', listening: 'listening', thinking: 'thinking', speaking: 'neutral', happy: 'joy', laugh: 'joy',
	curious: 'listening', surprised: 'surprise', concerned: 'sadness', confused: 'fear', serious: 'lookdown', annoyed: 'anger', angry: 'anger',
	success: 'joy', error: 'sadness', sleeping: 'sleep', sad: 'sadness', fear: 'fear', disgust: 'disgust', smug: 'lookdown',
}

export type FaceRig = {
	eyes: { node: THREE.Object3D; base: THREE.Vector3; up: THREE.Vector3; side: number }[]
	brows: { mesh: THREE.Mesh; side: number; base: THREE.Vector3; up: THREE.Vector3 }[]
	mouths: Record<MouthShape, THREE.Mesh>
	arcs: THREE.Mesh[]
}

/** Adds brows and a mouth (sharing the glowing eye material) to the img2threejs sphere and returns the handles to animate. */
export function buildFaceRig(model: THREE.Object3D, eyeMat: THREE.Material): FaceRig | null {
	model.updateMatrixWorld(true)
	const eyeMeshes: THREE.Mesh[] = []
	model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && /eye/i.test(m.name)) eyeMeshes.push(m) })
	if (eyeMeshes.length < 2) return null
	const inv = new THREE.Matrix4().copy(model.matrixWorld).invert()
	const info = eyeMeshes.slice(0, 2).map((m) => {
		const node = m.parent || m
		const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(inv)
		const q = new THREE.Quaternion(); node.getWorldQuaternion(q)
		return { node, p, q, up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), right: new THREE.Vector3(1, 0, 0).applyQuaternion(q) }
	})
	const mid = info[0].p.clone().add(info[1].p).multiplyScalar(0.5)
	const R = info[0].p.length()
	const up = info[0].up.clone().add(info[1].up).normalize()
	const onSurface = (v: THREE.Vector3, lift = 1.012) => v.clone().normalize().multiplyScalar(R * lift)
	const orient = (obj: THREE.Object3D, at: THREE.Vector3, q: THREE.Quaternion) => { obj.position.copy(at); obj.quaternion.copy(q) }

	const brows = info.map((e) => {
		const side = Math.sign(e.right.dot(mid.clone().sub(e.p))) || 1          // +1: this brow's inner end is local +x
		const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.085, 4, 10), eyeMat)
		mesh.rotation.z = Math.PI / 2
		const g = new THREE.Group(); g.add(mesh)
		const at = onSurface(e.p.clone().addScaledVector(e.up, 0.14))
		orient(g, at, e.q)
		model.add(g)
		return { mesh, side, base: at.clone(), up: e.up.clone() }
	})
	const mouthAt = onSurface(mid.clone().addScaledVector(up, -0.165), 1.01)
	const mq = info[0].q.clone().slerp(info[1].q, 0.5)
	const mk = (geo: THREE.BufferGeometry, rz: number, dy = 0) => {
		const m = new THREE.Mesh(geo, eyeMat); m.rotation.z = rz; m.position.y = dy        // dy: put the arc's apex on the mouth point
		const g = new THREE.Group(); g.add(m); orient(g, mouthAt, mq); model.add(g); m.scale.setScalar(0.0001)
		return m
	}
	const arc = () => new THREE.TorusGeometry(0.07, 0.0125, 10, 28, Math.PI * 0.78)
	const mouths: Record<MouthShape, THREE.Mesh> = {
		smile: mk(arc(), Math.PI + Math.PI * 0.11, 0.045),                                 // opening upward
		frown: mk(arc(), Math.PI * 0.11, -0.05),                                           // opening downward
		o: mk(new THREE.TorusGeometry(0.038, 0.0135, 10, 28), 0),
		line: mk(new THREE.CapsuleGeometry(0.0115, 0.08, 4, 10), Math.PI / 2),
		smirk: mk(new THREE.TorusGeometry(0.066, 0.012, 10, 28, Math.PI * 0.55), Math.PI + 0.55, 0.03),
	}
	const eyes = info.map((e) => {
		const pq = new THREE.Quaternion(); e.node.parent?.getWorldQuaternion(pq)
		return { node: e.node, base: e.node.position.clone(), up: e.up.clone().applyQuaternion(pq.invert()), side: Math.sign(e.right.dot(mid.clone().sub(e.p))) || 1 }
	})
	// ^ ^ eyes for joy: small arcs opening downward, centred on each eye
	const arcs = info.map((e) => {
		const m = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.0125, 10, 24, Math.PI * 0.8), eyeMat)
		m.rotation.z = Math.PI * 0.1; m.scale.setScalar(0.0001)
		const g = new THREE.Group(); g.add(m); orient(g, onSurface(e.p.clone().addScaledVector(e.up, -0.02)), e.q); model.add(g)
		return m
	})
	return { eyes, brows, mouths, arcs }
}
