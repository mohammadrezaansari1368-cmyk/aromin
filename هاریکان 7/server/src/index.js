// سرور سامانه حضور و غیاب آرومین
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql, seedDefaults } from './db.js';
import { login, createAdmin } from './auth.js';
import adminRoutes from './routes/admin.js';
import appRoutes from './routes/app.js';
import v1Routes from './routes/v1.js';
import { startBridge } from './zk/bridge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.openstreetmap.org'],
      frameSrc: ['https://www.openstreetmap.org'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '5mb' }));

seedDefaults();
if (process.env.ADMIN_USER && process.env.ADMIN_PASS && !sql.prepare('SELECT 1 FROM admins LIMIT 1').get()) {
  createAdmin(process.env.ADMIN_USER, process.env.ADMIN_PASS, 'مدیر سیستم');
  console.log(`✓ مدیر «${process.env.ADMIN_USER}» ساخته شد`);
}

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'تلاش زیاد؛ ۱۵ دقیقه دیگر امتحان کنید' } }), (req, res) => {
  const r = login(req.body?.username, req.body?.password);
  if (!r) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
  res.json(r);
});
app.use('/api/admin', adminRoutes);
app.use('/api/app', appRoutes);
app.use('/api/v1', v1Routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'مسیر API یافت نشد' }));

// اپلیکیشن پرسنل (PWA)
app.use('/app', express.static(path.join(here, '../public/app'), { index: 'index.html' }));
// پنل مدیریت (خروجی npm run build در پوشه اصلی)
const panel = process.env.PANEL_DIR || path.join(here, '../../dist');
if (fs.existsSync(panel)) {
  app.use(express.static(panel));
  app.get(/^\/(?!api|app).*/, (req, res) => res.sendFile(path.join(panel, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('پنل ساخته نشده است. در پوشه اصلی پروژه دستور npm run build را اجرا کنید.'));
}

const port = +process.env.PORT || 3000;
app.listen(port, process.env.HOST || '0.0.0.0', () => { startBridge(); console.log(`✓ سرور آرومین روی پورت ${port} اجرا شد — پنل: /  اپلیکیشن پرسنل: /app`); });
