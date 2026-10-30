// 3.9.79: every emotion maps to a 3D reaction; the seven named reactions differ in the ways that read on the sphere.
import { describe, expect, it } from 'vitest'
import { EXPR, REACTION_OF } from './expressions3d'
import { STATES, mood } from '@/widget/agent/core'

describe('3D reactions', () => {
	it('covers every emotion state', () => {
		for (const s of STATES) expect(EXPR[REACTION_OF[s]]).toBeDefined()
	})
	it('shapes the seven reactions distinctly', () => {
		expect(EXPR.joy.mouth).toBe('smile'); expect(EXPR.joy.eyeSY).toBeLessThan(0.6)
		expect(EXPR.anger.browRot).toBeGreaterThan(0.3); expect(EXPR.anger.mouth).toBe('frown')
		expect(EXPR.surprise.mouth).toBe('o'); expect(EXPR.surprise.eyeSY).toBeGreaterThan(1.2)
		expect(EXPR.sadness.browRot).toBeLessThan(-0.3); expect(EXPR.sadness.pitch).toBeGreaterThan(0)
		expect(EXPR.fear.jitter).toBeGreaterThan(0.5)
		expect(EXPR.disgust.eyeAsym).toBeGreaterThan(0); expect(Math.abs(EXPR.disgust.yaw)).toBeGreaterThan(0.2)
		expect(EXPR.lookdown.pitch).toBeLessThan(-0.2); expect(EXPR.lookdown.eyeDY).toBeLessThan(0)
	})
	it('reads the new moods from the reply text', () => {
		expect(mood('این غیرقابل قبول است')).toBe('angry')
		expect(mood('حیف شد')).toBe('sad')
		expect(mood('مراقب باشید، خطر دارد')).toBe('fear')
		expect(mood('وای! باورنکردنی')).toBe('surprised')
		expect(mood('این پیام اسپم است')).toBe('disgust')
		expect(mood('البته که درست است')).toBe('smug')
	})
})
