/** Counts are cumulative reach, not a reordering of the sales stages. */
export function funnelReach(counts: Record<string, { n: number }>) {
  const keys = ['start', 'qualify', 'advance', 'won']
  return keys.map((key, i) => ({ key, value: keys.slice(i).reduce((n, k) => n + Math.max(0, counts[k]?.n || 0), 0) }))
}
export function funnelGeometry(values: number[]) {
  const clean = values.map(v => Number.isFinite(v) ? Math.max(0, v) : 0)
  const max = Math.max(1, ...clean)
  const widths = clean.map(v => v === 0 ? 0 : Math.max(8, 280 * v / max))
  return widths.map((width, i) => {
    const bottom = width * .82
    const y = i * 54 + 8
    return { width, path: `M ${160 - width / 2} ${y} L ${160 + width / 2} ${y} L ${160 + bottom / 2} ${y + 44} L ${160 - bottom / 2} ${y + 44} Z` }
  })
}
