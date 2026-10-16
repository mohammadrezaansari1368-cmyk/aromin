import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { syntheticCustomers } from '../src/synthetic-data.mjs';
const schema = `CREATE TABLE IF NOT EXISTS customers(
 id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, mobile TEXT NOT NULL,
 credit INTEGER, last_purchase TEXT, total_purchase INTEGER, group_name TEXT,
 sms_blocked INTEGER NOT NULL DEFAULT 0, trust TEXT NOT NULL DEFAULT 'normal',
 fixed_group INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'local', deleted INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, UNIQUE(owner_id,mobile));
 CREATE INDEX IF NOT EXISTS customer_owner ON customers(owner_id,created_at,id);`;
export function openDatabases(directory) {
  mkdirSync(directory, { recursive: true });
  const live = new DatabaseSync(path.join(directory, 'xsi.sqlite'));
  const demo = new DatabaseSync(path.join(directory, 'demo.sqlite'));
  for (const db of [live, demo]) { db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;'); db.exec(schema); }
  live.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);`);
  if (!demo.prepare('SELECT id FROM customers LIMIT 1').get()) {
    const insert = demo.prepare('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    demo.exec('BEGIN');
    try {
      for (const r of syntheticCustomers) insert.run(r.id, 0, r.name, r.mobile, r.credit, r.lastPurchase, r.totalPurchase, r.group, Number(r.smsBlocked), r.trust, Number(r.fixed), r.source, Number(r.deleted), '2026-01-01T00:00:00.000Z');
      demo.exec('COMMIT');
    } catch (error) { demo.exec('ROLLBACK'); throw error; }
  }
  return { live, demo, close() { live.close(); demo.close(); } };
}
