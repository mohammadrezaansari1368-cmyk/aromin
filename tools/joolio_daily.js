// Joolio month-to-date seller stats → window.__joolioSnap (run in a crm.arominco.com tab that has /sale/analyze open
// with the «تحلیل عملکرد فروشندگان» tab loaded once, so the kpi_6 request URL is in performance entries).
// Calls: outgoing external = all records; incoming external = answered + no-answer + busy (ring-group failures excluded).
(async () => {
	const pad = (n) => String(n).padStart(2, '0')
	const today = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
	const p = Object.fromEntries(today.map((x) => [x.type, x.value]))
	const T = `${p.year}/${pad(p.month)}/${pad(p.day)}`, F = `${p.year}/${pad(p.month)}/01`
	let workdays = 0
	for (let d = new Date(Date.now() - (Number(p.day) - 1) * 864e5); d <= new Date(); d = new Date(d.getTime() + 864e5)) if (d.getDay() !== 5) workdays++
	const norm = (s) => s.replace(/\s*\d+$/, '').trim()
	const cell = (s) => Number((s || '0').split(' ')[0].replace(/,/g, '')) || 0
	const sec = (v) => { const [h, m, z] = v.split(':').map(Number); return h * 3600 + m * 60 + z }
	const get = async (u) => {
		const t = await (await fetch(u, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })).text()
		let h = t
		try { const j = JSON.parse(t); h = Object.values(j).find((v) => typeof v === 'string' && v.includes('<tr')) || '' } catch { /* html */ }
		const d = document.createElement('div'); d.innerHTML = h
		return [...d.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.innerText.trim().replace(/\s+/g, ' ')))
	}
	const S = {}
	const kpi = performance.getEntriesByType('resource').filter((e) => /dashboard_id=sale_analyze_kpi_6/.test(e.name)).pop()?.name
	if (!kpi) return (window.__joolioSnap = { error: 'open «تحلیل عملکرد فروشندگان» first' })
	for (const mode of ['count', 'price']) for (let pg = 1; pg <= 5; pg++) {
		const u = new URL(kpi)
		u.searchParams.set('date_ranges[0][date_from]', F); u.searchParams.set('date_ranges[0][date_to]', T); u.searchParams.set('mode', mode); u.searchParams.set('page', pg)
		const rows = (await get(u)).filter((c) => c.length >= 8 && /^\d+$/.test(c[0]))
		if (!rows.length) break
		for (const c of rows) {
			const x = S[norm(c[1])] ||= { name: norm(c[1]), calls: 0, callsOk: 0, callsNoAnswer: 0, talkMin: 0, deals: 0, won: 0, wonValue: 0, workdays }
			if (mode === 'count') { x.deals = cell(c[7]); x.won = cell(c[5]) } else x.wonValue = cell(c[5])
		}
	}
	const tok = document.querySelector('meta[name=csrf-token]')?.content || ''
	for (const ep of ['external_incoming', 'external_outgoing']) for (let pg = 1; pg <= 10; pg++) {
		const u = new URL('/call-reports/overview/' + ep, location.origin)
		Object.entries({ _token: tok, data_type: '', sort_export: 'ext_number_unsigned', order_export: 'desc', date_type: 'created_at', date_from: F, date_to: T,
			search_date_radio: T, time_from: '00:00', time_to: '23:59', department_id: 'all', group_id: 'all', keyword: '', page: pg }).forEach(([k, v]) => u.searchParams.set(k, v))
		const rows = (await get(u)).filter((c) => c.length >= 11 && /^\d+$/.test(c[1]))
		if (!rows.length) break
		for (const c of rows) {
			const x = S[norm(c[2])]
			if (!x) continue
			x.calls += ep === 'external_outgoing' ? cell(c[4]) : cell(c[5]) + cell(c[6]) + cell(c[7])
			x.callsOk += cell(c[5]); x.callsNoAnswer += cell(c[6]); x.talkMin += sec(c[9]) / 60
		}
	}
	const sellers = Object.values(S).filter((x) => x.deals > 0).map((x) => ({ ...x, talkMin: Math.round(x.talkMin * 10) / 10 }))
	return (window.__joolioSnap = { date: new Date().toISOString().slice(0, 10), period: `${F}–${T}`, sellers })
})()
