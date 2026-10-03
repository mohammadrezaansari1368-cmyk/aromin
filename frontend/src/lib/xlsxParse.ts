/** خواندنِ اکسل در Web Worker (در صورتِ خطا روی نخِ اصلی) — خروجی: ردیف‌های شیتِ اول، همهٔ شیت‌ها (aoa)، نوعِ فایل */
import type { Detected } from '@/lib/importTypes'

export interface Parsed { rows: Record<string, unknown>[]; sheets: { name: string; aoa: unknown[][] }[]; det: Detected }

async function onMain(buf: ArrayBuffer): Promise<Parsed> {
	const XLSX = await import('xlsx')
	const { detectImportType } = await import('@/lib/importTypes')
	const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
	return {
		rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }),
		sheets: wb.SheetNames.map((name) => ({ name, aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as unknown[][] })),
		det: detectImportType(wb),
	}
}

export function parseXlsx(buf: ArrayBuffer): Promise<Parsed> {
	if (typeof Worker === 'undefined') return onMain(buf)
	return new Promise((resolve, reject) => {
		let done = false
		let w: Worker
		try { w = new Worker(new URL('./xlsxParse.worker.ts', import.meta.url), { type: 'module' }) } catch { onMain(buf).then(resolve, reject); return }
		const end = () => { done = true; clearTimeout(to); w.terminate() }
		const fallback = () => { if (done) return; end(); onMain(buf).then(resolve, reject) }
		const to = setTimeout(fallback, 60000)
		w.onmessage = (ev) => { if (done) return; if (ev.data?.ok) { end(); resolve(ev.data as Parsed) } else fallback() }
		w.onerror = (ev) => { ev.preventDefault(); fallback() }
		w.postMessage(buf.slice(0))
	})
}
