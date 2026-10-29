import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { todayJ } from '@/lib/jalali'

type Job = { id: string; kind: string; status: string; attempts: number; max_attempts: number; created_at: number; error_code?: string; result?: unknown }
const STATUS: Record<string, string> = { queued: 'در صف', running: 'در حال اجرا', retry_wait: 'انتظار تلاش دوباره', succeeded: 'موفق', failed: 'ناموفق', cancelled: 'لغوشده' }
const ERRORS: Record<string, string> = { execution_timeout: 'زمان اجرا تمام شد', lease_expired: 'ارتباط پردازشگر قطع شد', worker_crashed: 'پردازشگر متوقف شد', worker_shutdown: 'پردازشگر در حال خاموش‌شدن بود', permission_revoked: 'دسترسی درخواست‌کننده تغییر کرده است', invalid_job: 'ورودی معتبر نیست', processing_failed: 'پردازش ناموفق بود' }

export default function JobsCard({ session }: { session: Session }) {
  const [rows, setRows] = useState<Job[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const today = todayJ(), [start, setStart] = useState(today.slice(0, 8) + '01'), [end, setEnd] = useState(today)
  const [kind, setKind] = useState('performance_report'), [fy, setFy] = useState(today.slice(0, 4))
  const tenant = currentTenant()
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const call = useCallback(async (path = '', body?: Record<string, unknown>) => {
    const response = await fetch(`/api/jobs${path}${body ? '' : `?tenant=${encodeURIComponent(tenant)}`}`, {
      method: body ? 'POST' : 'GET', headers: { ...authHeaders(session), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify({ ...body, tenant }) } : {}),
    })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.error || 'دریافت وضعیت صف ناموفق بود.')
    return data as { jobs?: Job[]; job?: Job }
  }, [session, tenant])
  const refresh = useCallback(async () => {
    try { const data = await call(); setRows(data.jobs || []); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'ارتباط برقرار نشد.') }
  }, [call])
  useEffect(() => {
    if (session.role !== 'manager') return
    let active = true
    const load = async () => {
      try { const data = await call(); if (active) { setRows(data.jobs || []); setError('') } }
      catch (e) { if (active) setError(e instanceof Error ? e.message : 'ارتباط برقرار نشد.') }
    }
    void load()
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [call, session.role])
  const enqueue = async () => {
    setBusy(true); setError('')
    const payload = kind === 'ledger_audit' ? { fy } : { start, end }
    const fingerprint = JSON.stringify({ tenant, kind, payload })
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
    try {
      await call('', { kind, payload, idempotencyKey: pending.current.key })
      pending.current = null
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'ثبت کار ناموفق بود؛ تلاش دوباره با همان شناسه انجام می‌شود.') }
    finally { setBusy(false) }
  }
  const action = async (job: Job, command: 'cancel' | 'retry' | 'download') => {
    setBusy(true); setError('')
    try {
      if (command === 'download') {
        const data = await call('/' + job.id)
        if (data.job?.status !== 'succeeded' || data.job.result == null) throw new Error('نتیجه هنوز آماده نیست.')
        const url = URL.createObjectURL(new Blob([JSON.stringify(data.job.result, null, 2)], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = `aromin-${job.kind}-${job.id}.json`; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else { await call(`/${job.id}/${command}`, {}); await refresh() }
    } catch (e) { setError(e instanceof Error ? e.message : 'عملیات ناموفق بود.') }
    finally { setBusy(false) }
  }
  if (session.role !== 'manager') return null
  return <section className="space-y-4 py-5" aria-label="صف پردازش">
    <p className="text-sm text-muted-foreground">گزارش‌ها در پس‌زمینه آماده می‌شوند. موفقیت اجرا به معنی کامل‌بودن داده‌ها نیست؛ محدودیت منابع داخل گزارش ثبت می‌شود.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">نوع گزارش<select className="block rounded border bg-background p-2" value={kind} onChange={e => setKind(e.target.value)}><option value="performance_report">عملکرد</option><option value="ledger_audit">سلامت دفتر فروش</option></select></label>
      {kind === 'ledger_audit' ? <label className="text-sm">سال مالی<input className="block w-28 rounded border bg-background p-2" value={fy} onChange={e => setFy(e.target.value)} /></label> : <>
        <label className="text-sm">از تاریخ<input dir="ltr" className="block w-32 rounded border bg-background p-2" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="text-sm">تا تاریخ<input dir="ltr" className="block w-32 rounded border bg-background p-2" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </>}
      <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => void enqueue()}>افزودن به صف</button>
      <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => void refresh()}>تازه‌سازی</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <ul className="divide-y" aria-label="کارها">{rows.map(job => <li key={job.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1"><b>{job.kind === 'ledger_audit' ? 'سلامت دفتر فروش' : 'عملکرد'}</b><p className="text-muted-foreground">{new Date(job.created_at).toLocaleString('fa-IR')} · تلاش {job.attempts.toLocaleString('fa-IR')} از {job.max_attempts.toLocaleString('fa-IR')}</p><small dir="ltr">{job.id.slice(0, 12)}</small>{job.error_code && <p>{ERRORS[job.error_code] || 'پردازش نیاز به بررسی دارد'}</p>}</div>
      <span role="status">{STATUS[job.status] || job.status}</span>
      {['queued', 'running', 'retry_wait'].includes(job.status) && <button disabled={busy} className="rounded border px-2 py-1" onClick={() => void action(job, 'cancel')}>لغو</button>}
      {job.status === 'failed' && job.max_attempts <= 17 && <button disabled={busy} className="rounded border px-2 py-1" onClick={() => void action(job, 'retry')}>تلاش دوباره</button>}
      {job.status === 'succeeded' && <button disabled={busy} className="rounded border px-2 py-1" onClick={() => void action(job, 'download')}>دریافت گزارش</button>}
    </li>)}</ul>
    {!rows.length && !error && <p className="text-sm text-muted-foreground">کاری در صف نیست.</p>}
  </section>
}
