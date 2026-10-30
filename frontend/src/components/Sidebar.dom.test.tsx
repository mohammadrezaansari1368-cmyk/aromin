// @vitest-environment node
// 3.9.78: Claude-style sidebar — the panel button and Ctrl+. collapse it to an icon rail, the state persists, rail icons keep their names.
import { describe, expect, it } from 'vitest'
import src from './AppShell.tsx?raw'

describe('AppShell sidebar', () => {
	it('has a labelled toggle, a persisted collapsed state, a keyboard shortcut and named rail icons', () => {
		expect(src).toContain("localStorage.getItem('aromin.sidebar.collapsed')")
		expect(src).toContain("e.key === '.'")
		expect(src).toMatch(/aria-label=\{rail \? 'باز کردنِ سایدبار' : 'بستنِ سایدبار'\}/)
		expect(src).toContain('aria-label={rail ? t.label : undefined}')
		expect(src).toContain("rail ? 'w-14")
	})
})
