export function moveRow(order: string[], key: string, target: string): string[] {
  const from = order.indexOf(key), to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  next.splice(from, 1); next.splice(to, 0, key)
  return next
}
/** Reuse the display order without mutating transaction arrays. */
export function orderRows<T>(rows: T[], order: string[], key: (row: T) => string): T[] {
  const ranks = new Map(order.map((k, i) => [k, i]))
  return [...rows].sort((a, b) => (ranks.get(key(a)) ?? order.length) - (ranks.get(key(b)) ?? order.length))
}
