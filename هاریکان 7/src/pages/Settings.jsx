import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Radio, Row, Segmented, Select, Space, Switch, Tabs, Tree, Typography, App } from 'antd';
import { PlusOutlined, CopyOutlined, KeyOutlined, ReadOutlined, CalendarOutlined } from '@ant-design/icons';
import { Page, DataTable, RowActions, StatusTag, Field, DateInput, dateRule, MONTHS, YEARS, CollectionSelect } from '../components/common.jsx';
import { db, useCollection, useLocalSetting, today, MODE, api } from '../store.js';
import { useEffect } from 'react';

// ───────── تعطیلات
const OFFICIAL_1405 = [
  ['1405/01/01', 'عید نوروز'], ['1405/01/02', 'عید نوروز'], ['1405/01/03', 'عید نوروز'], ['1405/01/04', 'عید نوروز'],
  ['1405/01/12', 'روز جمهوری اسلامی'], ['1405/01/13', 'روز طبیعت'], ['1405/03/14', 'رحلت امام خمینی'], ['1405/03/15', 'قیام ۱۵ خرداد'],
  ['1405/11/22', 'پیروزی انقلاب اسلامی'], ['1405/12/29', 'ملی شدن صنعت نفت'],
];
export function Holidays() {
  const { message } = App.useApp();
  const rows = useCollection('holidays');
  const [form] = Form.useForm();
  const [y, setY] = useState(Number(today().slice(0, 4)));
  const [m, setM] = useState();
  const data = rows.filter((r) => r.date.startsWith(String(y)) && (m == null || Number(r.date.split('/')[1]) === m + 1)).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Page title="تعطیلات">
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Card size="small" title="تعریف تعطیلات">
            <Form form={form} layout="vertical" onFinish={async (v) => { await db.add('holidays', v); form.resetFields(); message.success('ثبت شد'); }}>
              <Form.Item name="title" label="عنوان تعطیلات" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item>
              <Form.Item name="date" label="تاریخ" rules={[{ required: true, message: 'الزامی است' }, dateRule]}><DateInput /></Form.Item>
              <Button type="primary" htmlType="submit" block>ثبت</Button>
            </Form>
            <Button block style={{ marginTop: 8 }} icon={<CalendarOutlined />} onClick={() => {
              OFFICIAL_1405.forEach(([date, title]) => !rows.some((r) => r.date === date) && db.add('holidays', { date, title }));
              message.success('تعطیلات رسمی نمونه اضافه شد (لیست کامل را از تقویم رسمی تکمیل کنید)');
            }}>دریافت لیست تعطیلات</Button>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card size="small" title="لیست تعطیلات" extra={<Space>
            <Select size="small" value={y} onChange={setY} options={YEARS.map((v) => ({ value: v, label: v }))} />
            <Select size="small" allowClear placeholder="انتخاب ماه" value={m} onChange={setM} style={{ width: 110 }} options={MONTHS.map((v, i) => ({ value: i, label: v }))} />
          </Space>}>
            <DataTable dataSource={data} columns={[
              { title: 'تاریخ', dataIndex: 'date' }, { title: 'عنوان تعطیلات', dataIndex: 'title' },
              { title: 'عملیات', render: (_, r) => <RowActions onDelete={() => db.remove('holidays', r.id)} /> },
            ]} />
          </Card>
        </Col>
      </Row>
    </Page>
  );
}

// ───────── سیاست کاری
export function PolicyList() {
  const nav = useNavigate();
  return (
    <Page title="لیست سیاست کاری" extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => nav('/policies/new')}>ثبت سیاست کاری</Button>}>
      <DataTable dataSource={useCollection('policies')} columns={[
        { title: 'عنوان سیاست کاری', dataIndex: 'name' }, { title: 'توضیحات', dataIndex: 'description' },
        { title: 'عملیات', render: (_, r) => <RowActions onEdit={() => nav(`/policies/edit/${r.id}`)} onDelete={() => db.remove('policies', r.id)} /> },
      ]} />
    </Page>
  );
}

const REQ_TABS = ['مرخصی استحقاقی', 'مرخصی استعلاجی', 'مرخصی بی‌حقوق', 'ماموریت', 'اضافه کار', 'تردد دستی', 'تردد دستی پروژه', 'جابجایی شیفت', 'تهاتر', 'روز تعطیل', 'تعویض شیفت'];
const Num = ({ name, label, suffix = 'روز' }) => (
  <Col xs={24} md={12}><Form.Item name={name} label={label}><InputNumber min={0} style={{ width: '100%' }} addonAfter={suffix} placeholder="تعداد" /></Form.Item></Col>
);
export function PolicyForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { message } = App.useApp();
  const ex = id ? db.find('policies', id) : null;
  return (
    <Page title={ex ? 'ویرایش سیاست کاری' : 'ثبت سیاست کاری'}>
      <Form layout="vertical" initialValues={{ year: 1405, yearCap: 26, monthCap: 2.5, ...ex }} onFinish={async (v) => {
        if (ex) await db.update('policies', id, v); else await db.add('policies', v);
        message.success('سیاست کاری ثبت شد'); nav('/policies');
      }}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="نام سیاست کاری" rules={[{ required: true, message: 'الزامی است' }]}><Input placeholder="نام سیاست کاری را وارد نمایید" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="description" label="توضیحات"><Input placeholder="توضیحات سیاست کاری را وارد نمایید" /></Form.Item></Col>
          <Col span={24}><Form.Item name="approvalLimit" valuePropName="checked"><Checkbox>اعمال محدودیت زمانی در زمان تائید درخواست</Checkbox></Form.Item></Col>
        </Row>
        <Tabs items={REQ_TABS.map((t) => ({ key: t, label: t, children: (
          <Row gutter={16}>
            {t === 'مرخصی استحقاقی' ? (<>
              <Col xs={24} md={12}><Form.Item name="year" label="سال"><Select options={YEARS.map((y) => ({ value: y, label: y }))} /></Form.Item></Col>
              <Num name="yearCap" label="سقف مرخصی استحقاقی مجاز در سال" />
              <Col span={24}><Form.Item name="allowOverYear" valuePropName="checked"><Checkbox>امکان ثبت مرخصی در صورت رسیدن به سقف مجاز سالانه</Checkbox></Form.Item></Col>
              <Num name="monthCap" label="سقف مرخصی استحقاقی مجاز در ماه" />
              <Col span={24}><Form.Item name="allowOverMonth" valuePropName="checked"><Checkbox>امکان ثبت مرخصی در صورت رسیدن به سقف مجاز ماهانه</Checkbox></Form.Item></Col>
              <Num name="carryOver" label="سقف مرخصی استحقاقی قابل انتقال به سال بعد" />
              <Num name="hourlyYear" label="سقف تعداد درخواست مرخصی استحقاقی ساعتی مجاز در سال" suffix="بار" />
              <Num name="hourlyMonth" label="سقف تعداد درخواست مرخصی استحقاقی ساعتی مجاز در ماه" suffix="بار" />
              <Col xs={24} md={12}><Form.Item name="minUnit" label="حداقل طول بازه درخواست مرخصی استحقاقی"><Radio.Group options={['ساعتی', 'روزانه']} /></Form.Item></Col>
              <Num name="maxLen" label="حداکثر طول بازه درخواست مرخصی استحقاقی" />
            </>) : (
              <Col span={24}><Form.Item name={['enabled', t]} valuePropName="checked" initialValue><Checkbox>امکان ثبت درخواست «{t}» توسط پرسنل</Checkbox></Form.Item></Col>
            )}
            <Num name={['after', t]} label="مهلت ثبت درخواست تا روز بعد از" />
            <Num name={['before', t]} label="مهلت ثبت درخواست تا روز قبل" />
          </Row>
        ) }))} />
        <Button type="primary" htmlType="submit">ثبت</Button>
      </Form>
    </Page>
  );
}

// ───────── گروه‌ها
export function GroupList() {
  const nav = useNavigate();
  const rows = useCollection('groups');
  const [view, setView] = useState('لیست');
  const tree = (parent) => rows.filter((g) => (g.parent || null) === parent).map((g) => ({ key: g.id, title: g.name, children: tree(g.id) }));
  return (
    <Page title="لیست گروه ها" extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => nav('/groups/add')}>گروه جدید</Button>}>
      <Segmented options={['لیست', 'سلسله‌مراتبی']} value={view} onChange={setView} style={{ marginBottom: 12 }} />
      {view === 'لیست' ? (
        <DataTable dataSource={rows} columns={[
          { title: 'نام گروه شغلی', dataIndex: 'name' },
          { title: 'گروه مرجع', dataIndex: 'parent', render: (v) => rows.find((g) => g.id === v)?.name || '—' },
          { title: 'عملیات', render: (_, r) => <RowActions onEdit={() => nav(`/groups/edit/${r.id}`)} onDelete={() => db.remove('groups', r.id)} /> },
        ]} />
      ) : <Tree defaultExpandAll treeData={tree(null)} style={{ background: 'transparent' }} />}
    </Page>
  );
}

function MemberPicker({ value = [], onChange }) {
  const people = useCollection('personnel');
  const groups = useCollection('groups');
  const [s, setS] = useState('');
  return (<>
    <Input placeholder="جستجوی پرسنل" value={s} onChange={(e) => setS(e.target.value)} style={{ maxWidth: 260, marginBottom: 8 }} />
    <DataTable rowSelection={{ selectedRowKeys: value, onChange }} dataSource={people.filter((p) => `${p.firstName} ${p.lastName} ${p.code}`.includes(s))} columns={[
      { title: 'کد پرسنلی', dataIndex: 'code' }, { title: 'نام پرسنل', render: (_, p) => `${p.firstName} ${p.lastName}` },
      { title: 'نام گروه شغلی', render: (_, p) => groups.find((g) => g.id === p.group)?.name || '—' },
    ]} />
  </>);
}

export function GroupForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { message } = App.useApp();
  const ex = id ? db.find('groups', id) : null;
  const members = db.list('personnel').filter((p) => ex && p.group === ex.id).map((p) => p.id);
  return (
    <Page title={ex ? 'ویرایش گروه' : 'گروه جدید'}>
      <Form layout="vertical" initialValues={{ ...ex, members }} onFinish={async ({ members: m = [], ...v }) => {
        const g = ex ? (await db.update('groups', id, v), { id }) : await db.add('groups', v);
        await Promise.all(m.map((pid) => db.update('personnel', pid, { group: g.id })));
        message.success('گروه ثبت شد'); nav('/groups');
      }}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="نام" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="parent" label="گروه شغلی مرجع"><CollectionSelect name="groups" placeholder="بدون مرجع" /></Form.Item></Col>
        </Row>
        <Form.Item name="members" label="پرسنل این گروه"><MemberPicker /></Form.Item>
        <Button type="primary" htmlType="submit">ثبت</Button>
      </Form>
    </Page>
  );
}

// ───────── پروژه‌ها
export function ProjectList() {
  const nav = useNavigate();
  return (
    <Page title="لیست پروژه ها" extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => nav('/project/add')}>پروژه جدید</Button>}>
      <DataTable dataSource={useCollection('projects')} columns={[
        { title: '#', render: (_, __, i) => i + 1 }, { title: 'نام', dataIndex: 'name' },
        { title: 'پرسنل', dataIndex: 'members', render: (v) => `${(v || []).length} نفر` },
        { title: 'وضعیت', dataIndex: 'status', render: (v) => <StatusTag v={v} /> },
        { title: 'عملیات', render: (_, r) => <RowActions onEdit={() => nav(`/project/edit/${r.id}`)} onDelete={() => db.remove('projects', r.id)} /> },
      ]} />
    </Page>
  );
}
export function ProjectForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { message } = App.useApp();
  const ex = id ? db.find('projects', id) : null;
  return (
    <Page title={ex ? 'ویرایش پروژه' : 'پروژه جدید'}>
      <Form layout="vertical" initialValues={{ status: 'فعال', ...ex }} onFinish={async (v) => {
        if (ex) await db.update('projects', id, v); else await db.add('projects', v);
        message.success('پروژه ثبت شد'); nav('/project/list');
      }}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="name" label="نام پروژه" rules={[{ required: true, message: 'الزامی است' }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="status" label="وضعیت"><Radio.Group options={['فعال', 'غیر فعال']} /></Form.Item></Col>
        </Row>
        <Form.Item name="members" label="پرسنل پروژه"><MemberPicker /></Form.Item>
        <Button type="primary" htmlType="submit">ثبت</Button>
      </Form>
    </Page>
  );
}

// ───────── دستگاه‌ها ← src/pages/Devices.jsx

// ───────── پنل پیامک
export function SmsPanel() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Page title="پنل پیامک" extra={<Button size="small">خرید پنل پیامکی</Button>}>
      <Tabs items={[
        { key: 'l', label: 'سرشماره پیامکی', children: (<>
          <Form form={form} layout="inline" style={{ marginBottom: 16, rowGap: 8 }} onFinish={async (v) => { await db.add('smsLines', v); form.resetFields(); message.success('سرشماره افزوده شد'); }}>
            <Form.Item name="provider" rules={[{ required: true, message: 'الزامی' }]}><Select placeholder="سرویس دهنده" style={{ width: 160 }} options={['کاوه نگار', 'ملی پیامک', 'فراز اس‌ام‌اس', 'سایر'].map((v) => ({ value: v }))} /></Form.Item>
            <Form.Item name="line" rules={[{ required: true, message: 'الزامی' }]}><Input placeholder="سرشماره" style={{ direction: 'ltr' }} /></Form.Item>
            <Form.Item name="apiKey"><Input.Password placeholder="کلید API سرویس دهنده" /></Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>افزودن سرشماره پیامکی</Button>
          </Form>
          <DataTable dataSource={useCollection('smsLines')} columns={[
            { title: '#', render: (_, __, i) => i + 1 }, { title: 'نام سرویس دهنده', dataIndex: 'provider' },
            { title: 'سرشماره', dataIndex: 'line' }, { title: 'عملیات', render: (_, r) => <RowActions onDelete={() => db.remove('smsLines', r.id)} /> },
          ]} />
        </>) },
        { key: 'r', label: 'قوانین', children: <SmsRules /> },
      ]} />
    </Page>
  );
}
function SmsRules() {
  const [rules, setRules] = useLocalSetting('smsRules', {});
  const items = ['تایید یا رد درخواست پرسنل', 'ثبت درخواست جدید (به مدیر)', 'غیبت پرسنل در روز کاری', 'فراموشی ثبت خروج', 'ارسال پیام جدید از پنل'];
  return items.map((t) => (
    <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #262626', color: '#ddd' }}>
      {t}<Switch checked={!!rules[t]} onChange={(v) => setRules({ ...rules, [t]: v })} />
    </div>
  ));
}

// ───────── وب سرویس
export function WebService() {
  const { message } = App.useApp();
  const [token, setLocalToken] = useLocalSetting('apiToken', '');
  const [shown, setShown] = useState('');
  const [list, setList] = useState([]);
  const reload = () => MODE === 'server' && api('/admin/tokens').then(setList).catch(() => {});
  useEffect(() => { reload(); }, []);
  const gen = async () => {
    if (MODE === 'server') { const r = await api('/admin/tokens', { method: 'POST', body: { name: 'وب سرویس' } }); setShown(r.token); reload(); return; }
    const a = new Uint8Array(24); crypto.getRandomValues(a); setLocalToken('arm_' + [...a].map((b) => b.toString(16).padStart(2, '0')).join(''));
  };
  const value = MODE === 'server' ? shown : token;
  return (
    <Page title="وب سرویس">
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="با وب سرویس می‌توانید داده‌های تردد و کارکرد را به نرم‌افزار حسابداری یا حقوق و دستمزد خود متصل کنید." />
      <Space wrap style={{ marginBottom: 16 }}>
        <Button icon={<ReadOutlined />}>مستندات وب سرویس</Button>
        <Button>خرید پکیج API</Button>
        <Button type="primary" icon={<KeyOutlined />} onClick={gen}>ایجاد توکن</Button>
      </Space>
      <Space.Compact style={{ width: '100%', maxWidth: 640 }}>
        <Input readOnly value={value} placeholder="توکن ایجاد شده برای شما" style={{ direction: 'ltr' }} />
        <Button icon={<CopyOutlined />} disabled={!value} onClick={() => navigator.clipboard?.writeText(value).then(() => message.success('کپی شد'))}>کپی</Button>
      </Space.Compact>
      <Typography.Paragraph style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, marginTop: 12 }}>
        {MODE === 'server' ? 'توکن کامل فقط همین یک بار نمایش داده می‌شود؛ آن را جای امنی نگه دارید.' : 'در نسخه نمایشی توکن فقط در مرورگر ساخته می‌شود.'}
      </Typography.Paragraph>
      {MODE === 'server' && (
        <DataTable dataSource={list} columns={[
          { title: 'نام', dataIndex: 'name' }, { title: 'شروع توکن', dataIndex: 'prefix', render: (v) => <code>{v}…</code> },
          { title: 'تاریخ ساخت', dataIndex: 'created_at' }, { title: 'آخرین استفاده', dataIndex: 'last_used', render: (v) => v || '—' },
          { title: 'عملیات', render: (_, r) => <RowActions onDelete={() => api(`/admin/tokens/${r.id}`, { method: 'DELETE' }).then(reload)} /> },
        ]} />
      )}
      <Card size="small" title="نمونه استفاده" style={{ marginTop: 16 }}>
        <pre style={{ direction: 'ltr', whiteSpace: 'pre-wrap', fontSize: 12, margin: 0, color: '#9fe' }}>{`GET  ${window.location.origin}/api/v1/personnel
GET  ${window.location.origin}/api/v1/attendance?from=1405/07/01&to=1405/07/30
GET  ${window.location.origin}/api/v1/performance?from=1405/07/01&to=1405/07/30
POST ${window.location.origin}/api/v1/punch   {"code":"1001","time":"08:02"}
Header:  Authorization: Bearer arm_...`}</pre>
      </Card>
    </Page>
  );
}
