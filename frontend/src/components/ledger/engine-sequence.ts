import { DEFAULT_WEIGHTS, STAGES, stagesOf, type Deal } from '@/engines/commission'

// Visual landmarks, independent of commission weights. See vendor/engine-assembly.md.
export const ENGINE_INTRO = [1, 18] as const
export const ENGINE_RANGES = [[19,28],[29,35],[36,46],[47,53],[54,70],[71,76],[77,121]] as const
export const ENGINE_BASE_FRAME = 18
export function engineState(deal?: Deal) {
 const completed = new Set(deal ? stagesOf(deal) : [])
 let prefix = 0
 while (prefix < STAGES.length && completed.has(STAGES[prefix].k)) prefix++
 return {
  completed, prefix,
  percent: STAGES.reduce((n,s)=> n + (completed.has(s.k) ? DEFAULT_WEIGHTS[s.k] : 0),0),
  endFrame: prefix ? ENGINE_RANGES[prefix-1][1] : ENGINE_BASE_FRAME,
  signature: STAGES.map(s=>completed.has(s.k) ? '1' : '0').join(''),
 }
}
