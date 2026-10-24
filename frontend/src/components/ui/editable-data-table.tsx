/**
 * EditableDataTable + StatCard (3.9.88, in the spirit of the 21st.dev components — registry unreachable here).
 * Editable cells use react-currency-input-field (digits only in state, separators on screen). RTL, ≥ 44 px inputs,
 * horizontal scroll on phones (min-w-[700px]). Rows/cards fade in with React Bits FadeContent.
 */
import type { ReactNode } from 'react'
import CurrencyInput from 'react-currency-input-field'
import { FadeContent } from '@/components/ui/count-up'
import { cn } from '@/lib/utils'

export type Column<R> = { key: string; header: string; editable?: boolean; placeholder?: string; render?: (row: R) => ReactNode }

const toLat = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

export function EditableDataTable<R extends { id: string; highlight?: boolean }>({ columns, rows, getValue, onCellChange, className }: {
	columns: Column<R>[]; rows: R[]; getValue: (row: R, key: string) => string; onCellChange: (row: R, key: string, digits: string) => void; className?: string
}) {
	return (
		<div className={cn('relative w-full overflow-x-auto rounded-xl ring-1 ring-white/10', className)}>
			<table className="w-full min-w-[700px] text-sm">
				<thead className="bg-white/[.04]"><tr>{columns.map((c) => <th key={c.key} className="h-11 whitespace-nowrap px-3 text-start text-xs font-bold text-white/60">{c.header}</th>)}</tr></thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={row.id} className={cn('border-t border-white/10', row.highlight && 'bg-[#FCBF00]/[.06] shadow-[inset_0_0_0_1px_rgba(252,191,0,.45)]')}>
							{columns.map((c) => (
								<td key={c.key} className="whitespace-nowrap px-3 py-2 align-middle tabular-nums">
									<FadeContent delay={i * 90} duration={500}>
										{c.render ? c.render(row) : c.editable ? (
											<CurrencyInput dir="ltr" inputMode="numeric" allowDecimals={false} allowNegativeValue={false} groupSeparator="," decimalSeparator="." placeholder={c.placeholder}
												value={toLat(getValue(row, c.key)).replace(/[^0-9]/g, '')} onValueChange={(v) => onCellChange(row, c.key, v || '')} aria-label={c.header}
												className="min-h-[44px] w-full min-w-[150px] rounded-lg border border-white/15 bg-white/[.04] px-3 text-left text-[14px] text-white outline-none transition placeholder:text-white/35 focus:border-[#FCBF00] focus:ring-2 focus:ring-[#FCBF00]/25" />
										) : getValue(row, c.key)}
									</FadeContent>
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

export function StatCard({ title, value, subtitle, className, valueClassName, delay = 0 }: { title: string; value: ReactNode; subtitle?: string; className?: string; valueClassName?: string; delay?: number }) {
	return (
		<FadeContent delay={delay} className="h-full">
			<div className={cn('flex h-full flex-col gap-1.5 rounded-xl p-4 ring-1 ring-white/10', className)}>
				<div className="text-xs font-semibold opacity-75">{title}</div>
				<div className={cn('text-[22px] font-extrabold leading-8', valueClassName)}>{value}</div>
				{subtitle && <div className="text-[11.5px] opacity-70">{subtitle}</div>}
			</div>
		</FadeContent>
	)
}
