import { describe, expect, it } from 'vitest'
import { stripHtml, toBullets } from './stripHtml'

describe('stripHtml (3.9.86)', () => {
	it('removes spans, inline styles and emoji, keeps bold as markdown and breaks lines', () => {
		const out = stripHtml("حاشیه پایین. <span style='color:var(--fc-petrol)'>واحدِ فروش: <b>سفارش</b>.</span><br><span style='color:red'>🌙 رمضان</span>")
		expect(out).not.toMatch(/<|style|🌙/)
		expect(out).toContain('**سفارش**')
		expect(toBullets(out).split('\n')).toEqual(['- حاشیه پایین.', '- واحدِ فروش: **سفارش**.', '- رمضان'])
	})
})
