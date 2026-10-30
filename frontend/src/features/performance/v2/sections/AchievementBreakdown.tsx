import type { Metric } from '../data/types'
import { fa } from '../data/adapters'

export default function AchievementBreakdown({ metrics }: { metrics: Metric[] }) {
 const activity = metrics.find(m => m.id === 'activity')
 const efficiency = metrics.find(m => m.id === 'efficiency')
 return <div className="pv-card" aria-label="اجزای راندمان">
  {activity?.basis && <p>{activity.basis === 'calendar' ? 'بر پایهٔ تقویم؛ حضور ثبت نشده' : activity.basis === 'mixed' ? 'بخشی بر پایهٔ حضور، بخشی بر پایهٔ تقویم' : 'بر پایهٔ حضور ثبت‌شده'}</p>}
  {activity?.attendanceDays !== undefined && <p>روز کارکرد از حضور: {fa(activity.attendanceDays,0)} · روز کارکرد از تقویم: {fa(activity.calendarDays,0)}</p>}
  {activity?.targetIssues?.map((issue,i) => <p key={i} role="status">{issue.reason}</p>)}
  {efficiency?.parts?.activity && <>{(['activity','count','amount'] as const).map(k => {
   const part = efficiency.parts![k]!
   return <p key={k}>{{activity:'فعالیت',count:'تعداد قرارداد',amount:'مبلغ قرارداد'}[k]}: {fa(part.actual)} / {fa(part.target)} · {fa(part.pct)}٪ · وزن {fa((efficiency.parts?.weights?.[k] ?? 0)*100)}٪</p>
  })}<p>نرخ پاسخ: {fa(efficiency.answerRate)}٪</p></>}
 </div>
}
