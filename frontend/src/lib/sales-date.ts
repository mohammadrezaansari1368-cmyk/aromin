import { parseJ, todayJ } from './jalali'
import type { Deal } from '@/engines/commission'

/** Actual Excel date only; fiscal year is always read separately from its source column. */
export function excelSaleDate(value: unknown, date1904 = false): string {
 if (value instanceof Date) return Number.isFinite(value.getTime()) ? todayJ(value) : ''
 if (typeof value === 'number') {
  if (value < 10000 || value > 100000) return ''
  const utc = new Date((Math.floor(value) - (date1904 ? 24107 : 25569)) * 86400000 + 43200000)
  return todayJ(utc)
 }
 const text = String(value ?? '').trim().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
 const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T].*)?$/)
 if (!match) return ''
 const [,y,m,d] = match, year=+y, month=+m, day=+d
 if (year < 1700) return parseJ(`${y}/${m}/${d}`)?.j || ''
 const utc = new Date(Date.UTC(year,month-1,day,12))
 if (year > 2200 || utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month-1 || utc.getUTCDate() !== day) return ''
 return todayJ(utc)
}
export const saleDateKey = (pid: string | number, id: number) => `${pid}:${id}`
export function saleDateOf(d: Deal, dates?: Record<string,string>, pid?: string | number): string {
 return excelSaleDate(d.saleDate) || excelSaleDate(pid === undefined ? '' : dates?.[saleDateKey(pid,d.id)])
}
