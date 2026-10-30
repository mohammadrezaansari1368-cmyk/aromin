/** Shared invalidation for successful imports; stale requests cannot overwrite invalidated data. */
export const PERF_CACHE_TTL = 60_000
const cache = new Map<string, { data: unknown; at: number }>()
const listeners = new Set<() => void>()
let generation = 0
export const perfCacheGeneration = () => generation
export function clearPerfCache() { cache.forEach((hit) => { hit.at = -Infinity }); generation++; listeners.forEach((fn) => fn()) }
export function readPerfCache<T>(key: string): T | undefined {
 const hit = cache.get(key)
 if (!hit) return undefined
 return hit.data as T
}
export function writePerfCache(key: string, data: unknown, expectedGeneration: number) {
 if (generation === expectedGeneration) cache.set(key, { data, at: Date.now() })
}
export function subscribePerfCache(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

export const perfCacheRemaining = (key: string) => Math.max(0, PERF_CACHE_TTL - (Date.now() - (cache.get(key)?.at ?? 0)))
