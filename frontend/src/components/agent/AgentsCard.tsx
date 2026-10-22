/**
 * تنظیمات ← «ایجنت‌ها» (3.9.64): هفت ایجنتِ تخصصی زیرِ یک ارکستراتور. هر ردیف: روشن/خاموش، سطح‌ها، سایت‌ها و «ویرایش»
 * (پرامپت، مهارت‌ها، مجموعه‌های دانش، کارهای مجاز، چهره). همان GET/PUT /api/agent/settings و همان اعتبارسنجیِ سرور؛
 * فقط بخشِ agents فرستاده می‌شود. کلیدِ «دستیار روشن» در کارتِ دستیار همچنان همه را کنترل می‌کند. فقط مدیر.
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { actionsFor, COLLECTION_FA, SKILL_FIELDS, SURFACE_FA, type AgentMeta, type AgentRec, type Skill } from '@/lib/agents'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, INPUT } from '@/components/ui/tokens'
import SkillInstaller from './SkillInstaller'

type Agents = Record<string, AgentRec>
type Site = { siteId: string; name: string; domain: string }
const EMPTY_SKILL: Skill = { name: '', trigger: '', inputs: '', steps: '', questions: '', output: '', limits: '' }
const MOOD_FA: Record<string, string> = { neutral: 'خنثی', happy: 'شاد', curious: 'کنجکاو', concerned: 'نگران', thinking: 'در حال فکر' }

export default function AgentsCard({ session }: { session: Session }) {
	const [agents, setAgents] = useState<Agents | null>(null)
	const [meta, setMeta] = useState<AgentMeta | null>(null)
	const [states, setStates] = useState<string[]>([])
	const [globalOn, setGlobalOn] = useState(false)
	const [sites, setSites] = useState<Site[]>([])
	const [edit, setEdit] = useState<string | null>(null)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
	const [busy, setBusy] = useState(false)
	const q = `?tenant=${encodeURIComponent(currentTenant())}`
	const load = useCallback(async () => {
		try {
			const r = await fetch('/api/agent/settings' + q, { headers: authHeaders(session), cache: 'no-store' })
			const j = await r.json()
			if (!r.ok || !j.ok) throw new Error(j.error || 'خطا ' + r.status)
			setAgents(j.settings.agents); setMeta(j.agentMeta); setStates(j.states || []); setGlobalOn(!!j.settings.enabled)
			const s = await fetch('/api/widget/sites' + q, { headers: authHeaders(session), cache: 'no-store' }).then((x) => x.json()).catch(() => ({}))
			setSites(s.sites || [])
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
	}, [session, q])
	useEffect(() => { load() }, [load])
	if (!agents || !meta) return msg ? <p className="text-[12.5px] text-error">{msg.text}</p> : null

	const patch = (k: string, p: Partial<AgentRec>) => setAgents({ ...agents, [k]: { ...agents[k], ...p } })
	const toggleIn = (list: string[], v: string, on: boolean) => (on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v))
	const save = async () => {
		setBusy(true); setMsg(null)
		try {
			const r = await fetch('/api/agent/settings' + q, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, body: JSON.stringify({ settings: { agents } }), cache: 'no-store' })
			const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر' }))
			if (!r.ok || !j.ok) throw new Error(j.error || 'خطا ' + r.status)
			setAgents(j.settings.agents); setMsg({ ok: true, text: 'ذخیره شد.' })
		} catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
	}
	const surfacesOf = (k: string) => meta.onlySurfaces[k] || meta.surfaces
	const a = edit ? agents[edit] : null

	return (
		<section dir="rtl" aria-labelledby="agents-title" className={`mb-4 flex flex-col gap-3 ${CARD} ${CARD_PAD}`}>
			<header>
				<h3 id="agents-title" className={CARD_TITLE}>ایجنت‌ها</h3>
				<p className={CARD_SUB}>ارکستراتور هر پیام را به یکی از ایجنت‌های روشنِ همان سطح می‌سپارد. {globalOn ? '' : '«دستیار روشن» خاموش است؛ تا آن را روشن نکنید هیچ ایجنتی اجرا نمی‌شود.'}</p>
			</header>
			<div className="grid gap-2">
				{meta.keys.map((k) => {
					const r = agents[k]
					return (
						<div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2" data-agent={k}>
							<label className="flex min-w-40 items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={r.enabled} onChange={(e) => patch(k, { enabled: e.target.checked })} className="size-4 accent-[hsl(var(--primary))]" aria-label={'روشن: ' + r.name} />{r.name}</label>
							<div className="flex flex-wrap gap-2 text-[12px]">{surfacesOf(k).map((s) => (
								<label key={s} className="flex items-center gap-1"><input type="checkbox" checked={r.surfaces.includes(s)} onChange={(e) => patch(k, { surfaces: toggleIn(r.surfaces, s, e.target.checked) })} className="size-3.5" />{SURFACE_FA[s] || s}</label>
							))}</div>
							{r.surfaces.includes('website') && sites.length > 0 && (
								<select multiple aria-label={'سایت‌های ' + r.name} className={`${INPUT} min-h-0 w-auto py-1 text-[12px]`} value={r.sites} onChange={(e) => patch(k, { sites: [...e.target.selectedOptions].map((o) => o.value) })}>
									{sites.map((s) => <option key={s.siteId} value={s.siteId}>{s.name || s.domain}</option>)}
								</select>
							)}
							{meta.managerOnly.includes(k) && <span className="text-[11.5px] text-muted-foreground">فقط مدیران</span>}
							<span className="text-[11px] text-muted-foreground">نسخهٔ {r.version}{r.updatedBy ? ' · ' + r.updatedBy : ''}</span>
							<button type="button" className={`${BTN_GHOST} mr-auto`} onClick={() => setEdit(k)}>ویرایش</button>
						</div>
					)
				})}
			</div>
			<p className="text-[11.5px] text-muted-foreground">سایت انتخاب نشود = همهٔ سایت‌ها. «دیجیتال مارکتینگ» فقط پیش‌نویس می‌دهد و هیچ‌چیز را منتشر نمی‌کند.</p>
			<div className="flex flex-wrap items-center gap-2">
				<button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>ذخیرهٔ ایجنت‌ها</button>
				{msg && <span role="status" className={`text-[12.5px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
			</div>

			{edit && a && (
				<div role="dialog" aria-modal="true" aria-label={'ویرایشِ ' + a.name} className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setEdit(null)}>
					<div dir="rtl" className="h-full w-full max-w-lg overflow-y-auto bg-card p-4 shadow-card" onClick={(e) => e.stopPropagation()}>
						<div className="mb-3 flex items-center justify-between"><b className="text-[15px]">{a.name}</b><button type="button" className={BTN_GHOST} onClick={() => setEdit(null)}>بستن</button></div>
						<label className="grid gap-1 text-[12.5px] font-bold">پرامپتِ سیستم{edit === 'online_expert' && <span className="font-normal text-muted-foreground">خالی = همان پرامپتِ «دستیارِ فروشِ سایت»</span>}
							<textarea className={`${INPUT} min-h-28 py-2`} maxLength={4000} value={a.prompt} onChange={(e) => patch(edit, { prompt: e.target.value })} /></label>
						<fieldset className="mt-3 grid gap-2"><legend className="text-[12.5px] font-bold">مهارت‌ها</legend>
							{a.skills.map((sk, i) => (
								<div key={i} className="grid gap-1.5 rounded-md border border-border p-2">
									{SKILL_FIELDS.map((f) => (
										<label key={f.key} className="grid gap-0.5 text-[12px]">{f.label}
											{f.long ? <textarea className={`${INPUT} min-h-16 py-1.5`} value={sk[f.key]} onChange={(e) => patch(edit, { skills: a.skills.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)) })} />
												: <input className={`${INPUT} py-1.5`} value={sk[f.key]} onChange={(e) => patch(edit, { skills: a.skills.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)) })} />}
										</label>
									))}
									<button type="button" className={BTN_DANGER} onClick={() => patch(edit, { skills: a.skills.filter((_, j) => j !== i) })}>حذفِ مهارت</button>
								</div>
							))}
							{a.skills.length < 8 && <button type="button" className={BTN_GHOST} onClick={() => patch(edit, { skills: [...a.skills, { ...EMPTY_SKILL }] })}>+ مهارتِ تازه</button>}
						</fieldset>
						<fieldset className="mt-3 flex flex-wrap gap-2 text-[12.5px]"><legend className="mb-1 font-bold">مجموعه‌های دانش (فقط از همین‌ها می‌خواند)</legend>
							{meta.collections.filter((c) => c !== 'dashboard_help' || (a.surfaces.length > 0 && a.surfaces.every((s) => s === 'dashboard'))).map((c) => (
								<label key={c} className="flex items-center gap-1"><input type="checkbox" checked={a.ragScope.includes(c)} onChange={(e) => patch(edit, { ragScope: toggleIn(a.ragScope, c, e.target.checked) })} className="size-3.5" />{COLLECTION_FA[c] || c}</label>
							))}
						</fieldset>
						<fieldset className="mt-3 flex flex-wrap gap-2 text-[12.5px]"><legend className="mb-1 font-bold">کارهای مجاز</legend>
							{actionsFor(meta, a.surfaces).map((x) => (
								<label key={x.key} className="flex items-center gap-1"><input type="checkbox" checked={a.actions.includes(x.key)} onChange={(e) => patch(edit, { actions: toggleIn(a.actions, x.key, e.target.checked) })} className="size-3.5" />{x.label}</label>
							))}
						</fieldset>
						<SkillInstaller session={session} agent={edit} installed={a.installed || []} onChanged={load}
							onToggle={(id, on) => patch(edit, { installed: (a.installed || []).map((x) => (x.id === id ? { ...x, enabled: on } : x)) })} />
						<label className="mt-3 grid gap-1 text-[12.5px] font-bold">چهرهٔ پیش‌فرض
							<select className={INPUT} value={a.mood} onChange={(e) => patch(edit, { mood: e.target.value })}>{states.map((s) => <option key={s} value={s}>{MOOD_FA[s] || s}</option>)}</select></label>
						<div className="mt-4 flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={async () => { await save(); setEdit(null) }}>ذخیره</button></div>
					</div>
				</div>
			)}
		</section>
	)
}
