import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverAttendanceDays, serverEffort } from '../lib/effort'
import { clearPerfCache, perfCacheGeneration, readPerfCache, writePerfCache, perfCacheRemaining } from '../data/perfCache'

afterEach(() => { clearPerfCache(); vi.useRealTimers() })
describe('WO1 server effort', () => {
 it('uses server talk seconds, dated task minutes and attendance workdays', () => {
  const result = serverEffort({ effort_talk_seconds: 7200, calls_in: 2, calls_out: 3 }, 2, 60, 4)
  expect(result.perDay).toBe(1.5); expect(result.talkMin).toBe(120); expect(result.taskMin).toBe(60)
  expect(result.calls).toBe(5)
 })
 it('shows no data and the agreed reason without server workdays', () => {
  expect(serverEffort({ effort_talk_seconds: 7200 }, 0)).toMatchObject({ perDay: null, zone: 'none', reason: 'روزِ کارکرد از دستگاه حضور هنوز نیامده' })
  expect(serverEffort(null, 2).perDay).toBeNull()
 })
 it('uses only confirmed server card mappings and unique period days', () => {
  const day = { date: '1405/07/02', presentMin: 450 }
  const confirmed = { personId: '1', mapping: 'confirmed', days: [day] }
  expect(serverAttendanceDays([confirmed, confirmed, { ...confirmed, mapping: 'suggested', days: [{ ...day, date: '1405/07/03' }] }], '1', '1405/07/01', '1405/07/30')).toHaveLength(1)
  expect(serverAttendanceDays([confirmed], '2', '1405/07/01', '1405/07/30')).toEqual([])
  expect(serverAttendanceDays([confirmed, { ...confirmed, days: [{ ...day, presentMin: 100 }] }], '1', '1405/07/01', '1405/07/30')).toEqual([])
 })
})
describe('WO1 cache', () => {
 it('marks data stale at 60 seconds', () => {
  vi.useFakeTimers(); writePerfCache('a', { value: 1 }, perfCacheGeneration())
  vi.advanceTimersByTime(59_999); expect(readPerfCache('a')).toEqual({ value: 1 })
  vi.advanceTimersByTime(1); expect(readPerfCache('a')).toEqual({ value: 1 }); expect(perfCacheRemaining('a')).toBe(0)
 })
 it('invalidates entries and rejects a stale in-flight response', () => {
  const generation = perfCacheGeneration(); writePerfCache('a', 1, generation); writePerfCache('b', 2, generation)
  clearPerfCache(); writePerfCache('a', 3, generation)
  expect(readPerfCache('a')).toBe(1); expect(readPerfCache('b')).toBe(2); expect(perfCacheRemaining('a')).toBe(0)
 })
})
