import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { api, auth, bootstrap, onError } from '../store.js';

export default function Login({ onDone }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  useEffect(() => onError((m) => message.error(m)), [message]);
  const submit = async (v) => {
    setLoading(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: v });
      if (r.user.role !== 'admin') { message.error('این پنل مخصوص مدیر است؛ پرسنل از اپلیکیشن /app وارد شوند'); return; }
      auth.set(r.token, r.user);
      await bootstrap();
      onDone();
    } catch { /* پیام خطا نمایش داده شده */ } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <div className="logo" style={{ textAlign: 'center', fontSize: 34 }}>آرو<span>مین</span></div>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.55)', marginTop: -8 }}>پنل مدیریت حضور و غیاب</p>
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="username" label="نام کاربری" rules={[{ required: true, message: 'الزامی است' }]}><Input prefix={<UserOutlined />} dir="ltr" autoComplete="username" /></Form.Item>
          <Form.Item name="password" label="رمز عبور" rules={[{ required: true, message: 'الزامی است' }]}><Input.Password prefix={<LockOutlined />} dir="ltr" autoComplete="current-password" /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>ورود</Button>
        </Form>
      </Card>
    </div>
  );
}
