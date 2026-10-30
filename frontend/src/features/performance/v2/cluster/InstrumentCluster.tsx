/** Hero cabin (RTL): chrono right · hexagonal TFT centre · reserve left · three minis below. */
import type { ReactNode } from 'react'
import type { Metric } from '../data/types'
import { fa, faMoney } from '../data/adapters'
import PerfGauge from './PerfGauge'
import { CountUp, ScrambleText } from '../ui/primitives'

const attendanceLabels: Record<string,string> = { presentDays: '\u062d\u0636\u0648\u0631', leaveDays: '\u0645\u0631\u062e\u0635\u06cc', absentDays: '\u063a\u06cc\u0628\u062a', holidayDays: '\u062a\u0639\u0637\u06cc\u0644', closureDays: '\u062a\u0639\u0637\u06cc\u0644\u06cc \u0634\u0631\u06a9\u062a', calendarDays: '\u0631\u0648\u0632 \u062a\u0642\u0648\u06cc\u0645' }
export interface ClusterGauge { metric: Metric; max: number; invert?: boolean; reason?: string }
export default function InstrumentCluster({ main, side, minis, title, period, contracts, avgContract, workdays, activeId, onSelect, onConnect }: {
	main: ClusterGauge | null; side: ReactNode; minis: ClusterGauge[]
	title: string; period: string; contracts: number | null; avgContract: number | null; workdays: number | null
	activeId: string; onSelect: (m: Metric) => void; onConnect: () => void
}) {
	const g = (x: ClusterGauge, variant: 'chrono' | 'mini') => <div key={x.metric.id}><PerfGauge variant={variant} value={x.metric.value} max={x.max} target={x.metric.target}
		status={x.metric.status} coverage={{ records: x.metric.records }} label={x.metric.label} unitLabel={x.metric.unit} invert={x.invert}
		reason={x.reason || x.metric.definition} active={activeId === x.metric.id} onSelect={() => onSelect(x.metric)} onConnect={onConnect}
		format={x.metric.id === 'contract_average' ? faMoney : undefined} />
        {x.metric.id === 'activity' && x.metric.attendance && <p className="pv-attendance-days">{Object.entries(x.metric.attendance).filter(([k]) => k !== 'basis').map(([k,v]) => `${fa(Number(v),0)} ${attendanceLabels[k]}`).join(' \u00b7 ')}</p>}</div>
	return <section className="pv-cabin" aria-label="کابین ابزار">
		<div className="pv-cabin-row">
			<div className="pv-cabin-main">{main ? g(main, 'chrono') : <p className="pv-cabin-hint">یک واحد یا شخص انتخاب کنید</p>}</div>
			<div className="pv-tft" aria-label="نمایشگر">
				<ScrambleText text={title} className="pv-tft-name" />
				<ScrambleText text={period} className="pv-tft-period" />
				<dl className="pv-tft-figs">
					<div><dt>قرارداد</dt><dd><CountUp value={contracts} format={(n) => fa(Math.round(n), 0)} /></dd></div>
					<div><dt>میانگین قرارداد</dt><dd><CountUp value={avgContract} format={faMoney} /></dd></div>
					<div><dt>روز کارکرد</dt><dd><CountUp value={workdays} format={(n) => fa(Math.round(n), 0)} /></dd></div>
				</dl>
			</div>
			<div className="pv-cabin-reserve">{side}</div>
		</div>
		<div className="pv-minis">{minis.map((m) => g(m, 'mini'))}</div>
	</section>
}
