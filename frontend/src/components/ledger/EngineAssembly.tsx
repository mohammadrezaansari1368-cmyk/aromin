import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { fa, type Deal } from '@/engines/commission'
import { ENGINE_STAGES, PLAYBACK_DELAYS, engineState, initialPlayback, nextPlayback } from './engine-sequence'

const frameUrl=(n:number)=>`${import.meta.env.BASE_URL}assets/engine-assembly/frame-${String(n).padStart(3,'0')}.webp`
type Row={key:string;d:Deal;p:{name?:string}}
export default function EngineAssembly({rows}:{rows:Row[]}) {
 const [selected,setSelected]=useState('')
 const row=rows.find(r=>r.key===selected)||rows[0]
 const state=engineState(row?.d)
 return <section dir="rtl" aria-label="مونتاژ موتور و هفت مرحلهٔ فروش" className="space-y-3">
  <label className="flex flex-wrap items-center gap-2 text-xs">معاملهٔ C4
   <select aria-label="معاملهٔ C4" className="min-w-0 flex-1 rounded-lg border border-border bg-background p-2" value={row?.key||''} onChange={e=>setSelected(e.target.value)} disabled={!rows.length}>
    {!rows.length&&<option value="">معامله‌ای موجود نیست</option>}
    {rows.map(r=><option key={r.key} value={r.key}>{String(r.d.no||'بدون شماره')} · {String(r.d.name||'')} · {r.p.name||''}</option>)}
   </select>
  </label>
  <AssemblyPlayback key={`${row?.key||'empty'}:${state.signature}`} state={state}/>
 </section>
}
function AssemblyPlayback({state}:{state:ReturnType<typeof engineState>}) {
 const reduced=useReducedMotion()
 const [playback,setPlayback]=useState(()=>initialPlayback(state.prefix,!!reduced))
 // Resolve reduced motion in render too, so no stale animated frame/label can leak.
 const visual=reduced?initialPlayback(state.prefix,true):playback
 const {frame,stage,activated,phase}=visual
 const [loaded,setLoaded]=useState(0),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0)
 const [paused,setPaused]=useState(false),[hidden,setHidden]=useState(document.hidden)
 useEffect(()=>{setPlayback(initialPlayback(state.prefix,!!reduced))},[reduced,state.prefix])
 useEffect(()=>{
  const changed=()=>setHidden(document.hidden)
  document.addEventListener('visibilitychange',changed)
  return()=>document.removeEventListener('visibilitychange',changed)
 },[])
 useEffect(()=>{
  if(reduced||paused||hidden||failed||loaded!==frame||phase==='stopped')return
  const timer=window.setTimeout(()=>{if(!document.hidden)setPlayback(p=>nextPlayback(p,state.prefix))},PLAYBACK_DELAYS[phase])
  return()=>window.clearTimeout(timer)
 },[reduced,state.prefix,paused,hidden,failed,loaded,frame,phase,stage])
 const replay=()=>{setPlayback(initialPlayback(state.prefix));setPaused(false);setFailed(false);setLoaded(0);setRetry(n=>n+1)}
 const labelVisible=!reduced&&(phase==='fade-in'||phase==='hold')
 const fadingReset=phase==='reset-out'||phase==='reset-load'
 return <div data-engine-frame={frame} data-engine-prefix={state.prefix} data-engine-phase={phase} className="space-y-3">
  <div data-engine-scene className="relative isolate overflow-hidden rounded-xl border border-border bg-background" style={{containerType:'inline-size'}}>
   <img key={retry} src={frameUrl(frame)} width={720} height={401} className="block h-auto w-full transition-opacity duration-300 motion-reduce:transition-none" style={{opacity:fadingReset?0:1}} alt={`مونتاژ موتور؛ ${fa(state.prefix)} مرحلهٔ پیوسته از ۷ مرحله تکمیل شده`} onLoad={()=>setLoaded(frame)} onError={()=>setFailed(true)}/>
   <div aria-hidden="true" className="pointer-events-none absolute inset-0" dir="ltr">
    {ENGINE_STAGES.map((s,i)=>{
     const active=i<activated,glow=i===stage&&phase==='glow',showLabel=i===stage&&labelVisible
     return <div key={s.key} data-engine-anchor={s.number} className="absolute" style={{left:`${s.x}%`,top:`${s.y}%`}}>
      <span data-engine-number={s.number} data-activated={active} className={`relative z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background px-1 font-bold tabular-nums transition-colors duration-300 motion-reduce:transition-none ${active?'border-primary text-primary':'border-border text-muted-foreground'}`} style={{width:'clamp(1.5rem, 4.5cqw, 2rem)',height:'clamp(1.5rem, 4.5cqw, 2rem)',fontSize:'clamp(11px, 2.2cqw, 14px)',boxShadow:glow||active?'0 0 12px hsl(var(--primary) / .35)':undefined}}>{s.number}</span>
      <span data-engine-stage-label={s.number} dir="rtl" className="absolute z-10 rounded-md border border-border bg-background px-2 py-1 text-center font-semibold text-foreground shadow-sm transition-opacity duration-300 motion-reduce:transition-none" style={{opacity:showLabel?1:0,width:'max-content',maxWidth:'min(42cqw, 13rem)',fontSize:'clamp(10px, 2cqw, 13px)',...(s.y<50?{top:'1rem'}:{bottom:'2rem'}),transform:s.x<33?'translateX(-15%)':s.x>70?'translateX(-85%)':'translateX(-50%)'}}>{s.label}</span>
     </div>
    })}
   </div>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
   <span role="status" aria-live="polite">تکمیل مراحل: <b>{fa(state.percent)}٪</b> · {fa(state.completed.size)}/۷ · مونتاژ تا {fa(state.prefix)}/۷</span>
   {!reduced&&state.prefix>0&&<div className="flex gap-2">
    <button type="button" className="rounded-lg border border-border px-3 py-2" onClick={()=>setPaused(p=>!p)}>{paused?'ادامهٔ پخش':'توقف پخش'}</button>
    <button type="button" className="rounded-lg border border-border px-3 py-2" onClick={replay}>بازپخش مونتاژ</button>
   </div>}
  </div>
  {state.prefix<7&&<p className="text-xs text-muted-foreground">مونتاژ تا پیش از مرحلهٔ {fa(state.prefix+1)} «{ENGINE_STAGES[state.prefix].label}» متوقف می‌شود.</p>}
  {failed&&<div role="alert" className="text-xs text-error">تصویر بارگذاری نشد. <button type="button" className="underline" onClick={()=>{setFailed(false);setLoaded(0);setRetry(n=>n+1)}}>تلاش دوباره</button></div>}
 </div>
}
