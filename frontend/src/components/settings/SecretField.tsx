/**
 * فیلدِ توکنِ «یک‌بار ثبت، سپس قفل»: خالی → ورودیِ رمزگونه + ذخیره. ثبت‌شده → فقط •••• و ۴ رقمِ آخر، تاریخ و ثبت‌کننده.
 * جایگزینی/حذف/تولیدِ تازه فقط با رمزِ فعلیِ حساب و تأیید. مقدار هرگز از سرور برنمی‌گردد (به‌جز توکنِ تازه‌تولید، فقط همان یک‌بار).
 */
import { useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, INPUT } from '@/components/ui/tokens'

export type SecretMeta = { set: boolean; source: 'settings' | 'env' | null; last4: string | null; setAt: string | null; setBy: string | null; label: string }

export async function messengersApi<T = unknown>(session: Session, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
	const tenant = currentTenant()
	const url = '/api/settings/messengers' + path + (method === 'GET' ? '?tenant=' + encodeURIComponent(tenant) : '')
	const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: method === 'POST' ? JSON.stringify({ tenant, ...body }) : undefined, cache: 'no-store' })
	const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
	if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
	return j as T
}

const faDate = (iso: string | null) => { try { return iso ? new Date(iso).toLocaleDateString('fa-IR') : '' } catch { return '' } }
const inCls = `${INPUT} py-2`

export default function SecretField({ session, name, meta, keyConfigured, canGenerate, onChange }: {
	session: Session; name: string; meta: SecretMeta; keyConfigured: boolean; canGenerate?: boolean; onChange: () => void
}) {
	const [mode, setMode] = useState<'view' | 'replace' | 'clear' | 'generate'>('view')
	const [value, setValue] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [shown, setShown] = useState<string | null>(null)       // only right after «تولیدِ توکنِ تازه»
	const reset = () => { setMode('view'); setValue(''); setPassword('') }
	const run = async (fn: () => Promise<unknown>, ok: string) => {
		setBusy(true); setMsg(null)
		try { await fn(); setMsg({ ok: true, text: ok }); reset(); onChange() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
	}
	const save = () => run(() => messengersApi(session, 'POST', '/secret', { name, value, password: meta.set ? password : undefined }), meta.set ? 'توکن جایگزین شد.' : 'ذخیره شد و قفل شد.')
	const clear = () => run(() => messengersApi(session, 'POST', '/secret/clear', { name, password }), 'توکنِ تنظیمات حذف شد.')
	const generate = () => run(async () => { const r = await messengersApi<{ value: string }>(session, 'POST', '/secret/generate', { name, password }); setShown(r.value) }, 'توکنِ تازه ساخته شد؛ قبلی دیگر کار نمی‌کند.')

	return (
		<div className="grid gap-2 rounded-md border border-border p-2.5" dir="rtl">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<b className="text-[13px]">{meta.label}</b>
				{meta.set ? (
					<span className="text-[12px] text-muted-foreground">
						<span dir="ltr">•••• ••••</span> آخرین ۴ رقم: <code dir="ltr">{meta.last4}</code>
						{meta.source === 'settings' ? ` · ثبت‌شده در ${faDate(meta.setAt)}${meta.setBy ? ' توسط ' + meta.setBy : ''}` : ' · از فایلِ env سرور'}
					</span>
				) : <span className="text-[12px] text-warning">ثبت نشده</span>}
			</div>
			{!keyConfigured && <p className="text-[12px] text-error">کلید رمزنگاری روی سرور تنظیم نشده (AROMIN_SECRETS_KEY)؛ ثبت از تنظیمات ممکن نیست.</p>}
			{shown && (
				<div className="grid gap-1 rounded bg-muted p-2 text-[12px]">
					<span>فقط همین یک‌بار نمایش داده می‌شود؛ همین حالا کپی کنید:</span>
					<div className="flex items-center gap-2"><code dir="ltr" className="break-all">{shown}</code>
						<button type="button" className={BTN_GHOST} onClick={() => { navigator.clipboard?.writeText(shown).catch(() => undefined) }}>کپی</button>
						<button type="button" className={BTN_GHOST} onClick={() => setShown(null)}>بستن</button></div>
				</div>
			)}
			{!meta.set && keyConfigured && (
				<div className="flex flex-wrap gap-2">
					<input type="password" autoComplete="off" dir="ltr" aria-label={'توکنِ ' + meta.label} className={`${inCls} min-w-0 flex-1`} value={value} onChange={(e) => setValue(e.target.value)} />
					<button type="button" className={BTN_PRIMARY} disabled={busy || !value.trim()} onClick={save}>ذخیره</button>
					{canGenerate && <button type="button" className={BTN_GHOST} disabled={busy} onClick={generate}>تولیدِ توکنِ تازه</button>}
				</div>
			)}
			{meta.set && keyConfigured && mode === 'view' && (
				<div className="flex flex-wrap gap-2">
					<button type="button" className={BTN_GHOST} onClick={() => setMode('replace')}>جایگزینی توکن</button>
					{canGenerate && <button type="button" className={BTN_GHOST} onClick={() => setMode('generate')}>تولیدِ توکنِ تازه</button>}
					{meta.source === 'settings' && <button type="button" className={BTN_DANGER} onClick={() => setMode('clear')}>حذف</button>}
				</div>
			)}
			{mode !== 'view' && (
				<div className="grid gap-2 rounded bg-muted/50 p-2">
					{mode === 'replace' && <input type="password" autoComplete="off" dir="ltr" aria-label="توکنِ جدید" placeholder="توکنِ جدید" className={inCls} value={value} onChange={(e) => setValue(e.target.value)} />}
					<input type="password" autoComplete="current-password" aria-label="رمزِ فعلیِ حساب" placeholder="رمزِ فعلیِ حسابِ شما (برای تأیید)" className={inCls} value={password} onChange={(e) => setPassword(e.target.value)} />
					<div className="flex flex-wrap gap-2">
						<button type="button" className={mode === 'clear' ? BTN_DANGER : BTN_PRIMARY} disabled={busy || !password || (mode === 'replace' && !value.trim())}
							onClick={() => { if (window.confirm(mode === 'clear' ? 'توکن حذف شود؟' : mode === 'generate' ? 'توکنِ قبلی باطل و توکنِ تازه ساخته شود؟' : 'توکن جایگزین شود؟')) (mode === 'clear' ? clear : mode === 'generate' ? generate : save)() }}>
							{mode === 'clear' ? 'تأییدِ حذف' : mode === 'generate' ? 'تأیید و تولید' : 'تأییدِ جایگزینی'}</button>
						<button type="button" className={BTN_GHOST} onClick={reset}>انصراف</button>
					</div>
				</div>
			)}
			{msg && <p className={`text-[12px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
		</div>
	)
}
