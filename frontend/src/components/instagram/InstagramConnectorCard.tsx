/**
 * تنظیمات ← «اتصالِ اینستاگرام» (3.9.73): همان کانکتورِ Composio. ۱) کلیدِ Composio (یک‌بار ثبت، سپس قفل) ۲) اتصال با رمزِ فعلی —
 * سرور حسابِ فعالِ اینستاگرام را پیدا و با خواندنِ پروفایل آزمایش می‌کند ۳) روشن/خاموشِ به‌روزرسانیِ خودکارِ صبح (۸ تهران) + خلاصه در بله/تلگرام.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@/lib/auth'
import { BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'
import SecretField, { messengersApi, type SecretMeta } from '@/components/settings/SecretField'
import { igApi, type IgStatus } from './igApi'

export default function InstagramConnectorCard({ session }: { session: Session }) {
	const [st, setSt] = useState<IgStatus | null>(null)
	const [meta, setMeta] = useState<{ keyConfigured: boolean; m: SecretMeta } | null>(null)
	const [password, setPassword] = useState('')
	const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const load = useCallback(async () => {
		try {
			const [s, m] = await Promise.all([igApi<IgStatus>(session, 'status'), messengersApi<{ keyConfigured: boolean; secrets: Record<string, SecretMeta> }>(session, 'GET', '')])
			setSt(s); setMeta({ keyConfigured: m.keyConfigured, m: m.secrets.composio_api })
		} catch (e) { setMsg({ ok: false, t: (e as Error).message }) }
	}, [session])
	useEffect(() => { load() }, [load])
	const run = async (fn: () => Promise<string>) => { setBusy(true); setMsg(null); try { setMsg({ ok: true, t: await fn() }); load() } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setBusy(false) } }
	if (!st || !meta) return msg ? <p className="text-[12.5px] text-error">{msg.t}</p> : null
	return (
		<section dir="rtl" className={`mb-4 grid gap-3 ${CARD} ${CARD_PAD}`} data-testid="ig-connector">
			<header><h3 className={CARD_TITLE}>اتصالِ اینستاگرام</h3><p className={CARD_SUB}>کانکتورِ Composio برای پیجِ aromin.online.</p></header>
			<ol className="grid gap-2 text-[12.5px]">
				<li><b>۱. کلیدِ Composio</b> — از dashboard.composio.dev ← Settings ← API Keys:
					{meta.m ? <SecretField session={session} name="composio_api" meta={meta.m} keyConfigured={meta.keyConfigured} onChange={load} /> : <span className="text-error"> ناموجود</span>}</li>
				<li><b>۲. وصل کردن</b> — {st.connected ? <span className="text-success">وصل است: @{st.username}</span> : 'هنوز وصل نیست.'}
					<div className="mt-1 flex flex-wrap gap-2"><input type="password" autoComplete="current-password" className={`${INPUT} w-52 py-2`} placeholder="رمزِ فعلیِ حساب" aria-label="رمزِ فعلیِ حساب" value={password} onChange={(e) => setPassword(e.target.value)} />
						<button type="button" className={BTN_PRIMARY} disabled={busy || !st.keySet || !password} onClick={() => run(async () => { const r = await igApi<{ url: string }>(session, 'link', { password }); if (new URL(r.url).protocol !== 'https:') throw new Error('لینک اتصال معتبر نیست.'); window.open(r.url, '_blank', 'noopener,noreferrer'); setPassword(''); return 'لینک اتصال باز شد؛ پس از تأیید، دکمهٔ اتصال را بزنید.' })}>ساخت لینکِ اتصال</button>
						<button type="button" className={BTN_PRIMARY} disabled={busy || !st.keySet || !password} onClick={() => run(async () => { const r = await igApi<{ username: string; followers: number }>(session, 'connect', { password }); setPassword(''); return `وصل شد: @${r.username} · ${r.followers.toLocaleString('fa-IR')} دنبال‌کننده` })}>{st.connected ? 'آزمایش دوباره' : 'اتصال'}</button></div></li>
				<li><b>۳. خودکار</b> — <label className="inline-flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={st.enabled} disabled={busy || !st.connected} onChange={(e) => run(async () => { await igApi(session, 'settings', { enabled: e.target.checked }); return e.target.checked ? 'هر صبح ساعت ۸ پنل به‌روز و خلاصه برای مدیرِ فروش فرستاده می‌شود.' : 'خودکار خاموش شد.' })} />هر صبح ساعت ۸ به‌روزرسانی + خلاصه در بله/تلگرام</label></li>
			</ol>
			{msg && <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.t}</p>}
		</section>
	)
}
