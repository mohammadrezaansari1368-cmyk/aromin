import { useMemo } from 'react'
import { curveCatmullRom } from '@visx/curve'
import { useReducedMotion } from 'motion/react'
import { Background, ChartBrush, ChartBrushLayout, ChartTooltip, Line, LineChart, XAxis } from '@/components/charts'
import { fa, funnelOf, sep, type Deal } from '@/engines/commission'
import { monthlySeries } from '@/lib/ledger-analysis'
import { parseJ } from '@/lib/jalali'
import { saleDateOf } from '@/lib/sales-date'
const series = [{ key: 'desktop', name: 'نقدی', color: 'var(--chart-1)' }, { key: 'mobile', name: 'چک', color: 'var(--chart-2)' }, { key: 'tablet', name: 'معلق', color: 'var(--chart-3)' }]

export default function SalesTrend({ deals }: { deals: Deal[] }) {
 const reduced = useReducedMotion()
 const data = useMemo(() => monthlySeries(deals).filter(p => p.date).map(p => ({ ...p, date: new Date(parseJ(p.date)!.iso + 'T12:00:00Z') })), [deals])
 const missing = deals.filter(d => funnelOf(d) === 'won' && !saleDateOf(d)).length
 return <div data-bklit-sales-chart dir="ltr" className="w-full min-w-0" aria-label="فروش روزانه بر اساس تاریخ فروش اکسل">
  <ChartBrushLayout data={data} enabled height={72} className="h-[290px]" brushStrip={layout => (
   <LineChart data={data} animationDuration={0} status="ready" aspectRatio="" style={{height:'100%'}} margin={{top:5,bottom:5,left:12,right:12}}>
    {series.map(s => <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={1} animate={false} curve={curveCatmullRom} />)}
    <ChartBrush initialSelection={layout.brushSelection ?? undefined} onSelectionChange={layout.onBrushSelectionChange} />
   </LineChart>
  )}>
   {layout => <LineChart data={data} xDomain={layout.xDomain} xDomainSlotCount={layout.xDomainSlotCount} tweenYDomainOnXDomainChange={!reduced} yDomainTween={!reduced} animationDuration={reduced ? 0 : 400} aspectRatio="" style={{height:'100%'}} margin={{top:15,right:12,left:12,bottom:32}}>
    <Background pattern="dots" opacity={0.85} />
    {series.map(s => <Line key={s.key} dataKey={s.key} stroke={s.color} curve={curveCatmullRom} fadeEdges strokeWidth={2} animate={!reduced} />)}
    <XAxis />
    <ChartTooltip rows={point => series.map(s => ({ color:s.color, label:s.name, value:sep(Number(point[s.key]))+' تومان' }))} />
   </LineChart>}
  </ChartBrushLayout>
  <div dir="rtl" className="mt-2 flex flex-wrap gap-3 text-xs">{series.map(s => <span key={s.key} style={{color:s.color}}>{s.name}</span>)}</div>
  {missing > 0 && <p dir="rtl" role="status" className="mt-2 text-xs text-warning">{fa(missing)} فاکتور تاریخ فروش ندارد؛ برای تکمیل تاریخ، همان اکسل را با روش «افزودن» دوباره ایمپورت کنید.</p>}
 </div>
}
