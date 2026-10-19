import { useMemo, useState } from 'react';
import { Button, Card, Descriptions, Modal, Segmented, Select, Timeline } from 'antd';
import { EyeOutlined, FileSearchOutlined } from '@ant-design/icons';
import { Page, DataTable, Field, DateInput, PersonSelect, CollectionSelect, ExcelButton, MONTHS, YEARS } from '../components/common.jsx';
import { useCollection, today, db, personName, MODE, api } from '../store.js';
import { performance, dayRow, daysBetween, hm, leaveUsage } from '../calc.js';

const monthStart = () => today().slice(0, 8) + '01';

function useFilters(extra = {}) {
  const [f, setF] = useState({ from: monthStart(), to: today(), ...extra });
  const [q, setQ] = useState(f);
  const set = (k) => (v) => setF((o) => ({ ...o, [k]: v?.target ? v.target.value : v }));
  return { f, q, set, apply: () => setQ({ ...f }) };
}
const usePeople = (q) => useCollection('personnel').filter((p) => (!q.group || p.group === q.group) && (!q.person || p.id === q.person));
const Range = ({ f, set }) => (<>
  <Field label="از تاریخ"><DateInput value={f.from} onChange={set('from')} /></Field>
  <Field label="تا تاریخ"><DateInput value={f.to} onChange={set('to')} /></Field>
</>);
const GroupPerson = ({ f, set }) => (<>
  <Field label="گروه"><CollectionSelect name="groups" placeholder="همه" value={f.group} onChange={set('group')} /></Field>
  <Field label="پرسنل"><PersonSelect value={f.person} onChange={set('person')} /></Field>
</>);

// ───────── کارکرد
export function PerformanceReport() {
  const { f, q, set, apply } = useFilters();
  const people = usePeople(q);
  const [detail, setDetail] = useState(null);
  const data = useMemo(() => people.map((p) => performance(p, q.from, q.to)), [people, q]);
  const columns = [
    { title: 'نام', dataIndex: 'name', fixed: 'right' },
    { title: 'حضور در شیفت', dataIndex: 'inShift' },
    { title: 'جمع غیبت و کسری کار', dataIndex: 'absent' },
    { title: 'اضافه کاری', dataIndex: 'overtime' },
    { title: 'ماموریت', dataIndex: 'mission' },
    { title: 'مرخصی استحقاقی', dataIndex: 'earned' },
    { title: 'مرخصی استعلاجی', dataIndex: 'sick' },
    { title: 'مرخصی بدون حقوق', dataIndex: 'unpaid' },
    { title: 'مازاد حضور', dataIndex: 'extra' },
    { title: 'روز کارکرد', dataIndex: 'workDays' },
    { title: 'جزییات تردد', render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)} /> },
  ];
  return (
    <Page title="گزارش کارکرد">
      <div className="toolbar"><Range f={f} set={set} /><GroupPerson f={f} set={set} />
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>مشاهده گزارش کارکرد</Button>
        <ExcelButton rows={data} columns={columns} file="performance" label="دانلود گزارش" /></div>
      <DataTable dataSource={data} columns={columns} />
      <Modal open={!!detail} onCancel={() => setDetail(null)} footer={null} width={800} title={`جزییات تردد — ${detail?.name}`}>
        {detail && <AuditTable rows={detail.rows} />}
      </Modal>
    </Page>
  );
}

const auditCols = [
  { title: 'تاریخ', dataIndex: 'date' }, { title: 'روز هفته', dataIndex: 'weekday' },
  { title: 'خلاصه تردد', dataIndex: 'summary' }, { title: 'حضور در شیفت', dataIndex: 'inShift', render: hm },
  { title: 'جمع غیبت و کسری کار', dataIndex: 'absent', render: hm }, { title: 'اضافه کاری', dataIndex: 'overtime', render: hm },
];
const AuditTable = ({ rows }) => <DataTable rowKey="date" dataSource={rows} columns={auditCols} pagination={{ pageSize: 31, hideOnSinglePage: true }} />;

// ───────── تردد
export function AuditReport() {
  const { f, q, set, apply } = useFilters();
  const person = q.person && db.find('personnel', q.person);
  const rows = person ? performance(person, q.from, q.to).rows : [];
  return (
    <Page title="گزارش تردد">
      <div className="toolbar"><Field label="پرسنل"><PersonSelect placeholder="پرسنل" value={f.person} onChange={set('person')} /></Field><Range f={f} set={set} />
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>مشاهده گزارش</Button>
        <ExcelButton rows={rows} columns={auditCols} file="audit" label="دانلود گزارش" /></div>
      {!person && <p style={{ color: 'rgba(255,255,255,.5)' }}>ابتدا پرسنل را انتخاب کنید.</p>}
      <AuditTable rows={rows} />
    </Page>
  );
}

// ───────── مرخصی
export function VacationReport() {
  const [y, m] = today().split('/').map(Number);
  const { f, q, set, apply } = useFilters({ year: y, month: m - 1 });
  const people = usePeople(q);
  const [detail, setDetail] = useState(null);
  const data = people.map((p) => leaveUsage(p, q.year, q.month));
  const columns = [
    { title: 'کد', dataIndex: 'code' }, { title: 'نام', dataIndex: 'name' },
    { title: 'استفاده ماهانه', dataIndex: 'mu' }, { title: 'استفاده سالانه', dataIndex: 'yu' },
    { title: 'تعداد ماهانه', dataIndex: 'mc' }, { title: 'تعداد سالانه', dataIndex: 'yc' },
    { title: 'مانده ماهانه', dataIndex: 'mr' }, { title: 'مانده سالانه', dataIndex: 'yr' },
    { title: 'جزییات مرخصی', render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)} /> },
  ];
  return (
    <Page title="گزارش مرخصی">
      <div className="toolbar"><YearMonth f={f} set={set} /><GroupPerson f={f} set={set} />
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>مشاهده گزارش مرخصی</Button>
        <ExcelButton rows={data} columns={columns} file="vacation" /></div>
      <DataTable dataSource={data} columns={columns} />
      <Modal open={!!detail} onCancel={() => setDetail(null)} footer={null} title={`جزییات مرخصی — ${detail?.name}`}>
        <LeaveTimeline reqs={detail?.reqs || []} />
      </Modal>
    </Page>
  );
}
const YearMonth = ({ f, set }) => (<>
  <Field label="سال" w={110}><Select value={f.year} onChange={set('year')} options={YEARS.map((y) => ({ value: y, label: y }))} /></Field>
  <Field label="ماه" w={130}><Select placeholder="انتخاب ماه" value={f.month} onChange={set('month')} options={MONTHS.map((x, i) => ({ value: i, label: x }))} /></Field>
</>);
const LeaveTimeline = ({ reqs }) => (reqs.length
  ? <Timeline items={reqs.map((r) => ({ children: `${r.from}${r.to && r.to !== r.from ? ' تا ' + r.to : ''} — ${r.kind}${r.note ? ' — ' + r.note : ''}` }))} />
  : <p style={{ color: 'rgba(255,255,255,.5)' }}>مرخصی ثبت نشده است.</p>);

export function VacationDetails() {
  const [y, m] = today().split('/').map(Number);
  const { f, q, set, apply } = useFilters({ year: y, month: m - 1 });
  const p = q.person && db.find('personnel', q.person);
  const u = p && leaveUsage(p, q.year, q.month);
  return (
    <Page title="جزییات مرخصی">
      <div className="toolbar"><Field label="پرسنل"><PersonSelect placeholder="انتخاب پرسنل" value={f.person} onChange={set('person')} /></Field><YearMonth f={f} set={set} />
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>مشاهده گزارش</Button></div>
      {u ? (
        <Card size="small">
          <Descriptions column={{ xs: 1, md: 3 }} items={[
            { label: 'سیاست کاری:', children: u.policy || '—' },
            { label: 'استفاده سالانه', children: `${u.yu} روز` }, { label: 'مانده سالانه', children: `${u.yr} روز` },
          ]} />
          <LeaveTimeline reqs={u.reqs} />
        </Card>
      ) : <p style={{ color: 'rgba(255,255,255,.5)' }}>پرسنل را انتخاب و گزارش را مشاهده کنید.</p>}
    </Page>
  );
}

// ───────── پروژه
export function ProjectReport() {
  const { f, q, set, apply } = useFilters();
  const [mode, setMode] = useState('تردد پروژه');
  const projects = useCollection('projects');
  const dates = daysBetween(q.from, q.to);
  const att = useCollection('attendance').filter((a) => a.project && dates.includes(a.date) && (!q.project || a.project === q.project) && (!q.person || a.person === q.person));
  let rows; let cols;
  if (mode === 'تردد پروژه') {
    rows = att.map((a) => ({ ...a, details: `${personName(a.person)} — ${projects.find((p) => p.id === a.project)?.name}` }));
    cols = [{ title: 'تاریخ', dataIndex: 'date' }, { title: 'ساعت', render: (_, a) => `${a.in} - ${a.out || '…'}` }, { title: 'جزئیات', dataIndex: 'details' }];
  } else {
    const key = mode === 'تردد به تفکیک پرسنل' ? 'person' : 'project';
    const g = {}; att.forEach((a) => { g[a[key]] = (g[a[key]] || 0) + 1; });
    rows = Object.entries(g).map(([id, n]) => ({ id, name: key === 'person' ? personName(id) : projects.find((p) => p.id === id)?.name, n }));
    cols = [{ title: key === 'person' ? 'پرسنل' : 'پروژه', dataIndex: 'name' }, { title: 'تعداد تردد', dataIndex: 'n' }];
  }
  return (
    <Page title="گزارش پروژه">
      <Segmented options={['تردد پروژه', 'تردد به تفکیک پرسنل', 'تردد به تفکیک پروژه']} value={mode} onChange={setMode} style={{ marginBottom: 12 }} />
      <div className="toolbar"><Range f={f} set={set} />
        <Field label="پروژه"><CollectionSelect name="projects" placeholder="همه" value={f.project} onChange={set('project')} /></Field>
        <Field label="پرسنل"><PersonSelect value={f.person} onChange={set('person')} /></Field>
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>مشاهده گزارش</Button>
        <ExcelButton rows={rows} columns={cols} file="project-report" /></div>
      <DataTable dataSource={rows} columns={cols} />
    </Page>
  );
}

// ───────── رهگیری
export function TrackingReport() {
  const { f, q, set, apply } = useFilters({ date: today() });
  const [pts, setPts] = useState(null);
  const people = useCollection('personnel').filter((p) => p.tracking);
  const rows = people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, total: hm(dayRow(p, q.date).worked) }));
  return (
    <Page title="گزارش رهگیری">
      <div className="toolbar"><Field label="تاریخ"><DateInput value={f.date} onChange={set('date')} /></Field>
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>مشاهده گزارش</Button></div>
      <DataTable dataSource={rows} columns={[
        { title: 'نام', dataIndex: 'name' }, { title: 'مجموع حضور', dataIndex: 'total' },
        { title: 'رهگیری پرسنل', render: (_, r) => <Button size="small" disabled={MODE !== 'server'} onClick={() => api(`/admin/reports/tracking?person=${r.id}&date=${encodeURIComponent(q.date)}`).then((pts) => setPts({ name: r.name, pts }))}>مشاهده مسیر</Button> },
      ]} />
      <Modal open={!!pts} onCancel={() => setPts(null)} footer={null} title={`مسیر ${pts?.name} — ${q.date}`}>
        {pts?.pts.length ? <Timeline items={pts.pts.map((p) => ({ children: <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer">{p.at} — {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</a> }))} /> : <p>موقعیتی ثبت نشده است.</p>}
      </Modal>
      <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>فقط پرسنلی که «امکان رهگیری» در پروفایلشان فعال است اینجا نمایش داده می‌شوند. نمایش مسیر نیاز به ارسال موقعیت از اپلیکیشن موبایل دارد.</p>
    </Page>
  );
}

// ───────── تردد ناقص
export function IncompleteReport() {
  const { f, q, set, apply } = useFilters();
  const people = usePeople(q);
  const [detail, setDetail] = useState(null);
  const dates = daysBetween(q.from, q.to);
  const att = useCollection('attendance');
  const data = people.map((p) => {
    const list = att.filter((a) => a.person === p.id && !a.out && dates.includes(a.date) && a.date !== today());
    return { id: p.id, code: p.code, name: `${p.firstName} ${p.lastName}`, n: list.length, list };
  }).filter((r) => r.n > 0);
  const columns = [
    { title: 'کد پرسنلی', dataIndex: 'code' }, { title: 'نام پرسنل', dataIndex: 'name' }, { title: 'تعداد تردد ناقص', dataIndex: 'n' },
    { title: 'جزییات', render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)} /> },
  ];
  return (
    <Page title="گزارش تردد ناقص">
      <div className="toolbar"><Range f={f} set={set} /><GroupPerson f={f} set={set} />
        <Button type="primary" icon={<FileSearchOutlined />} onClick={apply}>دریافت گزارش</Button>
        <ExcelButton rows={data} columns={columns} file="incomplete" /></div>
      <DataTable dataSource={data} columns={columns} />
      <Modal open={!!detail} onCancel={() => setDetail(null)} footer={null} title={`تردد ناقص — ${detail?.name}`}>
        <Timeline items={(detail?.list || []).map((a) => ({ color: 'red', children: `${a.date} — ورود ${a.in}، خروج ثبت نشده` }))} />
      </Modal>
    </Page>
  );
}
