/**
 * RadioGroupWithPlanCards (shadcnspace) — 3.9.87: data-driven (the original demo hard-codes three plans) and controlled,
 * so «استراتژی امسال» in G3 can bind it to the forecast form. 1 column on phones, 3 on md+; each card ≥ 44 px.
 */
import type { LucideIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export type Plan = { id: string; title: string; desc: string; price: string; icon: LucideIcon; color: string; background: string }

export const title = 'RadioGroup with Cards'

const RadioGroupWithPlanCards = ({ plans, value, onValueChange, label }: { plans: Plan[]; value: string; onValueChange: (v: string) => void; label?: string }) => (
	<RadioGroup dir="rtl" value={value} onValueChange={onValueChange} aria-label={label} className="grid grid-cols-1 gap-3 md:grid-cols-3">
		{plans.map((item) => {
			const Icon = item.icon
			return (
				<Label key={item.id} htmlFor={'plan-' + item.id}
					className={cn('flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4 shadow-sm transition-all', 'hover:bg-accent/15',
						'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[.06] has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary/20')}>
					<div className={`${item.background} rounded-lg p-1.5`}><Icon className={item.color} /></div>
					<div className="flex w-full items-start justify-between gap-2">
						<div className="grid gap-1.5">
							<p className="font-semibold leading-none">{item.title}</p>
							<p className="text-xs font-normal leading-5 text-muted-foreground">{item.desc}</p>
						</div>
						<span className="whitespace-nowrap text-xs font-normal text-muted-foreground">{item.price}</span>
					</div>
					<RadioGroupItem value={item.id} id={'plan-' + item.id} className="mt-0.5" />
				</Label>
			)
		})}
	</RadioGroup>
)

export default RadioGroupWithPlanCards
