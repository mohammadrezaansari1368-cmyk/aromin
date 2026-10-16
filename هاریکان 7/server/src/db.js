// لایه پایگاه داده — SQLite (یک فایل، بدون نیاز به نصب سرور دیتابیس)
// هر «مجموعه» یک جدول با ستون JSON است تا ساختار فرم‌ها راحت قابل توسعه باشد.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const COLLECTIONS = [
  'workplaces', 'groups', 'shifts', 'policies', 'personnel', 'projects', 'holidays',
  'requests', 'requestTypes', 'messages', 'tickets', 'devices', 'smsLines', 'attendance',
];

const file = process.env.DB_FILE || path.resolve('data/aromin.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
export const sql = new Database(file);
sql.pragma('journal_mode = WAL');
sql.pragma('foreign_keys = ON');

for (const c of COLLECTIONS) {
  sql.exec(`CREATE TABLE IF NOT EXISTS "${c}" (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}
sql.exec(`
  CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, name TEXT, token_hash TEXT UNIQUE NOT NULL, prefix TEXT, created_at TEXT DEFAULT (datetime('now')), last_used TEXT);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT NOT NULL, at TEXT NOT NULL, date TEXT NOT NULL, lat REAL, lng REAL, accuracy REAL);
  CREATE INDEX IF NOT EXISTS idx_locations ON locations(person, date);
  CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), actor TEXT, action TEXT, collection TEXT, record_id TEXT, detail TEXT);
`);

export const newId = () => crypto.randomBytes(6).toString('base64url');
const parse = (row) => (row ? { ...JSON.parse(row.data), id: row.id } : null);

export const repo = {
  list(c) { return sql.prepare(`SELECT id, data FROM "${c}" ORDER BY created_at, rowid`).all().map(parse); },
  get(c, id) { return parse(sql.prepare(`SELECT id, data FROM "${c}" WHERE id = ?`).get(id)); },
  where(c, field, value) {
    return sql.prepare(`SELECT id, data FROM "${c}" WHERE json_extract(data, '$.' || ?) = ?`).all(field, value).map(parse);
  },
  insert(c, obj) {
    const id = obj.id && /^[\w-]{3,40}$/.test(obj.id) && !this.get(c, obj.id) ? obj.id : newId();
    const { id: _ignored, ...data } = obj;
    sql.prepare(`INSERT INTO "${c}" (id, data) VALUES (?, ?)`).run(id, JSON.stringify(data));
    return this.get(c, id);
  },
  update(c, id, patch) {
    const cur = this.get(c, id); if (!cur) return null;
    const { id: _i, ...next } = { ...cur, ...patch };
    sql.prepare(`UPDATE "${c}" SET data = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(next), id);
    return this.get(c, id);
  },
  remove(c, id) { return sql.prepare(`DELETE FROM "${c}" WHERE id = ?`).run(id).changes > 0; },
  count(c) { return sql.prepare(`SELECT COUNT(*) n FROM "${c}"`).get().n; },
};

export const settings = {
  get(key, fallback = null) { const r = sql.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : fallback; },
  set(key, value) { sql.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value)); return value; },
  all() { return Object.fromEntries(sql.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, JSON.parse(r.value)])); },
};

export const audit = (actor, action, collection, recordId, detail) => sql.prepare(
  'INSERT INTO audit_log (actor, action, collection, record_id, detail) VALUES (?, ?, ?, ?, ?)',
).run(actor, action, collection, recordId, detail ? JSON.stringify(detail).slice(0, 2000) : null);

/** همه داده‌های لازم برای موتور محاسبات */
export const engineData = () => ({
  personnel: repo.list('personnel'), shifts: repo.list('shifts'), holidays: repo.list('holidays'),
  attendance: repo.list('attendance'), requests: repo.list('requests'), policies: repo.list('policies'),
});

// داده‌های پایه در اولین اجرا
export function seedDefaults() {
  if (repo.count('requestTypes') === 0) {
    [['مرخصی', 'مرخصی استحقاقی'], ['مرخصی', 'مرخصی استعلاجی'], ['مرخصی', 'مرخصی بی‌حقوق'], ['ماموریت', 'ماموریت'],
      ['اضافه کار', 'اضافه کار'], ['تردد', 'تردد دستی'], ['سایر', 'جابجایی شیفت']]
      .forEach(([cat, name]) => repo.insert('requestTypes', { cat, name, active: true }));
  }
  if (repo.count('policies') === 0) {
    repo.insert('policies', { name: 'سیاست کاری عمومی', description: 'طبق قانون کار', year: 1405, yearCap: 26, monthCap: 2.5, minUnit: 'ساعتی' });
  }
}
