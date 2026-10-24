import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '@/components/AppShell'
import { LoginPage } from '@/components/LoginPage'
import { changePassword, clearSession, resumeSession, type Session } from '@/lib/auth'

// ورود → پوستهٔ چندتبی. پس از بارگذاریِ دوباره، توکنِ ذخیره‌شده یک‌بار با سرور تمدید می‌شود (resume)؛ رد → صفحهٔ ورود.
export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [resuming, setResuming] = useState(true)
  useEffect(() => { let live = true; resumeSession().then((s) => { if (live) { if (s) setSession(s); setResuming(false) } }); return () => { live = false } }, [])
  if (resuming) return <main dir="rtl" className="grid min-h-screen place-items-center text-muted-foreground" aria-busy="true">در حالِ بارگذاری…</main>
  if (!session) return <LoginPage onLogin={setSession} />
  if (session.must_change_password) return <ChangePassword session={session} onChanged={setSession} />
  return <AppShell session={session} onLogout={() => { clearSession(); setSession(null) }} />
}

function ChangePassword({ session, onChanged }: { session: Session; onChanged: (s: Session) => void }) {
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) { setError('تکرار رمز یکسان نیست.'); return }
    setBusy(true)
    const result = await changePassword(session, next)
    setBusy(false)
    if (result.ok) onChanged(result.session)
    else setError(result.error)
  }
  return <main dir="rtl" className="p-6"><form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
    <h1>تغییر رمز عبور</h1><p>برای ادامه، رمز پیش‌فرض را تغییر دهید. رمز تازه باید حداقل ۸ نویسه باشد.</p>
    <label className="block">رمز تازه<input className="block border rounded p-2" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={e => setNext(e.target.value)} /></label>
    <label className="block">تکرار رمز<input className="block border rounded p-2" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button className="border rounded p-2" disabled={busy}>تغییر رمز و ادامه</button>
  </form></main>
}
