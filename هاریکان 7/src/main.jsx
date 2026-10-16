import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import faIR from 'antd/locale/fa_IR';
import App from './App.jsx';
import './styles.css';

window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();

// خطاهای سرور قبلاً به‌صورت پیام نمایش داده شده‌اند؛ در کنسول تکرار نشوند
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.shown) e.preventDefault(); });

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider
    direction="rtl"
    locale={faIR}
    theme={{
      algorithm: theme.darkAlgorithm,
      token: {
        colorPrimary: '#ac44a1',
        colorBgBase: '#000000',
        colorBgContainer: '#141414',
        borderRadius: 8,
        fontFamily: 'Vazirmatn, IRANSans, Tahoma, sans-serif',
      },
    }}
  >
    <AntApp>
      <HashRouter>
        <App />
      </HashRouter>
    </AntApp>
  </ConfigProvider>,
);
