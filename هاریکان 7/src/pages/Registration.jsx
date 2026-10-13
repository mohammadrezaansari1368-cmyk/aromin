import {useEffect,useState} from 'react';
import {Alert,Button,Card,Form,Input,List,Upload,Space,App} from 'antd';
import {listBusinesses,createBusiness} from '../cloud.js';
import {auth,bootstrap} from '../store.js';
export default function Registration({onDone}){
 const {message}=App.useApp();const[form]=Form.useForm();
 const[role,setRole]=useState(()=>new URLSearchParams(location.search).get('role')),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pictures,setPictures]=useState({});
 useEffect(()=>{if(!['employer','employee'].includes(role))return;setError('');setRows([]);listBusinesses(role).then(setRows).catch(e=>setError(e.message));},[role]);
 const enter=async business=>{setBusy(true);try{auth.set(null,business);await bootstrap();onDone();}catch(e){auth.clear();setError(e.message);}finally{setBusy(false);}};
 const upload=(key,file)=>{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1048576){message.error('عکس JPG، PNG یا WebP با حجم حداکثر ۱ مگابایت انتخاب کنید');return false;}const reader=new FileReader();reader.onload=()=>{form.setFieldValue(key,reader.result);setPictures(p=>({...p,[key]:file.name}));};reader.readAsDataURL(file);return false;};
 return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:16}}><Card style={{width:'100%',maxWidth:540}}>
  <div className="logo" style={{textAlign:'center',fontSize:30}}>هاریکان ۷</div>
  <p style={{textAlign:'center'}}>سامانه مدیریت حضور و غیاب</p>
  {!['employer','employee'].includes(role)?<Space style={{display:'flex',justifyContent:'center'}}><Button type="primary" onClick={()=>setRole('employer')}>کارفرما هستم</Button><Button onClick={()=>setRole('employee')}>کارمند هستم</Button></Space>:<>
   <Button type="link" onClick={()=>{setRole(null);setError('');}}>تغییر نقش</Button>
   <Alert type="info" showIcon message={role==='employee'?'فقط کسب‌وکاری که کارفرما شماره تأییدشده شما را در فهرست کارکنان فعال ثبت کرده، قابل ورود است.':'اطلاعات هر کسب‌وکار مستقل است. مدارک فقط در بخش خصوصی کسب‌وکار ذخیره می‌شوند.'} style={{marginBottom:16}}/>
   {error&&<Alert type="error" message={error} style={{marginBottom:16}}/>}
   <List dataSource={rows} renderItem={b=><List.Item actions={[<Button key="enter" loading={busy} onClick={()=>enter(b)}>ورود</Button>]}>{b.name}</List.Item>}/>
   {role==='employee'&&!rows.length&&<Alert type="warning" showIcon message="اجازه ادامه ندارید؛ ابتدا شماره خود را در ربات اشتراک بگذارید و از کارفرما بخواهید همان شماره را در کسب‌وکار ثبت کند."/>}
   {role==='employer'&&<Form form={form} layout="vertical" onFinishFailed={()=>message.error('همه اطلاعات، عکس کارت ملی و عکس جواز کسب الزامی هستند')} onFinish={async profile=>{setBusy(true);try{const b=await createBusiness(profile);setRows([...rows,b]);await enter(b);}catch(e){setError(e.message);}finally{setBusy(false);}}}>
    <h3>ساخت کسب‌وکار جدید</h3>
    {[['firstName','نام'],['lastName','نام خانوادگی'],['phone','شماره تلفن با پیش‌شماره'],['mobile','شماره موبایل'],['companyName','نام شرکت / صنف']].map(([key,label])=><Form.Item key={key} name={key} label={label} rules={[{required:true,message:label+' الزامی است'}]}><Input dir={key==='phone'||key==='mobile'?'ltr':'rtl'}/></Form.Item>)}
    {[['nationalCard','عکس کارت ملی'],['businessLicense','عکس جواز کسب']].map(([key,label])=><div key={key}><Form.Item name={key} hidden rules={[{required:true,message:label+' الزامی است'}]}><Input/></Form.Item><Form.Item label={label} required><Upload accept="image/png,image/jpeg,image/webp" beforeUpload={file=>upload(key,file)} showUploadList={false}><Button>{pictures[key]||'انتخاب عکس (حداکثر ۱ مگابایت)'}</Button></Upload></Form.Item></div>)}
    <Alert type="info" message="با ثبت، عکس کارت ملی و جواز کسب روی دیتابیس خصوصی این کسب‌وکار در تلگرام ذخیره می‌شود. ثبت مدارک به معنای تأیید اصالت آن‌ها نیست." style={{marginBottom:16}}/>
    <Button type="primary" htmlType="submit" loading={busy} block>ثبت اطلاعات و ساخت کسب‌وکار</Button>
   </Form>}
  </>}
 </Card></div>;
}
