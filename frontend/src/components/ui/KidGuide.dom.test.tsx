// @vitest-environment jsdom
// 3.9.72: «راهنمای ساده» — every tab has a guide, «به دوستت یاد بده» shows the teaching line, «فهمیدم» folds it and is remembered.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KidGuide, { GUIDES } from './KidGuide'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, el: HTMLDivElement
const btn = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement
beforeEach(() => {
	localStorage.clear()
	vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
	el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
})
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals() })

describe('KidGuide', () => {
	it('covers every tab with three short steps', () => {
		for (const id of ['dashboard', 'p-dash', 'p-inv', 'p-team', 'performance', 'p-ticket', 'forecast', 'council', 'p-ladder', 'import', 'p-report', 'p-calc', 'p-hire', 'p-set']) {
			expect(GUIDES[id]?.steps.length).toBe(3)
			expect(GUIDES[id].say.split(' ').length).toBeLessThanOrEqual(10)
		}
	})
	it('teaches, folds and remembers', async () => {
		await act(async () => root.render(<KidGuide tab="council" />))
		expect(el.textContent).toContain('سؤالت را بنویس')
		await act(async () => btn('به دوستت یاد بده').click())
		expect(el.querySelector('[role=status]')!.textContent).toContain('دورِ میز')
		await act(async () => btn('فهمیدم').click())
		expect(el.querySelector('[data-testid=kid-guide]')).toBeNull()
		expect(JSON.parse(localStorage.getItem('aromin.kidguide.hidden')!)).toEqual(['council'])
		await act(async () => btn('راهنمای ساده').click())
		expect(el.querySelector('[data-testid=kid-guide]')).not.toBeNull()
	})
})
