import { useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Switch, Tabs, App, Popconfirm } from 'antd';
import { PlusOutlined, FilterOutlined, CheckOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import { Page, DataTable, Field, DateInput, dateRule, PersonSelect, CollectionSelect, ExcelButton } from '../components/common.jsx';
import { db, useCollection, personName, today } from '../store.js';

const STATUSES = ['در دست بررسی', 'تایید شده', 'رد شده'];

export function Requests() {
  const { message } = App.useApp();
  const reqs = useCollection('requests');
  const types = useCollection('requestTypes').filter((t) => t.active);
  const [tab, setTab] = useState(STATUSES[0]);
  const [f, setF] = useState({}); const [q, setQ] = useState({});
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const data = reqs.filter((r) => r.status === tab && (!q.from || r.from >= q.from) && (!q.to || r.from <= q.to) && (!q.kind || r.kind === q.kind)
    && (!q.person || r.person === q.person) && (!q.group || db.find('personnel', r.person)?.group === q.group));
  const columns = [
    { title: 'نام پرسنل', dataIndex: 'person', render: personName, exportValue: (r) => personName(r.person) },
    { title: 'نوع درخواست', dataIndex: 'kind' },
    { title: 'زمان شروع', dataIndex: 'from', render: (v, r) => `${v}${r.fromTime ? ' ' + r.fromTime : ''}` },
    { title: 'زمان پایان', dataIndex: 'to', render: (v, r) => `${v || r.from}${r.toTime ? ' ' + r.toTime : ''}` },
    { title: 'تاریخ ثبت', dataIndex: 'createdAt' },
    { title: 'توضیحات', dataIndex: 'note', render: (v) => v || '—' },
    { title: 'عملیات', render: (_, r) => (
      <Space>
        {r.status !== 'تایید شده' && <Button size="small" type="text" style={{ color: '#49aa19' }} icon={<CheckOutlined />} onClick={async () => { await db.update('requests', r.id, { status: 'تایید شده' }); message.success('تایید شد'); }} />}
        {r.status !== 'رد شده' && <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={async () => { await db.update('requests', r.id, { status: 'رد شده' }); message.info('رد شد'); }} />}
        <Popconfirm title="حذف شود؟" okText="بله" cancelText="خیر" onConfirm={() => db.remove('requests', r.id)}><Button size="small" type="text" icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    ) },
  ];

  const submit = async (v) => { await db.add('requests', { ...v, status: 'در دست بررسی' }); setOpen(false); form.resetFields(); setTab(STATUSES[0]); message.success('درخواست ثبت شد'); };

  return (
    <Page title="درخواست ها" extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>ثبت درخواست جدید</Button>}>
      <div className="toolbar">
        <Field label="از تاریخ"><DateInput value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="تا تاریخ"><DateInput value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="نوع"><Select allowClear placeholder="همه" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={types.map((t) => ({ value: t.name }))} /></Field>
        <Field label="گروه"><CollectionSelect name="groups" placeholder="همه" value={f.group} onChange={(v) => setF({ ...f, group: v })} /></Field>
        <Field label="پرسنل"><PersonSelect value={f.person} onChange={(v) => setF({ ...f, person: v })} /></Field>
        <Button type="primary" icon={<FilterOutlined />} onClick={() => setQ(f)}>فیلتر</Button>
        <ExcelButton rows={data} columns={columns} file="requests" />
      </div>
      <Tabs activeKey={tab} onChange={setTab} items={STATUSES.map((s) => ({ key: s, label: `${s} (${reqs.filter((r) => r.status === s).length})` }))} />
      <DataTable dataSource={data} columns={columns} />

      <Modal title="ثبت درخواست جدید" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="ثبت" cancelText="انصراف">
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ from: today() }}>
          <Form.Item name="person" label="پرسنل" rules={[{ required: true, message: 'الزامی است' }]}><PersonSelect placeholder="انتخاب پرسنل" /></Form.Item>
          <Form.Item name="kind" label="نوع درخواست" rules={[{ required: true, message: 'الزامی است' }]}><Select options={types.map((t) => ({ value: t.name }))} /></Form.Item>
          <Space wrap>
            <Form.Item name="from" label="از تاریخ" rules={[{ required: true, message: 'الزامی است' }, dateRule]}><DateInput /></Form.Item>
            <Form.Item name="to" label="تا تاریخ" rules={[dateRule]}><DateInput /></Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="fromTime" label="از ساعت (برای درخواست ساعتی)"><Input placeholder="08:00" style={{ direction: 'ltr' }} /></Form.Item>
            <Form.Item name="toTime" label="تا ساعت"><Input placeholder="10:00" style={{ direction: 'ltr' }} /></Form.Item>
          </Space>
          <Form.Item name="note" label="توضیحات"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Page>
  );
}

const CATS = ['مرخصی', 'ماموریت', 'اضافه کار', 'تردد', 'سایر'];
export function RequestSettings() {
  const rows = useCollection('requestTypes');
  const [cat, setCat] = useState(CATS[0]);
  const [name, setName] = useState('');
  return (
    <Page title="تنظیمات درخواست">
      <Tabs activeKey={cat} onChange={setCat} items={CATS.map((c) => ({ key: c, label: c }))} />
      <div className="toolbar">
        <Input placeholder="نام نوع درخواست جدید" style={{ width: 240 }} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { if (name.trim()) { db.add('requestTypes', { cat, name, active: true }); setName(''); } }}>افزودن</Button>
      </div>
      <DataTable dataSource={rows.filter((r) => r.cat === cat)} columns={[
        { title: 'نام', dataIndex: 'name' },
        { title: 'وضعیت', render: (_, r) => <Switch checked={r.active} onChange={(v) => db.update('requestTypes', r.id, { active: v })} checkedChildren="فعال" unCheckedChildren="غیرفعال" /> },
        { title: 'عملیات', render: (_, r) => <Popconfirm title="حذف شود؟" okText="بله" cancelText="خیر" onConfirm={() => db.remove('requestTypes', r.id)}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm> },
      ]} />
    </Page>
  );
}
