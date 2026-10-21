/**
 * تنظیمات ← «دستیارِ آرومین»: روشن/خاموش، چهرهٔ احساسی، تریگرهای پیش‌فعال، سلام‌های ساعت‌محور، سقفِ پاپ‌آپ، امتیازِ لید،
 * مسیریابیِ ارجاع (تلگرام @arominagent_bot / بله)، مدلِ fine-tune و خروجیِ دادهٔ رضایت‌دار. ذخیره در دیتابیس (agent_settings).
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Ids = { telegram: string[]; bale: string[] }
type Cfg = {
	enabled: boolean; emotion: boolean; proactive: boolean
	greetings: Record<'morning' | 'noon' | 'afternoon' | 'night' | 'custom', string>
	triggers: unknown[]; caps: Record<'perSession' | 'perDay' | 'cooldownMin' | 'dismissCooldownMin', number>
	lead: { required: string[]; minScore: number; weights: Record<string, number> }
	routing: { telegram: boolean; bale: boolean; recipients: Ids; rules: unknown[] }
	behavior: { useFineTuned: boolean; consentText: string }
}
type Delivery = { leadId: number; channel: string; recipient: string; status: string; attempts: number; error: string; createdAt: string }
type Info = { settings: Cfg; stats: Record<string, number>; deliveries: Delivery[]; fineTunedModel: boolean; transports: { telegram: boolean; bale: boolean } }

const G: [keyof Cfg['greetings'], string][] = [['morning', 'صبح (۵ تا ۱۱)'], ['noon', 'ظهر (۱۱ تا ۱۴)'], ['afternoon', 'عصر (۱۴ تا ۱۹)'], ['night', 'شب'], ['custom', 'سفارشی (اگر پر باشد همیشه همین)']]
const C: [keyof Cfg['caps'], string][] = [['perSession', 'حداکثر در هر نشست'], ['perDay', 'حداکثر در روز'], ['cooldownMin', 'فاصله (دقیقه)'], ['dismissCooldownMin', 'پس از بستن (دقیقه)']]
const ST: Record<string, string> = { sent: '✅ ارسال شد', pending: '⏳ در صف', sending: '⏳ در حالِ ارسال', failed: '❌ ناموفق', cancelled: '⏹ متوقف' }
const inCls = `${INPUT} py-2`

export default function AgentSettingsCard({ session }: { session: Session }) {
	const [info, setInfo] = useState<Info | null>(null)
	const [f, setF] = useState<Cfg | null>(null)
	const [json, setJson] = useState({ triggers: '', rules: '' })
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const call = useCallback(async (method: string, path: string, body?: unknown) => {
		const r = await fetch(`/api/agent${path}?tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
		if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
		return j
	}, [session])
	const load = useCallback(async () => {
		try {
			const d: Info = await call('GET', '/settings')
			setInfo(d); setF(d.settings)
			setJson({ triggers: JSON.stringify(d.settings.triggers, null, 1), rules: JSON.stringify(d.settings.routing.rules, null, 1) })
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}, [call])
	useEffect(() => { load() }, [load])
	if (!f || !info) return msg ? <p className="text-[12.5px] text-error">{msg.text}</p> : null

	const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setF({ ...f, [k]: v })
	const ids = (s: string) => s.split(/[,،\s]+/).map((x) => x.trim()).filter(Boolean)
	const save = async () => {
		setBusy(true); setMsg(null)
		try {
			const triggers = JSON.parse(json.triggers || '[]'), rules = JSON.parse(json.rules || '[]')
			const r = await call('PUT', '/settings', { settings: { ...f, triggers, routing: { ...f.routing, rules } } })
			setF(r.settings); setMsg({ ok: true, text: 'ذخیره شد.' }); load()
		} catch (e) { setMsg({ ok: false, text: e instanceof SyntaxError ? 'JSONِ تریگرها/قاعده‌ها نامعتبر است.' : (e as Error).message }) } finally { setBusy(false) }
	}
	const exportFt = async () => {
		try {
			const r = await fetch(`/api/agent/finetune/export?tenant=${encodeURIComponent(currentTenant())}`, { headers: authHeaders(session), cache: 'no-store' })
			if (!r.ok) throw new Error('خطا ' + r.status)
			const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'aromin-agent-finetune.jsonl'; a.click(); URL.revokeObjectURL(a.href)
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}
	const Tog = ({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) => (
		<label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />{label}</label>
	)
	const stat = (k: string) => info.stats[k] || 0

	return (
		<section dir="rtl" aria-labelledby="ag-title" className={`mb-4 flex flex-col gap-4 ${CARD} ${CARD_PAD}`}>
			<header>
				<h3 id="ag-title" className={CARD_TITLE}>دستیارِ آرومین (Agent)</h3>
				<p className={CARD_SUB}>چهرهٔ احساسی، پیامِ پیش‌فعال، جمع‌آوریِ گفت‌وگومحورِ لید و ارجاع به کارشناس در تلگرام و بله. پاسخ‌ها از پایگاهِ دانش (RAG) می‌آیند.</p>
			</header>
			<div className="flex flex-wrap gap-4">
				<Tog on={f.enabled} label="دستیار روشن" onChange={(v) => set('enabled', v)} />
				<Tog on={f.emotion} label="چهرهٔ احساسی" onChange={(v) => set('emotion', v)} />
				<Tog on={f.proactive} label="پیامِ پیش‌فعال (پاپ‌آپ)" onChange={(v) => set('proactive', v)} />
			</div>
			<fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 text-[13px] font-bold">سلام بر اساسِ ساعتِ بازدیدکننده</legend>
				{G.map(([k, l]) => <label key={k} className="grid gap-1 text-[12px]">{l}<input className={inCls} value={f.greetings[k]} maxLength={200} onChange={(e) => set('greetings', { ...f.greetings, [k]: e.target.value })} /></label>)}
			</fieldset>
			<fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4"><legend className="mb-1 text-[13px] font-bold">سقف و فاصلهٔ پاپ‌آپ</legend>
				{C.map(([k, l]) => <label key={k} className="grid gap-1 text-[12px]">{l}<input type="number" min={0} className={inCls} value={f.caps[k]} onChange={(e) => set('caps', { ...f.caps, [k]: Number(e.target.value) })} /></label>)}
			</fieldset>
			<label className="grid gap-1 text-[12px]">تریگرها (JSON؛ شرط‌ها: path، urlContains، domain، minSeconds، minScroll، visitor=first|returning، click، utmSource، utmCampaign، manual)
				<textarea dir="ltr" rows={5} className={`${inCls} font-mono text-[11.5px]`} value={json.triggers} onChange={(e) => setJson({ ...json, triggers: e.target.value })} /></label>
			<fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 text-[13px] font-bold">لید و ارجاع به کارشناس</legend>
				<label className="grid gap-1 text-[12px]">حداقلِ امتیاز برای ارجاع (۰–۱۰۰)<input type="number" min={0} max={100} className={inCls} value={f.lead.minScore} onChange={(e) => set('lead', { ...f.lead, minScore: Number(e.target.value) })} /></label>
				<div className="flex flex-wrap items-end gap-4">
					<Tog on={f.routing.telegram} label={'تلگرام' + (info.transports.telegram ? '' : ' (توکن تنظیم نشده)')} onChange={(v) => set('routing', { ...f.routing, telegram: v })} />
					<Tog on={f.routing.bale} label={'بله' + (info.transports.bale ? '' : ' (توکن تنظیم نشده)')} onChange={(v) => set('routing', { ...f.routing, bale: v })} />
				</div>
				<label className="grid gap-1 text-[12px]">گیرنده‌های تلگرام (chat id یا ‎@channel، با کاما)<input dir="ltr" className={inCls} value={f.routing.recipients.telegram.join(', ')} onChange={(e) => set('routing', { ...f.routing, recipients: { ...f.routing.recipients, telegram: ids(e.target.value) } })} /></label>
				<label className="grid gap-1 text-[12px]">گیرنده‌های بله (chat id، با کاما)<input dir="ltr" className={inCls} value={f.routing.recipients.bale.join(', ')} onChange={(e) => set('routing', { ...f.routing, recipients: { ...f.routing.recipients, bale: ids(e.target.value) } })} /></label>
				<label className="grid gap-1 text-[12px] sm:col-span-2">قاعده‌های مسیریابی بر اساسِ محصول/صفحه (JSON: [{'{'}"match": "صندوق", "telegram": ["…"], "bale": ["…"]{'}'}])
					<textarea dir="ltr" rows={2} className={`${inCls} font-mono text-[11.5px]`} value={json.rules} onChange={(e) => setJson({ ...json, rules: e.target.value })} /></label>
			</fieldset>
			<fieldset className="grid gap-2"><legend className="mb-1 text-[13px] font-bold">رفتار و یادگیری</legend>
				<Tog on={f.behavior.useFineTuned} label={'استفاده از مدلِ fine-tuneشده' + (info.fineTunedModel ? '' : ' (AGENT_FT_MODEL تنظیم نشده → مدلِ پایه)')} onChange={(v) => set('behavior', { ...f.behavior, useFineTuned: v })} />
				<label className="grid gap-1 text-[12px]">متنِ رضایتِ بازدیدکننده<input className={inCls} value={f.behavior.consentText} maxLength={200} onChange={(e) => set('behavior', { ...f.behavior, consentText: e.target.value })} /></label>
			</fieldset>
			<div className="flex flex-wrap gap-2">
				<button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>ذخیره</button>
				<button type="button" className={BTN_GHOST} onClick={exportFt}>خروجیِ دادهٔ fine-tune (JSONL، فقط با رضایت و بدونِ اطلاعاتِ شخصی)</button>
			</div>
			{msg && <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
			<p className="text-[12px] text-muted-foreground">۷ روزِ اخیر: بازشدن {stat('widget_opened')} · تریگر {stat('trigger_fired')} · گفت‌وگو {stat('conversation_started')} · لید {stat('lead_captured')} · واجدِ شرایط {stat('lead_qualified')} · ارجاع {stat('handoff_queued')} · ارسالِ موفق {stat('delivery_success')} · ناموفق {stat('delivery_failed')}</p>
			{info.deliveries.length > 0 && (
				<div className="overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="text-muted-foreground"><th className="text-start">لید</th><th className="text-start">کانال</th><th className="text-start">گیرنده</th><th className="text-start">وضعیت</th><th className="text-start">خطا</th></tr></thead>
					<tbody>{info.deliveries.map((d, i) => <tr key={i}><td>#{d.leadId}</td><td>{d.channel === 'tg' ? 'تلگرام' : 'بله'}</td><td dir="ltr">{d.recipient}</td><td>{ST[d.status] || d.status} ({d.attempts})</td><td className="max-w-[28ch] truncate" title={d.error}>{d.error}</td></tr>)}</tbody></table></div>
			)}
		</section>
	)
}
