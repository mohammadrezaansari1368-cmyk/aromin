import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts'
import { summarizeSupport } from '@/lib/calc/support'
import { supportFixture } from '@/lib/calc/fixture'
import { topPhone } from '@/lib/data/dashboard'

const short = (n: string) => n.replace('آقای ', '').replace('خانم ', '')
const AXIS = { fill: 'hsl(215 18% 62%)', fontSize: 11, fontFamily: 'Vazirmatn' }
const TEAL = 'hsl(210 84% 52%)' // آبیِ برندِ آرومین (رنگِ غالب)
const MUTED = 'hsl(215 25% 42%)'
const GOLD = 'hsl(43 100% 50%)'
const MOSS = 'hsl(150 55% 45%)'
const ROSE = 'hsl(0 72% 60%)'

const tip = {
  contentStyle: {
    background: 'hsl(222 40% 13%)', border: '1px solid hsl(222 25% 22%)',
    borderRadius: 10, fontFamily: 'Vazirmatn', fontSize: 12, color: 'hsl(210 30% 92%)',
  },
  labelStyle: { color: 'hsl(210 30% 92%)' },
} as const

/** مقایسهٔ «نصب» و «در مهلتِ SLA» به تفکیکِ پشتیبان (نمودارِ میله‌ایِ گروهی). */
export function SlaCompareChart() {
  const data = useMemo(
    () => summarizeSupport(supportFixture).agents.map((a) => ({ name: short(a.agent), نصب: a.installs, در‌مهلت: a.met, rate: a.rate })),
    [],
  )
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground">مقایسهٔ عملکردِ پشتیبان‌ها — نصب و رعایتِ SLA</h3>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 25% 20%)" vertical={false} />
            <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} height={38} angle={-12} textAnchor="end" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <Tooltip {...tip} cursor={{ fill: 'hsl(222 25% 18% / 0.5)' }} />
            <Legend wrapperStyle={{ fontFamily: 'Vazirmatn', fontSize: 11, color: 'hsl(215 18% 62%)' }} />
            <Bar dataKey="نصب" fill={MUTED} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="در‌مهلت" radius={[4, 4, 0, 0]} maxBarSize={26}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.rate >= 80 ? MOSS : d.rate >= 50 ? GOLD : ROSE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** تماسِ تلفنیِ پاسخ‌داده‌شده به تفکیکِ نفر. */
export function PhoneCompareChart() {
  const data = useMemo(() => topPhone.map((p) => ({ name: short(p.name), تماس: p.n })), [])
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground">تماسِ تلفنیِ پاسخ‌داده‌شده — به تفکیکِ نفر</h3>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 25% 20%)" horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={92} />
            <Tooltip {...tip} cursor={{ fill: 'hsl(222 25% 18% / 0.5)' }} />
            <Bar dataKey="تماس" fill={TEAL} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
