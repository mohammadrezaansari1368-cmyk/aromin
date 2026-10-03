/**
 * ذخیرهٔ امنِ پیش‌بینی روی همان بلابِ اپِ کامل (/api/state?tenant=…).
 * قانون‌ها: هر ذخیره روی تازه‌ترین نسخهٔ سرور «خواندن ← فقط کلیدهای پیش‌بینی ← نوشتن» است؛
 * پیش از اولین نوشتن (و پیش از اعمال به تارگت‌ها) بک‌آپ روی سرور گرفته می‌شود و اگر بک‌آپ نشد، چیزی نوشته نمی‌شود؛
 * روی بلابِ خالی/بی‌کارشناس هرگز نوشته نمی‌شود.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentTenant } from '@/lib/data'

export async function fetchFull(): Promise<any | null> {
	const r = await fetch(`/api/state?tenant=${encodeURIComponent(currentTenant())}`, { cache: 'no-store' })
	if (!r.ok) throw new Error('http ' + r.status)
	const d = await r.json()
	return d && d.ok ? d.full : null
}

const valid = (full: any) => !!(full && typeof full === 'object' && Array.isArray(full.people) && full.people.length > 0)

let backedUp = false
let chain: Promise<unknown> = Promise.resolve()

async function backup(full: any, tag: string) {
	const r = await fetch('/api/backup', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
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
		if (!backedUp || opts.forceBackup) {
			await backup(full, opts.tag || 'react-forecast')
			backedUp = true
		}
		mutator(full)
		full.ts = Date.now()
		const r = await fetch(`/api/state?tenant=${encodeURIComponent(currentTenant())}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(full),
		})
		const d = await r.json().catch(() => null)
		if (!r.ok || !d || !d.ok) throw new Error('save')
	}
	const p = chain.then(run, run)
	chain = p.catch(() => undefined)
	return p
}
