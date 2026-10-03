/**
 * محاسبهٔ عملکردِ تیمِ پشتیبانی — پورتِ خالصِ TypeScript از تابعِ `renderSupportPerf`
 * در اپِ تک‌فایلِ آرومین. هیچ وابستگی‌ای به DOM ندارد تا قابلِ تست باشد.
 *
 * همین «استخراجِ محاسبات به ماژولِ خالص + تست» هستهٔ استراتژیِ مهاجرت است:
 * تضمین می‌کند اعداد در نسخهٔ React مو‌به‌مو با نسخهٔ قدیمی یکی بمانند.
 */
export interface Ticket {
  /** پشتیبانِ عهده‌دارِ تیکتِ نصب. */
  agent: string
  /** کانالِ سرشاخه (حضوری/تلفنی/اینترنتی) — فعلاً استفاده نمی‌شود ولی نگه داشته شده. */
  channel?: string
  /** آیا تیکت به یک معامله وصل شده؟ */
  matched: boolean
  /** آیا در مهلتِ SLA انجام شده؟ */
  met: boolean
}

export interface AgentRow {
  agent: string
  installs: number
  met: number
  /** درصدِ رعایتِ SLA، گردشده. */
  rate: number
}

export interface SupportSummary {
  total: number
  matched: number
  met: number
  /** نرخِ رعایتِ SLA روی کلِ تیکت‌ها (٪، گردشده). */
  slaRate: number
  agents: AgentRow[]
}

export function summarizeSupport(tickets: Ticket[]): SupportSummary {
  const total = tickets.length
  let matched = 0
  let met = 0
  const by = new Map<string, { inst: number; met: number }>()

  for (const t of tickets) {
    if (t.matched) matched++
    if (t.met) met++
    const a = (t.agent || '').trim()
    if (!a) continue
    const cur = by.get(a) ?? { inst: 0, met: 0 }
    cur.inst++
    if (t.met) cur.met++
    by.set(a, cur)
  }

  const agents: AgentRow[] = [...by.entries()]
    .map(([agent, v]) => ({
      agent,
      installs: v.inst,
      met: v.met,
      rate: v.inst ? Math.round((v.met / v.inst) * 100) : 0,
    }))
    .sort((a, b) => b.installs - a.installs)

  return {
    total,
    matched,
    met,
    slaRate: total ? Math.round((met / total) * 100) : 0,
    agents,
  }
}
