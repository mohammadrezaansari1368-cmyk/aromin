import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { businesses } from '../schema.js';
import { authorize, route, DomainError } from '../lib/tenant-domain.js';

export default async function(input,ctx) {
  const uid=ctx?.initData?.user?.id, id=input?.businessId;
  if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(id)||id<=0) throw new EndpointError('هویت یا کسب‌وکار نامعتبر است');
  const scope=and(eq(businesses.id,id),eq(businesses.ownerId,uid));
  const business=await db.select().from(businesses).where(scope).get();
  try {
    authorize(business,uid);
    const method=input.method||'GET';
    if(!['GET','POST','PUT','DELETE'].includes(method)) throw new DomainError('عملیات نامعتبر است');
    const {result,write}=route(business.state,input.path,method,input.body,uid);
    if(write) {
      if(input.version!==business.version) throw new EndpointError('اطلاعات تغییر کرده است؛ صفحه را تازه کنید',{code:'CONFLICT'});
      if(JSON.stringify(business.state).length>4000000) throw new EndpointError('حجم داده این کسب‌وکار به سقف نسخه اولیه رسیده است');
      const rows=await db.update(businesses).set({state:business.state,version:business.version+1}).where(and(scope,eq(businesses.version,business.version))).returning({id:businesses.id}).run();
      if(!rows.length) throw new EndpointError('ویرایش هم‌زمان انجام شده است؛ دوباره تلاش کنید',{code:'CONFLICT'});
    }
    return {result,version:business.version+(write?1:0)};
  } catch(error) {
    if(error instanceof DomainError) throw new EndpointError(error.message);
    throw error;
  }
}
