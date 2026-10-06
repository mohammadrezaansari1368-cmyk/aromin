/**
 * تنظیمات ← «دستیار فروش»: فعال‌سازیِ یک‌کلیکیِ مدیر، پرامپت/متغیرها/قالب‌های پیامک، آمادگیِ کارشناسان، سناریوهای آزمایشی.
 * همهٔ متن‌ها روی سرور (فایلِ تنظیمات) ذخیره می‌شوند؛ این کارت فقط ویرایشگر است.
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { DEFAULT_PROMPT, DEFAULT_TEMPLATES, DEFAULT_VARS, SCENARIOS } from './salesDefaults'
import { BTN, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Cfg = { enabled: boolean; activated: boolean; source: string; reportHour: number; vars: Record<string, string>; prompt: string; tplRep: string; tplManager: string; tplManagerNoRep: string; tplCustomer: string; tplReportSms: string }
type Info = { config: Cfg; tables: boolean; reps: { id: string; name: string; active: boolean; hasMobile: boolean }[]; manager: { name: string; hasMobile: boolean } | null; canEdit: boolean; worker: boolean }
type Run = { q: string; expect: string; text?: string; lead?: unknown; searches?: { query: string; results?: string[]; blocked?: string }[]; error?: string }

const inCls = `${INPUT} py-2`
const btn = BTN
const VARS: [string, string][] = [['companyPhone', 'شمارهٔ تماسِ رسمی'], ['workingHours', 'ساعتِ کاری'], ['address', 'آدرس'], ['supportContact', 'راهِ پشتیبانی']]
const TPLS: [keyof Cfg, string][] = [['tplRep', 'پیام به کارشناس'], ['tplManager', 'پیام به مدیرِ فروش'], ['tplManagerNoRep', 'لیدِ بدونِ کارشناس (به مدیر)'], ['tplCustomer', 'پیامکِ تأییدِ مشتری'], ['tplReportSms', 'پیامکِ گزارشِ روزانه (به مدیر)']]

export default function SalesAgentCard({ session }: { session: Session }) {
	const [info, setInfo] = useState<Info | null>(null)
	const [form, setForm] = useState<Cfg | null>(null)
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [runs, setRuns] = useState<Run[] | null>(null)
	const call = useCallback(async (method: string, path: string, body?: unknown) => {
		const r = await fetch(`/api/sales-agent${path}?tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const d = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر از سرور (' + r.status + ')' }))
		if (!r.ok || d.ok === false) throw new Error(d.error || 'خطا ' + r.status)
		return d
	}, [session])
	const load = useCallback(async () => { try { const d = await call('GET', ''); setInfo(d); setForm(d.config) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } }, [call])
	useEffect(() => { load() }, [load])
	const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) } }
	const activate = () => run(async () => {
		const d = await call('POST', '/activate', { defaults: { prompt: DEFAULT_PROMPT, ...DEFAULT_TEMPLATES, vars: DEFAULT_VARS } })
		setInfo(d); setForm(d.config); setMsg({ ok: true, text: 'دستیارِ فروش فعال شد: جدول‌ها ساخته شد، زمان‌بند روشن است و ابزارکِ سایت از همین حالا با پرامپتِ فروش پاسخ می‌دهد.' })
	})
	const save = () => run(async () => { const d = await call('PUT', '', form); setInfo(d); setForm(d.config); setMsg({ ok: true, text: 'ذخیره شد.' }) })
	const sync = () => run(async () => { await call('POST', '/sync-products'); setMsg({ ok: true, text: 'همگام‌سازیِ محصولاتِ arominco.com در پس‌زمینه شروع شد (چند دقیقه).' }) })
	const scenarios = () => run(async () => {
		const out: Run[] = []
		setRuns([])
		for (const s of SCENARIOS) {
			try { const d = await call('POST', '/test', { messages: [{ role: 'user', content: s.q }], page: s.page }); out.push({ ...s, text: d.text, lead: d.lead, searches: d.searches }) }
			catch (e) { out.push({ ...s, error: (e as Error).message }) }
			setRuns([...out])
		}
	})

	if (!info || !form) return msg ? <section dir="rtl" className={`mb-4 ${CARD} ${CARD_PAD} text-[12.5px] text-muted-foreground`}><b className="text-foreground">دستیار فروش: </b>{msg.text}</section> : <section className="mb-4 h-24 animate-pulse rounded-lg bg-muted/50" aria-busy="true" />
	const ed = info.canEdit && !busy
	const repsReady = info.reps.filter((r) => r.active && r.hasMobile)
	return (
		<section dir="rtl" aria-labelledby="sa-title" className={`mb-4 flex flex-col gap-4 ${CARD} ${CARD_PAD}`}>
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 id="sa-title" className={CARD_TITLE}>دستیار فروش (ابزارکِ سایت)</h3>
					<p className={CARD_SUB}>پرامپتِ مشاورِ فروش، جستجو فقط در arominco.com · sepidz.com · smartx.ir (حداکثر ۳ در هر گفت‌وگو)، ثبتِ لید، ارجاعِ نوبتی بینِ کارشناسانِ فعال، پیامکِ کارشناس/مدیر/مشتری و گزارشِ روزانه. دستیارِ داخلیِ داشبورد تغییر نمی‌کند.</p>
				</div>
				{info.config.activated ? (
					<label className="flex items-center gap-2 text-[12.5px] font-bold"><input type="checkbox" className="size-4" checked={form.enabled} disabled={!ed} onChange={(e) => run(async () => { const d = await call('PUT', '', { enabled: e.target.checked }); setInfo(d); setForm(d.config) })} />{form.enabled ? 'فعال' : 'خاموش'}</label>
				) : (
					<button type="button" disabled={!ed} onClick={activate} className={`${btn} bg-primary text-primary-foreground hover:bg-hover`}>فعال‌سازی (یک کلیک)</button>
				)}
			</header>
			{msg && <p role="status" className={`rounded-md px-3 py-2 text-[12px] font-bold ring-1 ${msg.ok ? 'bg-success/10 text-success ring-success/30' : 'bg-error/10 text-error ring-error/30'}`}>{msg.text}</p>}
			{!info.config.activated && <p className="rounded-md bg-muted/50 px-3 py-2 text-[12px] leading-6 text-muted-foreground">فعال‌سازی فقط جدول‌های تازهٔ لید را می‌سازد (داده‌های فعلی دست نمی‌خورند)، متن‌های پیش‌فرض را در تنظیمات می‌گذارد و زمان‌بندِ ارسال/گزارش را روشن می‌کند. پیش از آن از دیتابیس بکاپ بگیرید.</p>}

			<div className="grid gap-3 rounded-md p-3 ring-1 ring-border sm:grid-cols-2">
				<p className="text-[12.5px] font-extrabold sm:col-span-2">آمادگیِ ارجاع</p>
				<p className="text-[12px]">مدیرِ فروش: {info.manager ? <><b>{info.manager.name}</b> {info.manager.hasMobile ? <span className="text-success">✓ موبایل دارد</span> : <span className="text-error">✗ موبایل ثبت نشده</span>}</> : <span className="text-error">کسی با نقشِ «مدیر فروش» نیست</span>}</p>
				<p className="text-[12px]">کارشناسانِ نوبت (فعال + موبایل): <b>{repsReady.length.toLocaleString('fa-IR')}</b> از {info.reps.length.toLocaleString('fa-IR')}</p>
				<ul className="flex flex-wrap gap-1.5 sm:col-span-2" aria-label="کارشناسان">
					{info.reps.map((r) => <li key={r.id} className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1 ${r.active && r.hasMobile ? 'bg-success/10 text-success ring-success/30' : 'bg-muted text-muted-foreground ring-border'}`}>{r.name}{!r.active ? ' · غیرفعال' : !r.hasMobile ? ' · بدونِ موبایل' : ''}</li>)}
				</ul>
				<p className="text-[11px] text-muted-foreground sm:col-span-2">فهرست و موبایلِ کارشناسان همان «تنظیمات ← کارشناسان» است. زمان‌بند: {info.worker ? 'در حالِ کار' : 'خاموش'}</p>
			</div>

			{info.config.activated && (
				<fieldset disabled={!ed} className="grid gap-3">
					<div className="grid gap-3 rounded-md p-3 ring-1 ring-border sm:grid-cols-2">
						<p className="text-[12.5px] font-extrabold sm:col-span-2">متغیرهای پرامپت و پیامک</p>
						{VARS.map(([k, l]) => <label key={k} className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">{l}<input className={inCls} value={form.vars?.[k] || ''} onChange={(e) => setForm({ ...form, vars: { ...form.vars, [k]: e.target.value } })} /></label>)}
						<label className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">کانالِ تبلیغاتی (source)<input className={inCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
						<label className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">ساعتِ گزارشِ روزانه (وقتِ ایران)<input type="number" min={0} max={23} className={inCls} value={form.reportHour} onChange={(e) => setForm({ ...form, reportHour: Number(e.target.value) })} /></label>
					</div>
					<details className="rounded-md p-3 ring-1 ring-border">
						<summary className="cursor-pointer text-[12.5px] font-extrabold">پرامپتِ سیستمیِ ابزارک</summary>
						<textarea aria-label="پرامپت" className={inCls + ' mt-2 h-80 font-mono text-[12px] leading-6'} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
						<button type="button" onClick={() => setForm({ ...form, prompt: DEFAULT_PROMPT })} className={`${btn} mt-2 ring-1 ring-border hover:bg-muted`}>بازگرداندنِ متنِ پیش‌فرض</button>
					</details>
					<details className="rounded-md p-3 ring-1 ring-border">
						<summary className="cursor-pointer text-[12.5px] font-extrabold">قالب‌های پیامک</summary>
						<p className="mt-2 text-[11px] text-muted-foreground" dir="rtl">متغیرهای مجاز: <bdi dir="ltr">{'{{name}} {{phone}} {{source}} {{assignedTo}} {{companyPhone}} {{city}} {{productInterest}} {{summary}} {{preferredTime}} {{count}}'}</bdi> — خطی که متغیرش خالی باشد حذف می‌شود.</p>
						<div className="mt-2 grid gap-3 sm:grid-cols-2">
							{TPLS.map(([k, l]) => <label key={k} className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">{l}<textarea className={inCls + ' h-36 text-[12px] leading-6'} value={String(form[k] || '')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>)}
						</div>
					</details>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={save} className={`${btn} bg-primary text-primary-foreground hover:bg-hover`}>ذخیرهٔ تنظیمات</button>
						<button type="button" onClick={sync} className={`${btn} ring-1 ring-border hover:bg-muted`}>همگام‌سازیِ محصولاتِ فروشگاه</button>
						<button type="button" onClick={scenarios} className={`${btn} ring-1 ring-border hover:bg-muted`}>اجرای سناریوهای آزمایشی</button>
					</div>
				</fieldset>
			)}
			{runs && (
				<section aria-label="نتیجهٔ سناریوها" className="flex flex-col gap-2 rounded-md p-3 ring-1 ring-border">
					<p className="text-[12.5px] font-extrabold">سناریوهای آزمایشی ({runs.length.toLocaleString('fa-IR')} از {SCENARIOS.length.toLocaleString('fa-IR')}) — بدونِ ثبتِ لید و بدونِ پیامک</p>
					{runs.map((r, i) => (
						<div key={i} className="rounded-lg bg-muted/40 p-2.5 text-[12px] leading-6">
							<p><b>{(i + 1).toLocaleString('fa-IR')}. مشتری:</b> {r.q}</p>
							<p className="text-muted-foreground">انتظار: {r.expect}</p>
							{r.error ? <p className="text-error">{r.error}</p> : <p className="whitespace-pre-wrap"><b>دستیار:</b> {r.text}</p>}
							{!!r.searches?.length && <p className="text-[11px] text-muted-foreground">جستجو: {r.searches.map((s) => s.query + (s.blocked ? ' (مسدود: ' + s.blocked + ')' : ' → ' + (s.results || []).length + ' نتیجه')).join('، ')}</p>}
							{!!r.lead && <p className="text-[11px] text-success" dir="auto">لیدِ آزمایشی: <bdi>{JSON.stringify((r.lead as { lead?: unknown }).lead || r.lead)}</bdi></p>}
						</div>
					))}
				</section>
			)}
		</section>
	)
}
