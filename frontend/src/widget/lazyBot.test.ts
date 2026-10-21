// public/widget.js is a plain IIFE (no bundler, no DOM test env here): structural guard that the 3D bot (~308 KB gzip)
// is never requested on page load — only on opening the widget or on interaction with the widget element itself.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('../../public/widget.js', import.meta.url)), 'utf8')
const calls = (re: RegExp) => [...src.matchAll(re)].length

describe('widget.js lazy 3D bot', () => {
	it('loadBot() is called only from needBot(), never at mount', () => {
		expect(calls(/(?<!function )\bloadBot\(\)/g)).toBe(1)   // the single call, inside needBot (definition excluded)
		expect(src).toMatch(/function needBot\(\) \{ if \(botWanted\) return; botWanted = true; loadBot\(\) \}/)
	})
	it('the triggers are widget-scoped interactions and opening the widget', () => {
		expect(src).toMatch(/\['pointerenter', 'pointerdown', 'touchstart', 'focusin', 'keydown'\]\.forEach\(function \(ev\) \{ w\.addEventListener\(ev, needBot/)
		expect(src).toMatch(/if \(o\) needBot\(\)/)
	})
	it('no page-wide listener can load the bot (scroll/click elsewhere on the page)', () => {
		expect(src).not.toMatch(/(?:W|window|D|document)\.addEventListener\([^)]*needBot/)
		expect(src).not.toMatch(/addEventListener\(['"]scroll['"][^)]*needBot/)
	})
})
