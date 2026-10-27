import SupportSettings from './SupportSettings'
import { useEffect, useRef, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, INPUT } from '@/components/ui/tokens'

type RequestRow = { reference: string; status: string; createdAt: string; resultNote: string; attempts: number }
const STATUS: Record<string, string> = { queued: 'در صف', delivered: 'تحویل‌شده', executing: 'در حال اجرا', done: 'انجام‌شده', failed: 'ناموفق' }

export default function SupportLinkCard({ session }: { session: Session }) {
 const tenant = currentTenant()
 const [enabled, setEnabled] = useState(false)
 const [link, setLink] = useState('')
 const [rows, setRows] = useState<RequestRow[]>([])
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const generation = useRef(0)
 const base = '/api/agent/support?tenant=' + encodeURIComponent(tenant)
 const call = async (action?: string) => {
  const version = generation.current
  setBusy(true); setError(''); setNotice('')
  try {
   const r = await fetch(action ? base.replace('?', '/link?') : base, { method: action ? 'POST' : 'GET', headers: { ...authHeaders(session), 'Content-Type': 'application/json' }, cache: 'no-store', ...(action ? { body: JSON.stringify({ action }) } : {}) })
   const j = await r.json()
   if (version !== generation.current) return
   if (!r.ok || !j.ok) throw new Error(j.error || 'خطا در دریافت اطلاعات پشتیبانی')
   setEnabled(!!j.enabled)
   if (j.requests) setRows(j.requests)
   if (action) setLink(j.token ? location.origin + '/support#' + j.token : '')
  } catch (e) { if (version === generation.current) setError((e as Error).message) }
  finally { if (version === generation.current) setBusy(false) }
 }
 useEffect(() => {
  generation.current++; setLink(''); setRows([]); setEnabled(false); void call()
  return () => { generation.current++ }
 }, [tenant, session]) // tenant switch clears capabilities and ignores stale responses
 const copy = async () => {
  try { await navigator.clipboard.writeText(link); setNotice('لینک کپی شد.') }
  catch { setError('کپی خودکار ممکن نیست؛ لینک را انتخاب و کپی کنید.') }
 }
 return <section dir="rtl" aria-label="لینک پشتیبانی مشتریان" className="mt-3 rounded-xl border border-border bg-background p-4">
  <h4 className="font-bold">لینک اختصاصی پشتیبانی مشتریان</h4>
  <p className="my-2 text-sm text-muted-foreground">گفت‌وگوی مرحله‌ای و ثبت درخواست برای همین کسب‌وکار. اجرای درخواست پس از رضایت مشتری به Soroush-Support سپرده می‌شود.</p>
  <p className="text-sm">وضعیت لینک: {enabled ? 'فعال' : 'غیرفعال'}</p>
  <div className="my-3 flex flex-wrap gap-2">
   {!enabled && <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => call('generate')}>ساخت لینک</button>}
   {enabled && <><button type="button" className={BTN_GHOST} disabled={busy} onClick={() => call('rotate')}>تعویض لینک</button><button type="button" className={BTN_DANGER} disabled={busy} onClick={() => call('revoke')}>ابطال لینک</button></>}
   <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => call()}>تازه‌سازی وضعیت</button>
  </div>
  <p className="text-xs text-muted-foreground">تعویض یا ابطال، لینک قبلی و مصاحبه‌های ناتمام آن را فوراً غیرفعال می‌کند. لینک تازه فقط در همین نوبت نمایش داده می‌شود؛ آن را کپی کنید.</p>
  {link && <div className="my-3 flex gap-2"><input aria-label="لینک مشتری" dir="ltr" readOnly value={link} className={`${INPUT} min-w-0 flex-1`} onFocus={e => e.target.select()} /><button type="button" className={BTN_GHOST} onClick={copy}>کپی لینک</button></div>}
  <div className="mt-4 overflow-x-auto"><table className="w-full text-right text-xs"><caption className="mb-2 text-right font-bold">درخواست‌های اخیر (فقط مشاهده)</caption><thead><tr>{['شماره پیگیری','وضعیت','زمان ثبت','نتیجه'].map(x => <th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.reference} className="border-t border-border"><td dir="ltr" className="p-2">{r.reference}</td><td className="p-2 whitespace-nowrap">{STATUS[r.status] || r.status}</td><td className="p-2 whitespace-nowrap">{r.createdAt}</td><td className="max-w-64 break-words p-2">{r.resultNote || '—'}</td></tr>)}</tbody></table></div>
  {!rows.length && !busy && !error && <p className="mt-2 text-xs">هنوز درخواستی ثبت نشده است.</p>}
  <SupportSettings key={tenant} session={session} tenant={tenant} />
  {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
  {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
 </section>
}
