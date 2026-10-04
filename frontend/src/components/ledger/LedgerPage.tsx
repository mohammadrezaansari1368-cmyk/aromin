'use client'

/**
 * تبِ «دفتر فروش» — بومی (C1 میزِ کارِ مالی/فروش + C2…C6 خلاصه‌ها).
 * محاسبه‌ها فقط از موتورِ پورسانت (engines/commission، برابرِ ۱۰۰٪ با اپِ کامل)؛ نوعِ مشتری از engines/customer؛ ایمپورت از engines/deal-import.
 * دفترِ نمایش = سالِ مالیِ ۱۴۰۵ (invY['1405'])؛ سال‌های دیگر هرگز در این جدول نمی‌آیند و دست نمی‌خورند.
 * جدول مجازی است (فقط ردیف‌های دیده‌شده ساخته می‌شوند)، جست‌وجو debounce دارد، ذخیره‌ها دسته‌ای و روی نسخهٔ تازهٔ سرورند.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, memo, useCallback, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKE, type ReactNode } from 'react'
import {
	ATT, CHANNEL, DEFAULT_WEIGHTS, FUNNEL, KIND, MONTHS, SETTLE, STAGES, STAGE_KEYS, attIs, attPrimary, commAmount, fa, faGroup, freshS, funLabel, funnelOf, label, mil,
	monthOf, num, pct, period, rawDigits, roleCount, rowBasis, sep, stagesOf, wDeal, invoiceKey, isInvoice, isLocked, finStateOf, FIN_STATE_LABEL, type Att, type CommS, type Deal, type FinState, type StageKey,
} from '@/engines/commission/index.ts'
import { classifyKinds, custNorm, ledgerOf } from '@/engines/customer/index.ts'
import { cleanName } from '@/engines/deal-import/index.ts'
import { fetchFull } from '@/lib/forecastStore'
import { approveBatch, approveDoc, closeDeals, flushLedger, LEDGER_FY, ledgerStatus, loadLayout, onLedgerStatus, queueOp, reopenDeal, requestReopenCode, saveLayout, submitDocs, withdrawDoc, type ApprovalInput, type Ref } from '@/lib/ledgerStore'
import { canSeeAll } from '@/lib/performance'
import { isActivePerson } from '@/lib/people'
import { currentTenant } from '@/lib/data'
import { isAdmin, type Session } from '@/lib/auth'
import Sortable, { arrangeOrder, loadOrder, saveOrder } from '@/components/ui/sortable'
import { BTN, BTN_GHOST, BTN_PRIMARY, CARD, FOCUS, INPUT } from '@/components/ui/tokens'
import { parseJ, todayJ } from '@/lib/jalali'
import BulkApprove from '@/components/ledger/BulkApprove'
import { motion } from 'motion/react'
import { RowOrderContext, RowGrip, useRowOrder } from '@/components/ui/use-row-order'
import { orderRows } from '@/components/ui/row-order'
import Funnel from '@/components/ui/funnel-chart'
import { funnelReach } from '@/components/ui/funnel-geometry'

/* ---------- انواع ---------- */
const rowOrderKey = (r: Row) => String(r.p.id) + ':' + r.d.id
interface Row { key: string; pi: number; p: any; d: Deal; S: CommS; ref: Ref }
type ColK = 'name' | 'amount' | 'stage' | 'settle' | 'next' | 'owner' | 'leadGen' | 'role' | 'kind' | 'channel' | 'basis' | 'follow' | 'no' | 'month' | 'act'
interface Col { k: ColK; t: string; w: number; edit?: 'text' | 'money' | 'select' | 'stage'; sort?: boolean; tier: 1 | 2 | 3 }
interface Filters { no: string; q: string; funnel: string; settle: string; kind: string; channel: string; leadGen: string; fin: string; att: Att | 'kindfix' | 'follow' | ''; sort: string; dir: 1 | -1 }
const NOF: Filters = { no: '', q: '', funnel: '', settle: '', kind: '', channel: '', leadGen: '', fin: '', att: '', sort: '', dir: 1 }

const ALL = '__all__'
const COLS: Col[] = [
	{ k: 'no', t: 'شماره فاکتور', w: 124, sort: true, tier: 1 },
	{ k: 'name', t: 'مشتری', w: 200, edit: 'text', sort: true, tier: 1 },
	{ k: 'amount', t: 'خالص فاکتور', w: 128, edit: 'money', sort: true, tier: 1 },
	{ k: 'stage', t: 'مرحله و وزنِ ۷گانه', w: 262, edit: 'stage', tier: 1 },
	{ k: 'settle', t: 'تسویه', w: 138, edit: 'select', tier: 1 },
	{ k: 'next', t: 'اقدام بعدی', w: 138, tier: 1 },
	{ k: 'owner', t: 'کارشناس', w: 118, tier: 2 },
	{ k: 'leadGen', t: 'لیدساز', w: 124, edit: 'select', tier: 2 },
	{ k: 'role', t: 'نقش در معامله', w: 120, edit: 'stage', tier: 2 },
	{ k: 'kind', t: 'نوع خرید', w: 118, edit: 'select', tier: 2 },
	{ k: 'channel', t: 'حساب', w: 92, edit: 'select', tier: 2 },
	{ k: 'basis', t: 'مبنای پورسانت', w: 138, sort: true, tier: 2 },
	{ k: 'month', t: 'ماه', w: 92, edit: 'select', sort: true, tier: 3 },
	{ k: 'act', t: '', w: 72, tier: 3 },
]
const FUN_TONE: Record<string, string> = {
	start: 'bg-secondary/15 text-secondary-ink ring-secondary/25', qualify: 'bg-primary/10 text-primary-ink ring-primary/25', advance: 'bg-warning/15 text-warning ring-warning/30',
	won: 'bg-success/15 text-success ring-success/30', lost: 'bg-error/10 text-error ring-error/25',
}
const INPUT_I = INPUT.replace('w-full ', '')
const BADGE = 'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-[3px] text-[11px] font-bold leading-4 ring-1 ring-inset'
const norm = (v: unknown) => custNorm(v)
const hayCache = new WeakMap<Deal, { s: string; n: string }>()
function hay(d: Deal, owner: string) {
	const src = [d.no, d.name, d.leadGen, d.src, d.finBy, owner].join(' ')
	const c = hayCache.get(d)
	if (c && c.s === src) return c.n
	const n = String(src).replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 0x06f0)).replace(/[يیۍ]/g, 'ی').replace(/[كک]/g, 'ک').replace(/‌/g, ' ').toLowerCase()
	hayCache.set(d, { s: src, n })
	return n
}
const qNorm = (q: string) => q.replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 0x06f0)).replace(/[يیۍ]/g, 'ی').replace(/[كک]/g, 'ک').replace(/‌/g, ' ').toLowerCase().trim()
const ordStages = (a: StageKey[]) => STAGE_KEYS.filter((k) => a.includes(k))

/** پیگیری لازم: معاملهٔ باز بدونِ هیچ وظیفهٔ پیگیری / بسته بدونِ پیگیریِ پس از فروش */
function followNeed(d: Deal): '' | 'follow' | 'post' {
	const f = funnelOf(d)
	if ((f === 'start' || f === 'qualify' || f === 'advance') && !(d.taskFollow! > 0) && !stagesOf(d).includes('follow')) return 'follow'
	if (f === 'won' && !(d.supportGen && d.supportSla) && !stagesOf(d).includes('post') && !(d.taskPost! > 0)) return 'post'
	return ''
}
type NA = { k: string; t: string; hint: string; tone: string }
/** extra = نسخهٔ دومِ یک فاکتورِ دقیقاً تکراری (نسخهٔ اصل = اولین ثبت)؛ canDup = مدیر/مالی */
function nextAction(d: Deal, dup: Set<string>, x: { extra: boolean; finance: boolean; canDup: boolean; mine: boolean }): NA | null {
	const st = finStateOf(d)
	if (st === 'closed') return null
	if (st === 'approved') return x.finance ? { k: 'close', t: 'بستن مالی', hint: 'قفلِ نهاییِ سندِ تصویب‌شده', tone: 'primary' } : null
	if (st === 'submitted') return x.finance ? { k: 'approve', t: 'تصویب سند', hint: 'بررسی و تصویبِ سند توسطِ واحدِ مالی', tone: 'primary' } : null
	if (x.extra && x.canDup) return { k: 'dupdel', t: 'حذف تکراری', hint: 'نسخهٔ دومِ همین شمارهٔ فاکتور — نسخهٔ اصل حفظ می‌شود (قابلِ بازگردانی)', tone: 'err' }
	for (const k of ['hold', 'check', 'fin'] as const) if (attIs(d, k, dup)) { const m = ATT.find((a) => a.k === k)!; return { k, t: m.na, hint: m.naHint, tone: k === 'check' ? 'warn' : k === 'fin' ? 'primary' : 'err' } }
	if (funnelOf(d) === 'won') {
		if (x.finance) return { k: 'approve', t: 'تصویب سند', hint: 'بررسی و تصویبِ سند توسطِ واحدِ مالی', tone: 'primary' }
		if (x.mine) return { k: 'submit', t: 'ارسال برای تصویب', hint: 'سند برای تصویبِ واحدِ مالی فرستاده و قفل می‌شود', tone: 'sec' }
	}
	const f = followNeed(d)
	if (f === 'follow') return { k: 'follow', t: 'پیگیری انجام شد', hint: 'تیکِ مرحلهٔ «پیگیری» (قابلِ بازگردانی)', tone: 'sec' }
	if (f === 'post') return { k: 'post', t: 'پس از فروش انجام شد', hint: 'تیکِ مرحلهٔ «پیگیری پس از فروش» (قابلِ بازگردانی)', tone: 'sec' }
	return null
}
const NA_TONE: Record<string, string> = {
	err: 'bg-error/10 text-error ring-error/30 hover:bg-error/15', warn: 'bg-warning/15 text-warning ring-warning/30 hover:bg-warning/20',
	primary: 'bg-primary/10 text-primary-ink ring-primary/30 hover:bg-primary/15', sec: 'bg-secondary/10 text-secondary-ink ring-secondary/30 hover:bg-secondary/15',
}

/** اقدامِ بعدیِ هر ردیف (به نقشِ کاربر و نسخهٔ اصل/تکراری بستگی دارد) */
const NaCtx = createContext<(r: Row) => NA | null>(() => null)
const LockIcon = ({ className = 'size-3.5' }: { className?: string }) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)

/* ---------- ترجیحاتِ هر کاربر (فقط ظاهر) ---------- */
const prefKey = (u: string) => `aromin.c1n.${currentTenant()}.${u || '_'}`
function loadPref(u: string): { person?: string; gm?: string; f?: Partial<Filters>; dens?: 'comfortable' | 'compact'; wide?: boolean } {
	try { return JSON.parse(localStorage.getItem(prefKey(u)) || '{}') || {} } catch { return {} }
}
function savePref(u: string, v: object) { try { localStorage.setItem(prefKey(u), JSON.stringify(v)) } catch { /* */ } }

function useMedia(q: string) {
	const [m, setM] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches)
	useEffect(() => { const mm = matchMedia(q); const f = () => setM(mm.matches); mm.addEventListener('change', f); return () => mm.removeEventListener('change', f) }, [q])
	return m
}

/* ============================================================ */
export default function LedgerPage({ session }: { session: Session; go?: (id: string) => void }) {
	const user = session.user || session.name
	const pref0 = useMemo(() => loadPref(user), [user])
	const [full, setFull] = useState<any | null | undefined>(undefined)
	const [loadErr, setLoadErr] = useState('')
	const [ver, setVer] = useState(0)
	const bump = useCallback(() => setVer((v) => v + 1), [])
	const load = useCallback(async () => {
		setLoadErr('')
		try { await flushLedger() } catch { /* خطای ذخیره در نوار وضعیت دیده می‌شود */ }
		try { setFull((await fetchFull()) || null) } catch { setFull(null); setLoadErr('دادهٔ دفتر از سرور خوانده نشد.') }
	}, [])
	useEffect(() => { load() }, [load])

	const seeAll = canSeeAll(session)
	const people: any[] = useMemo(() => (Array.isArray(full?.people) ? full.people : []), [full])
	const selfIdx = useMemo(() => {
		const me = cleanName(session.name)
		let i = people.findIndex((p) => cleanName(p.name) === me)
		if (i < 0) { const first = me.split(' ')[0]; const c = people.map((p, j) => [p, j] as const).filter(([p]) => cleanName(p.name).split(' ')[0] === first); if (c.length === 1) i = c[0][1] }
		return i
	}, [people, session.name])
	const [person, setPerson] = useState<string>(pref0.person || ALL)
	const scope = seeAll ? person : selfIdx >= 0 ? String(selfIdx) : 'none'
	const single = scope !== ALL && scope !== 'none' ? people[+scope] : null
	useEffect(() => { if (seeAll && person !== ALL && !isActivePerson(people[+person]) && people.length) setPerson(ALL) }, [people, person, seeAll])

	const [gm, setGm] = useState<string>(pref0.gm ?? 'all')
	const [viewFy, setViewFy] = useState<string>(LEDGER_FY)
	const years = useMemo(() => {
		const y = new Set<string>([LEDGER_FY, String(full?.fy || LEDGER_FY), ...Object.keys(full?.years || {})])
		people.forEach((p) => Object.keys(p.invY || {}).forEach((k) => y.add(k)))
		return [...y].filter((k) => /^\d{4}$/.test(k)).sort()
	}, [full, people])
	const [f, setF] = useState<Filters>({ ...NOF, ...(pref0.f || {}) })
	const [qIn, setQIn] = useState(f.q)
	const dq = useDeferredValue(qIn)
	useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === dq ? x : { ...x, q: dq })), 140); return () => clearTimeout(t) }, [dq])
	const [dens, setDens] = useState<'comfortable' | 'compact'>(pref0.dens || 'comfortable')
	const [wide, setWide] = useState<boolean>(pref0.wide ?? true)
	useEffect(() => savePref(user, { person, gm, f, dens, wide }), [user, person, gm, f, dens, wide])
	const mobile = useMedia('(max-width: 767px)')

	/* ---- ردیف‌ها ---- */
	const allRows: Row[] = useMemo(() => {
		void ver
		const out: Row[] = []
		people.forEach((p, pi) => {
			if (scope !== ALL && String(pi) !== scope) return
			const S: CommS = p.S && p.S.weights ? p.S : freshS()
			for (const d of ledgerOf(p, full, viewFy)) out.push({ key: pi + ':' + d.id, pi, p, d, S, ref: { pid: p.id, pname: String(p.name || ''), id: d.id } })
		})
		return out
	}, [people, full, scope, ver, viewFy])
	// خطرِ تکراری روی کلِ دفترِ ۱۴۰۵ (همهٔ کارشناسان) — یک فاکتور نباید دو بار پورسانت بگیرد
	// + نسخه‌های اضافه: اولین ثبتِ هر شماره «اصل» است، بقیه «حذف تکراری» می‌گیرند (هرگز خودکار حذف نمی‌شوند)
	const { dup, extraDup } = useMemo(() => {
		void ver
		const first = new Map<string, string>(), d = new Set<string>(), extra = new Set<string>()
		people.forEach((p, pi) => ledgerOf(p, full, viewFy).forEach((x: Deal) => {
			if (!isInvoice(x)) return
			const k = invoiceKey(x.no)
			if (!first.has(k)) { first.set(k, pi + ':' + x.id); return }
			d.add(k)
			if (!isLocked(x)) extra.add(pi + ':' + x.id)
		}))
		return { dup: d, extraDup: extra }
	}, [people, full, ver, viewFy])
	const finance = session.role === 'finance'
	const canDup = finance || isAdmin(session.role)
	const naOf = useCallback((r: Row) => nextAction(r.d, dup, { extra: extraDup.has(r.key), finance, canDup, mine: canDup || r.pi === selfIdx }), [dup, extraDup, finance, canDup, selfIdx])
	const kinds = useMemo(() => { void ver; return full ? classifyKinds(full, LEDGER_FY) : null }, [full, ver])
	const kindFix = useCallback((r: Row) => { const k = kinds?.kinds.get(r.key); return k && k !== (r.d.kind || 'new') ? k : '' }, [kinds])

	const monthRows = useMemo(() => (gm === 'all' ? allRows : allRows.filter((r) => monthOf(r.d) === +gm)), [allRows, gm])
	const rowOrder = useRowOrder(session, 'ledger.rows.' + viewFy, allRows.map(rowOrderKey), !!f.sort)
	const rows = useMemo(() => {
		const q = qNorm(f.q)
		let out = monthRows.filter((r) => {
			const d = r.d
			if (f.no && !invoiceKey(d.no).includes(invoiceKey(f.no))) return false
			if (f.funnel && funnelOf(d) !== f.funnel) return false
			if (f.settle && (d.settle || 'cash') !== f.settle) return false
			if (f.kind && (d.kind || 'new') !== f.kind) return false
			if (f.channel && (d.channel || 'official') !== f.channel) return false
			if (f.leadGen && (d.leadGen || '') !== f.leadGen) return false
			if (f.fin === 'yes' && !d.finBy) return false
			if (f.fin === 'no' && d.finBy) return false
			if (f.att === 'kindfix') { if (!kindFix(r)) return false }
			else if (f.att === 'follow') { if (!followNeed(d)) return false }
			else if (f.att && !attIs(d, f.att, dup)) return false
			if (q && hay(d, r.p.name).indexOf(q) < 0) return false
			return true
		})
		if (f.sort) {
			const g = (r: Row): number | string =>
				f.sort === 'amount' ? num(r.d.amount) : f.sort === 'basis' ? rowBasis(r.d, r.S).basis : f.sort === 'month' ? monthOf(r.d) : f.sort === 'no' ? rawDigits(r.d.no).padStart(12, '0') + String(r.d.no || '') : norm(r.d.name)
			out = out.map((r, i) => ({ r, v: g(r), i })).sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.i - b.i) * f.dir).map((x) => x.r)
		}
		return f.sort ? out : orderRows(out, rowOrder.order, rowOrderKey)
	}, [monthRows, f, dup, kindFix, rowOrder.order])

	/* ---- خلاصه‌ها (C2…C6): موتورِ پورسانت، هر کارشناس با تنظیماتِ خودش ---- */
	const T = useMemo(() => {
		void ver
		const list = people.map((p, pi) => ({ p, pi })).filter(({ pi }) => scope === ALL || String(pi) === scope)
		const Ts = list.map(({ p }) => period(ledgerOf(p, full, viewFy), p.S && p.S.weights ? p.S : freshS(), { GM: gm === 'all' ? 'all' : +gm }))
		const sum = (g: (t: (typeof Ts)[number]) => number) => Ts.reduce((s, t) => s + g(t), 0)
		const byStage: Record<string, number> = {}
		STAGES.forEach((s) => (byStage[s.k] = sum((t) => t.byStage[s.k].basis)))
		const funnel: Record<string, { n: number; gross: number }> = {}
		FUNNEL.forEach((s) => (funnel[s.k] = { n: sum((t) => t.funnel[s.k]?.n || 0), gross: sum((t) => t.funnel[s.k]?.gross || 0) }))
		const ws = list.map(({ p }) => JSON.stringify((p.S && p.S.weights) || DEFAULT_WEIGHTS))
		const weights = ws.length && ws.every((w) => w === ws[0]) ? (JSON.parse(ws[0]) as CommS['weights']) : null
		return {
			gross: sum((t) => t.gross), eligible: sum((t) => t.eligible), payout: sum((t) => t.payout), total: sum((t) => t.total), base: sum((t) => t.baseTotal), hold: sum((t) => t.hold),
			payNow: sum((t) => t.payNow), payCheck: sum((t) => t.payCheck), payPend: sum((t) => t.payPend), off: sum((t) => t.offPayout), uno: sum((t) => t.unoPayout),
			rep: sum((t) => t.rep), nInv: sum((t) => t.nInv), byStage, funnel, weights,
		}
	}, [people, full, scope, gm, ver, viewFy])

	const attCounts = useMemo(() => {
		const c: Record<string, { n: number; v: number }> = {}
		for (const a of ATT) c[a.k] = { n: 0, v: 0 }
		c.kindfix = { n: 0, v: 0 }; c.follow = { n: 0, v: 0 }
		for (const r of monthRows) {
			for (const a of ATT) if (attIs(r.d, a.k, dup)) { c[a.k].n++; c[a.k].v += num(r.d.amount) }
			if (kindFix(r)) { c.kindfix.n++; c.kindfix.v += num(r.d.amount) }
			if (followNeed(r.d)) { c.follow.n++; c.follow.v += num(r.d.amount) }
		}
		return c
	}, [monthRows, dup, kindFix])

	/* ---- ویرایش (محلی فوری + صفِ ذخیره) و بازگردانی ---- */
	const [toast, setToast] = useState<{ t: string; undo?: () => void; tone?: 'ok' | 'err' } | null>(null)
	useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo ? 7000 : 3500); return () => clearTimeout(t) }, [toast])
	const [st, setSt] = useState(ledgerStatus())
	useEffect(() => onLedgerStatus(setSt), [])
	const canEdit = useCallback((r: Row) => viewFy === LEDGER_FY && !isLocked(r.d) && (seeAll || r.pi === selfIdx), [seeAll, selfIdx, viewFy])

	const patch = useCallback((r: Row, p: Partial<Deal>, msg?: string) => {
		if (!canEdit(r)) return
		const prev: Partial<Deal> = {}
		if (isLocked(r.d)) return
		for (const k of Object.keys(p)) (prev as any)[k] = (r.d as any)[k]
		const apply = (x: Partial<Deal>) => {
			for (const [k, v] of Object.entries(x)) { if (v === undefined) delete (r.d as any)[k]; else (r.d as any)[k] = v }
			queueOp({ t: 'patch', ref: r.ref, patch: { ...x } })
			bump()
		}
		apply(p)
		if (msg) setToast({ t: msg, undo: () => { apply(prev); setToast({ t: 'برگردانده شد' }) } })
	}, [bump, canEdit])

	const nextId = useCallback(() => {
		let m = +full?.gid || 1
		people.forEach((p) => { m = Math.max(m, (+p.id || 0) + 1); Object.values(p.invY || {}).forEach((a: any) => (a || []).forEach((d: Deal) => (m = Math.max(m, (+d.id || 0) + 1)))); (p.inv || []).forEach((d: Deal) => (m = Math.max(m, (+d.id || 0) + 1))) })
		full.gid = m + 1
		return m
	}, [full, people])
	const writable = (p: any) => { const arr = ledgerOf(p, full, LEDGER_FY); p.invY = p.invY || {}; p.invY[LEDGER_FY] = arr; if (String(full.fy) === LEDGER_FY) p.inv = arr; return arr }
	const addDeal = () => {
		if (!single) return
		const arr = writable(single)
		const last = arr[arr.length - 1]
		const d: Deal = { id: nextId(), no: '', month: gm !== 'all' ? +gm : last ? monthOf(last) : 3, name: '', amount: '', stages: [...STAGE_KEYS], mgrShare: false, funnel: 'won', settle: 'cash', kind: 'new', channel: (last?.channel as string) || 'official', leadGen: '', fy: LEDGER_FY }
		arr.push(d)
		queueOp({ t: 'add', ref: { pid: single.id, pname: String(single.name || ''), id: d.id }, deal: d })
		setF({ ...NOF, sort: '' }); setQIn('')
		bump()
		pendingFocus.current = { key: people.indexOf(single) + ':' + d.id, col: 'name' }
	}
	const delDeal = (r: Row) => {
		if (!canEdit(r)) return
		const arr = writable(r.p)
		const i = arr.indexOf(r.d)
		if (i < 0) return
		arr.splice(i, 1)
		queueOp({ t: 'del', ref: r.ref })
		bump()
		setToast({ t: `فاکتورِ «${r.d.name || r.d.no || 'بی‌نام'}» حذف شد`, undo: () => { const a = writable(r.p); a.splice(Math.min(i, a.length), 0, r.d); queueOp({ t: 'add', ref: r.ref, deal: r.d }); bump(); setToast({ t: 'برگردانده شد' }) } })
	}
	const fixKinds = () => {
		if (!kinds) return
		const list = monthRows.filter((r) => kindFix(r) && canEdit(r))
		if (!list.length) return
		const prev = list.map((r) => [r, r.d.kind] as const)
		for (const r of list) { r.d.kind = kindFix(r) || r.d.kind; queueOp({ t: 'patch', ref: r.ref, patch: { kind: r.d.kind } }) }
		bump()
		setToast({ t: `نوعِ خریدِ ${fa(list.length)} فاکتور با تاریخچه هم‌خوان شد`, undo: () => { for (const [r, k] of prev) { r.d.kind = k; queueOp({ t: 'patch', ref: r.ref, patch: { kind: k } }) } bump(); setToast({ t: 'برگردانده شد' }) } })
	}

	const layoutSrv = useMemo(() => ({ load: () => loadLayout(session, 'ledger.tiles'), save: (o: string[]) => saveLayout(session, 'ledger.tiles', o) }), [session])

	/* ---- کارشناسان و سالِ مالی (نوارِ کنترلِ ادغام‌شده در دفتر) ---- */
	const canApprove = finance || isAdmin(session.role)
	const approvable = useMemo(() => (viewFy === LEDGER_FY ? monthRows.filter((r) => funnelOf(r.d) === 'won' && !isLocked(r.d)).map((r) => r.d.id) : []), [monthRows, viewFy])
	const scopeLabel = `${single ? single.name : 'همهٔ کارشناسان'} · ${gm === 'all' ? 'همه‌ی ماه‌ها' : MONTHS[+gm]} ${fa(LEDGER_FY)}`
	const bulkApprove = async (v: ApprovalInput) => { const d = await approveBatch(session, approvable, v); await load(); return d }

	/* ---- چرخهٔ سند: ارسال · تصویب · بستن · بازگشایی (فقط سرور می‌نویسد؛ هر خطا به‌صورتِ متن برمی‌گردد) ---- */
	const docAct = async (fn: () => Promise<unknown>, ok: string) => {
		try { await fn(); await load(); setToast({ t: ok, tone: 'ok' }) }
		catch (e) { setToast({ t: (e as Error).message, tone: 'err' }); throw e }
	}
	const docOps = (r: Row) => ({
		submit: () => docAct(() => submitDocs(session, [r.d.id]), 'سند برای تصویب فرستاده شد و تا تصمیمِ مالی قفل است'),
		withdraw: () => docAct(() => withdrawDoc(session, r.d.id), 'سند به پیش‌نویس برگشت'),
		approve: (v: ApprovalInput) => docAct(() => approveDoc(session, r.d.id, v), 'سند تصویب شد و فقط‌خواندنی است'),
		close: () => docAct(() => closeDeals(session, [r.d.id]).then((d) => { if (!d.closed && !d.already) throw new Error('بسته نشد: سند باید تصویب‌شده باشد.') }), 'سند بستهٔ مالی شد'),
		code: () => requestReopenCode(session, r.d.id),
		reopen: (reason: string, code?: string) => docAct(() => reopenDeal(session, r.d.id, reason, code), 'سند بازگشایی شد (دلیل در تاریخچه ثبت شد)'),
	})

	/* ---- نام‌ها برای انتخاب‌گرها ---- */
	const leadNames = useMemo(() => {
		const set = new Set<string>()
		people.filter(isActivePerson).forEach((p) => { const n = String(p.name || '').trim(); if (n) set.add(n) })
		people.forEach((p) => ledgerOf(p, full, LEDGER_FY).forEach((d: Deal) => { const n = String(d.leadGen || '').trim(); if (n) set.add(n) }))
		return [...set].filter(n => !people.some(p => p.name === n && !isActivePerson(p)))
	}, [people, full])
	const finNames = useMemo(() => {
		const out: string[] = []
		people.filter(isActivePerson).forEach((p) => { if (p.role === 'finance') { const n = String(p.name || '').trim(); if (n && !out.includes(n)) out.push(n) } })
		people.forEach((p) => ledgerOf(p, full, LEDGER_FY).forEach((d: Deal) => { const n = String(d.finBy || '').trim(); if (n && !out.includes(n)) out.push(n) }))
		return out.filter(n => !people.some(p => p.name === n && !isActivePerson(p)))
	}, [people, full])

	/* ---- اعلانِ ایمپورتِ قبلی (ایمپورت از «مرکز ایمپورت») ---- */
	const lastImp = useMemo(() => {
		const L: any[] = Array.isArray(full?.importLog) ? full.importLog : []
		for (let i = L.length - 1; i >= 0; i--) if (L[i]?.type === 'deal') return L[i]
		return null
	}, [full])
	const [seenImp, setSeenImp] = useState(() => { try { return +(localStorage.getItem('aromin.c1n.seenImp') || 0) } catch { return 0 } })
	const prevNotice = lastImp && lastImp.fy && lastImp.fy.previous > 0 && lastImp.ts > seenImp ? lastImp : null

	/* ---- فوکوس/ویرایشِ خانه ---- */
	const ALLK = useMemo(() => COLS.map((c) => c.k as string), [])
	const [colOrder, setColOrder] = useState<string[]>(() => arrangeOrder(ALLK, loadOrder('ledger.cols')))
	useEffect(() => { let a = true; loadLayout(session, 'ledger.cols').then((o) => { if (a && o && o.length) { const n = arrangeOrder(ALLK, o); setColOrder(n); saveOrder('ledger.cols', n) } }); return () => { a = false } }, [session, ALLK])
	const [colMsg, setColMsg] = useState('')
	const moveCol = useCallback((k: string, target: string, after: boolean) => {
		setColOrder((o) => {
			if (k === target) return o
			const n = o.filter((x) => x !== k)
			n.splice(n.indexOf(target) + (after ? 1 : 0), 0, k)
			saveOrder('ledger.cols', n); saveLayout(session, 'ledger.cols', n)
			const vis = n.filter((x) => COLS.some((c) => c.k === x && (c.k !== 'owner' || scope === ALL) && (wide || c.tier === 1 || c.k === 'act')))
			setColMsg(`ستونِ «${COLS.find((c) => c.k === k)?.t || 'اقدام‌ها'}» به جایگاهِ ${fa(vis.indexOf(k) + 1)} از ${fa(vis.length)} رفت`)
			return n
		})
	}, [session, scope, wide])
	const cols = useMemo(() => colOrder.map((k) => COLS.find((c) => c.k === k)!).filter((c) => c && (c.k !== 'owner' || scope === ALL) && (wide || c.tier === 1 || c.k === 'act')), [colOrder, scope, wide])
	const [cur, setCur] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
	const [edit, setEdit] = useState<{ key: string; col: ColK } | null>(null)
	const [stageFor, setStageFor] = useState<string | null>(null)
	const pendingFocus = useRef<{ key: string; col: ColK } | null>(null)
	const grid = useRef<HTMLDivElement>(null)
	useLayoutEffect(() => {
		const pf = pendingFocus.current
		if (!pf) return
		const r = rows.findIndex((x) => x.key === pf.key), c = cols.findIndex((x) => x.k === pf.col)
		if (r >= 0 && c >= 0) { pendingFocus.current = null; setCur({ r, c }); setEdit({ key: pf.key, col: pf.col }) }
	}, [rows, cols])
	useEffect(() => { setCur((x) => ({ r: Math.min(x.r, Math.max(0, rows.length - 1)), c: Math.min(x.c, cols.length - 1) })) }, [rows.length, cols.length])
	// تغییرِ فیلتر/ماه/کارشناس ← از بالای نتایج (ویرایشِ داده جای اسکرول را نگه می‌دارد)
	useEffect(() => { if (grid.current) grid.current.scrollTop = 0; setCur((x) => ({ r: 0, c: x.c })) }, [f, gm, scope])

	const startEdit = useCallback((ri: number, ci: number) => {
		const r = rows[ri], c = cols[ci]
		if (!r || !c || !c.edit) return false
		// پنلِ نقش‌ها/بستنِ مالی برای فاکتورِ بسته هم باز می‌شود (فقط‌خواندنی + بازگشایی)
		if (c.edit === 'stage' && (canEdit(r) || isLocked(r.d) || (viewFy === LEDGER_FY && funnelOf(r.d) === 'won'))) { setCur({ r: ri, c: ci }); setStageFor(r.key); return true }
		if (!canEdit(r)) return false
		if (c.k === 'no' && String(r.d.no || '').trim()) return false // شمارهٔ فاکتور پس از ثبت قفل است
		setCur({ r: ri, c: ci })
		if (c.edit === 'stage') { setStageFor(r.key); return true }
		setEdit({ key: r.key, col: c.k })
		return true
	}, [rows, cols, canEdit, viewFy])
	const editableCols = useMemo(() => cols.map((c, i) => (c.edit ? i : -1)).filter((i) => i >= 0), [cols])
	/** Tab / Shift+Tab: خانهٔ ویرایش‌پذیرِ بعدی/قبلی (پایانِ ردیف ← ردیفِ بعد) */
	const stepEdit = useCallback((ri: number, ci: number, dir: 1 | -1) => {
		let r = ri, idx = editableCols.indexOf(ci)
		for (let guard = 0; guard < 400; guard++) {
			idx += dir
			if (idx >= editableCols.length) { idx = 0; r++ } else if (idx < 0) { idx = editableCols.length - 1; r-- }
			if (r < 0 || r >= rows.length) return false
			if (cols[editableCols[idx]].edit !== 'stage') { setEdit(null); if (startEdit(r, editableCols[idx])) return true }
		}
		return false
	}, [editableCols, rows.length, cols, startEdit])
	const endEdit = useCallback(() => { setEdit(null); requestAnimationFrame(() => grid.current?.focus({ preventScroll: true })) }, [])

	const commitCell = useCallback((r: Row, col: ColK, v: string) => {
		const d = r.d
		if (col === 'name' && v !== (d.name || '')) patch(r, { name: v })
		else if (col === 'amount') { const raw = rawDigits(v); if (raw !== rawDigits(d.amount)) patch(r, { amount: raw }) }
		else if (col === 'month' && +v !== monthOf(d)) patch(r, { month: +v })
		else if (col === 'settle' && v !== (d.settle || 'cash')) patch(r, { settle: v })
		else if (col === 'kind' && v !== (d.kind || 'new')) patch(r, { kind: v })
		else if (col === 'channel' && v !== (d.channel || 'official')) patch(r, { channel: v })
		else if (col === 'leadGen' && v !== (d.leadGen || '')) {
			let s = stagesOf({ ...d })
			if (v) s = s.filter((x) => x !== 'lead'); else if (!s.includes('lead')) s.push('lead')
			patch(r, { leadGen: v, stages: ordStages(s), close: undefined })
		}
	}, [patch])

	const runNA = (r: Row, na: NA) => {
		if (!canEdit(r) && !isLocked(r.d) && na.k !== 'approve' && na.k !== 'submit') return
		const ri = rows.indexOf(r)
		if (na.k === 'check') patch(r, { settle: 'cash' }, 'وصولِ چک ثبت شد (تسویه: نقد)')
		else if (na.k === 'follow' || na.k === 'post') { const s = stagesOf(r.d); patch(r, { stages: ordStages([...s, na.k as StageKey]), close: undefined }, na.k === 'follow' ? 'مرحلهٔ «پیگیری» تیک خورد' : 'مرحلهٔ «پیگیری پس از فروش» تیک خورد') }
		else if (na.k === 'fin' || na.k === 'close' || na.k === 'approve' || na.k === 'submit') { setCur((x) => ({ ...x, r: ri })); setStageFor(r.key) }
		else if (na.k === 'hold') startEdit(ri, cols.findIndex((c) => c.k === 'settle'))
		else if (na.k === 'dupdel') delDeal(r)
	}

	const onGridKey = (e: RKE<HTMLDivElement>) => {
		if (edit || e.target !== e.currentTarget) return
		const { r, c } = cur
		const k = e.key
		const mv = (nr: number, nc: number) => { e.preventDefault(); setCur({ r: Math.max(0, Math.min(rows.length - 1, nr)), c: Math.max(0, Math.min(cols.length - 1, nc)) }) }
		if (k === 'ArrowDown') mv(r + 1, c)
		else if (k === 'ArrowUp') mv(r - 1, c)
		else if (k === 'ArrowLeft') mv(r, c + 1) // RTL: چپ = ستونِ بعدی
		else if (k === 'ArrowRight') mv(r, c - 1)
		else if (k === 'Home') mv(e.ctrlKey ? 0 : r, 0)
		else if (k === 'End') mv(e.ctrlKey ? rows.length - 1 : r, cols.length - 1)
		else if (k === 'PageDown') mv(r + 10, c)
		else if (k === 'PageUp') mv(r - 10, c)
		else if (k === 'Enter' || k === 'F2') {
			e.preventDefault()
			const row = rows[r], col = cols[c]
			if (col?.k === 'next' && row) { const na = naOf(row); if (na) runNA(row, na) }
			else startEdit(r, c)
		} else if (k === 'Tab') { if (stepEdit(r, c, e.shiftKey ? -1 : 1)) e.preventDefault() }
		else if (k === 'Delete' && e.shiftKey && rows[r]) { e.preventDefault(); delDeal(rows[r]) }
	}

	// «/» = جست‌وجو (وقتی در فیلدی نیستیم)
	const qRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement
			if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); qRef.current?.focus(); qRef.current?.select() }
		}
		window.addEventListener('keydown', h)
		return () => window.removeEventListener('keydown', h)
	}, [])

	const activeN = (['no', 'funnel', 'settle', 'kind', 'channel', 'leadGen', 'fin', 'att', 'q'] as const).filter((k) => f[k]).length + (gm !== 'all' ? 1 : 0)
	const clearAll = () => { setF({ ...NOF, sort: f.sort, dir: f.dir }); setQIn(''); setGm('all') }
	const setSort = (k: string) => setF((x) => (x.sort === k ? (x.dir === 1 ? { ...x, dir: -1 } : { ...x, sort: '', dir: 1 }) : { ...x, sort: k, dir: k === 'amount' || k === 'basis' ? -1 : 1 }))

	if (full === undefined) return <div className="space-y-3" aria-busy="true"><div className={`h-24 animate-pulse ${CARD}`} /><div className={`h-[520px] animate-pulse ${CARD}`} /></div>
	if (!full) return <div className={`${CARD} p-5 text-[13px]`}><p className="font-bold text-error">{loadErr || 'داده‌ای نیست.'}</p><button type="button" className={`mt-3 ${BTN_GHOST}`} onClick={load}>تلاشِ دوباره</button></div>

	const stageRow = stageFor ? allRows.find((r) => r.key === stageFor) || null : null
	const wt = T.weights

	return (
		<div className="space-y-3" dir="rtl">
			{prevNotice && (
				<div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-4 py-2.5 text-[12.5px] leading-6 ring-1 ring-inset ring-warning/30" role="status">
					<span>آخرین ایمپورتِ معاملات («{prevNotice.name}»): <b>{fa(prevNotice.fy.previous)}</b> ردیف از سال‌های قبل ({Object.keys(prevNotice.fy.years || {}).filter((y) => y !== LEDGER_FY).map((y) => fa(y)).join('، ')}) شناسایی و از دفترِ ۱۴۰۵ کنار گذاشته شد.</span>
					<button type="button" className={`${BTN} mr-auto min-h-8 px-3 text-foreground ring-1 ring-border hover:bg-muted`} onClick={() => { setSeenImp(prevNotice.ts); try { localStorage.setItem('aromin.c1n.seenImp', String(prevNotice.ts)) } catch { /* */ } }}>متوجه شدم</button>
				</div>
			)}

			<RowOrderContext.Provider value={rowOrder}><span className="sr-only" aria-live="polite">{rowOrder.message}</span><NaCtx.Provider value={naOf}>
			<Sortable id="ledger.tiles" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" itemClass={(c) => (((c.props as { className?: string }).className || '').match(/(md|xl):col-span-\d/g) || []).join(' ') + ' flex flex-col [&>*]:flex-1'}
				server={layoutSrv} labelOf={(k) => TILE_LABEL[k.replace(/^\.\$/, '')] || k}>
				<Tile key="c3" title="ترازنامه" code="C3">
					<Fig k="فروشِ ناخالص" v={sep(T.gross)} />
					<Fig k="مبنای پورسانت" v={sep(T.eligible)} />
					<Fig k="پورسانت" v={sep(T.payout)} strong />
				</Tile>
				<Tile key="c5" title="دستورِ پرداخت و معلق" code="C5·C6">
					<p className="text-[26px] font-extrabold leading-none text-success tabular-nums">{sep(T.payNow)}</p>
					<p className="mt-1 text-[11.5px] text-muted-foreground">قابلِ پرداختِ همین حالا (نقد)</p>
					<Split parts={[{ k: 'نقد', v: T.payNow, c: 'bg-success' }, { k: 'چک (پس از وصول)', v: T.payCheck, c: 'bg-warning' }, { k: 'معلق', v: T.payPend, c: 'bg-error' }]} />
				</Tile>
				<Tile key="c4" title="پورسانتِ هر حساب" code="C4">
					<Split parts={[{ k: 'رسمی', v: T.off, c: 'bg-secondary' }, { k: 'غیررسمی', v: T.uno, c: 'bg-primary' }]} big />
					<p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">سهمِ تکرارِ خرید از مبنا: {pct(T.eligible > 0 ? (T.rep / T.eligible) * 100 : 0)}</p>
				</Tile>
				<Tile key="c2" title="قیف" code="C2">
					<Funnel data={funnelReach(T.funnel).map(s => ({ ...s, label: FUNNEL.find(f => f.k === s.key)!.t }))} />
					<p className="mt-2 text-xs text-muted-foreground">تعداد رسیده به هر مرحله · شکست: {fa(T.funnel.lost.n)}</p>
				</Tile>
				<Tile key="w7" title="وزنِ هفت مرحلهٔ پورسانت" code="C1" className="md:col-span-2 xl:col-span-4">
					<StageWeights weights={wt} basis={T.byStage} />
				</Tile>
			{/* C1 — میزِ کار (نوارِ کنترلِ سال/ماه/کارشناس در خودِ دفتر ادغام شده) — خودش هم کاشیِ قابلِ جابه‌جایی است */}
			<section key="c1" className={`${CARD} relative md:col-span-2 xl:col-span-4`} aria-label="C1 دفترِ فاکتورها">
				<header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4">
					<div className="flex min-w-0 items-baseline gap-3">
						<h2 className="text-[15px] font-extrabold text-foreground">دفتر فاکتورها</h2>
						<span className="text-[11.5px] text-muted-foreground">بروز شده با اپ جدید</span>
					</div>
					{canApprove && <BulkApprove count={approvable.length} scope={scopeLabel} suggest={{ cash: T.payNow, pending: T.payCheck + T.payPend }} onApprove={bulkApprove} />}
				</header>
				<ControlStrip
					full={full} people={people} years={years} viewFy={viewFy} setViewFy={(y) => { setViewFy(y); setCur({ r: 0, c: 0 }) }} gm={gm} setGm={setGm}
					person={person} setPerson={(v) => { setPerson(v); setCur({ r: 0, c: 0 }) }} seeAll={seeAll} single={single} st={st}
				/>
				<div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
					<div className="relative min-w-[200px] flex-1">
						<input ref={qRef} value={qIn} onChange={(e) => setQIn(e.target.value)} placeholder="جست‌وجو: مشتری، شماره، لیدساز، منبع، کارشناس…" className={`${INPUT} min-h-9 pl-9`} aria-label="جست‌وجو" onKeyDown={(e) => { if (e.key === 'Escape') setQIn(''); if (e.key === 'ArrowDown') { e.preventDefault(); grid.current?.focus() } }} />
						<kbd className="pointer-events-none absolute left-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:block">/</kbd>
					</div>
					<input value={f.no} onChange={(e) => setF({ ...f, no: e.target.value })} placeholder="شماره فاکتور" aria-label="فیلترِ شماره فاکتور" dir="ltr" inputMode="numeric"
						className={`${INPUT_I} min-h-9 w-[140px] shrink-0 text-left text-[12.5px] tabular-nums ${f.no ? 'border-primary/60 bg-primary/5 font-bold' : ''}`} onKeyDown={(e) => { if (e.key === 'Escape') setF({ ...f, no: '' }) }} />
					<Sel v={f.funnel} on={(v) => setF({ ...f, funnel: v })} all="همهٔ مراحل" opts={FUNNEL.map((s) => ({ v: s.k, t: s.t }))} label="مرحله" />
					<Sel v={f.settle} on={(v) => setF({ ...f, settle: v })} all="همهٔ تسویه‌ها" opts={SETTLE} label="تسویه" />
					<Sel v={f.kind} on={(v) => setF({ ...f, kind: v })} all="جدید و تکرار" opts={KIND} label="نوع خرید" />
					{wide && <Sel v={f.channel} on={(v) => setF({ ...f, channel: v })} all="همهٔ حساب‌ها" opts={CHANNEL} label="حساب" />}
					{wide && <Sel v={f.leadGen} on={(v) => setF({ ...f, leadGen: v })} all="همهٔ لیدسازها" opts={leadNames.map((n) => ({ v: n, t: n }))} label="لیدساز" />}
					<Sel v={f.fin} on={(v) => setF({ ...f, fin: v })} all="تأیید مالی: همه" opts={[{ v: 'yes', t: 'تأییدشده' }, { v: 'no', t: 'بدون تأیید' }]} label="تأیید مالی" />
					<button type="button" className={`${BTN_GHOST} min-h-9`} disabled={!activeN} onClick={clearAll}>{activeN ? `پاک‌کردنِ فیلترها (${fa(activeN)})` : 'بدون فیلتر'}</button>
					<div className="mr-auto flex items-center gap-1" role="group" aria-label="نما">
						<Seg on={dens === 'comfortable'} click={() => setDens('comfortable')}>راحت</Seg>
						<Seg on={dens === 'compact'} click={() => setDens('compact')}>فشرده</Seg>
						<Seg on={wide} click={() => setWide((w) => !w)} title="ستون‌های ثانویه">{wide ? 'همهٔ ستون‌ها' : 'ستون‌های اصلی'}</Seg>
					</div>
				</div>
				{/* چیپ‌های توجه */}
				<div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
					{ATT.map((a) => (attCounts[a.k].n || f.att === a.k) ? (
						<Chip key={a.k} on={f.att === a.k} tone={a.k === 'check' ? 'warn' : a.k === 'fin' ? 'primary' : 'err'} click={() => setF({ ...f, att: f.att === a.k ? '' : a.k })} n={attCounts[a.k].n} t={a.t} sub={`${a.sig} · ${mil(attCounts[a.k].v)}`} />
					) : null)}
					{(attCounts.follow.n > 0 || f.att === 'follow') && <Chip on={f.att === 'follow'} tone="sec" click={() => setF({ ...f, att: f.att === 'follow' ? '' : 'follow' })} n={attCounts.follow.n} t="پیگیری لازم" sub="بازِ بدونِ پیگیری / بستهٔ بدونِ پس از فروش" />}
					{(attCounts.kindfix.n > 0 || f.att === 'kindfix') && (
						<span className="inline-flex items-center gap-1">
							<Chip on={f.att === 'kindfix'} tone="sec" click={() => setF({ ...f, att: f.att === 'kindfix' ? '' : 'kindfix' })} n={attCounts.kindfix.n} t="نوعِ خرید ≠ تاریخچه" sub="جدید/تکرار بر اساسِ خریدهای بستهٔ قبلی" />
							<button type="button" className={`${BTN} min-h-8 px-3 text-primary-ink ring-1 ring-primary/30 hover:bg-primary/10`} onClick={fixKinds}>اصلاح</button>
						</span>
					)}
					{!ATT.some((a) => attCounts[a.k].n) && !attCounts.follow.n && !attCounts.kindfix.n && <span className="text-[12px] text-success">همه‌چیز مرتب است — موردی برای پیگیری نیست.</span>}
					<span className="mr-auto text-[12px] text-muted-foreground tabular-nums" aria-live="polite">{fa(rows.length)} ردیف{rows.length < allRows.length ? ` از ${fa(allRows.length)}` : ''}</span>
					{single && viewFy === LEDGER_FY && <button type="button" className={`${BTN_PRIMARY} min-h-8`} onClick={addDeal}>+ فاکتور</button>}
				</div>

				{mobile ? (
					<CardList rows={rows} dup={dup} kindFix={kindFix} onEdit={(r, col) => { const ri = rows.indexOf(r); const ci = COLS.findIndex((c) => c.k === col); if (col === 'stage') setStageFor(r.key); else { setCur({ r: ri, c: ci }); setEdit({ key: r.key, col }) } }} onNA={runNA} edit={edit} commit={(r, col, v) => { commitCell(r, col, v); setEdit(null) }} cancel={() => setEdit(null)} leadNames={leadNames} scopeAll={scope === ALL} canEdit={canEdit} onDel={delDeal} />
				) : (
					<Grid
						gridRef={grid} rows={rows} cols={cols} dens={dens} moveCol={moveCol} cur={cur} setCur={setCur} edit={edit} dup={dup} kindFix={kindFix} sort={f.sort} dir={f.dir} setSort={setSort}
						onKey={onGridKey} startEdit={startEdit} onNA={runNA} canEdit={canEdit} onDel={delDeal} leadNames={leadNames} stageFor={stageFor}
						commit={(r, col, v) => commitCell(r, col, v)}
						endEdit={endEdit}
						step={(ri, ci, dir) => { if (!stepEdit(ri, ci, dir)) endEdit() }}
					/>
				)}
				<span className="sr-only" aria-live="polite">{colMsg}</span>
				{!rows.length && (
					<div className="p-8 text-center text-[13px] text-muted-foreground">
						{allRows.length ? <>با این فیلترها ردیفی نیست. <button type="button" className="font-bold text-primary-ink underline-offset-4 hover:underline" onClick={clearAll}>پاک‌کردنِ فیلترها</button></> : <>دفترِ ۱۴۰۵ خالی است — فایلِ معاملاتِ جولیو را ایمپورت کن{single ? ' یا «+ فاکتور» بزن' : ''}.</>}
					</div>
				)}
				{stageRow && (
					<StageEditor
						key={stageRow.key} row={stageRow} finNames={finNames} role={session.role} canEdit={canEdit(stageRow)} readOnlyYear={viewFy !== LEDGER_FY}
						mine={canDup || stageRow.pi === selfIdx} ops={docOps(stageRow)}
						onSave={(p) => { patch(stageRow, p); setStageFor(null); requestAnimationFrame(() => grid.current?.focus({ preventScroll: true })) }}
						onClose={() => { setStageFor(null); requestAnimationFrame(() => grid.current?.focus({ preventScroll: true })) }}
					/>
				)}
			</section>
			</Sortable>
			</NaCtx.Provider></RowOrderContext.Provider>

			{toast && (
				<div role="status" className={`fixed bottom-5 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] font-bold shadow-card ring-1 ring-inset ${toast.tone === 'err' ? 'bg-error text-primary-foreground ring-error' : 'bg-foreground text-background ring-foreground'}`}>
					<span>{toast.t}</span>
					{toast.undo && <button type="button" className={`rounded-md px-2 py-1 text-[12.5px] underline underline-offset-4 ${FOCUS}`} onClick={toast.undo}>بازگردانی</button>}
				</div>
			)}
		</div>
	)
}

/* ============================================================ اجزا */
function SaveBadge({ st, retry }: { st: ReturnType<typeof ledgerStatus>; retry: () => void }) {
	if (st.state === 'error') return <button type="button" onClick={retry} className={`${BTN} min-h-8 bg-error/10 px-3 text-error ring-1 ring-error/30`} title={st.error}>ذخیره نشد — تلاشِ دوباره</button>
	const t = st.state === 'saving' ? 'MariaDB — در حالِ ذخیره…' : st.state === 'pending' ? 'MariaDB — در صفِ ذخیره' : 'MariaDB — ذخیره شد'
	return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ring-inset ${st.state === 'idle' ? 'text-success ring-success/30' : 'text-muted-foreground ring-border'}`} aria-live="polite"><span className={`size-1.5 rounded-full ${st.state === 'idle' ? 'bg-success' : 'bg-muted-foreground'}`} />{t}</span>
}
function Tile({ title, code, children }: { title: string; code: string; className?: string; children: ReactNode }) {
	return (
		<section className={`${CARD} flex h-full flex-col p-4 pt-5`}>
			<header className="mb-3 flex items-center justify-between gap-2"><h3 className="text-[13px] font-extrabold text-foreground">{title}</h3><span className="text-[10.5px] font-bold text-muted-foreground">{code}</span></header>
			<div className="flex flex-1 flex-col">{children}</div>
		</section>
	)
}
const Fig = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
	<div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
		<span className="text-[12px] text-muted-foreground">{k}</span>
		<span dir="ltr" className={`tabular-nums ${strong ? 'text-[16px] font-extrabold text-primary-ink' : 'text-[13px] font-bold'}`}>{v}</span>
	</div>
)
function Split({ parts, big }: { parts: { k: string; v: number; c: string }[]; big?: boolean }) {
	const tot = parts.reduce((s, p) => s + Math.max(0, p.v), 0)
	return (
		<div className="mt-3">
			<div className={`flex overflow-hidden rounded-full bg-muted ${big ? 'h-3' : 'h-2'}`}>{parts.map((p) => <span key={p.k} className={p.c} style={{ width: tot ? `${(Math.max(0, p.v) / tot) * 100}%` : 0 }} />)}</div>
			<ul className="mt-2 space-y-1">
				{parts.map((p) => <li key={p.k} className="flex items-center gap-2 text-[12px]"><span className={`size-2 rounded-full ${p.c}`} /><span className="text-muted-foreground">{p.k}</span><span className="mr-auto font-bold tabular-nums">{sep(p.v)}</span></li>)}
			</ul>
		</div>
	)
}
function StageWeights({ weights, basis }: { weights: CommS['weights'] | null; basis: Record<string, number> }) {
	const sum = weights ? STAGE_KEYS.reduce((s, k) => s + (weights[k] || 0), 0) : 0
	const tot = Object.values(basis).reduce((s, v) => s + v, 0)
	return (
		<div>
			<div className="flex h-9 overflow-hidden rounded-md ring-1 ring-inset ring-border" aria-hidden>
				{STAGES.map((s, i) => (
					<span key={s.k} className={`grid place-items-center text-[11px] font-extrabold ${i % 2 ? 'bg-primary/20 text-primary-ink' : 'bg-primary/35 text-primary-ink'}`} style={{ flexGrow: (weights || DEFAULT_WEIGHTS)[s.k] || 0.5, flexBasis: 0 }} title={s.t}>
						{fa((weights || DEFAULT_WEIGHTS)[s.k])}٪
					</span>
				))}
			</div>
			<ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4 xl:grid-cols-7">
				{STAGES.map((s, i) => (
					<li key={s.k} className="min-w-0">
						<div className="truncate text-[12px] font-bold"><span className="text-muted-foreground">{fa(i + 1)}. </span>{s.t}</div>
						<div className="text-[11.5px] text-muted-foreground tabular-nums">وزن {weights ? fa(weights[s.k]) + '٪' : 'متفاوت'} · مبنا {mil(basis[s.k] || 0)}</div>
					</li>
				))}
			</ul>
			<p className={`mt-2 text-[11.5px] ${sum === 100 || !weights ? 'text-muted-foreground' : 'text-warning'}`}>
				{weights ? <>جمعِ وزن‌ها {fa(sum)}٪{sum === 100 ? ' ✓' : ' — معمولاً ۱۰۰٪'}</> : 'وزن‌های کارشناسان با هم فرق دارد؛ هر ردیف با وزنِ صاحبش حساب می‌شود.'} · جمعِ مبنای مراحل {sep(tot)}
			</p>
		</div>
	)
}
function Sel({ v, on, all, opts, label: lbl }: { v: string; on: (v: string) => void; all: string; opts: { v: string; t: string }[]; label: string }) {
	return (
		<select value={v} onChange={(e) => on(e.target.value)} aria-label={lbl} className={`${INPUT_I} min-h-9 w-auto min-w-[112px] max-w-[170px] shrink-0 text-[12.5px] ${v ? 'border-primary/60 bg-primary/5 font-bold' : ''}`}>
			<option value="">{all}</option>
			{opts.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
		</select>
	)
}
const Seg = ({ on, click, children, title }: { on: boolean; click: () => void; children: ReactNode; title?: string }) => (
	<button type="button" onClick={click} aria-pressed={on} title={title} className={`${BTN} min-h-8 px-2.5 ${on ? 'bg-primary/15 text-primary-ink ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-muted'}`}>{children}</button>
)
const CHIP_TONE: Record<string, string> = { err: 'text-error ring-error/30', warn: 'text-warning ring-warning/35', primary: 'text-primary-ink ring-primary/30', sec: 'text-secondary-ink ring-secondary/30' }
const Chip = ({ on, tone, click, n, t, sub }: { on: boolean; tone: string; click: () => void; n: number; t: string; sub: string }) => (
	<button type="button" onClick={click} aria-pressed={on} title={sub} className={`${BTN} min-h-8 gap-1.5 px-3 ring-1 ring-inset ${CHIP_TONE[tone]} ${on ? 'bg-muted ring-2' : 'bg-card hover:bg-muted'}`}>
		<b className="tabular-nums">{fa(n)}</b><span className="text-foreground">{t}</span>
	</button>
)

/* ---------- نمایشِ خانه‌ها (بدونِ کنترلِ فرم؛ کنترل فقط هنگامِ ویرایش) ---------- */
function StageBar({ d, S }: { d: Deal; S: CommS }) {
	const st = stagesOf(d), W = S.weights || DEFAULT_WEIGHTS
	return (
		<span className="flex h-2.5 w-full gap-[2px]" aria-hidden>
			{STAGES.map((s) => {
				const mine = st.includes(s.k)
				const other = (s.k === 'lead' && d.leadGen) || (s.k === 'post' && d.supportGen && d.supportSla) || (s.k === 'fin' && d.finBy)
				const half = s.k === 'close' && mine && d.mgrShare
				return <span key={s.k} className={`rounded-[2px] ${mine ? (half ? 'bg-gradient-to-l from-primary from-50% to-primary/25 to-50%' : 'bg-primary') : other ? 'bg-secondary/55' : 'bg-muted-foreground/15'}`} style={{ flexGrow: W[s.k] || 0.5, flexBasis: 0 }} />
			})}
		</span>
	)
}
function stageTitle(d: Deal, S: CommS) {
	const st = stagesOf(d), W = S.weights || DEFAULT_WEIGHTS
	return STAGES.map((s) => `${st.includes(s.k) ? '✓' : (s.k === 'lead' && d.leadGen) ? '→ ' + d.leadGen : (s.k === 'fin' && d.finBy) ? '→ ' + d.finBy : (s.k === 'post' && d.supportGen && d.supportSla) ? '→ ' + d.supportGen : '✗'} ${s.t} (${fa(W[s.k])}٪)`).join('\n')
}
function roleShort(d: Deal) {
	const st = stagesOf(d).join(',')
	const exact = [{ k: 'lead,pre,funnel,follow,close,post,fin', t: 'چرخهٔ کامل' }, { k: 'pre,funnel,follow,close,post,fin', t: 'به‌جز لید' }, { k: 'pre,funnel,follow,close', t: 'میانه تا بستن' }, { k: 'follow,close', t: 'مشارکت در بستن' }, { k: 'close', t: 'بستن قرارداد' }, { k: 'lead', t: 'ایجاد لید' }, { k: 'lead,pre', t: 'لید و پیش‌فاکتور' }].find((x) => x.k === st)
	return exact ? exact.t : 'ترکیبی'
}

function CellView({ r, col, dup, kindFix, onNA, canEdit, onDel }: { r: Row; col: ColK; dup: Set<string>; kindFix: (r: Row) => string; onNA: (r: Row, n: NA) => void; canEdit: boolean; onDel: (r: Row) => void }) {
	const d = r.d
	const naOfRow = useContext(NaCtx)
	switch (col) {
		case 'name': {
			const st = finStateOf(d)
			return (
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className={`truncate text-[13px] font-bold ${d.name ? 'text-foreground' : 'text-muted-foreground'}`} title={d.name}>{d.name || 'نام مشتری'}</span>
					<span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
						<span className="truncate">{MONTHS[monthOf(d)]}</span>
						{st !== 'draft' && <StateBadge st={st} />}
					</span>
				</span>
			)
		}
		case 'amount': {
			const a = num(d.amount)
			return <span className="flex flex-col items-start gap-0.5"><span className={`text-[13.5px] font-extrabold tabular-nums ${a ? '' : 'text-muted-foreground'}`}>{faGroup(d.amount) || '۰'}</span><span className="text-[11px] text-muted-foreground">{a ? mil(a) : ''}</span></span>
		}
		case 'stage': {
			const fk = funnelOf(d), won = fk === 'won'
			return (
				<span className="flex w-full min-w-0 flex-col gap-1" title={stageTitle(d, r.S)}>
					<span className="flex min-w-0 items-center gap-1.5">
						<span className={`${BADGE} ${FUN_TONE[fk] || FUN_TONE.advance}`}>{funLabel(fk)}</span>
						<span className={`text-[12.5px] font-extrabold tabular-nums ${won ? 'text-primary-ink' : 'text-muted-foreground'}`}>{won ? fa(Math.round(wDeal(d, r.S.weights || DEFAULT_WEIGHTS))) + '٪' : 'بدون پورسانت'}</span>
						<span className="mr-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">نقش {fa(roleCount(d))}/{fa(STAGES.length)}{d.mgrShare ? ' · مدیر' : ''}</span>
					</span>
					<StageBar d={d} S={r.S} />
					<span className={`flex min-w-0 items-center gap-1 truncate text-[11px] ${d.finBy ? 'text-success' : won ? 'text-warning' : 'text-muted-foreground'}`}>{d.finBy ? '✓ تأیید مالی: ' + d.finBy : won ? 'بدونِ تأیید مالی' : '—'}</span>
				</span>
			)
		}
		case 'settle': {
			const s = (d.settle as string) || 'cash'
			return <span className="flex flex-col gap-0.5"><span className="truncate text-[12.5px] font-bold">{label(SETTLE, s)}</span><span className={`text-[11px] ${s === 'hold' ? 'text-error' : s === 'check' ? 'text-warning' : 'text-success'}`}>{s === 'hold' ? 'بدون پورسانت' : s === 'check' ? 'پس از وصول' : 'تسویه‌شده'}</span></span>
		}
		case 'next': {
			const na = naOfRow(r)
			if (!na || ['approve', 'submit', 'close'].includes(na.k)) return <span className="text-[12px] text-muted-foreground">{isLocked(d) ? FIN_STATE_LABEL[finStateOf(d)] : 'بدون اقدام'}</span>
			return <button type="button" tabIndex={-1} disabled={!canEdit} title={na.hint} onClick={(e) => { e.stopPropagation(); onNA(r, na) }} className={`${BTN} min-h-8 max-w-full truncate px-2.5 text-[12px] ring-1 ring-inset ${NA_TONE[na.tone]}`}>{na.t}</button>
		}
		case 'owner': return <span className="truncate text-[12.5px]">{r.p.name}</span>
		case 'leadGen': return <span className="flex min-w-0 flex-col gap-0.5"><span className={`truncate text-[12.5px] ${d.leadGen ? 'font-bold' : 'text-muted-foreground'}`}>{d.leadGen || '— خودِ کارشناس'}</span>{d.leadGen && <span className="text-[11px] text-muted-foreground">سهمِ لید {fa((r.S.weights || DEFAULT_WEIGHTS).lead)}٪</span>}</span>
		case 'role': return <span className="flex flex-col gap-0.5"><span className="truncate text-[12.5px] font-bold">{roleShort(d)}</span><span className="text-[11px] text-muted-foreground tabular-nums">{fa(roleCount(d))} از {fa(STAGES.length)} مرحله</span></span>
		case 'kind': {
			const k = (d.kind as string) || 'new', fix = kindFix(r)
			return (
				<span className="flex flex-col items-start gap-0.5">
					<span className={`${BADGE} ${k === 'repeat' ? 'bg-success/10 text-success ring-success/30' : 'bg-secondary/10 text-secondary-ink ring-secondary/30'}`}>{k === 'repeat' ? 'تکرار خرید' : 'مشتری جدید'}</span>
					{fix && <span className="text-[10.5px] text-warning" title="بر اساسِ خریدهای بستهٔ قبلیِ همین مشتری">تاریخچه: {fix === 'repeat' ? 'تکرار' : 'جدید'}</span>}
				</span>
			)
		}
		case 'channel': {
			const c = (d.channel as string) || 'official'
			return <span className="flex flex-col gap-0.5"><span className="text-[12.5px] font-bold">{label(CHANNEL, c)}</span><span className="text-[11px] text-muted-foreground">{c === 'official' ? `−${fa(r.S.officialDeduct ?? 10)}٪ ارزش افزوده` : 'بدون کسر'}</span></span>
		}
		case 'basis': {
			const b = rowBasis(d, r.S), won = funnelOf(d) === 'won'
			return (
				<span className="flex flex-col items-start gap-0.5">
					<span className={`text-[13px] font-extrabold tabular-nums ${!won || b.held ? 'text-muted-foreground' : 'text-primary-ink'}`}>{won ? sep(b.basis) : '—'}</span>
					<span className="text-[11px] text-muted-foreground">{!won ? 'باز — بدون پورسانت' : b.held ? 'معلق' : `${fa(Math.round(b.w * 100))}٪ از ${mil(commAmount(d, r.S))}`}</span>
				</span>
			)
		}
		case 'follow': {
			const need = followNeed(d)
			return (
				<span className="flex flex-col gap-0.5 text-[11.5px]">
					<span className="tabular-nums">پیگیری {fa(d.taskFollow || 0)} · پس‌ازفروش {fa(d.taskPost || 0)}</span>
					{need ? <span className="text-secondary-ink font-bold">{need === 'follow' ? 'پیگیری لازم' : 'پس از فروش لازم'}</span> : <span className="text-muted-foreground">{d.supportGen ? 'پشتیبان: ' + d.supportGen : '—'}</span>}
				</span>
			)
		}
		case 'no': {
			const isDup = isInvoice(d) && dup.has(invoiceKey(d.no))
			return d.no
				? <span className="flex min-w-0 flex-col gap-0.5"><span className="flex min-w-0 items-center gap-1 text-[13px] font-bold tabular-nums" dir="ltr" title="شمارهٔ فاکتور (سیما) — غیرقابلِ تغییر"><LockIcon className="size-3 shrink-0 text-muted-foreground" /><span className="truncate">{d.no}</span><span className="sr-only">قفل</span></span>{isDup && <span className={`${BADGE} bg-error/10 text-error ring-error/30`} title="همین شماره در فاکتورِ (معاملهٔ بستهٔ) دیگری هم آمده">فاکتورِ تکراری</span>}</span>
				: <span className="text-[12.5px] text-muted-foreground">بدون شماره</span>
		}
		case 'month': return <span className="text-[12.5px]">{MONTHS[monthOf(d)]}</span>
		case 'act':
			return (
				<span className="flex items-center gap-1">
					{canEdit && <button type="button" tabIndex={-1} title="حذف (قابلِ بازگردانی)" aria-label="حذف" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-error/10 hover:text-error" onClick={(e) => { e.stopPropagation(); onDel(r) }}>×</button>}
				</span>
			)
	}
}

/* ---------- ویرایشگرِ خانه: Enter ذخیره · Esc انصراف · Tab/Shift+Tab بعدی/قبلی ---------- */
function CellEditor({ r, col, leadNames, onCommit, onCancel, onStep }: { r: Row; col: ColK; leadNames: string[]; onCommit: (v: string) => void; onCancel: () => void; onStep: (v: string, dir: 1 | -1) => void }) {
	const d = r.d
	const init = col === 'amount' ? faGroup(d.amount) : col === 'month' ? String(monthOf(d)) : col === 'settle' ? String(d.settle || 'cash') : col === 'kind' ? String(d.kind || 'new') : col === 'channel' ? String(d.channel || 'official') : String((d as any)[col] ?? '')
	const [v, setV] = useState(init)
	const done = useRef(false)
	const key = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') { e.preventDefault(); done.current = true; onCommit(v) }
		else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel() }
		else if (e.key === 'Tab') { e.preventDefault(); done.current = true; onStep(v, e.shiftKey ? -1 : 1) }
		e.stopPropagation()
	}
	const blur = () => { if (!done.current) { done.current = true; onCommit(v) } }
	const cls = `${INPUT} min-h-9 h-9 px-2 text-[13px]`
	const ref = useCallback((el: HTMLInputElement | HTMLSelectElement | null) => { if (el) { el.focus({ preventScroll: true }); if (el instanceof HTMLInputElement) el.select() } }, [])
	if (col === 'month' || col === 'settle' || col === 'kind' || col === 'channel' || col === 'leadGen') {
		const opts = col === 'month' ? MONTHS.map((m, i) => ({ v: String(i), t: m })) : col === 'settle' ? SETTLE : col === 'kind' ? KIND : col === 'channel' ? CHANNEL : [{ v: '', t: '— خودِ کارشناس' }, ...leadNames.map((n) => ({ v: n, t: n })), ...(d.leadGen && !leadNames.includes(d.leadGen) ? [{ v: d.leadGen, t: d.leadGen }] : [])]
		// انتخاب با ماوس = ذخیرهٔ فوری (کمترین کلیک)؛ با کیبورد، Enter ذخیره می‌کند
		return <select ref={ref} value={v} className={cls} aria-label={COLS.find((c) => c.k === col)?.t} onChange={(e) => setV(e.target.value)} onKeyDown={key} onBlur={blur} onClick={(e) => e.stopPropagation()}>{opts.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</select>
	}
	return (
		<input ref={ref} value={v} dir={col === 'amount' || col === 'no' ? 'ltr' : undefined} inputMode={col === 'amount' ? 'numeric' : undefined} aria-label={COLS.find((c) => c.k === col)?.t} className={`${cls} ${col === 'amount' ? 'text-left tabular-nums' : ''}`}
			onChange={(e) => setV(col === 'amount' ? faGroup(e.target.value) : e.target.value)} onKeyDown={key} onBlur={blur} onClick={(e) => e.stopPropagation()} />
	)
}

/* ---------- جدولِ مجازی ---------- */
interface GridProps {
	gridRef: React.RefObject<HTMLDivElement | null>; rows: Row[]; cols: Col[]; dens: 'comfortable' | 'compact'; cur: { r: number; c: number }; setCur: (x: { r: number; c: number }) => void
	edit: { key: string; col: ColK } | null; dup: Set<string>; kindFix: (r: Row) => string; sort: string; dir: 1 | -1; setSort: (k: string) => void; onKey: (e: RKE<HTMLDivElement>) => void
	startEdit: (ri: number, ci: number) => boolean; onNA: (r: Row, n: NA) => void; canEdit: (r: Row) => boolean; onDel: (r: Row) => void; leadNames: string[]; stageFor: string | null
	commit: (r: Row, col: ColK, v: string) => void; endEdit: () => void; step: (ri: number, ci: number, dir: 1 | -1) => void
	moveCol: (k: string, target: string, after: boolean) => void
}
function Grid(P: GridProps) {
	const { gridRef, rows, cols, dens, cur } = P
	const [dragCol, setDragCol] = useState<{ k: string; over: string; after: boolean } | null>(null)
	const startColDrag = (k: string) => (e: React.PointerEvent) => {
		if (e.button !== 0) return
		e.preventDefault(); e.stopPropagation()
		let cur = { k, over: k, after: false }
		setDragCol(cur)
		const pick = (x: number, y: number) => {
			const h = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-colk]')
			if (!h) return
			const r = h.getBoundingClientRect()
			cur = { k, over: h.dataset.colk!, after: x < r.left + r.width / 2 } // RTL: چپ = بعد
			setDragCol(cur)
		}
		const mv = (ev: PointerEvent) => pick(ev.clientX, ev.clientY)
		const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (cur.over !== k) P.moveCol(k, cur.over, cur.after); setDragCol(null) }
		window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
	}
	const colKey = (i: number) => (e: React.KeyboardEvent) => {
		const d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0 // RTL
		if (!d) return
		e.preventDefault(); e.stopPropagation()
		const t = cols[i + d]
		if (t) { P.moveCol(cols[i].k, t.k, d > 0); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-colgrip="${cols[i].k}"]`)?.focus()) }
	}
	const rh = dens === 'compact' ? 50 : 70, hh = 44
	// فقط وقتی پنجرهٔ ردیف‌های دیده‌شده عوض شود دوباره رندر می‌شود (نه در هر فریمِ اسکرول)
	const [first, setFirst] = useState(0)
	const [vh, setVh] = useState(640)
	useEffect(() => {
		const el = P.gridRef.current
		if (!el) return
		const ro = new ResizeObserver(() => setVh(el.clientHeight))
		ro.observe(el); setVh(el.clientHeight)
		return () => ro.disconnect()
	}, [P.gridRef])
	const raf = useRef(0)
	const onScroll = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => { const f = Math.floor((P.gridRef.current?.scrollTop || 0) / rh / 4) * 4; setFirst((x) => (x === f ? x : f)) }) }
	// خانهٔ فعال همیشه دیده شود
	useEffect(() => {
		const el = gridRef.current
		if (!el) return
		const y = cur.r * rh
		if (y < el.scrollTop) el.scrollTop = y
		else if (y + rh > el.scrollTop + el.clientHeight - hh) el.scrollTop = y + rh - el.clientHeight + hh
		const c = el.querySelector<HTMLElement>(`[data-cell="${cur.r}-${cur.c}"]`)
		if (c && !c.dataset.sticky) {
			const cr = c.getBoundingClientRect(), gr = el.getBoundingClientRect(), stick = (cols[0]?.w || 0) + (cols[1]?.w || 0)
			if (cr.left < gr.left) el.scrollLeft -= gr.left - cr.left + 8
			else if (cr.right > gr.right - stick) el.scrollLeft += cr.right - (gr.right - stick) + 8
		}
	}, [cur.r, cur.c, rh, gridRef, cols])
	const width = cols.reduce((s, c) => s + c.w, 0)
	const tpl = cols.map((c) => c.w + 'px').join(' ')
	const start = Math.max(0, first - 8), end = Math.min(rows.length, first + Math.ceil(vh / rh) + 12)
	const stickyAt = (i: number) => (i === 0 ? 0 : i === 1 ? cols[0].w : null)
	const activeId = rows[cur.r] ? `c1c-${cur.r}-${cur.c}` : undefined
	return (
		<div
			ref={gridRef} tabIndex={0} role="grid" aria-label="دفترِ فاکتورهای ۱۴۰۵" aria-rowcount={rows.length + 1} aria-colcount={cols.length} aria-activedescendant={activeId}
			onKeyDown={P.onKey} onScroll={onScroll}
			className={`relative mt-2 max-h-[min(74vh,860px)] min-h-[320px] overflow-auto overscroll-contain outline-none [contain:strict] [transform:translateZ(0)] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/25`}
			style={{ height: Math.min(rows.length * rh + hh + 2, 860) }}>
			<div style={{ width, height: rows.length * rh + hh, position: 'relative' }}>
				<div role="row" aria-rowindex={1} className="sticky top-0 z-20 grid border-b border-border bg-muted text-[11.5px] font-bold text-muted-foreground" style={{ gridTemplateColumns: tpl, height: hh }}>
					{cols.map((c, i) => {
						const s = stickyAt(i)
						const on = P.sort === c.k
						return (
							<div key={c.k} role="columnheader" data-colk={c.k} aria-sort={on ? (P.dir === 1 ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}
								className={`group/col flex items-center gap-1 px-2.5 ${s !== null ? 'sticky z-10 bg-muted' : ''} ${i === 1 ? 'border-l border-border' : ''} ${c.tier === 1 ? 'text-foreground' : ''} ${dragCol?.k === c.k ? 'bg-primary/10 text-primary-ink' : ''} ${dragCol && dragCol.over === c.k && dragCol.k !== c.k ? (dragCol.after ? 'shadow-[inset_-3px_0_0_hsl(var(--primary))]' : 'shadow-[inset_3px_0_0_hsl(var(--primary))]') : ''}`} style={s !== null ? { right: s } : undefined}>
								<button type="button" data-colgrip={c.k} aria-label={`جابه‌جاییِ ستونِ «${c.t || 'اقدام‌ها'}» (بکشید یا ←/→)`} title="برای جابه‌جاییِ ستون بکشید (یا ←/→)" onPointerDown={startColDrag(c.k)} onKeyDown={colKey(i)}
									className="grid h-6 w-3.5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground opacity-40 transition hover:bg-card hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:cursor-grabbing group-hover/col:opacity-90">
									<svg viewBox="0 0 6 14" className="h-3.5 w-1.5" fill="currentColor" aria-hidden><circle cx="1.5" cy="2" r="1.1" /><circle cx="4.5" cy="2" r="1.1" /><circle cx="1.5" cy="7" r="1.1" /><circle cx="4.5" cy="7" r="1.1" /><circle cx="1.5" cy="12" r="1.1" /><circle cx="4.5" cy="12" r="1.1" /></svg>
								</button>
								{c.sort ? <button type="button" tabIndex={-1} onClick={() => P.setSort(c.k)} className="inline-flex items-center gap-1 rounded hover:text-foreground">{c.t}<span aria-hidden className="text-[10px]">{on ? (P.dir === 1 ? '▲' : '▼') : '↕'}</span></button> : c.t}
							</div>
						)
					})}
				</div>
				{rows.slice(start, end).map((r, j) => {
					const ri = start + j
					return (
						<GridRow key={r.key} r={r} ri={ri} y={hh + ri * rh} h={rh} tpl={tpl} cols={cols} curC={cur.r === ri ? cur.c : -1} editCol={P.edit && P.edit.key === r.key ? P.edit.col : null}
							dup={P.dup} kindFix={P.kindFix} canEdit={P.canEdit(r)} P={P} staging={P.stageFor === r.key} stickyAt={stickyAt} />
					)
				})}
			</div>
		</div>
	)
}
const GridRow = memo(function GridRow({ r, ri, y, h, tpl, cols, curC, editCol, dup, kindFix, canEdit, P, staging, stickyAt }: {
	r: Row; ri: number; y: number; h: number; tpl: string; cols: Col[]; curC: number; editCol: ColK | null; dup: Set<string>; kindFix: (r: Row) => string; canEdit: boolean; P: GridProps; staging: boolean; stickyAt: (i: number) => number | null
}) {
	const att = attPrimary(r.d, dup)
	const sel = curC >= 0
	const rowBg = editCol || staging ? 'bg-primary/[0.07]' : sel ? 'bg-primary/[0.04]' : ''
	return (
		<div data-order-row={rowOrderKey(r)} role="row" aria-rowindex={ri + 2} aria-selected={sel} className={`group/row absolute inset-x-0 top-0 grid border-b border-border/70 [contain:layout_paint] ${rowBg} hover:bg-muted/50`} style={{ transform: `translateY(${y}px)`, height: h, gridTemplateColumns: tpl }}>
			{cols.map((c, ci) => {
				const s = stickyAt(ci)
				const active = curC === ci
				const editing = editCol === c.k
				return (
					<div
						key={c.k} id={`c1c-${ri}-${ci}`} data-cell={`${ri}-${ci}`} data-sticky={s !== null ? '1' : undefined} role="gridcell" aria-readonly={!c.edit || !canEdit}
						onClick={() => { if (active && c.edit) P.startEdit(ri, ci); else P.setCur({ r: ri, c: ci }) }}
						onDoubleClick={() => P.startEdit(ri, ci)}
						className={`relative flex min-w-0 items-center overflow-hidden px-2.5 ${s !== null ? 'sticky z-10 bg-card group-hover/row:bg-muted' : ''} ${ci === 0 && att ? 'border-r-[3px] ' + (att === 'check' ? 'border-r-warning' : att === 'fin' ? 'border-r-primary' : 'border-r-error') : ''} ${ci === 1 ? 'border-l border-border' : ''} ${active ? 'outline outline-2 -outline-offset-2 outline-primary/60' : ''} ${c.edit && canEdit ? 'cursor-text' : ''}`}
						style={s !== null ? { right: s, ...(rowSel(sel, editCol, staging)) } : undefined}>
						{c.k === 'no' && <RowGrip rowKey={rowOrderKey(r)} />}{editing ? (
							<CellEditor r={r} col={c.k} leadNames={P.leadNames} onCommit={(v) => { P.commit(r, c.k, v); P.endEdit() }} onCancel={P.endEdit} onStep={(v, dir) => { P.commit(r, c.k, v); P.step(ri, ci, dir) }} />
						) : (
							<>
								<CellView r={r} col={c.k} dup={dup} kindFix={kindFix} onNA={P.onNA} canEdit={canEdit} onDel={P.onDel} />
								{c.edit && canEdit && !(c.k === 'no' && String(r.d.no || '').trim()) && <button type="button" tabIndex={-1} aria-label={'ویرایشِ ' + c.t} onClick={(e) => { e.stopPropagation(); P.startEdit(ri, ci) }} className="absolute inset-y-1 left-1 hidden w-6 place-items-center rounded text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary-ink group-hover/row:grid">✎</button>}
							</>
						)}
					</div>
				)
			})}
		</div>
	)
})
/** سلول‌های چسبان باید رنگِ حالتِ ردیف را هم داشته باشند (پس‌زمینهٔ کدر، بدونِ رنگِ ثابت) */
const rowSel = (sel: boolean, edit: ColK | null, staging: boolean) => (edit || staging ? { backgroundImage: 'linear-gradient(hsl(var(--primary) / .07), hsl(var(--primary) / .07))' } : sel ? { backgroundImage: 'linear-gradient(hsl(var(--primary) / .04), hsl(var(--primary) / .04))' } : {})

/* ---------- نقش‌ها (الگوی Checkbox Todo List) + بستنِ مالی (الگوی Checkbox11) — پنلِ چسبیده به پایینِ جدول؛ Enter ذخیره، Esc انصراف ---------- */
function StageEditor({ row, finNames, role, canEdit, readOnlyYear, mine, ops, onSave, onClose }: {
	row: Row; finNames: string[]; role: string; canEdit: boolean; readOnlyYear: boolean; mine: boolean; ops: DocOps; onSave: (p: Partial<Deal>) => void; onClose: () => void
}) {
	const d = row.d, W = row.S.weights || DEFAULT_WEIGHTS
	const locked = isLocked(d)
	const [funnel, setFunnel] = useState<string>(funnelOf(d))
	const [st, setSt] = useState<StageKey[]>(stagesOf(d))
	const [mgr, setMgr] = useState(!!d.mgrShare)
	const [finBy, setFinBy] = useState(String(d.finBy || ''))
	const finLocked = !!d.finBy && role === 'finance'
	const draft: Deal = { ...d, funnel, stages: st, mgrShare: mgr, finBy: finBy || undefined }
	const w = wDeal(draft, W)
	const b = rowBasis(draft, row.S)
	const done = STAGES.filter((s) => st.includes(s.k) && !otherOf(d, s.k, finBy)).length
	const box = useRef<HTMLDivElement>(null)
	useEffect(() => { box.current?.querySelector<HTMLElement>('select:not(:disabled),input:not(:disabled),button')?.focus({ preventScroll: true }); box.current?.scrollIntoView({ block: 'nearest' }) }, [])
	const save = () => {
		const p: Partial<Deal> = {}
		if (funnel !== funnelOf(d)) p.funnel = funnel
		if (ordStages(st).join() !== ordStages(stagesOf(d)).join() || d.close) { p.stages = ordStages(st); p.close = undefined }
		if (mgr !== !!d.mgrShare) p.mgrShare = mgr
		if (finBy !== String(d.finBy || '')) p.finBy = finBy
		if (Object.keys(p).length) onSave(p); else onClose()
	}
	const key = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') { e.preventDefault(); onClose() }
		else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement && e.target.type !== 'checkbox')) { e.preventDefault(); if (canEdit) save() }
	}
	return (
		<div ref={box} role="dialog" aria-modal="false" aria-label={`نقش‌ها و بستنِ مالیِ «${d.name || d.no || ''}»`} onKeyDown={key} className="sticky bottom-0 z-30 border-t border-border bg-card p-4 shadow-card sm:p-5">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<b className="min-w-0 truncate text-[14px]">{d.name || 'بی‌نام'}</b>
				<span className="text-[12px] text-muted-foreground tabular-nums">{d.no ? '#' + d.no : ''} · {faGroup(d.amount) || '۰'} تومان</span>
				<span className="mr-auto text-[13px] font-extrabold text-primary-ink tabular-nums" aria-live="polite">{funnel === 'won' ? `وزن ${fa(Math.round(w))}٪ · مبنا ${sep(b.basis)}` : 'باز — بدون پورسانت'}</span>
			</div>
			<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
				{/* نقش‌ها — هفت مرحله با وزن (چک‌لیست) */}
				<section aria-label="نقش‌ها در این معامله" className="min-w-0 rounded-md border border-border p-4">
					<div className="flex items-center justify-between gap-2">
						<h4 className="text-[13.5px] font-bold text-foreground">نقش‌ها در این معامله</h4>
						<span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-foreground">{fa(done)}/{fa(STAGES.length)}</span>
					</div>
					<div className="mt-3">
						<div className="flex items-center justify-between text-[11.5px] text-muted-foreground"><span>سهمِ این کارشناس از وزن</span><span className="tabular-nums">{fa(Math.round(w))}٪</span></div>
						<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)} aria-label="وزنِ معامله">
							<motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${Math.min(100, w)}%` }} transition={{ duration: 0.25, ease: 'easeInOut' }} />
						</div>
					</div>
					<ul className="mt-3 space-y-1.5">
						{STAGES.map((s) => {
							const other = otherOf(d, s.k, finBy)
							const on = st.includes(s.k) && !other
							const id = `stg-${d.id}-${s.k}`
							const dis = !canEdit || !!other
							return (
								<li key={s.k} className={`flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 transition-colors ${on ? 'border-primary/35 bg-primary/[0.06]' : 'border-border bg-card hover:bg-muted/60'} ${dis ? 'opacity-80' : ''}`}>
									<input id={id} type="checkbox" className="size-4 shrink-0" checked={on} disabled={dis} onChange={(e) => setSt((x) => (e.target.checked ? ordStages([...x, s.k]) : x.filter((k) => k !== s.k)))} />
									<label htmlFor={id} className={`flex min-w-0 flex-1 items-baseline justify-between gap-2 text-[13px] ${dis ? 'cursor-not-allowed' : 'cursor-pointer'} ${on ? 'font-bold text-foreground' : 'text-foreground'}`}>
										<span className="min-w-0 break-words">{s.t}{other && <span className="block text-[11.5px] font-normal text-muted-foreground">سهمِ این مرحله با «{other}»</span>}</span>
										<span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{fa(W[s.k])}٪</span>
									</label>
								</li>
							)
						})}
					</ul>
					<label className="mt-3 inline-flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="size-4" checked={mgr} disabled={!canEdit} onChange={(e) => setMgr(e.target.checked)} />مشارکتِ مدیر در بستن (نصفِ وزنِ بستن)</label>
				</section>

				<div className="flex min-w-0 flex-col gap-4">
					<label className="flex flex-col gap-1.5 text-[12px] font-bold text-muted-foreground">مرحلهٔ قیف
						<select className={`${INPUT} min-h-10`} value={funnel} disabled={!canEdit} onChange={(e) => setFunnel(e.target.value)}>{FUNNEL.map((s) => <option key={s.k} value={s.k}>{s.t}</option>)}</select>
					</label>
					<label className="flex flex-col gap-1.5 text-[12px] font-bold text-muted-foreground">تأیید مالی و صحتِ داده
						<select className={`${INPUT} min-h-10`} value={finBy} disabled={!canEdit || finLocked} title={finLocked ? 'تأیید مالی ثبت شده — فقط مدیر تغییر می‌دهد' : undefined} onChange={(e) => setFinBy(e.target.value)}>
							<option value="">— بدون تأیید مالی</option>
							{finNames.map((n) => <option key={n} value={n}>{n}</option>)}
							{d.finBy && !finNames.includes(d.finBy) && <option value={d.finBy}>{d.finBy}</option>}
						</select>
					</label>
					<DocPanel d={d} role={role} mine={mine} readOnlyYear={readOnlyYear} ops={ops} basis={rowBasis(d, row.S).basis} />
				</div>
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-2">
				{canEdit && <button type="button" className={BTN_PRIMARY} onClick={save}>ذخیره (Enter)</button>}
				<button type="button" className={BTN_GHOST} onClick={onClose}>{canEdit ? 'انصراف (Esc)' : 'بستن (Esc)'}</button>
				{!canEdit && <span className="text-[12px] text-muted-foreground">{locked ? `سند «${FIN_STATE_LABEL[finStateOf(d)]}» است و فقط‌خواندنی است.` : readOnlyYear ? 'دفترِ سال‌های دیگر فقط خواندنی است.' : ''}</span>}
			</div>
		</div>
	)
}
/** سهمِ مرحله با شخصِ دیگر (لیدساز / پشتیبانِ در مهلت / کارشناسِ مالی) */
function otherOf(d: Deal, k: StageKey, finBy: string) {
	return k === 'lead' && d.leadGen ? String(d.leadGen) : k === 'post' && d.supportGen && d.supportSla ? String(d.supportGen) : k === 'fin' && finBy ? finBy : ''
}

/** نشانِ وضعیتِ سند (پیش‌نویس نشان ندارد تا شلوغ نشود) */
const ST_TONE: Record<FinState, string> = { draft: '', submitted: 'bg-warning/10 text-warning ring-warning/30', approved: 'bg-success/10 text-success ring-success/30', closed: 'bg-muted text-foreground ring-border' }
function StateBadge({ st }: { st: FinState }) {
	return <span className={`${BADGE} ${ST_TONE[st]}`}>{st !== 'submitted' && <LockIcon className="size-3" />}{FIN_STATE_LABEL[st]}</span>
}
const TILE_LABEL: Record<string, string> = { c3: 'ترازنامه', c5: 'دستورِ پرداخت و معلق', c4: 'پورسانتِ هر حساب', c2: 'قیف', w7: 'وزنِ هفت مرحله', c1: 'دفتر فاکتورها' }
type DocOps = { submit: () => Promise<void>; withdraw: () => Promise<void>; approve: (v: ApprovalInput) => Promise<void>; close: () => Promise<void>; code: () => Promise<{ to?: string }>; reopen: (reason: string, code?: string) => Promise<void> }
/** عددِ صحیحِ نامنفی (ارقامِ فارسی/لاتین و جداکنندهٔ هزارگان مجاز؛ هر نویسهٔ دیگری نامعتبر) */
const amountOk = (v: string) => !/[^\d۰-۹٬,\s]/.test(v) && /^\d{1,15}$/.test(rawDigits(v))

/**
 * سندِ مالی: پیش‌نویس ← در انتظار تصویب ← تصویب‌شده ← بسته‌شده.
 * «تصویب سند» فقط کارشناسِ مالی (سرور هم می‌سنجد)؛ فرم به الگوی چک‌لیست: ۵ شرط، شمارهٔ شرط‌های کامل و نوارِ پیشرفت.
 */
function DocPanel({ d, role, mine, readOnlyYear, ops, basis }: { d: Deal; role: string; mine: boolean; readOnlyYear: boolean; ops: DocOps; basis: number }) {
	const st = finStateOf(d)
	const finance = role === 'finance', admin = isAdmin(role)
	const [busy, setBusy] = useState(false)
	const [err, setErr] = useState('')
	const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
	const ap = d.finApproval as { cash?: number; pending?: number; regDateJ?: string; by?: string; ts?: number } | undefined
	const cl = d.finClosed as { by?: string; ts?: number } | undefined
	const when = (ts?: number) => { try { return ts ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(ts)) : '' } catch { return '' } }
	if (readOnlyYear) return null
	return (
		<section aria-label="سندِ مالی" className="flex flex-col gap-3 rounded-md border border-border p-4">
			<div className="flex items-center justify-between gap-2">
				<h4 className="text-[13.5px] font-bold text-foreground">سندِ مالی</h4>
				<span className={`${BADGE} ${st === 'draft' ? 'bg-muted text-muted-foreground ring-border' : ST_TONE[st]}`}>{st !== 'draft' && st !== 'submitted' && <LockIcon className="size-3" />}{FIN_STATE_LABEL[st]}</span>
			</div>
			{(st === 'approved' || st === 'closed') && ap && (
				<dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
					<dt className="text-muted-foreground">مقدار پورسانت نقد</dt><dd className="text-left font-bold tabular-nums">{sep(ap.cash || 0)}</dd>
					<dt className="text-muted-foreground">مقدار پورسانت معلق</dt><dd className="text-left font-bold tabular-nums">{sep(ap.pending || 0)}</dd>
					<dt className="text-muted-foreground">تاریخ ثبت سند</dt><dd className="text-left font-bold tabular-nums">{fa(ap.regDateJ || '')}</dd>
					<dt className="text-muted-foreground">تصویب</dt><dd className="text-left">{ap.by || ''} · {when(ap.ts)}</dd>
					{cl && <><dt className="text-muted-foreground">بسته</dt><dd className="text-left">{cl.by || ''} · {when(cl.ts)}</dd></>}
				</dl>
			)}
			{st === 'draft' && funnelOf(d) === 'won' && mine && !finance && !admin && (
				<button type="button" className={`${BTN_PRIMARY} self-start`} disabled={busy} onClick={() => run(ops.submit)}>ارسال برای تصویب</button>
			)}
			{st === 'draft' && funnelOf(d) !== 'won' && <p className="text-[12px] text-muted-foreground">فقط معاملهٔ «بستن» سندِ مالی دارد.</p>}
			{st === 'submitted' && (mine || finance) && (
				<button type="button" className={`${BTN_GHOST} self-start`} disabled={busy} onClick={() => run(ops.withdraw)}>برگرداندن به پیش‌نویس</button>
			)}
			{(finance || admin) && funnelOf(d) === 'won' && (st === 'draft' || st === 'submitted') && <ApproveForm basis={basis} busy={busy} onSubmit={(v) => run(() => ops.approve(v))} />}
			{finance && st === 'approved' && (
				<button type="button" className={`${BTN_GHOST} self-start`} disabled={busy} onClick={() => run(ops.close)}>بستن مالی</button>
			)}
			{(st === 'approved' || st === 'closed') && <Reopen admin={admin} busy={busy} run={run} ops={ops} />}
			{err && <p role="alert" className="text-[12px] font-bold text-error">{err}</p>}
		</section>
	)
}

function ApproveForm({ basis, busy, onSubmit }: { basis: number; busy: boolean; onSubmit: (v: ApprovalInput) => void }) {
	const [cash, setCash] = useState('')
	const [pending, setPending] = useState('')
	const [date, setDate] = useState(() => fa(todayJ()))
	const [c1, setC1] = useState(false)
	const [c2, setC2] = useState(false)
	const [touched, setTouched] = useState(false)
	const okCash = amountOk(cash), okPend = amountOk(pending), dj = parseJ(date)
	const items = [okCash, okPend, !!dj, c1, c2]
	const done = items.filter(Boolean).length, total = items.length, pctDone = Math.round((done / total) * 100)
	const ready = done === total
	const dateLong = dj ? (() => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dj.iso + 'T12:00:00')) } catch { return '' } })() : ''
	const Tick = ({ on }: { on: boolean }) => (
		<span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
			{on && <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="M5 12l4 4 10-10" /></svg>}
		</span>
	)
	const row = (on: boolean, children: ReactNode) => (
		<li className={`rounded-lg border p-2.5 transition-colors ${on ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/60 bg-card hover:border-border'}`}>{children}</li>
	)
	const amountRow = (id: string, label: string, v: string, set: (x: string) => void, ok: boolean) => row(ok, (
		<>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<Tick on={ok} />
				<label htmlFor={id} className="min-w-0 flex-1 text-[13px] font-bold text-foreground">{label}</label>
				<input id={id} value={v} onChange={(x) => set(faGroup(x.target.value))} onBlur={() => setTouched(true)} placeholder="۰" dir="ltr" inputMode="numeric" autoComplete="off"
					aria-invalid={touched && !ok} aria-describedby={id + '-e'} className={`${INPUT} min-h-9 w-full min-w-0 flex-1 text-left tabular-nums sm:w-36 sm:flex-none`} />
				<span className="w-10 shrink-0 text-[11px] text-muted-foreground">تومان</span>
			</div>
			{touched && !ok && <p id={id + '-e'} role="alert" className="mt-1.5 pr-7 text-[11.5px] font-bold text-error">عدد وارد کن (صفر هم مجاز است).</p>}
		</>
	))
	const confirmRow = (id: string, label: string, v: boolean, set: (x: boolean) => void) => row(v, (
		<div className="flex items-center gap-3">
			<input id={id} type="checkbox" className="size-4 shrink-0" checked={v} onChange={(x) => set(x.target.checked)} aria-invalid={touched && !v} />
			<label htmlFor={id} className="min-w-0 flex-1 cursor-pointer select-none text-[13px] font-bold leading-6 text-foreground">{label}</label>
		</div>
	))
	return (
		<form aria-label="تصویب سند" className="rounded-lg border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (ready && dj) onSubmit({ cash: rawDigits(cash), pending: rawDigits(pending), regDateJ: dj.j, confirmAccuracy: c1, confirmRegistered: c2 }) }}>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary-ink"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></svg></span>
					<h4 className="text-[14px] font-extrabold text-foreground">تصویب سند</h4>
				</div>
				<span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-foreground">{fa(done)}/{fa(total)} تکمیل</span>
			</div>
			<div className="mt-3">
				<div className="flex items-center justify-between text-[11.5px] font-bold text-muted-foreground"><span>پیشرفت</span><span className="tabular-nums">{fa(pctDone)}٪</span></div>
				<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctDone} aria-label="پیشرفتِ شرط‌های تصویب">
					<motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${pctDone}%` }} transition={{ duration: 0.25, ease: 'easeInOut' }} />
				</div>
			</div>
			<p className="mt-2 text-[11.5px] text-muted-foreground">مبنای پورسانتِ این سند: <span className="tabular-nums">{sep(basis)}</span> تومان</p>
			<ul className="mt-3 space-y-1.5">
				{amountRow('ap-cash', 'مقدار پورسانت نقد', cash, setCash, okCash)}
				{amountRow('ap-pend', 'مقدار پورسانت معلق', pending, setPending, okPend)}
				{row(!!dj, (
					<>
						<div className="flex flex-wrap items-center gap-3">
							<Tick on={!!dj} />
							<label htmlFor="ap-date" className="min-w-0 flex-1 text-[13px] font-bold text-foreground">تاریخ ثبت سند</label>
							<input id="ap-date" value={date} onChange={(x) => setDate(x.target.value)} onBlur={() => setTouched(true)} placeholder="۱۴۰۵/۰۷/۰۹" dir="ltr" inputMode="numeric"
								aria-invalid={touched && !dj} aria-describedby="ap-date-h" className={`${INPUT} min-h-9 w-full min-w-0 flex-1 text-left tabular-nums sm:w-36 sm:flex-none`} />
							<button type="button" onClick={() => setDate(fa(todayJ()))} className={`${BTN} min-h-9 w-10 shrink-0 px-0 text-[12px] text-primary-ink ring-1 ring-inset ring-border hover:bg-muted`}>امروز</button>
						</div>
						<p id="ap-date-h" role={touched && !dj ? 'alert' : undefined} className={`mt-1.5 pr-7 text-[11.5px] ${dj ? 'text-muted-foreground' : touched ? 'font-bold text-error' : 'text-muted-foreground'}`}>{dj ? dateLong : 'تاریخِ شمسیِ معتبر، مثلِ ۱۴۰۵/۰۷/۰۹'}</p>
					</>
				))}
				{confirmRow('ap-c1', 'با علم و آگاهی کامل صحت اطلاعات را تأیید می‌کنم', c1, setC1)}
				{confirmRow('ap-c2', 'سندها را در سیستم مالی در این تاریخ ثبت کردم', c2, setC2)}
			</ul>
			<div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
				<span className="text-[11.5px] text-muted-foreground">{ready ? 'آمادهٔ تصویب' : `${fa(total - done)} مورد مانده`}</span>
				<button type="submit" className={BTN_PRIMARY} disabled={!ready || busy}>{busy ? 'در حالِ تصویب…' : 'تصویب سند'}</button>
			</div>
		</form>
	)
}

function Reopen({ admin, busy, run, ops }: { admin: boolean; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void>; ops: DocOps }) {
	const [reason, setReason] = useState('')
	const [sent, setSent] = useState('')
	const [code, setCode] = useState('')
	const okReason = reason.trim().length >= 3
	return (
		<div className="flex flex-col gap-2 border-t border-border pt-3">
			<label htmlFor="ro-reason" className="text-[12px] font-bold text-muted-foreground">بازگشایی (فقط با دسترسیِ مدیر یا کدِ پیامکی) — دلیل</label>
			<input id="ro-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={`${INPUT} min-h-9 text-[13px]`} placeholder="دلیلِ بازگشایی" />
			{admin ? (
				<button type="button" className={`${BTN_GHOST} self-start`} disabled={busy || !okReason} onClick={() => run(() => ops.reopen(reason.trim()))}>بازگشایی با دسترسیِ مدیر</button>
			) : !sent ? (
				<button type="button" className={`${BTN_GHOST} self-start`} disabled={busy || !okReason} onClick={() => run(async () => { const r = await ops.code(); setSent(r.to || 'موبایلِ شما') })}>ارسالِ کدِ پیامکی برای بازگشایی</button>
			) : (
				<form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) run(() => ops.reopen(reason.trim(), code.trim())) }}>
					<label className="w-full text-[12px] text-muted-foreground" htmlFor="ro-code">کدِ ارسال‌شده به {sent}</label>
					<input id="ro-code" className={`${INPUT} min-h-9 w-36 text-left tracking-[0.3em]`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d۰-۹]/g, ''))} />
					<button type="submit" className={BTN_PRIMARY} disabled={busy || !code.trim() || !okReason}>بازگشایی</button>
				</form>
			)}
		</div>
	)
}

/* ---------- نوارِ کنترلِ دفتر: سال مالی · ماه فعال · وضعیتِ ذخیره · دسترسی · کارشناسِ فعال (سطح/نقش/افزودن/تغییرِ نام/حذف) ---------- */
function ControlStrip(P: {
	full: any; people: any[]; years: string[]; viewFy: string; setViewFy: (y: string) => void; gm: string; setGm: (v: string) => void
	person: string; setPerson: (v: string) => void; seeAll: boolean; single: any; st: ReturnType<typeof ledgerStatus>
}) {
	// ایجادِ سال، سطح، نقش، تغییرِ نام و حذفِ کارشناس فقط در «تنظیمات» است؛ این‌جا فقط انتخابِ دوره و کارشناس
	const L = 'shrink-0 text-[12px] text-muted-foreground'
	const SEL = `${INPUT_I} min-h-9 w-auto shrink-0 py-0 text-[13px]`
	return (
		<div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-y border-border bg-muted/30 px-4 py-3" role="group" aria-label="دوره و کارشناس">
			<label className="flex items-center gap-2">
				<span className={L}>سال مالی:</span>
				<select className={SEL} value={P.viewFy} onChange={(e) => P.setViewFy(e.target.value)} aria-label="سال مالی">{P.years.map((y) => <option key={y} value={y}>{fa(y)}{y !== LEDGER_FY ? ' (فقط خواندنی)' : ''}</option>)}</select>
			</label>
			<label className="flex items-center gap-2">
				<span className={L}>ماه فعال:</span>
				<select className={SEL} value={P.gm} onChange={(e) => P.setGm(e.target.value)} aria-label="ماه فعال">
					<option value="all">همه‌ی ماه‌ها</option>
					{MONTHS.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
				</select>
			</label>
			<label className="flex min-w-0 items-center gap-2">
				<span className={L}>کارشناس فعال:</span>
				{P.seeAll ? (
					<select className={`${SEL} max-w-[240px]`} value={P.person} onChange={(e) => P.setPerson(e.target.value)} aria-label="کارشناس فعال">
						<option value={ALL}>همهٔ کارشناسان</option>
						{P.people.map((p, i) => ({ p, i })).filter(({ p }) => isActivePerson(p)).map(({ p, i }) => <option key={i} value={String(i)}>{p.name || 'بی‌نام'}</option>)}
					</select>
				) : <b className="text-[13px]">{P.single?.name || '—'}</b>}
			</label>
			<span className="mr-auto"><SaveBadge st={P.st} retry={() => flushLedger().catch(() => undefined)} /></span>
		</div>
	)
}

/* ---------- موبایل: کارت به‌جای جدول (بارگذاریِ تدریجی) ---------- */
function CardList({ rows, dup, kindFix, onEdit, onNA, edit, commit, cancel, leadNames, scopeAll, canEdit, onDel }: {
	rows: Row[]; dup: Set<string>; kindFix: (r: Row) => string; onEdit: (r: Row, col: ColK) => void; onNA: (r: Row, n: NA) => void; edit: { key: string; col: ColK } | null
	commit: (r: Row, col: ColK, v: string) => void; cancel: () => void; leadNames: string[]; scopeAll: boolean; canEdit: (r: Row) => boolean; onDel: (r: Row) => void
}) {
	const [n, setN] = useState(40)
	const naOfRow = useContext(NaCtx)
	const more = useRef<HTMLDivElement>(null)
	useEffect(() => { setN(40) }, [rows])
	useEffect(() => {
		const el = more.current
		if (!el) return
		const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setN((x) => x + 40) }, { rootMargin: '400px' })
		io.observe(el)
		return () => io.disconnect()
	}, [rows.length, n])
	const field = (r: Row, col: ColK, t: string) => (
		<div className="flex min-h-11 items-center gap-2 border-t border-border/60 py-1.5" key={col}>
			<span className="w-[84px] shrink-0 text-[11.5px] text-muted-foreground">{t}</span>
			<div className="min-w-0 flex-1">
				{edit && edit.key === r.key && edit.col === col
					? <CellEditor r={r} col={col} leadNames={leadNames} onCommit={(v) => commit(r, col, v)} onCancel={cancel} onStep={(v) => commit(r, col, v)} />
					: <button type="button" disabled={!canEdit(r) || !COLS.find((c) => c.k === col)?.edit || (col === 'no' && !!String(r.d.no || '').trim())} onClick={() => onEdit(r, col)} className="flex w-full min-w-0 items-center text-right disabled:cursor-default"><CellView r={r} col={col} dup={dup} kindFix={kindFix} onNA={onNA} canEdit={canEdit(r)} onDel={onDel} /></button>}
			</div>
		</div>
	)
	return (
		<ul className="space-y-2 p-3">
			{rows.slice(0, n).map((r) => {
				const na = naOfRow(r)
				return (
					<li key={r.key} data-order-row={rowOrderKey(r)} className="rounded-md bg-card p-3 ring-1 ring-inset ring-border">
						<div className="mb-1 flex items-center"><RowGrip rowKey={rowOrderKey(r)} /><CellView r={r} col="no" dup={dup} kindFix={kindFix} onNA={onNA} canEdit={canEdit(r)} onDel={onDel} /></div>
						<div className="flex items-start gap-2">
							<div className="min-w-0 flex-1"><CellView r={r} col="name" dup={dup} kindFix={kindFix} onNA={onNA} canEdit={canEdit(r)} onDel={onDel} /></div>
							<CellView r={r} col="amount" dup={dup} kindFix={kindFix} onNA={onNA} canEdit={canEdit(r)} onDel={onDel} />
						</div>
						<button type="button" disabled={!canEdit(r) && !isLocked(r.d) && funnelOf(r.d) !== 'won'} onClick={() => onEdit(r, 'stage')} className="mt-2 block w-full text-right"><CellView r={r} col="stage" dup={dup} kindFix={kindFix} onNA={onNA} canEdit={canEdit(r)} onDel={onDel} /></button>
						{field(r, 'settle', 'تسویه')}
						{field(r, 'kind', 'نوع خرید')}
						{scopeAll && <div className="flex min-h-9 items-center gap-2 border-t border-border/60 py-1.5 text-[12px]"><span className="w-[84px] shrink-0 text-[11.5px] text-muted-foreground">کارشناس</span>{r.p.name}</div>}
						{field(r, 'leadGen', 'لیدساز')}
						{field(r, 'basis', 'پورسانت')}
						{na && !['approve', 'submit', 'close'].includes(na.k) && <button type="button" disabled={!canEdit(r)} onClick={() => onNA(r, na)} className={`${BTN} mt-2 min-h-11 w-full ring-1 ring-inset ${NA_TONE[na.tone]}`}>{na.t}</button>}
					</li>
				)
			})}
			{n < rows.length && <div ref={more} className="py-4 text-center text-[12px] text-muted-foreground">در حالِ بارگذاری…</div>}
		</ul>
	)
}
