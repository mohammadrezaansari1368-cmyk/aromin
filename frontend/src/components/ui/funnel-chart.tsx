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
/** آیکونِ هر وضعیتِ قیف (خطی، ۲۴×۲۴) — به‌جای فهرستِ متنی، روی خودِ قیف */
const FUNNEL_ICON: Record<string, string> = {
  start: 'M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-5 3.6 1.9-5.8L4 8.8h6.1z',
  qualify: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0|M16 11l2 2 4-4',
  advance: 'M22 7l-8.5 8.5-5-5L2 17|M16 7h6v6',
  won: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3',
  lost: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M15 9l-6 6|M9 9l6 6',
}
const INSIDE = 84   // پهنای کافی برای آیکون و عدد داخلِ نوار؛ کمتر از آن کنارِ نوار

export function FunnelChart({ data, color = 'var(--chart-1)', colors, hoveredIndex, onHoverChange, caption }: {
  data: FunnelItem[]; color?: string; colors?: readonly string[]; hoveredIndex: number | null; onHoverChange: (index: number | null) => void; caption?: string
}) {
  const reduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true)
  const Path = reduce ? 'path' : motion.path
  const shapes = funnelGeometry(data.map(d => d.value))
  return <svg viewBox={`0 0 320 ${Math.max(64, data.length * 54 + 12)}`} className="w-full overflow-visible" role="group" aria-label="قیف تبدیل فروش">
    {caption && <title>{caption}</title>}
    {data.map((d, i) => {
      const w = shapes[i].width, cy = i * 54 + 30, inside = w >= INSIDE, num = fa(d.value)
      // داخل: [عدد][آیکون] وسطِ نوار؛ بیرون: کنارِ راستِ نوار (نوارِ صفر: از وسط)
      const iconX = inside ? 162 : 160 + w / 2 + 8, numX = inside ? 158 : iconX + 22
      const segmentColor = colors?.length ? colors[i % colors.length] : color
      const ink = inside ? (segmentColor === '#FCBF00' ? '#111' : '#fff') : 'currentColor'
      return <motion.g key={d.key} initial={reduce ? false : { opacity: 0, scaleX: .05, y: 6 }}
        whileInView={{ opacity: 1, scaleX: 1, y: 0 }} viewport={{ once: true, amount: .2 }}
        transition={{ duration: reduce ? 0 : .35, delay: reduce ? 0 : i * .055, ease: [.22, 1, .36, 1] }} style={{ transformOrigin: '160px center' }}>
        <Path data-seg={d.key} d={shapes[i].path} {...(reduce ? { opacity: hoveredIndex === null || hoveredIndex === i ? 1 : .48 } : { initial: { d: shapes[i].path }, animate: { d: shapes[i].path, opacity: hoveredIndex === null || hoveredIndex === i ? 1 : .48, scale: hoveredIndex === i ? 1.025 : 1 }, transition: { duration: .35, ease: [.22, 1, .36, 1] as [number, number, number, number] } })} fill={segmentColor}
          fillOpacity={colors?.length ? 1 : 1 - i * .12} stroke="var(--chart-outline)" strokeWidth={w === 0 ? 0 : hoveredIndex === i ? 2 : .5}
          tabIndex={0} role="button" aria-label={`${d.label}: ${num}`} aria-pressed={hoveredIndex === i}
          onMouseEnter={() => onHoverChange(i)} onMouseLeave={() => onHoverChange(null)} onFocus={() => onHoverChange(i)} onBlur={() => onHoverChange(null)}
          onClick={() => onHoverChange(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHoverChange(i) } if (e.key === 'Escape') onHoverChange(null) }}
          className="focus-visible:outline-none focus-visible:stroke-[3px]" style={{ transformOrigin: '160px center' }}>
          <title>{d.label}: {num}</title>
        </Path>
        <g aria-hidden pointerEvents="none" className={inside ? '' : 'text-foreground'} opacity={hoveredIndex === null || hoveredIndex === i ? 1 : .55}>
          <g transform={`translate(${iconX} ${cy - 8}) scale(.68)`} fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            {(FUNNEL_ICON[d.key] || FUNNEL_ICON.start).split('|').map(p => <path key={p} d={p} />)}
          </g>
          <text direction="ltr" x={numX} y={cy + 5} textAnchor={inside ? 'end' : 'start'} fontSize={14} fontWeight={800} fill={ink}
            style={inside ? { paintOrder: 'stroke', stroke: 'rgb(0 0 0 / .22)', strokeWidth: 2.5 } : undefined}>{num}</text>
        </g>
      </motion.g>
    })}
  </svg>
}
export default function Funnel({ data, caption, colors, legend = false }: { data: FunnelItem[]; caption?: string; colors?: readonly string[]; legend?: boolean }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const active = hoveredIndex === null ? null : data[hoveredIndex]
  return <div>
    <FunnelChart data={data} colors={colors} hoveredIndex={hoveredIndex} onHoverChange={setHoveredIndex} caption={caption} />
    {legend && <ul aria-label="راهنمای رنگ‌های قیف" className="mt-2 space-y-1">{data.map((item, i) => <li key={item.key}>
      <button type="button" aria-pressed={hoveredIndex === i} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(i)} onBlur={() => setHoveredIndex(null)} onClick={() => setHoveredIndex(i)} onKeyDown={e => { if (e.key === 'Escape') setHoveredIndex(null) }} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring ${hoveredIndex === i ? 'bg-muted font-bold' : ''}`}>
        <span aria-hidden data-legend-marker className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colors?.length ? colors[i % colors.length] : 'var(--chart-1)' }} />
        <span>{item.label}</span><span className="mr-auto tabular-nums">{fa(item.value)}</span>
      </button>
    </li>)}</ul>}
    {/* نامِ وضعیت فقط هنگامِ hover/فوکوس؛ ارتفاعِ ثابت تا کاشی جابه‌جا نشود */}
    <p className="pointer-events-none mt-1 h-4 text-center text-[11px] font-bold text-muted-foreground" aria-live="polite">{active ? `${active.label}: ${fa(active.value)}` : ''}</p>
  </div>
}
