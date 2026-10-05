import { useState } from 'react'
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { flushLedger } from '@/lib/ledgerStore'
import { MONTHS, num, sep } from '@/engines/commission'
import { BTN_PRIMARY, INPUT } from '@/components/ui/tokens'
interface Person { id: string | number; name: string; comp?: string; approvedBonuses?: { amount: number; fy: string; month: number; by: string }[] }
export default function CompensationSettings({ person, session, refresh }: { person: Person; session: Session; refresh: () => Promise<void> }) {
 const [comp, setComp] = useState(person.comp || 'hybrid'), [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [month, setMonth] = useState(0)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [id, setId] = useState(() => crypto.randomUUID())
 if (!isAdmin(session.role)) return null
 const save = async () => {
  setBusy(true); setError('')
  try {
   await flushLedger()
   const r = await fetch('/api/c1/compensation', { method: 'POST', headers: { ...authHeaders(session), 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant: currentTenant(), pid: person.id, comp, ...(amount.trim() ? { bonus: { id, amount: String(num(amount)), reason, fy: '1405', month } } : {}) }) })
   const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'ذخیره ناموفق بود')
   setAmount(''); setReason(''); setId(crypto.randomUUID()); await refresh(); setError('ذخیره شد')
  } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
 }
 return <div className="space-y-2 text-sm">
  <p>{person.name} · پاداش تصویب‌شدهٔ ۱۴۰۵: {sep((person.approvedBonuses || []).filter(b => b.fy === '1405').reduce((sum, b) => sum + b.amount, 0))} تومان</p>
  <label className="block">مدل حقوق<select className={INPUT} value={comp} onChange={e => setComp(e.target.value)}><option value="commission">فقط پورسانت</option><option value="hybrid">ترکیبی</option><option value="fixed">حقوق ثابت</option></select></label>
  <p className="text-xs text-muted-foreground">حقوق ثابت پورسانت ندارد؛ پاداش تنها با تصویب مدیر پرداخت می‌شود.</p>
  <label className="block">پاداش جدید (تومان، اختیاری)<input className={INPUT} dir="ltr" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></label>
  <label className="block">ماه پاداش<select className={INPUT} value={month} onChange={e => setMonth(+e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
  <label className="block">دلیل تصویب<input className={INPUT} value={reason} onChange={e => setReason(e.target.value)} /></label>
  <button className={BTN_PRIMARY} disabled={busy || (!!amount && (num(amount) <= 0 || reason.trim().length < 3))} onClick={save}>ذخیره و تصویب مدیر</button>
  <p role="status">{error}</p>
 </div>
}
