import { Fragment, type ReactNode } from 'react'

/* پورتِ نمودارهای پرامپت (۸ نوع)، ثابت و بدونِ شبیه‌سازِ متحرک، با توکن‌های تم.
   این‌ها «قالبِ نمودار»اند — آمادهٔ اتصال به دادهٔ واقعی. */

function noise(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const fmt = (v: number) => v.toLocaleString('en-US')
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const duration = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`)

type Tone = 'ok' | 'warn' | 'err' | 'idle'
const DOT: Record<Tone, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', err: 'bg-rose-500', idle: 'bg-muted-foreground/60' }
const TEXT: Record<Tone, string> = { ok: 'text-emerald-400', warn: 'text-amber-300', err: 'text-rose-400', idle: 'text-muted-foreground' }
const ACCENT = 'bg-primary'
const HEAT = ['bg-foreground/[0.06]', 'bg-primary/20', 'bg-primary/35', 'bg-primary/55', 'bg-primary/85']

function Shell({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="@container flex h-full flex-col gap-4 p-4 sm:p-[22px]">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[14px] leading-none">
        <h3 className="truncate text-[12px] tracking-[0.06em] text-muted-foreground">{title}</h3>
        {meta && <span className="shrink-0 text-muted-foreground">{meta}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}
function Big({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <p className="text-[28px] leading-none font-normal tracking-tight text-foreground tabular-nums @[240px]:text-[30px]">
      {children}
      {unit && <span className="text-[13px] tracking-normal text-muted-foreground">{' '}{unit}</span>}
    </p>
  )
}
function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${DOT[tone]}`} />
}
function Row({ children, value }: { children: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <dt className="flex min-w-0 items-center gap-2 truncate text-foreground">{children}</dt>
      <dd className="mr-auto text-muted-foreground tabular-nums">{value}</dd>
    </div>
  )
}

const DAYS = ['شنبه', 'یک', 'دو', 'سه', 'امروز']
const SLOTS = 32, SLOT_MINUTES = 45, NOW = 28
function runsAt(day: number, slot: number) {
  const hour = (slot * SLOT_MINUTES) / 60
  const shape = 3.5 + Math.exp(-((hour - 15) ** 2) / 30) * 18 + Math.exp(-((hour - 10) ** 2) / 10) * 11
  return Math.max(0, Math.round(shape * 3.3 * (0.5 + noise(day * 97 + slot))))
}
function Runs() {
  const today = DAYS.length - 1
  const grid = DAYS.map((_, d) => Array.from({ length: SLOTS }, (_, s) => (d === today && s > NOW ? null : runsAt(d, s))))
  const peak = Math.max(...grid.flat().map((v) => v ?? 0))
  const total = grid[today].reduce<number>((a, v) => a + (v ?? 0), 0)
  return (
    <Shell title="تیکت‌های امروز" meta={<span className="text-emerald-400">↑ ۱۲٪</span>}>
      <Big>{fmt(total)}</Big>
      <div className="mt-auto grid grid-cols-1 items-center gap-x-3 gap-y-[3px] @[480px]:grid-cols-[auto_minmax(0,1fr)]">
        {grid.map((row, d) => (
          <Fragment key={d}>
            <span className={`hidden text-[12px] @[480px]:block ${d === today ? 'text-foreground' : 'text-muted-foreground'}`}>{DAYS[d]}</span>
            <span className="grid grid-cols-[repeat(32,minmax(0,1fr))] gap-[3px]">
              {row.map((v, s) => {
                const level = v === null || v === 0 ? 0 : Math.max(1, Math.ceil((v / peak) * 4))
                return <span key={s} className={`aspect-square rounded-[2.5px] ${d === today && s === NOW ? 'bg-primary' : HEAT[level]}`} />
              })}
            </span>
          </Fragment>
        ))}
      </div>
    </Shell>
  )
}

const INCIDENTS: Record<number, boolean> = { 8: true, 21: true }
function Health() {
  return (
    <Shell title="وضعیتِ سامانه" meta="۳۰ روز">
      <Big unit="آپ‌تایم">٪۹۹٫۹۸</Big>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-foreground"><Dot tone="ok" /><span className="truncate">همه سرویس‌ها سالم</span></p>
      <div className="mt-auto flex h-5 gap-[2px] @[240px]:h-6">
        {Array.from({ length: 30 }, (_, i) => <span key={i} className={`flex-1 rounded-[1.5px] ${INCIDENTS[i] ? 'bg-amber-400/80' : 'bg-foreground/15'}`} />)}
      </div>
    </Shell>
  )
}

function Cost() {
  const days = Array.from({ length: 14 }, (_, i) => Math.round(9 + noise(i * 5) * 7 + i * 0.35))
  const max = Math.max(...days)
  return (
    <Shell title="هزینهٔ دوره" meta={<span className="text-emerald-400">↓ ۸٪</span>}>
      <Big unit="این ماه">۱۸۴</Big>
      <div className="mt-auto flex h-10 items-end gap-[3px]">
        {days.map((d, i) => <span key={i} className={`flex-1 rounded-full ${i === days.length - 1 ? ACCENT : 'bg-foreground/15'}`} style={{ height: `${(d / max) * 100}%` }} />)}
      </div>
    </Shell>
  )
}

function Failures() {
  const causes = [{ name: 'تایم‌اوت', count: 9 }, { name: 'محدودیتِ نرخ', count: 7 }, { name: 'خطای ابزار', count: 6 }]
  const total = causes.reduce((a, c) => a + c.count, 0)
  return (
    <Shell title="خطاها" meta="۲۴ ساعت">
      <Big unit="نرخ ٪۱٫۷">{fmt(total)}</Big>
      <dl className="mt-auto space-y-2">{causes.map((c, i) => <Row key={c.name} value={c.count}><Dot tone={i === 0 ? 'err' : 'idle'} />{c.name}</Row>)}</dl>
    </Shell>
  )
}

const AGENTS = ['ایلیا', 'اعلا', 'یاسمن', 'فرحان', 'نیلوفر']
function trace(n: number) {
  const r = noise(n * 3)
  const tone: Tone = r > 0.9 ? 'err' : r > 0.8 ? 'warn' : 'ok'
  return { n, id: `tk_${Math.floor(noise(n) * 0xffff).toString(16).padStart(4, '0')}`, agent: AGENTS[Math.floor(noise(n * 7) * AGENTS.length)], ms: 400 + noise(n * 13) * 3200, tone }
}
function Traces() {
  const rows = Array.from({ length: 4 }, (_, i) => trace(40 - i))
  const longest = 3600
  return (
    <Shell title="آخرین تیکت‌ها" meta={<span className="flex items-center gap-1.5"><Dot tone="ok" />زنده</span>}>
      <Big unit="میانه">{duration(median(rows.map((r) => r.ms)))}</Big>
      <ol className="mt-auto space-y-2 text-[13px]">
        {rows.map((r, i) => (
          <li key={r.n} className={`grid grid-cols-[6px_84px_minmax(0,1fr)_60px] items-center gap-3 ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <Dot tone={r.tone} /><span className="truncate">{r.id}</span>
            <span className="h-[3px] rounded-full bg-foreground/10"><span className={`block h-full rounded-full ${i === 0 ? ACCENT : 'bg-foreground/25'}`} style={{ width: `${(r.ms / longest) * 100}%` }} /></span>
            <span className="text-left tabular-nums">{duration(r.ms)}</span>
          </li>
        ))}
      </ol>
    </Shell>
  )
}

const EVALS = [{ name: 'دقت', value: 0.94 }, { name: 'ربط', value: 0.89 }, { name: 'درستی', value: 0.91 }]
function Evals() {
  const score = EVALS.reduce((a, e) => a + e.value, 0) / EVALS.length
  return (
    <Shell title="امتیازِ کیفیت">
      <div className="flex flex-wrap items-baseline gap-x-2.5"><Big>{score.toFixed(2)}</Big><span className="text-[14px] text-emerald-400 tabular-nums">↑ ۰٫۰۳</span></div>
      <dl className="mt-auto space-y-2">{EVALS.map((e) => <Row key={e.name} value={e.value.toFixed(2)}>{e.name}</Row>)}</dl>
    </Shell>
  )
}

const TOOLS = [{ name: 'نصب', calls: 36 }, { name: 'تلفنی', calls: 145 }, { name: 'اینترنتی', calls: 9 }, { name: 'پیگیری', calls: 24 }]
function Tools() {
  const max = Math.max(...TOOLS.map((r) => r.calls))
  const total = TOOLS.reduce((a, r) => a + r.calls, 0)
  return (
    <Shell title="فعالیت‌ها" meta="۲۴ ساعت">
      <Big>{fmt(total)}</Big>
      <table className="mt-auto w-full table-fixed text-right text-[13px]">
        <tbody>
          {TOOLS.map((r, i) => (
            <tr key={r.name}>
              <th scope="row" className={`w-[90px] truncate py-[6px] pl-3 font-normal ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{r.name}</th>
              <td className="py-[6px]"><span className="block h-[3px] rounded-full bg-foreground/10"><span className={`block h-full rounded-full ${i === 0 ? ACCENT : 'bg-foreground/25'}`} style={{ width: `${(r.calls / max) * 100}%` }} /></span></td>
              <td className="w-[48px] py-[6px] text-left text-muted-foreground tabular-nums">{r.calls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  )
}

const MODELS = [
  { name: 'تلفنی', share: 0.76, sw: ACCENT },
  { name: 'حضوری', share: 0.19, sw: 'bg-primary/55' },
  { name: 'اینترنتی', share: 0.05, sw: 'bg-foreground/25' },
]
function Models() {
  return (
    <Shell title="سهمِ کانال‌ها" meta="۱۹۰ تیکت">
      <Big unit="تیکت">۱۹۰</Big>
      <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-2">
        {MODELS.map((m) => <Row key={m.name} value={`٪${Math.round(m.share * 100)}`}><span className={`size-1.5 shrink-0 rounded-full ${m.sw}`} /><span className="truncate">{m.name}</span></Row>)}
      </dl>
      <div className="mt-4 flex h-[3px] gap-[3px]">{MODELS.map((m) => <span key={m.name} className={`h-full rounded-full ${m.sw}`} style={{ width: `${m.share * 100}%` }} />)}</div>
    </Shell>
  )
}

export type DemoKind = 'runs' | 'health' | 'cost' | 'failures' | 'traces' | 'evals' | 'tools' | 'models'
const VIEWS: Record<DemoKind, () => ReactNode> = { runs: Runs, health: Health, cost: Cost, failures: Failures, traces: Traces, evals: Evals, tools: Tools, models: Models }
export function renderDemoWidget(kind: DemoKind) { return VIEWS[kind]() }
