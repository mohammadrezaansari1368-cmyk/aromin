/**
 * ذخیرهٔ امنِ پیش‌بینی روی همان بلابِ اپِ کامل (/api/state?tenant=…).
 * قانون‌ها: هر ذخیره روی تازه‌ترین نسخهٔ سرور «خواندن ← فقط کلیدهای پیش‌بینی ← نوشتن» است؛
 * پیش از اولین نوشتن (و پیش از اعمال به تارگت‌ها) بک‌آپ روی سرور گرفته می‌شود و اگر بک‌آپ نشد، چیزی نوشته نمی‌شود؛
 * روی بلابِ خالی/بی‌کارشناس هرگز نوشته نمی‌شود.
 * هم‌زمانی (WP-04): هر GET/POST نسخهٔ سرور (version) را برمی‌گرداند؛ POSTِ بعدی همان نسخه را با
 * If-Match می‌فرستد. اگر سرور ۴۰۹ (conflict) برگرداند یعنی کاربرِ دیگری هم‌زمان ذخیره کرده — بلافاصله
 * خطا پرتاب می‌شود (بدونِ ارسالِ دوبارهٔ بلابِ کهنه) و پیامِ بارگذاری‌دوباره نشان داده می‌شود.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentTenant } from '@/lib/data'
import { activeAuthHeaders, activeManagerSession } from '@/lib/auth'

let version: number | null = null

export async function fetchFull(): Promise<any | null> {
	const r = await fetch(`/api/state?tenant=${encodeURIComponent(currentTenant())}`, { cache: 'no-store', headers: activeAuthHeaders() })
	if (!r.ok) throw new Error('http ' + r.status)
	const d = await r.json()
	if (typeof d?.version === 'number') version = d.version
	return d && d.ok ? d.full : null
}

let conflictShown = false
function showConflictNotice() {
	if (conflictShown || typeof document === 'undefined') return
	conflictShown = true
	const bar = document.createElement('div')
	bar.setAttribute('role', 'alert')
	bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
		'display:flex;gap:12px;align-items:center;padding:10px 16px;border-radius:10px;max-width:92vw;' +
		'background:var(--aromin-blue,#004991);color:#fff;font-weight:700;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.25)'
	const msg = document.createElement('span')
	msg.textContent = 'این داده هم‌زمان توسط کاربر دیگری تغییر کرده است. برای دیدن آخرین نسخه صفحه را دوباره بارگذاری کنید؛ تغییرات ذخیره‌نشدهٔ شما اعمال نشد.'
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.textContent = 'بارگذاری دوباره'
	btn.style.cssText = 'flex:none;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;' +
		'background:var(--aromin-yellow,#FCBF00);color:#1a1a1a'
	btn.onclick = () => location.reload()
	bar.append(msg, btn)
	document.body.appendChild(bar)
}

const valid = (full: any) => !!(full && typeof full === 'object' && Array.isArray(full.people) && full.people.length > 0)

let backedUp = false
let chain: Promise<unknown> = Promise.resolve()

async function backup(full: any, tag: string) {
	const r = await fetch('/api/backup', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...activeAuthHeaders() },
		body: JSON.stringify({ tenant: currentTenant(), tag, payload: JSON.stringify(full) }),
	})
	const d = await r.json().catch(() => null)
	if (!r.ok || !d || !d.ok) throw new Error('backup')
}

/** ذخیرهٔ سریالی: mutator فقط کلیدهای مجاز را روی نسخهٔ تازهٔ سرور تغییر می‌دهد. */
export function saveState(mutator: (full: any) => void, opts: { forceBackup?: boolean; tag?: string } = {}): Promise<void> {
	const run = async () => {
		const full = await fetchFull()
		if (!valid(full)) throw new Error('empty')
		if (activeManagerSession() && (!backedUp || opts.forceBackup)) {
			await backup(full, opts.tag || 'react-forecast')
			backedUp = true
		}
		mutator(full)
		full.ts = Date.now()
		const r = await fetch(`/api/state?tenant=${encodeURIComponent(currentTenant())}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json', ...activeAuthHeaders(),
				...(version != null ? { 'If-Match': String(version) } : {}),
			},
			body: JSON.stringify(full),
		})
		const d = await r.json().catch(() => null)
		if (r.status === 409 && d && d.conflict) {
			showConflictNotice()
			throw new Error('conflict')
		}
		if (!r.ok || !d || !d.ok) throw new Error('save')
		if (typeof d.version === 'number') version = d.version
	}
	const p = chain.then(run, run)
	chain = p.catch(() => undefined)
	return p
}
