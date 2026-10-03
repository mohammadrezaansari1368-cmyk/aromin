import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { loadLayout, saveLayout } from '@/lib/ledgerStore'
import type { Session } from '@/lib/auth'
import { arrangeOrder } from './sortable'
import { moveRow } from './row-order'

export function useRowOrder(session: Session, list: string, keys: string[], disabled: boolean) {
  const [saved, setSaved] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const cancel = useRef<(() => void) | null>(null)
  const order = arrangeOrder(keys, saved)
  const live = useRef(order); live.current = order
  const generation = useRef(0)
  useEffect(() => {
    const gen = ++generation.current
    setSaved([])
    loadLayout(session, list).then(o => { if (generation.current === gen && o) setSaved(o) })
    return () => { generation.current++; cancel.current?.() }
  }, [session.user, list])
  const move = async (key: string, target: string) => {
    if (busyRef.current || disabled) return
    const previous = live.current, next = moveRow(previous, key, target)
    if (next === previous) return
    const gen = generation.current
    busyRef.current = true; setBusy(true); setSaved(next)
    try {
      await saveLayout(session, list, next)
      if (gen === generation.current) setMessage('ترتیب ردیف‌ها ذخیره شد')
    } catch {
      if (gen === generation.current) { setSaved(previous); setMessage('ذخیره نشد؛ ترتیب قبلی بازگردانده شد') }
    } finally { busyRef.current = false; setBusy(false) }
  }
  const pointer = (key: string, e: React.PointerEvent) => {
    if (e.button !== 0 || busyRef.current || disabled) return
    e.preventDefault(); e.stopPropagation(); cancel.current?.(); setDrag(key)
    const controller = new AbortController()
    const cleanup = () => { controller.abort(); setDrag(null); cancel.current = null }
    cancel.current = cleanup
    const up = (ev: PointerEvent) => {
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-order-row]')?.dataset.orderRow
      cleanup(); if (target) void move(key, target)
    }
    window.addEventListener('pointerup', up, { signal: controller.signal })
    window.addEventListener('pointercancel', cleanup, { signal: controller.signal })
    window.addEventListener('keydown', ev => { if (ev.key === 'Escape') cleanup() }, { signal: controller.signal })
  }
  const keyboard = (key: string, e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!d) return
    e.preventDefault(); e.stopPropagation()
    const target = live.current[live.current.indexOf(key) + d]
    if (target) void move(key, target)
  }
  return { order, disabled: disabled || busy, message, drag, pointer, keyboard }
}
export const RowOrderContext = createContext<ReturnType<typeof useRowOrder> | null>(null)
export function RowGrip({ rowKey }: { rowKey: string }) {
  const order = useContext(RowOrderContext)
  if (!order) return null
  return <button type="button" disabled={order.disabled} aria-label="جابه‌جایی ردیف؛ بکشید یا کلید بالا و پایین" title={order.disabled ? 'در حالت مرتب‌سازی ستونی، جابه‌جایی غیرفعال است' : 'جابه‌جایی ردیف'}
    onPointerDown={e => order.pointer(rowKey, e)} onKeyDown={e => order.keyboard(rowKey, e)} onClick={e => e.stopPropagation()}
    className={`mr-1 shrink-0 touch-none rounded px-1 py-2 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 ${order.drag === rowKey ? 'bg-primary/20' : ''}`}>⠿</button>
}
