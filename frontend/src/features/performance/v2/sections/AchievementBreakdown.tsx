import type { Metric } from '../data/types'
import { fa } from '../data/adapters'
import MiniStarGauge from '@/components/analytics/MiniStarGauge'

export default function AchievementBreakdown({ metrics }: { metrics: Metric[] }) {
 const activity=metrics.find(m=>m.id==='activity'||m.id==='finance_documents'), efficiency=metrics.find(m=>m.id==='efficiency'), conversion=metrics.find(m=>m.id==='conversion')
 const colors=['#004991','#910D6A','#FCBF00']
 const answered=metrics.find(m=>m.id==='calls_answered')?.value??efficiency?.parts?.activity?.actual??null
 const incoming=metrics.find(m=>m.id==='calls_in')?.value, outgoing=metrics.find(m=>m.id==='calls_out')?.value
 const attempted=incoming!==undefined && incoming!==null && outgoing!==undefined && outgoing!==null ? incoming+outgoing : null
 return <div className="pv-card" dir="rtl" aria-label="اجزای راندمان">
  <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
   {(['activity','count','amount'] as const).map((k,i)=> {
    const part=efficiency?.parts?.[k] ?? (k==='activity' && activity ? {actual:activity.value,target:activity.target,pct:activity.pct??null} : undefined)
    return <MiniStarGauge key={k} label={{activity:'فعالیت',count:'تعداد قرارداد',amount:'مبلغ قرارداد'}[k]} value={part?.pct??null} color={colors[i]}>
     <span>{fa(part?.actual??null)} / {fa(part?.target??null)}</span> <small>وزن {fa((efficiency?.parts?.weights?.[k]??0)*100)}٪</small>
    </MiniStarGauge>
   })}
   <MiniStarGauge label="نرخ پاسخ" value={efficiency?.answerRate??null} color={colors[0]}><span>{fa(answered)} / {fa(attempted)}</span> <small>بدون وزن</small></MiniStarGauge>
   <MiniStarGauge label="نرخ تبدیل" value={conversion?.value??null} color={colors[1]}><span>{fa(conversion?.numerator??null)} / {fa(conversion?.denominator??null)}</span> <small>بدون وزن</small><p>{conversion?.note}</p></MiniStarGauge>
  </div>
  <div style={{display:'flex',flexWrap:'wrap',gap:8}} aria-label="مبنای روز کارکرد">
   <small>{activity?.basis==='attendance'?'حضور':activity?.basis==='mixed'?'حضور و تقویم':'تقویم'}</small>
   {activity?.attendanceDays!==undefined && <small>حضور: {fa(activity.attendanceDays,0)}</small>}
   {activity?.calendarDays!==undefined && <small>تقویم: {fa(activity.calendarDays,0)}</small>}
   {activity?.attendance && Object.entries({presentDays:'حضور',calendarDays:'تقویم',leaveDays:'مرخصی',absentDays:'غیبت',closureDays:'تعطیلی'}).map(([key,label])=><small key={key}>{label}: {fa(activity.attendance![key as 'presentDays'])}</small>)}
  </div>
  {activity?.targetIssues?.map((issue,i)=><p key={i} role="status">{issue.reason}</p>)}
 </div>
}
