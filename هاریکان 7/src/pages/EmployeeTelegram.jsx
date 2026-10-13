import {useEffect,useState} from 'react';
import {Alert,Button,Card,Form,Input,List,Select,Space,Spin,Table,App} from 'antd';
import {cloud,tenant} from '../cloud.js';
import {today} from '../store.js';
export default function Employee(){
 const{message}=App.useApp();const[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>cloud('employee',{businessId:tenant.business.id,action:'load'}).then(setData);
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 const act=async(action,extra={})=>{setBusy(true);try{setData(await cloud('employee',{businessId:tenant.business.id,action,version:data.version,...extra}));message.success('ثبت شد');}catch(e){setError(e.message);if(e.code==='CONFLICT')await load();}finally{setBusy(false);}};
 const punch=async action=>{
  setBusy(true);
  try{const location=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),()=>reject(new Error('برای ثبت تردد، اجازه موقعیت مکانی لازم است')),{enableHighAccuracy:true,timeout:20000,maximumAge:0}));await act(action,{location});}
  catch(e){setError(e.message);}finally{setBusy(false);}
 };
 return <div style={{padding:16,maxWidth:900,margin:'auto'}}><div style={{textAlign:'center',marginBottom:16}}>{data?.branding?.logo&&<img src={data.branding.logo} alt={'لوگوی '+tenant.business.name} style={{width:200,maxWidth:'100%'}}/>}<h2>هاریکان ۷</h2></div>
  <Card title={tenant.business.name} extra={<Button onClick={()=>{tenant.clear();window.dispatchEvent(new Event('aromin:logout'));}}>تغییر کسب‌وکار</Button>}>
   {error&&<Alert type="error" message={error} closable onClose={()=>setError('')} style={{marginBottom:16}}/>}
   {!data?<Spin/>:<><h3>{data.name}</h3><Alert type="info" message="با زدن ورود، خروج یا ثبت لوکیشن، موقعیت فعلی در سابقه خصوصی کسب‌وکار ثبت می‌شود؛ برای ورود و خروج محدوده محل کار هم بررسی می‌شود." style={{marginBottom:16}}/>
    <Space><Button type="primary" loading={busy} onClick={()=>punch('in')}>ثبت ورود</Button><Button loading={busy} onClick={()=>punch('out')}>ثبت خروج</Button></Space>
    <Button style={{marginInlineStart:8}} loading={busy} onClick={()=>punch('location')}>ثبت لوکیشن</Button>
    <h3>ترددهای من</h3><Table rowKey="id" dataSource={data.attendance.slice().reverse()} size="small" columns={[{title:'تاریخ',dataIndex:'date'},{title:'ورود',dataIndex:'in'},{title:'خروج',dataIndex:'out'}]}/>
    <h3>درخواست جدید</h3><Form layout="vertical" initialValues={{from:today()}} onFinish={body=>act('request',{body})}>
     <Form.Item name="kind" label="نوع" rules={[{required:true}]}><Select options={data.requestTypes.map(t=>({value:t.name,label:t.name}))}/></Form.Item>
     <Space><Form.Item name="from" label="از تاریخ" rules={[{required:true}]}><Input placeholder="1405/07/01" dir="ltr"/></Form.Item><Form.Item name="to" label="تا تاریخ"><Input placeholder="1405/07/01" dir="ltr"/></Form.Item></Space>
     <Form.Item name="note" label="توضیحات"><Input.TextArea/></Form.Item><Button type="primary" htmlType="submit" loading={busy}>ثبت درخواست</Button>
    </Form>
    <h3>درخواست‌های من</h3><List dataSource={data.requests.slice().reverse()} renderItem={r=><List.Item>{r.kind} — {r.from} — {r.status}</List.Item>}/>
    <h3>پیام‌های من</h3><List dataSource={data.messages.slice().reverse()} renderItem={m=><List.Item><List.Item.Meta title={m.title} description={m.body}/></List.Item>}/>
   </>}
  </Card>
 </div>;
}
