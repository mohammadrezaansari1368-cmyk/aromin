import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Input, Radio, Row, Select, Switch, Upload, App, Checkbox } from 'antd';
import { SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { Page, DataTable, RowActions, StatusTag, ExcelButton, CollectionSelect, DateInput, dateRule } from '../components/common.jsx';
import { ImportExcel } from './Workplaces.jsx';
import { db, useCollection } from '../store.js';
import FaceCapture from '../components/FaceCapture.jsx';

export function PersonnelList() {
  const nav = useNavigate();
  const rows = useCollection('personnel');
  const shifts = useCollection('shifts');
  const [f, setF] = useState({}); const [q, setQ] = useState({});
  const data = rows.filter((r) => (!q.code || r.code?.includes(q.code)) && (!q.firstName || r.firstName.includes(q.firstName)) && (!q.lastName || r.lastName.includes(q.lastName)) && (!q.status || r.status === q.status));
  const columns = [
    { title: '#', render: (_, __, i) => i + 1 },
    { title: 'کد پرسنلی', dataIndex: 'code' },
    { title: 'نام', dataIndex: 'firstName' },
    { title: 'نام خانوادگی', dataIndex: 'lastName' },
    { title: 'شیفت فعلی', dataIndex: 'shift', render: (v) => shifts.find((s) => s.id === v)?.name || '—', exportValue: (r) => shifts.find((s) => s.id === r.shift)?.name },
    { title: 'وضعیت', dataIndex: 'status', render: (v) => <StatusTag v={v} /> },
    { title: 'عملیات', render: (_, r) => <RowActions onEdit={() => nav(`/personnel/edit/${r.id}`)} onDelete={() => db.remove('personnel', r.id)} /> },
  ];
  return (
    <Page title="لیست پرسنل">
      <div className="toolbar">
        {[['code', 'کد پرسنلی'], ['firstName', 'نام'], ['lastName', 'نام خانوادگی']].map(([k, l]) => (
          <Input key={k} placeholder={l} style={{ width: 140 }} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
        <Select placeholder="وضعیت" allowClear style={{ width: 120 }} value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: 'فعال' }, { value: 'غیر فعال' }]} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => setQ(f)}>جستجو</Button>
        <span style={{ flex: 1 }} />
        <ExcelButton rows={data} columns={columns} file="personnel" />
        <ImportExcel collection="personnel" map={(c) => ({ code: c[0], firstName: c[1], lastName: c[2], mobile: c[3], status: 'فعال' })} />
      </div>
      <DataTable dataSource={data} columns={columns} />
    </Page>
  );
}

const Section = ({ title, children }) => (
  <Card size="small" title={title} style={{ marginBottom: 16 }}><Row gutter={16}>{children}</Row></Card>
);
const C = ({ children }) => <Col xs={24} sm={12} md={8}>{children}</Col>;

export function PersonnelForm({onSaved,wizard=false,recordId}={}) {
  const params=useParams(),id=recordId||params.id;
  const [sp] = useSearchParams(); // ?code= از «ترددهای تخلیه‌شده ← پرسنل دستگاه»
  const nav = useNavigate();
  const { message } = App.useApp();
  const ex = id ? db.find('personnel', id) : null;
  const [photo, setPhoto] = useState(ex?.photo);
  const [faceReference,setFaceReference]=useState(ex?.faceReference),[camera,setCamera]=useState(false);

  const submit = async (v) => {
    if(wizard&&(!v.workplace||!v.shift)){message.error('محل کار و شیفت را برای کارمند انتخاب کنید');return;}
    delete v.password2;
    const row = { ...v, photo, faceReference:faceReference||null, status: v.status || 'فعال' };
    if (ex) await db.update('personnel', id, row); else await db.add('personnel', row);
    message.success('پرسنل ثبت شد'); if(onSaved)onSaved();else nav('/personnel');
  };

  return (
    <Page title={ex ? 'ویرایش پرسنل' : 'افزودن پرسنل'}>
      <Form layout="vertical" initialValues={{ methods: ['اپلیکیشن موبایل'], deviceType: 'همه', tracking: false, ...(sp.get('code') && !ex ? { code: sp.get('code') } : {}), ...ex }} onFinish={submit}>
        <Section title="اطلاعات ورود">
          <C><Form.Item name="username" label="نام کاربری" rules={[{ required: true, message: 'الزامی است' }]}><Input style={{ direction: 'ltr' }} /></Form.Item></C>
          <C><Form.Item name="telegramId" label="شناسه عددی تلگرام (اختیاری)"><Input dir="ltr" /></Form.Item></C>
        </Section>
        <Section title="اطلاعات پرسنلی">
          <C><Form.Item name="firstName" label="نام" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item></C>
          <C><Form.Item name="lastName" label="نام خانوادگی" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item></C>
          <C><Form.Item name="nationalId" label="کد ملی" rules={[{ pattern: /^\d{10}$/, message: '۱۰ رقم' }]}><Input style={{ direction: 'ltr' }} maxLength={10} /></Form.Item></C>
          <C><Form.Item name="mobile" label="شماره موبایل کارمند (ملاک اجازه ورود)" rules={[{required:true,message:'شماره موبایل کارمند الزامی است'},{ pattern: /^09\d{9}$/, message: 'مثال: 09123456789' }]}><Input style={{ direction: 'ltr' }} placeholder="شماره‌ای که کارمند در تلگرام اشتراک می‌گذارد" /></Form.Item></C>
          <C><Form.Item label="عکس پرسنلی">
            <Upload accept="image/*" listType="picture-card" showUploadList={false} beforeUpload={(f) => { const r = new FileReader(); r.onload = () => setPhoto(r.result); r.readAsDataURL(f); return false; }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', borderRadius: 8 }} /> : <div><UploadOutlined /><div style={{ fontSize: 12 }}>بارگذاری</div></div>}
            </Upload>
          </Form.Item></C>
        </Section>
        <Section title="ثبت چهره مرجع">
          <Col span={24}><Alert type="info" message="عکس مرجع با اطلاع کارمند ثبت شود؛ این عکس برای تطبیق هویت در سرور همان کسب‌وکار نگهداری می‌شود." style={{marginBottom:12}}/>
            {faceReference&&<img src={faceReference} alt="چهره مرجع کارمند" style={{width:120,display:'block',marginBottom:12}}/>}
            <Button onClick={()=>setCamera(true)}>ثبت چهره با دوربین</Button>
            {faceReference&&<Button onClick={()=>setFaceReference(null)}>حذف چهره مرجع</Button>}
          </Col>
        </Section>
        <FaceCapture open={camera} onCancel={()=>setCamera(false)} onCapture={image=>{setFaceReference(image);setCamera(false);}}/>
        <Section title="اطلاعات شغلی">
          <C><Form.Item name="code" label="کد پرسنلی" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item></C>
          <C><Form.Item name="workplace" label="محل کار"><CollectionSelect name="workplaces" placeholder="جستجو کنید" /></Form.Item></C>
          <C><Form.Item name="policy" label="سیاست کاری"><CollectionSelect name="policies" placeholder="جستجو کنید" /></Form.Item></C>
          <C><Form.Item name="group" label="گروه شغلی"><CollectionSelect name="groups" placeholder="جستجو کنید" /></Form.Item></C>
          <C><Form.Item name="jobTitle" label="عنوان شغلی"><Input /></Form.Item></C>
          <C><Form.Item name="status" label="وضعیت"><Select placeholder="فعال" options={[{ value: 'فعال' }, { value: 'غیر فعال' }]} /></Form.Item></C>
        </Section>
        <Section title="اطلاعات شیفت">
          <C><Form.Item name="shift" label="شیفت"><CollectionSelect name="shifts" placeholder="جستجو کنید" /></Form.Item></C>
          <C><Form.Item name="shiftStart" label="تاریخ شروع شیفت" rules={[dateRule]}><DateInput /></Form.Item></C>
          <C><Form.Item name="shiftEnd" label="تاریخ پایان شیفت (اختیاری)" rules={[dateRule]}><DateInput /></Form.Item></C>
        </Section>
        <Section title="روش ثبت تردد">
          <Col span={24}><Form.Item name="methods"><Checkbox.Group options={['اپلیکیشن موبایل', 'وب اپلیکیشن', 'دستگاه حضور و غیاب', 'WiFi محل کار']} /></Form.Item></Col>
        </Section>
        <Section title="محدود کردن دستگاه مورد استفاده در ثبت تردد">
          <C><Form.Item name="deviceType" label="نوع دستگاه"><Radio.Group options={['همه', 'فقط اندروید', 'فقط iOS', 'یک دستگاه ثابت']} /></Form.Item></C>
        </Section>
        <Section title="امکان رهگیری پرسنل">
          <C><Form.Item name="tracking" valuePropName="checked" label="رهگیری موقعیت در ساعات کاری"><Switch /></Form.Item></C>
        </Section>
        <Button type="primary" htmlType="submit">ثبت</Button>
      </Form>
    </Page>
  );
}
