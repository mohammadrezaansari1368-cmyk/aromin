import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { businesses,staff } from '../schema.js';
import { initialData,employeeForBusiness } from '../lib/tenant-domain.js';
import { cleanEmployer,employeeByPhone } from '../lib/identity.js';

export default async function(input,ctx) {
  const uid=ctx?.initData?.user?.id;
  if(!Number.isSafeInteger(uid)||uid<=0) throw new EndpointError('ورود معتبر تلگرام لازم است');
  if(input?.action==='create') {
    let profile;try{profile=cleanEmployer(input.profile);}catch(e){throw new EndpointError(e.message);}
    const name=profile.companyName;
    if(name.length<2||name.length>100) throw new EndpointError('نام کسب‌وکار بین ۲ تا ۱۰۰ حرف است');
    const count=await db.$count(businesses,eq(businesses.ownerId,uid));
    if(count>=20) throw new EndpointError('سقف ۲۰ کسب‌وکار برای هر مدیر');
    const state=initialData();state.employerProfile=profile;
    const [row]=await db.insert(businesses).values({ownerId:uid,name,state,version:0}).returning().run();
    return {id:row.id,name:row.name,role:'admin'};
  }
  const rows=await db.select().from(businesses).all();
  if(input?.role==='employee'){
    const person=await db.select().from(staff).where(eq(staff.userId,uid)).get();
    if(!person?.phone)throw new EndpointError('ابتدا در ربات با دکمه اشتراک شماره، شماره خودتان را تأیید کنید');
    return rows.flatMap(row=>employeeByPhone(row,person.phone)?[{id:row.id,name:row.name,role:'employee',logo:row.state.branding?.logo||null}]:[]);
  }
  return rows.filter(row=>row.ownerId===uid).map(row=>({id:row.id,name:row.name,role:'admin',logo:row.state.branding?.logo||null}));
}
