/**
 * shadcn-style primitives for the forecast cards (3.9.86). The 21st.dev / shadcn registries are not reachable from the office
 * network, so these follow the same APIs as the requested components, written on the npm packages the registry versions use:
 *  - InputGroup/InputGroupAddon (shadcn input-group) · Markdown (21stdev/markdown) → react-markdown
 *  (3.9.87: Segmented, RadioGroupWithPlanCards, the currency input and the select moved to ui/segmented, ui/radio-group-with-plan-cards,
 *   react-currency-input-field and react-select)
 *  - Table (shadcn/table) · Field / FieldGroup (shadcn field) · InfoTip → @radix-ui/react-tooltip
 *  - MetricCard (makviesainte/progress-metric-card) in a BentoGrid (shadcnblocks casestudy-5 layout)
 * Everything is RTL-safe, uses the theme tokens and keeps touch targets ≥ 44 px.
 */
import { type ComponentProps, type ReactNode } from 'react'
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

/* ---------- InputGroup ---------- */
export const InputGroup = ({ className, ...p }: ComponentProps<'div'>) => (
	<div className={cn('flex min-h-[44px] w-full items-stretch overflow-hidden rounded-xl border border-border bg-card transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12', className)} {...p} />
)
export const InputGroupAddon = ({ className, ...p }: ComponentProps<'div'>) => <div className={cn('flex shrink-0 items-center border-s border-border/70 p-1', className)} {...p} />
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
