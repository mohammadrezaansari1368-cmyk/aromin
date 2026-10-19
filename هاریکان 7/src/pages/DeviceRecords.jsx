// منوی اصلی ← ترددهای تخلیه‌شده
// مشاهده، فیلتر، ویرایش، حذف/بازگردانی، ثبت دستی، تاریخچه، گزارش روزانه و دوره، خروجی اکسل
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, AutoComplete, Badge, Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Statistic, Tabs, Tag, Timeline, Tooltip, Typography, App } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UndoOutlined, HistoryOutlined, RollbackOutlined, SearchOutlined, DownloadOutlined, SyncOutlined, UserAddOutlined, BuildOutlined } from '@ant-design/icons';
import { Page, DataTable, Field, DateInput, dateRule, PersonSelect } from '../components/common.jsx';
import { useCollection, today, db } from '../store.js';
import { weekday } from '../../shared/core.js';
import { zk, zkAll, jdt, toJ, toG, hmText, downloadCsv, PUNCH_OPTIONS, ZK_PUNCH, isDemo } from '../zk.js';
import { ServiceStatus } from './Devices.jsx';

const monthStart = () => today().slice(0, 8) + '01';
const timeRule = { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'ساعت به شکل 08:05' };
const SOURCE = { device: <Tag color="blue">دستگاه</Tag>, manual: <Tag color="purple">دستی</Tag> };
const ACTIONS = { edit: ['blue', 'ویرایش'], delete: ['red', 'حذف'], restore: ['green', 'بازگردانی'], revert: ['gold', 'برگشت به مقدار دستگاه'], manual_add: ['purple', 'ثبت دستی'] };
const FIELD_FA = { user_id: 'کد پرسنلی', ts: 'زمان', punch: 'نوع', note: 'توضیح' };

/** کد پرسنلی ← پرسنل سامانه */
function usePeopleByCode() {
  const people = useCollection('personnel');
  return useMemo(() => {
    const m = new Map(people.map((p) => [String(p.code ?? '').trim(), p]));
    const name = (code, fallback) => { const p = m.get(String(code)); return p ? `${p.firstName} ${p.lastName}` : fallback || ''; };
    const options = people.filter((p) => p.code).map((p) => ({ value: String(p.code), label: `${p.firstName} ${p.lastName} (${p.code})` }));
    return { map: m, name, options, people };
  }, [people]);
}

function useDevices() {
  const [list, setList] = useState([]);
  useEffect(() => { zk('/devices').then(setList).catch(() => {}); }, []);
  return list;
}

const describe = (j) => { if (!j) return ''; try { const o = JSON.parse(j); return Object.entries(o).filter(([k]) => FIELD_FA[k]).map(([k, v]) => `${FIELD_FA[k]}: ${k === 'ts' ? jdt(v) : k === 'punch' ? ZK_PUNCH[v] ?? v : v}`).join('، '); } catch { return ''; } };

// ───────── فرم ثبت دستی / ویرایش
function RecordForm({ open, record, devices, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const { options } = usePeopleByCode();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(record
      ? { user_id: record.user_id, date: toJ(record.ts), time: record.ts.slice(11, 16), punch: record.punch, note: record.note }
      : { date: today(), time: '', punch: 0, note: '' });
  }, [open, record]);
  const submit = async (v) => {
    setSaving(true);
    try {
      const body = { user_id: String(v.user_id).trim(), ts: `${toG(v.date)} ${v.time}`, punch: v.punch, note: v.note || '' };
      if (record) await zk(`/attendance/${record.id}`, { method: 'PUT', body });
      else await zk('/attendance', { method: 'POST', body: { ...body, device_id: v.device_id || null } });
      message.success(record ? 'رکورد ویرایش شد؛ کارکرد همان روز دوباره محاسبه شد' : 'تردد دستی ثبت شد');
      onSaved();
    } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="ثبت" cancelText="انصراف" destroyOnClose
      title={record ? 'ویرایش تردد' : 'ثبت تردد دستی'}>
      {record?.source === 'device' && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`مقدار اصلی دستگاه: ${jdt(record.raw_ts)} — کد ${record.raw_user_id}`} description="مقدار اصلی حفظ می‌شود و هر وقت بخواهید می‌توانید به آن برگردید. این رکورد در تخلیه‌های بعدی دوباره وارد نمی‌شود." />
      )}
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="user_id" label="پرسنل (کد پرسنلی روی دستگاه)" rules={[{ required: true, message: 'الزامی است' }]}>
          <AutoComplete options={options} placeholder="جستجوی نام یا کد" filterOption={(i, o) => o.label.includes(i) || o.value.includes(i)} />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="date" label="تاریخ" rules={[{ required: true, message: 'الزامی است' }, dateRule]}><DateInput /></Form.Item></Col>
          <Col span={12}><Form.Item name="time" label="ساعت" rules={[{ required: true, message: 'الزامی است' }, timeRule]}><Input placeholder="08:05" style={{ direction: 'ltr', textAlign: 'right' }} maxLength={5} /></Form.Item></Col>
          <Col span={12}><Form.Item name="punch" label="نوع"><Select options={PUNCH_OPTIONS} /></Form.Item></Col>
          {!record && <Col span={12}><Form.Item name="device_id" label="دستگاه (اختیاری)"><Select allowClear placeholder="—" options={devices.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item></Col>}
        </Row>
        <Form.Item name="note" label="توضیح"><Input.TextArea rows={2} placeholder="مثلاً فراموشی ثبت خروج" /></Form.Item>
      </Form>
    </Modal>
  );
}

// ───────── تب رکوردها
function RecordsTab({ devices, initialDevice }) {
  const { message } = App.useApp();
  const pc = usePeopleByCode();
  const empty = { from: monthStart(), to: today(), person: undefined, device: initialDevice, source: undefined, status: 'active', q: '' };
  const [f, setF] = useState(empty);
  const [q, setQ] = useState(empty);
  const [page, setPage] = useState({ page: 1, size: 20 });
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);
  const [exporting, setExporting] = useState(false);
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));

  const query = useCallback((x = q) => ({
    date_from: x.from ? toG(x.from) : undefined, date_to: x.to ? toG(x.to) : undefined,
    user_id: x.person ? String(db.find('personnel', x.person)?.code ?? '') || undefined : undefined,
    device_id: x.device, source: x.source, status: x.status, q: x.q || undefined,
  }), [q]);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await zk('/attendance', { query: { ...query(), page: page.page, page_size: page.size } })); } catch { /* */ } finally { setLoading(false); }
  }, [query, page]);
  useEffect(() => { load(); }, [load]);

  const apply = () => {
    if ((f.from && !dateRule.pattern.test(f.from)) || (f.to && !dateRule.pattern.test(f.to))) { message.error('فرمت تاریخ: ۱۴۰۵/۰۷/۱۷'); return; }
    setPage((p) => ({ ...p, page: 1 })); setQ({ ...f });
  };
  const act = async (fn, msg) => { await fn(); message.success(msg); load(); };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const rows = await zkAll('/attendance', { ...query(), order: 'asc' });
      if (!rows.length) { message.info('داده‌ای برای خروجی وجود ندارد'); return; }
      downloadCsv(`ترددهای-دستگاه-${q.from?.replaceAll('/', '')}-${q.to?.replaceAll('/', '')}`,
        ['کد پرسنلی', 'نام', 'تاریخ', 'ساعت', 'روز هفته', 'نوع', 'دستگاه', 'منبع', 'وضعیت', 'زمان اصلی دستگاه', 'توضیح'],
        rows.map((r) => [r.user_id, pc.name(r.user_id, r.person_name), toJ(r.ts), r.ts.slice(11, 16), weekday(toJ(r.ts)), ZK_PUNCH[r.punch] ?? r.punch, r.device_name || '', r.source === 'device' ? 'دستگاه' : 'دستی',
          r.is_deleted ? 'حذف‌شده' : r.is_edited ? 'ویرایش‌شده' : 'اصلی', r.is_edited && r.raw_ts ? jdt(r.raw_ts) : '', r.note || '']));
    } finally { setExporting(false); }
  };

  const columns = [
    { title: 'کد پرسنلی', dataIndex: 'user_id', width: 90 },
    { title: 'نام', render: (_, r) => (pc.map.has(String(r.user_id)) ? pc.name(r.user_id) : <Space size={4}>{r.person_name || ''}<Tooltip title="این کد در «پرسنل» تعریف نشده و در کارکرد حساب نمی‌شود"><Tag color="orange">تعریف نشده</Tag></Tooltip></Space>) },
    { title: 'تاریخ', dataIndex: 'ts', render: (v) => toJ(v) },
    { title: 'ساعت', dataIndex: 'ts', render: (v) => <b>{v.slice(11, 16)}</b> },
    { title: 'نوع', dataIndex: 'punch', render: (v) => ZK_PUNCH[v] ?? v },
    { title: 'دستگاه', dataIndex: 'device_name', render: (v) => v || '—' },
    { title: 'منبع', dataIndex: 'source', render: (v) => SOURCE[v] || v },
    { title: 'وضعیت', render: (_, r) => (r.is_deleted ? <Tag color="red">حذف‌شده</Tag> : r.is_edited ? <Tooltip title={`مقدار اصلی دستگاه: ${jdt(r.raw_ts)} — کد ${r.raw_user_id}`}><Tag color="gold">ویرایش‌شده</Tag></Tooltip> : <Tag>اصلی</Tag>) },
    { title: 'توضیح', dataIndex: 'note', render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: 'عملیات', fixed: 'left', render: (_, r) => (
      <Space size={0}>
        {!r.is_deleted && <Tooltip title="ویرایش"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEdit(r)} /></Tooltip>}
        {r.is_edited && r.source === 'device' && !r.is_deleted ? (
          <Popconfirm title="به مقدار اصلی دستگاه برگردد؟" okText="بله" cancelText="خیر" onConfirm={() => act(() => zk(`/attendance/${r.id}/revert`, { method: 'POST' }), 'به مقدار دستگاه برگشت')}>
            <Tooltip title="برگشت به مقدار دستگاه"><Button size="small" type="text" icon={<RollbackOutlined />} /></Tooltip>
          </Popconfirm>
        ) : null}
        {r.is_deleted ? (
          <Tooltip title="بازگردانی"><Button size="small" type="text" icon={<UndoOutlined />} onClick={() => act(() => zk(`/attendance/${r.id}/restore`, { method: 'POST' }), 'رکورد بازگردانده شد')} /></Tooltip>
        ) : (
          <Popconfirm title="این تردد حذف شود؟" description="از کارکرد کسر می‌شود؛ قابل بازگردانی است و از دستگاه پاک نمی‌شود." okText="حذف" cancelText="انصراف" onConfirm={() => act(() => zk(`/attendance/${r.id}`, { method: 'DELETE' }), 'رکورد حذف شد')}>
            <Tooltip title="حذف"><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        )}
        <Tooltip title="تاریخچه تغییرات"><Button size="small" type="text" icon={<HistoryOutlined />} onClick={async () => setHist({ r, items: await zk(`/attendance/${r.id}/history`) })} /></Tooltip>
      </Space>
    ) },
  ];

  return (<>
    <div className="toolbar">
      <Field label="از تاریخ" w={140}><DateInput value={f.from} onChange={set('from')} /></Field>
      <Field label="تا تاریخ" w={140}><DateInput value={f.to} onChange={set('to')} /></Field>
      <Field label="پرسنل"><PersonSelect value={f.person} onChange={set('person')} /></Field>
      <Field label="دستگاه" w={150}><Select allowClear placeholder="همه" value={f.device} onChange={set('device')} options={devices.map((d) => ({ value: d.id, label: d.name }))} /></Field>
      <Field label="منبع" w={110}><Select allowClear placeholder="همه" value={f.source} onChange={set('source')} options={[{ value: 'device', label: 'دستگاه' }, { value: 'manual', label: 'دستی' }]} /></Field>
      <Field label="وضعیت" w={130}><Select value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'فعال' }, { value: 'edited', label: 'ویرایش‌شده' }, { value: 'deleted', label: 'حذف‌شده' }, { value: 'all', label: 'همه' }]} /></Field>
      <Field label="جستجو" w={140}><Input allowClear value={f.q} onChange={set('q')} onPressEnter={apply} placeholder="کد، نام، توضیح" /></Field>
      <Button type="primary" icon={<SearchOutlined />} onClick={apply}>نمایش</Button>
    </div>
    <Space wrap style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
      <Typography.Text type="secondary">{data.total} رکورد</Typography.Text>
      <Space wrap>
        <Button icon={<PlusOutlined />} onClick={() => setEdit({})}>ثبت دستی</Button>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportExcel}>خروجی اکسل</Button>
      </Space>
    </Space>
    <DataTable loading={loading} dataSource={data.items} columns={columns}
      rowClassName={(r) => (r.is_deleted ? 'row-deleted' : '')}
      pagination={{ current: page.page, pageSize: page.size, total: data.total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], onChange: (p, s) => setPage({ page: p, size: s }) }} />

    <RecordForm open={!!edit} record={edit?.id ? edit : null} devices={devices} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    <Modal open={!!hist} onCancel={() => setHist(null)} footer={null} title={hist && `تاریخچه رکورد ${hist.r.user_id} — ${jdt(hist.r.ts)}`}>
      {hist && (hist.items.length ? (
        <Timeline style={{ marginTop: 16 }} items={hist.items.map((h) => ({
          color: ACTIONS[h.action]?.[0] || 'gray',
          children: <div><b>{ACTIONS[h.action]?.[1] || h.action}</b> <Typography.Text type="secondary" style={{ fontSize: 12 }}>{jdt(h.at)} — {decodeURIComponent(h.actor || '')}</Typography.Text>
            {h.before_json && <div style={{ fontSize: 12 }}>قبل: {describe(h.before_json)}</div>}
            {h.after_json && h.action !== 'manual_add' && <div style={{ fontSize: 12 }}>بعد: {describe(h.after_json)}</div>}</div>,
        }))} />
      ) : <Typography.Text type="secondary">این رکورد تغییری نداشته و همان مقدار دستگاه است ({jdt(hist.r.raw_ts || hist.r.ts)}).</Typography.Text>)}
    </Modal>
  </>);
}

// ───────── تب گزارش‌ها
function ReportTab({ kind, devices }) {
  const pc = usePeopleByCode();
  const [f, setF] = useState({ from: monthStart(), to: today(), person: undefined, device: undefined });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));
  const run = async () => {
    setLoading(true);
    try {
      const code = f.person ? String(db.find('personnel', f.person)?.code ?? '') : undefined;
      const r = await zk(`/reports/${kind}`, { query: { date_from: toG(f.from), date_to: toG(f.to), device_id: f.device, ...(kind === 'daily' ? { user_id: code } : {}) } });
      setRows((kind === 'summary' && code ? r.filter((x) => x.user_id === code) : r).map((x, i) => ({ ...x, key: i, name: pc.name(x.user_id, x.name) })));
    } finally { setLoading(false); }
  };
  useEffect(() => { run(); }, []);

  const daily = [
    { title: 'تاریخ', dataIndex: 'date', render: (v) => toJ(v), x: (r) => toJ(r.date) },
    { title: 'کد پرسنلی', dataIndex: 'user_id' }, { title: 'نام', dataIndex: 'name' },
    { title: 'اولین ورود', dataIndex: 'first_in' }, { title: 'آخرین خروج', dataIndex: 'last_out', render: (v) => v || '—' },
    { title: 'تعداد ثبت', dataIndex: 'punches' }, { title: 'همه ساعت‌ها', dataIndex: 'times', render: (v) => <span style={{ fontSize: 12 }}>{v.join(' · ')}</span>, x: (r) => r.times.join(' ') },
    { title: 'کارکرد', dataIndex: 'worked_min', render: hmText, x: (r) => hmText(r.worked_min) },
    { title: 'اختلاف با ۷:۳۰', dataIndex: 'diff_min', render: (v, r) => (r.incomplete ? '—' : <span style={{ color: v < 0 ? '#ff7875' : '#95de64' }}>{hmText(v)}</span>), x: (r) => (r.incomplete ? '' : hmText(r.diff_min)) },
    { title: 'وضعیت', dataIndex: 'incomplete', render: (v) => (v ? <Tag color="orange">ناقص</Tag> : <Tag color="green">کامل</Tag>), x: (r) => (r.incomplete ? 'ناقص' : 'کامل') },
  ];
  const summary = [
    { title: 'کد پرسنلی', dataIndex: 'user_id' }, { title: 'نام', dataIndex: 'name' }, { title: 'روزهای حضور', dataIndex: 'days' },
    { title: 'کارکرد کل', dataIndex: 'worked_min', render: hmText, x: (r) => hmText(r.worked_min) },
    { title: 'میانگین روزانه', dataIndex: 'avg_min', render: hmText, x: (r) => hmText(r.avg_min) },
    { title: 'کسرکار', dataIndex: 'shortfall_min', render: (v) => <span style={{ color: v ? '#ff7875' : undefined }}>{hmText(v)}</span>, x: (r) => hmText(r.shortfall_min) },
    { title: 'اضافه‌کار', dataIndex: 'overtime_min', render: (v) => <span style={{ color: v ? '#95de64' : undefined }}>{hmText(v)}</span>, x: (r) => hmText(r.overtime_min) },
    { title: 'روزهای ناقص', dataIndex: 'incomplete_days' },
  ];
  const cols = kind === 'daily' ? daily : summary;
  const total = rows ? rows.reduce((s, r) => s + r.worked_min, 0) : 0;
  return (<>
    <div className="toolbar">
      <Field label="از تاریخ" w={140}><DateInput value={f.from} onChange={set('from')} /></Field>
      <Field label="تا تاریخ" w={140}><DateInput value={f.to} onChange={set('to')} /></Field>
      <Field label="پرسنل"><PersonSelect value={f.person} onChange={set('person')} /></Field>
      <Field label="دستگاه" w={150}><Select allowClear placeholder="همه" value={f.device} onChange={set('device')} options={devices.map((d) => ({ value: d.id, label: d.name }))} /></Field>
      <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={run}>نمایش</Button>
      <Button icon={<DownloadOutlined />} disabled={!rows?.length} onClick={() => downloadCsv(`${kind === 'daily' ? 'گزارش-روزانه' : 'خلاصه-دوره'}-دستگاه`, cols.map((c) => c.title), rows.map((r) => cols.map((c) => (c.x ? c.x(r) : r[c.dataIndex]))))}>خروجی اکسل</Button>
    </div>
    {rows && kind === 'summary' && (
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="پرسنل" value={rows.length} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="جمع کارکرد" value={hmText(total)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="جمع کسرکار" value={hmText(rows.reduce((s, r) => s + r.shortfall_min, 0))} valueStyle={{ color: '#ff7875' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="روزهای ناقص" value={rows.reduce((s, r) => s + r.incomplete_days, 0)} /></Card></Col>
      </Row>
    )}
    <DataTable loading={loading} rowKey="key" dataSource={rows || []} columns={cols} />
    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
      این گزارش مستقیم از ثبت‌های دستگاه و با موظفی ثابت ۷:۳۰ محاسبه می‌شود. گزارش «کارکرد» در منوی گزارشات، همین ترددها را با شیفت، تعطیلات و مرخصی هر نفر حساب می‌کند.
    </Typography.Paragraph>
  </>);
}

// ───────── تب پرسنل دستگاه
function PeopleTab() {
  const { message } = App.useApp();
  const nav = useNavigate();
  const pc = usePeopleByCode();
  const [rows, setRows] = useState([]);
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => { zk('/people').then(setRows).catch(() => {}); zk('/status').then(setSt).catch(() => {}); };
  useEffect(load, []);
  const unmatched = rows.filter((r) => !pc.map.has(String(r.user_id))).length;
  return (<>
    <Alert type={unmatched ? 'warning' : 'success'} showIcon style={{ marginBottom: 12 }}
      message={unmatched ? `${unmatched} کد روی دستگاه به پرسنلی وصل نیست` : 'همه کدهای دستگاه به پرسنل سامانه وصل هستند'}
      description="کد کاربر روی دستگاه باید با «کد پرسنلی» در فرم پرسنل یکی باشد. وقتی پرسنل را با همان کد تعریف کنید، ترددهای قبلی‌اش خودکار به کارکرد اضافه می‌شود." />
    <DataTable rowKey="user_id" dataSource={rows} columns={[
      { title: 'کد روی دستگاه', dataIndex: 'user_id' },
      { title: 'نام روی دستگاه', dataIndex: 'name', render: (v) => v || '—' },
      { title: 'پرسنل سامانه', render: (_, r) => (pc.map.has(String(r.user_id)) ? <Badge status="success" text={pc.name(r.user_id)} />
        : <Button size="small" icon={<UserAddOutlined />} onClick={() => nav(`/personnel/new?code=${encodeURIComponent(r.user_id)}`)}>تعریف پرسنل با این کد</Button>) },
      { title: 'آخرین تردد', dataIndex: 'last_ts', render: jdt },
    ]} />
    <Card size="small" style={{ marginTop: 16 }} title="انتقال به کارکرد">
      <Space wrap align="center">
        {st?.bridge && <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {st.bridge.mirrored} رکورد فعال · آخرین بروزرسانی: {st.bridge.lastPullAt ? new Date(st.bridge.lastPullAt).toLocaleTimeString('fa-IR') : '—'}
          {st.bridge.lastError && <Tag color="red" style={{ marginInlineStart: 8 }}>{st.bridge.lastError}</Tag>}
        </Typography.Text>}
        <Popconfirm title="ردیف‌های کارکرد دستگاه از نو ساخته شوند؟" description="ثبت‌های اپلیکیشن و دستی پنل دست نمی‌خورند." okText="بله" cancelText="خیر"
          onConfirm={async () => { setBusy(true); try { await zk('/rebuild', { method: 'POST' }); message.success('کارکرد از ترددهای دستگاه بازسازی شد'); load(); } finally { setBusy(false); } }}>
          <Button icon={<BuildOutlined />} loading={busy}>بازسازی کارکرد</Button>
        </Popconfirm>
      </Space>
    </Card>
  </>);
}

export function DeviceRecords() {
  const { message } = App.useApp();
  const [sp] = useSearchParams();
  const devices = useDevices();
  const [syncing, setSyncing] = useState(false);
  const [key, setKey] = useState(0);
  const initialDevice = sp.get('device') ? +sp.get('device') : undefined;
  const syncAll = async () => {
    setSyncing(true);
    try {
      const out = await zk('/sync-all', { method: 'POST' });
      const ins = out.reduce((s, r) => s + (r.inserted || 0), 0); const errs = out.filter((r) => r.status === 'error');
      if (!out.length) message.info('دستگاه فعالی ثبت نشده است');
      else (errs.length ? message.warning : message.success)(`${ins} رکورد جدید از ${out.length} دستگاه${errs.length ? ` — ${errs.length} دستگاه خطا داد` : ''}`);
      setKey((k) => k + 1);
    } finally { setSyncing(false); }
  };
  return (
    <Page title="ترددهای تخلیه‌شده" extra={<Button size="small" type="primary" icon={<SyncOutlined />} loading={syncing} onClick={syncAll}>تخلیه همه دستگاه‌ها</Button>}>
      <ServiceStatus />
      {isDemo && !devices.length && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="ابتدا از «تنظیمات کسب و کار ← دستگاه ها» یک دستگاه اضافه و تخلیه کنید." />}
      <Tabs key={key} destroyInactiveTabPane items={[
        { key: 'r', label: 'رکوردها', children: <RecordsTab devices={devices} initialDevice={initialDevice} /> },
        { key: 'd', label: 'گزارش روزانه', children: <ReportTab kind="daily" devices={devices} /> },
        { key: 's', label: 'خلاصه دوره', children: <ReportTab kind="summary" devices={devices} /> },
        { key: 'p', label: 'پرسنل دستگاه', children: <PeopleTab /> },
      ]} />
    </Page>
  );
}
