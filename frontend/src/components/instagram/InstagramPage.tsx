/**
 * تبِ «اینستاگرام» (3.9.73): پنلِ زندهٔ پیجِ aromin.online — لایوِ تحلیل، ریل‌های بالاتر از میانگین + دلیل، الگوهای وایرال، اینباکسِ دسته‌بندی‌شده
 * با پاسخِ پیشنهادیِ ایجنت‌ها (فروش و مذاکره، پاسخ‌گوی سریع، پشتیبانی، لیدساز) و نقشهٔ محتوای هفته. ارسالِ هر پاسخ فقط با کلیکِ مدیر.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@/lib/auth'
import { BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'
import { igApi, type IgEvent, type IgItem, type IgPanel, type IgStatus } from './igApi'

const fmt = (n?: number | null) => (n == null ? '—' : n.toLocaleString('fa-IR'))
const EV_CLS: Record<string, string> = { ok: 'text-success', warn: 'text-warning', error: 'text-error', done: 'text-success font-semibold', step: 'text-white/80' }

export default function InstagramPage({ session, goSettings }: { session: Session; goSettings: () => void }) {
	const [st, setSt] = useState<IgStatus | null>(null)
	const [panel, setPanel] = useState<IgPanel | null>(null)
	const [events, setEvents] = useState<IgEvent[]>([])
	const [running, setRunning] = useState(false)
	const [err, setErr] = useState('')
	const [cat, setCat] = useState('همه')
	const last = useRef(0)
	const feed = useRef<HTMLOListElement>(null)

	const load = useCallback(async () => {
		try {
			const s = await igApi<IgStatus>(session, 'status'); setSt(s); setRunning(s.running)
			setPanel((await igApi<{ panel: IgPanel | null }>(session, 'panel')).panel)
		} catch (e) { setErr((e as Error).message) }
	}, [session])
	useEffect(() => { load() }, [load])

	useEffect(() => {
		if (!running) return
		const t = setInterval(async () => {
			try {
				const r = await igApi<{ running: boolean; events: IgEvent[] }>(session, 'live?since=' + last.current)
				if (r.events.length) { last.current = r.events[r.events.length - 1].n; setEvents((e) => [...e, ...r.events]) }
				if (!r.running) { setRunning(false); load() }
			} catch (e) { setErr((e as Error).message); setRunning(false) }
		}, 1000)
		return () => clearInterval(t)
	}, [running, session, load])
	useEffect(() => { feed.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' }) }, [events])

	const refresh = async () => {
		setErr(''); setEvents([]); last.current = 0
		try { await igApi(session, 'refresh', {}); setRunning(true) } catch (e) { setErr((e as Error).message) }
	}

	if (!st) return err ? <p className="text-[12.5px] text-error">{err}</p> : null
	if (!st.connected) return (
		<section dir="rtl" className={`${CARD} ${CARD_PAD}`}><h2 className={CARD_TITLE}>اینستاگرام</h2>
			<p className={CARD_SUB}>پیج هنوز به داشبورد وصل نیست.</p>
			<button type="button" className={`${BTN_PRIMARY} mt-3`} onClick={goSettings}>رفتن به تنظیمات ← اتصالِ اینستاگرام</button></section>
	)
	const cats = ['همه', ...Array.from(new Set((panel?.inbox || []).map((x) => x.category)))]
	return (
		<div dir="rtl" className="grid gap-4" data-testid="instagram">
			<section className={`flex flex-wrap items-center justify-between gap-3 ${CARD} ${CARD_PAD}`}>
				<div><h2 className={CARD_TITLE}>@{panel?.profile.username || st.username}</h2>
					<p className={CARD_SUB}>{panel ? `${fmt(panel.profile.followers_count)} دنبال‌کننده · ${fmt(panel.profile.media_count)} پست · به‌روز: ${new Date(panel.at).toLocaleString('fa-IR')}` : 'هنوز تحلیلی نشده.'}</p></div>
				<button type="button" className={BTN_PRIMARY} disabled={running} onClick={refresh}>{running ? 'در حالِ تحلیل…' : 'تحلیلِ زنده'}</button>
			</section>
			{err && <p role="alert" className="text-[12.5px] text-error">{err}</p>}

			{(running || events.length > 0) && (
				<section className="rounded-2xl bg-[#0d0f14] p-4 text-[12.5px] text-white" data-testid="ig-live" aria-live="polite">
					<div className="mb-2 flex items-center gap-2"><span className={`size-2.5 rounded-full ${running ? 'animate-pulse bg-error' : 'bg-success'}`} /><b>{running ? 'لایو — داشبورد در حالِ تحلیلِ اینستاگرام است' : 'تحلیل تمام شد'}</b></div>
					<ol ref={feed} className="grid max-h-60 gap-1 overflow-y-auto font-mono">{events.map((e) => <li key={e.n} className={EV_CLS[e.kind]}><span className="ml-2 text-white/40">{e.t}</span>{e.text}</li>)}</ol>
				</section>
			)}

			{panel && <>
				<section className={`${CARD} ${CARD_PAD}`} data-testid="ig-analysis">
					<h3 className={CARD_TITLE}>🔥 ریل‌های بالاتر از میانگین</h3><p className={CARD_SUB}>میانگینِ امتیاز: {fmt(panel.average)}</p>
					<div className="mt-3 grid gap-2 sm:grid-cols-2">{panel.analysis.map((r) => (
						<a key={r.id} href={r.permalink} target="_blank" rel="noreferrer" className="rounded-xl bg-muted/50 p-3 text-[12.5px] hover:bg-muted">
							<b className="line-clamp-1">{r.hook || 'بی‌کپشن'}</b>
							<span className="text-muted-foreground">👁️ {fmt(r.views)} · ❤️ {fmt(r.likes)} · 💬 {fmt(r.comments)} · {r.x ? `${r.x.toLocaleString('fa-IR')}× میانگین` : ''}</span>
							{r.reason && <p className="mt-1">چرا: {r.reason}</p>}
						</a>
					))}{!panel.analysis.length && <p className="text-[12.5px] text-muted-foreground">ریلی بالاتر از میانگین نیست.</p>}</div>
				</section>

				<section className={`${CARD} ${CARD_PAD}`} data-testid="ig-viral">
					<h3 className={CARD_TITLE}>🎯 شکارچیِ وایرال — الگوی مشترک</h3>
					<ul className="mt-2 list-disc pr-5 text-[13px]">{panel.viral.patterns.map((p, i) => <li key={i}>{p}</li>)}</ul>
					<p className="mt-2 text-[11.5px] text-muted-foreground">{panel.viral.note}</p>
				</section>

				<section className={`${CARD} ${CARD_PAD}`} data-testid="ig-inbox">
					<div className="flex flex-wrap items-center justify-between gap-2"><h3 className={CARD_TITLE}>📬 اینباکس ({fmt(panel.inbox.length)})</h3>
						<div className="flex flex-wrap gap-1">{cats.map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-[12px] ${cat === c ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{c}</button>)}</div></div>
					<div className="mt-3 grid gap-2">{panel.inbox.filter((x) => cat === 'همه' || x.category === cat).map((x) => <InboxRow key={x.id} session={session} item={x} />)}</div>
				</section>

				<section className={`${CARD} ${CARD_PAD}`} data-testid="ig-plan">
					<h3 className={CARD_TITLE}>🗺️ نقشهٔ محتوای هفته</h3>
					<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{panel.plan.map((p, i) => (
						<div key={i} className="rounded-xl bg-muted/50 p-3 text-[12.5px]"><b>{p.day} · {p.format}</b><p className="mt-1 font-semibold">«{p.hook}»</p><p className="text-muted-foreground">{p.idea}</p></div>
					))}</div>
				</section>
			</>}
		</div>
	)
}

function InboxRow({ session, item }: { session: Session; item: IgItem }) {
	const [text, setText] = useState(item.reply)
	const [state, setState] = useState<'idle' | 'busy' | 'sent' | string>('idle')
	const send = async () => {
		if (!window.confirm(`این پاسخ برای @${item.from} ${item.kind === 'dm' ? 'در دایرکت' : 'زیرِ کامنت'} فرستاده شود؟`)) return
		setState('busy')
		try { await igApi(session, 'reply', { id: item.id, text: text.trim() }); setState('sent') } catch (e) { setState((e as Error).message) }
	}
	return (
		<div className="rounded-xl bg-muted/40 p-3 text-[12.5px]">
			<div className="flex flex-wrap items-center gap-2"><b>@{item.from}</b><span className="rounded-full bg-card px-2 text-[11px]">{item.kind === 'dm' ? 'دایرکت' : 'کامنت'}</span>
				<span className="rounded-full bg-primary/10 px-2 text-[11px] text-primary-ink">{item.category}</span>
				{item.lead && <span className={`rounded-full px-2 text-[11px] ${item.lead.handoff ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{item.lead.handoff ? `لید ← ${item.lead.assignedTo || 'کارشناسِ فروش'}` : `امتیازِ لید ${item.lead.score}`}</span>}</div>
			<p className="mt-1">{item.text}</p>
			<div className="mt-2 flex flex-col gap-2 sm:flex-row">
				<textarea className={`${INPUT} min-h-14 py-2`} maxLength={300} aria-label={'پاسخ به ' + item.from} value={text} disabled={state === 'sent'} onChange={(e) => setText(e.target.value)} />
				<button type="button" className={`${state === 'sent' ? BTN_GHOST : BTN_PRIMARY} sm:self-end`} disabled={state === 'busy' || state === 'sent' || !text.trim()} onClick={send}>{state === 'sent' ? 'فرستاده شد' : 'ارسال'}</button>
			</div>
			{!['idle', 'busy', 'sent'].includes(state) && <p className="mt-1 text-error">{state}</p>}
		</div>
	)
}
