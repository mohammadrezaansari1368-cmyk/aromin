import { useState } from 'react';
import { Button, Card, Col, Row, Segmented, Select, Space, Statistic, App } from 'antd';
import { LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { Page, DataTable } from '../components/common.jsx';
import { db, useCollection, today, nowTime } from '../store.js';
import { dashboard } from '../calc.js';


export default function Dashboard() {
  const { message } = App.useApp();
  const people = useCollection('personnel');
  const att = useCollection('attendance');
  useCollection('requests'); useCollection('holidays');
  const wps = useCollection('workplaces');
  const [tab, setTab] = useState('حاضرین');
  const [who, setWho] = useState();
  const d = today();

  const todays = att.filter((a) => a.date === d);
  const { present, absent, leave, mission } = dashboard(d);
  const groups = { 'حاضرین': present, 'غایبین': absent, 'مرخصی': leave, 'ماموریت': mission };
  const colors = { 'حاضرین': '#49aa19', 'غایبین': '#d32029', 'مرخصی': '#d89614', 'ماموریت': '#177ddc' };

  const clock = async () => {
    if (!who) return message.warning('پرسنل را انتخاب کنید');
    const open = todays.find((a) => a.person === who && !a.out);
    if (open) { await db.update('attendance', open.id, { out: nowTime() }); message.success('خروج ثبت شد'); }
    else { await db.add('attendance', { person: who, date: d, in: nowTime(), out: null, type: 'حضور' }); message.success('ورود ثبت شد'); }
  };

  const rows = groups[tab].map((p) => {
    const a = todays.find((x) => x.person === p.id);
    return { ...p, wpName: wps.find((w) => w.id === p.workplace)?.name, in: a?.in, out: a?.out };
  });

  return (
    <Page title={`داشبورد — امروز ${d}`}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {Object.keys(groups).map((k) => (
          <Col xs={12} md={6} key={k}>
            <Card hoverable onClick={() => setTab(k)} style={{ borderColor: tab === k ? colors[k] : undefined }}>
              <Statistic title={k} value={groups[k].length} valueStyle={{ color: colors[k] }} suffix="نفر" />
            </Card>
          </Col>
        ))}
      </Row>

      <Card size="small" title="ثبت تردد دستی (آزمایشی)" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="انتخاب پرسنل" style={{ minWidth: 220 }} value={who} onChange={setWho}
            options={people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} />
          <Button type="primary" icon={<LoginOutlined />} onClick={clock}>ثبت ورود / خروج</Button>
          <LogoutOutlined style={{ opacity: 0 }} />
        </Space>
      </Card>

      <Segmented block options={Object.keys(groups)} value={tab} onChange={setTab} style={{ marginBottom: 12 }} />
      <DataTable dataSource={rows} columns={[
        { title: 'کد پرسنلی', dataIndex: 'code' },
        { title: 'نام', render: (_, r) => `${r.firstName} ${r.lastName}` },
        { title: 'محل کار', dataIndex: 'wpName' },
        { title: 'ساعت ورود', dataIndex: 'in', render: (v) => v || '—' },
        { title: 'ساعت خروج', dataIndex: 'out', render: (v) => v || '—' },
      ]} />
    </Page>
  );
}
