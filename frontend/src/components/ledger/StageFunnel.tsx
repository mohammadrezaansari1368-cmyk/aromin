'use client'

/** C2 — قیفِ تبدیل با FunnelChart و Legendِ رسمیِ @bklit (layers=3، hover مشترک بینِ قیف و راهنما).
 *  داده تجمعی است (رسیده به هر مرحله: آغاز ⊇ واجد شرایط ⊇ پیشبرد ⊇ بستن) تا درصدها معنا داشته باشند؛ شکست جدا. */
import { useState } from 'react'
import { FunnelChart } from '@/components/charts/funnel-chart'
import { Legend, LegendItem as LegendItemComponent, LegendLabel, LegendMarker } from '@/components/charts/legend'

/** همهٔ نوشته‌های C2 انگلیسی (ارقامِ لاتین)؛ قالب‌دهندهٔ مشترکِ چارت‌ها فارسی می‌ماند */
const EN = (v: number) => v.toLocaleString('en-US')

export default function StageFunnel({ data, lost = 0 }: { data: { label: string; value: number }[]; lost?: number }) {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

	const legendItems = data.map((d) => ({
		label: d.label,
		value: d.value,
		color: 'var(--chart-1)',
	}))

	return (
		<div dir="ltr">
			<FunnelChart
				color="var(--chart-1)"
				data={data}
				hoveredIndex={hoveredIndex}
				layers={3}
				onHoverChange={setHoveredIndex}
				formatValue={EN}
			/>
			<Legend
				hoveredIndex={hoveredIndex}
				items={legendItems}
				onHoverChange={setHoveredIndex}
				className="mt-2 flex-row flex-wrap justify-center gap-1"
			>
				<LegendItemComponent className="flex items-center gap-1.5 text-xs">
					<LegendMarker />
					<LegendLabel />
				</LegendItemComponent>
			</Legend>
			<p className="mt-2 text-xs text-muted-foreground">Lost: {lost}</p>
		</div>
	)
}
