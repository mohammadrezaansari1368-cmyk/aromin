// احراز هویت: مدیر (admins) و پرسنل (personnel) — توکن JWT
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { sql, repo } from './db.js';

const SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  JWT_SECRET تنظیم نشده؛ یک کلید موقت ساخته شد (با هر ری‌استارت، کاربران باید دوباره وارد شوند).');
  return crypto.randomBytes(32).toString('hex');
})();
const TTL = process.env.JWT_TTL || '30d';

export const hashPassword = (p) => bcrypt.hashSync(String(p), 10);
export const checkPassword = (p, h) => !!h && bcrypt.compareSync(String(p), h);
export const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: TTL });

export function login(username, password) {
  const u = String(username || '').trim();
  const admin = sql.prepare('SELECT * FROM admins WHERE username = ?').get(u);
  if (admin && checkPassword(password, admin.password_hash)) {
    return { token: sign({ sub: admin.id, role: 'admin' }), user: { id: admin.id, name: admin.name || admin.username, role: 'admin' } };
  }
  const person = repo.where('personnel', 'username', u)[0];
  if (person && person.status !== 'غیر فعال' && checkPassword(password, person.passwordHash)) {
    return { token: sign({ sub: person.id, role: 'employee' }), user: { id: person.id, name: `${person.firstName} ${person.lastName}`, role: 'employee' } };
  }
  return null;
}

export function createAdmin(username, password, name) {
  const id = crypto.randomBytes(6).toString('base64url');
  sql.prepare('INSERT INTO admins (id, username, password_hash, name) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name')
    .run(id, username, hashPassword(password), name || username);
}

/** میان‌افزار: فقط با توکن معتبر */
export function requireAuth(role) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'ابتدا وارد شوید' });
    try {
      const p = jwt.verify(t, SECRET);
      if (role && p.role !== role) return res.status(403).json({ error: 'دسترسی مجاز نیست' });
      if (p.role === 'employee') {
        const person = repo.get('personnel', p.sub);
        if (!person || person.status === 'غیر فعال') return res.status(401).json({ error: 'حساب کاربری غیرفعال است' });
        req.person = person;
      }
      req.user = p;
      next();
    } catch {
      res.status(401).json({ error: 'نشست منقضی شده؛ دوباره وارد شوید' });
    }
  };
}

// ───────── توکن‌های وب سرویس (برای اتصال نرم‌افزارهای دیگر)
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function createApiToken(name) {
  const raw = 'arm_' + crypto.randomBytes(24).toString('hex');
  const id = crypto.randomBytes(6).toString('base64url');
  sql.prepare('INSERT INTO api_tokens (id, name, token_hash, prefix) VALUES (?, ?, ?, ?)').run(id, name || 'وب سرویس', sha(raw), raw.slice(0, 10));
  return { id, token: raw }; // توکن کامل فقط همین یک بار نمایش داده می‌شود
}
export const listApiTokens = () => sql.prepare('SELECT id, name, prefix, created_at, last_used FROM api_tokens ORDER BY created_at DESC').all();
export const deleteApiToken = (id) => sql.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
export function requireApiToken(req, res, next) {
  const h = req.headers.authorization || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key'];
  const row = raw && sql.prepare('SELECT id FROM api_tokens WHERE token_hash = ?').get(sha(raw));
  if (!row) return res.status(401).json({ error: 'توکن وب سرویس نامعتبر است' });
  sql.prepare("UPDATE api_tokens SET last_used = datetime('now') WHERE id = ?").run(row.id);
  next();
}
