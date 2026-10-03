'use client'

/**
 * «حضور و عملکرد» — تبِ بومی. همهٔ نماها از usePerformance (دیتاستِ محدود به دسترسی) می‌خوانند:
 * داشبورد مدیریتی (E1/E2/E3 + نمودارها) · عملکردِ هر نفر · گزارش تطبیق وظیفه و حضور · گزارش وکیل / اداره کار · ورود داده و نگاشت.
 * هیچ عددی ساخته نمی‌شود؛ هر جا داده نیست N/A.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Session } from '@/lib/auth'
import { tokenHex, useTheme } from '@/lib/theme'
import Gauge3D from '@/components/ui/gauge-3d'
import Sortable from '@/components/ui/sortable'
import { BTN_GHOST, BTN_PRIMARY, CARD, CARD_PAD, CARD_SUB, CARD_TITLE, FOCUS } from '@/components/ui/tokens'
import ActivityCalendar, { weekdayOf, type CalendarDay } from '@/components/ui/activity-calendar'
import {
	CATEGORY_LABELS, DEFAULT_SETTINGS, EMPTY_FILTER, NA, canSeeAll, clearAttendance, loadOverrides, norm, normDate, dailySeries, exportLawyer, exportPerson, exportRecon, filterRows, hhmm, lateRows, lawyerBasis, lawyerRows,
	SESSION_LABEL, defaultDurNote, personIn, personSummary, printSection, reconRows, saveEdit, saveLink, saveSettings, sessionRows, summaryLines, totals,
	type Code, type Dataset, type DayRow, type Filter, type LinkHow, type PersonPerf, type RowEdit, type Settings,
} from '@/lib/performance'
import { usePerformance } from './usePerformance'
import { clearPerfView, setPerfView } from './perfNav'

export type PerfView = 'dash' | 'people' | 'recon' | 'activity' | 'data'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const faDate = (d: string) => String(d).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c])
const tm = (m: number | null | undefined) => (m == null ? NA : faDate(hhmm(m)))
const STATUS_FA = { Matched: 'تطبیق', Missing: 'وظیفه ثبت نشده', Mismatch: 'ناهمخوان' } as const
const STATUS_TONE = { Matched: 'bg-success/12 text-success ring-success/30', Missing: 'bg-warning/15 text-warning ring-warning/35', Mismatch: 'bg-error/10 text-error ring-error/30' } as const
const HOW_FA: Record<LinkHow, string> = { manual: 'دستی', strong: 'قطعی', weak: 'حدسی — بررسی کنید', none: 'پیدا نشد' }

/* ---------------- بلوک‌ها ---------------- */
function Card({ title, sub, actions, children, className = '', code }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; code?: string }) {
	return (
		<section className={`@container h-full ${CARD} ${CARD_PAD} ${className}`}>
			{(title || actions) && (
				<header className="mb-4 flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						{title && <h3 className={`flex items-center gap-2 ${CARD_TITLE}`}>{code && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-black tracking-wider text-primary-ink" dir="ltr">{code}</span>}{title}</h3>}
						{sub && <p className={CARD_SUB}>{sub}</p>}
					</div>
					{actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
				</header>
			)}
			{children}
		</section>
	)
}
function Btn({ children, onClick, kind = 'ghost', disabled }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean }) {
	return (
		<button type="button" disabled={disabled} onClick={onClick} className={`${kind === 'primary' ? BTN_PRIMARY : BTN_GHOST} active:translate-y-px`}>
			{children}
		</button>
	)
}
const ExportBtns = ({ onExcel, onPrint, disabled }: { onExcel: () => void; onPrint: () => void; disabled?: boolean }) => (
	<><Btn disabled={disabled} onClick={onExcel}>خروجی اکسل</Btn><Btn disabled={disabled} onClick={onPrint}>PDF</Btn><Btn disabled={disabled} onClick={onPrint}>چاپ</Btn></>
)
type Tone = 'ok' | 'warn' | 'err' | undefined
const toneText = (t: Tone) => (t === 'ok' ? 'text-success' : t === 'warn' ? 'text-warning' : t === 'err' ? 'text-error' : 'text-foreground')
function Kpi({ k, v, u, tone }: { k: ReactNode; v: ReactNode; u?: ReactNode; tone?: Tone }) {
	return (
		<div className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/45 px-4 py-3.5 ring-1 ring-border/80">
			<div className="text-[11.5px] font-bold text-muted-foreground">{k}</div>
			<div className={`text-[20px] font-extrabold leading-tight tabular-nums [overflow-wrap:anywhere] ${toneText(tone)}`}>{v}</div>
			{u && <div className="text-[11px] leading-5 text-muted-foreground">{u}</div>}
		</div>
	)
}
/** ردیفِ عدد در کاشی‌های E (برچسب ← مقدار) */
function Metric({ k, v, tone, sub }: { k: string; v: ReactNode; tone?: Tone; sub?: ReactNode }) {
	return (
		<div className="flex items-baseline gap-2 border-b border-border/60 py-2 text-[12.5px] last:border-0">
			<dt className="min-w-0 truncate text-muted-foreground">{k}</dt>
			<dd className={`mr-auto shrink-0 text-left font-bold tabular-nums ${toneText(tone)}`}><bdi>{v}</bdi>{sub && <span className="block text-[10.5px] font-normal text-muted-foreground">{sub}</span>}</dd>
		</div>
	)
}
const inCls = 'h-9 w-full rounded-xl border border-border bg-card px-3 text-[12.5px] text-foreground outline-none transition hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/12'
function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="flex min-w-0 flex-col">
			<span className="mb-1 text-[11px] font-bold text-muted-foreground">{label}</span>
			{children}
		</label>
	)
}
const Th = ({ children }: { children?: ReactNode }) => <th className="whitespace-nowrap bg-muted/60 px-3 py-2.5 text-right text-[11.5px] font-bold text-muted-foreground">{children}</th>
const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`whitespace-nowrap border-t border-border/80 px-3 py-2 text-[12.5px] tabular-nums ${className}`}>{children}</td>
function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
	return (
		<div className="overflow-x-auto rounded-xl ring-1 ring-border">
			<table className="w-full border-collapse">
				<thead><tr>{head.map((h, i) => <Th key={h + i}>{h}</Th>)}</tr></thead>
				<tbody>{children}</tbody>
			</table>
			{empty && <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">موردی با این فیلترها پیدا نشد.</p>}
		</div>
	)
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
			<p className="text-[14px] font-extrabold">{title}</p>
			{children && <div className="max-w-[60ch] text-[12.5px] leading-7 text-muted-foreground">{children}</div>}
		</div>
	)
}
const StatusChip = ({ s }: { s: keyof typeof STATUS_FA }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${STATUS_TONE[s]}`}>{STATUS_FA[s]}</span>
const HowChip = ({ how }: { how: LinkHow }) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${how === 'weak' ? 'bg-warning/12 text-warning ring-warning/35' : how === 'none' ? 'bg-error/10 text-error ring-error/30' : 'bg-success/10 text-success ring-success/30'}`}>{HOW_FA[how]}</span>

/* ---------------- رنگِ نمودارها از توکن‌های تم ---------------- */
function useChart() {
	const th = useTheme()
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const c = useMemo(() => ({ primary: tokenHex('primary'), secondary: tokenHex('secondary'), accent: tokenHex('accent'), ok: tokenHex('success'), warn: tokenHex('warning'), err: tokenHex('error'), grid: tokenHex('border'), text: tokenHex('muted-foreground'), card: tokenHex('card'), fg: tokenHex('foreground') }), [th])
	return {
		c,
		axis: { tick: { fill: c.text, fontSize: 11, fontFamily: 'Vazirmatn' }, tickLine: false, axisLine: false },
		tip: { contentStyle: { background: c.card, border: '1px solid ' + c.grid, borderRadius: 10, fontFamily: 'Vazirmatn', fontSize: 12, color: c.fg, direction: 'rtl' as const }, labelStyle: { color: c.fg } },
		legend: { wrapperStyle: { fontFamily: 'Vazirmatn', fontSize: 11, color: c.text } },
	}
}
function ChartBox({ title, sub, children, empty, why }: { title: string; sub?: string; children: ReactNode; empty?: boolean; why?: string }) {
	return (
		<Card title={title} sub={sub}>
			{empty ? <Empty title="دادهٔ کافی برای این نمودار نیست">{why}</Empty> : <div className="h-[240px] w-full" dir="ltr">{children}</div>}
		</Card>
	)
}
const yFmt = (v: unknown) => fa(Number(v))
const dFmt = (d: unknown) => faDate(String(d))

/* ---------------- فیلتر ---------------- */
type FilterKey = 'date' | 'person' | 'team' | 'status' | 'att' | 'task' | 'q'
function Filters({ ds, f, set, show }: { ds: Dataset; f: Filter; set: (f: Filter) => void; show: FilterKey[] }) {
	const dates = useMemo(() => Array.from(new Set(ds.people.flatMap((p) => p.rows.map((r) => r.date)))).sort(), [ds])
	const has = (k: FilterKey) => show.includes(k)
	const dirty = show.some((k) => (k === 'date' ? f.from || f.to : k === 'person' ? ds.scopeAll && f.person : k === 'team' ? f.team : f[k as 'status' | 'att' | 'task' | 'q']))
	return (
		<div className="no-print grid grid-cols-2 gap-3 @2xl:grid-cols-4 @5xl:grid-cols-8">
			{has('date') && <>
				<Field label="از تاریخ">
					<select className={inCls} value={f.from} onChange={(e) => set({ ...f, from: e.target.value })}>
						<option value="">ابتدای دوره</option>
						{dates.map((d) => <option key={d} value={d}>{faDate(d)}</option>)}
					</select>
				</Field>
				<Field label="تا تاریخ">
					<select className={inCls} value={f.to} onChange={(e) => set({ ...f, to: e.target.value })}>
						<option value="">انتهای دوره</option>
						{dates.map((d) => <option key={d} value={d}>{faDate(d)}</option>)}
					</select>
				</Field>
			</>}
			{has('person') && ds.scopeAll && (
				<Field label="کارمند">
					<select className={inCls} value={f.person} onChange={(e) => set({ ...f, person: e.target.value })}>
						<option value="">همه ({fa(ds.people.length)} نفر)</option>
						{ds.people.map((p) => <option key={p.sheetName} value={p.sheetName}>{p.displayName}</option>)}
					</select>
				</Field>
			)}
			{has('team') && ds.scopeAll && (
				<Field label="تیم">
					<select className={inCls} value={f.team} onChange={(e) => set({ ...f, team: e.target.value })}>
						<option value="">همهٔ تیم‌ها</option>
						{ds.teams.map((t) => <option key={t} value={t}>{t}</option>)}
					</select>
				</Field>
			)}
			{has('status') && (
				<Field label="وضعیت تطبیق">
					<select className={inCls} value={f.status} onChange={(e) => set({ ...f, status: e.target.value as Filter['status'] })}>
						<option value="">همه</option>
						<option value="Matched">تطبیق (Matched)</option>
						<option value="Missing">وظیفه ثبت نشده (Missing)</option>
						<option value="Mismatch">ناهمخوان (Mismatch)</option>
					</select>
				</Field>
			)}
			{has('task') && (
				<Field label="وضعیت وظیفهٔ حضوری">
					<select className={inCls} value={f.task} onChange={(e) => set({ ...f, task: e.target.value as Filter['task'] })}>
						<option value="">همه</option>
						<option value="held">برگزار شده</option>
						<option value="notheld">لغو / برگزار نشده</option>
						<option value="nosession">بدون وظیفهٔ حضوری</option>
					</select>
				</Field>
			)}
			{has('att') && (
				<Field label="وضعیت حضور">
					<select className={inCls} value={f.att} onChange={(e) => set({ ...f, att: e.target.value as Filter['att'] })}>
						<option value="">همه</option>
						<option value="work">روز کارکرد</option>
						<option value="late">دیرکرد</option>
						<option value="absent">غیبت</option>
						<option value="leave">مرخصی</option>
						<option value="sick">مریضی</option>
						<option value="mission">مأموریت</option>
						<option value="holiday">تعطیل</option>
					</select>
				</Field>
			)}
			{has('q') && (
				<Field label="جستجو">
					<input className={inCls} value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} placeholder="نام، تاریخ، عنوان…" />
				</Field>
			)}
			{dirty && <div className="flex items-end"><Btn onClick={() => set({ ...EMPTY_FILTER, person: f.person && !has('person') ? f.person : '' })}>پاک کردن فیلترها</Btn></div>}
		</div>
	)
}
const periodLabel = (ds: Dataset, f: Filter) => {
	const dates = ds.people.filter((p) => personIn(p, f)).flatMap((p) => filterRows(p, f).map((r) => r.date)).sort()
	return dates.length ? faDate(dates[0]) + ' تا ' + faDate(dates[dates.length - 1]) : '—'
}

/* ---------------- E1 / E2 / E3 — داشبورد دیجیتال ---------------- */
function Hero({ value, max = 100, unit = '٪', label, from, to }: { value: number | null; max?: number; unit?: string; label: string; from: string; to: string }) {
	return (
		<div className="flex flex-col items-center">
			{value == null ? <div className="grid h-[150px] place-items-center text-[28px] font-extrabold text-muted-foreground">{NA}</div> : <Gauge3D value={Math.round(value * 10) / 10} max={max} unit={unit} from={from} to={to} size={210} />}
			<span className="-mt-1 text-[11.5px] font-bold text-muted-foreground">{label}</span>
		</div>
	)
}
export function ETiles({ ds, f }: { ds: Dataset; f: Filter }) {
	const t = totals(ds, f)
	const { c } = useChart()
	const lateSpark = dailySeries(ds, f).map((s) => s.late)
	const maxL = Math.max(1, ...lateSpark)
	return (
		<Sortable id="performance.e" className="grid gap-5 lg:grid-cols-3">
			<Card key="E1" code="E1" title="نیروی کار و کارکرد" sub="Workforce Performance">
				<Hero value={t.rate} label="نرخ حضور" from={c.secondary} to={c.primary} />
				<dl className="mt-3">
					<Metric k="تعداد کارکنان" v={fa(t.people)} />
					<Metric k="روزهای کارکرد" v={fa(t.workedDays)} sub={'از ' + fa(t.expected)} />
					<Metric k="مجموع کارکرد" v={tm(t.minutes)} />
					<Metric k="میانگین کارکرد روزانه" v={tm(t.avgMinutes)} />
					<Metric k="غیبت" v={fa(t.absent) + ' روز'} tone={t.absent ? 'err' : undefined} />
					<Metric k="مرخصی" v={fa(t.leave) + ' روز'} />
					<Metric k="مریضی" v={fa(t.sick) + ' روز'} />
					<Metric k="مأموریت" v={fa(t.missionDays) + ' روز'} />
				</dl>
			</Card>
			<Card key="E2" code="E2" title="حضور و دیرکرد" sub="Attendance & Late Analytics">
				<Hero value={t.late ? (t.deductible / t.late) * 100 : t.people ? 0 : null} label="سهمِ قابل‌کسر از کلِ دیرکرد" from={c.accent} to={c.err} />
				<dl className="mt-3">
					<Metric k="تعداد دیرکرد" v={fa(t.lateCount)} tone={t.lateCount ? 'warn' : undefined} />
					<Metric k="مجموع دیرکرد" v={tm(t.late)} />
					<Metric k="دیرکرد بخشوده" v={tm(t.forgiven)} sub={fa(t.forgivenCount) + ' مورد'} tone="ok" />
					<Metric k="دیرکرد قابل کسر" v={tm(t.deductible)} tone={t.deductible ? 'warn' : undefined} />
					<Metric k="روزهای کسرشده" v={fa(t.deductedDays) + ' روز'} tone={t.deductedDays ? 'err' : undefined} />
					<Metric k="اضافه‌کار جلسات" v={tm(t.sessionOT)} />
				</dl>
				<div className="mt-3" role="img" aria-label="روند زمانیِ دیرکرد">
					<div className="mb-1 text-[11px] text-muted-foreground">روند زمانیِ دیرکرد</div>
					<div className="flex h-10 items-end gap-[2px]">{lateSpark.map((v, i) => <span key={i} className="flex-1 rounded-sm bg-warning/70" style={{ height: `${Math.max(3, (v / maxL) * 100)}%`, opacity: v ? 1 : 0.25 }} />)}</div>
				</div>
			</Card>
			<Card key="E3" code="E3" title="وظایف و حضور" sub="Task / Attendance Intelligence">
				<Hero value={t.matchedPct} label="درصد تطبیق" from={c.primary} to={c.ok} />
				<dl className="mt-3">
					<Metric k="کل وظایف (بازه)" v={t.tasks == null ? NA : fa(t.tasks)} />
					<div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 py-2 text-[11.5px]">
						{t.evaluated ? (<>
							<span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${STATUS_TONE.Matched}`}>Matched {fa(t.matched)}</span>
							<span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${STATUS_TONE.Missing}`}>Missing {fa(t.missing)}</span>
							<span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${STATUS_TONE.Mismatch}`}>Mismatch {fa(t.mismatch)}</span>
						</>) : <span className="text-muted-foreground">Matched / Missing / Mismatch: {NA}</span>}
					</div>
					<Metric k="وظایف بیرون از شرکت" v={t.sessions == null ? NA : fa(t.sessions)} />
					<Metric k="جلسات برگزارشده" v={t.held == null ? NA : fa(t.held)} tone={t.held ? 'ok' : undefined} />
					<Metric k="اضافه‌کارِ ناشی از جلسات" v={tm(t.sessionOT)} />
					<Metric k="دیرکردِ بخشوده بابت جلسه" v={t.sessions == null ? NA : fa(t.meetingForgiven) + ' روز'} />
				</dl>
			</Card>
		</Sortable>
	)
}

/* ---------------- داشبوردِ مدیریتی ---------------- */
function Dashboard({ ds, f, set }: { ds: Dataset; f: Filter; set: (f: Filter) => void }) {
	const series = dailySeries(ds, f)
	const { c, axis, tip, legend } = useChart()
	const rated = series.filter((s) => s.rate !== null)
	const byPerson = ds.people.filter((p) => personIn(p, f)).map((p) => {
		const pt = totals({ ...ds, people: [p] }, { ...f, person: '', team: '' })
		return { name: p.displayName.split(' ').slice(0, 2).join(' '), hours: Math.round((pt.minutes / 60) * 10) / 10, deductible: Math.round((pt.deductible / 60) * 10) / 10, session: pt.sessionOT == null ? 0 : Math.round((pt.sessionOT / 60) * 10) / 10, hasS: pt.sessionOT != null }
	})
	const reconData = series.filter((s) => s.matched + s.missing + s.mismatch > 0).map((s) => ({ date: s.date, تطبیق: s.matched, 'وظیفه ثبت نشده': s.missing, ناهمخوان: s.mismatch }))
	const otData = series.filter((s) => s.hasOT).map((s) => ({ date: s.date, اضافه‌کار: Math.round((s.overtime / 60) * 10) / 10 }))
	const X = { dataKey: 'date', ...axis, tickFormatter: (d: string) => faDate(String(d).slice(5)) }
	return (
		<div className="flex flex-col gap-5">
			<Card title="داشبورد مدیریتی عملکرد" sub={'دوره: ' + periodLabel(ds, f) + (ds.scopeAll ? '' : ' — فقط دادهٔ خودِ شما') + ' · همهٔ کاشی‌ها و نمودارها با فیلترها هم‌گام‌اند'}>
				<Filters ds={ds} f={f} set={set} show={['date', 'person', 'team', 'status', 'task', 'att']} />
			</Card>
			<ETiles ds={ds} f={f} />
			<Sortable id="performance.charts" className="grid gap-5 xl:grid-cols-2">
				<ChartBox key="c1" title="روند حضور" sub="درصدِ حضور از روزهای کاری" empty={rated.length < 2}>
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart data={rated} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
							<defs><linearGradient id="pf-rate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.primary} stopOpacity={0.35} /><stop offset="1" stopColor={c.primary} stopOpacity={0} /></linearGradient></defs>
							<CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
							<XAxis {...X} />
							<YAxis {...axis} width={40} domain={[0, 100]} tickFormatter={yFmt} />
							<Tooltip {...tip} labelFormatter={dFmt} formatter={(v) => [fa(Number(v), 1) + '٪', 'نرخ حضور']} />
							<Area type="monotone" dataKey="rate" stroke={c.primary} strokeWidth={2} fill="url(#pf-rate)" />
						</AreaChart>
					</ResponsiveContainer>
				</ChartBox>
				<ChartBox key="c2" title="روند دیرکرد" sub="دقیقه — کل در برابر قابل‌کسر" empty={!series.some((s) => s.late)} why="در این بازه دیرکردی ثبت نشده است.">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
							<CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
							<XAxis {...X} />
							<YAxis {...axis} width={40} tickFormatter={yFmt} />
							<Tooltip {...tip} labelFormatter={dFmt} formatter={(v) => fa(Number(v))} />
							<Legend {...legend} />
							<Line type="monotone" dataKey="late" name="کل دیرکرد" stroke={c.warn} strokeWidth={2} dot={false} />
							<Line type="monotone" dataKey="deductible" name="قابل کسر" stroke={c.err} strokeWidth={2} dot={false} />
						</LineChart>
					</ResponsiveContainer>
				</ChartBox>
				<ChartBox key="c3" title="روند اضافه‌کاری" sub="ساعتِ اضافه‌کارِ جلسات در هر روز" empty={!otData.some((d) => d['اضافه‌کار'] > 0)} why="برای اضافه‌کار، وظایفِ جولیوِ همین افراد لازم است (از مرکز ایمپورت یا «ورود داده»).">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={otData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
							<CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
							<XAxis {...X} />
							<YAxis {...axis} width={40} tickFormatter={yFmt} />
							<Tooltip {...tip} cursor={{ fill: c.grid, opacity: 0.35 }} labelFormatter={dFmt} formatter={(v) => fa(Number(v), 1)} />
							<Bar dataKey="اضافه‌کار" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={22} />
						</BarChart>
					</ResponsiveContainer>
				</ChartBox>
				<ChartBox key="c4" title="تطبیق وظیفه و حضور" sub="Matched / Missing / Mismatch در هر روز" empty={!reconData.length} why="دادهٔ وظایفِ سیستم برای این افراد/بازه نیست.">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={reconData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
							<CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
							<XAxis {...X} />
							<YAxis {...axis} width={34} allowDecimals={false} tickFormatter={yFmt} />
							<Tooltip {...tip} cursor={{ fill: c.grid, opacity: 0.35 }} labelFormatter={dFmt} />
							<Legend {...legend} />
							<Bar dataKey="تطبیق" stackId="r" fill={c.ok} maxBarSize={22} />
							<Bar dataKey="وظیفه ثبت نشده" stackId="r" fill={c.warn} maxBarSize={22} />
							<Bar dataKey="ناهمخوان" stackId="r" fill={c.err} radius={[4, 4, 0, 0]} maxBarSize={22} />
						</BarChart>
					</ResponsiveContainer>
				</ChartBox>
				<ChartBox key="c5" title="اضافه‌کارِ جلسات به تفکیکِ کارمند" sub="ساعت" empty={!byPerson.some((p) => p.session > 0)} why="جلسهٔ حضوریِ برگزارشده‌ای با اضافه‌کار برای این افراد نیست.">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={byPerson.filter((p) => p.hasS)} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
							<CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="name" {...axis} interval={0} />
							<YAxis {...axis} width={40} tickFormatter={yFmt} />
							<Tooltip {...tip} cursor={{ fill: c.grid, opacity: 0.35 }} formatter={(v) => fa(Number(v), 1)} />
							<Bar dataKey="session" name="اضافه‌کار جلسات" fill={c.secondary} radius={[4, 4, 0, 0]} maxBarSize={28} />
						</BarChart>
					</ResponsiveContainer>
				</ChartBox>
				<ChartBox key="c6" title="عملکرد به تفکیکِ کارمند" sub="ساعاتِ کار و دیرکردِ قابل‌کسر (ساعت)" empty={!ds.scopeAll || byPerson.length < 2} why={ds.scopeAll ? 'حداقل دو نفر لازم است.' : 'مقایسهٔ کارکنان فقط برای مدیران.'}>
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={byPerson} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
							<CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="name" {...axis} interval={0} />
							<YAxis {...axis} width={40} tickFormatter={yFmt} />
							<Tooltip {...tip} cursor={{ fill: c.grid, opacity: 0.35 }} formatter={(v) => fa(Number(v), 1)} />
							<Legend {...legend} />
							<Bar dataKey="hours" name="ساعات کار" fill={c.primary} radius={[4, 4, 0, 0]} maxBarSize={26} />
							<Bar dataKey="deductible" name="دیرکرد قابل کسر" fill={c.err} radius={[4, 4, 0, 0]} maxBarSize={26} />
						</BarChart>
					</ResponsiveContainer>
				</ChartBox>
			</Sortable>
		</div>
	)
}

/* ---------------- ویرایشِ دستیِ ردیف ---------------- */
function EditDialog({ p, r, onClose, session }: { p: PersonPerf; r: DayRow; onClose: () => void; session: Session }) {
	const raw = { entry: r.entry === '—' ? '' : r.entry, exit: r.lastExit === '—' ? '' : r.lastExit, present: r.presentMin ? hhmm(r.presentMin) : '' }
	const [e, setE] = useState<RowEdit>({ code: r.code, ...raw, overtime: r.edited && r.overtime != null ? hhmm(r.overtime) : '', excuse: r.isLate ? r.lateExcused : undefined, note: r.editNote })
	const [err, setErr] = useState('')
	const ref = useRef<HTMLDialogElement>(null)
	useEffect(() => { ref.current?.showModal() }, [])
	const save = async (edit: RowEdit | null) => {
		try {
			const clean: RowEdit = {}
			if (edit) {
				if (edit.code && edit.code !== r.code) clean.code = edit.code
				if ((edit.entry || '') !== raw.entry) clean.entry = edit.entry
				if ((edit.exit || '') !== raw.exit) clean.exit = edit.exit
				if ((edit.present || '') !== raw.present) clean.present = edit.present
				if (edit.overtime) clean.overtime = edit.overtime
				if (edit.excuse !== undefined && edit.excuse !== r.lateExcused) clean.excuse = edit.excuse
				if (edit.note) clean.note = edit.note
			}
			await saveEdit(session, p.sheetName, r.date, edit && Object.keys(clean).length ? clean : null)
			onClose()
		} catch (x) { setErr((x as Error).message) }
	}
	const t = (k: 'entry' | 'exit' | 'present' | 'overtime', label: string) => (
		<Field label={label}><input className={inCls + ' font-mono'} dir="ltr" placeholder="hh:mm" value={e[k] || ''} onChange={(ev) => setE({ ...e, [k]: ev.target.value })} /></Field>
	)
	return (
		<dialog ref={ref} onClose={onClose} dir="rtl" aria-label="ویرایش دستی" className="w-[min(520px,calc(100vw-32px))] rounded-2xl bg-card p-0 text-card-foreground shadow-2xl ring-1 ring-border backdrop:bg-black/40">
			<div className="flex flex-col gap-4 p-6">
				<div>
					<h3 className="text-[16px] font-extrabold">ویرایش دستی — {faDate(r.date)} {r.day}</h3>
					<p className="mt-1 text-[12px] text-muted-foreground">{p.displayName} · در همان دادهٔ حضور ذخیره می‌شود</p>
				</div>
				<Field label="وضعیت روز">
					<select className={inCls} value={e.code} onChange={(ev) => setE({ ...e, code: ev.target.value as Code })}>
						{(Object.keys(CATEGORY_LABELS) as Code[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
					</select>
				</Field>
				<div className="grid grid-cols-2 gap-3">{t('entry', 'ورود')}{t('exit', 'آخرین خروج')}{t('present', 'کارکرد')}{t('overtime', 'اضافه‌کار (دستی)')}</div>
				{r.isLate && (
					<label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={!!e.excuse} onChange={(ev) => setE({ ...e, excuse: ev.target.checked })} /> دیرکرد این روز بخشوده شود (جلسه/مأموریت)</label>
				)}
				<Field label="یادداشت ویرایش"><textarea className={inCls + ' h-auto py-2'} rows={2} value={e.note || ''} onChange={(ev) => setE({ ...e, note: ev.target.value })} placeholder="دلیل تغییر…" /></Field>
				{err && <p className="text-[12px] font-bold text-error">{err}</p>}
				<div className="flex flex-wrap items-center gap-2">
					<Btn kind="primary" onClick={() => save(e)}>ذخیره</Btn>
					<Btn onClick={onClose}>انصراف</Btn>
					{r.edited && <button type="button" className="mr-auto text-[12px] font-bold text-error hover:underline" onClick={() => save(null)}>حذف ویرایش این ردیف</button>}
				</div>
			</div>
		</dialog>
	)
}

/* ---------------- عملکردِ هر نفر ---------------- */
function SessionTable({ rows, person }: { rows: ReturnType<typeof sessionRows>; person?: boolean }) {
	const dflt = rows.find((x) => x.defaultDur)
	return (
		<>
			<Table head={[...(person ? ['شخص'] : []), 'تاریخ', 'ساعت', 'مدت', 'حضور ثبت‌شده', 'اضافه‌کار', 'وضعیت', 'عنوان / مخاطب', 'توضیحات وظیفه']} empty={!rows.length}>
				{rows.map((x, i) => (
					<tr key={i} className="hover:bg-muted/40">
						{person && <Td className="font-bold">{x.person}</Td>}
						<Td>{faDate(x.date)}</Td><Td>{faDate(x.time)}</Td>
						<Td>{tm(x.dur)}{x.defaultDur && <span className="text-warning" title="مدت پیش‌فرض">*</span>}</Td>
						<Td>{faDate(x.attendance)}</Td>
						<Td className="font-bold">{x.held ? tm(x.overtime) : '—'}</Td>
						<Td className={x.held ? 'text-success' : 'text-error'}><span title={x.reason}>{SESSION_LABEL[x.status]}</span></Td>
						<Td className="max-w-[240px] truncate">{x.title}{x.contact && <span className="text-muted-foreground"> / {x.contact}</span>}</Td>
						<Td className="max-w-[280px] truncate text-muted-foreground">{x.desc}</Td>
					</tr>
				))}
			</Table>
			{dflt && <p className="mt-2 text-[11.5px] text-warning">{defaultDurNote(dflt.dur)}</p>}
		</>
	)
}
/** نگاشتِ تقویمِ فعالیت: مقدار = دقیقهٔ کارکردِ ثبت‌شده؛ روزِ بدونِ حضور = ۰؛ تعطیل علامت می‌خورد */
function calendarDays(rows: DayRow[]): CalendarDay[] {
	let prev = -1
	return rows.map((r) => {
		const w = weekdayOf(r.day) ?? (prev + 1) % 7
		prev = w
		const holiday = r.label.startsWith('تعطیل') || r.code === 'official_worked' || r.code === 'friday_worked' || r.code === 'birthday_worked'
		const label = (r.presentMin ? tm(r.presentMin) + ' کارکرد' : r.label) + (r.isLate ? ` · ${fa(r.lateMinutes)} دقیقه دیرکرد${r.lateExcused ? ' (بخشوده)' : ''}` : '')
		return { date: r.date, weekday: w, value: r.presentMin || 0, holiday, label }
	})
}
/** شاخص‌های فردی (خلاصهٔ رسمیِ قابل چاپ = گزارشِ «خلاصهٔ کارکرد فردی» در تبِ گزارشات) */
function PersonKpis({ s, R }: { s: ReturnType<typeof personSummary>; R: Dataset['R'] }) {
	const G = ({ t, children }: { t: string; children: ReactNode }) => (
		<div className="rounded-xl bg-muted/40 p-3 ring-1 ring-border/70">
			<p className="mb-1 text-[11px] font-extrabold tracking-wide text-primary-ink">{t}</p>
			<dl>{children}</dl>
		</div>
	)
	const day = (n: number) => fa(n) + ' روز'
	return (
		<div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4">
			<G t="کارکرد">
				<Metric k="روز کارکرد نهایی" v={day(s.workDaysFinal)} sub={`${fa(s.workDays)} − ${fa(s.deductedDays)} کسر`} />
				<Metric k="مجموع کارکرد" v={tm(s.total)} />
				<Metric k="کارکرد روز عادی" v={tm(s.regularMin)} />
				<Metric k="کارکرد تعطیل" v={tm(s.holidayMin)} />
				<Metric k={'روز زیر ' + tm(R.fullDay)} v={`${fa(s.underFull)} / ${fa(s.regularDays)}`} />
			</G>
			<G t="دیرکرد">
				<Metric k="تعداد دیرکرد" v={day(s.lateCount)} tone={s.lateCount ? 'warn' : undefined} />
				<Metric k="مجموع دیرکرد" v={tm(s.lateTotal)} />
				<Metric k="دیرکرد بخشوده" v={tm(s.forgivenMin)} sub={day(s.forgivenCount)} tone="ok" />
				<Metric k="دیرکرد قابل کسر" v={tm(s.deductible)} tone={s.deductible ? 'warn' : undefined} />
				<Metric k="روز کسرشده / مانده" v={`${fa(s.deductedDays)} روز · ${tm(s.remaining)}`} tone={s.deductedDays ? 'err' : undefined} />
			</G>
			<G t="جلسات حضوری">
				<Metric k="دیرکرد بخشوده بابت جلسه" v={day(s.meetingForgivenCount)} sub={tm(s.meetingForgivenMin)} />
				<Metric k="اضافه‌کار جلسات" v={tm(s.overtime)} />
				<Metric k="جلسات برگزارشده" v={fa(s.sessionsHeld) + ' از ' + fa(s.sessionsTotal)} />
				<Metric k="میانگین ورود" v={tm(s.avgIn)} />
				<Metric k="میانگین خروج" v={tm(s.avgOut)} />
			</G>
			<G t="حضور و غیاب">
				<Metric k="غیبت" v={day(s.absent)} tone={s.absent ? 'err' : undefined} />
				<Metric k="مرخصی" v={day(s.leave)} />
				<Metric k="مریضی" v={day(s.sick)} />
				<Metric k="مأموریت (کل / اداری)" v={`${fa(s.missionDays)} / ${fa(s.officeMission)}`} sub="روز" />
				<Metric k="تعطیلاتِ بازه" v={day(s.holidays.length)} />
			</G>
		</div>
	)
}
function PersonView({ ds, p, f, set, session }: { ds: Dataset; p: PersonPerf; f: Filter; set: (f: Filter) => void; session: Session }) {
	const ref = useRef<HTMLDivElement>(null)
	const [edit, setEdit] = useState<DayRow | null>(null)
	const pf = { ...f, person: p.sheetName, team: '' }
	const s = personSummary(p, pf, ds.R)
	const rows = filterRows(p, pf)
	const late = lateRows(p, pf)
	const sessions = sessionRows({ ...ds, people: [p] }, pf)
	const canEdit = canSeeAll(session)
	const held = sessions.filter((x) => x.held)
	const inPeriod = p.rows.filter((r) => (!pf.from || r.date >= pf.from) && (!pf.to || r.date <= pf.to))
	return (
		<div ref={ref}>
			<Sortable id="performance.person" className="flex flex-col gap-5">
				<Card key="head"
					title={'عملکرد — ' + p.displayName}
					sub={faDate(s.from) + ' → ' + faDate(s.to) + (p.person ? ' · شخصِ سیستم: ' + p.person : ' · در فهرستِ کارشناسانِ سیستم پیدا نشد') + (p.ownerName ? ' · وظایف: ' + p.ownerName : '') + ' · خلاصهٔ رسمیِ قابل چاپ در «گزارشات»'}
					actions={<ExportBtns onExcel={() => exportPerson(p, s, rows, late, sessions)} onPrint={() => printSection(ref.current)} />}>
					<Filters ds={{ ...ds, scopeAll: false }} f={f} set={set} show={['date', 'att', 'task']} />
					<div className="mt-4"><PersonKpis s={s} R={ds.R} /></div>
				</Card>
				<Card key="calendar" title="تقویم فعالیت" sub="هر خانه یک روز؛ شدتِ رنگ = دقیقهٔ کارکردِ ثبت‌شده. تعطیلات با حاشیهٔ رنگی مشخص‌اند.">
					<ActivityCalendar days={calendarDays(inPeriod)} unit="دقیقه" caption={`کارکردِ روزانه — ${faDate(s.from)} تا ${faDate(s.to)}`} />
					{s.holidays.length > 0 && (
						<ul className="mt-3 flex flex-wrap gap-1.5" aria-label="تعطیلاتِ ماه">
							{s.holidays.map((h) => <li key={h.date} className="rounded-full bg-accent/12 px-2.5 py-1 text-[11.5px] ring-1 ring-accent/35"><b className="tabular-nums">{faDate(h.date)}</b> — {h.label}</li>)}
						</ul>
					)}
				</Card>
				<Card key="daily" title="کارکرد روزانه" sub={canEdit ? 'ردیف‌های ویرایش‌شده با ✎ مشخص‌اند؛ ویرایش در همان دادهٔ حضور ذخیره می‌شود.' : 'فقط‌خواندنی'}>
					<Table head={['تاریخ', 'روز', 'ورود', 'آخرین خروج', 'کارکرد', 'دیرکرد', 'جلسه / اضافه‌کار', 'وضعیت', 'یادداشت', ...(canEdit ? ['✎'] : [])]} empty={!rows.length}>
						{rows.map((r) => (
							<tr key={r.date} className={`hover:bg-muted/40 ${r.edited ? 'bg-warning/[0.06]' : ''}`}>
								<Td>{faDate(r.date)}{r.edited && <span className="mr-1 text-warning" title="ویرایش دستی">✎</span>}</Td>
								<Td>{r.day}</Td>
								<Td>{faDate(r.entry)}</Td>
								<Td>{faDate(r.lastExit)}</Td>
								<Td>{r.presentMin ? tm(r.presentMin) : '—'}{r.incomplete && <span className="mr-1 text-warning">(ناقص)</span>}</Td>
								<Td className={r.isLate ? (r.lateExcused ? 'text-success' : 'text-error') : ''}>{r.isLate ? fa(r.lateMinutes) + ' دقیقه' + (r.lateExcused ? ' (بخشوده)' : '') : '—'}</Td>
								<Td>{r.meetings.length ? `${fa(r.meetings.filter((m) => m.held).length)}/${fa(r.meetings.length)} جلسه · ${tm(r.overtime)}` : r.overtime ? tm(r.overtime) : '—'}</Td>
								<Td>{r.label}</Td>
								<Td className="max-w-[220px] truncate text-muted-foreground">{[r.editNote, r.note].filter(Boolean).join(' / ')}</Td>
								{canEdit && <Td><button type="button" aria-label={'ویرایش ' + faDate(r.date)} onClick={() => setEdit(r)} className={`rounded-lg px-2 py-1 text-[13px] font-bold text-primary-ink hover:bg-primary/10 ${FOCUS}`}>✎</button></Td>}
							</tr>
						))}
					</Table>
				</Card>
				<Card key="late" title="گزارش دیرکردها">
					<div className="mb-4 grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
						<Kpi k="تعداد دیرکرد" v={fa(s.lateCount)} tone={s.lateCount ? 'warn' : undefined} />
						<Kpi k="مجموع" v={tm(s.lateTotal)} u={'بخشوده ' + tm(s.forgivenMin)} />
						<Kpi k="قابل کسر" v={tm(s.deductible)} u={'مانده ' + tm(s.remaining)} tone={s.deductible ? 'warn' : undefined} />
						<Kpi k="روز کسر" v={fa(s.deductedDays)} u={'هر ' + tm(ds.R.lateDeduct) + ' = ۱ روز'} tone={s.deductedDays ? 'err' : undefined} />
					</div>
					<Table head={['تاریخ', 'روز', 'ورود', 'دقیقه دیرکرد', 'وضعیت', 'تجمعی قابل کسر', 'یادداشت']} empty={!late.length}>
						{late.map((l) => (
							<tr key={l.date}>
								<Td>{faDate(l.date)}</Td><Td>{l.day}</Td><Td>{faDate(l.entry)}</Td><Td>{fa(l.minutes)}</Td>
								<Td className={l.forgiven ? 'text-success' : 'text-error'}>{l.reason}</Td><Td className="font-bold">{tm(l.cumulative)}</Td>
								<Td className="max-w-[220px] truncate text-muted-foreground">{l.note}</Td>
							</tr>
						))}
					</Table>
				</Card>
				<Card key="sessions" title="تطبیق با اکسل وظایف — جلسات / کارهای حضوری بیرون" sub={p.hasRaw ? `برگزار شده: ${fa(held.length)} · اضافه‌کار: ${tm(held.reduce((a, x) => a + x.overtime, 0))}` : undefined}>
					{!p.hasRaw ? <Empty title="وظایفِ جولیوِ این شخص بارگذاری نشده است">همان فایلی که در «مرکز ایمپورت» وارد می‌شود کافی است؛ بعد از ایمپورت این بخش خودکار پر می‌شود.</Empty> : <SessionTable rows={sessions} />}
				</Card>
			</Sortable>
			{edit && <EditDialog p={p} r={edit} session={session} onClose={() => setEdit(null)} />}
		</div>
	)
}
function People({ ds, f, set, session }: { ds: Dataset; f: Filter; set: (f: Filter) => void; session: Session }) {
	const [sel, setSel] = useState(f.person || ds.people[0]?.sheetName || '')
	const p = ds.people.find((x) => x.sheetName === sel) || ds.people[0]
	if (!p) return null
	return (
		<div className="flex flex-col gap-4">
			{ds.people.length > 1 && (
				<div role="tablist" aria-label="کارکنان" className="no-print flex gap-1.5 overflow-x-auto pb-1">
					{ds.people.map((x) => {
						const on = x.sheetName === p.sheetName
						return (
							<button key={x.sheetName} role="tab" aria-selected={on} onClick={() => setSel(x.sheetName)}
								className={`shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-bold transition ${FOCUS} ${on ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground ring-1 ring-border hover:bg-muted'}`}>
								{x.displayName}
							</button>
						)
					})}
				</div>
			)}
			<PersonView key={p.sheetName} ds={ds} p={p} f={f} set={set} session={session} />
		</div>
	)
}

/* ---------------- گزارش تطبیق وظیفه و حضور (فقط Task ↔ Attendance) ---------------- */
function Recon({ ds, f, set }: { ds: Dataset; f: Filter; set: (f: Filter) => void }) {
	const ref = useRef<HTMLDivElement>(null)
	const rows = reconRows(ds, f)
	const sessions = sessionRows(ds, f)
	const noTasks = ds.people.every((p) => !p.hasStoreTasks)
	const cnt = { Matched: rows.filter((r) => r.status === 'Matched').length, Missing: rows.filter((r) => r.status === 'Missing').length, Mismatch: rows.filter((r) => r.status === 'Mismatch').length }
	const held = sessions.filter((x) => x.held)
	const period = periodLabel(ds, f)
	return (
		<div ref={ref} className="flex flex-col gap-5">
			<Card
				title="گزارش تطبیق وظیفه و حضور"
				sub={'کلید: شخص + تاریخ · حضور از دستگاهِ حضور، وظایف از سیستمِ وظایفِ اپ · دوره: ' + period}
				actions={<ExportBtns disabled={!rows.length && !sessions.length} onExcel={() => exportRecon(rows, sessions, period)} onPrint={() => printSection(ref.current)} />}>
				<Filters ds={ds} f={f} set={set} show={['date', 'person', 'team', 'status', 'task', 'q']} />
				{noTasks ? (
					<div className="mt-4"><Empty title="دادهٔ وظایف برای این افراد در سیستم نیست (N/A)">وظایف از همان ایمپورتِ جولیو در اپ خوانده می‌شود؛ بعد از ایمپورتِ وظایف، این گزارش خودکار پر می‌شود.</Empty></div>
				) : (
					<>
						<div className="my-4 flex flex-wrap gap-2 text-[12px]">
							<span className="rounded-full bg-muted px-3 py-1 font-bold">{fa(rows.length)} ردیف</span>
							{(Object.keys(cnt) as (keyof typeof cnt)[]).map((k) => <span key={k} className={`rounded-full px-3 py-1 font-bold ring-1 ${STATUS_TONE[k]}`}>{STATUS_FA[k]}: {fa(cnt[k])}</span>)}
						</div>
						<Table head={['شخص', 'تاریخ', 'روز', 'حضور', 'کارکرد', 'وظایف', 'انجام‌شده', 'وضعیت', 'توضیح']} empty={!rows.length}>
							{rows.map((r) => (
								<tr key={r.person + r.date} className="hover:bg-muted/40">
									<Td className="font-bold">{r.person}</Td><Td>{faDate(r.date)}</Td><Td>{r.day}</Td><Td>{r.attendance}</Td>
									<Td>{faDate(r.hours)}</Td><Td>{faDate(r.tasks)}</Td><Td>{faDate(r.done)}</Td><Td><StatusChip s={r.status} /></Td>
									<Td className="text-muted-foreground">{r.why}</Td>
								</tr>
							))}
						</Table>
					</>
				)}
			</Card>
			<Card title="جلسات / کارهای حضوری بیرون از شرکت" sub={ds.people.some((p) => p.hasRaw) ? `برگزار شده: ${fa(held.length)} · اضافه‌کار: ${tm(held.reduce((a, x) => a + x.overtime, 0))}` : 'وظایفِ جولیو بارگذاری نشده است (N/A)'}>
				<SessionTable rows={sessions} person />
			</Card>
		</div>
	)
}

/* ---------------- گزارش وکیل / اداره کار ---------------- */
function Lawyer({ ds, f, set }: { ds: Dataset; f: Filter; set: (f: Filter) => void }) {
	const ref = useRef<HTMLDivElement>(null)
	const rows = lawyerRows(ds, f)
	const basis = lawyerBasis(ds.R, ds.people.some((p) => p.hasRaw))
	const period = periodLabel(ds, f)
	return (
		<div ref={ref}>
			<Card
				title="گزارش وکیل / اداره کار"
				sub={'گزارشِ کارکردِ کارکنان — شرکت آرومین · دوره: ' + period + ' · اعدادِ نهایی بعد از کسرِ دیرکردِ بخشوده'}
				actions={<ExportBtns disabled={!rows.length} onExcel={() => exportLawyer(rows, period, basis)} onPrint={() => printSection(ref.current)} />}>
				<Filters ds={ds} f={f} set={set} show={['date', 'person', 'team']} />
				<div className="mt-4">
					<Table head={['ردیف', 'نام و نام خانوادگی', 'دوره', 'روز حضور', 'کارکرد عادی', 'تعطیل', 'اضافه‌کاری', 'مجموع تأخیر', 'بخشوده', 'قابل کسر', 'روز کسر', 'کسرکار', 'مأموریت', 'مرخصی', 'غیبت', 'جمع کل', 'روز کاری نهایی', 'خلاصه وضعیت']} empty={!rows.length}>
						{rows.map((r, i) => (
							<tr key={r.name}>
								<Td>{fa(i + 1)}</Td><Td className="font-bold">{r.name}</Td><Td>{faDate(r.from)} تا {faDate(r.to)}</Td><Td>{fa(r.presentDays)}</Td>
								<Td>{tm(r.regularMin)}</Td><Td>{tm(r.holidayMin)}</Td><Td>{tm(r.overtime)}</Td><Td>{tm(r.lateTotal)}</Td>
								<Td className="text-success">{tm(r.forgiven)}</Td><Td className="font-bold">{tm(r.deductible)}</Td><Td>{fa(r.deductedDays)}</Td><Td>{tm(r.deficit)}</Td>
								<Td>{fa(r.missionDays)} روز</Td><Td>{fa(r.leave)} روز{r.sick ? ` (+${fa(r.sick)} استعلاجی)` : ''}</Td><Td>{fa(r.absent)} روز</Td>
								<Td className="font-bold">{tm(r.totalMin)}</Td><Td className="font-bold">{fa(r.workDaysFinal)}</Td><Td>{r.status}</Td>
							</tr>
						))}
					</Table>
				</div>
				<div className="mt-5 rounded-xl bg-muted/45 p-4 ring-1 ring-border/80">
					<p className="mb-2 text-[12.5px] font-extrabold">مبنای محاسبه</p>
					<ol className="list-decimal space-y-1 pr-5 text-[12px] leading-6 text-muted-foreground">{basis.map((b) => <li key={b}>{b}</li>)}</ol>
				</div>
				<div className="mt-8 grid grid-cols-2 gap-6 text-center text-[12.5px]">
					<div><p className="font-bold">تهیه‌کننده</p><p className="mt-10 border-t border-dashed border-border pt-2 text-muted-foreground">نام و امضا</p></div>
					<div><p className="font-bold">مدیرعامل</p><p className="mt-10 border-t border-dashed border-border pt-2 text-muted-foreground">نام، امضا و مهر</p></div>
				</div>
			</Card>
		</div>
	)
}

/* ---------------- تنظیمات → محاسبات عملکرد (در تبِ تنظیمات نمایش داده می‌شود) ---------------- */
export function PerfSettingsCard({ session }: { session: Session }) {
	const all = canSeeAll(session)
	const { ds } = usePerformance(session, all)
	const [st, setSt] = useState<Settings | null>(null)
	const [msg, setMsg] = useState('')
	useEffect(() => { if (ds) setSt(ds.settings) }, [ds])
	if (!all || !st || !ds) return null
	const f = (key: keyof Settings, label: string, hint?: string) => (
		<Field label={label}>
			<input className={inCls} dir={key === 'taskKeywords' ? 'rtl' : 'ltr'} value={String(st[key])} onChange={(e) => setSt({ ...st, [key]: e.target.value })} />
			{hint && <span className="mt-1 text-[10.5px] text-muted-foreground">{hint}</span>}
		</Field>
	)
	const R = ds.R
	return (
		<div dir="rtl" className="mb-5">
			<Card title="محاسبات عملکرد" sub="قواعدِ حضور، دیرکرد، کسر و جلسهٔ حضوری — مبنای همهٔ نماها و گزارش‌های «حضور و عملکرد».">
				<div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
					{f('workStart', 'شروع موظفی', 'hh:mm')}
					{f('workEnd', 'پایان موظفی', 'hh:mm')}
					{f('dailyWork', 'کار موظفی روزانه', 'hh:mm')}
					{f('restDuration', 'استراحت (دقیقه)')}
					{f('lateThreshold', 'آستانهٔ دیرکرد (دقیقه)')}
					{f('lateDeduct', 'هر چند ساعت دیرکردِ قابل کسر = ۱ روز', 'hh:mm')}
					{f('meetingDefault', 'مدت پیش‌فرض جلسه (دقیقه)', 'وقتی زمان سررسید معتبر نیست')}
					{f('taskKeywords', 'عنوان وظیفهٔ بیرون از شرکت شامل', 'چند کلمه را با «،» جدا کنید')}
				</div>
				<ul className="mt-4 space-y-1 rounded-xl bg-muted/45 p-4 text-[12px] leading-6 text-muted-foreground ring-1 ring-border/80">
					<li>ساعت موظفی: <b className="text-foreground">{tm(R.workStart)} → {tm(R.workEnd)}</b> · روز کامل: <b className="text-foreground">{tm(R.dailyWork)} کار + {tm(R.rest)} استراحت = {tm(R.fullDay)}</b></li>
					<li>ورود تا <b className="text-foreground">{tm(R.workStart + R.lateThreshold)}</b> دیرکرد نیست؛ بعد از آن، دیرکرد از <b className="text-foreground">{tm(R.workStart)}</b> شمرده می‌شود (مثلاً ورود {tm(R.workStart + R.lateThreshold + 2)} = {fa(R.lateThreshold + 2)} دقیقه).</li>
					<li>دیرکردِ قابل کسر = مجموع − بخشوده؛ هر <b className="text-foreground">{tm(R.lateDeduct)}</b> = ۱ روز کسر و مانده حفظ می‌شود.</li>
					<li>وظیفهٔ «{st.taskKeywords}»ِ برگزارشده در روزِ دیرکرد ← دیرکرد بخشوده؛ بخشِ بیرون از حضورِ ثبت‌شده ← اضافه‌کارِ جلسه. مدت: برنامه‌ریزی تا سررسید اگر بیش از ۱۵ دقیقه و حداکثر ۴ ساعت، وگرنه {fa(R.meetingDefault)} دقیقه. وظیفهٔ لغو/یادآوری/برگزارنشده نه بخشودگی دارد نه اضافه‌کار.</li>
				</ul>
				<div className="mt-4 flex flex-wrap items-center gap-2">
					<Btn kind="primary" onClick={() => { try { saveSettings(session, st); setMsg('ذخیره شد.') } catch (e) { setMsg((e as Error).message) } }}>ذخیرهٔ محاسبات</Btn>
					<Btn onClick={() => { saveSettings(session, DEFAULT_SETTINGS); setMsg('پیش‌فرض‌ها برگشت.') }}>پیش‌فرض</Btn>
					{msg && <span role="status" className="text-[12px] font-bold text-success">{msg}</span>}
				</div>
			</Card>
		</div>
	)
}

/* ---------------- مرکز ایمپورت: وضعیتِ حضور (زیرِ کادرِ «ورودِ فایل»، فقط مدیران/مالی) ---------------- */
const faDateTime = (ts: number) => new Date(ts).toLocaleString('fa-IR')
// فایلِ حضور فقط از موتورِ ایمپورت وارد می‌شود (تشخیصِ خودکارِ نوعِ attendance)؛ این نوار فقط وضعیت و حذف را نشان می‌دهد
export function AttendanceStatus({ session }: { session: Session }) {
	const all = canSeeAll(session)
	const { ds } = usePerformance(session, all)
	const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null)
	if (!all || !ds) return null
	const overrides = Object.keys(loadOverrides()).length
	const last = ds.file?.last
	const onClear = async () => {
		if (!confirm('فایلِ حضور و داده‌های مشتق‌شدهٔ آن از این مرورگر پاک شود؟')) return
		const withOv = overrides > 0 && confirm(`${fa(overrides)} ویرایشِ دستی هم هست. آن‌ها هم پاک شوند؟\n«تأیید» = پاک شوند · «لغو» = نگه داشته شوند (با بارگذاریِ دوباره اعمال می‌شوند)`)
		try { await clearAttendance(session, withOv); setMsg({ t: 'فایلِ حضور از این مرورگر پاک شد' + (overrides && !withOv ? `؛ ${fa(overrides)} ویرایشِ دستی نگه داشته شد.` : '.') }) } catch (e) { setMsg({ t: (e as Error).message, err: true }) }
	}
	const range = (() => {
		const d = ds.file ? Object.values(ds.file.sheets).flatMap((rows) => rows.map((r) => normDate(Object.entries(r).find(([k]) => norm(k) === norm('تاریخ'))?.[1]))).filter(Boolean).sort() : []
		return d.length ? faDate(d[0]) + ' تا ' + faDate(d[d.length - 1]) : ''
	})()
	return (
		<div dir="rtl" className="mt-3 rounded-xl bg-muted/40 px-3 py-2.5 ring-1 ring-border/70" aria-label="حضور و غیاب">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="min-w-0 text-[12px] text-muted-foreground" data-testid="att-current">
					<b className="text-foreground">حضور و غیاب: </b>
					{ds.file ? <><bdi dir="auto">{last ? last.fileName : ds.file.fileName}</bdi> · <bdi>{faDateTime(last ? last.loadedAt : ds.file.loadedAt)}</bdi> · {fa(last ? last.people : Object.keys(ds.file.sheets).length)} نفر</> : 'هنوز فایلی بارگذاری نشده'}
				</p>
				{ds.file && <button type="button" onClick={onClear} className={`shrink-0 text-[12px] font-bold text-error hover:underline ${FOCUS}`}>حذف از این مرورگر</button>}
			</div>
			{ds.file && (range || overrides > 0) && <p className="mt-1 text-[11.5px] text-muted-foreground">{range && <>دادهٔ موجود: {fa(Object.keys(ds.file.sheets).length)} نفر · {range}</>}{overrides > 0 && <> · ویرایشِ دستی: {fa(overrides)} (با فایلِ تازه حفظ می‌شود)</>}</p>}
			{msg && <p role="status" className={`mt-1 text-[12px] font-bold ${msg.err ? 'text-error' : 'text-success'}`}>{msg.t}</p>}
		</div>
	)
}

/* ---------------- نگاشتِ اشخاص (N18، فقط مدیران/مالی) ---------------- */
function MappingPanel({ ds, session, go }: { ds: Dataset; session: Session; go?: (id: string) => void }) {
	const owners = ds.stats.owners
	return (
		<div className="flex flex-col gap-5">
			<Card title="نگاشتِ اشخاص" sub="هر شیتِ حضور ← شخصِ سیستم (دسترسی و وظایفِ سیستم) ← کاربرِ جولیو (جلسات). اولویت با نامِ کاملِ سیستم و شناسهٔ جولیو است؛ ردیفِ «حدسی» را بررسی و در صورت نیاز دستی تعیین کنید. هیچ نامی در داده تغییر نمی‌کند."
				actions={<><Btn onClick={() => go?.('import')}>فایل‌ها در مرکز ایمپورت ←</Btn><Btn onClick={() => go?.('p-set')}>محاسبات در تنظیمات ←</Btn></>}>
				{ds.people.length ? (
					<Table head={['شیت', 'نام در فایل حضور', 'شخصِ سیستم', '', 'کاربرِ جولیو (وظایف)', '', 'بازهٔ وظایفِ سیستم']}>
						{ds.people.map((p) => (
							<tr key={p.sheetName}>
								<Td>{p.sheetName}</Td>
								<Td>{p.displayName}</Td>
								<Td>
									<select aria-label={'شخصِ سیستم برای ' + p.displayName} className={inCls + ' min-w-[160px]'} value={p.person || ''} onChange={(e) => saveLink(session, p.sheetName, { person: e.target.value || undefined })}>
										<option value="">— انتخاب —</option>
										{ds.peopleNames.map((n) => <option key={n} value={n}>{n}</option>)}
									</select>
								</Td>
								<Td><HowChip how={p.personHow} /></Td>
								<Td>
									<select aria-label={'کاربرِ جولیو برای ' + p.displayName} className={inCls + ' min-w-[180px]'} value={owners.find((o) => o.name === p.ownerName)?.key || ''} disabled={!owners.length}
										onChange={(e) => saveLink(session, p.sheetName, { person: p.personHow === 'manual' ? p.person || undefined : undefined, owner: e.target.value || undefined })}>
										<option value="">{owners.length ? '— انتخاب —' : 'فایلِ وظایف نیست'}</option>
										{owners.map((o) => <option key={o.key} value={o.key}>{o.name}{o.pid ? ` (ID ${o.pid})` : ''} · {fa(o.n)}</option>)}
									</select>
								</Td>
								<Td>{owners.length ? <HowChip how={p.ownerHow} /> : '—'}</Td>
								<Td>{p.hasStoreTasks ? faDate(p.storeFirst) + ' تا ' + faDate(p.storeLast) : NA}</Td>
							</tr>
						))}
					</Table>
				) : <Empty title="اول فایلِ حضور را در «مرکز ایمپورت» بارگذاری کنید" />}
			</Card>
		</div>
	)
}

/* ---------------- گزارشات: N8 خلاصهٔ کارکرد فردی + N15 گزارش وکیل / اداره کار ---------------- */
function SummaryReport({ ds, f, set }: { ds: Dataset; f: Filter; set: (f: Filter) => void }) {
	const ref = useRef<HTMLDivElement>(null)
	const [sel, setSel] = useState(ds.people[0]?.sheetName || '')
	const p = ds.people.find((x) => x.sheetName === sel) || ds.people[0]
	if (!p) return null
	const pf = { ...f, person: p.sheetName, team: '' }
	const s = personSummary(p, pf, ds.R)
	return (
		<div ref={ref}>
			<Card title={'خلاصهٔ کارکرد فردی — ' + p.displayName} sub={faDate(s.from) + ' → ' + faDate(s.to) + ' · اعدادِ نهایی بعد از کسرِ دیرکردِ بخشوده'}
				actions={<ExportBtns onExcel={() => exportPerson(p, s, filterRows(p, pf), lateRows(p, pf), sessionRows({ ...ds, people: [p] }, pf))} onPrint={() => printSection(ref.current)} />}>
				<div className="no-print grid grid-cols-2 gap-3 @2xl:grid-cols-4">
					{ds.scopeAll && ds.people.length > 1 && (
						<Field label="کارمند">
							<select className={inCls} value={p.sheetName} onChange={(e) => setSel(e.target.value)}>
								{ds.people.map((x) => <option key={x.sheetName} value={x.sheetName}>{x.displayName}</option>)}
							</select>
						</Field>
					)}
				</div>
				<Filters ds={{ ...ds, scopeAll: false }} f={f} set={set} show={['date']} />
				<dl className="mt-4 grid gap-x-8 @2xl:grid-cols-2" aria-label="خلاصهٔ کارکرد">
					{summaryLines(s).map(([k, v, u]) => (
						<div key={k} className="flex items-baseline gap-3 border-b border-border/60 py-2.5">
							<dt className="text-[12.5px] text-muted-foreground">{k}</dt>
							<dd className="mr-auto text-left"><span className="text-[14.5px] font-extrabold tabular-nums">{faDate(v)}</span>{u && <span className="block text-[11px] text-muted-foreground">{faDate(u)}</span>}</dd>
						</div>
					))}
				</dl>
				{s.holidays.length > 0 && (
					<div className="mt-4">
						<p className="mb-2 text-[12px] font-extrabold">تعطیلاتِ ماه</p>
						<ul className="flex flex-wrap gap-1.5">{s.holidays.map((h) => <li key={h.date} className="rounded-full bg-accent/12 px-2.5 py-1 text-[11.5px] ring-1 ring-accent/35"><b className="tabular-nums">{faDate(h.date)}</b> — {h.label}</li>)}</ul>
					</div>
				)}
			</Card>
		</div>
	)
}
export type ReportView = 'summary' | 'lawyer'
/** بخشِ «گزارش‌های عملکرد» در تبِ گزارشات؛ همان موتور و همان محدودیتِ دسترسی */
export function ReportsPerf({ session, go, initial = 'summary' }: { session: Session; go: (id: string) => void; initial?: ReportView }) {
	const { ds, loading } = usePerformance(session)
	const all = canSeeAll(session)
	const [view, setView] = useState<ReportView>(initial)
	const [f, setF] = useState<Filter>(EMPTY_FILTER)
	useEffect(() => clearPerfView(), [])
	const safeF = all ? f : { ...f, person: '', team: '' }
	const tabs: { id: ReportView; label: string }[] = [{ id: 'summary', label: 'خلاصهٔ کارکرد فردی' }, { id: 'lawyer', label: 'گزارش وکیل / اداره کار' }]
	return (
		<section dir="rtl" className="mb-5 flex flex-col gap-4" aria-label="گزارش‌های عملکرد">
			<div className="no-print flex flex-wrap items-center justify-between gap-3">
				<div role="tablist" aria-label="گزارش‌های عملکرد" className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-muted/60 p-1">
					{tabs.map((t) => (
						<button key={t.id} role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)}
							className={`shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition ${FOCUS} ${view === t.id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
					))}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[11.5px] text-muted-foreground">{all ? 'دسترسی: همهٔ کارکنان' : 'دسترسی: فقط دادهٔ خودِ شما'}</span>
					<Btn onClick={() => { setPerfView('recon'); go('performance') }}>گزارش تطبیق وظیفه و حضور ←</Btn>
				</div>
			</div>
			{loading || !ds ? <div className="h-32 animate-pulse rounded-2xl bg-muted/50" aria-busy="true" />
				: !ds.people.length ? <Empty title={ds.file ? 'برای شما شیتِ حضوری در فایلِ فعلی پیدا نشد' : 'هنوز فایلِ حضور و غیاب بارگذاری نشده'}>{all ? 'فایلِ دستگاهِ حضور را در «مرکز ایمپورت» وارد کنید.' : 'دادهٔ حضورِ شما هنوز در این دستگاه بارگذاری نشده است.'}</Empty>
				: view === 'summary' ? <SummaryReport ds={ds} f={safeF} set={setF} /> : <Lawyer ds={ds} f={safeF} set={setF} />}
		</section>
	)
}

/* ---------------- صفحه: «عملکرد» (یکی‌شدهٔ تب‌های E و N) ---------------- */
export default function PerformancePage({ session, initial = 'dash', go, setPanel }: { session: Session; initial?: PerfView; go?: (id: string) => void; setPanel?: (panel: string | null) => void }) {
	const { ds, loading, err } = usePerformance(session)
	const all = canSeeAll(session)
	const [view, setView] = useState<PerfView>(initial)
	const [f, setF] = useState<Filter>(EMPTY_FILTER)
	useEffect(() => clearPerfView(), [])
	// «فعالیت، امتیاز و ردیاب» = پنل‌های موتورِ قبلی (E4 تا E12) زیرِ همین تب
	useEffect(() => { setPanel?.(view === 'activity' ? 'p-kpi' : null) }, [view, setPanel])
	useEffect(() => () => setPanel?.(null), [setPanel])
	// کارمند هرگز فیلترِ شخص/تیمِ دیگری نمی‌گیرد (حتی از state) — دیتاستش هم فقط خودِ اوست
	const safeF = all ? f : { ...f, person: '', team: '' }
	const views: { id: PerfView; label: string }[] = [
		{ id: 'dash', label: all ? 'داشبورد مدیریتی' : 'داشبورد من' },
		{ id: 'people', label: all ? 'عملکرد افراد' : 'عملکرد من' },
		{ id: 'recon', label: 'تطبیق وظیفه و حضور' },
		{ id: 'activity', label: 'فعالیت، امتیاز و ردیاب وظیفه' },
		...(all ? [{ id: 'data' as PerfView, label: 'نگاشت اشخاص' }] : []),
	]
	const body = () => {
		if (view === 'activity') return <p className="px-1 text-[12.5px] text-muted-foreground">ورودیِ عملکرد، سنجش با استاندارد، امتیاز و جایزه، ردیاب وظیفه، مقایسهٔ تیم و ساعت تلاش مؤثر — از موتورِ اصلی (همان دسترسی‌ها).</p>
		if (loading || !ds) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50" aria-busy="true" />
		if (view === 'data' && all) return <MappingPanel ds={ds} session={session} go={go} />
		if (!ds.people.length)
			return (
				<Empty title={ds.file ? 'برای شما شیتِ حضوری در فایلِ فعلی پیدا نشد' : 'هنوز فایلِ حضور و غیاب بارگذاری نشده'}>
					{all ? <>فایلِ دستگاهِ حضور را در «مرکز ایمپورت» وارد کنید. <button className="font-bold text-primary-ink underline" onClick={() => go?.('import')}>رفتن به مرکز ایمپورت</button></> : 'دادهٔ حضورِ شما هنوز در این دستگاه بارگذاری نشده است؛ از مدیر یا واحد مالی بخواهید.'}
				</Empty>
			)
		if (view === 'people') return <People ds={ds} f={safeF} set={setF} session={session} />
		if (view === 'recon') return <Recon ds={ds} f={safeF} set={setF} />
		return <Dashboard ds={ds} f={safeF} set={setF} />
	}
	return (
		<div dir="rtl" className={`flex flex-col gap-5 ${view === 'activity' ? 'mb-5' : ''}`}>
			<div className="no-print flex flex-wrap items-center justify-between gap-3">
				<div role="tablist" aria-label="بخش‌های عملکرد" className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-muted/60 p-1">
					{views.map((v) => (
						<button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
							className={`shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition ${FOCUS} ${view === v.id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>
							{v.label}
						</button>
					))}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[11.5px] text-muted-foreground">{all ? 'دسترسی: همهٔ کارکنان' : 'دسترسی: فقط دادهٔ خودِ شما'}</span>
					<Btn onClick={() => { setPerfView('summary'); go?.('p-report') }}>گزارش‌ها ←</Btn>
				</div>
			</div>
			{err && <p className="no-print rounded-xl bg-warning/12 px-4 py-2.5 text-[12px] text-warning ring-1 ring-warning/35">{err}</p>}
			{body()}
		</div>
	)
}
