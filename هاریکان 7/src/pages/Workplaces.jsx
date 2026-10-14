import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Col, Form, Input, InputNumber, Radio, Row, Select, Space, Upload, App, List, Card } from 'antd';
import { SearchOutlined, UploadOutlined, WifiOutlined, ApiOutlined, PlusOutlined } from '@ant-design/icons';
import { Page, DataTable, RowActions, StatusTag, ExcelButton } from '../components/common.jsx';
import { db, useCollection } from '../store.js';

export function WorkplaceList() {
  const nav = useNavigate();
  const rows = useCollection('workplaces');
  const [f, setF] = useState({});
  const [q, setQ] = useState({});
  const data = rows.filter((r) => (!q.name || r.name.includes(q.name)) && (!q.city || r.city?.includes(q.city)) && (!q.status || r.status === q.status));
  const columns = [
    { title: '#', render: (_, __, i) => i + 1 },
    { title: 'نام', dataIndex: 'name' },
    { title: 'شهر', dataIndex: 'city' },
    { title: 'آدرس', dataIndex: 'address' },
    { title: 'وضعیت', dataIndex: 'status', render: (v) => <StatusTag v={v} /> },
    { title: 'عملیات', render: (_, r) => <RowActions onEdit={() => nav(`/workplaces/edit/${r.id}`)} onDelete={() => db.remove('workplaces', r.id)} /> },
  ];
  return (
    <Page title="لیست محل کار">
      <div className="toolbar">
        <Input placeholder="نام" style={{ width: 160 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="شهر" style={{ width: 140 }} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <Select placeholder="وضعیت" allowClear style={{ width: 130 }} value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: 'فعال' }, { value: 'غیر فعال' }]} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => setQ(f)}>جستجو</Button>
        <span style={{ flex: 1 }} />
        <ExcelButton rows={data} columns={columns} file="workplaces" />
        <ImportExcel collection="workplaces" map={(c) => ({ name: c[0], city: c[1], address: c[2], status: 'فعال' })} />
      </div>
      <DataTable dataSource={data} columns={columns} />
    </Page>
  );
}

export function ImportExcel({ collection, map }) {
  const { message } = App.useApp();
  return (
    <Upload accept=".csv" showUploadList={false} beforeUpload={(file) => {
      file.text().then((t) => {
        const lines = t.replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean);
        lines.forEach((l) => db.add(collection, map(l.split(',').map((x) => x.replace(/^"|"$/g, '').trim()))));
        message.success(`${lines.length} ردیف وارد شد`);
      });
      return false;
    }}>
      <Button icon={<UploadOutlined />}>ورود از اکسل</Button>
    </Upload>
  );
}

export function WorkplaceForm({onSaved,wizard=false,recordId}={}) {
  const params=useParams(),id=recordId||params.id;
  const nav = useNavigate();
  const { message } = App.useApp();
  const existing = id ? db.find('workplaces', id) : null;
  const [form] = Form.useForm();
  const [wifis, setWifis] = useState(existing?.wifis || []);
  const [search, setSearch] = useState('');
  const lat = Form.useWatch('lat', form) ?? existing?.lat ?? 37.2808;
  const lng = Form.useWatch('lng', form) ?? existing?.lng ?? 49.5832;

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => { form.setFieldsValue({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); message.info('لوکیشن دریافت شد؛ برای ذخیره محل کار دکمه ثبت را بزنید'); },
    () => message.error('دسترسی به موقعیت ممکن نشد'),
  );

  const submit = async (v) => {
    if(wizard&&(!Number.isFinite(v.lat)||!Number.isFinite(v.lng)||Math.abs(v.lat)>90||Math.abs(v.lng)>180)){message.error('ابتدا موقعیت واقعی محل کار را ثبت کنید');return;}
    const row = { ...v, wifis, status: v.status || 'فعال' };
    if (existing) await db.update('workplaces', id, row); else await db.add('workplaces', row);
    message.success('محل کار ثبت شد');
    if(onSaved)onSaved();else nav('/workplaces');
  };

  return (
    <Page title={existing ? 'ویرایش محل کار' : 'افزودن محل کار'}>
      <Form form={form} layout="vertical" initialValues={{ radius: 100, shape: 'دایره', ...(wizard?{}:{lat:37.2808,lng:49.5832}), ...existing }} onFinish={submit}>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name="name" label="نام محل کار" rules={[{ required: true, message: 'الزامی است' }]}><Input placeholder="نام محل کار را وارد کنید" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="city" label="شهر"><Input placeholder="شهر را وارد کنید" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="status" label="وضعیت"><Select placeholder="فعال" options={[{ value: 'فعال' }, { value: 'غیر فعال' }]} /></Form.Item></Col>
          <Col span={24}><Form.Item name="address" label="آدرس"><Input.TextArea rows={2} placeholder="آدرس را وارد کنید" /></Form.Item></Col>
        </Row>

        <Card size="small" title="موقعیت روی نقشه" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Input placeholder="آدرس مورد نظر را تایپ کنید" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button icon={<SearchOutlined />} onClick={() => window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(search)}`, '_blank')}>جستجو</Button>
            <Button onClick={locate}>ثبت لوکیشن</Button>
          </Space.Compact>
          <iframe title="map" style={{ width: '100%', height: 280, border: 0, borderRadius: 8, filter: 'invert(.9) hue-rotate(180deg)' }}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.006},${lng + 0.01},${lat + 0.006}&layer=mapnik&marker=${lat},${lng}`} />
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={12} md={6}><Form.Item name="lat" label="عرض جغرافیایی"><InputNumber style={{ width: '100%' }} step={0.0001} placeholder="عرض جغرافیایی" /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="lng" label="طول جغرافیایی"><InputNumber style={{ width: '100%' }} step={0.0001} placeholder="طول جغرافیایی" /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="shape" label="شکل هندسی محل کار"><Radio.Group options={['دایره', 'چندضلعی']} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="radius" label="شعاع (متر):"><InputNumber min={10} max={5000} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Card>

        <Card size="small" title="روش‌های تکمیلی تایید حضور" style={{ marginBottom: 16 }}
          extra={<Space>
            <Button size="small" icon={<WifiOutlined />} onClick={() => setWifis([...wifis, { id: Date.now(), ssid: '', bssid: '' }])}>افزودن WiFi</Button>
            <Button size="small" icon={<ApiOutlined />} onClick={() => nav('/devices')}>افزودن دستگاه</Button>
          </Space>}>
          <List dataSource={wifis} locale={{ emptyText: 'WiFi ثبت نشده' }} renderItem={(w, i) => (
            <List.Item>
              <Space wrap>
                <Input placeholder="نام شبکه (SSID)" value={w.ssid} onChange={(e) => setWifis(wifis.map((x, j) => (j === i ? { ...x, ssid: e.target.value } : x)))} />
                <Input placeholder="BSSID / MAC" style={{ direction: 'ltr' }} value={w.bssid} onChange={(e) => setWifis(wifis.map((x, j) => (j === i ? { ...x, bssid: e.target.value } : x)))} />
                <Button danger type="text" onClick={() => setWifis(wifis.filter((_, j) => j !== i))}>حذف</Button>
              </Space>
            </List.Item>
          )} />
        </Card>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>ثبت</Button>
      </Form>
    </Page>
  );
}
