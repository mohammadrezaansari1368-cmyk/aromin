import { useEffect, useState } from 'react'
import { fetchFull, saveState } from '@/lib/forecastStore'
import type { Session } from '@/lib/auth'
import { parseJ } from '@/lib/jalali'
import { yearDays } from '@/components/performance/PerformanceWorkspace'
import { usePerf, clearPerfCache } from '../data/hooks'

export default function SalesTargetSettings({ session, year }: { session: Session; year: number }) {
 const [values, setValues] = useState<Record<string, string>>({})
 const role = session.role
 const days = yearDays(year)
 const calendar = usePerf<{official: Record<string,string>; holidays: Record<string,string>}>(session, 'holidays', {start: days[0].date, end: days.at(-1)!.date}, role === 'manager')
 const [adjust, setAdjust] = useState<Record<string,string | null>>({})
 const [extras, setExtras] = useState<string[]>([])
 const [extra, setExtra] = useState('')
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
   setAdjust(p.holidayAdjust ?? {}); setExtras(p.extraHolidays ?? [])
   setValues(v); setReady(true)
  }).catch(() => { if (active) setMessage('خواندن تنظیمات ناموفق بود') })
  return () => { active = false }
 }, [role])
 if (role !== 'manager') return null
 const fields = [['dailyCallTarget','هدف روزانه تماس تیم'],['senior','هدف روزانه سنیور'],['middle','هدف روزانه میدل'],['junior','هدف روزانه جونیور'],['activity','وزن فعالیت'],['count','وزن تعداد قرارداد'],['amount','وزن مبلغ قرارداد']]
 const save = async () => {
  const weights = Object.fromEntries(['activity','count','amount'].map(k => [k,Number(values[k])]))
  if (Object.values(values).some(v => v !== '' && (!Number.isFinite(Number(v)) || Number(v)<0)) || !Object.values(weights).some(v => v>0)) { setMessage('مقادیر نامنفی و دست‌کم یک وزن مثبت لازم است'); return }
  if (Object.values(adjust).some(d => d !== null && parseJ(d)?.j !== d) || extras.some(d => parseJ(d)?.j !== d)) { setMessage('تاریخ شمسی معتبر وارد کنید'); return }
  setReady(false)
  try {
   await saveState(full => {
    full.perf = { ...full.perf, dailyCallTarget: Number(values.dailyCallTarget), levelCallTarget: Object.fromEntries(['senior','middle','junior'].filter(k => values[k] !== '').map(k => [k,Number(values[k])])), efficiencyWeights: weights, holidayAdjust: adjust, extraHolidays: [...new Set(extras)] }
   })
   clearPerfCache(); setMessage('تنظیمات ذخیره شد')
  } catch { setMessage('ذخیره ناموفق بود') }
  finally { setReady(true) }
 }
 return <section className="pv-card" aria-label="اهداف عملکرد فروش"><h3>اهداف عملکرد فروش</h3>
  <p>هدف تماس روزانه است؛ هدف مبلغ قرارداد از تب پیش‌بینی خوانده می‌شود. سطح خالی از هدف تیم استفاده می‌کند.</p>
  {fields.map(([key,label]) => <label key={key} style={{display:'block'}}>{label}<input aria-label={label} type="number" min="0" step="any" disabled={!ready} value={values[key] ?? ''} onChange={e => setValues(v => ({...v,[key]:e.target.value}))} /></label>)}
  <p>تعطیلات رسمی خودکار محاسبه می‌شود؛ فقط اگر اعلامِ رسمی یک روز جابه‌جا شد اصلاح کنید.</p>
  <h4>تعطیلات رسمی {year}</h4>
  {calendar.error && <p role="alert">{calendar.error}</p>}
  {calendar.loading && <p>در حال محاسبه…</p>}
  <ul>{Object.entries(calendar.data?.official ?? {}).map(([date,name]) => <li key={date}>
   <span>{date} — {name}</span>
   <label> جابه‌جایی/لغو <input aria-label={`جابه‌جایی ${date}`} placeholder={date} disabled={!ready || adjust[date] === null} value={adjust[date] ?? ''} onChange={e => setAdjust(a => { const next = {...a}; if (e.target.value) next[date] = e.target.value; else delete next[date]; return next })} /></label>
   <label><input type="checkbox" checked={adjust[date] === null} disabled={!ready} onChange={e => setAdjust(a => { const next = {...a}; if (e.target.checked) next[date] = null; else delete next[date]; return next })} />لغو</label>
  </li>)}</ul>
  <h4>اصلاحات ثبت‌شده</h4>
  <ul>{Object.entries(adjust).map(([date,target]) => <li key={date}>{date} ← {target ?? 'لغو'} <button disabled={!ready} onClick={() => setAdjust(a => { const next = {...a}; delete next[date]; return next })}>بازنشانی</button></li>)}</ul>
  <label>تعطیلیِ موردی <input value={extra} placeholder="1405/01/01" disabled={!ready} onChange={e => setExtra(e.target.value)} /></label>
  <button disabled={!ready} onClick={() => { const d = parseJ(extra); if (!d) { setMessage('تاریخ شمسی معتبر وارد کنید'); return }; setExtras(v => [...new Set([...v,d.j])]); setExtra('') }}>افزودن</button>
  <ul>{extras.map(d => <li key={d}>{d} <button disabled={!ready} onClick={() => setExtras(v => v.filter(x => x !== d))}>حذف</button></li>)}</ul>
  <h4>تقویم مؤثر ذخیره‌شده</h4><ul>{Object.entries(calendar.data?.holidays ?? {}).map(([d,n]) => <li key={d}>{d} — {n}</li>)}</ul>
  <button disabled={!ready} onClick={save}>ذخیره اهداف عملکرد</button><p role="status">{message}</p>
 </section>
}
