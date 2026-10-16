import { randomUUID } from 'node:crypto';
import { ApiError, exactObject } from './errors.mjs';
export const normalizeDigits = value => value.replace(/[۰-۹٠-٩]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 1776 : 1632)));
export function validateCustomer(body) {
  exactObject(body, ['name', 'mobile']);
  const fields = {};
  if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 100 || /[\x00-\x1f]/.test(body.name)) fields.name = 'نام بین ۱ تا ۱۰۰ نویسه لازم است.';
  const mobile = typeof body.mobile === 'string' ? normalizeDigits(body.mobile.trim()) : '';
  if (!/^09\d{9}$/.test(mobile)) fields.mobile = 'شماره موبایل محلی باید ۱۱ رقم و با ۰۹ آغاز شود.';
  if (Object.keys(fields).length) throw new ApiError(422, 'validation_failed', 'اطلاعات پایه معتبر نیست.', fields);
  return { name: body.name.trim(), mobile };
}
function customerRow(row, demo) {
  return { id: row.id, name: row.name, mobile: row.mobile, credit: row.credit, lastPurchase: row.last_purchase,
    totalPurchase: row.total_purchase, group: row.group_name, synthetic: demo, createdAt: row.created_at };
}
export function createCustomer(db, owner, body) {
  const { name, mobile } = validateCustomer(body);
  try {
    const row = db.prepare('INSERT INTO customers(id,owner_id,name,mobile,created_at) VALUES(?,?,?,?,?) RETURNING *').get(randomUUID(), owner, name, mobile, new Date().toISOString());
    return customerRow(row, false);
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) throw new ApiError(409, 'mobile_exists', 'این شماره قبلاً در حساب محلی ثبت شده است.', { mobile: 'شماره تکراری است.' });
    throw error;
  }
}
export function listCustomers(databases, owner, searchParams) {
  const allowed = ['dataset','q','page','pageSize','sms','trust','fixed','source','active'];
  for (const key of searchParams.keys()) if (!allowed.includes(key) || searchParams.getAll(key).length !== 1) throw new ApiError(400, 'query_invalid', 'پارامتر جستجو معتبر نیست.');
  const dataset = searchParams.get('dataset') || 'live';
  if (!['live','demo'].includes(dataset)) throw new ApiError(400, 'query_invalid', 'مجموعه داده معتبر نیست.');
  const parse = (key, fallback, values) => {
    const raw = searchParams.get(key) ?? String(fallback), value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || (values ? !values.includes(value) : value < 1 || value > 1000000)) throw new ApiError(400, 'query_invalid', 'پارامتر عددی معتبر نیست.');
    return value;
  };
  const page = parse('page', 1), size = parse('pageSize', 20, [10,20,50,100]);
  const filters = { sms: parse('sms',1,[0,1,2]), trust: parse('trust',1,[0,1,2]), fixed: parse('fixed',1,[0,1,2]), source: parse('source',0,[0,1]), active: parse('active',0,[0,1]) };
  const q = searchParams.get('q') || '';
  if (q.length > 200) throw new ApiError(400, 'query_invalid', 'متن جستجو بیش از حد بلند است.');
  const demo = dataset === 'demo', db = demo ? databases.demo : databases.live, scope = demo ? 0 : owner;
  const clauses = ['owner_id=?'], values = [scope];
  if (q) { clauses.push("(name LIKE ? ESCAPE '\\' OR mobile LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')"); const pattern = '%' + q.replace(/[\\%_]/g,'\\$&') + '%'; values.push(pattern, pattern, pattern); }
  if (filters.sms !== 1) { clauses.push('sms_blocked=?'); values.push(Number(filters.sms===0)); }
  if (filters.trust !== 1) { clauses.push('trust=?'); values.push(filters.trust===0?'trusted':'blocked'); }
  if (filters.fixed !== 1) { clauses.push('fixed_group=?'); values.push(Number(filters.fixed===0)); }
  if (filters.source) { clauses.push('source=?'); values.push('sms'); }
  clauses.push('deleted=?'); values.push(filters.active);
  const where = clauses.join(' AND ');
  const total = db.prepare('SELECT COUNT(*) AS count FROM customers WHERE owner_id=?').get(scope).count;
  const filtered = db.prepare('SELECT COUNT(*) AS count FROM customers WHERE '+where).get(...values).count;
  const pages = Math.max(1,Math.ceil(filtered/size)), current = Math.min(page,pages);
  const rows = db.prepare('SELECT * FROM customers WHERE '+where+' ORDER BY created_at,id LIMIT ? OFFSET ?').all(...values,size,(current-1)*size);
  return { dataset, total, filtered, pages, page:current, rows:rows.map(r=>customerRow(r,demo)) };
}
