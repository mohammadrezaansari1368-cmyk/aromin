import { expect, it } from 'vitest'
import { period, freshS, settlementChoices, SETTLE, type Deal } from '../commission'
it('keeps collected cheque funds in cash analytics without changing commission weights', () => {
 const invoice: Deal = {id:1, no:'A', month:0, name:'customer', amount:'1000000000', funnel:'won', channel:'unofficial', kind:'new', close:'all'}
 const collected = period([{...invoice, settle:'cash_after_check'}], freshS(), {GM:'all'})
 const cash = period([{...invoice, settle:'cash'}], freshS(), {GM:'all'})
 const pending = period([{...invoice, settle:'check'}], freshS(), {GM:'all'})
 expect(collected.payNow).toBe(cash.payNow)
 expect(collected.payCheck).toBe(0)
 expect(pending.payCheck).toBeGreaterThan(0)
 expect(collected.payout).toBe(pending.payout)
 expect(freshS().weights).toEqual({lead:5, pre:10, funnel:20, follow:15, close:35, post:10, fin:5})
})
it('uses collection statuses for cheque editing and retains historical filters', () => {
 expect(settlementChoices('check').map(s=>s.v)).toEqual(['check','cash_after_check'])
 expect(SETTLE.map(s=>s.v)).toContain('hold')
 expect(SETTLE.find(s=>s.v==='cash_after_check')?.t).toBe('نقد پس از وصول چک')
})
