// ─────────────────────────────────────────────────────────────
//  دستگاه حضور و غیاب (ZKTeco، TCP 4370) — لایه ارتباط پنل
//  • حالت سرور: همه درخواست‌ها به /api/admin/zk (سرور اصلی ← سرویس zk-sync).
//  • حالت نمایشی: یک دستگاه شبیه‌سازی‌شده داخل مرورگر با همان API.
// ─────────────────────────────────────────────────────────────
import { MODE, api, auth, reload } from './store.js';

import { toJ, toG, ZK_PUNCH } from '../shared/core.js';

export { toJ, toG, ZK_PUNCH };
export const PUNCH_OPTIONS = Object.entries(ZK_PUNCH).map(([v, label]) => ({ value: +v, label }));

const qs = (q) => { const p = Object.entries(q || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''); return p.length ? '?' + new URLSearchParams(p).toString() : ''; };

/** درخواست به سرویس دستگاه */
export async function zk(path, { method = 'GET', body, query } = {}) {
  const out = await api('/admin/zk' + path + qs(query), { method, body });
  if (method !== 'GET' && /^\/(attendance|devices\/\d+\/sync|sync-all|rebuild)/.test(path)) reload('attendance').catch(() => {});
  return out;
}

/** همه صفحه‌های یک فهرست (برای خروجی اکسل) */
export async function zkAll(path, query, max = 20000) {
  const items = []; let page = 1;
  for (;;) {
    const r = await zk(path, { query: { ...query, page, page_size: 1000 } });
    items.push(...r.items);
    if (items.length >= r.total || !r.items.length || items.length >= max) return items;
    page++;
  }
}

// ───────── نمایش زمان
export const jdt = (ts) => (ts ? `${toJ(ts)} ${ts.slice(11, 16)}` : '—');
export const hmText = (m) => { if (m == null) return '—'; const s = m < 0 ? '-' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

// ───────── خروجی اکسل (CSV با BOM)
export function downloadCsv(file, header, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${file}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export const isDemo = MODE === 'local';
export const currentUser = () => auth.user?.name || 'مدیر';
