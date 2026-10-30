/**
 * تنظیمات ← «به‌روزرسانی داشبورد» (3.9.66): بستهٔ aromin-deploy-*.tgz را با همان update_token از همین‌جا بفرستید.
 * مرورگر SHA-256 را حساب و نمایش می‌دهد، بسته را تکه‌تکه به /api/release/chunk می‌فرستد؛ سرور همان SHA-256 و نسخهٔ داخلِ بسته را
 * می‌سنجد و در صف می‌گذارد؛ واچرِ systemd نصب، سلامت‌سنجی و در صورتِ خرابی رول‌بک می‌کند. توکن ذخیره نمی‌شود. فقط مدیر.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'

type Status = { enabled: boolean; watcher: boolean; current: string | null; pending: string[]; last: { state?: string; file?: string; at?: string; msg?: string } }
const CHUNK = 512 * 1024
const STATE_FA: Record<string, string> = { installing: 'در حال نصب…', ok: 'نصب شد و سالم است ✓', rolledback: 'نسخهٔ جدید سالم نبود؛ خودکار برگشت', failed: 'نصب نشد؛ نسخهٔ فعلی دست‌نخورده ماند' }

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
/** Blob → bytes (FileReader fallback where Blob.arrayBuffer is missing) */
export const readBuf = (f: Blob) => (typeof f.arrayBuffer === 'function' ? f.arrayBuffer()
	: new Promise<ArrayBuffer>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f) }))
export const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }

export default function ReleaseCard({ pollMs = 3000 }: { pollMs?: number }) {
	const [st, setSt] = useState<Status | null>(null)
	const [file, setFile] = useState<File | null>(null)
	const [sha, setSha] = useState('')
	const [token, setToken] = useState('')
	const [busy, setBusy] = useState(false)
	const [progress, setProgress] = useState('')
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const waitFor = useRef<string>('')
	const status = useCallback(async () => {
		try {
			const s: Status = await (await fetch('/api/release/status', { cache: 'no-store' })).json()
			setSt(s)
			return s
		} catch { return null }
	}, [])
	useEffect(() => { status() }, [status])
	useEffect(() => {                                          // poll until the watcher reports on the file we queued
		if (!busy || !waitFor.current) return
		const t = setInterval(async () => {
			const s = await status()
			if (s?.last?.file === waitFor.current && s.last.state && s.last.state !== 'installing') {
				setBusy(false); waitFor.current = ''
				setMsg({ ok: s.last.state === 'ok', text: (STATE_FA[s.last.state] || s.last.state) + (s.current ? ' · نسخهٔ فعلی: ' + s.current : '') })
			}
		}, pollMs)
		return () => clearInterval(t)
	}, [busy, status, pollMs, progress])

	const pick = async (f: File | null) => {
		setFile(f); setSha(''); setMsg(null)
		if (!f) return
		if (!/^aromin-deploy-[\d.]+\.tgz$/.test(f.name)) { setMsg({ ok: false, text: 'فقط فایلِ aromin-deploy-X.Y.Z.tgz' }); return }
		setSha(hex(await crypto.subtle.digest('SHA-256', await readBuf(f))))
	}
	const upload = async () => {
		if (!file || !sha || !token.trim()) return
		setBusy(true); setMsg(null)
		try {
			const bytes = new Uint8Array(await readBuf(file))
			const n = Math.max(1, Math.ceil(bytes.length / CHUNK))
			const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
			let last: { ok?: boolean; complete?: boolean; file?: string; version?: string; error?: string; detail?: string } = {}
			for (let i = 0; i < n; i++) {
				setProgress(`ارسالِ تکهٔ ${i + 1} از ${n}`)
				const r = await fetch('/api/release/chunk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-update-token': token.trim() },
					body: JSON.stringify({ id, i, n, data: b64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)), sha256: sha }) })
				last = await r.json().catch(() => ({ ok: false, error: 'http ' + r.status }))
				if (!r.ok || last.ok === false) throw new Error(r.status === 401 ? 'توکنِ به‌روزرسانی نادرست است.' : last.detail || last.error || 'خطا ' + r.status)
			}
			setToken('')                                          // never kept after use
			if (!last.complete || !last.file) throw new Error('بسته کامل نرسید.')
			setProgress(`بستهٔ نسخهٔ ${last.version} در صفِ نصب است…`)
			waitFor.current = last.file
		} catch (e) {
			setBusy(false); setProgress(''); setMsg({ ok: false, text: (e as Error).message })
		}
	}

	return (
		<section dir="rtl" aria-labelledby="rel-title" className={`mb-4 flex flex-col gap-3 ${CARD} ${CARD_PAD}`}>
			<header>
				<h3 id="rel-title" className={CARD_TITLE}>به‌روزرسانی داشبورد</h3>
				<p className={CARD_SUB}>بستهٔ aromin-deploy را انتخاب کنید و توکنِ به‌روزرسانی (کارتِ «نصب ابزارک») را بنویسید. پیش از نصب بکاپ می‌گیرد؛ اگر نسخهٔ جدید سالم بالا نیاید خودکار برمی‌گردد.</p>
			</header>
			{st && <p className="text-[12.5px]">نسخهٔ فعلی: <b dir="ltr">{st.current || '—'}</b>{st.last?.state && <> · آخرین نصب: {STATE_FA[st.last.state] || st.last.state}</>}</p>}
			{st && !st.enabled && <p className="text-[12.5px] text-warning">توکنِ به‌روزرسانی هنوز ساخته نشده (کارتِ «نصب ابزارک» ← تولید).</p>}
			{st && !st.watcher && <p className="text-[12.5px] text-warning">نصبِ خودکار روی سرور راه‌اندازی نشده؛ یک‌بار با root: <code dir="ltr">sudo bash setup-autoupdate.sh</code> (داخلِ پوشهٔ بسته).</p>}
			<input type="file" accept=".tgz" aria-label="بستهٔ به‌روزرسانی" disabled={busy} onChange={(e) => pick(e.target.files?.[0] || null)} className="text-[12.5px]" />
			{sha && <p className="text-[11.5px]">SHA-256: <code dir="ltr" className="break-all" data-testid="sha">{sha}</code> — با عددِ گزارشِ بسته مقایسه کنید.</p>}
			<input type="password" autoComplete="off" aria-label="توکنِ به‌روزرسانی" placeholder="توکنِ به‌روزرسانی" className={`${INPUT} py-2`} value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} />
			<div className="flex flex-wrap items-center gap-2">
				<button type="button" className={BTN_PRIMARY} disabled={busy || !sha || !token.trim() || !st?.watcher} onClick={upload}>ارسال و نصب</button>
				{progress && busy && <span className="text-[12.5px]">{progress}</span>}
				{msg && <span role="status" className={`text-[12.5px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
			</div>
		</section>
	)
}
