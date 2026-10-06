import type { ReactNode } from 'react'
import { fa } from '@/lib/utils'
import { SupportPerformance } from '@/components/SupportPerformance'
import { supportFixture } from '@/lib/calc/fixture'
import { channels, topPhone, topVisit } from '@/lib/data/dashboard'
import { SlaCompareChart, PhoneCompareChart } from './SupportCharts'
import { renderDemoWidget, type DemoKind } from './demoWidgets'

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-4">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Frame title={title}>
      <div className="mt-auto">
        <div className="text-3xl font-extrabold tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </div>
    </Frame>
  )
}

export type WidgetKind =
  | 'support' | 'phone' | 'visit' | 'online' | 'channels' | 'topPhone' | 'topVisit'
  | 'slaChart' | 'phoneChart' | DemoKind

export function renderWidgetContent(kind: WidgetKind) {
  switch (kind) {
    case 'support':
      return (
        <div className="h-full overflow-auto p-1">
          <SupportPerformance tickets={supportFixture} />
        </div>
      )
    case 'phone':
      return <Stat title="تماسِ تلفنی" value={fa(145)} sub="از ۱۹۰ تیکت" />
    case 'visit':
      return <Stat title="مراجعهٔ حضوری" value={fa(36)} sub="از ۱۹۰ تیکت" />
    case 'online':
      return <Stat title="اینترنتی" value={fa(9)} sub="از ۱۹۰ تیکت" />
    case 'topVisit':
      return <Stat title="بیشترین حضوری" value={topVisit.name.replace('آقای ', '')} sub={`${fa(topVisit.n)} مراجعه`} />
    case 'channels':
      return (
        <Frame title="کانالِ ورودیِ تیکت‌ها">
          <div className="mt-auto flex flex-col gap-2">
            {channels.map((c) => {
              const max = channels[0].n
              return (
                <div key={c.key} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-muted-foreground">{c.key}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(c.n / max) * 100}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-left tabular-nums">{fa(c.n)}</span>
                </div>
              )
            })}
          </div>
        </Frame>
      )
    case 'slaChart':
      return <SlaCompareChart />
    case 'phoneChart':
      return <PhoneCompareChart />
    case 'topPhone':
      return (
        <Frame title="برترین پاسخ‌گویانِ تلفن">
          <ul className="mt-1 flex flex-col gap-1.5 text-sm">
            {topPhone.map((p, i) => (
              <li key={p.name} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{fa(i + 1)}.</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-bold tabular-nums text-primary">{fa(p.n)}</span>
              </li>
            ))}
          </ul>
        </Frame>
      )
    default:
      return renderDemoWidget(kind as DemoKind)
  }
}
