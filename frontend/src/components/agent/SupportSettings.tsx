import {useEffect,useRef,useState} from 'react'
import {authHeaders,type Session} from '@/lib/auth'
import {BTN_GHOST,BTN_PRIMARY,INPUT} from '@/components/ui/tokens'
type Config={template:string;variables:Record<string,string>;brands:{name:string;active:boolean}[];priorities:Record<string,string>;prioritiesConfirmed:boolean}
const LABELS:Record<string,string>={AGENT_NAME:'نام ایجنت',MEHR_CONTACT:'مسیر مهر / موفقیت مشتری',SALES_CONTACT:'مسیر فروش (پس از تأیید)',SOROUSH_HANDOFF_CHANNEL:'مقصد سروش',TICKET_TOOL:'ابزار تیکت / خروجی صف'}
export default function SupportSettings({session,tenant}:{session:Session;tenant:string}){
 const [open,setOpen]=useState(false),[cfg,setCfg]=useState<Config|null>(null),[brands,setBrands]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[today,setToday]=useState('')
 const generation=useRef(0)
 useEffect(()=>{generation.current++;setCfg(null);setOpen(false);return()=>{generation.current++}},[tenant,session])
 const call=async(save=false)=>{
  const version=generation.current;setBusy(true);setError('');setNotice('')
  try{
   const body=save&&cfg?{...cfg,brands:brands.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>({name:x.startsWith('!')?x.slice(1).trim():x,active:!x.startsWith('!')}))}:undefined
   const r=await fetch('/api/agent/support/settings?tenant='+encodeURIComponent(tenant),{method:save?'PUT':'GET',headers:{...authHeaders(session),'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})})
   const j=await r.json();if(version!==generation.current)return
   if(!r.ok||!j.ok)throw new Error(j.error||'تنظیمات دریافت نشد')
   setCfg(j.settings);setToday(j.todayJalali||'');setBrands(j.settings.brands.map((b:{name:string;active:boolean})=>(b.active?'':'!')+b.name).join('\n'));if(save)setNotice('تنظیمات ذخیره شد.')
  }catch(e){if(version===generation.current)setError((e as Error).message)}finally{if(version===generation.current)setBusy(false)}
 }
 return <div className="mt-4 border-t border-border pt-3"><button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>{setOpen(!open);if(!open)void call()}}>تنظیمات پرامپت و SmartX</button>
 {open&&cfg&&<div className="mt-3 grid gap-3"><p className="text-xs text-muted-foreground">تاریخ امروز جلالی: {today}؛ LINK از لینک همین کسب‌وکار محاسبه می‌شود. کلیدها و رمزهای سرویس را اینجا وارد نکنید.</p>
 <div className="grid gap-3 md:grid-cols-2">{Object.entries(cfg.variables).map(([key,value])=><label className="grid gap-1 text-xs" key={key}>{LABELS[key]||key}<input className={INPUT} maxLength={500} value={value} onChange={e=>setCfg({...cfg,variables:{...cfg.variables,[key]:e.target.value}})}/></label>)}</div>
 <label className="grid gap-1 text-xs">برندهای SmartX؛ هر خط یک نام واقعی، برای غیرفعال ! بگذارید. فهرست اولیه خالی است.<textarea aria-label="برندها" className={INPUT} rows={4} value={brands} onChange={e=>setBrands(e.target.value)}/></label>
 <p className="text-sm font-bold">تعاریف P1–P4: پیشنهادی — با عملیات تأیید شود</p><div className="grid gap-2">{Object.entries(cfg.priorities).map(([key,value])=><label className="grid gap-1 text-xs" key={key}>{key}<input className={INPUT} maxLength={500} value={value} onChange={e=>setCfg({...cfg,priorities:{...cfg.priorities,[key]:e.target.value}})}/></label>)}</div>
 <label className="flex gap-2 text-xs"><input type="checkbox" checked={cfg.prioritiesConfirmed} onChange={e=>setCfg({...cfg,prioritiesConfirmed:e.target.checked})}/>تعاریف اولویت با عملیات تأیید شده‌اند</label>
 <details><summary className="cursor-pointer text-sm">قالب کامل System Prompt (قابل ویرایش)</summary><textarea aria-label="قالب پرامپت" className={`${INPUT} mt-2 w-full`} rows={12} maxLength={50000} value={cfg.template} onChange={e=>setCfg({...cfg,template:e.target.value})}/></details>
 <p className="text-xs text-muted-foreground">دانش SmartX باید در مجموعهٔ smartx همین کسب‌وکار بارگذاری شود. اطلاعات کمپین فقط پس از اعتبارسنجی و تأیید صریح مشتری به سروش تحویل می‌شود؛ فعال‌سازی با هماهنگی فنی تهران است.</p>
 <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={()=>call(true)}>ذخیره تنظیمات پشتیبانی</button></div>}
 {error&&<p role="alert" className="text-sm text-error">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}</div>
}
