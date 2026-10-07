import { describe, expect, it } from 'vitest'
import { salesProgress } from './ledger-roles'
import { STAGE_KEYS, wDeal, DEFAULT_WEIGHTS } from '@/engines/commission'
describe('sales progress from existing business state', () => {
 it.each([['start',5,1],['qualify',15,2],['advance',85,5],['won',85,5],['lost',0,0]] as const)('%s derives its prefix independently of allocation', (funnel,percent,count) => {
  expect(salesProgress({id:1,funnel,stages:STAGE_KEYS,close:'all',mgrShare:true,leadGen:'other'})).toEqual({stages:STAGE_KEYS.slice(0,count),percent})
 })
 it('uses explicit post-sale evidence and independent financial verification', () => {
  expect(salesProgress({id:1,funnel:'advance',supportGen:'support',supportSla:true}).percent).toBe(95)
  expect(salesProgress({id:1,funnel:'advance',finBy:'accountant'}).percent).toBe(90)
  expect(salesProgress({id:1,funnel:'won',taskPost:1,finBy:'accountant'}).percent).toBe(100)
  expect(salesProgress({id:1,funnel:'won',supportGen:'support',supportSla:false}).percent).toBe(85)
 })
 it('ledger approval and lock cannot provide financial verification', () => {
  expect(salesProgress({id:1,funnel:'won',finState:'approved',finApproval:{by:'manager'},finClosed:{by:'manager'},finBy:' '}).percent).toBe(85)
 })
 it('does not mutate inputs or commission calculations', () => {
  const deal={id:1,funnel:'advance',stages:['lead','close'] as typeof STAGE_KEYS,mgrShare:true}
  const before=JSON.stringify(deal),commission=wDeal(deal,DEFAULT_WEIGHTS)
  salesProgress(deal)
  expect(JSON.stringify(deal)).toBe(before)
  expect(wDeal(deal,DEFAULT_WEIGHTS)).toBe(commission)
 })
})
