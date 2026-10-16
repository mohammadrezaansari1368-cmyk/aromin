export function faceImage(value){
 if(typeof value!=='string'||value.length>180000||value.length<100||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('عکس چهره معتبر با حجم حداکثر ۱۳۰ کیلوبایت لازم است');
 return value;
}
// A trusted server adapter must compare two faces AND verify live presence.
// Never accept a match or liveness result supplied by the employee browser.
export async function verifyFace(state,person,probe,verify){
 if(state.settings?.faceService?.hasService!==true)return null;
 if(!person.faceReference)throw new Error('کارفرما باید چهره مرجع شما را ثبت کند');
 const reference=faceImage(person.faceReference);
 faceImage(probe);
 if(typeof verify!=='function')throw new Error('تطبیق چهره الزامی است، اما سرویس هنوز به سرور متصل نشده است');
 const result=await verify({reference,probe,personId:person.id});
 if(result?.matched!==true||result?.live!==true||typeof result.receipt!=='string'||!result.receipt)throw new Error('تطبیق چهره یا بررسی زنده‌بودن موفق نبود؛ حضور ثبت نشد');
 return {verifiedAt:new Date().toISOString(),receipt:result.receipt.slice(0,200)};
}
