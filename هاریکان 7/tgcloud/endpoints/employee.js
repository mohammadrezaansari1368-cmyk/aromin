import { db,EndpointError } from 'sdk';
import { eq,and } from 'sdk/db';
import { businesses,staff } from '../schema.js';
import { route,DomainError,employeeForBusiness } from '../lib/tenant-domain.js';
import { todayJ,nowHM,checkLocation } from '../lib/core.js';
import { employeeByPhone } from '../lib/identity.js';
import { recordLocation } from '../lib/location.js';
export default async function(input,ctx){
 const uid=ctx?.initData?.user?.id,id=input?.businessId;
 if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(id)||id<=0)throw new EndpointError('ورود معتبر تلگرام لازم است');
 const business=await db.select().from(businesses).where(eq(businesses.id,id)).get();
 const account=await db.select().from(staff).where(eq(staff.userId,uid)).get();
 const state=business?.state,p=employeeByPhone(business,account?.phone);
 if(!p)throw new EndpointError('به این کسب‌وکار دسترسی ندارید');
 const D=state.data,view=()=>({name:p.firstName+' '+p.lastName,branding:state.branding||{},attendance:D.attendance.filter(r=>r.person===p.id),requests:D.requests.filter(r=>r.person===p.id),requestTypes:D.requestTypes.filter(t=>t.active),messages:D.messages.filter(m=>m.to?.includes(p.id)).map(m=>({id:m.id,title:m.title,body:m.body,date:m.date})),version:business.version});
 if(!input.action||input.action==='load')return view();
 if(input.version!==business.version)throw new EndpointError('اطلاعات تغییر کرده است؛ دوباره تلاش کنید',{code:'CONFLICT'});
 try{
  if(input.action==='request'){
   const {kind,from,to,fromTime,toTime,note}=input.body||{};
   if(!D.requestTypes.some(t=>t.active&&t.name===kind))throw new DomainError('نوع درخواست نامعتبر است');
   route(state,'/admin/c/requests','POST',{person:p.id,kind,from,to,fromTime,toTime,note,status:'در دست بررسی'},uid);
  }else if(input.action==='location'){
   try{recordLocation(state,input.location,uid,p.id);}catch(e){throw new DomainError(e.message);}
  }else if(input.action==='in'||input.action==='out'){
   if(p.deviceType&&p.deviceType!=='همه')throw new DomainError('محدودیت سخت‌افزار در تلگرام پشتیبانی نمی‌شود؛ مدیر باید نوع دستگاه را روی همه بگذارد');
   if(!p.methods?.some(m=>m==='اپلیکیشن موبایل'||m==='وب اپلیکیشن'))throw new DomainError('ثبت تردد موبایلی برای شما فعال نیست');
   const {lat,lng,accuracy}=input.location||{};
   if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>200)throw new DomainError('موقعیت دقیق دریافت نشد؛ دوباره تلاش کنید');
   const location=checkLocation(D.workplaces.find(w=>w.id===p.workplace),{lat,lng,accuracy});
   if(!location.ok)throw new DomainError(location.reason);
   const open=D.attendance.find(r=>r.person===p.id&&!r.out);
   if(input.action==='in'){
    if(open)throw new DomainError('یک ورود باز دارید؛ ابتدا خروج را ثبت کنید');
    route(state,'/admin/c/attendance','POST',{person:p.id,date:todayJ(),in:nowHM(),type:'حضور',inMeta:{source:'telegram',at:new Date().toISOString(),lat,lng,accuracy}},uid);
   }else{
    if(!open)throw new DomainError('ورود بازی ندارید');
    route(state,'/admin/c/attendance/'+open.id,'PUT',{out:nowHM(),_version:open._version,outMeta:{source:'telegram',at:new Date().toISOString(),lat,lng,accuracy}},uid);
   }
  }else throw new DomainError('عملیات نامعتبر است');
  const rows=await db.update(businesses).set({state,version:business.version+1}).where(and(eq(businesses.id,id),eq(businesses.version,business.version))).returning({id:businesses.id}).run();
  if(!rows.length)throw new EndpointError('ویرایش هم‌زمان؛ دوباره تلاش کنید',{code:'CONFLICT'});
  business.version++;return view();
 }catch(e){if(e instanceof DomainError)throw new EndpointError(e.message);throw e;}
}
