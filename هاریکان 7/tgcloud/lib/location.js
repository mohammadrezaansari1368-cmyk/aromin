import {todayJ} from './core.js';
export function recordLocation(state,location,actor,person=null){
 const {lat,lng,accuracy}=location||{};
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>200)throw new Error('لوکیشن دقیق دریافت نشد؛ دوباره تلاش کنید');
 const row={lat,lng,accuracy,actor,person,date:todayJ(),at:new Date().toISOString()};
 state.locations ||= [];state.locations.push(row);state.locations=state.locations.slice(-2000);return row;
}
