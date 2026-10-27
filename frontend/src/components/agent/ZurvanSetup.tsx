import { useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN, INPUT } from '@/components/ui/tokens'
const labels: Record<string,string> = {businessType:'نوع کسب‌وکار',headcount:'تعداد کارکنان',shiftHours:'ساعت شیفت',shiftTypes:'نوع شیفت',missions:'استفاده از مأموریت',missionNotifications:'اعلان مأموریت به همهٔ همکاران',leavePolicy:'سیاست مرخصی',workplace:'محل کار',geofence:'محدودهٔ مجاز حضور'}
type Change = { setting: string; current: unknown; proposed: unknown; why: string }
type Proposal = { id: string; status: string; changes: Change[] }
export default function ZurvanSetup({ session }: { session: Session }) {
 const [questions, setQuestions] = useState<[string,string][]>([])
 const [answers, setAnswers] = useState<Record<string,string>>({})
 const [proposals, setProposals] = useState<Proposal[]>([])
 const [ready, setReady] = useState(false)
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const base = '/api/agent/zurvan/setup?tenant=' + encodeURIComponent(currentTenant())
 const call = async (action?: string, body?: unknown) => {
  setBusy(true); setError('')
  try {
   const r = await fetch(action ? base.replace('?', '/' + action + '?') : base, { method: action ? 'POST' : 'GET', headers: { ...authHeaders(session), 'Content-Type': 'application/json' }, ...(action ? { body: JSON.stringify(body) } : {}) })
   const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || 'خطا')
   setProposals(Object.values(j.state.proposals)); if (j.interview) setQuestions(j.interview)
   if ('adapterReady' in j) setReady(j.adapterReady)
  } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
 }
 useEffect(() => { void call() }, [base, session]) // tenant-bound state reload
 return <details className="mt-3 rounded border p-3" dir="rtl"><summary>مصاحبه و پیشنهاد راه‌اندازی زروان</summary>
  <p>مقدار فعلیِ نامعلوم با «نامعلوم» نمایش داده می‌شود. {ready ? 'اعمال فقط پس از تأیید مستقل مالک در زروان ممکن است.' : 'اتصال اعمال تنظیمات هنوز فعال نیست.'}</p>
  {questions.map(([key,q]) => <label key={key} className="my-2 grid gap-1">{q}<input className={INPUT} value={answers[key] || ''} onChange={e => setAnswers({ ...answers, [key]: e.target.value })} /></label>)}
  <button className={BTN} disabled={busy || !Object.values(answers).some(Boolean)} onClick={() => call('propose', { changes: Object.entries(answers).filter(([,v]) => v.trim()).map(([setting,proposed]) => ({ setting, proposed: setting === 'missionNotifications' ? (/^(بله|yes|true)$/i.test(proposed.trim()) ? true : /^(خیر|نه|no|false)$/i.test(proposed.trim()) ? false : proposed) : proposed, why: 'پاسخ مصاحبه؛ نیازمند بازبینی مالک' })) })}>ساخت پیشنهاد برای بازبینی</button>
  {proposals.map(p => <article key={p.id} className="my-3 rounded border p-2"><p>وضعیت: {p.status}</p><div className="overflow-auto"><table><thead><tr>{['تنظیم','فعلی','پیشنهادی','دلیل'].map(x => <th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{p.changes.map(c => <tr key={c.setting}><td>{labels[c.setting] || c.setting}</td><td>{c.current == null ? 'نامعلوم' : JSON.stringify(c.current)}</td><td>{JSON.stringify(c.proposed)}</td><td>{c.why}</td></tr>)}</tbody></table></div>
   {p.status === 'proposed' && <button className={BTN} disabled={busy} onClick={() => call('confirm', { id: p.id, uiConfirm: true })}>تأیید صریح این پیشنهاد</button>}
   {p.status === 'confirmed' && <button className={BTN} disabled={busy || !ready} onClick={() => call('apply', { id: p.id })}>اعمال تنظیمات تأییدشده</button>}
   {['proposed','confirmed'].includes(p.status) && <button className={BTN} disabled={busy} onClick={() => call('reject', { id: p.id })}>رد پیشنهاد</button>}
  </article>)}
  {error && <p role="alert">{error}</p>}
 </details>
}
