/** تاریخِ شمسی — همان الگوریتمِ jToGِ اپِ کامل و server.py (_j2g) تا اعتبارسنجیِ دو طرف یکی باشد */
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
export function j2g(jy: number, jm: number, jd: number): [number, number, number] {
	let gy = jy <= 979 ? 621 : 1600
	const jyy = jy <= 979 ? jy : jy - 979
	let days = 365 * jyy + Math.floor(jyy / 33) * 8 + Math.floor(((jyy % 33) + 3) / 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
	gy += 400 * Math.floor(days / 146097); days %= 146097
	if (days > 36524) { days--; gy += 100 * Math.floor(days / 36524); days %= 36524; if (days >= 365) days++ }
	gy += 4 * Math.floor(days / 1461); days %= 1461
	if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
	const sal = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
	let gm = 1
	while (gm <= 12 && days >= sal[gm]) { days -= sal[gm]; gm++ }
	return [gy, gm, days + 1]
}
const p2 = (n: number) => String(n).padStart(2, '0')
/** «۱۴۰۵/۰۷/۰۹» → { j: '1405/07/09', iso: '2026-10-01' } یا null */
export function parseJ(v: string): { j: string; iso: string } | null {
	const m = latin(String(v || '')).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
	if (!m) return null
	const y = +m[1], mo = +m[2], d = +m[3]
	if (!(y >= 1300 && y <= 1500 && mo >= 1 && mo <= 12 && d >= 1 && d <= (mo <= 6 ? 31 : 30))) return null
	if (mo === 12 && d === 30 && j2g(y, 12, 30).join() === j2g(y + 1, 1, 1).join()) return null
	const g = j2g(y, mo, d)
	return { j: `${y}/${p2(mo)}/${p2(d)}`, iso: `${g[0]}-${p2(g[1])}-${p2(g[2])}` }
}
/** امروز به شمسی (YYYY/MM/DD با ارقامِ لاتین) */
export function todayJ(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
	const g = (t: string) => (parts.find((p) => p.type === t)?.value || '').replace(/\D/g, '')
	return `${g('year')}/${g('month')}/${g('day')}`
}
