import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { summarizeSupport, type Ticket } from '@/lib/calc/support'
import { cn, fa } from '@/lib/utils'

function Kpi({ k, v, u }: { k: string; v: string; u?: string }) {
  return (
    <div className="rounded-md border bg-background/40 p-3 text-center">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{v}</div>
      {u && <div className="mt-0.5 text-[11px] text-muted-foreground">{u}</div>}
    </div>
  )
}

export function SupportPerformance({ tickets }: { tickets: Ticket[] }) {
  const s = useMemo(() => summarizeSupport(tickets), [tickets])
  const rateWord = s.slaRate >= 80 ? 'عالی' : s.slaRate >= 50 ? 'متوسط' : 'نیازِ توجه'

  return (
    <Card>
      <CardHeader>
        <CardTitle>عملکردِ تیمِ پشتیبانی</CardTitle>
        <CardDescription>از تیکت‌های نصب و رعایتِ SLA — دادهٔ واقعی، بدون تخمین</CardDescription>
      </CardHeader>
      <CardContent>
        {s.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            هنوز فایلِ تیکتِ نصب ایمپورت نشده. پس از ایمپورت، عملکردِ تیم اینجا نمایش داده می‌شود.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi k="تیکتِ نصب" v={fa(s.total)} u="در دوره" />
              <Kpi k="وصل به معامله" v={fa(s.matched)} u={s.total ? `٪${fa(Math.round((s.matched / s.total) * 100))} از کل` : ''} />
              <Kpi k="در مهلتِ SLA" v={fa(s.met)} u="تیکت" />
              <Kpi k="نرخِ رعایتِ SLA" v={`٪${fa(s.slaRate)}`} u={rateWord} />
            </div>

            <div className="mt-4 overflow-hidden rounded-md border">
              <table className="w-full text-right text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2.5 font-medium">پشتیبان</th>
                    <th className="p-2.5 font-medium">تیکتِ نصب</th>
                    <th className="p-2.5 font-medium">در مهلت</th>
                    <th className="p-2.5 font-medium">نرخِ SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {s.agents.map((r) => (
                    <tr key={r.agent} className="border-t">
                      <td className="p-2.5 font-bold">{r.agent}</td>
                      <td className="p-2.5 tabular-nums">{fa(r.installs)}</td>
                      <td className="p-2.5 tabular-nums">{fa(r.met)}</td>
                      <td
                        className={cn(
                          'p-2.5 font-extrabold tabular-nums',
                          r.rate >= 80 ? 'text-moss' : r.rate >= 50 ? 'text-gold' : 'text-rose',
                        )}>
                        ٪{fa(r.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
