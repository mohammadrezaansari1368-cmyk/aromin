import { describe, expect, it } from 'vitest'
import { funnelGeometry, funnelReach } from './funnel-geometry'
describe('funnel geometry', () => {
 it('preserves magnitudes, including increasing input without falsifying it', () => {
  expect(funnelGeometry([100, 50, 25]).map(x => x.width)).toEqual([280, 140, 70])
  expect(funnelGeometry([10, 100])[0].width).toBe(28)
 })
 it('handles zero, tiny, negative and nonfinite values without clipping', () => {
  expect(funnelGeometry([100, .01, 0, -1, NaN]).map(x => x.width)).toEqual([280, 8, 0, 0, 0])
  expect(funnelGeometry([])).toEqual([])
 })
 it('derives descending reach from disjoint stage counts and excludes losses', () => {
  expect(funnelReach({ start: {n: 10}, qualify: {n: 5}, advance: {n: 3}, won: {n: 2}, lost: {n: 100} }).map(x => x.value)).toEqual([20, 10, 5, 2])
 })
})
