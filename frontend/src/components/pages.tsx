'use client'

/**
 * صفحاتِ تب‌ها — متصل به دادهٔ واقعیِ /api/state (useAromin).
 * بخش‌هایی که در سرور داده ندارند (تیکت/پشتیبانی) صادقانه «بدون داده» نشان داده می‌شوند.
 */

import { type ReactNode } from 'react'
import Gauge3D from '@/components/ui/gauge-3d'
import { CARD } from '@/components/ui/tokens'
import { Shell, Big, Row, Dot, Bars, BarRow, faNum } from '@/components/ui/kit'
import { useAromin, dataTag } from '@/lib/data'

function Card({ span = 1, children }: { span?: 1 | 2; children: ReactNode }) {
	return (
		<div className={`overflow-hidden ${CARD} ${span === 2 ? 'sm:col-span-2' : ''}`}>
			{children}
		</div>
	)
}
function Grid({ children }: { children: ReactNode }) {
	return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-h-[196px]">{children}</div>
}

/* ---------------- دفتر فروش ---------------- */
export function LedgerPage() {
	const { m } = useAromin()
	const tot = Math.max(1, m.channels.reduce((a, c) => a + c.v, 0))
	const amax = Math.max(1, ...m.agents.map((a) => a.v))
	return (
		<Grid>
			<Card span={2}>
				<Shell title="فروشِ محقق (won)" meta={dataTag(m)}>
					<Big unit="میلیون تومان">{faNum(m.wonMillion)}</Big>
					<Bars data={m.wonByMonth} />
				</Shell>
			</Card>
			<Card>
				<Shell title="وضعیتِ معاملات">
					<Big unit="کل">{faNum(m.totalDeals)}</Big>
					<dl className="mt-auto space-y-2">
						<Row value={faNum(m.won)}><Dot tone="ok" />بسته‌شده</Row>
						<Row value={faNum(m.open)}><Dot tone="warn" />در جریان</Row>
						<Row value={faNum(m.lost)}><Dot tone="err" />ازدست‌رفته</Row>
					</dl>
				</Shell>
			</Card>
			<Card>
				<Shell title="سهمِ کانال‌ها">
					<Big unit="معامله">{faNum(tot)}</Big>
					<dl className="mt-auto space-y-2">
						{m.channels.map((c, i) => (
							<Row key={c.name} value={`${faNum(Math.round((c.v / tot) * 100))}٪`}>
								<Dot tone={i === 0 ? 'ok' : 'idle'} />{c.name}
							</Row>
						))}
					</dl>
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="برترین کارشناسان" meta="فروشِ محقق (میلیون)">
					<div className="mt-auto space-y-2">
						{m.agents.map((a, i) => <BarRow key={a.name} name={a.name} value={a.v} max={amax} lead={i === 0} />)}
					</div>
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="فروشِ ماهانه" meta="۱۲ ماه">
					<Big unit="میلیون تومان">{faNum(m.wonMillion)}</Big>
					<Bars data={m.wonByMonth} />
				</Shell>
			</Card>
		</Grid>
	)
}

/* ---------------- عملکرد ---------------- */
export function PerformancePage() {
	const { m } = useAromin()
	const fmax = Math.max(1, ...m.funnel.map((f) => f.v))
	const amax = Math.max(1, ...m.agents.map((a) => a.v))
	return (
		<Grid>
			<Card>
				<Shell title="تحققِ تارگت" meta={dataTag(m)}>
					<div className="flex min-h-0 flex-1 items-center justify-center"><Gauge3D value={m.targetPct} unit="٪" /></div>
				</Shell>
			</Card>
			<Card>
				<Shell title="نرخِ تبدیل" meta={`${faNum(m.won)}/${faNum(m.totalDeals)}`}>
					<div className="flex min-h-0 flex-1 items-center justify-center"><Gauge3D value={m.conversion} unit="٪" from="#004991" to="#FCBF00" /></div>
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="برترین کارشناسان" meta="فروشِ محقق (میلیون)">
					<div className="mt-auto space-y-2">
						{m.agents.map((a, i) => <BarRow key={a.name} name={a.name} value={a.v} max={amax} lead={i === 0} />)}
					</div>
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="قیفِ فروش" meta={`${faNum(m.totalDeals)} معامله`}>
					<div className="mt-auto space-y-2">
						{m.funnel.map((f, i) => <BarRow key={f.name} name={f.name} value={f.v} max={fmax} lead={i === 0} />)}
					</div>
				</Shell>
			</Card>
		</Grid>
	)
}

/* ---------------- تیم پشتیبانی (تیکت‌های واقعی) ---------------- */
export function SupportPage() {
	const { m } = useAromin()
	const t = m.tickets
	if (!m.loading && t.total === 0)
		return (
			<Grid>
				<Card span={2}>
					<Shell title="تیم پشتیبانی">
						<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
							<p className="text-[13px] font-bold text-foreground">هنوز تیکتی وارد نشده.</p>
							<p className="max-w-[320px] text-[12px] leading-6 text-muted-foreground">اکسلِ تیکت‌های جولیو را در «مرکز ایمپورت» بینداز؛ SLA و آمارِ پشتیبانی این‌جا زنده می‌شود.</p>
						</div>
					</Shell>
				</Card>
			</Grid>
		)
	const amax = Math.max(1, ...t.byAgent.map((a) => a.v))
	return (
		<Grid>
			<Card>
				<Shell title="رعایتِ SLA" meta={dataTag(m)}>
					<div className="flex min-h-0 flex-1 items-center justify-center"><Gauge3D value={t.slaPct} unit="٪" from="#910D6A" to="#E0701A" /></div>
				</Shell>
			</Card>
			<Card>
				<Shell title="تیکت‌ها">
					<Big unit="تیکت">{faNum(t.total)}</Big>
					<dl className="mt-auto space-y-2">
						<Row value={faNum(t.met)}><Dot tone="ok" />در مهلت</Row>
						<Row value={faNum(t.total - t.met)}><Dot tone="err" />با تأخیر</Row>
						<Row value={faNum(t.matched)}><Dot tone="idle" />متصل به معامله</Row>
					</dl>
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="تیکت به تفکیکِ کارشناس" meta="تعداد · در مهلت">
					<div className="mt-auto space-y-2">
						{t.byAgent.map((a, i) => <BarRow key={a.name} name={`${a.name} (${faNum(a.met)}✓)`} value={a.v} max={amax} lead={i === 0} />)}
					</div>
				</Shell>
			</Card>
		</Grid>
	)
}

/* ---------------- پیش‌بینی و بودجه ---------------- */
export function ForecastPage() {
	const { m } = useAromin()
	const fmax = Math.max(1, ...m.funnel.map((f) => f.v))
	return (
		<Grid>
			<Card span={2}>
				<Shell title="بودجهٔ سالانه" meta="۱۲ ماه (میلیون تومان)">
					<Big unit="میلیون تومان">{faNum(m.budgetMillion)}</Big>
					<Bars data={m.budgetByMonth} />
				</Shell>
			</Card>
			<Card>
				<Shell title="تحققِ بودجه">
					<div className="flex min-h-0 flex-1 items-center justify-center"><Gauge3D value={m.targetPct} unit="٪" /></div>
				</Shell>
			</Card>
			<Card>
				<Shell title="محقق‌شده">
					<Big unit="میلیون تومان">{faNum(m.wonMillion)}</Big>
					<Bars data={m.wonByMonth} height={36} />
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="قیفِ فروش" meta={`${faNum(m.totalDeals)} معامله`}>
					<div className="mt-auto space-y-2">
						{m.funnel.map((f, i) => <BarRow key={f.name} name={f.name} value={f.v} max={fmax} lead={i === 0} />)}
					</div>
				</Shell>
			</Card>
			<Card span={2}>
				<Shell title="فروشِ ماهانه در برابرِ بودجه" meta="محقق / بودجه">
					<div className="mt-auto space-y-2">
						{['محقق‌شده', 'بودجه'].map((lbl, i) => (
							<BarRow key={lbl} name={lbl} value={i === 0 ? m.wonMillion : m.budgetMillion} max={Math.max(m.budgetMillion, m.wonMillion, 1)} lead={i === 0} />
						))}
					</div>
				</Shell>
			</Card>
		</Grid>
	)
}

/* ---------------- تنظیمات ---------------- */
export function SettingsPage() {
	const { m } = useAromin()
	return (
		<Grid>
			<Card>
				<Shell title="کارشناسان" meta="تیم">
					<Big unit="نفر">{faNum(m.people)}</Big>
					<p className="mt-auto text-[12px] text-muted-foreground">از دفترِ فروش</p>
				</Shell>
			</Card>
			<Card>
				<Shell title="حجمِ داده">
					<Big unit="معامله">{faNum(m.totalDeals)}</Big>
					<p className="mt-auto text-[12px] text-muted-foreground">ثبت‌شده در سرور</p>
				</Shell>
			</Card>
			<Card>
				<Shell title="یکپارچه‌سازی">
					<dl className="mt-auto space-y-2">
						<Row value={m.loading ? '…' : m.real ? 'متصل' : 'آفلاین'}><Dot tone={m.real ? 'ok' : 'idle'} pulse={m.real} />MariaDB</Row>
						<Row value="متصل"><Dot tone="ok" />پیامک (نبض‌کار)</Row>
						<Row value="متصل"><Dot tone="ok" />دستیارِ هوش</Row>
					</dl>
				</Shell>
			</Card>
			<Card>
				<Shell title="نسخه" meta="آرومین">
					<Big>۴٫۰</Big>
					<p className="mt-auto text-[12px] text-muted-foreground">React · دادهٔ زنده</p>
				</Shell>
			</Card>
		</Grid>
	)
}
