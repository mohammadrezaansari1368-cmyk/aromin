import { funnelOf, num, type Deal } from '@/engines/commission'
import { parseJ, todayJ } from './jalali'

export function dealDate(value: unknown): string {
 const text = String(value || '').trim().split(/[ T]/)[0]
 return parseJ(text)?.j || ''
}
/** Elapsed registration-to-stage-change days; ongoing deals without a change use today. */
export function funnelDays(d: Deal, today = todayJ()): number | null {
 const start = parseJ(dealDate(d.entry)), end = parseJ(dealDate(d.stageChangedAt) || today)
 if (!start || !end) return null
 const days = Math.round((Date.parse(end.iso) - Date.parse(start.iso)) / 86400000)
 return days >= 0 ? days : null
}
export function isStagnant(d: Deal, today = todayJ()) {
 return !['won', 'lost'].includes(funnelOf(d)) && (funnelDays(d, today) ?? 0) > 40
}
export function monthlySeries(deals: Deal[], today = todayJ()) {
 const month = today.slice(0, 7)
 const points = Array.from({ length: 31 }, (_, i) => {
  const date = `${month}/${String(i + 1).padStart(2, '0')}`
  const valid = !!parseJ(date)
  return { day: i + 1, date: valid ? date : '', desktop: valid ? 0 : null, mobile: valid ? 0 : null, tablet: valid ? 0 : null }
 })
 for (const d of deals) {
  const date = dealDate(d.entry)
  if (!date.startsWith(month + '/') || funnelOf(d) !== 'won') continue
  const p = points[+date.slice(-2) - 1]
  const key = d.settle === 'hold' ? 'tablet' : d.settle === 'check' ? 'mobile' : 'desktop'
  if (p && p[key] !== null) p[key] += num(d.amount)
 }
 return points
}
