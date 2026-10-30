import { useEffect, useState } from 'react'
import { fetchFull, saveState } from '@/lib/forecastStore'
import { clearPerfCache } from '../data/hooks'

export default function SalesTargetSettings({ role }: { role: string }) {
 const [values, setValues] = useState<Record<string, string>>({})
 const [holidays, setHolidays] = useState('')
 const [message, setMessage] = useState('')
 const [ready, setReady] = useState(false)
 useEffect(() => {
  if (role !== 'manager') return
  let active = true
  fetchFull().then(full => {
   if (!active) return
   const p = full?.perf || {}, v: Record<string,string> = { dailyCallTarget: String(p.dailyCallTarget ?? 40) }
   for (const level of ['senior','middle','junior']) v[level] = String(p.levelCallTarget?.[level] ?? '')
   for (const part of ['activity','count','amount']) v[part] = String(p.efficiencyWeights?.[part] ?? 1/3)
   setHolidays((p.holidays ?? ['01/01','01/02','01/03','01/04','01/12','01/13','03/14','03/15','11/22','12/29'].map(day => `${full.fy}/${day}`)).join('\n'))
   setValues(v); setReady(true)
  }).catch(() => { if (active) setMessage('خواندن تنظیمات ناموفق بود') })
  return () => { active = false }
 }, [role])
 if (role !== 'manager') return null
 const fields = [['dailyCallTarget','هدف روزانه تماس تیم'],['senior','هدف روزانه سنیور'],['middle','هدف روزانه میدل'],['junior','هدف روزانه جونیور'],['activity','وزن فعالیت'],['count','وزن تعداد قرارداد'],['amount','وزن مبلغ قرارداد']]
 const save = async () => {
  const weights = Object.fromEntries(['activity','count','amount'].map(k => [k,Number(values[k])]))
  if (Object.values(values).some(v => v !== '' && (!Number.isFinite(Number(v)) || Number(v)<0)) || !Object.values(weights).some(v => v>0)) { setMessage('مقادیر نامنفی و دست‌کم یک وزن مثبت لازم است'); return }
  const dates = holidays.split(/\r?\n/).map(d => d.trim()).filter(Boolean)
  if (dates.some(d => !/^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(d) || (Number(d.slice(5,7)) > 6 && Number(d.slice(8)) > 30))) { setMessage('تاریخ‌ها را به صورت 1405/01/01، هر تاریخ در یک خط وارد کنید'); return }
  setReady(false)
  try {
   await saveState(full => {
    full.perf = { ...full.perf, dailyCallTarget: Number(values.dailyCallTarget), levelCallTarget: Object.fromEntries(['senior','middle','junior'].filter(k => values[k] !== '').map(k => [k,Number(values[k])])), efficiencyWeights: weights, holidays: [...new Set(dates)] }
   })
   clearPerfCache(); setMessage('تنظیمات ذخیره شد')
  } catch { setMessage('ذخیره ناموفق بود') }
  finally { setReady(true) }
 }
 return <section className="pv-card" aria-label="اهداف عملکرد فروش"><h3>اهداف عملکرد فروش</h3>
  <p>هدف تماس روزانه است؛ هدف مبلغ قرارداد از تب پیش‌بینی خوانده می‌شود. سطح خالی از هدف تیم استفاده می‌کند.</p>
  {fields.map(([key,label]) => <label key={key} style={{display:'block'}}>{label}<input aria-label={label} type="number" min="0" step="any" disabled={!ready} value={values[key] ?? ''} onChange={e => setValues(v => ({...v,[key]:e.target.value}))} /></label>)}
  <label style={{display:'block'}}>تعطیلات رسمی<textarea aria-label="تعطیلات رسمی" disabled={!ready} value={holidays} onChange={e => setHolidays(e.target.value)} /></label>
  <p>هر تاریخ شمسی به صورت 1405/01/01 در یک خط؛ تعطیلات قمری را مدیر اضافه کند. پیش‌فرض تعطیلات ثابت شمسی سال مالی است؛ برای دوره‌های سال‌های دیگر، تاریخ‌های همان سال را اضافه کنید.</p>
  <button disabled={!ready} onClick={save}>ذخیره اهداف عملکرد</button><p role="status">{message}</p>
 </section>
}
