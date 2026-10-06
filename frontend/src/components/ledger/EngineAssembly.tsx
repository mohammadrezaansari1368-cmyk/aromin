import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { DEFAULT_WEIGHTS, STAGES, fa, type Deal } from '@/engines/commission'
import { ENGINE_BASE_FRAME, ENGINE_RANGES, engineState } from './engine-sequence'

const frameUrl = (n: number) => `${import.meta.env.BASE_URL}assets/engine-assembly/frame-${String(n).padStart(3,'0')}.webp`
type Row = { key: string; d: Deal; p: {name?: string} }
type Phase = 'attach' | 'fade-in' | 'hold' | 'fade-out' | 'stopped'
export default function EngineAssembly({ rows }: {rows: Row[]}) {
 const [selected,setSelected] = useState('')
 const row = rows.find(r=>r.key===selected) || rows[0]
 const state = engineState(row?.d)
 return <section dir="rtl" aria-label="مونتاژ موتور و هفت مرحلهٔ فروش" className="space-y-3">
  <label className="flex flex-wrap items-center gap-2 text-xs">معاملهٔ C4
   <select aria-label="معاملهٔ C4" className="min-w-0 flex-1 rounded-lg border border-border bg-background p-2" value={row?.key || ''} onChange={e=>setSelected(e.target.value)} disabled={!rows.length}>
    {!rows.length && <option value="">معامله‌ای موجود نیست</option>}
    {rows.map(r=><option key={r.key} value={r.key}>{String(r.d.no || 'بدون شماره')} · {String(r.d.name || '')} · {r.p.name || ''}</option>)}
   </select>
  </label>
  <AssemblyPlayback key={`${row?.key || 'empty'}:${state.signature}`} state={state} />
 </section>
}
function AssemblyPlayback({state}: {state: ReturnType<typeof engineState>}) {
 const reduced = useReducedMotion()
 const [frame,setFrame] = useState(reduced ? state.endFrame : ENGINE_BASE_FRAME)
 const [stage,setStage] = useState(0)
 const [phase,setPhase] = useState<Phase>(reduced || !state.prefix ? 'stopped' : 'attach')
 const [activated,setActivated] = useState(reduced ? state.prefix : 0)
 const [loaded,setLoaded] = useState(0), [failed,setFailed] = useState(false), [retry,setRetry] = useState(0)
 const [paused,setPaused] = useState(false), [hidden,setHidden] = useState(document.hidden)
 useEffect(()=>{ const changed=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed) },[])
 useEffect(()=>{
  if (reduced) {setFrame(state.endFrame);setActivated(state.prefix);setPhase('stopped');return}
  if (paused || hidden || failed || loaded!==frame || phase==='stopped') return
  let delay=1000/24
  if (phase==='fade-in' || phase==='fade-out') delay=300
  if (phase==='hold') delay=2000
  const timer=window.setTimeout(()=>{
   if (phase==='attach') {
    if(frame<ENGINE_RANGES[stage][1]) setFrame(n=>n+1)
    else {setActivated(stage+1);setPhase('fade-in')}
   } else if(phase==='fade-in') setPhase('hold')
   else if(phase==='hold') setPhase('fade-out')
   else if(stage+1<state.prefix) {setStage(n=>n+1);setPhase('attach')}
   else setPhase('stopped')
  },delay)
  return()=>window.clearTimeout(timer)
 },[reduced,state.endFrame,state.prefix,paused,hidden,failed,loaded,frame,phase,stage])
 const replay=()=>{setFrame(ENGINE_BASE_FRAME);setStage(0);setActivated(0);setPhase(state.prefix?'attach':'stopped');setPaused(false);setFailed(false);setLoaded(0);setRetry(n=>n+1)}
 return <div data-engine-frame={frame} data-engine-prefix={state.prefix} data-engine-phase={phase} className="space-y-3">
  <div className="relative overflow-hidden rounded-xl border border-border">
   <img key={retry} src={frameUrl(frame)} width={720} height={401} className="block h-auto w-full" alt={`مونتاژ موتور؛ ${fa(activated)} مرحله از ۷ مرحله نمایش داده شده`} onLoad={()=>setLoaded(frame)} onError={()=>setFailed(true)} />
  </div>
  <ol dir="ltr" className="grid grid-cols-7 gap-1" aria-label="وضعیت هفت مرحله">
   {STAGES.map((s,i)=><li key={s.k} title={`${s.t} · ${state.completed.has(s.k)?'تکمیل‌شده':'ناقص'}`} aria-label={`${String(i+1).padStart(2,'0')} ${s.t}: ${state.completed.has(s.k)?'تکمیل‌شده':'ناقص'}`} data-activated={i<activated} className={`rounded-lg border px-1 py-2 text-center transition-colors motion-reduce:transition-none ${i<activated?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground'}`}>
    <span className="block text-sm font-bold tabular-nums">{String(i+1).padStart(2,'0')}</span><span className="text-[10px]">{fa(DEFAULT_WEIGHTS[s.k])}٪</span>
   </li>)}
  </ol>
  <div className="flex h-8 items-center justify-center text-sm font-bold" aria-live="polite">
   <span data-engine-stage-label className="transition-opacity duration-300 motion-reduce:transition-none" style={{opacity:phase==='fade-in'||phase==='hold'?1:0}}>{STAGES[stage].t}</span>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
   <span>تکمیل مراحل: <b>{fa(state.percent)}٪</b> · {fa(state.completed.size)}/۷</span>
   <div className="flex gap-2">
    {phase!=='stopped' && <button type="button" className="rounded-lg border border-border px-3 py-2" onClick={()=>setPaused(p=>!p)}>{paused?'ادامهٔ پخش':'توقف پخش'}</button>}
    <button type="button" className="rounded-lg border border-border px-3 py-2 disabled:opacity-50" disabled={!!reduced || !state.prefix} onClick={replay}>بازپخش مونتاژ</button>
   </div>
  </div>
  {state.prefix<7 && <p className="text-xs text-muted-foreground">مونتاژ تا پیش از مرحلهٔ {fa(state.prefix+1)} «{STAGES[state.prefix].t}» متوقف می‌شود.</p>}
  {failed && <div role="alert" className="text-xs text-error">تصویر بارگذاری نشد. <button type="button" className="underline" onClick={()=>{setFailed(false);setLoaded(0);setRetry(n=>n+1)}}>تلاش دوباره</button></div>}
 </div>
}
