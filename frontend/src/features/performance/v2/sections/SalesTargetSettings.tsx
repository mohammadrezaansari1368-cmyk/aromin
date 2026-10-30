import { useEffect, useState } from 'react'
import { fetchFull, saveState } from '@/lib/forecastStore'
import { clearPerfCache } from '../data/hooks'

export default function SalesTargetSettings({ role }: { role: string }) {
 const [values, setValues] = useState<Record<string, string>>({})
 const [message, setMessage] = useState('')
 const [ready, setReady] = useState(false)
 useEffect(() => {
  if (role !== 'manager') return
  let active = true
  fetchFull().then(full => {
   if (!active) return
   const p = full?.perf || {}, v: Record<string,string> = { callTarget: String(p.callTarget ?? 40) }
   for (const level of ['senior','middle','junior']) v[level] = String(p.levelCallTarget?.[level] ?? '')
   for (const part of ['activity','count','amount']) v[part] = String(p.efficiencyWeights?.[part] ?? 1/3)
   setValues(v); setReady(true)
  }).catch(() => { if (active) setMessage('خواندن تنظیمات ناموفق بود') })
  return () => { active = false }
 }, [role])
 if (role !== 'manager') return null
 const fields = [['callTarget','هدف روزانه تماس تیم'],['senior','هدف روزانه سنیور'],['middle','هدف روزانه میدل'],['junior','هدف روزانه جونیور'],['activity','وزن فعالیت'],['count','وزن تعداد قرارداد'],['amount','وزن مبلغ قرارداد']]
 const save = async () => {
  const weights = Object.fromEntries(['activity','count','amount'].map(k => [k,Number(values[k])]))
  if (Object.values(values).some(v => v !== '' && (!Number.isFinite(Number(v)) || Number(v)<0)) || !Object.values(weights).some(v => v>0)) { setMessage('مقادیر نامنفی و دست‌کم یک وزن مثبت لازم است'); return }
  setReady(false)
  try {
   await saveState(full => {
    full.perf = { ...full.perf, callTarget: Number(values.callTarget), levelCallTarget: Object.fromEntries(['senior','middle','junior'].filter(k => values[k] !== '').map(k => [k,Number(values[k])])), efficiencyWeights: weights }
   })
   clearPerfCache(); setMessage('تنظیمات ذخیره شد')
  } catch { setMessage('ذخیره ناموفق بود') }
  finally { setReady(true) }
 }
 return <section className="pv-card" aria-label="اهداف عملکرد فروش"><h3>اهداف عملکرد فروش</h3>
  <p>هدف تماس روزانه است؛ هدف مبلغ قرارداد از تب پیش‌بینی خوانده می‌شود. سطح خالی از هدف تیم استفاده می‌کند.</p>
  {fields.map(([key,label]) => <label key={key} style={{display:'block'}}>{label}<input aria-label={label} type="number" min="0" step="any" disabled={!ready} value={values[key] ?? ''} onChange={e => setValues(v => ({...v,[key]:e.target.value}))} /></label>)}
  <button disabled={!ready} onClick={save}>ذخیره اهداف عملکرد</button><p role="status">{message}</p>
 </section>
}
