/** Dashboard layouts use session-authenticated /api/ui-layout (dashboard.widgets,
 * id:size entries). Empty slots read legacy full.dashboardLayout[user], then the
 * tenant/user cache. Cache contains layouts only. Each view owns its 800 ms
 * debounce and reports save errors; missing/mismatched sessions stay local. */
import type { WidgetSize } from '@/components/ui/draggable-widget-grid'
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'

export type SavedLayout = { id: string; size: WidgetSize }[]
export const LAYOUT_LIST = 'dashboard.widgets'
export const SAVE_ERROR = 'ذخیرهٔ چیدمان روی سرور ناموفق بود؛ تغییرات فقط روی همین دستگاه نگه داشته شد.'
export const SESSION_ERROR = 'نشست شما منقضی شده؛ دوباره وارد شوید.'
const key = (tenant: string, session: Session | null) => `aromin.dash.layout:${JSON.stringify([tenant, session?.user ?? null])}`
const canFetch = (session: Session | null, tenant: string): session is Session =>
  !!session?.token && session.tenant === tenant && currentTenant() === tenant

function validate(value: unknown, ids: readonly string[]): SavedLayout {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry) => {
    const item = typeof entry === 'string' ? { id: entry.split(':')[0], size: entry.split(':')[1] } : entry
    if (!item || typeof item !== 'object' || !ids.includes(item.id) || !['sm', 'wide', 'tall', 'lg'].includes(item.size) || seen.has(item.id)
      || (typeof entry === 'string' && entry.split(':').length !== 2)) return []
    seen.add(item.id)
    return [{ id: item.id, size: item.size as WidgetSize }]
  }).slice(0, 50)
}
function cache(tenant: string, session: Session | null, layout: SavedLayout) {
  try { localStorage.setItem(key(tenant, session), JSON.stringify(layout)) } catch { /* storage unavailable */ }
}

export async function loadLayout(session: Session | null, ids: readonly string[]): Promise<SavedLayout | null> {
  const tenant = currentTenant()
  if (canFetch(session, tenant)) {
    try {
      // Same endpoint/header pattern as ledgerStore, with HTTP status validation.
      const r = await fetch(`/api/ui-layout?tenant=${encodeURIComponent(tenant)}&list=${LAYOUT_LIST}`, { headers: authHeaders(session), cache: 'no-store' })
      const d = await r.json()
      if (r.ok && d?.ok && Array.isArray(d.order)) {
        if (d.order.length) {
          const layout = validate(d.order.filter((entry: unknown) => typeof entry === 'string'), ids)
          cache(tenant, session, layout)
          return layout
        }
        if (canFetch(session, tenant)) {
          const r = await fetch(`/api/state?tenant=${encodeURIComponent(tenant)}`, { headers: authHeaders(session), cache: 'no-store' })
          const d = await r.json()
          const layout = validate(r.ok && d?.ok ? d.full?.dashboardLayout?.[session.user] : null, ids)
          if (layout.length) { cache(tenant, session, layout); return layout }
        }
      }
    } catch { /* use scoped cache */ }
  }
  try { return validate(JSON.parse(localStorage.getItem(key(tenant, session)) || 'null'), ids) } catch { return null }
}

/** Dispose on unmount/identity changes; writes are serialized to preserve ordering. */
export function createLayoutSaver(session: Session | null, onError: (message: string | null) => void) {
  const tenant = currentTenant()
  const identity = session ? { ...session } : null
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: SavedLayout | null = null
  let disposed = false
  let revision = 0
  let pending = Promise.resolve()
  const flush = () => {
    if (timer) clearTimeout(timer)
    const version = revision
    const layout = latest
    pending = pending.then(async () => {
      if (disposed || !layout || !canFetch(identity, tenant)) return
      try {
        const r = await fetch('/api/ui-layout', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(identity) },
          body: JSON.stringify({ tenant, list: LAYOUT_LIST, order: layout.map((w) => `${w.id}:${w.size}`) }),
        })
        const d = await r.json().catch(() => null)
        if (!r.ok || !d?.ok) {
          if (!disposed && version === revision) onError(r.status === 401 ? SESSION_ERROR : SAVE_ERROR)
          return
        }
        if (!disposed && version === revision) onError(null)
      } catch { if (!disposed && version === revision) onError(SAVE_ERROR) }
    })
    return pending
  }
  return {
    save(layout: SavedLayout) {
      if (disposed) return
      latest = layout.map(({ id, size }) => ({ id, size }))
      revision++
      cache(tenant, identity, latest)
      if (timer) clearTimeout(timer)
      if (canFetch(identity, tenant)) timer = setTimeout(() => { void flush() }, 800)
    },
    retry: flush,
    dispose() { disposed = true; if (timer) clearTimeout(timer) },
  }
}
