// تنظیمات کسب و کار ← دستگاه‌ها
// افزودن/ویرایش دستگاه ZKTeco (TCP 4370)، تست اتصال، تخلیه خودکار با بازه دلخواه و «تخلیه الان»
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Descriptions, Divider, Form, Input, InputNumber, Modal, Popconfirm, Row, Space, Switch, Tag, Tooltip, Typography, App } from 'antd';
import { PlusOutlined, CloudDownloadOutlined, ApiOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SyncOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Page, DataTable, CollectionSelect } from '../components/common.jsx';
import { useCollection } from '../store.js';
import { zk, jdt, isDemo } from '../zk.js';

const PRESETS = [5, 10, 15, 30, 60, 120];
const STATUS = { ok: ['green', 'موفق'], skipped: ['blue', 'بدون رکورد جدید'], error: ['red', 'خطا'], running: ['gold', 'در حال تخلیه'], busy: ['gold', 'در حال اجرا'] };
export const SyncTag = ({ s, err }) => {
  if (!s) return <Tag>تخلیه نشده</Tag>;
  const [c, l] = STATUS[s] || ['default', s];
  const tag = <Tag color={c}>{l}</Tag>;
  return err ? <Tooltip title={err}>{tag}</Tooltip> : tag;
};

/** وضعیت اتصال پنل به سرویس دستگاه */
export function ServiceStatus({ onStatus }) {
  const [st, setSt] = useState(null);
  useEffect(() => { zk('/status').then((s) => { setSt(s); onStatus?.(s); }).catch(() => setSt({ error: 'ارتباط با سرور برقرار نشد' })); }, []);
  if (!st) return null;
  if (st.demo) return <Alert type="info" showIcon style={{ marginBottom: 12 }} message="نسخه نمایشی: دستگاه شبیه‌سازی‌شده است. هر آی‌پی معتبری وصل می‌شود؛ آی‌پی‌های 10.255.x.x خطای اتصال می‌دهند." />;
  if (!st.configured) return <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="سرویس تخلیه دستگاه تنظیم نشده است" description="دستگاه فیزیکی به رابطی در شبکه محل کار نیاز دارد. تنظیمات دستگاه ذخیره می‌شوند، اما اتصال و تخلیه تا فعال‌سازی رابط انجام نمی‌شود." />;
  if (st.error) return <Alert type="error" showIcon style={{ marginBottom: 12 }} message="سرویس تخلیه دستگاه در دسترس نیست" description={st.error} />;
  if (st.bridge?.lastError) return <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="انتقال ترددها به کارکرد با خطا روبه‌رو شد" description={st.bridge.lastError} />;
  return null;
}

function DeviceForm({ open, device, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);
  const [saving, setSaving] = useState(false);
  const auto = Form.useWatch('auto_sync', form);
  useEffect(() => {
    if (!open) return;
    setTest(null);
    form.resetFields();
    form.setFieldsValue(device || { port: 4370, comm_password: 0, timeout_sec: 10, auto_sync: true, interval_min: 5, active: true, disable_during_read: false });
  }, [open, device]);

  const runTest = async () => {
    const v = await form.validateFields(['ip', 'port', 'comm_password', 'timeout_sec']);
    setTesting(true); setTest(null);
    try { setTest(await zk('/devices/test', { method: 'POST', body: { ...v, port: v.port || 4370 } })); } finally { setTesting(false); }
  };
  const submit = async (v) => {
    setSaving(true);
    try {
      const body = { ...v, location: v.location || '' };
      const saved = device ? await zk(`/devices/${device.id}`, { method: 'PUT', body }) : await zk('/devices', { method: 'POST', body });
      message.success(device ? 'دستگاه ویرایش شد' : 'دستگاه ثبت شد'); onSaved(saved);
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} width={680} title={device ? 'ویرایش دستگاه حضور و غیاب' : 'افزودن دستگاه حضور و غیاب'} destroyOnClose
      footer={<Space>
        <Button icon={<ApiOutlined />} loading={testing} onClick={runTest}>تست اتصال</Button>
        <Button onClick={onClose}>انصراف</Button>
        <Button type="primary" loading={saving} onClick={() => form.submit()}>ثبت</Button>
      </Space>}>
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Row gutter={12}>
          <Col xs={24} md={12}><Form.Item name="name" label="نام دستگاه" rules={[{ required: true, message: 'الزامی است' }]}><Input placeholder="مثلاً ورودی دفتر مرکزی" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="location" label="محل کار"><CollectionSelect name="workplaces" placeholder="انتخاب محل کار" /></Form.Item></Col>
          <Col xs={24} md={10}><Form.Item name="ip" label="آی‌پی دستگاه" rules={[{ required: true, message: 'الزامی است' }, { pattern: /^[\w.-]+$/, message: 'آی‌پی یا نام میزبان نامعتبر' }]}><Input style={{ direction: 'ltr' }} placeholder="192.168.1.201" /></Form.Item></Col>
          <Col xs={12} md={5}><Form.Item name="port" label="پورت"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={9}><Form.Item name="comm_password" label="رمز ارتباطی (Comm Key)" tooltip="همان عدد تنظیم‌شده در منوی Comm دستگاه؛ اگر رمز ندارد ۰ بگذارید"><InputNumber min={0} max={999999} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>

        {test && (test.ok ? (
          <Alert type="success" showIcon style={{ marginBottom: 12 }} message={`اتصال برقرار شد (${test.latency_ms} میلی‌ثانیه)`} description={
            <Descriptions size="small" column={{ xs: 1, md: 2 }} items={[
              { key: 1, label: 'مدل', children: test.device_name || '—' }, { key: 2, label: 'سریال', children: test.serial_number || '—' },
              { key: 3, label: 'فریم‌ور', children: test.firmware || '—' }, { key: 4, label: 'ساعت دستگاه', children: jdt(test.device_time) },
              { key: 5, label: 'تعداد رکورد', children: test.record_count ?? '—' }, { key: 6, label: 'تعداد کاربر', children: test.user_count ?? '—' },
            ]} />} />
        ) : <Alert type="error" showIcon style={{ marginBottom: 12 }} message="اتصال برقرار نشد" description={test.error} />)}

        <Divider orientation="right" plain style={{ margin: '4px 0 12px' }}>تخلیه خودکار</Divider>
        <Row gutter={12} align="middle">
          <Col xs={24} md={8}><Form.Item name="auto_sync" label="تخلیه خودکار" valuePropName="checked"><Switch checkedChildren="روشن" unCheckedChildren="خاموش" /></Form.Item></Col>
          <Col xs={24} md={16}>
            <Form.Item label="هر چند دقیقه" style={{ marginBottom: 4 }}>
              <Space wrap>
                <Form.Item name="interval_min" noStyle rules={[{ required: true, message: 'الزامی است' }]}><InputNumber min={1} max={1440} disabled={!auto} addonAfter="دقیقه" style={{ width: 150 }} /></Form.Item>
                {PRESETS.map((m) => <Button key={m} size="small" disabled={!auto} onClick={() => form.setFieldValue('interval_min', m)}>{m}</Button>)}
              </Space>
            </Form.Item>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>هر عددی بین ۱ تا ۱۴۴۰ دقیقه (مثلاً ۵ یا ۱۰۹)</Typography.Text>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col xs={12} md={8}><Form.Item name="timeout_sec" label="مهلت اتصال"><InputNumber min={2} max={120} addonAfter="ثانیه" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="active" label="وضعیت" valuePropName="checked"><Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="disable_during_read" label="قفل صفحه دستگاه حین خواندن" valuePropName="checked" tooltip="چند ثانیه حین تخلیه کسی نتواند انگشت بزند؛ معمولاً لازم نیست"><Switch /></Form.Item></Col>
        </Row>
      </Form>
      <Alert type="info" showIcon message="رکوردها فقط خوانده می‌شوند و هیچ‌وقت از حافظه دستگاه پاک نمی‌شوند؛ رکوردهایی که قبلاً تخلیه شده‌اند دوباره ثبت نمی‌شوند." />
    </Modal>
  );
}

export function Devices() {
  const { message } = App.useApp();
  const nav = useNavigate();
  const wps = useCollection('workplaces');
  const [rows, setRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // null بسته | {} جدید | device
  const [busy, setBusy] = useState({});
  const [ready, setReady] = useState(true);

  const load = useCallback(async () => {
    try { const [d, r] = await Promise.all([zk('/devices'), zk('/sync-runs', { query: { limit: 30 } })]); setRows(d); setRuns(r); } catch { /* پیام نمایش داده شده */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!ready) return undefined; load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load, ready]);

  const syncNow = async (d) => {
    setBusy((b) => ({ ...b, [d.id]: 'sync' }));
    try {
      const r = await zk(`/devices/${d.id}/sync`, { method: 'POST' });
      if (r.status === 'ok') message.success(`«${d.name}»: ${r.message}`);
      else if (r.status === 'skipped' || r.status === 'busy') message.info(r.message);
      else message.error(`«${d.name}»: ${r.message}`);
    } finally { setBusy((b) => ({ ...b, [d.id]: null })); load(); }
  };
  const testDev = async (d) => {
    setBusy((b) => ({ ...b, [d.id]: 'test' }));
    try {
      const r = await zk(`/devices/${d.id}/test`, { method: 'POST' });
      if (r.ok) message.success(`اتصال برقرار است — ${r.record_count ?? '?'} رکورد، ${r.user_count ?? '?'} کاربر (${r.latency_ms} ms)`);
      else message.error(`اتصال برقرار نشد: ${r.error}`);
    } finally { setBusy((b) => ({ ...b, [d.id]: null })); }
  };
  const syncAll = async () => {
    setBusy((b) => ({ ...b, all: true }));
    try {
      const out = await zk('/sync-all', { method: 'POST' });
      const ins = out.reduce((s, r) => s + (r.inserted || 0), 0); const errs = out.filter((r) => r.status === 'error').length;
      (errs ? message.warning : message.success)(`تخلیه ${out.length} دستگاه: ${ins} رکورد جدید${errs ? `، ${errs} خطا` : ''}`);
    } finally { setBusy((b) => ({ ...b, all: false })); load(); }
  };
  const wpName = (v) => wps.find((w) => w.id === v)?.name || v || '—';

  return (
    <Page title="دستگاه ها" extra={<Space>
      <Button size="small" icon={<SyncOutlined />} loading={busy.all} onClick={syncAll} disabled={!rows.length} className="hide-sm">تخلیه همه</Button>
      <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setEdit({})}>افزودن دستگاه</Button>
    </Space>}>
      <ServiceStatus onStatus={(s) => setReady(s.demo || (s.configured && !s.error))} />
      <DataTable loading={loading} dataSource={rows} pagination={false} columns={[
        { title: 'نام دستگاه', dataIndex: 'name', render: (v, d) => <Space direction="vertical" size={0}><b>{v}</b>{d.serial_number && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{d.device_name} · {d.serial_number}</Typography.Text>}</Space> },
        { title: 'محل کار', dataIndex: 'location', render: wpName },
        { title: 'آدرس', render: (_, d) => <code style={{ direction: 'ltr', display: 'inline-block' }}>{d.ip}:{d.port}</code> },
        { title: 'تخلیه خودکار', render: (_, d) => (!d.active ? <Tag>غیرفعال</Tag> : d.auto_sync ? <Tag color="purple">هر {d.interval_min} دقیقه</Tag> : <Tag>دستی</Tag>) },
        { title: 'آخرین تخلیه', render: (_, d) => <Space direction="vertical" size={2}>{d.running ? <SyncTag s="running" /> : <SyncTag s={d.last_status} err={d.last_error} />}<span style={{ fontSize: 12 }}>{jdt(d.last_sync_at)}</span></Space> },
        { title: 'تخلیه بعدی', dataIndex: 'next_run_at', render: (v) => <span style={{ fontSize: 12 }}>{jdt(v)}</span> },
        { title: 'رکوردهای تخلیه‌شده', dataIndex: 'record_total', render: (v, d) => <span>{v ?? 0}{d.last_record_count != null && <Typography.Text type="secondary" style={{ fontSize: 11 }}> (روی دستگاه: {d.last_record_count})</Typography.Text>}</span> },
        { title: 'عملیات', fixed: 'left', render: (_, d) => (
          <Space size={4}>
            <Button size="small" type="primary" icon={<CloudDownloadOutlined />} loading={busy[d.id] === 'sync' || d.running} onClick={() => syncNow(d)}>تخلیه الان</Button>
            <Tooltip title="تست اتصال"><Button size="small" type="text" icon={<ApiOutlined />} loading={busy[d.id] === 'test'} onClick={() => testDev(d)} /></Tooltip>
            <Tooltip title="ترددهای این دستگاه"><Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => nav(`/device-records?device=${d.id}`)} /></Tooltip>
            <Tooltip title="ویرایش"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEdit(d)} /></Tooltip>
            <Popconfirm title="دستگاه از فهرست حذف شود؟" description="رکوردهای تخلیه‌شده و کارکرد پرسنل باقی می‌مانند." okText="حذف" cancelText="انصراف"
              onConfirm={async () => { await zk(`/devices/${d.id}`, { method: 'DELETE' }); message.success('دستگاه حذف شد'); load(); }}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ) },
      ]} />

      <Card size="small" style={{ marginTop: 16 }} title="سابقه تخلیه" extra={<Button size="small" type="text" icon={<ReloadOutlined />} onClick={load} />}>
        <DataTable dataSource={runs} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
          { title: 'زمان', dataIndex: 'started_at', render: jdt },
          { title: 'دستگاه', dataIndex: 'device_name', render: (v) => v || '—' },
          { title: 'نوع', dataIndex: 'trigger', render: (v) => (v === 'auto' ? 'خودکار' : 'دستی') },
          { title: 'وضعیت', dataIndex: 'status', render: (v, r) => <SyncTag s={v} err={r.status === 'error' ? r.message : null} /> },
          { title: 'رکورد دستگاه', dataIndex: 'device_count', render: (v) => v ?? '—' },
          { title: 'جدید', dataIndex: 'inserted', render: (v) => <b style={{ color: v ? '#52c41a' : undefined }}>{v ?? 0}</b> },
          { title: 'تکراری (رد شده)', dataIndex: 'duplicates', render: (v) => v ?? 0 },
          { title: 'مدت', dataIndex: 'duration_ms', render: (v) => (v != null ? `${(v / 1000).toFixed(1)} ث` : '—') },
          { title: 'پیام', dataIndex: 'message', render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
        ]} />
      </Card>

      {!isDemo && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
          دستگاه باید از سرور قابل دسترسی باشد (پورت 4370). اگر سرور در فضای ابری است، پورت را روی مودم دفتر فقط برای IP سرور باز کنید یا از VPN استفاده کنید.
        </Typography.Paragraph>
      )}

      <DeviceForm open={!!edit} device={edit?.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </Page>
  );
}
