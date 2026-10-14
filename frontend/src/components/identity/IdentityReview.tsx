'use client'

/**
 * بررسیِ نگاشتِ هویت (WP-A) — فقط مدیران/مالی؛ سرور هم نقش را بررسی می‌کند.
 * هر شناسهٔ بیرونی (کارتِ حضور، کاربرِ جولیو، داخلی، نام) ← شخصِ سیستم. فقط نگاشتِ «تأییدشده» در دسترسی و انتساب به کار می‌رود؛
 * کارتِ حضور هرگز خودکار تأیید نمی‌شود و همیشه انتخابِ صریحِ شخص لازم است.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@/lib/auth'
import { Shell, faNum } from '@/components/ui/kit'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, FOCUS, INPUT } from '@/components/ui/tokens'
import { decideIdentity, fetchIdentity, loadServerAttendance, scanIdentity, type Alias, type AliasKind, type IdentityList } from '@/lib/attendanceApi'
import { resetCallsCache } from '@/lib/callsApi'
import { loadSettings, loadTaskFiles, preparePerfStore, rules, taskStats } from '@/lib/performance'

type Tab = 'review' | 'confirmed' | 'rejected'
const TABS: [Tab, string][] = [['review', 'نیازمند بررسی'], ['confirmed', 'تأییدشده'], ['rejected', 'ردشده']]
const KIND_FA: Record<AliasKind, string> = { card: 'کارت', julio: 'جولیو', ext: 'داخلی', name: 'نام' }
const CONF_FA: Record<string, string> = { exact: 'دقیق', strong: 'قوی', weak: 'ضعیف', ambiguous: 'چندگانه', none: 'بدون تطبیق', manual: 'دستی' }
const REASON_FA: Record<string, string> = {
	last_name: 'نام خانوادگی یکسان', two_part_surname: 'نام خانوادگی دوبخشی', spacing: 'فاصله/نیم‌فاصلهٔ متفاوت', first_name_conflict: 'نام کوچک متفاوت',
	first_name_missing: 'نام کوچک ناموجود', inactive: 'قطع همکاری', local_manual_link: 'نگاشتِ دستیِ قبلی در مرورگر',
}
const fa = (s: string) => (/^\d+$/.test(s) ? s.replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c]) : s)
const tone = (c: string) => (c === 'exact' || c === 'manual' ? 'bg-success/10 text-success ring-success/30' : c === 'strong' ? 'bg-secondary/10 text-secondary-ink ring-secondary/30' : c === 'weak' ? 'bg-warning/12 text-warning ring-warning/35' : 'bg-error/10 text-error ring-error/30')
const inTab = (a: Alias, t: Tab) => (t === 'review' ? a.status === 'review' || a.status === 'suggested' : a.status === t)
/** پیش‌انتخاب فقط برای شناسهٔ غیرکارت با تطبیقِ یکتای قوی/دقیق؛ کارت همیشه انتخابِ صریح می‌خواهد */
const preselect = (a: Alias) => (a.kind !== 'card' && a.personId && (a.confidence === 'exact' || a.confidence === 'strong') && !a.candidates[0]?.reasons.includes('first_name_conflict') ? a.personId : '')

export default function IdentityReview({ session }: { session: Session }) {
	const [data, setData] = useState<IdentityList | null>(null)
	const [tab, setTab] = useState<Tab>('review')
	const [sel, setSel] = useState<Record<number, string>>({})
	const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null)
	const [busy, setBusy] = useState(false)
	const load = useCallback(() => fetchIdentity(session).then(setData, (e: Error) => setMsg({ t: e.message, err: true })), [session])
	useEffect(() => { void load() }, [load])
	const people = useMemo(() => [...(data?.people || [])].sort((a, b) => Number(a.inactive) - Number(b.inactive) || a.name.localeCompare(b.name, 'fa')), [data])
	const rows = (data?.aliases || []).filter((a) => inTab(a, tab))
	const act = async (a: Alias, action: 'confirm' | 'reject' | 'reset') => {
		const personId = sel[a.id] ?? preselect(a)
		setBusy(true); setMsg(null)
		try {
			const r = await decideIdentity(session, { id: a.id, action, personId: action === 'confirm' ? personId : undefined, updatedAt: a.updatedAt })
			setMsg({ t: action === 'confirm' ? `«${a.raw}» به ${r.alias.personName || 'شخص'} نگاشت شد.` : action === 'reject' ? `«${a.raw}» رد شد.` : `«${a.raw}» به بررسی برگشت.` })
			await load()
			if (a.kind === 'card') await loadServerAttendance(session).catch(() => { /* تبِ عملکرد در بارگذاریِ بعدی */ })
			if (a.kind === 'julio' || a.kind === 'ext') resetCallsCache()   // آمارِ تماس با نگاشتِ تازه دوباره محاسبه شود
		} catch (e) { setMsg({ t: (e as Error).message, err: true }) } finally { setBusy(false) }
	}
	const scanJulio = async () => {
		setBusy(true); setMsg(null)
		try {
			await preparePerfStore()
			const owners = taskStats(loadTaskFiles(), rules(loadSettings())).owners.filter((o) => o.pid)
			if (!owners.length) throw new Error('فایلِ وظایفِ جولیو با «برای ID» در این مرورگر نیست.')
			const r = await scanIdentity(session, owners.slice(0, 500).map((o) => ({ kind: 'julio', key: o.pid, raw: o.name, source: 'tasks' })))
			setMsg({ t: `اسکن شد: ${faNum(r.created)} تازه، ${faNum(r.updated)} به‌روز، ${faNum(r.unchanged)} بدون تغییر.` })
			await load()
		} catch (e) { setMsg({ t: (e as Error).message, err: true }) } finally { setBusy(false) }
	}
	const count = (t: Tab) => (t === 'review' ? (data?.counts.review || 0) + (data?.counts.suggested || 0) : data?.counts[t] || 0)
	return (
		<Shell title="نگاشتِ هویت" meta={<button type="button" disabled={busy} onClick={scanJulio} className={BTN_GHOST}>اسکن شناسه‌های جولیو</button>}>
			<div id="identity-review" dir="rtl" className="flex flex-col gap-3">
				<div role="tablist" aria-label="وضعیت نگاشت" className="flex flex-wrap gap-1.5">
					{TABS.map(([t, label]) => (
						<button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
							className={`rounded-full px-3 py-1 text-[12px] font-bold ring-1 ${FOCUS} ${tab === t ? 'bg-primary text-primary-foreground ring-primary' : 'text-muted-foreground ring-border hover:bg-muted'}`}>
							{label} · {faNum(count(t))}
						</button>
					))}
				</div>
				{!data ? <p className="text-[12px] text-muted-foreground">در حال دریافت…</p> : !rows.length ? <p className="text-[12px] text-muted-foreground">موردی نیست.</p> : (
					<ul className="space-y-2">
						{rows.map((a) => {
							const chosen = sel[a.id] ?? preselect(a)
							const reasons = [...new Set(a.candidates.flatMap((c) => c.reasons))].map((r) => REASON_FA[r] || r)
							const hint = a.kind === 'card' && a.status === 'suggested' && a.personId && !chosen ? a.candidates.find((c) => c.personId === a.personId) : undefined
							return (
								<li key={a.id} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3 ring-1 ring-border">
									<div className="flex flex-wrap items-center gap-2 text-[12.5px]">
										<span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-black text-primary-ink">{KIND_FA[a.kind]}</span>
										{a.kind !== 'name' && <span className="font-bold tabular-nums">{fa(a.key)}</span>}
										<bdi dir="auto" className="font-bold text-foreground">{a.raw}</bdi>
										<span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${tone(a.confidence)}`}>{CONF_FA[a.confidence] || a.confidence}</span>
										{a.personName && a.status === 'confirmed' && <span className="text-muted-foreground">← {a.personName}</span>}
										{reasons.length > 0 && <span className="text-[11.5px] text-muted-foreground">{reasons.join('، ')}</span>}
									</div>
									<div className="flex flex-wrap items-center gap-2">
										{tab === 'review' && <>
											<select aria-label={'شخصِ سیستم برای ' + a.raw} className={INPUT + ' max-w-[260px]'} value={chosen} onChange={(e) => setSel({ ...sel, [a.id]: e.target.value })}>
												<option value="">— انتخاب شخص —</option>
												{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.inactive ? ' (قطع همکاری)' : ''}</option>)}
											</select>
											{hint && <button type="button" onClick={() => setSel({ ...sel, [a.id]: hint.personId })} className={`text-[12px] font-bold text-secondary-ink hover:underline ${FOCUS}`}>پیشنهاد: {hint.personName}</button>}
											<button type="button" disabled={busy || !chosen} onClick={() => act(a, 'confirm')} className={BTN_PRIMARY}>تأیید</button>
											<button type="button" disabled={busy} onClick={() => act(a, 'reject')} className={BTN_DANGER}>رد</button>
										</>}
										{tab !== 'review' && <button type="button" disabled={busy} onClick={() => act(a, 'reset')} className={BTN_GHOST}>بازگشت به بررسی</button>}
									</div>
								</li>
							)
						})}
					</ul>
				)}
				{msg && <p role="status" className={`text-[12px] font-bold ${msg.err ? 'text-error' : 'text-success'}`}>{msg.t}</p>}
			</div>
		</Shell>
	)
}
