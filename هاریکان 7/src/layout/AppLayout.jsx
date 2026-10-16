import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Badge, Button, Dropdown, Tooltip, App } from 'antd';
import { BellOutlined, QuestionOutlined, PhoneOutlined, UserOutlined, DownOutlined, MenuOutlined, LeftOutlined } from '@ant-design/icons';
import {saveManagerLocation} from '../location.js';
import { MENU, titleFor } from '../menu.jsx';
import { useCollection, onError, auth, MODE } from '../store.js';

export default function AppLayout() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(() => MENU.find((m) => m.children?.some((c) => c.path === pathname))?.label);
  const [mobile, setMobile] = useState(false);
  const { message } = App.useApp();
  useEffect(() => onError((m) => message.error(m)), [message]);
  const user = auth.user;
  const pending = useCollection('requests').filter((r) => r.status === 'در دست بررسی').length;

  useEffect(() => {
    setMobile(false); window.scrollTo(0, 0);
    const parent = MENU.find((m) => m.children?.some((c) => c.path === pathname));
    if (parent) setOpen(parent.label);
  }, [pathname]);

  const go = (p) => nav(p);

  return (
    <div className="app-shell">
      <div className={`overlay ${mobile ? 'open' : ''}`} onClick={() => setMobile(false)} />
      <aside className={`sider ${mobile ? 'open' : ''}`}>
        <div className="logo">{auth.business?.logo&&<img src={auth.business.logo} alt={'لوگوی '+auth.business.name} style={{width:'100%',maxWidth:200}}/>}<div style={{fontSize:15,textAlign:'center',marginTop:8}}>هاریکان ۷</div></div>
        {MENU.map((m, i) => {
          if (m.sep) return <div key={i} className="nav-sep" />;
          if (!m.children) {
            return (
              <div key={m.label} className={`nav-item ${pathname === m.path ? 'active' : ''}`} onClick={() => go(m.path)}>
                {m.icon}<span>{m.label}</span>
                {m.badge && pending > 0 && <Badge count={pending} size="small" style={{ marginInlineStart: 'auto' }} />}
              </div>
            );
          }
          const isOpen = open === m.label;
          const hasActive = m.children.some((c) => c.path === pathname);
          return (
            <div key={m.label}>
              <div className={`nav-item ${hasActive && !isOpen ? 'active' : ''}`} onClick={() => setOpen(isOpen ? null : m.label)}>
                {m.icon}<span>{m.label}</span><LeftOutlined className={`chev ${isOpen ? 'open' : ''}`} />
              </div>
              {isOpen && (
                <div className="nav-sub">
                  {m.children.map((c) => (
                    <div key={c.path} className={`nav-item ${pathname === c.path ? 'active' : ''}`} onClick={() => go(c.path)}>{c.label}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      <section className="main">
        <header className="topbar">
          <Button className="burger" shape="circle" icon={<MenuOutlined />} onClick={() => setMobile(true)} />
          <span style={{color:"#ac44a1",fontWeight:700}}>{auth.business?.name}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button onClick={async()=>{if(!window.confirm('موقعیت فعلی شما در سابقه خصوصی همین کسب‌وکار ثبت شود؟'))return;try{await saveManagerLocation();message.success('لوکیشن ثبت شد');}catch(e){message.error(e.message);}}}>ثبت لوکیشن</Button>
            <Tooltip title="راهنما"><Button shape="circle" icon={<QuestionOutlined />} /></Tooltip>
            <Tooltip title="اعلان‌ها"><Badge dot={pending > 0}><Button shape="circle" icon={<BellOutlined />} onClick={() => go('/requests/new')} /></Badge></Tooltip>
            <Tooltip title="تماس با پشتیبانی"><Button shape="circle" icon={<PhoneOutlined />} onClick={() => go('/tickets/new')} /></Tooltip>
            <Dropdown menu={{ items: [
              { key: 'app', label: 'اپلیکیشن پرسنل', onClick: () => message.info('کارکنان از نقش کارمند در ربات وارد می‌شوند؛ شماره موبایلشان باید در پرونده پرسنلی ثبت شده باشد') },
              { key: 'b', label: 'خرید پکیج', onClick: () => go('/packages') },
              { key: 'logo', label: 'تغییر لوگوی کسب‌وکار', onClick: () => message.info('در گفتگوی ربات فرمان /logo را بفرستید؛ کسب‌وکار خودتان را انتخاب و عکس لوگو را ارسال کنید') },
              { type: 'divider' },
              { key: 'x', label: 'تغییر کسب‌وکار / خروج', danger: true, onClick: () => { auth.clear(); window.dispatchEvent(new Event('aromin:logout')); } },
            ] }}>
              <Button style={{ borderRadius: 12 }} icon={<UserOutlined />}>
                <span className="hide-sm">{MODE === 'local' ? 'نسخه نمایشی' : user?.name || 'مدیر'}</span> <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
          </div>
        </header>
        <div className="crumb">{titleFor(pathname)}</div>
        <Outlet />
      </section>
    </div>
  );
}
