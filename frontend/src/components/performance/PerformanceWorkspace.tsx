import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'
import { parseJ, todayJ } from '@/lib/jalali'
import { MONTHS } from '@/engines/commission'
import { BTN_GHOST, BTN_PRIMARY, CARD, INPUT } from '@/components/ui/tokens'
import { usePerformance } from './usePerformance'
import { type Filter, EMPTY_FILTER, printSection } from '@/lib/performance'

const UNITS: Record<string,string>={sales:'فروش',support:'پشتیبانی',finance:'مالی',other:'سایر'}
const STATUS: Record<string,string>={valid:'معتبر',partial:'ناقص',no_data:'قابل محاسبه نیست',not_applicable:'نامرتبط',error:'خطا'}
const fa=(n:number)=>n.toLocaleString('fa-IR',{maximumFractionDigits:2})
type Person={id:string;name:string;role:string;unit:string;inactive:boolean;tasks?:number|null;metrics?:Metric[];issues?:{reason:string}[]}
type Metric={id:string;label:string;unit:string;definition:string;value:number|null;numerator:number|null;denominator:number|null;status:string;target:null;coverage:{records:number;issues:number};source:string[];detailsMetric:string}
type Summary={people:Person[];groups:{unit:string;people:number;metrics:Metric[]}[];issues:{personId:string;reason:string}[];notes:string[];updatedAt?:number}
type Daily={days:{date:string;value:number;status:string}[];unit:string}
type DetailRow={id:string;date:string;personId:string;metric:string;value:number;unit:string;source:string;note:string;fiscalYear?:string}
export function yearDays(year:number){
 const days:{date:string;weekday:number;month:number;day:number}[]=[]
 for(let month=1;month<=12;month++)for(let day=1;day<=31;day++){
  const p=parseJ(`${year}/${month}/${day}`)
  if(p)days.push({date:p.j,month,day,weekday:(new Date(p.iso+'T12:00:00Z').getUTCDay()+1)%7})
 }
 return days
}
function useRead<T>(session:Session,view:string,params:Record<string,string>,enabled=true){
 const key=view+'?'+new URLSearchParams({tenant:currentTenant(),...params}).toString()
 const identity=session.user+'\u0000'+session.pass
 const [state,setState]=useState<{key:string;identity:string;data?:T;error?:string}>({key:'',identity:''})
 useEffect(()=>{
  if(!enabled)return
  const ac=new AbortController()
  fetch('/api/performance/'+key,{headers:authHeaders(session),signal:ac.signal}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'دریافت داده ناموفق بود');return d}).then(data=>setState({key,identity,data})).catch(e=>{if(e.name!=='AbortError')setState({key,identity,error:e.message})})
  return()=>ac.abort()
 },[key,identity,enabled])
 return enabled&&state.key===key&&state.identity===identity?state:{key,identity}
}
function ErrorState({message}:{message?:string}){return message?<p role="alert" className="rounded-lg bg-error/10 p-4 text-error">{message}</p>:<p aria-busy="true" className="p-4">در حال دریافت دادهٔ همین دامنه…</p>}
export default function PerformanceWorkspace({session,renderReview,renderSettings,renderLegacy}:{session:Session;renderReview:(f:Filter,names:string[])=>ReactNode;renderSettings:()=>ReactNode;renderLegacy:()=>ReactNode}){
 const directory=useRead<{people:Person[];scope:string}>(session,'directory',{})
 const detailRef=useRef<HTMLElement>(null)
 const [sort,setSort]=useState('name')
 const [view,setView]=useState('summary'),[person,setPerson]=useState(''),[unit,setUnit]=useState('')
 const today=todayJ(),[year,setYear]=useState(+today.slice(0,4)),[month,setMonth]=useState(+today.slice(5,7)),[period,setPeriod]=useState('month')
 const [customStart,setCustomStart]=useState(today.slice(0,8)+'01'),[customEnd,setCustomEnd]=useState(today)
 const dates=useMemo(()=>yearDays(year),[year])
 const chosen=period==='year'?dates:dates.filter(d=>period==='quarter'?Math.floor((d.month-1)/3)===Math.floor((month-1)/3):d.month===month)
 const start=period==='custom'?parseJ(customStart)?.j||'':chosen[0]?.date||'',end=period==='custom'?parseJ(customEnd)?.j||'':chosen.at(-1)?.date||''
 const [annualYear,setAnnualYear]=useState(+today.slice(0,4)),[annualMetric,setAnnualMetric]=useState('tasks')
 const manager=['manager','salesmgr','accmgr'].includes(session.role)
 const selectedPerson=person||(!manager?directory.data?.people[0]?.id||'':'')
 const effectiveUnit=unit
 const params={person:selectedPerson,unit:effectiveUnit,start,end}
 const summary=useRead<Summary>(session,'summary',params,!!directory.data&&!!start&&!!end&&start<=end)
 const {ds:attendance}=usePerformance(session)
 const [detail,setDetail]=useState<{metric:string;start:string;end:string;person:string;unit:string}|null>(null),[offset,setOffset]=useState(0)
 const details=useRead<{rows:DetailRow[];total:number}>(session,'details',{...(detail||params),offset:String(offset),limit:'50'},!!detail)
 const annualDates=useMemo(()=>yearDays(annualYear),[annualYear])
 const trend=useRead<Daily>(session,'daily',{person:selectedPerson,start,end,metric:annualMetric},!!selectedPerson&&annualMetric!=='attendance'&&!!start&&!!end)
 const daily=useRead<Daily>(session,'daily',{person:selectedPerson,start:annualDates[0]?.date||'',end:annualDates.at(-1)?.date||'',metric:annualMetric},!!selectedPerson&&annualMetric!=='attendance')
 const chosenName=directory.data?.people.find(p=>p.id===selectedPerson)?.name
 const localRows=attendance?.people.filter(p=>p.person===chosenName&&['manual','strong'].includes(p.personHow)).flatMap(p=>p.rows)||[]
 const dailyMap=new Map((daily.data?.days||[]).map(d=>[d.date,d.value]))
 const localMap=new Map(localRows.map(r=>[r.date,r]))
 const local=annualMetric==='attendance',annualUnit=local?'دقیقهٔ حضور':daily.data?.unit||'وظیفه'
 const peak=Math.max(1,...(local?localRows.map(r=>r.presentMin||0):[...dailyMap.values()]))
 const open=(metric:string,pid=selectedPerson,from=start,to=end,u=effectiveUnit)=>{setOffset(0);setDetail({metric,person:pid,start:from,end:to,unit:u})}
 const [localDay,setLocalDay]=useState<string|null>(null)
 useEffect(()=>{setDetail(null);setLocalDay(null)},[annualYear,annualMetric,selectedPerson,view])
 const download=async()=>{
  if(!detail)return
  let rows:DetailRow[]=[]
  try{
   for(let i=0;;i+=200){const r=await fetch('/api/performance/details?'+new URLSearchParams({tenant:currentTenant(),...detail,offset:String(i),limit:'200'}),{headers:authHeaders(session)});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error);rows=rows.concat(data.rows);if(rows.length>=data.total)break}
   const XLSX=await import('xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'عملکرد');XLSX.writeFile(book,'performance.xlsx')
  }catch(e){setExportError((e as Error).message)}
 }
 const [exportError,setExportError]=useState('')
 const cards=(metrics:Metric[],pid=selectedPerson,u=effectiveUnit)=><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(m=><article key={m.id} className={`${CARD} p-4`}>
  <h3 className="text-base font-bold">{m.label}</h3><p className="my-3 text-2xl font-bold">{m.value===null?'—':fa(m.value)} <small className="text-sm">{m.unit}</small></p>
  <p className="text-sm">{m.definition}</p><p className="mt-2 text-sm text-muted-foreground">{STATUS[m.status]} · {fa(m.coverage.records)} رکورد</p>
  {m.denominator!==null&&<p className="text-sm">صورت: {fa(m.numerator||0)} · مخرج: {fa(m.denominator)}</p>}
  <p className="text-sm text-muted-foreground">هدف معتبر ثبت نشده</p><button className={`${BTN_GHOST} mt-2`} onClick={()=>open(m.detailsMetric,pid,start,end,u)}>جزئیات و منبع</button>
 </article>)}</div>
 const people=(directory.data?.people||[]).filter(p=>!unit||p.unit===unit)
 return <div dir="rtl" className="space-y-4 text-sm" data-performance-workspace>
  <header className={`${CARD} flex flex-wrap items-end gap-3 p-4`}>
   <h2 className="basis-full text-xl font-bold">{manager?'عملکرد سازمان و افراد':'عملکرد من'}</h2>
   <label>دوره<select aria-label="نوع دوره" className={INPUT} value={period} onChange={e=>{setPeriod(e.target.value);setDetail(null)}}>{[['month','ماه'],['quarter','فصل'],['year','سال'],['custom','بازه سفارشی']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
   <label>سال تقویمی<input aria-label="سال تقویمی" type="number" min={1300} max={1500} value={year} onChange={e=>{setYear(+e.target.value);setDetail(null)}} className={`${INPUT} w-28`}/></label>
   {['month','quarter'].includes(period)&&<label>ماه / فصل<select aria-label="ماه عملکرد" className={INPUT} value={month} onChange={e=>{setMonth(+e.target.value);setDetail(null)}}>{MONTHS.map((m,i)=><option value={i+1} key={m}>{m}</option>)}</select></label>}
   {period==='custom'&&<><label>از<input aria-label="از تاریخ" className={INPUT} value={customStart} onChange={e=>{setCustomStart(e.target.value);setDetail(null)}}/></label><label>تا<input aria-label="تا تاریخ" className={INPUT} value={customEnd} onChange={e=>{setCustomEnd(e.target.value);setDetail(null)}}/></label></>}
   {manager&&<><label>واحد<select aria-label="واحد عملکرد" className={INPUT} value={unit} onChange={e=>{setUnit(e.target.value);setPerson('');setDetail(null)}}><option value="">همهٔ واحدهای مجاز</option>{[...new Set(directory.data?.people.map(p=>p.unit))].map(u=><option key={u} value={u}>{UNITS[u]}</option>)}</select></label><label>شخص<select aria-label="شخص عملکرد" className={INPUT} value={person} onChange={e=>{setPerson(e.target.value);setDetail(null)}}><option value="">همهٔ افراد مجاز</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}{p.inactive?' (قطع همکاری)':''}</option>)}</select></label></>}
   <button className={BTN_GHOST} onClick={()=>{setUnit('');setPerson('');setYear(+today.slice(0,4));setMonth(+today.slice(5,7));setPeriod('month');setDetail(null)}}>پاک‌کردن فیلترها</button>
   <p className="basis-full">دامنه: {chosenName||UNITS[unit]||'همهٔ افراد مجاز'} · {start||'—'} تا {end||'—'} · Asia/Tehran؛ سال مالی اسناد مستقل است.</p>
  </header>
  <nav aria-label="نماهای عملکرد" className="flex flex-wrap gap-2">{[['summary',manager?'نمای مدیریتی':'عملکرد من'],['person','صفحهٔ فرد و سالانه'],['review','بررسی و تطبیق'],...(session.role==='manager'?[['settings','تنظیمات'],['legacy','ابزارهای معتبر قبلی']]:[])].map(([key,label])=><button key={key} aria-pressed={view===key} className={view===key?BTN_PRIMARY:BTN_GHOST} onClick={()=>{setView(key);setDetail(null)}}>{label}</button>)}</nav>
  {!directory.data?<ErrorState message={directory.error}/>:!start||!end||start>end?<ErrorState message="بازه شمسی معتبر را انتخاب کنید."/>:!summary.data?<ErrorState message={summary.error}/>:<>
  {['summary','person'].includes(view)&&<>
   {selectedPerson? <><h3 className="text-lg font-bold">{chosenName} · {UNITS[summary.data.people[0]?.unit]||'سایر'} · {summary.data.people[0]?.role}</h3>{cards(summary.data.people[0]?.metrics||[])}</>:view==='person'?<p role="status">یک شخص را برای نمایش سالانه انتخاب کنید.</p>:summary.data.groups.map(g=><section className="space-y-2" key={g.unit}><h3 className="text-lg font-bold">واحد {UNITS[g.unit]} · {fa(g.people)} نفر</h3>{cards(g.metrics,'',g.unit)}</section>)}
   <section className={`${CARD} p-4`}><h3 className="font-bold">موارد نیازمند بررسی</h3>{summary.data.issues.length?<ul>{summary.data.issues.slice(0,30).map((i,n)=><li key={n}>{directory.data?.people.find(p=>p.id===i.personId)?.name}: {i.reason}</li>)}</ul>:<p>مغایرت قابل اثباتی در منابع بررسی‌شده یافت نشد؛ این به معنی کامل‌بودن داده‌ها نیست.</p>}</section>
   <div className={`${CARD} overflow-auto p-4`}><label>مرتب‌سازی<select aria-label="مرتب‌سازی افراد" className={INPUT} value={sort} onChange={e=>setSort(e.target.value)}><option value="name">نام</option><option value="tasks">تعداد وظیفه</option></select></label><table className="w-full text-right"><caption className="text-right font-bold">افراد و پوشش داده؛ وظایف مستقل از حضور</caption><thead><tr>{['شخص','واحد','وظیفهٔ ثبت‌شده','پوشش و بررسی'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{[...summary.data.people].sort((a,b)=>sort==='tasks'?(b.tasks??-1)-(a.tasks??-1):a.name.localeCompare(b.name,'fa')).map(p=><tr key={p.id} className="border-t border-border"><td className="p-2"><button className="text-primary-ink underline" onClick={()=>{setPerson(p.id);setView('person');setDetail(null)}}>{p.name}</button>{p.inactive&&' · قطع همکاری'}</td><td>{UNITS[p.unit]}</td><td><button onClick={()=>open('tasks',p.id)} className="underline">{p.tasks==null?'بدون داده':fa(p.tasks)}</button></td><td>{p.issues?.length?`${fa(p.issues.length)} مورد بررسی`:attendance?.people.some(a=>a.person===p.name)?'حضور در این مرورگر موجود است':'حضور: بدون داده یا نگاشت معتبر'}</td></tr>)}</tbody></table></div>
   {selectedPerson && annualMetric!=='attendance' && <section className={`${CARD} p-4`} aria-label="روند دوره"><h3 className="font-bold">روند دورهٔ کارت‌ها · {start} تا {end}</h3><p>شاخص انتخاب‌شده در نمای سالانه: {trend.data?.unit||'—'}. هر روز برای جزئیات قابل انتخاب است.</p>{!trend.data?<ErrorState message={trend.error}/>:!trend.data.days.length?<p>بدون دادهٔ روزانه در این دوره</p>:<div className="flex items-end gap-2 overflow-x-auto py-3" aria-label="روزهای روند">{trend.data.days.map(d=><button key={d.date} className="flex min-w-14 flex-col items-center gap-1 rounded p-1 focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${d.date}: ${fa(d.value)} ${trend.data!.unit}`} onClick={()=>open(annualMetric,selectedPerson,d.date,d.date)}><span>{fa(d.value)}</span><span className="w-5 rounded bg-primary" style={{height:Math.max(2,80*d.value/Math.max(1,...trend.data!.days.map(x=>x.value)))}}/><span>{d.date.slice(5)}</span></button>)}</div>}</section>}
   {selectedPerson&&<section className={`${CARD} p-4 space-y-3`} aria-label="نمای سالانه"><h3 className="text-lg font-bold">نمای سالانهٔ {chosenName}</h3><div className="flex flex-wrap gap-3"><label>سال نمودار<input aria-label="سال نمودار" className={`${INPUT} w-28`} type="number" min={1300} max={1500} value={annualYear} onChange={e=>setAnnualYear(+e.target.value)}/></label><label>شاخص روزانه<select aria-label="شاخص سالانه" className={INPUT} value={annualMetric} onChange={e=>setAnnualMetric(e.target.value)}><option value="tasks">تعداد وظیفه</option><option value="contracts">تعداد قرارداد</option><option value="finance_documents">تعداد سند تخصیص‌یافته به مالی</option><option value="attendance">دقیقهٔ حضور (این مرورگر)</option></select></label></div>
    {!local&&!daily.data?<ErrorState message={daily.error}/>:<><p>یک شاخص: {annualUnit} · حضور، بهره‌وری نیست. — بدون داده · ○ صفر · آ آینده · ت تعطیل · م مرخصی. شدت رنگ نسبت به بیشترین مقدار همین سال است.</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{MONTHS.map((m,index)=><section key={m}><h4 className="mb-2 font-bold">{m}</h4><div className="grid grid-cols-7 gap-1">{['ش','ی','د','س','چ','پ','ج'].map((w,i)=><span key={i} className="text-center">{w}</span>)}{Array.from({length:annualDates.find(d=>d.month===index+1)?.weekday||0},(_,i)=><span key={'blank'+i}/>)}{annualDates.filter(d=>d.month===index+1).map(d=>{const row=localMap.get(d.date),value=local?row?.presentMin:dailyMap.get(d.date),future=d.date>today,leave=local&&!!row&&['leave','sick'].includes(row.code),holiday=local&&!!row&&['friday','official_holiday','birthday'].includes(row.code),status=future?'آینده':leave?'مرخصی':holiday?'تعطیل':value==null?'بدون داده':value===0?'صفر':'ثبت‌شده';const level=value==null||value===0?0:Math.min(4,Math.ceil(value/peak*4));return <button key={d.date} data-calendar-date={d.date} data-status={status} title={`${d.date} · ${d.day} · ${value==null?'بدون داده':fa(value)+' '+annualUnit} · ${status}`} aria-label={`${d.date} ${value==null?'بدون داده':fa(value)+' '+annualUnit} ${status}`} className={`min-h-10 min-w-0 rounded text-center text-xs ring-1 ring-border focus-visible:ring-2 focus-visible:ring-primary ${['bg-card','bg-primary/10','bg-primary/25','bg-primary/40','bg-primary/60'][future?0:level]}`} onClick={()=>local?setLocalDay(d.date):open(annualMetric,selectedPerson,d.date,d.date)}>{fa(d.day)}<span className="block">{future?'آ':leave?'م':holiday?'ت':value==null?'—':value===0?'○':fa(value)}</span></button>})}</div></section>)}</div></>}
   </section>}
   <section className={`${CARD} p-4`}><h3 className="font-bold">پوشش و کیفیت داده</h3>{summary.data.notes.map(n=><p key={n}>{n}</p>)}<p>آخرین به‌روزرسانی منبع: {summary.data.updatedAt?new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'short'}).format(new Date(summary.data.updatedAt)):'در منبع ثبت نشده'}</p><p>نمای سه‌بعدی فعلی روزهای فاقد داده را صفر فرض می‌کند و هفتهٔ شنبه/سال شمسی کامل ندارد؛ تا اصلاح این قرارداد، نمای واقعی دوبعدی ارائه می‌شود.</p></section>
  </>}
  {view==='review'&&renderReview({...EMPTY_FILTER,from:start,to:end,person:chosenName||'',team:''},summary.data.people.map(p=>p.name))}
  {view==='settings'&&session.role==='manager'&&renderSettings()}
  {view==='legacy'&&session.role==='manager'&&renderLegacy()}
  </>}
  {detail&&<section ref={detailRef} role="region" aria-label="جزئیات شاخص" className={`${CARD} p-4 space-y-3`}><h3 className="font-bold">رکوردهای سازندهٔ شاخص · {detail.start} تا {detail.end}</h3><button className={BTN_GHOST} onClick={()=>setDetail(null)}>بازگشت</button><button className={BTN_GHOST} onClick={download}>خروجی اکسل همین دامنه</button><button className={BTN_GHOST} onClick={()=>printSection(detailRef.current)}>چاپ / PDF همین صفحه</button>{exportError&&<p role="alert">{exportError}</p>}{!details.data?<ErrorState message={details.error}/>:<><p>{fa(details.data.total)} رکورد؛ تاریخ تقویمی با سال مالی مستقل</p><div className="overflow-auto"><table className="w-full text-right"><thead><tr>{['شناسه','تاریخ','شخص','مقدار','واحد','سال مالی','منبع / تعریف'].map(k=><th key={k} className="p-2">{k}</th>)}</tr></thead><tbody>{details.data.rows.map(r=><tr key={r.id} className="border-t border-border"><td className="p-2">{r.id}</td><td>{r.date}</td><td>{directory.data?.people.find(p=>p.id===r.personId)?.name}</td><td>{fa(r.value)}</td><td>{r.unit}</td><td>{r.fiscalYear||'نامرتبط'}</td><td>{r.source} · {r.note}</td></tr>)}</tbody></table></div><button className={BTN_GHOST} disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>قبلی</button><button className={BTN_GHOST} disabled={offset+50>=details.data.total} onClick={()=>setOffset(offset+50)}>بعدی</button></>}</section>}
  {localDay&&<section role="region" aria-label="جزئیات روز حضور" className={`${CARD} p-4`}><button className={BTN_GHOST} onClick={()=>setLocalDay(null)}>بستن</button><h3>{localDay} · {chosenName}</h3>{localMap.has(localDay)?<p>{localMap.get(localDay)?.label} · حضور: {localMap.get(localDay)?.presentMin??'بدون داده'} دقیقه · {localMap.get(localDay)?.reconWhy}</p>:<p>دادهٔ حضور این روز در مرورگر موجود نیست.</p>}</section>}
 </div>
}
