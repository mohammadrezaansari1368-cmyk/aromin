// Device hints are a usability gate, not hardware attestation.
export function requirePhone(device){
 if(!device||!['android','ios'].includes(device.platform)||device.mobile!==true)throw new Error('ثبت عملیات فقط از تلگرام روی گوشی اندروید یا آیفون مجاز است');
}
export function presenceLocation(workplace,location){
 const {lat,lng,accuracy}=location||{};
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>50)throw new Error('دقت لوکیشن باید حداکثر ۵۰ متر باشد');
 if(!workplace||workplace.status==='غیر فعال'||!Number.isFinite(+workplace.lat)||!Number.isFinite(+workplace.lng)||workplace.lat==null||workplace.lng==null||workplace.lat===''||workplace.lng==='')throw new Error('محل مجاز با مختصات معتبر برای شما تعریف نشده است');
 const radius=+workplace.radius||100;
 if(radius<10||radius>5000||Math.abs(+workplace.lat)>90||Math.abs(+workplace.lng)>180)throw new Error('محدوده محل مجاز نامعتبر است');
 const rad=n=>n*Math.PI/180,a=rad(lat-(+workplace.lat)),b=rad(lng-(+workplace.lng));
 const h=Math.sin(a/2)**2+Math.cos(rad(lat))*Math.cos(rad(+workplace.lat))*Math.sin(b/2)**2;
 const distance=6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
 if(distance+accuracy>radius)throw new Error('لوکیشن و شعاع خطای آن باید داخل محدوده محل مجاز باشد');
 return {lat,lng,accuracy,distance:Math.round(distance),workplace:workplace.id,at:new Date().toISOString()};
}
export function missionAction(state,person,action,meta,actor){
 if(!['mission_start','mission_end'].includes(action))throw new Error('عملیات مأموریت نامعتبر است');
 state.mobileMissions ||= [];
 const open=state.mobileMissions.find(r=>r.person===person&&!r.endedAt);
 if(action==='mission_start'){
  if(state.mobileMissions.length>=1000)throw new Error('سقف سابقه مأموریت پر شده است؛ به مدیر اطلاع دهید');
  if(open)throw new Error('مأموریت باز دارید؛ ابتدا پایان آن را ثبت کنید');
  const row={id:'mission'+Date.now().toString(36)+Math.random().toString(36).slice(2,8),person,actor,startedAt:new Date().toISOString(),startMeta:meta};
  state.mobileMissions.push(row);return row;
 }
 if(!open)throw new Error('مأموریت بازی ندارید');
 open.endedAt=new Date().toISOString();open.endMeta=meta;return open;
}
