import { todayJ, normJ, isJDate, validateRequest, zkPairs, toJ } from './core.js';
import { advancedShiftRoute } from './shifts/route.js';
import { normalizeMobile } from './identity.js';
import { recordLocation } from './location.js';

export const COLLECTIONS = ['workplaces','groups','shifts','policies','personnel','projects','holidays','requests','requestTypes','messages','tickets','devices','smsLines','attendance','deviceRecords'];
export class DomainError extends Error {}
const fail = message => { throw new DomainError(message); };
export function authorize(business, userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !business || business.ownerId !== userId) fail('به این کسب‌وکار دسترسی ندارید');
}
export function employeeForBusiness(business,userId){
  if(!Number.isSafeInteger(userId)||userId<=0)return null;
  return business?.state?.data?.personnel.find(p=>String(p.telegramId)===String(userId)&&p.status==='فعال')||null;
}
export function initialData() {
  const data = Object.fromEntries(COLLECTIONS.map(c => [c, []]));
  data.requestTypes = [['مرخصی','مرخصی استحقاقی'],['مرخصی','مرخصی استعلاجی'],['مرخصی','مرخصی بی‌حقوق'],['ماموریت','ماموریت'],['اضافه کار','اضافه کار'],['تردد','تردد دستی']].map(([cat,name],i)=>({id:'type'+i,cat,name,active:true}));
  return { data, settings: {}, audit: [] };
}
const clean = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('ورودی نامعتبر است');
  const { id, businessId, ownerId, tenantId, version, password, password2, passwordHash, hasPassword, ...rest } = input;
  // Authentication uses verified Telegram identity; passwords are never stored.
  if (password || password2 || passwordHash) fail('ورود با تلگرام است؛ رمز عبور ثبت نکنید');
  if (JSON.stringify(rest).length > 700000) fail('حجم رکورد بیش از حد مجاز است');
  return rest;
};
const refs = { workplaces:[['personnel','workplace']], shifts:[['personnel','shift']], policies:[['personnel','policy']], groups:[['personnel','group'],['groups','parent']] };
function check(c,row,all,id) {
  const required = {workplaces:['name'],shifts:['name'],policies:['name'],groups:['name'],projects:['name'],holidays:['title','date'],personnel:['firstName','lastName','code','username'],requests:['person','kind','from'],attendance:['person','date','in'],tickets:['title'],messages:['title','body'],devices:['ip'],smsLines:['provider','line'],requestTypes:['cat','name'],deviceRecords:['user_id','ts']}[c] || [];
  for (const key of required) if (!String(row[key] ?? '').trim()) fail('فیلد الزامی: '+key);
  for (const key of ({requests:['from','to'],holidays:['date'],attendance:['date'],personnel:['shiftStart','shiftEnd']}[c] || [])) {
    if (row[key]) { row[key] = normJ(row[key]); if (!isJDate(row[key])) fail('تاریخ نامعتبر است'); }
  }
  if (c === 'personnel') {
    for (const key of ['code','username','telegramId']) if (row[key] && all.personnel.some(p=>p.id!==id && String(p[key])===String(row[key]))) fail('مقدار تکراری: '+key);
    if(!normalizeMobile(row.mobile))fail('برای ثبت پرسنل، شماره موبایل معتبر الزامی است');
    row.mobile=normalizeMobile(row.mobile);
    if(all.personnel.some(p=>p.id!==id&&normalizeMobile(p.mobile)===row.mobile))fail('شماره موبایل پرسنل در این کسب‌وکار تکراری است');
    if (row.nationalId && !/^\d{10}$/.test(row.nationalId)) fail('کد ملی نامعتبر است');
    if (row.telegramId && !/^[1-9]\d{0,15}$/.test(String(row.telegramId))) fail('شناسه تلگرام نامعتبر است');
    row.status ||= 'فعال';
  }
  for (const [field,target] of Object.entries({workplace:'workplaces',shift:'shifts',policy:'policies',group:'groups',person:'personnel',parent:'groups'})) {
    if (row[field] && !all[target].some(r=>r.id===row[field])) fail('مرجع نامعتبر: '+field);
  }
  if (row.parent && row.parent===id) fail('گروه نمی‌تواند مرجع خودش باشد');
  if (c==='workplaces' && row.radius!=null && (+row.radius<10 || +row.radius>5000)) fail('شعاع بین ۱۰ تا ۵۰۰۰ متر است');
  if (c==='attendance') for (const key of ['in','out']) if (row[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row[key])) fail('ساعت نامعتبر است');
  if (c==='requests') { const v=validateRequest(all,{...row,id},{today:todayJ()}); if(!v.ok) fail(v.errors.join('، ')); row.status ||= 'در دست بررسی'; }
  if (c==='tickets') { row.status ||= 'باز'; row.updatedAt=todayJ(); }
  if (c==='messages') {
    if (row.sms) fail('سرویس پیامک هنوز متصل نیست');
    row.to ||= []; row.read ||= [];
    if (!Array.isArray(row.to) || row.to.some(id=>!all.personnel.some(p=>p.id===id))) fail('مخاطب نامعتبر است');
  }
  if (c==='deviceRecords') { if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(row.ts)) fail('زمان تردد نامعتبر است'); row.punch=+row.punch; if(!Number.isInteger(row.punch)||row.punch<0||row.punch>5) fail('نوع تردد نامعتبر است'); }
  row.createdAt ||= todayJ();
}
function rebuild(state) {
  const records=state.data.deviceRecords.filter(r=>!r.is_deleted), fresh=[];
  for(const person of state.data.personnel) {
    const groups={};
    for(const row of records.filter(r=>String(r.user_id)===String(person.code))) (groups[row.ts.slice(0,10)] ||= []).push({ts:row.ts,device_name:state.data.devices.find(d=>d.id===row.device_id)?.name});
    for(const [date, punches] of Object.entries(groups)) zkPairs(punches).forEach((pair,i)=>fresh.push({id:'zk_'+person.id+'_'+date+'_'+i,person:person.id,date:toJ(date),in:pair.in,out:pair.out,type:'حضور',zk:true}));
  }
  state.data.attendance=[...state.data.attendance.filter(r=>!r.zk),...fresh];
}
export function route(state, path, method='GET', body, actor) {
  if (typeof path!=='string' || !path.startsWith('/admin/')) fail('مسیر نامعتبر است');
  const [pathname,query='']=path.split('?'); const q={};
  for(const part of query.split('&')) if(part) {const split=part.indexOf('=');const key=split<0?part:part.slice(0,split),value=split<0?'':part.slice(split+1);try{q[decodeURIComponent(key)]=decodeURIComponent(value.replace(/\+/g,' '));}catch{fail('پارامتر نامعتبر است');}}
  if(pathname.startsWith('/admin/advanced-shifts'))return advancedShiftRoute(state,pathname,method,body,actor,route,fail);
  if(method==='GET' && pathname==='/admin/bootstrap') return {result:{data:state.data,settings:state.settings,branding:state.branding||{}},write:false};
  if(method==='PUT' && pathname==='/admin/branding'){
    if(body?.logo!=='/aromin-logo.png')fail('لوگوی جدید را با فرمان /logo از ربات ارسال کنید');
    state.branding={logo:body.logo,updatedAt:new Date().toISOString()};return done(state,actor,'branding','branding',state.branding);
  }
  if(method==='GET' && pathname==='/admin/settings') return {result:state.settings,write:false};
  if(method==='GET' && pathname==='/admin/audit') return {result:state.audit,write:false};
  if(method==='POST' && pathname==='/admin/requests/validate') return {result:validateRequest(state.data,body,{today:todayJ()}),write:false};
  if(method==='GET' && pathname==='/admin/reports/tracking') return {result:(state.locations||[]).filter(p=>p.person===q.person&&p.date===q.date),write:false};
  if(method==='POST' && pathname==='/admin/location'){let row;try{row=recordLocation(state,body,actor);}catch(e){fail(e.message);}return done(state,actor,'location','locations',row);}
  if(pathname.startsWith('/admin/tokens') || pathname==='/admin/sms/test') fail('این اتصال هنوز فعال نیست');
  let m=pathname.match(/^\/admin\/settings\/([\w:-]+)$/);
  if(m && method==='PUT') {state.settings[m[1]]=body?.value; return done(state,actor,'settings',m[1],body?.value);}
  if(pathname.startsWith('/admin/zk')) return zkRoute(state,pathname.slice(9),method,body,q,actor);
  m=pathname.match(/^\/admin\/c\/([a-zA-Z]+)(?:\/([\w-]+))?$/);
  if(!m || !COLLECTIONS.includes(m[1])) fail('مجموعه نامعتبر است');
  const [,c,id]=m, rows=state.data[c];
  if(method==='GET') return {result:id ? rows.find(r=>r.id===id) || null : rows,write:false};
  if(method==='POST' && !id) {
    const row={...clean(body),id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,10)};
    check(c,row,state.data,row.id); if(c==='tickets') row.no=1001+Math.max(0,...rows.map(r=>(+r.no||1000)-1000));
    rows.push(row); return done(state,actor,'create',c,row);
  }
  const index=rows.findIndex(r=>r.id===id); if(index<0) fail('رکورد یافت نشد');
  if(method==='PUT') {
    if(body?._version!==rows[index]._version) fail('رکورد تغییر کرده است؛ صفحه را تازه کنید');
    const row={...rows[index],...clean(body),id,_version:(rows[index]._version||0)+1};
    check(c,row,state.data,id); rows[index]=row; return done(state,actor,'update',c,row);
  }
  if(method==='DELETE') {
    for(const [other,key] of refs[c] || []) if(state.data[other].some(r=>r[key]===id)) fail('این رکورد در اطلاعات دیگر استفاده شده است');
    if(c==='personnel' && ['attendance','requests'].some(other=>state.data[other].some(r=>r.person===id))) fail('پرسنل دارای سابقه است؛ وضعیتش را غیرفعال کنید');
    rows.splice(index,1); return done(state,actor,'delete',c,{ok:true});
  }
  fail('عملیات نامعتبر است');
}
function done(state,actor,action,collection,result) {
  state.audit.push({at:new Date().toISOString(),actor,action,collection,recordId:result?.id});
  state.audit=state.audit.slice(-500); return {result,write:true};
}
function zkRoute(state,path,method,body,q,actor) {
  if(path==='/status') return {result:{configured:false,telegram:true,reason:'برای اتصال دستگاه فیزیکی رابط محلی لازم است'},write:false};
  if(path==='/sync-runs') return {result:[],write:false};
  if(path==='/devices' && method==='GET') return {result:state.data.devices,write:false};
  if(/^\/devices(?:\/[^/]+)?$/.test(path)) return route(state,'/admin/c'+path,method,body,actor);
  if(/sync|test|rebuild/.test(path)) fail('اتصال دستگاه فیزیکی هنوز تنظیم نشده است');
  if(path==='/people') return {result:state.data.personnel.map(p=>({user_id:p.code,name:p.firstName+' '+p.lastName,person:p.id})),write:false};
  const m=path.match(/^\/attendance(?:\/([\w-]+))?(?:\/(restore|revert|history))?$/);
  if(m) {
    const [,id,action]=m, records=state.data.deviceRecords;
    if(action==='history') return {result:state.audit.filter(a=>a.recordId===id),write:false};
    if(action==='revert') fail('این رکورد دستی است و مقدار اصلی دستگاه ندارد');
    if(method==='GET') {
      const rows=records.filter(r=>(!q.user_id||r.user_id===q.user_id)&&(!q.date_from||r.ts.slice(0,10)>=q.date_from)&&(!q.date_to||r.ts.slice(0,10)<=q.date_to)&&(!q.device_id||r.device_id===q.device_id)&&(q.include_deleted==='1'||!r.is_deleted));
      const page=Math.max(1,+q.page||1),size=Math.min(1000,Math.max(1,+q.page_size||20));
      return {result:{items:rows.slice((page-1)*size,page*size),total:rows.length,page,page_size:size},write:false};
    }
    let result;
    if(method==='DELETE'||action==='restore') {
      const row=records.find(r=>r.id===id); if(!row) fail('تردد یافت نشد'); row.is_deleted=method==='DELETE'; row.rev=(row.rev||0)+1; result=done(state,actor,method==='DELETE'?'delete':'restore','deviceRecords',row);
    } else {
      const existing=records.find(r=>r.id===id);
      result=route(state,'/admin/c/deviceRecords'+(id?'/'+id:''),method,{...body,_version:existing?._version,source:existing?.source||'manual',rev:(existing?.rev||0)+1},actor);
    }
    rebuild(state); return result;
  }
  if(path.startsWith('/reports/')) fail('گزارش دستگاه پس از اتصال رابط محلی فعال می‌شود؛ گزارش کارکرد سامانه در منوی گزارش‌ها موجود است');
  fail('مسیر دستگاه هنوز متصل نیست');
}
