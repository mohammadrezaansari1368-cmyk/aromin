import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLink'

describe('parseDeepLink', () => {
	it('maps the Telegram/Bale lead link to the report tab with the lead id', () => {
		expect(parseDeepLink('?panel=p-leads&lead=42')).toEqual({ tab: 'p-report', lead: 42 })
	})
	it('keeps other valid panel ids and ignores junk', () => {
		expect(parseDeepLink('?panel=p-inv')).toEqual({ tab: 'p-inv', lead: null })
		expect(parseDeepLink('?panel=<script>&lead=-3')).toEqual({ tab: null, lead: null })
		expect(parseDeepLink('?lead=1.5')).toEqual({ tab: null, lead: null })
		expect(parseDeepLink('')).toEqual({ tab: null, lead: null })
	})
})
