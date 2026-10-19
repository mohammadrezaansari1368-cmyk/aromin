import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Space, Alert, Badge, Button, Card, Checkbox, Col, Form, Input, List, Modal, Row, Select, Steps, Tag, App } from 'antd';
import { SendOutlined, SearchOutlined, AndroidOutlined, AppleOutlined, DownloadOutlined, CopyOutlined, ShareAltOutlined, InfoCircleOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { Page, DataTable, RowActions, StatusTag, CollectionSelect } from '../components/common.jsx';
import { db, useCollection, personName, today, nowTime } from '../store.js';

// ───────── پیام
export function Messages() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const msgs = useCollection('messages');
  const people = useCollection('personnel');
  const group = Form.useWatch('group', form);
  const [f, setF] = useState(''); const [q, setQ] = useState('');
  const [view, setView] = useState(null);
  const targets = people.filter((p) => !group || p.group === group);

  return (
    <Page title="پیام">
      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card size="small" title="ارسال پیام جدید" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" onFinish={async (v) => {
              const to = v.to?.length ? v.to : targets.map((p) => p.id);
              if (!to.length) return message.warning('مخاطبی انتخاب نشده');
              await db.add('messages', { ...v, to, read: [], date: `${today()} ${nowTime()}` });
              form.resetFields(); message.success(`پیام برای ${to.length} نفر ارسال شد`);
            }}>
              <Form.Item name="title" label="عنوان پیام" rules={[{ required: true, message: 'الزامی است' }]}><Input placeholder="عنوان پیام را وارد کنید" /></Form.Item>
              <Form.Item name="group" label="گروه شغلی"><CollectionSelect name="groups" placeholder="همه گروه‌ها" /></Form.Item>
              <Form.Item name="to" label={`مخاطبین (خالی = همه ${targets.length} نفر)`}>
                <Select mode="multiple" allowClear placeholder="نام پرسنل / کد پرسنلی" optionFilterProp="label"
                  options={targets.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} — ${p.code}` }))} />
              </Form.Item>
              <Form.Item name="body" label="متن پیام" rules={[{ required: true, message: 'الزامی است' }]}><Input.TextArea rows={4} placeholder="متن" /></Form.Item>
              <Form.Item name="sms" valuePropName="checked"><Checkbox>ارسال پیامک اطلاع رسانی به پرسنل</Checkbox></Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />}>ارسال</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title="پیام های ارسال شده">
            <div className="toolbar">
              <Input placeholder="عنوان" style={{ width: 200 }} value={f} onChange={(e) => setF(e.target.value)} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => setQ(f)}>جستجو</Button>
            </div>
            <DataTable dataSource={msgs.filter((m) => m.title.includes(q)).slice().reverse()} columns={[
              { title: '#', render: (_, __, i) => i + 1 }, { title: 'عنوان پیام', dataIndex: 'title' },
              { title: 'تاریخ ارسال', dataIndex: 'date' },
              { title: 'تعداد مخاطبین (خوانده شده)', render: (_, m) => `${m.to.length} (${m.read.length})` },
              { title: 'مخاطبین', render: (_, m) => <Button size="small" icon={<EyeOutlined />} onClick={() => setView(m)} /> },
              { title: 'عملیات', render: (_, m) => <RowActions onDelete={() => db.remove('messages', m.id)} /> },
            ]} />
          </Card>
        </Col>
      </Row>
      <Modal open={!!view} onCancel={() => setView(null)} footer={null} title={view?.title}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{view?.body}</p>
        <DataTable rowKey={(r) => r} dataSource={view?.to || []} columns={[
          { title: 'نام پرسنل', render: (id) => personName(id) },
          { title: 'کد پرسنلی', render: (id) => db.find('personnel', id)?.code },
          { title: 'وضعیت', render: (id) => (view.read.includes(id) ? <Tag color="green">خوانده شده</Tag> : <Tag>خوانده نشده</Tag>) },
        ]} />
      </Modal>
    </Page>
  );
}

// ───────── تیکت‌ها
const UNITS = ['پشتیبانی فنی', 'فروش و مالی', 'آموزش', 'پیشنهادات'];
export function Tickets() {
  const rows = useCollection('tickets');
  const [view, setView] = useState(null);
  const [reply, setReply] = useState('');
  const cur = view && rows.find((t) => t.id === view);
  return (
    <Page title="لیست تیکت ها">
      <DataTable dataSource={rows.slice().reverse()} columns={[
        { title: 'شماره تیکت', dataIndex: 'no' }, { title: 'عنوان', dataIndex: 'title' }, { title: 'واحد مربوطه', dataIndex: 'unit' },
        { title: 'تاریخ ثبت', dataIndex: 'createdAt' }, { title: 'تاریخ بروزرسانی', dataIndex: 'updatedAt' },
        { title: 'وضعیت', dataIndex: 'status', render: (v) => <StatusTag v={v} /> },
        { title: 'عملیات', render: (_, t) => <Button size="small" icon={<EyeOutlined />} onClick={() => setView(t.id)}>مشاهده</Button> },
      ]} />
      <Modal open={!!cur} onCancel={() => setView(null)} title={`تیکت ${cur?.no} — ${cur?.title}`} footer={[
        <Button key="c" onClick={() => { db.update('tickets', cur.id, { status: 'بسته' }); setView(null); }}>بستن تیکت</Button>,
        <Button key="s" type="primary" disabled={!reply.trim()} onClick={() => {
          db.update('tickets', cur.id, { thread: [...cur.thread, { by: 'شما', text: reply, at: `${today()} ${nowTime()}` }], updatedAt: today(), status: 'باز' }); setReply('');
        }}>ارسال پاسخ</Button>,
      ]}>
        <List dataSource={cur?.thread || []} renderItem={(m) => <List.Item><List.Item.Meta title={`${m.by} — ${m.at}`} description={<span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>} /></List.Item>} />
        <Input.TextArea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="پاسخ شما" />
      </Modal>
    </Page>
  );
}
export function NewTicket() {
  const nav = useNavigate();
  const { message } = App.useApp();
  return (
    <Page title="ثبت تیکت">
      <Form layout="vertical" style={{ maxWidth: 640, margin: '0 auto' }} initialValues={{ unit: UNITS[0], priority: 'عادی' }} onFinish={async (v) => {
        const no = 1000 + db.list('tickets').length + 1;
        await db.add('tickets', { no, title: v.title, unit: v.unit, priority: v.priority, status: 'باز', updatedAt: today(), thread: [{ by: 'شما', text: v.body, at: `${today()} ${nowTime()}` }] });
        message.success(`تیکت ${no} ثبت شد`); nav('/tickets');
      }}>
        <Form.Item name="title" label="عنوان" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item>
        <Row gutter={16}>
          <Col span={12}><Form.Item name="unit" label="واحد مربوطه"><Select options={UNITS.map((v) => ({ value: v }))} /></Form.Item></Col>
          <Col span={12}><Form.Item name="priority" label="اولویت"><Select options={['کم', 'عادی', 'فوری'].map((v) => ({ value: v }))} /></Form.Item></Col>
        </Row>
        <Form.Item name="body" label="متن تیکت" rules={[{ required: true, message: 'الزامی است' }]}><Input.TextArea rows={6} /></Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />}>ثبت تیکت</Button>
      </Form>
    </Page>
  );
}

// ───────── خرید پکیج (قیمت‌ها نمونه هستند)
const PLANS = [
  { name: 'پایه', users: 'تا ۱۰ پرسنل', price: '—', features: ['ثبت تردد با موبایل', 'گزارش کارکرد', 'درخواست مرخصی'] },
  { name: 'حرفه‌ای', users: 'تا ۵۰ پرسنل', price: '—', features: ['همه امکانات پایه', 'شیفت سفارشی', 'پنل پیامک', 'گزارش پروژه'], hot: true },
  { name: 'سازمانی', users: 'نامحدود', price: '—', features: ['همه امکانات حرفه‌ای', 'وب سرویس API', 'اتصال دستگاه', 'رهگیری پرسنل'] },
];
export function Packages() {
  return (
    <Page title="خرید پکیج">
      <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="قیمت‌ها و درگاه پرداخت هنوز تعریف نشده‌اند. قیمت‌های آرومین را در فایل src/pages/Misc.jsx وارد کنید." />
      <Row gutter={[16, 16]}>
        {PLANS.map((p) => (
          <Col xs={24} md={8} key={p.name}>
            <Badge.Ribbon text="پیشنهاد آرومین" color="#ac44a1" style={{ display: p.hot ? undefined : 'none' }}>
              <Card style={{ borderColor: p.hot ? '#ac44a1' : undefined, textAlign: 'center' }}>
                <h2 style={{ color: '#fff', margin: 0 }}>{p.name}</h2>
                <p style={{ color: 'rgba(255,255,255,.6)' }}>{p.users}</p>
                <h3 style={{ color: '#ac44a1' }}>{p.price} تومان / ماه</h3>
                <List size="small" dataSource={p.features} renderItem={(f) => <List.Item style={{ justifyContent: 'center' }}><CheckOutlined style={{ color: '#49aa19', marginLeft: 6 }} />{f}</List.Item>} />
                <Button type={p.hot ? 'primary' : 'default'} block style={{ marginTop: 12 }}>انتخاب پکیج</Button>
              </Card>
            </Badge.Ribbon>
          </Col>
        ))}
      </Row>
    </Page>
  );
}

// ───────── نصب اپلیکیشن
// آدرس اپلیکیشن پرسنل: روی سرور واقعی خودکار از دامنه فعلی ساخته می‌شود
const APP_URL = `https://t.me/Harikan7_bot`;
const APK_URL = `https://t.me/Harikan7_bot`; // اگر نسخه APK ساختید، لینک آن را اینجا بگذارید
function ShareBox({ title, url }) {
  const { message } = App.useApp();
  return (
    <div style={{ marginTop: 'auto', borderTop: '1px solid #262626', paddingTop: 16 }}>
      <h4 style={{ textAlign: 'center', color: '#fff', marginTop: 0 }}>{title}</h4>
      <Space.Compact style={{ display: 'flex' }}>
        <Input readOnly value={url} style={{ direction: 'ltr' }} />
        <Button type="primary" icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(url).then(() => message.success('لینک کپی شد'))} />
        <Button icon={<ShareAltOutlined />} onClick={() => (navigator.share ? navigator.share({ title: 'اپلیکیشن آرومین', url }).catch(() => {}) : window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}`, '_blank'))} />
      </Space.Compact>
    </div>
  );
}
export function Application() {
  const col = { display: 'flex', flexDirection: 'column', gap: 20, flex: 1 };
  const card = { height: '100%', display: 'flex', flexDirection: 'column' };
  return (
    <Page title="اپلیکیشن مخصوص کارمند">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={<><AndroidOutlined /> نسخه اندروید</>} style={card} styles={{ body: col }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Button size="large" style={{ background: '#fff', color: '#111' }}>دریافت از بازار</Button>
              <Button icon={<DownloadOutlined />} href={APK_URL}>دانلود مستقیم</Button>
            </div>
            <ShareBox title="اشتراک گذاری لینک دانلود اپلیکیشن با پرسنل" url={APK_URL} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<><AppleOutlined /> نسخه iOS</>} style={card} styles={{ body: col }}>
            <Steps direction="vertical" size="small" current={-1} items={[
              { title: <span style={{ fontSize: 13, lineHeight: 1.9 }}>ابتدا با مرورگر Safari وارد آدرس <b style={{ color: '#ac44a1' }}>{APP_URL.replace('https://', '')}</b> شوید و دکمه Add To Home Screen را بزنید.</span> },
              { title: <span style={{ fontSize: 13, lineHeight: 1.9 }}>آیکون آرومین در منوی اپلیکیشن‌ها ظاهر می‌شود. حتماً از طریق همان آیکون نام کاربری و رمز عبور را وارد کنید.</span> },
            ]} />
            <Alert type="info" icon={<InfoCircleOutlined />} showIcon message="در صورت مشکل در موقعیت‌یابی وب‌اپلیکیشن iOS:" description={<a href="#/application">رفع مشکل پیدا کردن لوکیشن (GPS) در آیفون</a>} />
            <ShareBox title="اشتراک گذاری لینک وب اپلیکیشن با پرسنل" url={APP_URL} />
          </Card>
        </Col>
      </Row>
    </Page>
  );
}
