/**
 * 3.9.67: مهارت‌های نصب‌شده از گیت‌هاب (SKILL.md به سبکِ Claude Code) برای یک ایجنت — فقط متنِ دستورالعمل؛ هیچ اسکریپتی اجرا نمی‌شود
 * و مهارت هرگز کارهای مجاز یا مجموعه‌های دانشِ ایجنت را بیشتر نمی‌کند. پیش‌نمایش چیزی ذخیره نمی‌کند؛ نصب با رمزِ فعلی؛ پیش‌فرض خاموش.
 * اگر گیت‌هاب از سرور در دسترس نبود، SKILL.md یا zip را از همین‌جا بارگذاری کنید. فقط مدیر.
 */
import { useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import type { InstalledSkill } from '@/lib/agents'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, INPUT } from '@/components/ui/tokens'

type Preview = { id: string; name: string; description: string; body: string; source: { url?: string; upload?: string; sha?: string }; ignored: string[]; notRun: string[]; size: number }
type Input = { url?: string; filename?: string; data?: string }

async function call<T>(session: Session, path: string, body: Record<string, unknown>): Promise<T> {
	const r = await fetch('/api/agent/skills/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: JSON.stringify({ tenant: currentTenant(), ...body }) })
	const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
	if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
	return j as T
}
const fileB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f) })

export default function SkillInstaller({ session, agent, installed, onToggle, onChanged }: {
	session: Session; agent: string; installed: InstalledSkill[]; onToggle: (id: string, on: boolean) => void; onChanged: () => void
}) {
	const [url, setUrl] = useState('')
	const [input, setInput] = useState<Input | null>(null)
	const [pv, setPv] = useState<Preview | null>(null)
	const [diff, setDiff] = useState('')
	const [replaceId, setReplaceId] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
	const act = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn() } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setBusy(false) } }
	const preview = (inp: Input, rid = '') => act(async () => {
		const r = await call<{ skill: Preview; diff?: string }>(session, 'preview', { ...inp, agent, replaceId: rid || undefined })
		setInput(inp); setPv(r.skill); setDiff(r.diff || ''); setReplaceId(rid)
	})
	const install = () => act(async () => {
		await call(session, 'install', { ...input, agents: [agent], password, replaceId: replaceId || undefined })
		setPassword(''); setPv(null); setInput(null); setDiff(''); setReplaceId('')
		setMsg({ ok: true, t: 'نصب شد (خاموش). برای استفاده روشنش کنید و «ذخیره» بزنید.' }); onChanged()
	})
	const remove = (id: string) => { if (window.confirm('این مهارت حذف شود؟')) act(async () => { await call(session, 'remove', { agent, id }); onChanged() }) }
	return (
		<fieldset className="mt-3 grid gap-2" data-testid="skills">
			<legend className="text-[12.5px] font-bold">مهارت‌های نصب‌شده (گیت‌هاب)</legend>
			{installed.length === 0 && <p className="text-[12px] text-muted-foreground">هنوز مهارتی نصب نشده.</p>}
			{installed.map((s) => (
				<div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-[12.5px]">
					<label className="flex items-center gap-1.5 font-bold"><input type="checkbox" checked={s.enabled} onChange={(e) => onToggle(s.id, e.target.checked)} className="size-4" />{s.name}</label>
					<span className="text-muted-foreground">{s.description}</span>
					<code dir="ltr" className="text-[11px] text-muted-foreground">{s.source.sha ? s.source.sha.slice(0, 7) : s.source.upload}</code>
					{s.source.url && <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => preview({ url: s.source.url!.replace(/\/tree\/[0-9a-f]{40}/, '/tree/HEAD') }, s.id)}>به‌روزرسانی از منبع</button>}
					<button type="button" className={BTN_DANGER} disabled={busy} onClick={() => remove(s.id)}>حذف</button>
				</div>
			))}
			<div className="grid gap-1.5 rounded-md border border-dashed border-border p-2">
				<b className="text-[12.5px]">نصب از گیت‌هاب</b>
				<p className="text-[11.5px] text-warning">مهارت رفتارِ ایجنت را تغییر می‌دهد؛ فقط از منبعِ مطمئن نصب کنید. اسکریپت‌ها هرگز اجرا نمی‌شوند.</p>
				<div className="flex flex-wrap gap-2">
					<input dir="ltr" className={`${INPUT} min-w-0 flex-1 py-2`} placeholder="https://github.com/owner/repo/tree/main/skills/my-skill" value={url} onChange={(e) => setUrl(e.target.value)} />
					<button type="button" className={BTN_GHOST} disabled={busy || !url.trim()} onClick={() => preview({ url: url.trim() })}>پیش‌نمایش</button>
				</div>
				<label className="text-[11.5px]">یا اگر گیت‌هاب از سرور در دسترس نیست: SKILL.md یا zip
					<input type="file" accept=".md,.zip" disabled={busy} className="mr-2 text-[11.5px]" onChange={async (e) => { const f = e.target.files?.[0]; if (f) preview({ filename: f.name, data: await fileB64(f) }) }} /></label>
			</div>
			{pv && (
				<div className="grid gap-1.5 rounded-md border border-primary/40 p-2 text-[12px]" data-testid="skill-preview">
					<b className="text-[13px]">{pv.name}</b>{pv.description && <span>{pv.description}</span>}
					<span dir="ltr" className="break-all text-muted-foreground">{pv.source.url || pv.source.upload} {pv.source.sha && '@ ' + pv.source.sha.slice(0, 12)} · {pv.size} B</span>
					{pv.notRun.length > 0 && <span className="text-warning">اجرا نمی‌شود: <bdi dir="ltr">{pv.notRun.join(', ')}</bdi></span>}
					{diff ? <pre dir="ltr" className="max-h-60 overflow-auto rounded bg-muted/50 p-2 text-[11px]" data-testid="skill-diff">{diff}</pre>
						: <pre dir="auto" className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11.5px]">{pv.body}</pre>}
					<div className="flex flex-wrap gap-2">
						<input type="password" autoComplete="current-password" aria-label="رمزِ فعلیِ حساب" placeholder="رمزِ فعلیِ حساب" className={`${INPUT} w-48 py-2`} value={password} onChange={(e) => setPassword(e.target.value)} />
						<button type="button" className={BTN_PRIMARY} disabled={busy || !password} onClick={install}>{replaceId ? 'جایگزینی' : 'نصب'}</button>
						<button type="button" className={BTN_GHOST} disabled={busy} onClick={() => { setPv(null); setDiff('') }}>انصراف</button>
					</div>
				</div>
			)}
			{msg && <span role="status" className={`text-[12px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.t}</span>}
		</fieldset>
	)
}
