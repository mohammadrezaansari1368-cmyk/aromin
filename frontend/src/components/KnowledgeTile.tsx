'use client'

/**
 * Import → Dynamic Knowledge Base — کاشیِ مستقلِ پایگاه دانشِ دستیار (فقط مدیر).
 * فایل‌ها در فضای ابریِ آروان (S3) و جدا برای هر کسب‌وکار ذخیره می‌شوند؛ دسترسی و کلیدها فقط سمتِ سرور.
 * دانش به دستیارِ پاپ‌آپ و تحلیلِ پیش‌بینیِ همین کسب‌وکار پیوست می‌شود. PDF در مرورگر به متن تبدیل می‌شود (مثلِ قبل)،
 * بقیهٔ قالب‌ها را خودِ سرور می‌خواند.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders, isAdmin, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_TITLE } from '@/components/ui/tokens'

interface KbItem { id: string; filename: string; contentType: string; size: number; createdAt: string; updatedAt: string; status: 'ready' | 'no-text' | string; chars: number; source: string; internal?: boolean }
const EXT = ['.txt', '.md', '.json', '.html', '.csv', '.pdf', '.docx']
const MAX = 10 * 1024 * 1024
const faNum = (n: number) => n.toLocaleString('fa-IR')
const kb = (n: number) => (n >= 1048576 ? faNum(Math.round(n / 104857.6) / 10) + ' MB' : n >= 1024 ? faNum(Math.round(n / 1024)) + ' KB' : faNum(n) + ' B')
const when = (iso: string) => { try { return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) } catch { return '—' } }
const extOf = (n: string) => (n.toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0]
const TYPE: Record<string, string> = { '.txt': 'متن', '.md': 'Markdown', '.json': 'JSON', '.html': 'HTML', '.htm': 'HTML', '.csv': 'CSV', '.pdf': 'PDF', '.docx': 'Word' }

function b64(buf: ArrayBuffer) {
	const bytes = new Uint8Array(buf)
	let s = ''
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	return btoa(s)
}
/** همان کتابخانه و CDNِ استخراجِ PDF که بخشِ قبلی استفاده می‌کرد */
let pdfjs: Promise<any> | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
function loadPdfJs() {
	const w = window as unknown as { pdfjsLib?: any } // eslint-disable-line @typescript-eslint/no-explicit-any
	if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib)
	pdfjs ??= new Promise((res, rej) => {
		const s = document.createElement('script')
		s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
		s.onload = () => { try { w.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' } catch { /* */ } res(w.pdfjsLib) }
		s.onerror = () => { pdfjs = null; rej(new Error('بارگذاریِ خوانندهٔ PDF ناموفق بود (اینترنت؟)')) }
		document.head.appendChild(s)
	})
	return pdfjs
}
async function pdfText(buf: ArrayBuffer) {
	const lib = await loadPdfJs()
	const pdf = await lib.getDocument({ data: buf.slice(0) }).promise
	const pages: string[] = []
	for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items.map((it: { str: string }) => it.str).join(' '))
	return pages.join('\n\n')
}

export default function KnowledgeTile({ session }: { session: Session }) {
	const admin = isAdmin(session.role)
	const [items, setItems] = useState<KbItem[] | null>(null)
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null)
	const input = useRef<HTMLInputElement>(null)
	const api = useCallback(async (method: string, path = '', body?: unknown) => {
		const r = await fetch(`/api/knowledge${path}?tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const d = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر از سرور' }))
		if (!r.ok || !d.ok) throw new Error(r.status === 403 ? 'فقط مدیر به پایگاه دانش دسترسی دارد.' : r.status === 401 ? 'ورود معتبر نیست؛ دوباره وارد شوید.' : (d.error || 'خطا ' + r.status) + (r.status >= 500 ? ' — «تنظیمات ← اتصالِ فضای ابری» را بررسی و آزمون کنید.' : ''))
		return d
	}, [session])
	const refresh = useCallback(async () => {
		setBusy(true)
		try { const d = await api('GET'); if (!Array.isArray(d.items)) throw new Error('پاسخِ نامعتبر از سرور'); setItems(d.items); setMsg((m) => (m?.tone === 'err' ? null : m)) } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }) } finally { setBusy(false) }
	}, [api])
	useEffect(() => { if (admin) refresh() }, [admin, refresh])
	if (!admin) return null

	const upload = async (files: FileList | null) => {
		if (!files?.length) return
		setBusy(true)
		let ok = 0
		const errs: string[] = []
		for (const f of Array.from(files)) {
			const ext = extOf(f.name)
			if (!EXT.includes(ext)) { errs.push(`«${f.name}»: فرمت پشتیبانی نمی‌شود`); continue }
			if (f.size > MAX) { errs.push(`«${f.name}»: بیشتر از ۱۰ مگابایت`); continue }
			try {
				setMsg({ tone: 'info', text: `در حال بارگذاریِ «${f.name}»…` })
				const buf = await f.arrayBuffer()
				const text = ext === '.pdf' ? await pdfText(buf).catch(() => '') : undefined
				await api('POST', '', { id: crypto.randomUUID(), filename: f.name, contentType: f.type, data: b64(buf), text })
				ok++
			} catch (e) { errs.push(`«${f.name}»: ${(e as Error).message}`) }
		}
		if (input.current) input.current.value = ''
		setMsg(errs.length ? { tone: 'err', text: (ok ? `${faNum(ok)} فایل ذخیره شد. ` : '') + errs.join(' · ') } : { tone: 'ok', text: `${faNum(ok)} فایل به پایگاه دانش اضافه شد و از این پس به پاسخ‌های دستیار پیوست می‌شود.` })
		await refresh()
	}
	const remove = async (it: KbItem) => {
		if (!confirm(`«${it.filename}» از پایگاه دانش حذف شود؟`)) return
		setBusy(true)
		try { await api('DELETE', '/' + it.id); setMsg({ tone: 'ok', text: `«${it.filename}» حذف شد.` }); await refresh() } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }); setBusy(false) }
	}
	// «فقط داخلی»: فقط برای دستیارِ داشبورد؛ هرگز وارد زمینهٔ ابزارکِ سایت نمی‌شود
	const setInternal = async (it: KbItem, internal: boolean) => {
		setBusy(true)
		try { await api('PATCH', '/' + it.id, { internal }); setMsg({ tone: 'ok', text: `«${it.filename}» ${internal ? 'فقط داخلی شد (برای سایت استفاده نمی‌شود).' : 'برای ابزارکِ سایت هم قابلِ استفاده شد.'}` }); await refresh() } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }); setBusy(false) }
	}

	return (
		<section dir="rtl" aria-labelledby="kb-title" className={`@container flex h-full flex-col gap-4 ${CARD_PAD}`}>
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 id="kb-title" className={CARD_TITLE}>پایگاه دانشِ پویا</h3>
					<p className="mt-1 max-w-[70ch] text-[12px] leading-6 text-muted-foreground">دانشِ اختصاصیِ همین کسب‌وکار برای دستیارِ هوشمند (پاپ‌آپ و تحلیلِ پیش‌بینی). فقط مدیر · جدا برای هر کسب‌وکار · ذخیره در فضای ابری.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={() => input.current?.click()} disabled={busy}
						className={BTN_PRIMARY}>افزودن دانش</button>
					<button type="button" onClick={refresh} disabled={busy}
						className={BTN_GHOST}>تازه‌سازی</button>
					<input ref={input} type="file" multiple accept={EXT.join(',')} className="sr-only" aria-label="انتخابِ فایلِ دانش" onChange={(e) => upload(e.target.files)} />
				</div>
			</header>
			<p className="text-[11px] text-muted-foreground" dir="rtl">قالب‌ها: <span dir="ltr">txt · md · json · html · csv · pdf · docx</span> — حداکثر ۱۰ مگابایت برای هر فایل</p>
			{msg && <p role="status" className={`rounded-md px-3 py-2 text-[12px] font-bold ring-1 ${msg.tone === 'ok' ? 'bg-success/10 text-success ring-success/30' : msg.tone === 'err' ? 'bg-error/10 text-error ring-error/30' : 'bg-muted text-foreground ring-border'}`}>{msg.text}</p>}
			{items === null ? (
				<div className="h-24 animate-pulse rounded-md bg-muted/50" aria-busy="true" />
			) : !items.length ? (
				<p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">هنوز دانشی اضافه نشده است.</p>
			) : (
				<div className="overflow-x-auto rounded-md ring-1 ring-border">
					<table className="w-full border-collapse text-[12.5px]">
						<thead><tr className="bg-muted/60 text-right text-[11.5px] text-muted-foreground">{['نام فایل', 'نوع', 'حجم', 'تاریخ', 'وضعیت', 'فقط داخلی', ''].map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 font-bold">{h}</th>)}</tr></thead>
						<tbody>
							{items.map((it) => (
								<tr key={it.id} className="border-t border-border/80 hover:bg-muted/40">
									<td className="max-w-[260px] truncate px-3 py-2 font-bold" title={it.filename}><bdi>{it.filename}</bdi>{it.source === 'migrated' && <span className="mr-2 rounded-full bg-secondary/12 px-2 py-0.5 text-[10.5px] font-bold text-secondary-ink">منتقل‌شده از تنظیمات</span>}</td>
									<td className="whitespace-nowrap px-3 py-2">{TYPE[extOf(it.filename)] || it.contentType}</td>
									<td className="whitespace-nowrap px-3 py-2 tabular-nums"><bdi>{kb(it.size)}</bdi></td>
									<td className="whitespace-nowrap px-3 py-2 tabular-nums">{when(it.createdAt)}</td>
									<td className="whitespace-nowrap px-3 py-2">{it.status === 'ready' ? <span className="font-bold text-success">آماده · {faNum(it.chars)} نویسه</span> : <span className="font-bold text-warning" title="متنی از این فایل استخراج نشد (شاید PDF تصویری باشد)">بدون متن</span>}</td>
									<td className="whitespace-nowrap px-3 py-2"><label className="inline-flex cursor-pointer items-center gap-1.5" title="فقط دستیارِ داشبورد؛ هرگز در ابزارکِ سایت"><input type="checkbox" checked={!!it.internal} disabled={busy} onChange={(e) => setInternal(it, e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" aria-label={'فقط داخلی: ' + it.filename} /><span className="text-[11.5px] text-muted-foreground">{it.internal ? 'داخلی' : 'سایت هم'}</span></label></td>
									<td className="whitespace-nowrap px-3 py-2 text-left"><button type="button" disabled={busy} onClick={() => remove(it)} aria-label={'حذفِ ' + it.filename} className="rounded-lg px-2 py-1 text-[12px] font-bold text-error hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 disabled:opacity-50">حذف</button></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}

/* ---------------- تنظیمات → اتصال فضای ابری (پایگاه دانش) — فقط مدیر ---------------- */
interface KbCfg { endpoint: string; region: string; bucket: string; source: Record<'endpoint' | 'region' | 'bucket', 'settings' | 'env' | 'default'>; defaults: { endpoint: string; region: string; bucket: string }; keysConfigured: boolean; keysSource: 'settings' | 'env' | 'none'; accessHint: string }
const SRC_FA = { settings: 'از همین تنظیمات', env: 'از فایلِ سرور', default: 'پیش‌فرض' } as const
/** توضیحِ ساده برای کدهای رایجِ خطای S3 */
function explain(err: string) {
	if (/SignatureDoesNotMatch/.test(err)) return 'امضا رد شد: «منطقه» یا کلیدِ مخفی (Secret Key) درست نیست. منطقه‌های دیگر را امتحان کنید (مثلاً ir-thr-at1 یا default).'
	if (/InvalidAccessKeyId/.test(err)) return 'کلیدِ دسترسی (Access Key) در آروان شناخته نشد؛ همین‌جا دوباره وارد کنید.'
	if (/NoSuchBucket/.test(err)) return 'باکتی با این نام در این نشانی نیست؛ نامِ باکت یا نشانیِ سرور را بررسی کنید.'
	if (/AccessDenied/.test(err)) return 'کلید معتبر است ولی اجازهٔ نوشتن در این باکت را ندارد؛ دسترسیِ کلید را در پنلِ آروان بدهید.'
	if (/RequestTimeTooSkewed/.test(err)) return 'ساعتِ سرور با آروان هماهنگ نیست؛ ساعتِ سرور را تنظیم کنید.'
	if (/در دسترس نیست|network/i.test(err)) return 'سرور به این نشانی وصل نشد؛ نشانی (endpoint) را بررسی کنید.'
	if (/کلید/.test(err)) return 'Access Key و Secret Key را در همین کارت وارد و «ذخیرهٔ کلیدها» را بزنید.'
	return ''
}
export function KbConnectionCard({ session }: { session: Session }) {
	const admin = isAdmin(session.role)
	const [cfg, setCfg] = useState<KbCfg | null>(null)
	const [form, setForm] = useState({ endpoint: '', region: '', bucket: '' })
	const [busy, setBusy] = useState(false)
	const [res, setRes] = useState<{ ok: boolean; text: string; hint?: string } | null>(null)
	// فقط‌نوشتنی: مقدارها پس از ذخیره از حافظهٔ صفحه پاک می‌شوند و هرگز از سرور خوانده نمی‌شوند
	const [keys, setKeys] = useState({ accessKey: '', secretKey: '' })
	const call = useCallback(async (method: string, path: string, body?: unknown) => {
		const r = await fetch(`/api/knowledge${path}?tenant=${encodeURIComponent(currentTenant())}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
		const d = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر از سرور (' + r.status + ')' }))
		if (r.status === 401 || r.status === 403) throw new Error(r.status === 403 ? 'فقط مدیر.' : 'ورود معتبر نیست؛ دوباره وارد شوید.')
		return d
	}, [session])
	const load = useCallback(async () => {
		try {
			const d = await call('GET', '/config')
			if (!d.ok) { setRes({ ok: false, text: d.error || 'خواندنِ تنظیمات ناموفق بود.' }); return }
			const c = d.config as KbCfg
			setCfg(c)
			setForm({ endpoint: c.source.endpoint === 'settings' ? c.endpoint : '', region: c.source.region === 'settings' ? c.region : '', bucket: c.source.bucket === 'settings' ? c.bucket : '' })
		} catch (e) { setRes({ ok: false, text: (e as Error).message }) }
	}, [call])
	useEffect(() => { if (admin) load() }, [admin, load])
	if (!admin) return null
	const test = async () => {
		setBusy(true)
		setRes({ ok: true, text: 'در حال آزمونِ اتصال…' })
		try {
			const d = await call('POST', '/test')
			if (d.config) setCfg(d.config)
			if (d.ok) setRes({ ok: true, text: `اتصال برقرار است — نوشتن و حذف در «${d.config.bucket}» (${d.config.region}) موفق بود.` })
			else setRes({ ok: false, text: d.error || 'آزمون ناموفق بود.', hint: explain(String(d.error || '') + ' ' + String(d.step || '')) })
		} catch (e) { setRes({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
	}
	const save = async (thenTest: boolean) => {
		setBusy(true)
		let ok = false
		try {
			const d = await call('POST', '/config', form)
			if (!d.ok) setRes({ ok: false, text: d.error || 'ذخیره نشد.' })
			else { setCfg(d.config); setRes({ ok: true, text: 'تنظیمات ذخیره شد.' }); ok = true }
		} catch (e) { setRes({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
		if (ok && thenTest) await test()
	}
	const saveKeys = async () => {
		if (!keys.accessKey.trim() || !keys.secretKey.trim()) { setRes({ ok: false, text: 'هر دو کلید را وارد کنید.' }); return }
		setBusy(true)
		let ok = false
		try {
			const d = await call('POST', '/credentials', keys)
			if (!d.ok) setRes({ ok: false, text: d.error || 'کلیدها ذخیره نشد.' })
			else { setCfg(d.config); ok = true; setRes({ ok: true, text: 'کلیدها روی سرور ذخیره شد.' }) }
		} catch (e) { setRes({ ok: false, text: (e as Error).message }) } finally { setKeys({ accessKey: '', secretKey: '' }); setBusy(false) }
		if (ok) await test()
	}
	const clearKeys = async () => {
		if (!confirm('کلیدهای ذخیره‌شده در تنظیمات پاک شوند؟')) return
		setBusy(true)
		try { const d = await call('DELETE', '/credentials'); if (d.ok) { setCfg(d.config); setRes({ ok: true, text: 'کلیدهای تنظیمات پاک شد' + (d.config.keysSource === 'env' ? '؛ اکنون کلیدهای فایلِ سرور استفاده می‌شوند.' : '.') }) } else setRes({ ok: false, text: d.error || 'پاک نشد.' }) }
		catch (e) { setRes({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
	}
	const keyInput = (k: 'accessKey' | 'secretKey', label: string) => (
		<label className="flex min-w-0 flex-col gap-1">
			<span className="text-[11.5px] font-bold text-muted-foreground">{label}</span>
			<input type="password" dir="ltr" value={keys[k]} onChange={(e) => setKeys({ ...keys, [k]: e.target.value })} autoComplete="new-password" spellCheck={false} aria-label={label}
				placeholder={cfg?.keysConfigured ? 'برای تغییر، مقدارِ تازه را وارد کنید' : ''}
				className="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-[12.5px] text-foreground outline-none transition placeholder:font-sans placeholder:text-muted-foreground/80 hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/12 [&:placeholder-shown]:[direction:rtl]" />
		</label>
	)
	const field = (k: 'endpoint' | 'region' | 'bucket', label: string, ph: string) => (
		<label className="flex min-w-0 flex-col gap-1">
			<span className="flex flex-wrap items-center justify-between gap-x-2 text-[11.5px] font-bold text-muted-foreground">{label}{cfg && <span className="font-normal">مؤثر: <bdi dir="ltr">{cfg[k]}</bdi> · {SRC_FA[cfg.source[k]]}</span>}</span>
			<input dir="ltr" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph} spellCheck={false} autoComplete="off" aria-label={label}
				className="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-[12.5px] text-foreground outline-none transition hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/12" />
		</label>
	)
	return (
		<section dir="rtl" aria-labelledby="kbc-title" className={`@container mb-4 ${CARD} ${CARD_PAD}`}>
			<header className="mb-4">
				<h3 id="kbc-title" className={CARD_TITLE}>اتصالِ فضای ابری (پایگاه دانش)</h3>
				<p className="mt-1 max-w-[80ch] text-[12.5px] leading-6 text-muted-foreground">نشانیِ سرورِ Object Storage آروان، منطقه، نامِ باکت و دو کلید را وارد کنید؛ خالی = مقدارِ فایلِ سرور یا پیش‌فرض. کلیدها فقط‌نوشتنی‌اند: روی سرور در فایلِ خصوصی ذخیره می‌شوند و دیگر نمایش داده نمی‌شوند.</p>
			</header>
			<div className="grid gap-3 @2xl:grid-cols-3">
				{field('endpoint', 'نشانیِ سرور (Endpoint)', cfg?.defaults.endpoint || 'https://s3.ir-thr-at1.arvanstorage.ir')}
				{field('region', 'منطقه (Region)', cfg?.defaults.region || 'ir-central1')}
				{field('bucket', 'نامِ باکت (Bucket)', cfg?.defaults.bucket || 'kb-dynamic')}
			</div>
			<div className="mt-4 rounded-md bg-muted/40 p-4 ring-1 ring-border/70">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
					<p className="text-[12.5px] font-extrabold">کلیدهای دسترسی (Access / Secret)</p>
					<p className="text-[12px]">وضعیت: {cfg ? (cfg.keysConfigured ? <b className="text-success">تنظیم شده ✓ <span className="font-normal text-muted-foreground">({cfg.keysSource === 'settings' ? 'از همین تنظیمات' : 'از فایلِ سرور'} · <bdi dir="ltr">{cfg.accessHint}</bdi>)</span></b> : <b className="text-error">تنظیم نشده ✗</b>) : '…'}</p>
				</div>
				<form className="grid gap-3 @2xl:grid-cols-[1fr_1fr_auto] @2xl:items-end" onSubmit={(e) => { e.preventDefault(); saveKeys() }} autoComplete="off">
					{keyInput('accessKey', 'Access Key')}
					{keyInput('secretKey', 'Secret Key')}
					<div className="flex gap-2">
						<button type="submit" disabled={busy} className={`${BTN_PRIMARY} min-h-10 text-[13px]`}>ذخیرهٔ کلیدها</button>
						{cfg?.keysSource === 'settings' && <button type="button" disabled={busy} onClick={clearKeys} className={`${BTN_DANGER} min-h-10 px-3`}>پاک کردن</button>}
					</div>
				</form>
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<button type="button" disabled={busy} onClick={() => save(true)} className={`${BTN_PRIMARY} min-h-10 text-[13px]`}>ذخیره و آزمونِ اتصال</button>
				<button type="button" disabled={busy} onClick={test} className={`${BTN_GHOST} min-h-10 text-[13px]`}>فقط آزمونِ اتصال</button>
			</div>
			{res && (
				<div role="status" className={`mt-4 rounded-md px-4 py-3 text-[12.5px] ring-1 ${res.ok ? 'bg-success/10 text-success ring-success/30' : 'bg-error/10 text-error ring-error/30'}`}>
					<p className="font-bold"><bdi>{res.text}</bdi></p>
					{res.hint && <p className="mt-1 text-foreground">{res.hint}</p>}
				</div>
			)}
		</section>
	)
}
