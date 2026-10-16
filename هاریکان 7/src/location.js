import {api} from './store.js';
export function currentLocation(){return new Promise((resolve,reject)=>{
 if(!navigator.geolocation)return reject(new Error('دریافت موقعیت در این دستگاه پشتیبانی نمی‌شود'));
 navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),()=>reject(new Error('دسترسی به لوکیشن رد شد یا موقعیت دریافت نشد')),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
});}
export const saveManagerLocation=async()=>api('/admin/location',{method:'POST',body:await currentLocation()});
