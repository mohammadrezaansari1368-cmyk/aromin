import { describe, it, expect } from 'vitest'
import { dealDate, funnelDays, isStagnant, monthlySeries } from './ledger-analysis'
import { period, freshS, type Deal } from '@/engines/commission'
const d = (x: Partial<Deal> = {}): Deal => ({ id: 1, entry: '1405/06/01', funnel: 'advance', ...x })
describe('ledger dates and stagnation', () => {
 it('normalizes Persian dates and never fabricates missing dates', () => { expect(dealDate('۱۴۰۵/۶/۵')).toBe('1405/06/05'); expect(dealDate('')).toBe('') })
 it('measures actual Jalali elapsed days and strict >40 boundary', () => {
  expect(funnelDays(d({stageChangedAt:'1405/07/10'}))).toBe(40)
  expect(funnelDays(d({stageChangedAt:'16:32:51 1405/07/10'}))).toBe(40)   // قالبِ Joolio: ساعت اول
  expect(isStagnant(d({stageChangedAt:'1405/07/10'}))).toBe(false)
  expect(isStagnant(d({stageChangedAt:'1405/07/11'}))).toBe(true)
  expect(isStagnant(d({entry:''}), '1405/07/15')).toBe(false)
  expect(isStagnant(d({funnel:'won'}), '1405/07/15')).toBe(false)
  expect(isStagnant(d(), '1405/07/11')).toBe(true)
 })
 it('keeps 31 slots, excludes other months, and does not invent Mehr 31', () => {
  const series=monthlySeries([d({saleDate:'1405/07/01',funnel:'won',amount:10}), d({saleDate:'1405/07/01',funnel:'won',settle:'check',amount:20}), d({saleDate:'1404/07/01',funnel:'won',amount:900})], '1405/07/13')
  expect(series).toHaveLength(31); expect(series[0]).toMatchObject({desktop:10,mobile:20,tablet:0}); expect(series[30].desktop).toBeNull()
 })
})
describe('salary models and finance attribution', () => {
 const inv = [d({ month:0, amount:100000000, funnel:'won', settle:'cash', finBy:'مالی' })]
 it('fixed has no commission but preserves outgoing financial share and manager bonus', () => {
  const normal=period(inv,freshS()), fixed=period(inv,freshS(),{comp:'fixed',approvedBonus:500})
  expect(fixed.payout).toBe(0); expect(fixed.payNow).toBe(0); expect(fixed.payCheck).toBe(0); expect(fixed.payPend).toBe(0)
  expect(fixed.financeBonus).toEqual(normal.financeBonus); expect(fixed.financeBonus['مالی'].base).toBeGreaterThan(0)
  expect(fixed.total).toBe(fixed.baseTotal+500)
 })
 it('reads historical financial approvals without rewriting the invoice', () => {
  const old = {...inv[0], finBy: undefined, finApproval: {by:'مالی'}}
  expect(period([old],freshS()).financeBonus['مالی'].basis).toBe(5000000)
  expect(old.finBy).toBeUndefined()
 })
 it('pure commission excludes salary, hybrid includes it', () => {
  const hybrid=period(inv,freshS()), pure=period(inv,freshS(),{comp:'commission'})
  expect(pure.baseTotal).toBe(0); expect(pure.total).toBe(pure.payout); expect(hybrid.total).toBe(hybrid.baseTotal+pure.payout)
 })
 it('credits finance for held invoices without treating suspended credit as cash', () => {
  const t=period(inv.map(d=>({...d,settle:'hold'})),freshS(),{comp:'fixed'})
  expect(t.financeBonus['مالی'].basis).toBe(5000000); expect(t.financeBonus['مالی'].cash).toBe(0); expect(t.financeBonus['مالی'].pending).toBeGreaterThan(0)
 })
 it('month filtering excludes credits even when another month is explicitly active', () => {
  const S=freshS(); S.months={'0':{active:true,cfg:{base:1,threshold:0,tiers:[{cap:200,rate:3}]}}}
  expect(period(inv,S,{GM:1}).financeBonus).toEqual({})
 })
})
