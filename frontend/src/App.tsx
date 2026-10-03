import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { LoginPage } from '@/components/LoginPage'
import { type Session } from '@/lib/auth'

// ورود → پوستهٔ چندتبی. نشست در حافظهٔ صفحه است (آمادهٔ اتصال به بک‌اند).
export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  if (!session) return <LoginPage onLogin={setSession} />
  return <AppShell session={session} onLogout={() => setSession(null)} />
}
