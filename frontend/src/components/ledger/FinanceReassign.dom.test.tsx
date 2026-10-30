// @vitest-environment jsdom
// 3.9.67: «انتقالِ سهمِ مالی» — count first (dry run), reason required, then the move; inactive names can be the source.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FinanceReassign from './FinanceReassign'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove() })
const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t)) as HTMLButtonElement
const setSelect = async (i: number, v: string) => { const s = document.querySelectorAll('select')[i] as HTMLSelectElement; await act(async () => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })) }) }
const setInput = async (v: string) => {
	const t = document.querySelector('[role=dialog] input') as HTMLInputElement
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(t, v)
	await act(async () => { t.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('FinanceReassign', () => {
	it('previews the count, needs a reason, then moves', async () => {
		const onRun = vi.fn(async (b: { dry?: boolean }) => (b.dry ? { count: 12 } : { moved: 12 }))
		await act(async () => root.render(<FinanceReassign names={['نورا مقدس']} fromNames={['نورا مقدس', 'آقای محرمی']} month={5} onRun={onRun} />))
		await act(async () => btn('انتقالِ سهمِ مالی').click())
		expect((document.querySelectorAll('select')[0] as HTMLSelectElement).value).toBe('5')                 // Shahrivar from the page filter
		await setSelect(1, 'آقای محرمی'); await setSelect(2, 'نورا مقدس')
		await act(async () => btn('نمایشِ تعداد').click())
		expect(onRun).toHaveBeenLastCalledWith({ month: 5, from: 'آقای محرمی', to: 'نورا مقدس', dry: true })
		expect(document.querySelector('[data-testid=reassign-count]')!.textContent).toContain('۱۲')
		expect(btn('انتقالِ ۱۲ سند').disabled).toBe(true)                                                     // no reason yet
		await setInput('تأییدهای شهریور را نورا انجام داده')
		await act(async () => btn('انتقالِ ۱۲ سند').click())
		expect(onRun).toHaveBeenLastCalledWith({ month: 5, from: 'آقای محرمی', to: 'نورا مقدس', reason: 'تأییدهای شهریور را نورا انجام داده' })
		expect(document.body.textContent).toContain('۱۲ سند به نامِ «نورا مقدس» شد.')
	})
})
