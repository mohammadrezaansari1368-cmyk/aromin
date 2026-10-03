/**
 * ذخیره‌سازِ «حضور و عملکرد» در همین مرورگر — IndexedDB برای داده‌های حجیم (فایلِ حضور، ویرایش‌های دستی، فایل‌های وظایف)،
 * localStorage فقط برای تنظیماتِ سبک (قواعد، نگاشت). هیچ چیز به سرور فرستاده نمی‌شود.
 *
 * خواندن‌ها هم‌گام از یک کشِ حافظه‌اند (موتورِ محاسبه هم‌گام است)؛ `perfReady(tenant)` یک‌بار کش را از IndexedDB پر می‌کند
 * و دادهٔ نسخه‌های قبلی (localStorage) را منتقل می‌کند — کلیدِ قدیمی فقط پس از نوشتنِ موفق پاک می‌شود.
 * اگر IndexedDB در دسترس نباشد (مثلاً حالتِ خصوصیِ بعضی مرورگرها)، همان localStorage جایگزین می‌شود.
 */

export interface KV {
	get(key: string): Promise<unknown>
	set(key: string, value: unknown): Promise<void>
	del(key: string): Promise<void>
}

const DB = 'aromin-perf', STORE = 'kv'
function idbBackend(): KV | null {
	if (typeof indexedDB === 'undefined') return null
	let dbp: Promise<IDBDatabase> | null = null
	const open = () => (dbp ??= new Promise((res, rej) => {
		const r = indexedDB.open(DB, 1)
		r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
		r.onsuccess = () => res(r.result)
		r.onerror = () => { dbp = null; rej(r.error) }
	}))
	const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => open().then((db) => new Promise<T>((res, rej) => {
		const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE))
		t.oncomplete = () => res(q.result)
		t.onerror = t.onabort = () => rej(t.error || q.error)
	}))
	return {
		get: (k) => tx('readonly', (s) => s.get(k)),
		set: (k, v) => tx('readwrite', (s) => s.put(v, k)).then(() => undefined),
		del: (k) => tx('readwrite', (s) => s.delete(k)).then(() => undefined),
	}
}
function lsBackend(): KV {
	return {
		async get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : undefined } catch { return undefined } },
		async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { throw new Error('فضای ذخیرهٔ مرورگر کافی نیست.') } },
		async del(k) { try { localStorage.removeItem(k) } catch { /* */ } },
	}
}

let backend: KV | null = null
let kind: 'idb' | 'ls' | 'custom' = 'idb'
const mem = new Map<string, unknown>()
let readyFor: string | null = null
let readyP: Promise<void> | null = null

export type PerfDoc = 'attendance' | 'overrides' | 'taskfiles'
const DOCS: PerfDoc[] = ['attendance', 'overrides', 'taskfiles']
export const docKey = (name: string, tenant: string) => 'aromin.perf.' + name + '.' + tenant
let tenantNow = 'team'

/** فقط برای آزمون: یک پشتیبانِ ساختگی (Map) و پاک‌کردنِ کش */
export function setPerfBackend(kv: KV | null) { backend = kv; kind = kv ? 'custom' : 'idb'; mem.clear(); readyFor = null; readyP = null }
export const perfBackendKind = () => kind

async function pickBackend(): Promise<KV> {
	if (backend) return backend
	const idb = idbBackend()
	if (idb) {
		try { await idb.get('__probe'); backend = idb; kind = 'idb'; return idb } catch { /* فرو به localStorage */ }
	}
	backend = lsBackend(); kind = 'ls'
	return backend
}

/** نسخهٔ قبلی: فایلِ حضور (با edits درونش)، فایل‌های وظایف و وظایفِ تختِ قدیمی در localStorage بودند */
function lsTake(key: string): unknown {
	try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : undefined } catch { return undefined }
}
function lsDrop(key: string) { try { localStorage.removeItem(key) } catch { /* */ } }

async function load(tenant: string) {
	const kv = await pickBackend()
	mem.clear()
	for (const d of DOCS) {
		const v = await kv.get(docKey(d, tenant)).catch(() => undefined)
		if (v !== undefined) mem.set(d, v)
	}
	if (kind === 'ls' || typeof localStorage === 'undefined') return
	// مهاجرت از localStorage ← IndexedDB (یک‌طرفه؛ حذفِ کلیدِ قدیمی فقط بعد از نوشتنِ موفق)
	const oldAtt = lsTake(docKey('attendance', tenant)) as ({ edits?: Record<string, unknown> } & Record<string, unknown>) | undefined
	if (oldAtt && typeof oldAtt === 'object') {
		const { edits, ...att } = oldAtt
		const ov = { ...((mem.get('overrides') as Record<string, unknown>) || {}), ...(edits || {}) }
		if (!mem.has('attendance')) { await kv.set(docKey('attendance', tenant), att); mem.set('attendance', att) }
		if (edits && Object.keys(edits).length) { await kv.set(docKey('overrides', tenant), ov); mem.set('overrides', ov) }
		lsDrop(docKey('attendance', tenant))
	}
	const oldFiles = lsTake(docKey('taskfiles', tenant))
	if (Array.isArray(oldFiles)) {
		const cur = (mem.get('taskfiles') as { name: string; loadedAt: number }[]) || []
		const merged = cur.concat(oldFiles.filter((f: { name: string; loadedAt: number }) => !cur.some((c) => c.name === f.name && c.loadedAt === f.loadedAt)))
		await kv.set(docKey('taskfiles', tenant), merged)
		mem.set('taskfiles', merged)
		lsDrop(docKey('taskfiles', tenant))
	}
}

/** کش را برای این کسب‌وکار آماده می‌کند (یک‌بار؛ با عوض شدنِ کسب‌وکار دوباره) */
export function perfReady(tenant: string): Promise<void> {
	if (readyFor === tenant && readyP) return readyP
	readyFor = tenant
	tenantNow = tenant
	readyP = load(tenant).catch(() => { /* خواندن ناموفق ← کشِ خالی؛ برنامه کار می‌کند */ })
	return readyP
}
export const isPerfReady = (tenant: string) => readyFor === tenant && readyP !== null

export function memGet<T>(d: PerfDoc, fallback: T): T {
	return mem.has(d) ? (mem.get(d) as T) : fallback
}
/** نوشتن: اول کش (برای نمایشِ فوری)، بعد IndexedDB؛ اگر نوشتن شکست بخورد کش برمی‌گردد و خطا بالا می‌رود */
export async function memSet(d: PerfDoc, value: unknown | undefined): Promise<void> {
	const kv = await pickBackend()
	const prev = mem.has(d) ? mem.get(d) : undefined
	const had = mem.has(d)
	if (value === undefined) mem.delete(d); else mem.set(d, value)
	try {
		if (value === undefined) await kv.del(docKey(d, tenantNow)); else await kv.set(docKey(d, tenantNow), value)
	} catch (e) {
		if (had) mem.set(d, prev); else mem.delete(d)
		throw e instanceof Error ? e : new Error('ذخیره در مرورگر انجام نشد.')
	}
}
