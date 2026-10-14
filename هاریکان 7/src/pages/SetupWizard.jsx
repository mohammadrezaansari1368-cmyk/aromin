import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Alert,Button,Card,Space,Spin,Steps} from 'antd';
import {api,db} from '../store.js';
import {WorkplaceForm} from './Workplaces.jsx';
import AdvancedShifts from './AdvancedShifts.jsx';
import {PersonnelForm} from './Personnel.jsx';
export default function SetupWizard(){
 const nav=useNavigate(),[step,setStep]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const progress=()=>{
  if(!db.list('workplaces').length)return 0;
  if(!db.list('shifts').length)return 1;
  if(!db.list('personnel').some(p=>p.workplace&&p.shift))return 2;
  return 3;
 };
 useEffect(()=>{setStep(progress());setLoading(false);},[]);
 const finish=async()=>{setSaving(true);try{await api('/admin/settings/onboarding',{method:'PUT',body:{value:{completed:true}}});nav('/');}catch(e){setError(e.message);}finally{setSaving(false);}};
 return <Card title="راه‌اندازی مرحله‌به‌مرحله کسب‌وکار">
  <Steps current={step} size="small" items={['ثبت محل کار','تعریف شیفت','تعریف پرسنل'].map(title=>({title}))} style={{marginBottom:24}}/>
  {error&&<Alert type="error" message={error} style={{marginBottom:12}}/>}
  {loading?<Spin/>:<>
   <Alert type="info" message={['ابتدا نام، موقعیت واقعی و شعاع مجاز محل کار را ثبت کنید.','اکنون برنامه و ساعات شیفت را تعریف و ذخیره کنید.','اکنون کارمند را با شماره موبایل، محل کار و شیفت تعریف کنید.','هر سه مرحله ذخیره شده‌اند؛ راه‌اندازی را پایان دهید.'][step]} style={{marginBottom:16}}/>
   {step===0&&<WorkplaceForm wizard recordId={db.list('workplaces').at(-1)?.id} onSaved={()=>setStep(1)}/>}
   {step===1&&<AdvancedShifts recordId={db.list('shifts').filter(s=>s.advanced).at(-1)?.id} onSaved={()=>setStep(2)}/>}
   {step===2&&<PersonnelForm wizard recordId={db.list('personnel').at(-1)?.id} onSaved={()=>setStep(3)}/>}
   <Space style={{marginTop:16}}>
    {step>0&&<Button onClick={()=>setStep(step-1)}>مرحله قبل</Button>}
    {step<3&&progress()>step&&<Button onClick={()=>setStep(step+1)}>ادامه با اطلاعات ثبت‌شده</Button>}
    {step===3&&<Button type="primary" loading={saving} onClick={finish}>پایان راه‌اندازی و ورود به داشبورد</Button>}
   </Space>
  </>}
 </Card>;
}
