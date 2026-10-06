/// <reference lib="webworker" />
// تجزیهٔ اکسل در پس‌زمینه (نخِ اصلی و بقیهٔ داشبورد قفل نمی‌شود)
import * as XLSX from 'xlsx'
import { detectImportType } from '@/lib/importTypes'

self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
	try {
		const wb = XLSX.read(new Uint8Array(e.data), { type: 'array' })
		const det = detectImportType(wb)
		const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
		const sheets = wb.SheetNames.map((name) => ({ name, aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as unknown[][] }))
		;(self as unknown as Worker).postMessage({ ok: true, rows, sheets, det, date1904: !!wb.Workbook?.WBProps?.date1904 })
	} catch (err) {
		;(self as unknown as Worker).postMessage({ ok: false, err: String((err as Error)?.message || err) })
	}
}
