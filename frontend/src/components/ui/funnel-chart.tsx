import { useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { fa } from '@/engines/commission'
import { funnelGeometry } from './funnel-geometry'

const motionQuery = '(prefers-reduced-motion: reduce)'
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia(motionQuery)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
export interface FunnelItem { key: string; label: string; value: number }
export function FunnelChart({ data, color = 'var(--chart-1)', hoveredIndex, onHoverChange }: {
  data: FunnelItem[]; color?: string; hoveredIndex: number | null; onHoverChange: (index: number | null) => void
}) {
  const reduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true)
  const Path = reduce ? 'path' : motion.path
  const shapes = funnelGeometry(data.map(d => d.value))
  return <svg viewBox={`0 0 320 ${Math.max(64, data.length * 54 + 12)}`} className="w-full overflow-visible" role="group" aria-label="قیف تبدیل فروش">
    {data.map((d, i) => <motion.g key={d.key} initial={reduce ? false : { opacity: 0, scaleX: .05, y: 6 }}
      whileInView={{ opacity: 1, scaleX: 1, y: 0 }} viewport={{ once: true, amount: .2 }}
      transition={{ duration: reduce ? 0 : .45, delay: reduce ? 0 : i * .055, ease: [.22, 1, .36, 1] }} style={{ transformOrigin: '160px center' }}>
      <Path d={shapes[i].path} {...(reduce ? { opacity: hoveredIndex === null || hoveredIndex === i ? 1 : .48 } : { initial: { d: shapes[i].path }, animate: { d: shapes[i].path, opacity: hoveredIndex === null || hoveredIndex === i ? 1 : .48, scale: hoveredIndex === i ? 1.025 : 1 }, transition: { duration: .35, ease: [.22, 1, .36, 1] as [number, number, number, number] } })} fill={color}
        fillOpacity={1 - i * .12} stroke="var(--chart-outline)" strokeWidth={hoveredIndex === i ? 2 : .5}
        tabIndex={0} role="button" aria-label={`${d.label}: ${fa(d.value)}`} aria-pressed={hoveredIndex === i}
        onMouseEnter={() => onHoverChange(i)} onMouseLeave={() => onHoverChange(null)} onFocus={() => onHoverChange(i)} onBlur={() => onHoverChange(null)}
        onClick={() => onHoverChange(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHoverChange(i) } if (e.key === 'Escape') onHoverChange(null) }}
        className="focus-visible:outline-none focus-visible:stroke-[3px]" style={{ transformOrigin: '160px center' }}>
        <title>{d.label}: {fa(d.value)}</title>
      </Path>
    </motion.g>)}
  </svg>
}
export function FunnelLegend({ data, hoveredIndex, onHoverChange }: {
  data: FunnelItem[]; hoveredIndex: number | null; onHoverChange: (index: number | null) => void
}) {
  return <ul className="mt-2 space-y-1" aria-label="راهنمای قیف">{data.map((d, i) => <li key={d.key}>
    <button type="button" className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hoveredIndex === i ? 'bg-muted font-bold' : ''}`}
      aria-pressed={hoveredIndex === i} onMouseEnter={() => onHoverChange(i)} onMouseLeave={() => onHoverChange(null)}
      onFocus={() => onHoverChange(i)} onBlur={() => onHoverChange(null)} onClick={() => onHoverChange(i)}>
      <span>{d.label}</span><span className="tabular-nums">{fa(d.value)}</span>
    </button></li>)}</ul>
}
export default function Funnel({ data }: { data: FunnelItem[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  return <div><FunnelChart data={data} hoveredIndex={hoveredIndex} onHoverChange={setHoveredIndex} />
    <FunnelLegend data={data} hoveredIndex={hoveredIndex} onHoverChange={setHoveredIndex} /></div>
}
