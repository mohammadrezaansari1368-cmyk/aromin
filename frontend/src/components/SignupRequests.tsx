'use client'

/**
 * درخواست‌های عضویت (ثبت‌نام با Gmail) — فقط برای مدیر.
 * تأیید = ساختِ کاربر در همان دادهٔ اپ (خواندن ← افزودنِ users/email ← نوشتن، با بک‌آپِ اجباری) + بستنِ درخواست روی سرور.
 * پیش از نوشتن، موتورِ تب‌های قدیمی ذخیره می‌شود و بعدش دوباره بارگذاری، تا چیزی بازنویسی نشود.
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { currentTenant } from '@/lib/data'
import { saveState, fetchFull } from '@/lib/forecastStore'
import { ROLES, type Role } from '@/lib/auth'

interface Req { id: number; email: string; name?: string; picture?: string; created?: string }
interface Person { name: string; role?: string; inactive?: boolean }

const fa = (n: number) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)

export default function SignupRequests({ beforeWrite, afterWrite }: { beforeWrite: () => Promise<void>; afterWrite: () => void }) {
	const [reqs, setReqs] = useState<Req[]>([])
	const [open, setOpen] = useState(false)
	const [people, setPeople] = useState<Person[]>([])
	const [users, setUsers] = useState<string[]>([])
	const [busy, setBusy] = useState<number | null>(null)
	const [err, setErr] = useState('')

	const load = useCallback(async () => {
		try {
			const d = await (await fetch(`/api/auth/signup-requests?tenant=${encodeURIComponent(currentTenant())}`, { cache: 'no-store' })).json()
			setReqs(d && d.ok ? d.requests || [] : [])
		} catch { setReqs([]) }
	}, [])
	useEffect(() => { load() }, [load])
	useEffect(() => {
		if (!open) return
		fetchFull().then((f) => {
			setPeople(((f?.people || []) as Person[]).filter((p) => !p.inactive))
			setUsers(Object.keys(f?.users || {}))
		}).catch(() => {})
	}, [open])

	const decide = async (r: Req, status: 'approved' | 'rejected', pick?: { user: string; role: Role; person: string }) => {
		setBusy(r.id)
		setErr('')
		try {
			if (status === 'approved' && pick) {
				await beforeWrite()
				await saveState((full) => {
					full.users = full.users && typeof full.users === 'object' ? full.users : {}
					if (full.users[pick.user]) throw new Error('taken')
					full.users[pick.user] = { pass: token(), role: pick.role, person: pick.person, email: r.email.toLowerCase() }
					if (pick.person && Array.isArray(full.people)) {
						const p = full.people.find((x: Person) => x.name === pick.person)
						if (p) p.email = r.email.toLowerCase()
					}
				}, { forceBackup: true, tag: 'approve-signup' })
			}
			await fetch(`/api/auth/signup-requests/${r.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
			if (status === 'approved') afterWrite()
			setReqs((x) => x.filter((y) => y.id !== r.id))
		} catch (e) {
			setErr((e as Error).message === 'taken' ? 'این نامِ کاربری قبلاً گرفته شده؛ نامِ دیگری بدهید.' : (e as Error).message === 'backup' ? 'بک‌آپ گرفته نشد؛ برای حفظِ داده چیزی تغییر نکرد.' : 'انجام نشد؛ دوباره امتحان کنید.')
		} finally {
			setBusy(null)
		}
	}

	return (
		<>
			<button onClick={() => setOpen(true)} className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12.5px] font-bold transition hover:bg-muted" aria-label="درخواست‌های عضویت">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-[17px]"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
				<span className="hidden sm:inline">درخواست‌های عضویت</span>
				{reqs.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{fa(reqs.length)}</span>}
			</button>
			{/* پورتال به body: هدرِ blurدار برای fixed قاب می‌سازد و مودال را حبس می‌کرد */}
			{createPortal(<AnimatePresence>
				{open && (
					<motion.div className="fixed inset-0 z-50 grid place-items-center bg-overlay/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
						<motion.div dir="rtl" role="dialog" aria-label="درخواست‌های عضویت" onClick={(e) => e.stopPropagation()}
							initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
							className="max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-[20px] bg-card p-5 shadow-2xl ring-1 ring-border">
							<div className="mb-3 flex items-center justify-between">
								<h2 className="text-[16px] font-extrabold">درخواست‌های عضویت با Gmail</h2>
								<button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-lg hover:bg-muted" aria-label="بستن">✕</button>
							</div>
							{err && <p className="mb-2 rounded-lg bg-error/10 p-2 text-[12.5px] font-semibold text-error">{err}</p>}
							{reqs.length === 0 ? (
								<p className="py-6 text-center text-[13px] text-muted-foreground">درخواستِ تازه‌ای نیست.</p>
							) : (
								<ul className="flex flex-col gap-3">
									{reqs.map((r) => <ReqRow key={r.id} r={r} people={people} users={users} busy={busy === r.id} onDecide={decide} />)}
								</ul>
							)}
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>, document.body)}
		</>
	)
}

function ReqRow({ r, people, users, busy, onDecide }: { r: Req; people: Person[]; users: string[]; busy: boolean; onDecide: (r: Req, s: 'approved' | 'rejected', pick?: { user: string; role: Role; person: string }) => void }) {
	const base = (r.email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24) || 'user'
	const [user, setUser] = useState(users.includes(base) ? `${base}2` : base)
	const [person, setPerson] = useState('')
	const [role, setRole] = useState<Role>('sales')
	const taken = users.includes(user.trim())
	return (
		<li className="rounded-lg p-3.5 ring-1 ring-border">
			<div className="flex items-center gap-3">
				{r.picture ? <img src={r.picture} alt="" className="size-9 rounded-full" referrerPolicy="no-referrer" /> : <span className="grid size-9 place-items-center rounded-full bg-muted font-bold text-primary-ink">{(r.name || r.email)[0]}</span>}
				<div className="min-w-0">
					<div className="truncate text-[13.5px] font-bold">{r.name || '—'}</div>
					<div className="truncate text-[12px] text-muted-foreground" dir="ltr">{r.email}</div>
				</div>
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-3">
				<label className="text-[11px] font-bold text-muted-foreground">کارشناسِ مرتبط
					<select value={person} onChange={(e) => { setPerson(e.target.value); const p = people.find((x) => x.name === e.target.value); if (p?.role) setRole(p.role as Role) }} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-[12.5px] text-foreground">
						<option value="">— بدون —</option>
						{people.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
					</select>
				</label>
				<label className="text-[11px] font-bold text-muted-foreground">نقش
					<select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-[12.5px] text-foreground">
						{ROLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
					</select>
				</label>
				<label className="text-[11px] font-bold text-muted-foreground">نامِ کاربری
					<input value={user} onChange={(e) => setUser(e.target.value)} dir="ltr" className={`mt-1 h-9 w-full rounded-lg border bg-background px-2 text-[12.5px] text-foreground ${taken ? 'border-error' : 'border-border'}`} />
				</label>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<button disabled={busy} onClick={() => onDecide(r, 'rejected')} className="h-9 rounded-lg px-4 text-[12.5px] font-bold text-error ring-1 ring-error/30 hover:bg-error/10 disabled:opacity-50">رد</button>
				<button disabled={busy || taken || !user.trim()} onClick={() => onDecide(r, 'approved', { user: user.trim(), role, person })}
					className="h-9 rounded-lg bg-gradient-to-l from-primary to-active px-4 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50">{busy ? '…' : 'تأیید و ساختِ حساب'}</button>
			</div>
		</li>
	)
}
