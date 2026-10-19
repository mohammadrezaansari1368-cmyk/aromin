/**
 * فقط برای آزمون: سرورِ ساختگیِ /api/performance/attendance* و /api/identity* (همان شکلِ پاسخِ deployment/server.py)
 * با fetchِ جایگزین. پارسِ ساده: شیتِ بدونِ تاریخ یا بدونِ «شماره کارت» ← skipped.
 */
import type { AttendanceBatch, Mapping, ServerAttendance } from './attendanceApi'

type Row = Record<string, unknown>
interface Call { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> | null }
const hdr = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
const col = (r: Row, name: string) => Object.entries(r).find(([k]) => hdr(k) === name)?.[1]
const dateOf = (r: Row) => { const m = String(col(r, 'تاریخ') ?? '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); return m ? m[1] + '/' + m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') : '' }
const cardOf = (r: Row) => { const v = col(r, 'شماره کارت'); const m = String(v ?? '').trim().match(/^(\d+)(?:\.0+)?$/); return m ? m[1].replace(/^0+(?=\d)/, '') : '' }

export function fakeAttendanceServer(people: { id: string; name: string; inactive?: boolean }[] = []) {
	const st = {
		batches: [] as AttendanceBatch[],
		cards: new Map<string, { sheetName: string; rawName: string; rows: Map<string, { row: Row; batch: number }> }>(),
		overrides: new Map<string, Record<string, Record<string, unknown>>>(),
		aliases: new Map<string, { status: Mapping | 'rejected'; personId: string | null; reasons?: string[] }>(),
		settings: null as Record<string, unknown> | null,
		calls: [] as Call[],
		/** «METHOD /path» → وضعیتِ خطا */
		fail: {} as Record<string, number>,
		people,
	}
	const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
	const err = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { ok: false, error, ...extra })
	let nextId = 1
	const handle = (c: Call): Response => {
		const route = c.method + ' ' + c.path, b = c.body || {}
		if (st.fail[route]) return err(st.fail[route], 'خطای ساختگی')
		if (route === 'POST /api/performance/attendance') {
			const sheets = b.sheets as Record<string, Row[]>
			const sheetCards: Record<string, string> = {}, skipped: { sheet: string; reason: string }[] = [], parsed: { name: string; card: string; raw: string; days: [string, Row][] }[] = []
			for (const [name, rows] of Object.entries(sheets)) {
				const days = rows.map((r) => [dateOf(r), r] as [string, Row]).filter(([d]) => d)
				const cards = new Set(days.map(([, r]) => cardOf(r)).filter(Boolean))
				if (!days.length) { skipped.push({ sheet: name, reason: 'بدون ستون تاریخ' }); continue }
				if (cards.size !== 1) { skipped.push({ sheet: name, reason: cards.size ? 'چند شماره کارت در یک شیت' : 'بدون شماره کارت' }); continue }
				const card = [...cards][0], f = days[0][1]
				sheetCards[name] = card
				parsed.push({ name, card, raw: (String(col(f, 'نام') ?? '') + ' ' + String(col(f, 'نام خانوادگی') ?? '')).trim() || name, days })
			}
			const old = st.batches.find((x) => x.sha256 === b.sha256)
			if (old) return json(200, { ok: true, duplicate: true, batch: old, sheetCards })
			if (!parsed.length) return err(400, 'هیچ شیتِ معتبری (تاریخ + شماره کارت) در فایل نیست.', { skipped })
			const id = nextId++
			let inserted = 0, updated = 0, unchanged = 0, all: string[] = []
			for (const p of parsed) {
				const c = st.cards.get(p.card) || { sheetName: p.name, rawName: p.raw, rows: new Map() }
				c.sheetName = p.name; c.rawName = p.raw
				for (const [d, r] of p.days) {
					const ex = c.rows.get(d)
					if (!ex) inserted++; else if (JSON.stringify(ex.row) !== JSON.stringify(r)) updated++; else { unchanged++; continue }
					c.rows.set(d, { row: r, batch: id })
				}
				all = all.concat(p.days.map(([d]) => d))
				st.cards.set(p.card, c)
				if (!st.aliases.has(p.card)) st.aliases.set(p.card, { status: 'review', personId: null })
			}
			all.sort()
			const batch: AttendanceBatch = {
				id, fileName: String(b.fileName), sha256: String(b.sha256), source: b.source as AttendanceBatch['source'], uploadedBy: 'مدیر', createdAt: '2026-10-11T09:00:00',
				periodFrom: all[0], periodTo: all[all.length - 1], sheets: parsed.length, days: all.length, inserted, updated, unchanged, skipped,
			}
			st.batches.unshift(batch)
			const unmapped = parsed.filter((p) => st.aliases.get(p.card)?.status !== 'confirmed').map((p) => ({ cardNo: p.card, sheetName: p.name, rawName: p.raw, status: st.aliases.get(p.card)!.status }))
			return json(201, { ok: true, duplicate: false, batch, skipped, unmapped, sheetCards })
		}
		if (route === 'GET /api/performance/attendance') {
			const byId = new Map(st.people.map((p) => [p.id, p]))
			const out: ServerAttendance = {
				ok: true, scope: 'organization', settings: { ...st.settings }, settingsStored: !!st.settings, batches: st.batches,
				period: { from: null, to: null }, updatedAt: null,
				cards: [...st.cards.entries()].map(([no, c]) => {
					const a = st.aliases.get(no)
					const mapping = (a && a.status !== 'rejected' ? a.status : 'none') as Mapping
					const pid = mapping === 'confirmed' || mapping === 'suggested' ? a!.personId : null
					return {
						cardNo: no, sheetName: c.sheetName, rawName: c.rawName, personId: pid, personName: pid ? byId.get(pid)?.name || null : null, mapping,
						rows: [...c.rows.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([, v]) => v.row), overrides: { ...st.overrides.get(no) },
					}
				}),
			}
			return json(200, out)
		}
		if (route === 'DELETE /api/performance/attendance') {
			const batch = c.query.get('batch')
			if (!batch && c.query.get('all') !== '1') return err(400, 'batch یا all=1 لازم است.')
			let removedDays = 0, removedOverrides = 0
			for (const [no, card] of st.cards) {
				for (const [d, v] of card.rows) if (!batch || String(v.batch) === batch) { card.rows.delete(d); removedDays++ }
				if (!card.rows.size) st.cards.delete(no)
			}
			const before = st.batches.length
			st.batches = batch ? st.batches.filter((x) => String(x.id) !== batch) : []
			if (!batch && c.query.get('overrides') === '1') { for (const v of st.overrides.values()) removedOverrides += Object.keys(v).length; st.overrides.clear() }
			return json(200, { ok: true, removedDays, removedBatches: before - st.batches.length, removedOverrides })
		}
		const putOv = (card: string, date: string, fields: Record<string, unknown> | null, ifAbsent: boolean) => {
			const m = st.overrides.get(card) || {}
			if (ifAbsent && m[date]) return 'skipped'
			if (fields) m[date] = fields; else delete m[date]
			st.overrides.set(card, m)
			return 'written'
		}
		if (route === 'PUT /api/performance/attendance/overrides') {
			const r = putOv(String(b.cardNo), String(b.date), (b.fields as Record<string, unknown>) || null, b.ifAbsent === true)
			return json(200, r === 'skipped' ? { ok: true, skipped: true } : { ok: true, override: b.fields || null })
		}
		if (route === 'PUT /api/performance/attendance/overrides/batch') {
			const n = { written: 0, skipped: 0 }
			for (const i of b.items as { cardNo: string; date: string; fields: Record<string, unknown> }[]) n[putOv(i.cardNo, i.date, i.fields, b.ifAbsent !== false)]++
			return json(200, { ok: true, ...n })
		}
		if (route === 'PUT /api/performance/attendance/settings') { st.settings = b.settings as Record<string, unknown>; return json(200, { ok: true, settings: st.settings }) }
		if (route === 'GET /api/identity') {
			const aliases = [...st.aliases.entries()].map(([key, a], i) => ({ id: i + 1, kind: 'card', key, raw: st.cards.get(key)?.rawName || key, source: 'attendance', personId: a.personId, personName: null, status: a.status, confidence: 'none', candidates: [], decidedBy: null, decidedAt: null, updatedAt: null }))
			return json(200, { ok: true, people: st.people.map((p) => ({ role: 'sales', inactive: false, ...p })), aliases, counts: { confirmed: 0, suggested: 0, review: aliases.length, rejected: 0 } })
		}
		if (route === 'POST /api/identity/scan') {
			let created = 0
			for (const i of b.items as { kind: string; key: string; personId?: string }[]) {
				if (i.kind === 'card' && i.personId) { st.aliases.set(i.key, { status: 'suggested', personId: i.personId, reasons: ['local_manual_link'] }); created++ }
			}
			return json(200, { ok: true, created, updated: 0, unchanged: 0 })
		}
		return err(404, 'مسیر نامعتبر')
	}
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const u = new URL(String(input), 'http://x')
		const c: Call = { method: init?.method || 'GET', path: u.pathname, query: u.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null }
		st.calls.push(c)
		return handle(c)
	}
	/** نگاشتِ تأییدشدهٔ یک کارت (مثلِ decide confirm) */
	const confirm = (card: string, personId: string) => st.aliases.set(card, { status: 'confirmed', personId })
	return { st, fetch, confirm }
}
