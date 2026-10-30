import { parseJ } from '@/lib/jalali'
export function yearDays(year:number){
 const days:{date:string;weekday:number;month:number;day:number}[]=[]
 for(let month=1;month<=12;month++)for(let day=1;day<=31;day++){
  const p=parseJ(`${year}/${month}/${day}`)
  if(p)days.push({date:p.j,month,day,weekday:(new Date(p.iso+'T12:00:00Z').getUTCDay()+1)%7})
 }
 return days
}
