/**
 * تنظیمات → «نصب ابزارک» (+ «تست ابزارک»): سایت‌ها، کدِ نصبِ اختصاصی (فقط siteId)، تنظیماتِ ظاهر با پیش‌نمایشِ زنده.
 * همهٔ تنظیمات روی سرور؛ ابزارک (public/widget.js) هر بار از API می‌خواند ← تغییرات بدونِ تغییرِ کدِ نصب اعمال می‌شوند.
 * دیدن: هر کاربرِ واردشده · تغییر: فقط مدیر (سرور هم همین را اعمال می‌کند).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Pos = { side: 'right' | 'left'; bottom: number; offset: number }
type Settings = { enabled: boolean; title: string; welcome: string; color: string; desktop: Pos; mobile: Pos }
type Site = { siteId: string; name: string; domain: string; enabled: boolean; settings: Settings }
type Check = { name: string; ok: boolean; note: string }

const inCls = INPUT
const btn = BTN
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const installCode = (id: string) =>
	`<script>(function(d){var s=d.createElement("script");s.async=1;s.src="${location.origin}/widget.js";s.setAttribute("data-site-id","${id}");(d.head||d.documentElement).appendChild(s)})(document);</script>`

export default function WidgetInstallCard({ session }: { session: Session }) {
	const admin = isAdmin(session.role)
	const [sites, setSites] = useState<Site[] | null>(null)
	const [sel, setSel] = useState('')
	const [form, setForm] = useState<Settings | null>(null)
	const [add, setAdd] = useState({ name: '', domain: '', enabled: true })
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
	const [checks, setChecks] = useState<Check[] | null>(null)
	const [live, setLive] = useState(false)

	const call = useCallback(async (method: string, path: string, body?: unknown) => {
		const sep = path.includes('?') ? '&' : '?'
		const r = await fetch(`/api/widget${path}${sep}tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const d = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر از سرور (' + r.status + ')' }))
		if (!d.ok) throw new Error(d.error || 'خطا ' + r.status)
		return d
	}, [session])
	const load = useCallback(async () => {
		try { const d = await call('GET', '/sites'); setSites(d.sites); setSel((s) => s || d.sites[0]?.siteId || '') } catch (e) { setMsg({ ok: false, text: (e as Error).message }); setSites([]) }
	}, [call])
	useEffect(() => { load() }, [load])
	const site = sites?.find((x) => x.siteId === sel)
	useEffect(() => { setForm(site ? structuredClone(site.settings) : null); setChecks(null); setLive(false) }, [site])

	const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) } }
	const update = (patch: Partial<Site>, text: string) => run(async () => {
		const d = await call('PUT', '/sites/' + sel, patch)
		setSites((ss) => ss!.map((x) => (x.siteId === sel ? d.site : x))); setMsg({ ok: true, text })
	})
	const addSite = () => run(async () => {
		const d = await call('POST', '/sites', add)
		setSites((ss) => [...(ss || []), d.site]); setSel(d.site.siteId); setAdd({ name: '', domain: '', enabled: true }); setMsg({ ok: true, text: 'سایت اضافه شد؛ کدِ نصب آماده است.' })
	})
	const selftest = () => run(async () => { setChecks((await call('POST', '/selftest?siteId=' + sel)).checks) })
	const copy = async () => {
		try { await navigator.clipboard.writeText(installCode(sel)); setMsg({ ok: true, text: 'کدِ نصب کپی شد.' }) } catch { setMsg({ ok: false, text: 'کپی نشد؛ کد را دستی انتخاب کنید.' }) }
	}
	const preview = useMemo(() => form && `<!doctype html><html dir="rtl"><body style="margin:0;min-height:100vh;background:linear-gradient(#fafafa,#eee);font:14px sans-serif;color:#999"><p style="padding:16px">پیش‌نمایشِ صفحهٔ سایت</p><script src="${location.origin}/widget.js" data-open="1" data-preview="${esc(JSON.stringify(form))}"></script></body></html>`, [form])
	// «تست ابزارک»: همان ابزارکِ واقعی و همان API عمومی؛ از داشبورد فقط با ورودِ معتبر پذیرفته می‌شود
	const testDoc = useMemo(() => `<!doctype html><html dir="rtl"><body style="margin:0;min-height:100vh;background:#f4f4f4;font:14px sans-serif;color:#999"><p style="padding:16px">تستِ زنده — پاسخ‌ها از مسیرِ واقعیِ سایت</p><script>window.ArominWidgetTest={headers:${JSON.stringify(authHeaders(session)).replace(/</g, '\\u003c')}}</script><script src="${location.origin}/widget.js" data-open="1" data-site-id="${sel}"></script></body></html>`, [session, sel])

	const setPos = (dev: 'desktop' | 'mobile', k: keyof Pos, v: string) => setForm((f) => f && { ...f, [dev]: { ...f[dev], [k]: k === 'side' ? v : Math.max(0, Math.min(300, Number(v) || 0)) } })
	const frameW = device === 'mobile' ? 375 : '100%'

	return (
		<section dir="rtl" aria-labelledby="wg-title" className={`mb-4 flex flex-col gap-4 ${CARD} ${CARD_PAD}`}>
			<header>
				<h3 id="wg-title" className={CARD_TITLE}>نصب ابزارک</h3>
				<p className={CARD_SUB}>دستیارِ هوشمندِ همین داشبورد روی سایت‌های شما، با همان دانش (به‌جز موارد «فقط داخلی»). کدِ نصب فقط شناسهٔ سایت دارد؛ هر تغییری این‌جا بدونِ عوض کردنِ کد روی سایت اعمال می‌شود.{!admin && ' تغییرات فقط برای مدیر.'}</p>
			</header>
			{msg && <p role="status" className={`rounded-xl px-3 py-2 text-[12px] font-bold ring-1 ${msg.ok ? 'bg-success/10 text-success ring-success/30' : 'bg-error/10 text-error ring-error/30'}`}>{msg.text}</p>}
			{sites === null ? <div className="h-24 animate-pulse rounded-md bg-muted/50" /> : (
				<>
					<div className="flex flex-wrap gap-2" role="tablist" aria-label="سایت‌ها">
						{sites.map((x) => (
							<button key={x.siteId} role="tab" aria-selected={x.siteId === sel} onClick={() => setSel(x.siteId)} className={`${btn} ring-1 ${x.siteId === sel ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card ring-border hover:bg-muted'}`}>
								{x.name} <bdi className="font-normal opacity-80">{x.domain}</bdi> {!(x.enabled && x.settings.enabled) && <span className="font-normal opacity-80">· خاموش</span>}
							</button>
						))}
					</div>
					{admin && (
						<form className="grid gap-2 rounded-xl bg-muted/40 p-3 ring-1 ring-border/70 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); addSite() }}>
							<label className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">نامِ سایت<input className={inCls} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="فروشگاه آرومین" /></label>
							<label className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">دامنه<input className={inCls} dir="ltr" value={add.domain} onChange={(e) => setAdd({ ...add, domain: e.target.value })} placeholder="shop.example.com" /></label>
							<label className="flex h-10 items-center gap-2 text-[12.5px]"><input type="checkbox" checked={add.enabled} onChange={(e) => setAdd({ ...add, enabled: e.target.checked })} className="size-4" />فعال</label>
							<button type="submit" disabled={busy || !add.name.trim() || !add.domain.trim()} className={`${btn} bg-primary text-primary-foreground hover:bg-hover`}>افزودنِ سایت</button>
						</form>
					)}
					{site && form && (
						<div className="grid gap-4 lg:grid-cols-2">
							<div className="flex min-w-0 flex-col gap-4">
								<div className="rounded-md p-3 ring-1 ring-border">
									<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
										<p className="text-[12.5px] font-extrabold">کدِ نصب — <bdi>{site.domain}</bdi></p>
										<button type="button" onClick={copy} className={`${btn} bg-primary text-primary-foreground hover:bg-hover`}>کپی کد</button>
									</div>
									<textarea readOnly dir="ltr" value={installCode(site.siteId)} onFocus={(e) => e.target.select()} aria-label="کدِ نصب" className="h-24 w-full resize-none rounded-lg bg-muted/50 p-2 font-mono text-[11px] text-foreground outline-none ring-1 ring-border" />
									<p className="mt-1 text-[11px] text-muted-foreground">قبل از <code dir="ltr">&lt;/head&gt;</code> سایت بگذارید · شناسه: <bdi className="font-mono">{site.siteId}</bdi></p>
									<label className="mt-2 flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={site.enabled} disabled={!admin || busy} onChange={(e) => update({ enabled: e.target.checked }, e.target.checked ? 'سایت فعال شد.' : 'سایت غیرفعال شد.')} className="size-4" />سایت فعال است</label>
								</div>
								<fieldset disabled={!admin || busy} className="grid gap-3 rounded-xl p-3 ring-1 ring-border">
									<legend className="px-1 text-[12.5px] font-extrabold">تنظیماتِ ابزارک</legend>
									<label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={form.enabled} onChange={(e) => { const on = e.target.checked; setForm({ ...form, enabled: on }); update({ settings: { enabled: on } as Settings }, on ? 'ابزارک روشن شد و روی سایت نمایش داده می‌شود.' : 'ابزارک خاموش شد.') }} className="size-4" />ابزارک روشن است (فوراً ذخیره می‌شود)</label>
									<label className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">عنوان<input className={inCls} maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
									<label className="flex flex-col gap-1 text-[11.5px] font-bold text-muted-foreground">پیامِ خوش‌آمد<textarea className={inCls + ' h-20 py-2'} maxLength={400} value={form.welcome} onChange={(e) => setForm({ ...form, welcome: e.target.value })} /></label>
									<label className="flex items-center gap-2 text-[11.5px] font-bold text-muted-foreground">رنگِ اصلی<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-border bg-card" /><bdi className="font-mono">{form.color}</bdi></label>
									{(['desktop', 'mobile'] as const).map((dev) => (
										<div key={dev} className="grid grid-cols-3 gap-2">
											<p className="col-span-3 text-[11.5px] font-extrabold">{dev === 'desktop' ? 'دسکتاپ' : 'موبایل'}</p>
											<label className="flex flex-col gap-1 text-[11px] text-muted-foreground">سمت<select className={inCls} value={form[dev].side} onChange={(e) => setPos(dev, 'side', e.target.value)}><option value="right">راست</option><option value="left">چپ</option></select></label>
											<label className="flex flex-col gap-1 text-[11px] text-muted-foreground">فاصله از پایین (px)<input type="number" min={0} max={300} className={inCls} value={form[dev].bottom} onChange={(e) => setPos(dev, 'bottom', e.target.value)} /></label>
											<label className="flex flex-col gap-1 text-[11px] text-muted-foreground">فاصله از {form[dev].side === 'right' ? 'راست' : 'چپ'} (px)<input type="number" min={0} max={300} className={inCls} value={form[dev].offset} onChange={(e) => setPos(dev, 'offset', e.target.value)} /></label>
										</div>
									))}
									<button type="button" onClick={() => update({ settings: form }, 'تنظیمات ذخیره شد؛ روی سایت بدونِ تغییرِ کد اعمال می‌شود.')} className={`${btn} bg-primary text-primary-foreground hover:bg-hover`}>ذخیرهٔ تنظیمات</button>
								</fieldset>
							</div>
							<div className="flex min-w-0 flex-col gap-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-[12.5px] font-extrabold">{live ? 'تست ابزارک (زنده)' : 'پیش‌نمایشِ زنده'}</p>
									<div className="flex gap-1.5" role="group" aria-label="دستگاه">
										{(['desktop', 'mobile'] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`${btn} min-h-8 px-3 ring-1 ${device === d ? 'bg-primary text-primary-foreground ring-primary' : 'ring-border hover:bg-muted'}`}>{d === 'desktop' ? 'دسکتاپ' : 'موبایل'}</button>)}
									</div>
								</div>
								<iframe key={(live ? 'live' : 'pv') + device} title={live ? 'تست ابزارک' : 'پیش‌نمایشِ ابزارک'} srcDoc={live ? testDoc : preview || ''} style={{ width: frameW, height: device === 'mobile' ? 667 : 640 }} className="mx-auto max-w-full rounded-xl bg-white ring-1 ring-border" />
								<section aria-labelledby="wg-test" className="rounded-md p-3 ring-1 ring-border">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h4 id="wg-test" className="text-[12.5px] font-extrabold">تست ابزارک</h4>
										<div className="flex gap-2">
											<button type="button" onClick={() => setLive((v) => !v)} className={`${btn} ring-1 ring-border hover:bg-muted`}>{live ? 'بازگشت به پیش‌نمایش' : 'گفت‌وگوی واقعی'}</button>
											<button type="button" disabled={busy} onClick={selftest} className={`${btn} bg-primary text-primary-foreground hover:bg-hover`}>اجرای بررسی‌ها</button>
										</div>
									</div>
									<p className="mt-1 text-[11px] text-muted-foreground">«گفت‌وگوی واقعی» از همان API عمومیِ سایت پاسخ می‌گیرد (فقط تنظیماتِ ذخیره‌شده). بررسی‌ها: وضعیت، دامنه، جداسازیِ دانشِ داخلی، سقف‌ها و یک پاسخِ AI.</p>
									{checks && (
										<ul className="mt-2 flex flex-col gap-1.5" aria-label="نتیجهٔ بررسی‌ها">
											{checks.map((c) => <li key={c.name} className="flex gap-2 text-[12px]"><span className={c.ok ? 'text-success' : 'text-error'} aria-hidden>{c.ok ? '✓' : '✗'}</span><b className="shrink-0">{c.name}</b><span className="min-w-0 text-muted-foreground">{c.note}</span></li>)}
										</ul>
									)}
								</section>
							</div>
						</div>
					)}
				</>
			)}
		</section>
	)
}
