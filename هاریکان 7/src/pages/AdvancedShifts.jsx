import {useEffect,useRef} from 'react';
import {useParams} from 'react-router-dom';
import {Page} from '../components/common.jsx';
import {api,reload,auth} from '../store.js';
export default function AdvancedShifts(){
 const {id}=useParams(),frame=useRef();
 useEffect(()=>{
  const handler=async event=>{
   if(event.origin===location.origin&&event.source===frame.current?.contentWindow&&event.data?.channel==='aromin-shifts-brand'){event.source.postMessage({channel:'aromin-shifts-brand-response',logo:auth.business?.logo||null,name:auth.business?.name},location.origin);return;}
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.channel!=='aromin-shifts-request')return;
   const {requestId,path,method,body}=event.data;
   if(typeof path!=='string'||!/^\/api\/(shifts(?:\/.*)?|holidays)$/.test(path))return;
   try{const result=await api(path==='/api/holidays'?'/admin/advanced-shifts/holidays':path.replace('/api/shifts','/admin/advanced-shifts'),{method:method||'GET',body});event.source.postMessage({channel:'aromin-shifts-response',requestId,result},location.origin);if(['POST','PUT','DELETE'].includes(method)&&!path.includes('/preview/'))await reload('shifts');}
   catch(error){event.source.postMessage({channel:'aromin-shifts-response',requestId,error:error.message},location.origin);}
  };window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler);
 },[id]);
 return <Page title="شیفت‌های پیشرفته هاریکان ۷"><iframe ref={frame} title="تعریف شیفت پیشرفته هاریکان ۷" src={'/shifts.html'+(id?'?id='+encodeURIComponent(id):'')} style={{width:'100%',height:'80vh',border:0,borderRadius:8}}/></Page>;
}
