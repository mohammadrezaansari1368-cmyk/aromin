import { useEffect,useState } from 'react';
import { Alert,Button,Card,Form,Input,List,App } from 'antd';
import { listBusinesses,createBusiness } from '../cloud.js';
import { auth,bootstrap,onError } from '../store.js';
export default function Login({onDone}){
 const{message}=App.useApp();const[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const off=onError(text=>message.error(text));listBusinesses().then(setRows).catch(e=>setError(e.message));return off;},[message]);
 const enter=async business=>{setBusy(true);try{auth.set(null,business);await bootstrap();onDone();}catch(e){auth.clear();setError(e.message);}finally{setBusy(false);}};
 return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:16}}><Card style={{width:'100%',maxWidth:480}}>
  <div className="logo" style={{textAlign:'center',fontSize:34}}>آرو<span>مین</span></div>
  <p style={{textAlign:'center'}}>مدیریت حضور و غیاب در تلگرام</p>
  <Alert type="info" showIcon message="هر کسب‌وکار اطلاعات مستقلی دارد. ورود با حساب تلگرام شما انجام می‌شود." style={{marginBottom:16}}/>
  {error&&<Alert type="error" message={error} style={{marginBottom:16}}/>}
  <List dataSource={rows} renderItem={business=><List.Item actions={[<Button key="enter" loading={busy} onClick={()=>enter(business)}>ورود</Button>]}>{business.name}</List.Item>}/>
  <Form layout="vertical" onFinish={async({name})=>{setBusy(true);try{const business=await createBusiness(name);setRows([...rows,business]);await enter(business);}catch(e){setError(e.message);}finally{setBusy(false);}}}>
   <Form.Item name="name" label="نام کسب‌وکار جدید" rules={[{required:true,min:2,max:100,message:'نام بین ۲ تا ۱۰۰ حرف'}]}><Input placeholder="مثلاً آرومین"/></Form.Item>
   <Button type="primary" htmlType="submit" loading={busy} block>ساخت کسب‌وکار با اطلاعات مستقل</Button>
  </Form>
 </Card></div>;
}
