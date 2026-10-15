let selection;
try { selection=JSON.parse(sessionStorage.getItem('aromin:business')); } catch { selection=null; }
let revision=0,queue=Promise.resolve();
export const tenant={
  get business(){return selection;},
  get token(){return selection?.id?'telegram':null;},
  get user(){return selection?{name:selection.name,role:'admin'}:null;},
  set(_token,business){selection=business;sessionStorage.setItem('aromin:business',JSON.stringify(business));},
  clear(){selection=null;revision=0;sessionStorage.removeItem('aromin:business');},
};
export function cloud(name,input){return new Promise((resolve,reject)=>{
  const sdk=window.Telegram?.WebApp;
  if(!sdk?.initData||!sdk?.Serverless?.call) return reject(new Error('این سامانه را از دکمه داخل ربات تلگرام باز کنید.'));
  sdk.Serverless.call(name,input,(error,result)=>{if(error){const e=new Error(error.message||'ارتباط با تلگرام برقرار نشد');e.code=error.parameters?.code;reject(e);}else resolve(result);});
});}
export const listBusinesses=role=>cloud('businesses',{role});
export const createBusiness=profile=>cloud('businesses',{action:'create',profile});
export async function cloudApi(path,{method='GET',body}={}){
  const businessId=selection?.id;
  const task=async()=>{
    if(!businessId||businessId!==selection?.id)throw new Error('کسب‌وکار تغییر کرده است؛ دوباره تلاش کنید');
    const response=await cloud('panel',{businessId,path,method,body,version:revision});
    revision=response.version;return response.result;
  };
  const result=queue.then(task,task);queue=result.catch(()=>{});return result;
}
