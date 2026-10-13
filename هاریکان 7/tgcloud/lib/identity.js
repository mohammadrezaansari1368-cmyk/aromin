export function normalizeMobile(value){
 let v=String(value||'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\s()-]/g,'');
 if(v.startsWith('+98'))v='0'+v.slice(3);else if(v.startsWith('0098'))v='0'+v.slice(4);else if(/^989\d{9}$/.test(v))v='0'+v.slice(2);else if(/^9\d{9}$/.test(v))v='0'+v;
 return /^09\d{9}$/.test(v)?v:null;
}
export function employeeByPhone(business,verifiedMobile){
 const phone=normalizeMobile(verifiedMobile);if(!phone)return null;
 const matches=business?.state?.data?.personnel.filter(p=>normalizeMobile(p.mobile)===phone&&p.status==='فعال')||[];
 return matches.length===1?matches[0]:null;
}
export function cleanEmployer(input){
 const s=input||{},out={};
 for(const key of ['firstName','lastName','companyName']){out[key]=String(s[key]||'').trim();if(out[key].length<2||out[key].length>100)throw new Error('نام، نام خانوادگی و نام شرکت / صنف الزامی است');}
 out.mobile=normalizeMobile(s.mobile);if(!out.mobile)throw new Error('شماره موبایل معتبر الزامی است');
 out.phone=String(s.phone||'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[\s()-]/g,'');
 if(!/^(0\d{10}|\+98\d{10})$/.test(out.phone))throw new Error('شماره تلفن همراه با پیش‌شماره الزامی است');
 for(const key of ['nationalCard','businessLicense']){
  const image=s[key];if(typeof image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>1700000||image.length<100)throw new Error('عکس کارت ملی و عکس جواز کسب الزامی است (حداکثر ۱ مگابایت برای هر عکس)');
  out[key]=image;
 }
 out.documentStatus='submitted';return out;
}
