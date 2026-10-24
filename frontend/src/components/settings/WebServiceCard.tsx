/**
 * تنظیمات ← «وب سرویس» (3.9.69): کلیدِ API برای وصل کردنِ ابزارها (پلِ هاریکان، CRM، اسکریپت‌ها) به داشبورد از راهِ MCP.
 * هر کلید نام و دسترسی‌های محدود دارد، فقط یک‌بار هنگامِ ساخت نمایش داده می‌شود (سرور فقط هشِ آن را نگه می‌دارد)،
 * ساختش رمزِ فعلیِ حساب می‌خواهد و هر وقت لازم شد باطل می‌شود. فقط مدیر.
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Scope = { key: string; label: string; tools: string[] }
type Key = { id: number; name: string; prefix: string; scopes: string[]; createdBy: string | null; createdAt: string | null; lastUsedAt: string | null; revoked: boolean; revokedAt: string | null }
type Info = { endpoint: string; scopes: Scope[]; keys: Key[]; legacyToken: boolean }

async function api<T>(session: Session, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
	const tenant = currentTenant()
	const r = await fetch('/api/settings/api-keys' + path + (method === 'GET' ? '?tenant=' + encodeURIComponent(tenant) : ''),
		{ method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: method === 'POST' ? JSON.stringify({ tenant, ...body }) : undefined, cache: 'no-store' })
	const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
	if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
	return j as T
}

export default function WebServiceCard({ session }: { session: Session }) {
	const [info, setInfo] = useState<Info | null>(null)
	const [err, setErr] = useState('')
	const [name, setName] = useState('')
	const [scopes, setScopes] = useState<string[]>(['attendance:write'])
	const [password, setPassword] = useState('')
	const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
	const load = useCallback(() => api<Info>(session, 'GET', '').then(setInfo, (e) => setErr((e as Error).message)), [session])
	useEffect(() => { load() }, [load])
	if (!info) return err ? <p className="text-[12.5px] text-error">{err}</p> : null
	const url = (typeof location !== 'undefined' ? location.origin : '') + info.endpoint
	const act = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn() } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setBusy(false) } }
	const create = () => act(async () => {
		const r = await api<{ key: string }>(session, 'POST', '', { name: name.trim(), scopes, password })
		setFresh({ key: r.key, name: name.trim() }); setName(''); setPassword(''); load()
	})
	const revoke = (k: Key) => { if (window.confirm(`کلیدِ «${k.name}» باطل شود؟ ابزاری که با آن وصل است دیگر کار نمی‌کند.`)) act(async () => { await api(session, 'POST', '/revoke', { id: k.id }); setMsg({ ok: true, t: 'باطل شد.' }); load() }) }
	const copy = (t: string) => { navigator.clipboard?.writeText(t).catch(() => undefined); setMsg({ ok: true, t: 'کپی شد.' }) }
	const label = (s: string) => info.scopes.find((x) => x.key === s)?.label || s
	return (
		<section dir="rtl" aria-labelledby="ws-title" className={`mb-4 flex flex-col gap-3 ${CARD} ${CARD_PAD}`} data-testid="web-service">
			<header>
				<h3 id="ws-title" className={CARD_TITLE}>وب سرویس</h3>
				<p className={CARD_SUB}>برای وصل کردنِ ابزارها (پلِ هاریکان، CRM، اسکریپت) به داشبورد یک کلیدِ API بسازید. هر کلید فقط به کارهایی که انتخاب می‌کنید دسترسی دارد و فقط یک‌بار نمایش داده می‌شود.</p>
			</header>
			<div className="grid gap-1 rounded-md bg-muted/45 p-3 text-[12.5px] ring-1 ring-border/80">
				<div className="flex flex-wrap items-center gap-2"><b>نشانی:</b><code dir="ltr" className="break-all">{url}</code><button type="button" className={BTN_GHOST} onClick={() => copy(url)}>کپی</button></div>
				<p className="text-[12px] text-muted-foreground">پروتکل MCP (JSON-RPC 2.0، فقط POST) · سرآیند: <code dir="ltr">Authorization: Bearer &lt;کلید&gt;</code> · پلِ هاریکان می‌تواند خودِ خروجی را هم مستقیم بفرستد.</p>
				<ul className="mt-1 grid gap-0.5 text-[12px]">{info.scopes.map((s) => <li key={s.key}><b>{s.label}</b> <span className="text-muted-foreground" dir="ltr">({s.tools.join(', ')})</span></li>)}</ul>
			</div>

			{fresh && (
				<div role="alert" className="grid gap-2 rounded-md border border-warning/50 bg-warning/10 p-3" data-testid="ws-fresh">
					<b className="text-[13px]">کلیدِ «{fresh.name}» ساخته شد — همین الان کپی کنید؛ دیگر نمایش داده نمی‌شود.</b>
					<div className="flex flex-wrap items-center gap-2"><code dir="ltr" className="break-all rounded bg-card px-2 py-1 text-[12px]">{fresh.key}</code>
						<button type="button" className={BTN_PRIMARY} onClick={() => copy(fresh.key)}>کپی کلید</button>
						<button type="button" className={BTN_GHOST} onClick={() => setFresh(null)}>ذخیره کردم</button></div>
				</div>
			)}

			<fieldset className="grid gap-2 rounded-md border border-border p-3">
				<legend className="px-1 text-[12.5px] font-bold">ساختِ کلیدِ تازه</legend>
				<input className={`${INPUT} py-2`} placeholder="نام (مثلاً: پلِ هاریکان)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="نامِ کلید" />
				<div className="flex flex-wrap gap-3 text-[12.5px]">{info.scopes.map((s) => (
					<label key={s.key} className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={scopes.includes(s.key)}
						onChange={(e) => setScopes((c) => (e.target.checked ? [...c, s.key] : c.filter((x) => x !== s.key)))} />{s.label}</label>
				))}</div>
				<div className="flex flex-wrap gap-2">
					<input type="password" autoComplete="current-password" className={`${INPUT} w-52 py-2`} placeholder="رمزِ فعلیِ حساب" aria-label="رمزِ فعلیِ حساب" value={password} onChange={(e) => setPassword(e.target.value)} />
					<button type="button" className={BTN_PRIMARY} disabled={busy || !name.trim() || !scopes.length || !password} onClick={create}>ساختِ کلید</button>
				</div>
			</fieldset>

			<div className="grid gap-1.5" data-testid="ws-keys">
				<b className="text-[12.5px]">کلیدها</b>
				{info.keys.length === 0 && <p className="text-[12px] text-muted-foreground">هنوز کلیدی ساخته نشده.{info.legacyToken ? ' (کلیدِ قدیمیِ MCP روی سرور همچنان کار می‌کند.)' : ''}</p>}
				{info.keys.map((k) => (
					<div key={k.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-[12.5px] ${k.revoked ? 'opacity-60' : ''}`}>
						<b>{k.name}</b><code dir="ltr" className="text-[11.5px] text-muted-foreground">{k.prefix}…</code>
						<span className="text-muted-foreground">{k.scopes.map(label).join('، ')}</span>
						<span className="text-[11.5px] text-muted-foreground">ساخته: {k.createdAt || '—'}{k.createdBy ? ' · ' + k.createdBy : ''} · آخرین استفاده: {k.lastUsedAt || 'هنوز نه'}</span>
						{k.revoked ? <span className="mr-auto text-[12px] font-bold text-error">باطل‌شده</span> : <button type="button" className={`${BTN_DANGER} mr-auto`} disabled={busy} onClick={() => revoke(k)}>باطل کردن</button>}
					</div>
				))}
			</div>
			{msg && <span role="status" className={`text-[12px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.t}</span>}
		</section>
	)
}
