/**
 * چیدمانِ داشبورد را به `/api/state` وصل می‌کند (per-user)، با fallback به localStorage.
 * قرارداد (مطابقِ سرورِ آرومین): GET /api/state?tenant=… → { ok, state }
 * و POST /api/state با { tenant, patch } که سرور merge می‌کند (last-write-wins).
 * در نبودِ سرور، بی‌صدا روی localStorage کار می‌کند تا UI هیچ‌وقت نشکند.
 */
import type { WidgetSize } from '@/components/ui/draggable-widget-grid'

export type SavedLayout = { id: string; size: WidgetSize }[]

const TENANT = 'default'
const USER = 'مدیر' // در تولید از نشستِ کاربر خوانده می‌شود
const LS = 'aromin.dash.layout'

export async function loadLayout(): Promise<SavedLayout | null> {
  try {
    const r = await fetch(`/api/state?tenant=${encodeURIComponent(TENANT)}`)
    if (r.ok) {
      const j = await r.json()
      const l = j?.state?.dashboardLayout?.[USER]
      if (Array.isArray(l) && l.length) return l as SavedLayout
    }
  } catch {
    /* سرور در دسترس نیست — سراغِ localStorage */
  }
  try {
    const raw = localStorage.getItem(LS)
    if (raw) return JSON.parse(raw) as SavedLayout
  } catch {
    /* localStorage مسدود */
  }
  return null
}

let timer: ReturnType<typeof setTimeout> | null = null
export function saveLayout(layout: SavedLayout): void {
  // fallbackِ فوری (per-viewer)
  try {
    localStorage.setItem(LS, JSON.stringify(layout))
  } catch {
    /* بی‌صدا */
  }
  // نوشتنِ سرور با debounce تا هر درگ یک POSTِ کامل نسازد
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant: TENANT, patch: { dashboardLayout: { [USER]: layout } } }),
    }).catch(() => {
      /* آفلاین — localStorage نگه‌داشته شده */
    })
  }, 800)
}
