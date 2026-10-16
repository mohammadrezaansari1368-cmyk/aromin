export function phoneDevice(){
 const platform=window.Telegram?.WebApp?.platform;
 const ua=navigator.userAgent||'';
 const mobile=/Android.*Mobile|iPhone|iPod/i.test(ua);
 return {platform,mobile};
}
export function requirePhone(){
 const d=phoneDevice();
 if(!['android','ios'].includes(d.platform)||!d.mobile)throw new Error('این عملیات را از تلگرام روی گوشی اندروید یا آیفون انجام دهید');
 return d;
}
