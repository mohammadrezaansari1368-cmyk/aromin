/*
 * Segmented — ported from e-ink-ui-lib
 * Source: https://github.com/AlexisRoe/e-ink-ui-lib/blob/main/src/components/segmented/segmented.component.tsx
 *
 * MIT License
 * Copyright (c) 2026 Alexis Roe
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * AROMIN 3.9.87: one addition — an optional controlled `value` (the forecast form owns the horizon unit); the
 * `eink-segmented*` styles live in src/index.css and use the theme tokens.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { createContext, useContext, useState } from 'react'

interface SegmentedContextValue {
	value: string | null
	select: (itemId: string) => void
}

const SegmentedContext = createContext<SegmentedContextValue | null>(null)

/** Props accepted by {@link Segmented}. */
export interface SegmentedProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
	/** `id` of the {@link Segmented.Item} highlighted when the control first renders. */
	defaultId?: string
	/** Controlled selection (AROMIN addition); when set it wins over the internal state. */
	value?: string
	/** Stretches the control to 100% width, with segments evenly distributed. Defaults to `false`. */
	fullWidth?: boolean
	/** Called with the `id` of the segment that was clicked. */
	onChange?: (id: string) => void
}

/** Props accepted by {@link Segmented.Item}. */
export interface SegmentedItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'id'> {
	/** Identifies this segment; passed to `onChange` and matched against `defaultId`. */
	id: string
	/** Segment label. */
	children: ReactNode
}

/** Joins an optional base class name with any number of conditional class names, each paired with its own boolean. */
function cx(base: string | undefined, ...conditions: Array<[className: string, condition: boolean]>): string {
	return [base, ...conditions.map(([className, condition]) => (condition ? className : null))].filter(Boolean).join(' ')
}

/** Single option of a {@link Segmented} control; reads its selected/click behavior from context. */
function SegmentedItem({ className, id, children, ...rest }: SegmentedItemProps) {
	const context = useContext(SegmentedContext)
	const isSelected = context?.value === id

	return (
		<li className="eink-segmented__item-wrapper">
			<button type="button" className={cx('eink-segmented__item', [className ?? '', !!className], ['eink-segmented__item--selected', isSelected])}
				aria-pressed={isSelected} onClick={() => context?.select(id)} {...rest}>
				{children}
			</button>
		</li>
	)
}

/** Row of mutually-exclusive {@link Segmented.Item}s, highlighting the selected one and reporting clicks via `onChange`. */
export function Segmented({ className, children, defaultId, value: controlled, fullWidth = false, onChange, ...rest }: SegmentedProps) {
	const [value, setValue] = useState<string | null>(defaultId ?? null)

	const select = (itemId: string) => {
		setValue(itemId)
		onChange?.(itemId)
	}

	return (
		<SegmentedContext.Provider value={{ value: controlled ?? value, select }}>
			<nav className={cx('eink-segmented', [className ?? '', !!className], ['eink-segmented--full-width', fullWidth])} {...rest}>
				<ul className="eink-segmented__list">{children}</ul>
			</nav>
		</SegmentedContext.Provider>
	)
}

Segmented.Item = SegmentedItem

export default Segmented
