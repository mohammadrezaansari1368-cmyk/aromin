/** Hero cabin (RTL): chrono right · hexagonal TFT centre · reserve left · three minis below. */
import type { Metric } from '../data/types'
import { fa, faMoney } from '../data/adapters'
import PerfGauge from './PerfGauge'
import { CountUp, ScrambleText } from '../ui/primitives'

export interface ClusterGauge { metric: Metric; max: number; invert?: boolean; reason?: string }
export default function InstrumentCluster({ main, reserve, minis, title, period, contracts, avgContract, workdays, activeId, onSelect, onConnect }: {
	main: ClusterGauge | null; reserve: ClusterGauge; minis: ClusterGauge[]
	title: string; period: string; contracts: number | null; avgContract: number | null; workdays: number | null
	activeId: string; onSelect: (m: Metric) => void; onConnect: () => void
}) {
	const g = (x: ClusterGauge, variant: 'chrono' | 'reserve' | 'mini') => <PerfGauge key={x.metric.id} variant={variant} value={x.metric.value} max={x.max} target={x.metric.target}
		status={x.metric.status} coverage={{ records: x.metric.records }} label={x.metric.label} unitLabel={x.metric.unit} invert={x.invert}
		reason={x.reason || x.metric.definition} active={activeId === x.metric.id} onSelect={() => onSelect(x.metric)} onConnect={onConnect}
		format={x.metric.id === 'contract_average' ? faMoney : undefined} />
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
			<div className="pv-cabin-reserve">{g(reserve, 'reserve')}</div>
		</div>
		<div className="pv-minis">{minis.map((m) => g(m, 'mini'))}</div>
	</section>
}
