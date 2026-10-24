// @vitest-environment node
// 3.9.79: mobile navigation is a Claude-app drawer (menu button, overlay, Escape, closes on pick) — no <select> any more.
import { describe, expect, it } from 'vitest'
import src from './AppShell.tsx?raw'

describe('mobile drawer', () => {
	it('replaces the tab select with a labelled drawer', () => {
		expect(src).not.toContain('<select')
		expect(src).toContain('aria-controls="mobile-drawer"')
		expect(src).toContain("if (e.key === 'Escape') closeDrawer()")
		expect(src).toContain('onClick={() => { go(t.id); closeDrawer() }}')
		expect(src).toContain("document.body.style.overflow = 'hidden'")
	})
})
