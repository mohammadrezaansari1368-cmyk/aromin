import { cleanShift } from './validate.js';
import { generateSimple,repeatPattern } from './generator.js';
import { daysOfJalaliYear,fromIso,weekdayFa } from './jalali.js';
import { computeDay } from './attendance.js';
import { toG } from '../core.js';
export function advancedShiftRoute(state,path,method,body,actor,crud,fail){
 const root='/admin/advanced-shifts',tail=path.slice(root.length),rows=state.data.shifts;
 if(tail==='/holidays'&&method==='GET')return {result:state.data.holidays.map(h=>({date:toG(h.date),title:h.title})),write:false};
 if(tail==='/preview/simple'&&method==='POST'){
  if(!Number.isInteger(body?.year)||body.year<1390||body.year>1500||!Array.isArray(body.weekly)||body.weekly.length!==7)fail('الگوی هفتگی یا سال نامعتبر است');
  return {result:{days:generateSimple(body.year,body.weekly)},write:false};
 }
 if(tail==='/preview/repeat'&&method==='POST'){
  if(!body?.selectedDates?.length||!Array.isArray(body.days)||body.days.length>366||!Number.isInteger(body.cycleDays)||body.cycleDays<1||body.cycleDays>366||!['month','year'].includes(body.scope))fail('چرخه یا روزهای الگو نامعتبر است');
  const allowed=new Set(daysOfJalaliYear(body.year).map(d=>d.date));
  if(body.selectedDates.some(d=>!allowed.has(d)))fail('روزهای انتخابی خارج از سال هستند');
  return {result:{days:repeatPattern({...body,jy:body.year})},write:false};
 }
 const match=tail.match(/^\/?([\w-]+)?(?:\/(compute))?$/);if(!match)fail('مسیر شیفت نامعتبر است');
 const [,id,action]=match,existing=rows.find(r=>r.id===id);
 if(action==='compute'&&method==='POST'){
  if(!existing?.advanced)fail('شیفت پیدا نشد');const s=existing.advanced,d=s.days.find(d=>d.date===body.date);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!Array.isArray(body.punches)||body.punches.length>100)fail('تردد نامعتبر است');
  return {result:{date:body.date,day:d||null,result:computeDay(d,body.punches,{...s.rules,...d?.rules,no_shift_overtime_cap:s.no_shift_overtime_cap,follow_official_holidays:!!s.follow_official_holidays},{isHoliday:state.data.holidays.some(h=>toG(h.date)===body.date),isFriday:weekdayFa(fromIso(body.date))===6,settings:s.settings})},write:false};
 }
 if(method==='GET'){
  if(id&&!existing?.advanced)fail('شیفت پیشرفته پیدا نشد');
  return {result:id?{...existing.advanced,id,name:existing.name,_version:existing._version}:rows.filter(r=>r.advanced).map(r=>({...r.advanced,id:r.id,name:r.name,day_count:r.advanced.days.length})),write:false};
 }
 if(method==='DELETE')return crud(state,'/admin/c/shifts/'+id,method,body,actor);
 if(!['POST','PUT'].includes(method)||method==='PUT'&&!existing?.advanced)fail('عملیات شیفت نامعتبر است');
 if(!Array.isArray(body?.days)||body.days.length>366)fail('حداکثر ۳۶۶ روز قابل تعریف است');
 const c=cleanShift(body);if(c.errors.length)fail(c.errors.join('، '));
 const allowed=new Set(daysOfJalaliYear(c.shift.year).map(d=>d.date));
 if(c.days.some(d=>!allowed.has(d.date))||new Set(c.days.map(d=>d.date)).size!==c.days.length)fail('روز تکراری یا خارج از سال است');
 const advanced={...c.shift,rules:JSON.parse(c.shift.rules),settings:JSON.parse(c.shift.settings),weekly:c.shift.weekly?JSON.parse(c.shift.weekly):null,days:c.days.map(d=>({...d,rules:d.rules?JSON.parse(d.rules):null}))};
 const result=crud(state,'/admin/c/shifts'+(id?'/'+id:''),method,{name:c.shift.name,type:c.shift.type==='simple'?'ساده':'سفارشی',days:{},followHolidays:!!c.shift.follow_official_holidays,overtimeCap:(c.shift.no_shift_overtime_cap||0)/60,advanced,_version:body._version},actor);
 return {result:{id:result.result.id,_version:result.result._version},write:true};
}
