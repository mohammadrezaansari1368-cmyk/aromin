import { DEFAULT_WEIGHTS, STAGES, stagesOf, type Deal } from '@/engines/commission'

// Visual landmarks and responsive anchors, independent of business weights.
// Names/keys/weights come only from the existing commission source.
export const ENGINE_STAGES = [
 {frameStart:19,frameEnd:28,x:18,y:69},
 {frameStart:29,frameEnd:35,x:29,y:35},
 {frameStart:36,frameEnd:46,x:40,y:73},
 {frameStart:47,frameEnd:53,x:50,y:34},
 {frameStart:54,frameEnd:70,x:63,y:74},
 {frameStart:71,frameEnd:76,x:76,y:35},
 {frameStart:77,frameEnd:121,x:87,y:67},
].map((visual,i)=>({number:String(i+1).padStart(2,'0'),key:STAGES[i].k,label:STAGES[i].t,weight:DEFAULT_WEIGHTS[STAGES[i].k],...visual}))
export const ENGINE_INTRO = [1,18] as const
export const ENGINE_BASE_FRAME = 18
export function engineState(deal?: Deal) {
 const completed = new Set(deal ? stagesOf(deal) : [])
 let prefix = 0
 while (prefix<ENGINE_STAGES.length && completed.has(ENGINE_STAGES[prefix].key)) prefix++
 return {
  completed,prefix,
  percent:ENGINE_STAGES.reduce((n,s)=>n+(completed.has(s.key)?s.weight:0),0),
  endFrame:prefix?ENGINE_STAGES[prefix-1].frameEnd:ENGINE_BASE_FRAME,
  signature:ENGINE_STAGES.map(s=>completed.has(s.key)?'1':'0').join(''),
 }
}
export const PLAYBACK_DELAYS = {
 attach:1000/24,glow:150,'fade-in':300,hold:2000,'fade-out':300,
 'final-hold':2000,'reset-out':300,'reset-load':0,'reset-in':300,stopped:0,
} as const
export type PlaybackPhase = keyof typeof PLAYBACK_DELAYS
export type Playback = {frame:number;stage:number;activated:number;phase:PlaybackPhase}
export function initialPlayback(prefix:number,reduced=false): Playback {
 return {
  frame:reduced && prefix?ENGINE_STAGES[prefix-1].frameEnd:ENGINE_BASE_FRAME,
  stage:0,activated:reduced?prefix:0,phase:reduced || !prefix?'stopped':'attach',
 }
}
/** One forward-only step; backward reset happens only behind an image fade. */
export function nextPlayback(p:Playback,prefix:number): Playback {
 if(!prefix) return initialPlayback(0)
 const s=ENGINE_STAGES[p.stage]
 switch(p.phase){
  case 'attach':return p.frame<s.frameEnd?{...p,frame:Math.min(Math.max(p.frame+1,s.frameStart),s.frameEnd)}:{...p,phase:'glow'}
  case 'glow':return {...p,activated:p.stage+1,phase:'fade-in'}
  case 'fade-in':return {...p,phase:'hold'}
  case 'hold':return {...p,phase:'fade-out'}
  case 'fade-out':return p.stage+1<prefix?{...p,stage:p.stage+1,phase:'attach'}:{...p,phase:'final-hold'}
  case 'final-hold':return {...p,phase:'reset-out'}
  case 'reset-out':return {...initialPlayback(prefix),phase:'reset-load'}
  case 'reset-load':return {...p,phase:'reset-in'}
  case 'reset-in':return {...p,phase:'attach'}
  default:return p
 }
}
