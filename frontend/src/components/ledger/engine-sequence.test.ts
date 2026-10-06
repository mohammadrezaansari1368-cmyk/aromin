import { describe,it,expect } from 'vitest'
import { STAGES } from '@/engines/commission'
import { ENGINE_RANGES, engineState } from './engine-sequence'
describe('C4 real stage completion',()=>{
 it('stops at the first gap for every possible set of stage ticks',()=>{
  for(let mask=0;mask<128;mask++) {
   const stages=STAGES.filter((_,i)=>mask&(1<<i)).map(s=>s.k)
   const state=engineState({id:1,stages})
   let prefix=0;while(prefix<7 && (mask&(1<<prefix)))prefix++
   expect(state.prefix).toBe(prefix)
   expect(state.endFrame).toBe(prefix?ENGINE_RANGES[prefix-1][1]:18)
   expect(state.endFrame>=77).toBe(mask===127)
  }
 })
 it('keeps business percentages independent from frame lengths',()=>{
  expect([0,4,5,7].map(n=>{const s=engineState({id:1,stages:STAGES.slice(0,n).map(s=>s.k)});return [s.percent,s.endFrame]})).toEqual([[0,18],[50,53],[85,70],[100,121]])
  expect(engineState().percent).toBe(0)
  expect(engineState({id:1,stages:['lead','funnel','close','post','fin']}).prefix).toBe(1)
 })
 it('uses the same owner-adjusted stage source as ledger checkboxes',()=>{
  expect(engineState({id:1,stages:STAGES.map(s=>s.k),finBy:'مالی'}).prefix).toBe(6)
 })
})
