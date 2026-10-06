/**
 * ناوبریِ درون‌تبی بین «عملکرد» و «گزارشات» (بدونِ state سراسری):
 * پیش از go(tab) مقصد را می‌گذاریم؛ صفحهٔ مقصد هنگامِ mount آن را می‌خواند و پاک می‌کند.
 * همچنین نگاشتِ سازگاری برای شناسه‌های قدیمی (مثلاً تبِ E = p-kpi ← «عملکرد › فعالیت»).
 */
export type PerfTarget = 'dash' | 'people' | 'recon' | 'activity' | 'data' | 'summary' | 'lawyer'
let next: PerfTarget | null = null
export const setPerfView = (v: PerfTarget) => { next = v }
export const takePerfView = <T extends PerfTarget>(allowed: readonly T[], fallback: T): T => (next && (allowed as readonly string[]).includes(next) ? (next as T) : fallback)
export const clearPerfView = () => { next = null }
/** شناسه‌های قدیمی ← [تبِ جدید، بخش] */
export const TAB_ALIASES: Record<string, [string, PerfTarget]> = { 'p-kpi': ['performance', 'activity'] }
