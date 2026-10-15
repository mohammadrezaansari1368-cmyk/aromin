import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Modal,Space} from 'antd';
export default function FaceCapture({open,onCancel,onCapture}){
 const video=useRef(null),stream=useRef(null),[error,setError]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{
  if(!open)return;
  let disposed=false;setError('');setReady(false);
  navigator.mediaDevices?.getUserMedia({video:{facingMode:'user',width:{ideal:480},height:{ideal:640}},audio:false}).then(s=>{
   if(disposed){s.getTracks().forEach(t=>t.stop());return;}
   stream.current=s;if(video.current){video.current.srcObject=s;video.current.play().catch(()=>setError('دوربین اجرا نشد'));}
  }).catch(()=>setError('اجازه دوربین لازم است؛ از تلگرام گوشی استفاده کنید'));
  if(!navigator.mediaDevices?.getUserMedia)setError('دوربین در این محیط در دسترس نیست');
  return ()=>{disposed=true;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
 },[open]);
 const capture=()=>{
  const v=video.current;if(!v?.videoWidth)return;
  const c=document.createElement('canvas'),scale=Math.min(1,400/v.videoWidth,500/v.videoHeight);c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);const image=c.toDataURL('image/jpeg',0.7);
  if(image.length>180000){setError('عکس بیش از حد بزرگ است؛ دوباره تلاش کنید');return;}onCapture(image);
 };
 return <Modal open={open} title="ثبت چهره با دوربین" onCancel={onCancel} destroyOnClose footer={<Space><Button onClick={onCancel}>انصراف</Button><Button type="primary" disabled={!ready||!!error} onClick={capture}>گرفتن عکس و ادامه</Button></Space>}>
  <Alert type="info" message="عکس برای تطبیق هویت به سرور ارسال می‌شود. گرفتن عکس به‌تنهایی اثبات زنده‌بودن نیست."/>
  {error&&<Alert type="error" message={error}/>}<video ref={video} autoPlay playsInline muted onLoadedData={()=>setReady(true)} style={{width:'100%',maxHeight:400,marginTop:12}}/>
 </Modal>;
}
