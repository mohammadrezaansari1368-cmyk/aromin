export function imageData(bytes){
 if(!bytes?.length||bytes.length>524288)throw new Error('لوگو باید حداکثر ۵۱۲ کیلوبایت باشد');
 const ascii=(from,n)=>Array.from(bytes.slice(from,from+n)).map(c=>String.fromCharCode(c)).join('');
 const type=bytes[0]===137&&ascii(1,3)==='PNG'?'png':bytes[0]===255&&bytes[1]===216?'jpeg':ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'?'webp':null;
 if(!type)throw new Error('لوگو باید PNG، JPG یا WebP باشد');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';
 for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1]||0,c=bytes[i+2]||0;out+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]+(i+1<bytes.length?alphabet[((b&15)<<2)|(c>>6)]:'=')+(i+2<bytes.length?alphabet[c&63]:'=');}
 return 'data:image/'+type+';base64,'+out;
}
