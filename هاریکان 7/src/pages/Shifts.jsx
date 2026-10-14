import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Checkbox, Col, Input, InputNumber, Row, Select, Space, Switch, Table, TimePicker, App, Steps, Alert } from 'antd';
import { SearchOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Page, DataTable, RowActions, WEEKDAYS, MONTHS, Field } from '../components/common.jsx';
import { db, useCollection } from '../store.js';
import AdvancedShifts from './AdvancedShifts.jsx';

export function ShiftEditor(){
  const {id}=useParams();
  return db.find('shifts',id)?.advanced ? <AdvancedShifts/> : <ShiftForm/>;
}

export function ShiftList() {
  const nav = useNavigate();
  const rows = useCollection('shifts');
  const [f, setF] = useState(''); const [q, setQ] = useState('');
  const data = rows.filter((r) => r.name.includes(q));
  return (
    <Page title="لیست شیفت ها">
      <div className="toolbar">
        <Input placeholder="نام شیفت" style={{ width: 200 }} value={f} onChange={(e) => setF(e.target.value)} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => setQ(f)}>جستجو</Button>
      </div>
      <DataTable dataSource={data} columns={[
        { title: '#', render: (_, __, i) => i + 1 },
        { title: 'نام شیفت', dataIndex: 'name' },
        { title: 'نوع', dataIndex: 'type' },
        { title: 'روزهای کاری', render: (_, r) => r.advanced ? r.advanced.days.length+' روز در سال' : Object.keys(r.days || {}).length + (r.type === 'سفارشی' ? ' روز از ماه' : ' روز در هفته') },
        { title: 'عملیات', render: (_, r) => <RowActions onEdit={() => nav(`/shifts/edit/${r.id}`)} onDelete={() => db.remove('shifts', r.id)} /> },
      ]} />
    </Page>
  );
}

const t = (v) => (v ? dayjs(v, 'HH:mm') : null);
const TimeRange = ({ value, onChange, disabled }) => (
  <TimePicker.RangePicker format="HH:mm" minuteStep={5} disabled={disabled} size="small" placeholder={['ورود', 'خروج']}
    value={value ? [t(value[0]), t(value[1])] : null} onChange={(v) => onChange(v ? [v[0].format('HH:mm'), v[1].format('HH:mm')] : null)} />
);

export function ShiftForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { message } = App.useApp();
  const ex = id ? db.find('shifts', id) : null;
  const [step, setStep] = useState(ex ? 1 : 0);
  const [type, setType] = useState(ex?.type || 'ساده');
  const [name, setName] = useState(ex?.name || '');
  const [overtimeCap, setOvertimeCap] = useState(ex?.overtimeCap ?? 0);
  const [followHolidays, setFollow] = useState(ex?.followHolidays ?? true);
  const [days, setDays] = useState(ex?.days || {});
  const [month, setMonth] = useState(ex?.month ?? 6);
  const [sel, setSel] = useState([]);

  const keys = type === 'ساده' ? WEEKDAYS : Array.from({ length: month < 6 ? 31 : month < 11 ? 30 : 29 }, (_, i) => String(i + 1));
  const toggle = (k, on) => setDays((d) => { const n = { ...d }; if (on) n[k] = n[k] || ['08:00', '16:00']; else delete n[k]; return n; });

  const repeatPattern = () => {
    if (!sel.length) return message.info('ابتدا چند روز را به‌عنوان الگو انتخاب کنید');
    const base = sel.map(Number).sort((a, b) => a - b); const len = base[base.length - 1] - base[0] + 1;
    const n = { ...days };
    keys.forEach((k) => { const src = String(base[0] + ((Number(k) - base[0]) % len + len) % len); if (Number(k) >= base[0]) { if (days[src]) n[k] = days[src]; else delete n[k]; } });
    setDays(n); message.success('الگو تا پایان ماه تکرار شد');
  };

  const save = async () => {
    if (!name.trim()) return message.error('نام شیفت را وارد کنید');
    const row = { name, type, overtimeCap, followHolidays, days, month };
    if (ex) await db.update('shifts', id, row); else await db.add('shifts', row);
    message.success('شیفت ثبت شد'); nav('/shifts');
  };

  return (
    <Page title={ex ? 'ویرایش شیفت' : 'تعریف شیفت'} extra={<Button size="small" icon={<PlayCircleOutlined />}>آموزش تعریف شیفت</Button>}>
      <Steps size="small" current={step} items={[{ title: 'نوع شیفت' }, { title: 'تعریف شیفت' }]} style={{ maxWidth: 420, margin: '0 auto 24px' }} />
      {step === 0 ? (
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ color: '#fff' }}>نوع شیفت خود را انتخاب کنید</h3>
          <Row gutter={16} justify="center" style={{ margin: '20px 0' }}>
            {[['ساده', 'برنامه‌ی هفتگی ثابت؛ مثل شیفت اداری شنبه تا پنج‌شنبه'], ['سفارشی', 'برنامه‌ی ماهانه روزبه‌روز؛ مناسب شیفت‌های چرخشی رستوران و کافه']].map(([k, d]) => (
              <Col xs={24} sm={10} key={k}>
                <Card hoverable onClick={() => setType(k)} style={{ borderColor: type === k ? '#ac44a1' : undefined, marginBottom: 12 }}>
                  <h3 style={{ color: type === k ? '#ac44a1' : '#fff', marginTop: 0 }}>{k}</h3>
                  <p style={{ color: 'rgba(255,255,255,.6)', margin: 0 }}>{d}</p>
                </Card>
              </Col>
            ))}
          </Row>
          <Button type="primary" onClick={() => setStep(1)}>مرحله بعدی</Button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <Field label="نام شیفت" w={220}><Input placeholder="نام شیفت ..." value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="سقف اضافه کاری روز بدون شیفت (ساعت)"><InputNumber min={0} max={24} value={overtimeCap} onChange={setOvertimeCap} style={{ width: '100%' }} /></Field>
            <Field label="تبعیت از تعطیلات رسمی"><Switch style={{ alignSelf: 'flex-start', marginTop: 5 }} checked={followHolidays} onChange={setFollow} /></Field>
            {type === 'سفارشی' && <Field label="ماه"><Select placeholder="انتخاب ماه" value={month} onChange={setMonth} options={MONTHS.map((m, i) => ({ value: i, label: m }))} /></Field>}
          </div>
          {type === 'سفارشی' && (
            <Space wrap style={{ marginBottom: 12 }}>
              <Button onClick={() => setSel([])}>برداشتن تیک ها</Button>
              <Button danger onClick={() => { const n = { ...days }; sel.forEach((k) => delete n[k]); setDays(n); setSel([]); }}>حذف شیفت‌های انتخابی</Button>
              <Button onClick={repeatPattern}>تکرار الگوی انتخابی</Button>
            </Space>
          )}
          {type === 'ساده' && <Alert type="info" showIcon message="روزهایی که تیک ندارند، روز بدون شیفت (تعطیل) حساب می‌شوند." style={{ marginBottom: 12 }} />}
          <Table size="small" rowKey="k" pagination={false} scroll={{ x: 'max-content' }}
            rowSelection={type === 'سفارشی' ? { selectedRowKeys: sel, onChange: setSel } : undefined}
            dataSource={keys.map((k) => ({ k }))}
            columns={[
              { title: type === 'ساده' ? 'روز هفته' : 'روز ماه', dataIndex: 'k', render: (k) => (type === 'ساده' ? k : `${k} ${MONTHS[month]}`) },
              { title: 'روز کاری', render: (_, { k }) => <Checkbox checked={!!days[k]} onChange={(e) => toggle(k, e.target.checked)} /> },
              { title: 'ساعت ورود و خروج', render: (_, { k }) => <TimeRange disabled={!days[k]} value={days[k]} onChange={(v) => setDays({ ...days, [k]: v })} /> },
            ]} />
          <Space style={{ marginTop: 16 }}>
            {!ex && <Button onClick={() => setStep(0)}>مرحله قبل</Button>}
            <Button type="primary" onClick={save}>ثبت</Button>
          </Space>
        </>
      )}
    </Page>
  );
}
