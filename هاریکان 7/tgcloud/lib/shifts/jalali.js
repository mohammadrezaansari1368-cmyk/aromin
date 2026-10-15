import { toG,toJ } from '../core.js';
export const iso=d=>d.toISOString().slice(0,10);
export const fromIso=s=>new Date(s+'T00:00:00Z');
export const weekdayFa=d=>(d.getUTCDay()+1)%7;
export function toJalali(date){const [jy,jm,jd]=toJ(iso(date)).split('/').map(Number);return {jy,jm,jd};}
export function daysOfJalaliYear(jy){
 if(!Number.isInteger(jy)||jy<1390||jy>1500)throw new Error('سال نامعتبر است');
 const out=[],d=fromIso(toG(jy+'/01/01')),end=toG((jy+1)+'/01/01');
 for(let i=0;i<366&&iso(d)<end;i++){out.push({date:iso(d),...toJalali(d),weekday:weekdayFa(d)});d.setUTCDate(d.getUTCDate()+1);}return out;
}
