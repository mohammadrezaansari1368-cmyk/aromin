/**
 * تنظیمات ← «دستیارِ آرومین»: روشن/خاموش، چهرهٔ احساسی، تریگرهای پیش‌فعال (ویرایشِ ردیفی، بدونِ JSONِ خام)، سلام‌های ساعت‌محور،
 * سقفِ پاپ‌آپ، امتیازِ لید، مسیریابیِ ارجاع (تلگرام @arominagent_bot / بله، قاعده‌های ردیفی بر اساسِ محصول/صفحه)،
 * مدلِ fine-tune، بازبینی/تصویبِ گفت‌وگوهای رضایت‌دار پیش از خروجی، و خروجیِ دادهٔ رضایت‌دار. ذخیره در دیتابیس (agent_settings).
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_GHOST, BTN_PRIMARY, BTN_DANGER, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Ids = { telegram: string[]; bale: string[] }
type CondKey = 'path' | 'pathExact' | 'urlContains' | 'domain' | 'minSeconds' | 'minScroll' | 'visitor' | 'click' | 'utmSource' | 'utmCampaign' | 'manual' | 'firstInteraction'
type Cond = Partial<Record<CondKey, string | number | boolean>>
type Trigger = { id: string; enabled?: boolean; when: Cond; message?: string; emotion?: string }
type Rule = { match: string; telegram: string[]; bale: string[] }
type Cfg = {
	enabled: boolean; emotion: boolean; proactive: boolean
	greetings: Record<'morning' | 'noon' | 'afternoon' | 'night' | 'custom', string>
	triggers: Trigger[]; caps: Record<'perSession' | 'perDay' | 'cooldownMin' | 'dismissCooldownMin', number>
	lead: { required: string[]; minScore: number; weights: Record<string, number> }
	routing: { telegram: boolean; bale: boolean; recipients: Ids; rules: Rule[] }
	behavior: { useFineTuned: boolean; consentText: string }
}
type Delivery = { leadId: number; channel: string; recipient: string; status: string; attempts: number; error: string; createdAt: string }
type Info = { settings: Cfg; stats: Record<string, number>; deliveries: Delivery[]; fineTunedModel: boolean; states: string[]; transports: { telegram: boolean; bale: boolean } }
type FtMsg = { role: 'user' | 'assistant'; content: string }
type FtItem = { id: number; conversationId: string; messages: FtMsg[]; approved: boolean; createdAt: string; updatedAt: string }

const G: [keyof Cfg['greetings'], string][] = [['morning', 'صبح (۵ تا ۱۱)'], ['noon', 'ظهر (۱۱ تا ۱۴)'], ['afternoon', 'عصر (۱۴ تا ۱۹)'], ['night', 'شب'], ['custom', 'سفارشی (اگر پر باشد همیشه همین)']]
const C: [keyof Cfg['caps'], string][] = [['perSession', 'حداکثر در هر نشست'], ['perDay', 'حداکثر در روز'], ['cooldownMin', 'فاصله (دقیقه)'], ['dismissCooldownMin', 'پس از بستن (دقیقه)']]
const ST: Record<string, string> = { sent: '✅ ارسال شد', pending: '⏳ در صف', sending: '⏳ در حالِ ارسال', failed: '❌ ناموفق', cancelled: '⏹ متوقف' }
const COND: [CondKey, string, 'text' | 'number' | 'visitor' | 'none'][] = [
	['path', 'مسیرِ صفحه (مثلاً /sepidz یا با * مثلِ /blog/*)', 'text'],
	['pathExact', 'فقط همین مسیر، دقیق (/ = صفحهٔ اول)', 'text'],
	['firstInteraction', 'اولین تعامل در صفحه (کلیک، لمس یا کلید)', 'none'],
	['urlContains', 'شاملِ بخشی از آدرس', 'text'],
	['domain', 'دامنه', 'text'],
	['minSeconds', 'حداقلِ زمانِ حضور در صفحه (ثانیه)', 'number'],
	['minScroll', 'حداقلِ اسکرول (٪)', 'number'],
	['visitor', 'نوعِ بازدیدکننده', 'visitor'],
	['click', 'کلیک روی انتخابگرِ CSS', 'text'],
	['utmSource', 'utm_source', 'text'],
	['utmCampaign', 'utm_campaign', 'text'],
	['manual', 'فقط اجرای دستی (ArominAgent.trigger)', 'none'],
]
/** همهٔ شرط‌های یک تریگر (با هم AND می‌شوند)، به ترتیبِ فهرستِ بالا */
const condsOf = (w: Cond): CondKey[] => { const ks = COND.map(([k]) => k).filter((k) => w[k] !== undefined); return ks.length ? ks : ['path'] }
const condDefault = (k: CondKey): string | number | boolean => (k === 'visitor' ? 'first' : k === 'minSeconds' || k === 'minScroll' ? 0 : k === 'manual' || k === 'firstInteraction' ? true : '')
const uid = () => 't-' + Math.random().toString(36).slice(2, 10)
const inCls = `${INPUT} py-2`
const selCls = `${INPUT} py-2 ps-2`

export default function AgentSettingsCard({ session }: { session: Session }) {
	const [info, setInfo] = useState<Info | null>(null)
	const [f, setF] = useState<Cfg | null>(null)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const [ft, setFt] = useState<FtItem[] | null>(null)
	const [ftBusy, setFtBusy] = useState(false)
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
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}, [call])
	useEffect(() => { load() }, [load])
	if (!f || !info) return msg ? <p className="text-[12.5px] text-error">{msg.text}</p> : null

	const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setF({ ...f, [k]: v })
	const ids = (s: string) => s.split(/[,،\s]+/).map((x) => x.trim()).filter(Boolean)
	const save = async () => {
		setBusy(true); setMsg(null)
		try {
			const r = await call('PUT', '/settings', { settings: { ...f, agents: undefined } })   // «ایجنت‌ها» has its own card and save
			setF(r.settings); setMsg({ ok: true, text: 'ذخیره شد.' }); load()
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
	}
	const exportFt = async (approvedOnly: boolean) => {
		try {
			const r = await fetch(`/api/agent/finetune/export?tenant=${encodeURIComponent(currentTenant())}&approved=${approvedOnly ? 1 : 0}`, { headers: authHeaders(session), cache: 'no-store' })
			if (!r.ok) throw new Error('خطا ' + r.status)
			const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'aromin-agent-finetune' + (approvedOnly ? '-approved' : '') + '.jsonl'; a.click(); URL.revokeObjectURL(a.href)
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}
	const loadFt = async () => {
		if (ft) { setFt(null); return }
		setFtBusy(true)
		try { setFt((await call('GET', '/finetune')).items) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setFtBusy(false) }
	}
	const approveFt = async (id: number, approved: boolean) => {
		try { await call('POST', `/finetune/${id}/approve`, { approved }); setFt((cur) => cur && cur.map((x) => (x.id === id ? { ...x, approved } : x))) }
		catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}
	const deleteFt = async (id: number) => {
		try { await call('DELETE', `/finetune/${id}`); setFt((cur) => cur && cur.filter((x) => x.id !== id)) }
		catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}

	const previewTriggers = async () => {
		try {
			const r = await fetch(`/api/widget/sites?tenant=${encodeURIComponent(currentTenant())}`, { headers: authHeaders(session), cache: 'no-store' })
			const j = await r.json()
			const site = (j.sites || []).find((x: { domain?: string; enabled?: boolean }) => x.enabled !== false && x.domain)
			if (!site) throw new Error('سایتی در «نصب ابزارک» ثبت نشده.')
			window.open('https://' + String(site.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '') + '/?aromin_preview=1', '_blank', 'noopener')
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}
	const setTriggers = (triggers: Trigger[]) => set('triggers', triggers)
	const addTrigger = () => setTriggers([...f.triggers, { id: uid(), enabled: true, when: { path: '' }, message: '', emotion: 'curious' }])
	const patchTrigger = (i: number, p: Partial<Trigger>) => setTriggers(f.triggers.map((t, j) => (j === i ? { ...t, ...p } : t)))
	const withCond = (i: number, fn: (w: Cond) => Cond) => patchTrigger(i, { when: fn({ ...f.triggers[i].when }) })
	const swapCond = (i: number, from: CondKey, to: CondKey) => withCond(i, (w) => { delete w[from]; w[to] = condDefault(to); return w })
	const setCondVal = (i: number, k: CondKey, v: string | number | boolean) => withCond(i, (w) => { w[k] = v; return w })
	const dropCond = (i: number, k: CondKey) => withCond(i, (w) => { delete w[k]; return w })
	const addCond = (i: number) => withCond(i, (w) => { const k = COND.map(([x]) => x).find((x) => w[x] === undefined); if (k) w[k] = condDefault(k); return w })
	const removeTrigger = (i: number) => setTriggers(f.triggers.filter((_, j) => j !== i))

	const setRules = (rules: Rule[]) => set('routing', { ...f.routing, rules })
	const addRule = () => setRules([...f.routing.rules, { match: '', telegram: [], bale: [] }])
	const patchRule = (i: number, p: Partial<Rule>) => setRules(f.routing.rules.map((r, j) => (j === i ? { ...r, ...p } : r)))
	const removeRule = (i: number) => setRules(f.routing.rules.filter((_, j) => j !== i))

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
			<div className="flex flex-wrap items-center gap-4">
				<Tog on={f.enabled} label="دستیار روشن" onChange={(v) => set('enabled', v)} />
				<Tog on={f.emotion} label="چهرهٔ احساسی" onChange={(v) => set('emotion', v)} />
				<Tog on={f.proactive} label="پیامِ پیش‌فعال (پاپ‌آپ)" onChange={(v) => set('proactive', v)} />
				<button type="button" className={BTN_GHOST} title="سایت با ?aromin_preview=1 باز می‌شود: تریگرِ منطبق یک‌بار، بدونِ سقف، بدونِ رویداد و لید (دستیار باید روشن و ذخیره‌شده باشد)" onClick={previewTriggers}>پیش‌نمایش تریگر</button>
			</div>
			<fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 text-[13px] font-bold">سلام بر اساسِ ساعتِ بازدیدکننده</legend>
				{G.map(([k, l]) => <label key={k} className="grid gap-1 text-[12px]">{l}<input className={inCls} value={f.greetings[k]} maxLength={200} onChange={(e) => set('greetings', { ...f.greetings, [k]: e.target.value })} /></label>)}
			</fieldset>
			<fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4"><legend className="mb-1 text-[13px] font-bold">سقف و فاصلهٔ پاپ‌آپ</legend>
				{C.map(([k, l]) => <label key={k} className="grid gap-1 text-[12px]">{l}<input type="number" min={0} className={inCls} value={f.caps[k]} onChange={(e) => set('caps', { ...f.caps, [k]: Number(e.target.value) })} /></label>)}
			</fieldset>
			<fieldset className="grid gap-2">
				<legend className="mb-1 text-[13px] font-bold">تریگرهای پیش‌فعال (پاپ‌آپِ خودکار)</legend>
				{f.triggers.length === 0 && <p className="text-[12px] text-muted-foreground">هنوز تریگری نیست.</p>}
				{f.triggers.map((t, i) => {
					const keys = condsOf(t.when)
					return (
						<div key={t.id} className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-6">
							<div className="grid gap-1.5 sm:col-span-3">
								<span className="text-[11.5px]">شرط‌ها (همه با هم برقرار باشند)</span>
								{keys.map((ck) => {
									const spec = COND.find(([k]) => k === ck)!
									return (
										<div key={ck} className="flex flex-wrap items-center gap-1.5">
											<select aria-label="شرط" className={`${selCls} min-w-0 flex-1`} value={ck} onChange={(e) => swapCond(i, ck, e.target.value as CondKey)}>
												{COND.map(([k, l]) => <option key={k} value={k} disabled={k !== ck && t.when[k] !== undefined}>{l}</option>)}
											</select>
											{spec[2] === 'none' ? (
												<span className="text-[11.5px] text-muted-foreground">{ck === 'manual' ? <>با کدِ <code dir="ltr">ArominAgent.trigger('{t.id}')</code></> : 'بدونِ مقدار'}</span>
											) : spec[2] === 'visitor' ? (
												<select aria-label="مقدار" className={`${selCls} w-36`} value={String(t.when.visitor || 'first')} onChange={(e) => setCondVal(i, 'visitor', e.target.value)}>
													<option value="first">بازدیدکنندهٔ تازه</option><option value="returning">بازدیدکنندهٔ قبلی</option>
												</select>
											) : spec[2] === 'number' ? (
												<input aria-label="مقدار" type="number" min={0} className={`${inCls} w-24`} value={Number(t.when[ck] ?? 0)} onChange={(e) => setCondVal(i, ck, Number(e.target.value))} />
											) : (
												<input aria-label="مقدار" dir="ltr" className={`${inCls} w-36`} value={String(t.when[ck] ?? '')} onChange={(e) => setCondVal(i, ck, e.target.value)} />
											)}
											{keys.length > 1 && <button type="button" className={BTN_GHOST} aria-label="حذفِ شرط" onClick={() => dropCond(i, ck)}>✕</button>}
										</div>
									)
								})}
								{keys.length < COND.length && <button type="button" className={`${BTN_GHOST} justify-self-start`} onClick={() => addCond(i)}>+ شرطِ دیگر</button>}
							</div>
							<label className="grid gap-1 text-[11.5px] sm:col-span-2">پیامِ پاپ‌آپ (خالی = سلامِ پیش‌فرض)
								<input className={inCls} value={t.message || ''} maxLength={200} onChange={(e) => patchTrigger(i, { message: e.target.value })} /></label>
							<label className="grid gap-1 text-[11.5px]">حالتِ چهره
								<select className={selCls} value={t.emotion || 'curious'} onChange={(e) => patchTrigger(i, { emotion: e.target.value })}>
									{info.states.map((s) => <option key={s} value={s}>{s}</option>)}
								</select>
							</label>
							<div className="flex items-end justify-between gap-2 sm:col-span-6">
								<Tog on={t.enabled !== false} label="فعال" onChange={(v) => patchTrigger(i, { enabled: v })} />
								<button type="button" className={BTN_DANGER} onClick={() => removeTrigger(i)}>حذفِ تریگر</button>
							</div>
						</div>
					)
				})}
				<button type="button" className={BTN_GHOST} onClick={addTrigger}>+ تریگرِ تازه</button>
			</fieldset>
			<fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 text-[13px] font-bold">لید و ارجاع به کارشناس</legend>
				<label className="grid gap-1 text-[12px]">حداقلِ امتیاز برای ارجاع (۰–۱۰۰)<input type="number" min={0} max={100} className={inCls} value={f.lead.minScore} onChange={(e) => set('lead', { ...f.lead, minScore: Number(e.target.value) })} /></label>
				<div className="flex flex-wrap items-end gap-4">
					<Tog on={f.routing.telegram} label={'تلگرام' + (info.transports.telegram ? '' : ' (توکن تنظیم نشده)')} onChange={(v) => set('routing', { ...f.routing, telegram: v })} />
					<Tog on={f.routing.bale} label={'بله' + (info.transports.bale ? '' : ' (توکن تنظیم نشده)')} onChange={(v) => set('routing', { ...f.routing, bale: v })} />
				</div>
				<label className="grid gap-1 text-[12px]">گیرنده‌های تلگرام (chat id یا ‎@channel، با کاما)<input dir="ltr" className={inCls} value={f.routing.recipients.telegram.join(', ')} onChange={(e) => set('routing', { ...f.routing, recipients: { ...f.routing.recipients, telegram: ids(e.target.value) } })} /></label>
				<label className="grid gap-1 text-[12px]">گیرنده‌های بله (chat id، با کاما)<input dir="ltr" className={inCls} value={f.routing.recipients.bale.join(', ')} onChange={(e) => set('routing', { ...f.routing, recipients: { ...f.routing.recipients, bale: ids(e.target.value) } })} /></label>
				<div className="grid gap-2 sm:col-span-2">
					<p className="text-[12px] font-bold">قاعده‌های مسیریابیِ تکمیلی بر اساسِ محصول/صفحه</p>
					{f.routing.rules.map((r, i) => (
						<div key={i} className="grid gap-2 rounded-md border border-border p-2.5 sm:grid-cols-4">
							<label className="grid gap-1 text-[11.5px] sm:col-span-2">شاملِ این متن در محصول/صفحه
								<input className={inCls} value={r.match} onChange={(e) => patchRule(i, { match: e.target.value })} /></label>
							<label className="grid gap-1 text-[11.5px]">گیرنده‌های تلگرام
								<input dir="ltr" className={inCls} value={r.telegram.join(', ')} onChange={(e) => patchRule(i, { telegram: ids(e.target.value) })} /></label>
							<label className="grid gap-1 text-[11.5px]">گیرنده‌های بله
								<input dir="ltr" className={inCls} value={r.bale.join(', ')} onChange={(e) => patchRule(i, { bale: ids(e.target.value) })} /></label>
							<div className="sm:col-span-4"><button type="button" className={BTN_DANGER} onClick={() => removeRule(i)}>حذفِ قاعده</button></div>
						</div>
					))}
					<button type="button" className={BTN_GHOST} onClick={addRule}>+ قاعدهٔ تازه</button>
				</div>
			</fieldset>
			<fieldset className="grid gap-2"><legend className="mb-1 text-[13px] font-bold">رفتار و یادگیری</legend>
				<Tog on={f.behavior.useFineTuned} label={'استفاده از مدلِ fine-tuneشده' + (info.fineTunedModel ? '' : ' (AGENT_FT_MODEL تنظیم نشده → مدلِ پایه)')} onChange={(v) => set('behavior', { ...f.behavior, useFineTuned: v })} />
				<label className="grid gap-1 text-[12px]">متنِ رضایتِ بازدیدکننده<input className={inCls} value={f.behavior.consentText} maxLength={200} onChange={(e) => set('behavior', { ...f.behavior, consentText: e.target.value })} /></label>
			</fieldset>
			<div className="flex flex-wrap gap-2">
				<button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>ذخیره</button>
				<button type="button" className={BTN_GHOST} onClick={loadFt} disabled={ftBusy}>{ft ? 'بستنِ بازبینیِ گفت‌وگوها' : 'بازبینی و تصویبِ گفت‌وگوهای رضایت‌دار'}</button>
				<button type="button" className={BTN_GHOST} onClick={() => exportFt(false)}>خروجیِ همهٔ دادهٔ fine-tune (JSONL)</button>
				<button type="button" className={BTN_GHOST} onClick={() => exportFt(true)}>خروجیِ فقط تصویب‌شده‌ها</button>
			</div>
			{msg && <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
			{ft && (
				<div className="flex flex-col gap-2 rounded-md border border-border p-2.5">
					{ft.length === 0 && <p className="text-[12px] text-muted-foreground">هنوز گفت‌وگوی رضایت‌داری ذخیره نشده.</p>}
					{ft.map((x) => (
						<div key={x.id} className="rounded-md bg-muted/50 p-2 text-[12px]">
							<div className="flex items-center justify-between gap-2">
								<span className="text-muted-foreground">{x.createdAt}</span>
								<div className="flex items-center gap-2">
									<Tog on={x.approved} label="تصویب برای آموزش" onChange={(v) => approveFt(x.id, v)} />
									<button type="button" className={BTN_DANGER} onClick={() => deleteFt(x.id)}>حذف</button>
								</div>
							</div>
							<ul className="mt-1.5 space-y-1">
								{x.messages.slice(0, 6).map((m, i) => <li key={i}><b>{m.role === 'user' ? 'بازدیدکننده' : 'دستیار'}:</b> {m.content.slice(0, 160)}</li>)}
							</ul>
						</div>
					))}
				</div>
			)}
			<p className="text-[12px] text-muted-foreground">۷ روزِ اخیر: بازشدن {stat('widget_opened')} · تریگر {stat('trigger_fired')} · گفت‌وگو {stat('conversation_started')} · لید {stat('lead_captured')} · واجدِ شرایط {stat('lead_qualified')} · ارجاع {stat('handoff_queued')} · ارسالِ موفق {stat('delivery_success')} · ناموفق {stat('delivery_failed')}</p>
			{info.deliveries.length > 0 && (
				<div className="overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="text-muted-foreground"><th className="text-start">لید</th><th className="text-start">کانال</th><th className="text-start">گیرنده</th><th className="text-start">وضعیت</th><th className="text-start">خطا</th></tr></thead>
					<tbody>{info.deliveries.map((d, i) => <tr key={i}><td>#{d.leadId}</td><td>{d.channel === 'tg' ? 'تلگرام' : 'بله'}</td><td dir="ltr">{d.recipient}</td><td>{ST[d.status] || d.status} ({d.attempts})</td><td className="max-w-[28ch] truncate" title={d.error}>{d.error}</td></tr>)}</tbody></table></div>
			)}
		</section>
	)
}
