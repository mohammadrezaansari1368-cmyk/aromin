import { useEffect, useState, type ReactNode } from 'react'

/** Shared Starlight arc geometry and layered glow. */
export function StarArc({ fraction, color }: { fraction: number; color: string }) {
 const dash = `${424.1 * Math.max(0, Math.min(1, fraction))} 565.5`
 return <>
  <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" opacity=".12" strokeWidth=".6" transform="rotate(135 100 100)" strokeDasharray="424.1 565.5" />
  {[3.2,1.8,.9].map((width,i) => <circle key={width} cx="100" cy="100" r="90" fill="none" stroke={color} strokeWidth={width} strokeOpacity={[.12,.22,1][i]} strokeLinecap="round" transform="rotate(135 100 100)" strokeDasharray={dash} />)}
 </>
}

export default function MiniStarGauge({ label, value, color, children }: { label: string; value: number | null; color: string; children?: ReactNode }) {
 const [phase,setPhase]=useState(1)
 useEffect(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  let frame=0; const start=performance.now(); setPhase(0)
  const tick=(now:number) => { const p=Math.min(1,(now-start)/700); setPhase(1-Math.pow(1-p,3)); if(p<1) frame=requestAnimationFrame(tick) }
  frame=requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
 },[value])
 return <div dir="rtl" className="pv-mini-star" role="group" style={{flex:'1 1 140px',textAlign:'center'}} aria-label={`${label}: ${value===null?'داده‌ای نیست':value.toLocaleString('fa-IR')+'٪'}`}>
  <svg viewBox="0 0 200 200" aria-hidden style={{width:'100%',maxWidth:180}}>
   <StarArc fraction={(value??0)/100*phase} color={color} />
   <text x="100" y="105" textAnchor="middle" fill="currentColor" fontSize="28">{value===null?'—':(value*phase).toLocaleString('fa-IR',{maximumFractionDigits:1})+'٪'}</text>
  </svg>
  <b>{label}</b><div>{children}</div>
 </div>
}
