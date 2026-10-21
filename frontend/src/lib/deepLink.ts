/**
 * لینکِ مستقیم از پیامِ تلگرام/بله: /?panel=p-leads&lead=<id> → تبِ «گزارش» (جای جدولِ لیدها) با ردیفِ همان لید.
 * فقط پس از ورود خوانده می‌شود (AppShell پشتِ LoginPage است) و یک‌بار مصرف می‌شود؛ پارامترها از نوارِ نشانی پاک می‌شوند.
 */
const PANEL_ALIASES: Record<string, string> = { 'p-leads': 'p-report' }

export type DeepLink = { tab: string | null; lead: number | null }

export function parseDeepLink(search: string): DeepLink {
	const qs = new URLSearchParams(search)
	const raw = (qs.get('panel') || '').trim()
	const tab = /^[a-z0-9-]{1,40}$/i.test(raw) ? PANEL_ALIASES[raw] ?? raw : null
	const n = Number(qs.get('lead'))
	return { tab, lead: Number.isSafeInteger(n) && n > 0 ? n : null }
}

let pending: DeepLink | null = null

/** یک‌بار در شروعِ AppShell: لینک را برمی‌دارد و پارامترهای panel/lead را از نشانی حذف می‌کند. */
export function takeDeepLink(): DeepLink {
	if (pending) return pending
	pending = parseDeepLink(location.search)
	if (pending.tab || pending.lead) {
		const qs = new URLSearchParams(location.search)
		qs.delete('panel'); qs.delete('lead')
		const rest = qs.toString()
		try { history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash) } catch { /* بی‌اهمیت */ }
	}
	return pending
}

/** شناسهٔ لیدی که باید در جدول برجسته شود (اگر از لینک آمده باشد). */
export const deepLinkLead = () => pending?.lead ?? null
