import { api, db } from 'sdk';
import { eq, and, isNull, desc } from 'sdk/db';
import { staff, missions, reports,businesses } from '../schema.js';
import {employeeByPhone} from '../lib/identity.js';

const keyboard = {
  keyboard: [
    [{ text: 'سامانه هاریکان ۷' }],
    [{ text: 'اشتراک شماره', request_contact: true }],
    [{ text: 'شروع مأموریت' }, { text: 'پایان مأموریت' }],
    [{ text: 'تاریخچه گزارش‌ها' }, { text: 'راهنما' }],
  ], resize_keyboard: true,
};
const time = value => new Date(value * 1000).toISOString();

export default async function (message) {
  if (message.chat.type !== 'private' || !message.from || message.from.is_bot) return;
  const uid = message.from.id;
  const now = message.date;
  const text = (message.text || '').trim();
  const command = text.split(/\s/)[0].split('@')[0];
  const send = value => api.sendMessage({ chat_id: message.chat.id, text: value, reply_markup: keyboard });
  const chooseRole=()=>api.sendMessage({chat_id:message.chat.id,text:'به سامانه هاریکان ۷ خوش آمدید. قبل از باز کردن سامانه، نقش خود را انتخاب کنید.',reply_markup:{inline_keyboard:[[{text:'کارفرما هستم',callback_data:'role:employer'},{text:'کارمند هستم',callback_data:'role:employee'}]]}});
  await db.insert(staff).values({ userId: uid, name: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') })
    .onConflictDoUpdate({ target: staff.userId, set: { name: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') } }).run();
  const person = await db.select().from(staff).where(eq(staff.userId, uid)).get();
  const active = () => db.select().from(missions).where(and(eq(missions.userId, uid), isNull(missions.endedAt))).orderBy(desc(missions.id)).get();

  if (command === '/start' || command === '/help' || text === 'راهنما') {
    await api.setChatMenuButton({chat_id:message.chat.id,menu_button:{type:'commands'}});
    return chooseRole();
  }
  if(command==='/app'||text==='سامانه حضور و غیاب'||text==='سامانه هاریکان ۷') return chooseRole();
  if (message.contact) {
    if (message.contact.user_id !== uid) return send('فقط شماره متعلق به حساب خودتان را با دکمه اشتراک شماره ارسال کنید.');
    await db.update(staff).set({ phone: message.contact.phone_number }).where(eq(staff.userId, uid)).run();
    const available=await db.select().from(businesses).all();
    if(!available.some(b=>employeeByPhone(b,message.contact.phone_number)))return api.sendMessage({chat_id:message.chat.id,text:'شماره شما تأیید شد، اما اجازه ادامه ندارید؛ کارفرما هنوز این شماره را در فهرست کارکنان فعال کسب‌وکار ثبت نکرده است.'});
    return api.sendMessage({chat_id:message.chat.id,text:'شماره شما تأیید شد. تنها در صورت ثبت همین شماره توسط کارفرما، اجازه ورود به کسب‌وکار را دارید.',reply_markup:{inline_keyboard:[[{text:'ادامه به عنوان کارمند',web_app:{url:'https://app8964990565.tgcloud.ai/?role=employee'}}]]}});
  }
  if (!person.phone) return send('ابتدا شماره خودتان را با دکمه اشتراک شماره ثبت کنید.');
  if (text === 'شروع مأموریت' || command === '/mission_start') {
    const current = await active();
    if (current) return send(`مأموریت ${current.id} هنوز باز است. ابتدا آن را پایان دهید.`);
    const [created] = await db.insert(missions).values({ userId: uid, startedAt: now }).returning().run();
    return send(`مأموریت ${created.id} شروع شد. زمان UTC: ${time(now)}\nنام مجموعه و شرح کار را در گزارش بنویسید یا ویس بدهید.`);
  }
  if (text === 'پایان مأموریت' || command === '/mission_end') {
    const current = await active();
    if (!current) return send('مأموریت بازی ندارید.');
    await db.update(missions).set({ endedAt: now }).where(and(eq(missions.id, current.id), isNull(missions.endedAt))).run();
    return send(`مأموریت ${current.id} پایان یافت. مدت: ${Math.max(0, Math.ceil((now - current.startedAt) / 60))} دقیقه.\nاین اقدام تیکتی در CRM ایجاد یا بسته نمی‌کند.`);
  }
  if (text === 'تاریخچه گزارش‌ها' || command === '/history') {
    const rows = await db.select().from(reports).where(eq(reports.userId, uid)).orderBy(desc(reports.id)).limit(10).all();
    if (!rows.length) return send('هنوز گزارشی ثبت نکرده‌اید.');
    for (const row of rows) {
      await send(`گزارش ${row.id} | مأموریت ${row.missionId}\nزمان UTC: ${time(row.createdAt)}\n${row.body || 'ویس؛ در انتظار اتصال سرویس تبدیل صوت'}\nوضعیت CRM: ارسال نشده`);
      if (row.voiceFileId) await api.sendVoice({ chat_id: message.chat.id, voice: row.voiceFileId });
    }
    return;
  }
  if (text.startsWith('/')) return send('فرمان شناخته نشد. از دکمه‌ها یا /help استفاده کنید.');
  const current = await active();
  if (!current) return send('برای ثبت گزارش ابتدا شروع مأموریت را بزنید.');
  if (!text && !message.voice) return send('گزارش را به‌صورت متن یا ویس بفرستید.');
  const key = `${message.chat.id}:${message.message_id}`;
  const existing = await db.select().from(reports).where(eq(reports.sourceKey, key)).get();
  if (existing) return;
  const [row] = await db.insert(reports).values({
    sourceKey: key, userId: uid, missionId: current.id, body: text || null,
    voiceFileId: message.voice?.file_id || null, voiceDuration: message.voice?.duration || null,
    status: message.voice ? 'awaiting_transcription' : 'awaiting_crm', createdAt: now,
  }).onConflictDoNothing().returning().run();
  if (row) return send(`گزارش ${row.id} برای مأموریت ${current.id} ذخیره شد.\n${message.voice ? 'ویس در انتظار اتصال سرویس تبدیل صوت است.' : 'متن آماده ارسال به CRM است.'}\nهنوز تیکتی در CRM ساخته نشده است.`);
}
