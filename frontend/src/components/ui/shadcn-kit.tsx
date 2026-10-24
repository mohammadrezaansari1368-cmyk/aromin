/**
 * shadcn-style primitives for the forecast cards (3.9.86). The 21st.dev / shadcn registries are not reachable from the office
 * network, so these follow the same APIs as the requested components, written on the npm packages the registry versions use:
 *  - Segmented (alexisroe/segmented)              · RadioGroupWithPlanCards (shadcnspace) → @radix-ui/react-radio-group
 *  - CurrencyInput + InputGroup/InputGroupAddon (mohammadshehadeh / shadcn input-group)
 *  - Select (shugar/select-1) → @radix-ui/react-select · Markdown (21stdev/markdown) → react-markdown
 *  - Table (shadcn/table) · Field / FieldGroup (shadcn field) · InfoTip → @radix-ui/react-tooltip
 *  - MetricCard (makviesainte/progress-metric-card) in a BentoGrid (shadcnblocks casestudy-5 layout)
 * Everything is RTL-safe, uses the theme tokens and keeps touch targets ≥ 44 px.
 */
import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as Tooltip from '@radix-ui/react-tooltip'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

/* ---------- Card ---------- */
export function ShCard({ className, children, ...p }: ComponentProps<'section'>) {
	return <section dir="rtl" className={cn('relative w-full overflow-hidden rounded-xl border border-border/50 bg-card p-6 text-card-foreground shadow-sm', className)} {...p}>{children}</section>
}
export function ShCardHeader({ title, sub, info }: { title: ReactNode; sub?: ReactNode; info?: ReactNode }) {
	return (
		<header className="mb-6">
			<h3 className="flex items-center gap-2 text-xl font-bold leading-8">{title}{info && <InfoTip>{info}</InfoTip>}</h3>
			{sub && <p className="mt-2 text-sm leading-6 text-muted-foreground">{sub}</p>}
		</header>
	)
}

/* ---------- Field ---------- */
export const FieldGroup = ({ className, ...p }: ComponentProps<'div'>) => <div className={cn('flex flex-col gap-6', className)} {...p} />
export const Field = ({ className, ...p }: ComponentProps<'div'>) => <div role="group" className={cn('flex flex-col gap-2', className)} {...p} />
export const FieldLabel = ({ className, ...p }: ComponentProps<'label'>) => <label className={cn('text-sm font-semibold leading-6', className)} {...p} />
export const FieldDescription = ({ className, ...p }: ComponentProps<'p'>) => <p className={cn('text-xs leading-5 text-muted-foreground', className)} {...p} />

/* ---------- InfoTip (tooltip on an ⓘ icon) ---------- */
export function InfoTip({ children, label = 'توضیح' }: { children: ReactNode; label?: string }) {
	return (
		<Tooltip.Provider delayDuration={150}>
			<Tooltip.Root>
				<Tooltip.Trigger asChild>
					<button type="button" aria-label={label} className="inline-grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
					</button>
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content dir="rtl" side="bottom" sideOffset={6} className="z-50 max-w-[300px] rounded-lg bg-foreground px-3 py-2 text-[12.5px] font-normal leading-6 text-background shadow-lg">
						{children}<Tooltip.Arrow className="fill-foreground" />
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</Tooltip.Provider>
	)
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({ value, onChange, options, fullWidth, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; fullWidth?: boolean; label?: string }) {
	return (
		<div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl bg-muted p-1', fullWidth && 'flex w-full')}>
			{options.map((o) => {
				const on = o.value === value
				return (
					<button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
						className={cn('min-h-[44px] flex-1 rounded-lg px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
						{o.label}
					</button>
				)
			})}
		</div>
	)
}

/* ---------- RadioGroupWithPlanCards ---------- */
export type PlanOption = { value: string; title: string; badge?: string; desc: string }
export function RadioGroupWithPlanCards({ value, onValueChange, options, label }: { value: string; onValueChange: (v: string) => void; options: PlanOption[]; label?: string }) {
	const id = useId()
	return (
		<RadioGroup.Root dir="rtl" value={value} onValueChange={onValueChange} aria-label={label} className="grid grid-cols-1 gap-3 md:grid-cols-3">
			{options.map((o) => (
				<label key={o.value} htmlFor={id + o.value}
					className="relative flex min-h-[44px] cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[.06] has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary/20">
					<span className="flex items-center justify-between gap-2">
						<span className="text-[15px] font-bold">{o.title}</span>
						<RadioGroup.Item id={id + o.value} value={o.value} className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-border data-[state=checked]:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
							<RadioGroup.Indicator className="size-2.5 rounded-full bg-primary" />
						</RadioGroup.Item>
					</span>
					{o.badge && <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground" dir="ltr">{o.badge}</span>}
					<span className="text-xs leading-5 text-muted-foreground">{o.desc}</span>
				</label>
			))}
		</RadioGroup.Root>
	)
}

/* ---------- InputGroup + CurrencyInput ---------- */
export const InputGroup = ({ className, ...p }: ComponentProps<'div'>) => (
	<div className={cn('flex min-h-[44px] w-full items-stretch overflow-hidden rounded-xl border border-border bg-card transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12', className)} {...p} />
)
export const InputGroupAddon = ({ className, ...p }: ComponentProps<'div'>) => <div className={cn('flex shrink-0 items-center border-s border-border/70 p-1', className)} {...p} />
const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
/** Thousands-separated numeric input; onValueChange gets digits only (Persian digits accepted). */
export const CurrencyInput = forwardRef<HTMLInputElement, Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: string; onValueChange: (digits: string) => void; suffix?: string }>(
	function CurrencyInput({ value, onValueChange, suffix, className, ...p }, ref) {
		const digits = toLatin(String(value || '')).replace(/[^0-9]/g, '')
		return (
			<div className="flex min-w-0 flex-1 items-center">
				<input ref={ref} inputMode="numeric" dir="ltr" value={digits ? Number(digits).toLocaleString('en-US') : ''}
					onChange={(e) => onValueChange(toLatin(e.target.value).replace(/[^0-9]/g, ''))}
					className={cn('min-h-[44px] w-full min-w-0 bg-transparent px-3 text-left text-[15px] tabular-nums outline-none placeholder:text-muted-foreground/70', className)} {...p} />
				{suffix && <span className="pe-1 ps-3 text-xs text-muted-foreground">{suffix}</span>}
			</div>
		)
	})

/* ---------- Select (Radix) ---------- */
export function Select({ value, onValueChange, options, placeholder, ariaLabel }: { value: string; onValueChange: (v: string) => void; options: [string, string][]; placeholder?: string; ariaLabel?: string }) {
	return (
		<SelectPrimitive.Root dir="rtl" value={value || undefined} onValueChange={onValueChange}>
			<SelectPrimitive.Trigger aria-label={ariaLabel} className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-start text-sm transition hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12 data-[placeholder]:text-muted-foreground">
				<span className="truncate"><SelectPrimitive.Value placeholder={placeholder} /></span>
				<SelectPrimitive.Icon><svg viewBox="0 0 24 24" className="size-4 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
					<SelectPrimitive.Viewport className="p-1">
						{options.map(([v, t]) => (
							<SelectPrimitive.Item key={v} value={v} className="relative flex min-h-[40px] cursor-pointer select-none items-center rounded-lg pe-8 ps-3 text-sm outline-none data-[highlighted]:bg-primary/10 data-[state=checked]:font-semibold">
								<SelectPrimitive.ItemText>{t}</SelectPrimitive.ItemText>
								<SelectPrimitive.ItemIndicator className="absolute end-2.5 text-primary">✓</SelectPrimitive.ItemIndicator>
							</SelectPrimitive.Item>
						))}
					</SelectPrimitive.Viewport>
				</SelectPrimitive.Content>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	)
}

/* ---------- Markdown ---------- */
export const Markdown = ({ children }: { children: string }) => <ReactMarkdown>{children}</ReactMarkdown>

/* ---------- Table ---------- */
export const Table = ({ className, ...p }: ComponentProps<'table'>) => <div className="relative w-full overflow-x-auto rounded-xl ring-1 ring-border"><table className={cn('w-full min-w-[600px] caption-bottom text-sm', className)} {...p} /></div>
export const TableHeader = (p: ComponentProps<'thead'>) => <thead className="bg-muted/60" {...p} />
export const TableBody = (p: ComponentProps<'tbody'>) => <tbody {...p} />
export const TableRow = ({ className, ...p }: ComponentProps<'tr'>) => <tr className={cn('border-t border-border/80 transition-colors', className)} {...p} />
export const TableHead = ({ className, ...p }: ComponentProps<'th'>) => <th className={cn('h-11 whitespace-nowrap px-3 text-start text-xs font-bold text-muted-foreground', className)} {...p} />
export const TableCell = ({ className, ...p }: ComponentProps<'td'>) => <td className={cn('whitespace-nowrap px-3 py-2 align-middle tabular-nums', className)} {...p} />

/* ---------- MetricCard in a BentoGrid ---------- */
const ACCENT = { yellow: 'before:bg-[#FCBF00]', olive: 'before:bg-[#7d8a2e]', dark: 'before:bg-foreground/70' } as const
export const BentoGrid = ({ className, ...p }: ComponentProps<'div'>) => <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4', className)} {...p} />
export function MetricCard({ title, value, unit, sub, accent = 'dark', progress }: { title: string; value: ReactNode; unit?: string; sub?: string; accent?: keyof typeof ACCENT; progress?: number }) {
	return (
		<div className={cn('relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 ps-5 before:absolute before:inset-y-0 before:start-0 before:w-1.5', ACCENT[accent])}>
			<div className="text-xs font-semibold text-muted-foreground">{title}</div>
			<div className="mt-1.5 flex items-baseline gap-1.5"><span className="text-xl font-extrabold tabular-nums">{value}</span>{unit && <span className="text-xs text-muted-foreground">{unit}</span>}</div>
			{progress != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: Math.max(0, Math.min(100, progress)) + '%' }} /></div>}
			{sub && <div className="mt-1 text-[11.5px] text-muted-foreground">{sub}</div>}
		</div>
	)
}
