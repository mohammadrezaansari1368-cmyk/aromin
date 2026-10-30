import { useEffect, useState } from 'react'
import { fetchFull, saveState } from '@/lib/forecastStore'
import { parseJ, todayJ } from '@/lib/jalali'
import type { Session } from '@/lib/auth'
import { clearPerfCache } from '../data/hooks'
import { LEVEL_LABEL, UNIT_LABEL } from '../data/adapters'

type Entry={role:string;from:string}
type Person={id:string;name:string;role:string;level?:string;roleHistory?:Entry[]}
export default function RoleHistorySettings({session}:{session:Session}) {
 const [people,setPeople]=useState<Person[]>([]),[id,setId]=useState(''),[role,setRole]=useState('sales'),[from,setFrom]=useState(todayJ()),[message,setMessage]=useState('')
 const manager=['manager','salesmgr','accmgr'].includes(session.role)
 useEffect(()=>{if(manager) fetchFull().then(f=>setPeople(f?.people||[])).catch(()=>setMessage('خواندن اشخاص ناموفق بود'))},[manager])
 if(!manager) return null
 const person=people.find(p=>String(p.id)===id)
 const save=async (change:(p:Person)=>void) => {
  try {await saveState(full=>{const p=full.people.find((p:Person)=>String(p.id)===id);if(p)change(p)});const f=await fetchFull();setPeople(f.people);clearPerfCache();setMessage('ذخیره شد')}catch{setMessage('ذخیره ناموفق بود')}
 }
 return <section className="pv-card" dir="rtl"><h3>ویرایش شخص · تاریخچهٔ نقش</h3>
  <select aria-label="شخص برای ویرایش" value={id} onChange={e=>setId(e.target.value)}><option value="">انتخاب شخص</option>{people.map(p=><option key={p.id} value={String(p.id)}>{p.name} · {LEVEL_LABEL[p.level||'']||'—'}</option>)}</select>
  {person && <>
   <label>نقش فعلی<select value={person.role} onChange={e=>void save(p=>{p.role=e.target.value})}>{['sales','support','finance','online','salesmgr','accmgr','manager'].map(r=><option key={r} value={r}>{UNIT_LABEL[r]||r}</option>)}</select></label>
   <label>سطح دانش و تجربه<select value={person.level==='middle'?'mid':person.level||'junior'} onChange={e=>void save(p=>{p.level=e.target.value})}>{['junior','mid','senior'].map(l=><option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></label>
   <ul>{(person.roleHistory||[]).map(h=><li key={h.from}>{UNIT_LABEL[h.role]||h.role} از {h.from}</li>)}</ul>
   <select aria-label="نقش تاریخی" value={role} onChange={e=>setRole(e.target.value)}>{['sales','support','finance','online','salesmgr','accmgr','manager'].map(r=><option key={r} value={r}>{UNIT_LABEL[r]||r}</option>)}</select>
   <input aria-label="از تاریخ نقش" value={from} onChange={e=>setFrom(e.target.value)} />
   <button onClick={()=>{const date=parseJ(from)?.j;if(!date||date>todayJ()||(person.roleHistory||[]).some(h=>h.from===date)){setMessage('تاریخ معتبر، غیرتکراری و تا امروز لازم است');return}void save(p=>{p.roleHistory=[...(p.roleHistory?.length?p.roleHistory:[{role:p.role,from:'1300/01/01'}]),{role,from:date}].sort((a,b)=>a.from.localeCompare(b.from));p.role=p.roleHistory.at(-1)!.role})}}>افزودن نقش و تاریخ</button>
  </>}<p role="status">{message}</p>
 </section>
}
