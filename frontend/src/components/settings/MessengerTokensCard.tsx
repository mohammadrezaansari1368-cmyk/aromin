/**
 * تنظیمات ← «اتصال پیام‌رسان‌ها»: توکنِ ربات‌های بله و تلگرام (یک‌بار ثبت، سپس قفل)، نشانیِ relayِ تلگرام، وضعیتِ اتصال،
 * گروه‌هایی که ربات بله دیده (برای انتخابِ گیرنده) و پیامِ آزمایشی. فقط مدیر.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@/lib/auth'
import { BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'
import SecretField, { messengersApi, type SecretMeta } from './SecretField'

type BaleChat = { id: number; type: string; title: string; lastSeen: string }
export type MessengersInfo = { keyConfigured: boolean; secrets: Record<string, SecretMeta>; telegramApiBase: string; telegramApiDefault: boolean; baleChats: BaleChat[] }
type Check = { ok: boolean; username?: string; error?: string; detail?: string; configured?: boolean }

export default function MessengerTokensCard({ session }: { session: Session }) {
	const [info, setInfo] = useState<MessengersInfo | null>(null)
	const [err, setErr] = useState('')
	const [status, setStatus] = useState<Record<string, Check>>({})
	const [base, setBase] = useState('')
	const [note, setNote] = useState<Record<string, string>>({})
	const load = useCallback(async () => {
		try {
			const d = await messengersApi<MessengersInfo>(session, 'GET', '')
			setInfo(d); setBase(d.telegramApiDefault ? '' : d.telegramApiBase)
			for (const ch of ['bale', 'telegram']) messengersApi<Check>(session, 'POST', '/check', { channel: ch }).then((c) => setStatus((s) => ({ ...s, [ch]: c })), (e) => setStatus((s) => ({ ...s, [ch]: { ok: false, error: (e as Error).message } })))
		} catch (e) { setErr((e as Error).message) }
	}, [session])
	useEffect(() => { load() }, [load])
	if (!info) return err ? <p className="text-[12.5px] text-error">{err}</p> : null

	const chip = (ch: string) => {
		const c = status[ch]
		if (!c) return <span className="text-[12px] text-muted-foreground">در حالِ بررسی…</span>
		if (ch === 'bale') return c.ok ? <span className="text-[12px] text-success">متصل ✓ @{c.username}</span> : <span className="text-[12px] text-error">{c.error}</span>
		return <span className={`text-[12px] ${c.ok ? 'text-success' : 'text-error'}`}>{c.ok ? 'relay در دسترس' : 'relay در دسترس نیست'} ({c.detail}) · توکن {c.configured ? 'ثبت‌شده' : 'ثبت‌نشده'}</span>
	}
	const saveBase = async () => {
		try { await messengersApi(session, 'POST', '/telegram-base', { url: base.trim() }); setNote((n) => ({ ...n, base: 'ذخیره شد.' })); load() }
		catch (e) { setNote((n) => ({ ...n, base: (e as Error).message })) }
	}
	const test = async (ch: string) => {
		setNote((n) => ({ ...n, [ch]: 'در حالِ ارسال…' }))
		try {
			const r = await messengersApi<{ results: { to: string; ok: boolean; error?: string; messageId?: number }[] }>(session, 'POST', '/test', { channel: ch })
			setNote((n) => ({ ...n, [ch]: r.results.map((x) => `${x.to}: ${x.ok ? 'ارسال شد ✓' : x.error}`).join(' · ') }))
		} catch (e) { setNote((n) => ({ ...n, [ch]: (e as Error).message })) }
	}
	const copy = (id: number) => { navigator.clipboard?.writeText(String(id)).catch(() => undefined); setNote((n) => ({ ...n, chats: `شناسهٔ ${id} کپی شد؛ در «گیرنده‌های بله» (کارتِ دستیار) بگذارید و ذخیره کنید.` })) }

	return (
		<section dir="rtl" aria-labelledby="msg-title" className={`mb-4 flex flex-col gap-3 ${CARD} ${CARD_PAD}`}>
			<header>
				<h3 id="msg-title" className={CARD_TITLE}>اتصال پیام‌رسان‌ها</h3>
				<p className={CARD_SUB}>توکنِ ربات‌ها یک‌بار ثبت و سپس قفل می‌شود؛ جایگزینی فقط با رمزِ فعلیِ حساب. توکن هرگز دوباره نمایش داده نمی‌شود.</p>
			</header>
			<div className="grid gap-1">
				<SecretField session={session} name="bale_leads" meta={info.secrets.bale_leads} keyConfigured={info.keyConfigured} onChange={load} />
				<div className="flex flex-wrap items-center gap-2">{chip('bale')}<button type="button" className={BTN_GHOST} onClick={() => test('bale')}>پیام آزمایشی</button>{note.bale && <span className="text-[12px]">{note.bale}</span>}</div>
			</div>
			<div className="grid gap-1.5 rounded-md border border-border p-2.5">
				<b className="text-[13px]">گروه‌هایی که ربات بله دیده</b>
				<p className="text-[12px] text-muted-foreground">ربات را به گروه اضافه کنید و در گروه آن را منشن کنید (یا /start بفرستید)؛ تا ۲۰ ثانیه بعد اینجا می‌آید.</p>
				{info.baleChats.length === 0 ? <p className="text-[12px]">هنوز گروهی دیده نشده.</p> : info.baleChats.map((c) => (
					<div key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px]"><span>{c.title || '(بی‌نام)'}</span><code dir="ltr">{c.id}</code><span className="text-muted-foreground">{c.type}</span>
						<button type="button" className={BTN_GHOST} onClick={() => copy(c.id)}>کپی شناسه</button></div>
				))}
				{note.chats && <span className="text-[12px] text-success">{note.chats}</span>}
			</div>
			{info.secrets.zurvan_bridge && <div className="grid gap-1">
				<SecretField session={session} name="zurvan_bridge" meta={info.secrets.zurvan_bridge} keyConfigured={info.keyConfigured} onChange={load} />
				<p className="text-[12px] text-muted-foreground">همان کلیدی که در زروان (سربرگ/تأیید عامل) ساخته شده؛ اتصال دستیار زروان به این داشبورد.</p>
			</div>}
			<div className="grid gap-1">
				<SecretField session={session} name="telegram_leads" meta={info.secrets.telegram_leads} keyConfigured={info.keyConfigured} onChange={load} />
				<p className="text-[12px] text-warning">سرور در ایران به api.telegram.org دسترسی ندارد؛ بدون relay، ارسال تلگرام انجام نمی‌شود.</p>
				<label className="grid gap-1 text-[12px]">نشانیِ relayِ تلگرام (خالی = api.telegram.org)
					<div className="flex flex-wrap gap-2"><input dir="ltr" className={`${INPUT} min-w-0 flex-1 py-2`} placeholder="https://relay.example.com" value={base} onChange={(e) => setBase(e.target.value)} />
						<button type="button" className={BTN_PRIMARY} onClick={saveBase}>ذخیره</button>
						<button type="button" className={BTN_GHOST} onClick={() => messengersApi<Check>(session, 'POST', '/check', { channel: 'telegram' }).then((c) => setStatus((s) => ({ ...s, telegram: c })), (e) => setNote((n) => ({ ...n, base: (e as Error).message })))}>آزمون اتصال</button></div>
				</label>
				{note.base && <span className="text-[12px]">{note.base}</span>}
				<div className="flex flex-wrap items-center gap-2">{chip('telegram')}<button type="button" className={BTN_GHOST} onClick={() => test('telegram')}>پیام آزمایشی</button>{note.telegram && <span className="text-[12px]">{note.telegram}</span>}</div>
			</div>
		</section>
	)
}
