'use client'

/**
 * داشبوردِ آرومین — کاشی‌های کشیدنی، **متصل به دادهٔ واقعیِ /api/state**.
 * (اگر سرور در دسترس نباشد، دادهٔ نمونه نشان داده می‌شود و برچسبِ «نمونه» می‌خورد.)
 */

import { useMemo, type ReactNode } from 'react'
import DraggableWidgetGrid, { type WidgetItem } from '@/components/ui/draggable-widget-grid'
import Gauge3D from '@/components/ui/gauge-3d'
import { Shell, Big, Row, Dot, Bars, BarRow, faNum } from '@/components/ui/kit'
import { useAromin, dataTag, type Metrics } from '@/lib/data'
import { tokenHex, useTheme } from '@/lib/theme'
import type { Session } from '@/lib/auth'
import { canSeeAll, dailySeries, EMPTY_FILTER, NA, totals, type Dataset } from '@/lib/performance'
import { usePerformance } from '@/components/performance/usePerformance'
import { ClusterTile, GaugeTile, LiveFeedTile } from '@/components/dashboard/gauges/GaugeTiles'
import { NEON_SAMPLE, NeonKpi, NeonRadar, NeonRings, NeonSpeed, NeonWave, useNeonColors } from '@/components/dashboard/NeonWidgets'

/** رنگ‌های تم برای عقربه‌ها (SVG هگز لازم دارد) */
type TC = { primary: string; secondary: string; accent: string }

type Kind = 'target' | 'conversion' | 'sales' | 'funnel' | 'channels' | 'agents' | 'deals' | 'budget' | 'fcYear' | 'fcVsActual' | PerfKind | NeonKind | GaugeKind
/** کاشی‌های «حضور و عملکرد» — فقط برای مدیران/مالی، از همان دیتاستِ محدود‌شده */
type PerfKind = 'pfRate' | 'pfHours' | 'pfLate' | 'pfRecon'
/** کاشی‌های نئونی (بستهٔ طراحیِ Cyberpunk) — فعلاً با دادهٔ نمونهٔ طراحی تا منبعِ هرکدام تعیین شود */
type NeonKind = 'nwSpeed' | 'nwRings' | 'nwKpi' | 'nwRadar' | 'nwWave'
/** کاشی‌های گیجِ آنالوگ (بستهٔ «Gauge Cluster») — فعلاً با منبعِ نمونه (gauges/gaugeMock.ts) تا اتصالشان تعیین شود */
type GaugeKind = 'bgTach' | 'bgSpeed' | 'bgFuel' | 'bgTemp' | 'bgPower' | 'bgFeed' | 'bgCluster'
interface Tile extends WidgetItem {
	kind: Kind
}

const TILES: Tile[] = [
	{ id: 'target', kind: 'target', size: 'sm' },
	{ id: 'conversion', kind: 'conversion', size: 'sm' },
	{ id: 'sales', kind: 'sales', size: 'wide' },
	{ id: 'funnel', kind: 'funnel', size: 'wide' },
	{ id: 'channels', kind: 'channels', size: 'sm' },
	{ id: 'agents', kind: 'agents', size: 'wide' },
	{ id: 'deals', kind: 'deals', size: 'sm' },
	{ id: 'budget', kind: 'budget', size: 'wide' },
	{ id: 'fcYear', kind: 'fcYear', size: 'wide' },
	{ id: 'fcVsActual', kind: 'fcVsActual', size: 'sm' },
]
const PERF_TILES: Tile[] = [
	{ id: 'pfRate', kind: 'pfRate', size: 'sm' },
	{ id: 'pfHours', kind: 'pfHours', size: 'wide' },
	{ id: 'pfLate', kind: 'pfLate', size: 'sm' },
	{ id: 'pfRecon', kind: 'pfRecon', size: 'sm' },
]
const NEON_TILES: Tile[] = [
	{ id: 'nwSpeed', kind: 'nwSpeed', size: 'wide' },
	{ id: 'nwRings', kind: 'nwRings', size: 'sm' },
	{ id: 'nwKpi', kind: 'nwKpi', size: 'sm' },
	{ id: 'nwRadar', kind: 'nwRadar', size: 'sm' },
	{ id: 'nwWave', kind: 'nwWave', size: 'wide' },
]
function NeonView({ kind }: { kind: NeonKind }) {
	const k = useNeonColors(), d = NEON_SAMPLE
	switch (kind) {
		case 'nwSpeed': return <NeonSpeed value={d.revenue} k={k} />
		case 'nwRings': return <NeonRings d={d} k={k} />
		case 'nwKpi': return <NeonKpi d={d} k={k} />
		case 'nwRadar': return <NeonRadar d={d} k={k} />
		case 'nwWave': return <NeonWave d={d} k={k} />
	}
}
const GAUGE_TILES: Tile[] = [
	{ id: 'bgCluster', kind: 'bgCluster', size: 'wide' },
	{ id: 'bgTach', kind: 'bgTach', size: 'tall' },
	{ id: 'bgSpeed', kind: 'bgSpeed', size: 'tall' },
	{ id: 'bgFuel', kind: 'bgFuel', size: 'sm' },
	{ id: 'bgTemp', kind: 'bgTemp', size: 'sm' },
	{ id: 'bgPower', kind: 'bgPower', size: 'sm' },
	{ id: 'bgFeed', kind: 'bgFeed', size: 'sm' },
]
function GaugeView({ kind }: { kind: GaugeKind }) {
	switch (kind) {
		case 'bgCluster': return <ClusterTile />
		case 'bgFeed': return <LiveFeedTile />
		case 'bgTach': return <GaugeTile id="tach" hero />
		case 'bgSpeed': return <GaugeTile id="speed" hero />
		case 'bgFuel': return <GaugeTile id="fuel" />
		case 'bgTemp': return <GaugeTile id="temp" />
		case 'bgPower': return <GaugeTile id="power" />
	}
}
const ALL_F = EMPTY_FILTER
const fa1 = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })

function PerfView({ kind, ds, tc }: { kind: PerfKind; ds: Dataset | null; tc: TC }): ReactNode {
	const t = ds ? totals(ds, ALL_F) : null
	const none = !ds || !ds.people.length
	const meta = none ? 'فایلِ حضور بارگذاری نشده' : `${faNum(t!.people)} نفر`
	switch (kind) {
		case 'pfRate':
			return (
				<Shell title="نرخِ حضور" meta={meta}>
					<div className="flex min-h-0 flex-1 items-center justify-center">
						{t?.rate == null ? <Big>{NA}</Big> : <Gauge3D value={Math.round(t.rate)} unit="٪" from={tc.secondary} to={tc.primary} />}
					</div>
				</Shell>
			)
		case 'pfHours': {
			const s = ds ? dailySeries(ds, ALL_F) : []
			return (
				<Shell title="ساعاتِ کار و اضافه‌کار" meta={meta}>
					<Big unit="ساعت">{t && !none ? fa1(t.minutes / 60) : NA}</Big>
					<p className="mt-1 text-[12px] text-muted-foreground">اضافه‌کار: {t?.overtime == null ? NA : fa1(t.overtime / 60) + ' ساعت'}</p>
					<Bars data={s.map((d) => d.hours)} />
				</Shell>
			)
		}
		case 'pfLate':
			return (
				<Shell title="تأخیر و کسرکار" meta={meta}>
					<Big unit="ساعت قابل کسر">{t && !none ? fa1(t.deductible / 60) : NA}</Big>
					<dl className="mt-auto space-y-2">
						<Row value={t && !none ? faNum(t.lateCount) + ' · ' + fa1(t.late / 60) + ' ساعت' : NA}><Dot tone="warn" />کلِ تأخیر</Row>
						<Row value={t && !none ? faNum(t.deductedDays) : NA}><Dot tone="err" />روزِ کسرشده</Row>
						<Row value={t && !none ? fa1(t.deficit / 60) : NA}><Dot tone="err" />کسرکار (ساعت)</Row>
					</dl>
				</Shell>
			)
		case 'pfRecon':
			return (
				<Shell title="تطبیقِ وظیفه و حضور" meta={meta}>
					<Big unit="٪">{t?.matchedPct == null ? NA : fa1(t.matchedPct)}</Big>
					<dl className="mt-auto space-y-2">
						<Row value={t?.evaluated ? faNum(t.matched) : NA}><Dot tone="ok" />تطبیق</Row>
						<Row value={t?.evaluated ? faNum(t.missing) : NA}><Dot tone="warn" />وظیفه ثبت نشده</Row>
						<Row value={t?.evaluated ? faNum(t.mismatch) : NA}><Dot tone="err" />ناهمخوان</Row>
					</dl>
				</Shell>
			)
	}
}

const tag = dataTag

function View({ kind, m, tc }: { kind: Kind; m: Metrics; tc: TC }): ReactNode {
	switch (kind as Exclude<Kind, PerfKind | NeonKind | GaugeKind>) {
		case 'target':
			return (
				<Shell title="تحققِ تارگت (سالانه)" meta={tag(m)}>
					<div className="flex min-h-0 flex-1 items-center justify-center">
						<Gauge3D value={m.targetPct} unit="٪" from={tc.primary} to={tc.accent} />
					</div>
				</Shell>
			)
		case 'conversion':
			return (
				<Shell title="نرخِ تبدیل" meta={tag(m)}>
					<div className="flex min-h-0 flex-1 items-center justify-center">
						<Gauge3D value={m.conversion} unit="٪" from={tc.secondary} to={tc.accent} />
					</div>
				</Shell>
			)
		case 'sales':
			return (
				<Shell title="فروشِ محقق (won)" meta={tag(m)}>
					<Big unit="میلیون تومان">{faNum(m.wonMillion)}</Big>
					<Bars data={m.wonByMonth} />
				</Shell>
			)
		case 'funnel': {
			const max = Math.max(1, ...m.funnel.map((f) => f.v))
			return (
				<Shell title="قیفِ فروش" meta={`${faNum(m.totalDeals)} معامله`}>
					<div className="mt-auto space-y-2">
						{m.funnel.map((f, i) => (
							<BarRow key={f.name} name={f.name} value={f.v} max={max} lead={i === 0} />
						))}
					</div>
				</Shell>
			)
		}
		case 'channels': {
			const tot = Math.max(1, m.channels.reduce((a, c) => a + c.v, 0))
			return (
				<Shell title="سهمِ کانال‌ها" meta={tag(m)}>
					<Big unit="معامله">{faNum(tot)}</Big>
					<dl className="mt-auto space-y-2">
						{m.channels.map((c, i) => (
							<Row key={c.name} value={`${faNum(Math.round((c.v / tot) * 100))}٪`}>
								<Dot tone={i === 0 ? 'ok' : 'idle'} />
								{c.name}
							</Row>
						))}
					</dl>
				</Shell>
			)
		}
		case 'agents': {
			const max = Math.max(1, ...m.agents.map((a) => a.v))
			return (
				<Shell title="برترین کارشناسان" meta="فروشِ محقق (میلیون)">
					<div className="mt-auto space-y-2">
						{m.agents.map((a, i) => (
							<BarRow key={a.name} name={a.name} value={a.v} max={max} lead={i === 0} />
						))}
					</div>
				</Shell>
			)
		}
		case 'deals':
			return (
				<Shell title="وضعیتِ معاملات" meta={tag(m)}>
					<Big unit="کل">{faNum(m.totalDeals)}</Big>
					<dl className="mt-auto space-y-2">
						<Row value={faNum(m.won)}><Dot tone="ok" />بسته‌شده</Row>
						<Row value={faNum(m.open)}><Dot tone="warn" />در جریان</Row>
						<Row value={faNum(m.lost)}><Dot tone="err" />ازدست‌رفته</Row>
					</dl>
				</Shell>
			)
		case 'fcYear':
			return (
				<Shell title={`پیش‌بینیِ فروش ${m.fcYear ? 'سالِ ' + faNum(m.fcYear).replace(/٬/g, '') : ''}`} meta="از تبِ پیش‌بینی">
					<Big unit="میلیون تومان">{faNum(m.fcYearMillion)}</Big>
					<Bars data={m.fcByMonth} />
				</Shell>
			)
		case 'fcVsActual':
			return (
				<Shell title="واقعی در برابرِ پیش‌بینی" meta={m.fcMonths ? `${faNum(m.fcMonths)} ماه` : tag(m)}>
					<div className="flex min-h-0 flex-1 items-center justify-center">
						<Gauge3D value={m.fcVsActualPct} max={200} unit="٪" from={tc.secondary} to={tc.primary} />
					</div>
				</Shell>
			)
		case 'budget':
			return (
				<Shell title="بودجهٔ ماهانه" meta={`${faNum(m.budgetMillion)} م.ت سالانه`}>
					<Big unit="میلیون تومان">{faNum(m.budgetMillion)}</Big>
					<Bars data={m.budgetByMonth} />
				</Shell>
			)
	}
}

/** نامِ دسترس‌پذیرِ هر کاشی (برای صفحه‌خوان و جابه‌جایی با صفحه‌کلید) */
const LABELS: Record<string, string> = {
	target: 'تحققِ تارگت', conversion: 'نرخِ تبدیل', sales: 'فروشِ محقق', funnel: 'قیفِ فروش', channels: 'سهمِ کانال‌ها', agents: 'برترین کارشناسان',
	deals: 'وضعیتِ معاملات', budget: 'بودجهٔ ماهانه', fcYear: 'پیش‌بینیِ فروش', fcVsActual: 'واقعی در برابرِ پیش‌بینی', pfRate: 'نرخِ حضور',
	nwSpeed: 'نئون: تحققِ تارگتِ درآمد', nwRings: 'نئون: درآمد و نقدینگی', nwKpi: 'نئون: سود و جریانِ نقدی', nwRadar: 'نئون: سهمِ بازار', nwWave: 'نئون: فعالیتِ فروش',
	bgCluster: 'گیج: کلاسترِ عملکرد', bgTach: 'گیج: دورسنج', bgSpeed: 'گیج: سرعت‌سنج', bgFuel: 'گیج: سوخت', bgTemp: 'گیج: دما', bgPower: 'گیج: توان', bgFeed: 'گیج: فیدِ زنده',
	pfHours: 'ساعاتِ کار و اضافه‌کار', pfLate: 'تأخیر و کسرکار', pfRecon: 'تطبیقِ وظیفه و حضور',
}
const STORAGE_KEY = 'aromin.board.order'
/** ترتیبِ کاشی‌ها برای هر کاربر جدا (کلیدِ قدیمیِ سراسری فقط به‌عنوانِ مقدارِ اولیه خوانده می‌شود) */
const keyOf = (user: string) => STORAGE_KEY + '.' + user

function ordered(tiles: Tile[], user: string): Tile[] {
	try {
		const raw = localStorage.getItem(keyOf(user)) || localStorage.getItem(STORAGE_KEY) || '[]'
		const saved = JSON.parse(raw) as string[]
		if (Array.isArray(saved) && saved.length) {
			const byId = new Map(tiles.map((t) => [t.id, t]))
			const out = saved.map((id) => byId.get(id)).filter(Boolean) as Tile[]
			for (const t of tiles) if (!out.includes(t)) out.push(t)
			return out
		}
	} catch {
		/* ignore */
	}
	return tiles
}

export default function Board({ session }: { session: Session }) {
	const { m } = useAromin()
	const th = useTheme()
	const perf = canSeeAll(session)
	const { ds } = usePerformance(session, perf)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const tc = useMemo<TC>(() => ({ primary: tokenHex('primary'), secondary: tokenHex('secondary'), accent: tokenHex('accent') }), [th])
	const user = session.user || session.name
	const items = useMemo(() => ordered(perf ? TILES.concat(PERF_TILES, NEON_TILES, GAUGE_TILES) : TILES, user).map((t) => (LABELS[t.id] && !t.label ? { ...t, label: LABELS[t.id] } : t)), [perf, user])
	const save = (list: WidgetItem[]) => {
		try {
			localStorage.setItem(keyOf(user), JSON.stringify(list.map((i) => i.id)))
		} catch {
			/* ignore */
		}
	}
	return (
		<DraggableWidgetGrid
			items={items}
			onChange={save}
			renderItem={(item) => {
				const k = (item as Tile).kind
				return k.startsWith('bg') ? <GaugeView kind={k as GaugeKind} /> : k.startsWith('nw') ? <NeonView kind={k as NeonKind} /> : k.startsWith('pf') ? <PerfView kind={k as PerfKind} ds={perf ? ds : null} tc={tc} /> : <View kind={k} m={m} tc={tc} />
			}}
		/>
	)
}
