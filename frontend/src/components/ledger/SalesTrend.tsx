import { useId, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, Brush } from 'recharts'
import { curveCatmullRom } from 'victory-vendor/d3-shape'
import { useReducedMotion } from 'motion/react'
import { fa, sep, type Deal } from '@/engines/commission'
import { monthlySeries } from '@/lib/ledger-analysis'

function Background({ pattern, opacity }: { pattern: 'dots'; opacity: number }) {
 const id = useId().replace(/:/g, '')
 return <g aria-hidden><defs><pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill="currentColor" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${id})`} opacity={pattern === 'dots' ? opacity : 0} className="text-border" /></g>
}
const series = [{ key: 'desktop', name: 'نقدی', color: 'var(--chart-1)' }, { key: 'mobile', name: 'چک', color: 'var(--chart-2)' }, { key: 'tablet', name: 'معلق', color: 'var(--chart-3)' }]
/** Brush layout over the project's existing Recharts renderer. */
function ChartBrushLayout({ data, enabled, height, tweenYDomainOnXDomainChange }: { data: ReturnType<typeof monthlySeries>; enabled: boolean; height: number; tweenYDomainOnXDomainChange: boolean }) {
 const reduced = useReducedMotion()
 const [range, setRange] = useState({ startIndex: 0, endIndex: 30 })
 const fadeId = useId().replace(/:/g, '')
 const visible = data.slice(range.startIndex, range.endIndex + 1)
 const max = Math.max(1, ...visible.flatMap(p => [p.desktop || 0, p.mobile || 0, p.tablet || 0]))
 return <div dir="ltr" className="w-full min-w-0" aria-label="نمودار فروش ماه جاری با انتخاب بازه">
  <ResponsiveContainer width="100%" height={220} minWidth={0}>
   <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
    <Background pattern="dots" opacity={0.85} />
    <defs><linearGradient id={fadeId}><stop offset="0%" stopColor="white" stopOpacity="0.3"/><stop offset="4%" stopColor="white"/><stop offset="96%" stopColor="white"/><stop offset="100%" stopColor="white" stopOpacity="0.3"/></linearGradient><mask id={`${fadeId}-mask`}><rect width="100%" height="100%" fill={`url(#${fadeId})`}/></mask></defs>
    <XAxis dataKey="day" tickFormatter={fa} minTickGap={12} />
    <YAxis hide domain={[0, max * 1.1]} />
    <ChartTooltip formatter={(v) => `${sep(Number(v))} تومان`} labelFormatter={v => data[Number(v) - 1]?.date || 'روز ناموجود در این ماه'} contentStyle={{ direction: 'rtl', background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
    {series.map(s => <Line key={s.key} dataKey={s.key} name={s.name} type={curveCatmullRom} stroke={s.color} strokeWidth={2} dot={false} connectNulls={false} mask={`url(#${fadeId}-mask)`} isAnimationActive={!reduced && tweenYDomainOnXDomainChange} animationDuration={300} />)}
    {enabled && <Brush dataKey="day" height={height} startIndex={range.startIndex} endIndex={range.endIndex} onChange={v => setRange({ startIndex: v.startIndex ?? 0, endIndex: v.endIndex ?? 30 })} tickFormatter={fa} stroke="var(--chart-1)" fill="hsl(var(--card))"><LineChart data={data}>{series.map(s => <Line key={s.key} dataKey={s.key} type={curveCatmullRom} stroke={s.color} strokeWidth={1} dot={false} isAnimationActive={false} />)}</LineChart></Brush>}
   </LineChart>
  </ResponsiveContainer>
  <div dir="rtl" className="flex flex-wrap gap-3 text-xs">{series.map(s => <span key={s.key} style={{ color: s.color }}>{s.name}</span>)}</div>
 </div>
}
export default function SalesTrend({ deals }: { deals: Deal[] }) {
 return <ChartBrushLayout data={monthlySeries(deals)} enabled height={72} tweenYDomainOnXDomainChange />
}
