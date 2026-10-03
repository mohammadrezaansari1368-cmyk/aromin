import { useCallback, useEffect, useMemo, useState } from 'react'
import DraggableWidgetGrid, { type WidgetItem, type WidgetSize } from '@/components/ui/draggable-widget-grid'
import { renderWidgetContent, type WidgetKind } from './widgets'
import { loadLayout, saveLayout } from '@/lib/api/state'
import type { Role } from '@/lib/auth'

interface DashWidget extends WidgetItem {
  kind: WidgetKind
  /** نقش‌هایی که این ویجت را می‌بینند؛ نبودن = همه. */
  roles?: Role[]
}

// چیدمانِ پیش‌فرضِ داشبوردِ مدیریتی (داده‌ها واقعی‌اند).
const SUPPORT: Role[] = ['manager', 'support']
const MANAGER: Role[] = ['manager']
const FINANCE: Role[] = ['manager', 'finance']

const WIDGETS: DashWidget[] = [
  // چارت‌های عملکردِ پشتیبانی (دادهٔ واقعی) — مدیر و پشتیبانی
  { id: 'slaChart', kind: 'slaChart', size: 'lg', label: 'مقایسهٔ عملکردِ پشتیبان‌ها', roles: SUPPORT },
  { id: 'phoneChart', kind: 'phoneChart', size: 'wide', label: 'تماسِ تلفنی به تفکیکِ نفر', roles: SUPPORT },
  { id: 'support', kind: 'support', size: 'lg', label: 'عملکردِ تیمِ پشتیبانی', roles: SUPPORT },
  { id: 'topPhone', kind: 'topPhone', size: 'wide', label: 'برترین پاسخ‌گویانِ تلفن', roles: SUPPORT },
  // عمومی — همهٔ نقش‌ها
  { id: 'channels', kind: 'channels', size: 'wide', label: 'کانالِ ورودی' },
  { id: 'phone', kind: 'phone', size: 'sm', label: 'تماسِ تلفنی' },
  { id: 'visit', kind: 'visit', size: 'sm', label: 'مراجعهٔ حضوری' },
  { id: 'online', kind: 'online', size: 'sm', label: 'اینترنتی' },
  { id: 'topVisit', kind: 'topVisit', size: 'sm', label: 'بیشترین حضوری' },
  // مالی — مدیر و مالی
  { id: 'cost', kind: 'cost', size: 'sm', label: 'هزینهٔ دوره', roles: FINANCE },
  // مجموعه‌نمودارها (قالب) — فعلاً فقط مدیر
  { id: 'runs', kind: 'runs', size: 'wide', label: 'تیکت‌های امروز', roles: MANAGER },
  { id: 'tools', kind: 'tools', size: 'wide', label: 'فعالیت‌ها', roles: MANAGER },
  { id: 'models', kind: 'models', size: 'wide', label: 'سهمِ کانال‌ها', roles: MANAGER },
  { id: 'traces', kind: 'traces', size: 'wide', label: 'آخرین تیکت‌ها', roles: MANAGER },
  { id: 'health', kind: 'health', size: 'sm', label: 'وضعیتِ سامانه', roles: MANAGER },
  { id: 'failures', kind: 'failures', size: 'sm', label: 'خطاها', roles: MANAGER },
  { id: 'evals', kind: 'evals', size: 'sm', label: 'امتیازِ کیفیت', roles: MANAGER },
]

/** چیدمانِ ذخیره‌شده را با «مجموعهٔ مجازِ نقش» ادغام می‌کند: ترتیب/اندازه از ذخیره،
 *  ویجت‌های تازه ته لیست، و ویجت‌های خارج از دسترسِ نقش هرگز وارد نمی‌شوند. */
function mergeLayout(saved: { id: string; size: WidgetSize }[] | null, pool: DashWidget[]): DashWidget[] {
  if (!saved?.length) return pool
  const byId = new Map(pool.map((w) => [w.id, w]))
  const ordered = saved.filter((s) => byId.has(s.id)).map((s) => ({ ...(byId.get(s.id) as DashWidget), size: s.size }))
  const seen = new Set(ordered.map((w) => w.id))
  return [...ordered, ...pool.filter((w) => !seen.has(w.id))]
}

export function ManagementDashboard({ role }: { role: Role }) {
  // فیلترِ نقش: قبل از هر چیز، فقط ویجت‌های مجاز واردِ کار می‌شوند (نه display:none).
  const allowed = useMemo(() => WIDGETS.filter((w) => !w.roles || w.roles.includes(role)), [role])
  const [items, setItems] = useState<DashWidget[]>(allowed)

  // بارگذاریِ چیدمان از /api/state (با fallback به localStorage) — محدود به مجموعهٔ مجازِ نقش.
  useEffect(() => {
    let alive = true
    loadLayout().then((saved) => { if (alive) setItems(mergeLayout(saved, allowed)) })
    return () => { alive = false }
  }, [allowed])

  const onChange = useCallback((next: WidgetItem[]) => {
    const merged = next.map((n) => {
      const w = allowed.find((x) => x.id === n.id)!
      return { ...w, size: n.size }
    })
    setItems(merged)
    saveLayout(merged.map((w) => ({ id: w.id, size: w.size })))
  }, [allowed])

  return (
    <DraggableWidgetGrid
      items={items}
      onChange={onChange}
      maxColumns={4}
      cellSize={210}
      gap={12}
      radius={16}
      renderItem={(item) => renderWidgetContent((item as DashWidget).kind)}
    />
  )
}
