import {api,db} from 'sdk';
import {eq} from 'sdk/db';
import {staff,businesses} from '../schema.js';
import {normalizeMobile,employeeByPhone} from '../lib/identity.js';
export default async function(query){
 await api.answerCallbackQuery({callback_query_id:query.id});
 if(!['role:employer','role:employee'].includes(query.data)||query.message?.chat?.type!=='private'||query.message.chat.id!==query.from.id)return;
 const role=query.data.split(':')[1],chat_id=query.from.id;
 if(role==='employee'){
  const person=await db.select().from(staff).where(eq(staff.userId,chat_id)).get();
  if(!normalizeMobile(person?.phone))return api.sendMessage({chat_id,text:'برای بررسی عضویت در کسب‌وکار، شماره خودتان را فقط با دکمه اشتراک شماره ارسال کنید. شماره باید قبلاً توسط کارفرما ثبت شده باشد.',reply_markup:{keyboard:[[{text:'اشتراک شماره',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
  const rows=await db.select().from(businesses).all();
  if(!rows.some(b=>employeeByPhone(b,person.phone)))return api.sendMessage({chat_id,text:'اجازه ادامه ندارید؛ شماره تأییدشده شما در فهرست کارکنان فعال هیچ کسب‌وکاری ثبت نشده است. کارفرما باید ابتدا همین شماره را ثبت کند.'});
 }
 return api.sendMessage({chat_id,text:role==='employee'?'ورود کارمند؛ فقط کسب‌وکارهای دارای شماره تأییدشده شما قابل دسترسی هستند.':'ورود کارفرما؛ برای ساخت کسب‌وکار جدید اطلاعات و مدارک الزامی است.',reply_markup:{inline_keyboard:[[{text:role==='employee'?'ادامه به عنوان کارمند':'ادامه به عنوان کارفرما',web_app:{url:'https://app8964990565.tgcloud.ai/?role='+role}}]]}});
}
