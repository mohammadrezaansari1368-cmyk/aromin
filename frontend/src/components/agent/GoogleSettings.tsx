import { useEffect, useState } from 'react'
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_GHOST, BTN_PRIMARY, CARD, INPUT } from '@/components/ui/tokens'

export default function GoogleSettings({ session }: { session: Session }) {
 const [key, setKey] = useState(''), [enabled, setEnabled] = useState(false), [configured, setConfigured] = useState(false)
 const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false)
 useEffect(() => {
  if (!isAdmin(session.role)) return
  let active = true
  fetch(`/api/ai/google/settings?tenant=${encodeURIComponent(currentTenant())}`, { headers: authHeaders(session) }).then(async r => {
   const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'خواندن تنظیمات ناموفق بود')
   if (active) { setEnabled(d.enabled); setConfigured(d.configured); setLoaded(true) }
  }).catch(e => { if (active) setMessage(e.message) })
  return () => { active = false }
 }, [session])
 if (!isAdmin(session.role)) return null
 const send = async (action: 'settings' | 'test') => {
  setBusy(true); setMessage('')
  try {
   const r = await fetch(`/api/ai/google/${action}`, { method: 'POST', headers: { ...authHeaders(session), 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant: currentTenant(), key, enabled }) })
   const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || 'درخواست ناموفق بود')
   if (action === 'settings') { setConfigured(d.configured); setKey('') }
   setMessage(action === 'test' ? 'اتصال Google موفق بود.' : 'تنظیمات دستیار ذخیره شد.')
  } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
 }
 return <section dir="rtl" className={`${CARD} mb-4 space-y-3 p-4`} aria-label="تنظیمات دستیار Google">
  <h3 className="font-bold">دستیار هوشمند — Google API</h3>
  <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={!loaded || busy} onChange={e => setEnabled(e.target.checked)} />فعال‌سازی Google برای دستیار داشبورد</label>
  <label className="block text-sm">کلید API<input type="password" dir="ltr" autoComplete="new-password" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} className={`${INPUT} mt-1`} placeholder={configured ? 'کلید ذخیره شده؛ برای حفظ آن خالی بگذارید' : 'Google API Key'} /></label>
  <p className="text-xs text-muted-foreground">کلید فقط روی سرور ذخیره می‌شود. با غیرفعال‌کردن، دستیار از اتصال قبلی استفاده می‌کند.</p>
  <div className="flex gap-2"><button className={BTN_PRIMARY} disabled={busy || !loaded} onClick={() => send('settings')}>ذخیره</button><button className={BTN_GHOST} disabled={busy || !loaded || (!key && !configured)} onClick={() => send('test')}>آزمایش اتصال</button></div>
  <p role="status" className="text-sm">{message}</p>
 </section>
}
