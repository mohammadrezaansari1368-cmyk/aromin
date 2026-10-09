import { describe, expect, it } from 'vitest'
import { yearDays } from './PerformanceWorkspace'
import { parseJ } from '@/lib/jalali'
describe('Jalali performance year',()=>{
 it('includes the complete leap year and no rollover duplicate',()=>{
  const days=yearDays(1403)
  expect(days).toHaveLength(366)
  expect(days.at(-1)?.date).toBe('1403/12/30')
  expect(new Set(days.map(d=>d.date)).size).toBe(366)
 })
 it('uses Saturday-first UTC day placement without client timezone drift',()=>{
  expect(yearDays(1404)).toHaveLength(365)
  expect(yearDays(1404)[0]).toMatchObject({date:'1404/01/01',weekday:6})
  expect(yearDays(1404)[1].weekday).toBe(0)
  for(const d of yearDays(1405))expect(d.weekday).toBe((new Date(parseJ(d.date)!.iso+'T12:00:00Z').getUTCDay()+1)%7)
 })
 it('rejects unsupported years instead of manufacturing days',()=>{expect(yearDays(0)).toEqual([])})
})
