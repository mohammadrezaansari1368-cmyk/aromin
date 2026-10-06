import {describe,it,expect} from 'vitest'
import {STAGES} from '@/engines/commission'
import {ENGINE_STAGES,engineState,initialPlayback,nextPlayback,PLAYBACK_DELAYS} from './engine-sequence'

describe('C4 real completion and bounded loop',()=>{
 it('stops at the first gap for all 128 checkbox combinations, across repeated loops',()=>{
  for(let mask=0;mask<128;mask++){
   const stages=STAGES.filter((_,i)=>mask&(1<<i)).map(s=>s.k)
   const state=engineState({id:1,stages})
   let prefix=0;while(prefix<7&&(mask&(1<<prefix)))prefix++
   expect(state.prefix).toBe(prefix)
   expect(state.endFrame).toBe(prefix?ENGINE_STAGES[prefix-1].frameEnd:18)
   let playback=initialPlayback(prefix),loops=0
   for(let i=0;i<500;i++){
    const next=nextPlayback(playback,prefix)
    expect(next.frame).toBeGreaterThanOrEqual(18)
    expect(next.frame).toBeLessThanOrEqual(state.endFrame)
    expect(next.activated).toBeLessThanOrEqual(prefix)
    expect(next.stage).toBeLessThan(Math.max(1,prefix))
    if(next.frame===121)expect(mask).toBe(127)
    if(next.frame<playback.frame){expect(playback.phase).toBe('reset-out');expect(next.phase).toBe('reset-load');loops++}
    playback=next
   }
   if(prefix)expect(loops).toBeGreaterThanOrEqual(2)
   else expect(playback).toEqual(initialPlayback(0))
  }
 })
 it('resolves required 0%, 50%, 85%, 100% states separately from frame lengths',()=>{
  expect([0,4,5,7].map(n=>{const s=engineState({id:1,stages:STAGES.slice(0,n).map(s=>s.k)});return [s.percent,s.endFrame]})).toEqual([[0,18],[50,53],[85,70],[100,121]])
  expect(ENGINE_STAGES.map(s=>s.weight)).toEqual([5,10,20,15,35,10,5])
  expect(ENGINE_STAGES.map(s=>s.frameEnd-s.frameStart+1)).toEqual([10,7,11,7,17,6,45])
 })
 it('does not visually assemble later flags after a gap',()=>{
  const state=engineState({id:1,stages:['lead','funnel','follow','close','post','fin']})
  expect(state.percent).toBe(90);expect(state.prefix).toBe(1);expect(state.endFrame).toBe(28)
  expect(engineState().endFrame).toBe(18)
 })
 it('resolves reduced motion to the static valid end frame',()=>{
  for(let prefix=0;prefix<=7;prefix++){
   const p=initialPlayback(prefix,true)
   expect(p.frame).toBe(prefix?ENGINE_STAGES[prefix-1].frameEnd:18)
   expect(p.phase).toBe('stopped');expect(p.activated).toBe(prefix)
   expect(nextPlayback(p,prefix)).toEqual(p)
  }
 })
 it('activates only after attachment/glow and holds labels and final frame for 2s',()=>{
  let p=initialPlayback(1)
  while(p.phase==='attach')p=nextPlayback(p,1)
  expect(p).toMatchObject({frame:28,activated:0,phase:'glow'})
  p=nextPlayback(p,1);expect(p).toMatchObject({activated:1,phase:'fade-in'})
  const phases=[]
  for(let i=0;i<7;i++){phases.push(p.phase);p=nextPlayback(p,1)}
  expect(phases).toEqual(['fade-in','hold','fade-out','final-hold','reset-out','reset-load','reset-in'])
  expect(PLAYBACK_DELAYS.hold).toBe(2000);expect(PLAYBACK_DELAYS['final-hold']).toBe(2000)
  expect(PLAYBACK_DELAYS['fade-in']).toBe(300);expect(PLAYBACK_DELAYS['fade-out']).toBe(300)
 })
 it('uses the existing owner-adjusted stage source without modifying the deal',()=>{
  const deal={id:1,stages:STAGES.map(s=>s.k),finBy:'مالی'}
  expect(engineState(deal).prefix).toBe(6)
  expect(deal.stages).toHaveLength(7)
 })
})
