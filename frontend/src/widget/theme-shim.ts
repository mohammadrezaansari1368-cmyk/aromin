/**
 * جانشینِ '@/lib/theme' فقط در باندلِ ابزارکِ سایت (vite.widget.config.ts):
 * روی سایتِ دیگر متغیرهای CSSِ داشبورد نیستند؛ همان توکن‌ها از تنظیماتِ ابزارک می‌آیند.
 * پیش‌فرض‌ها = تمِ پیش‌فرضِ داشبورد (بنفش، روشن).
 */
import { useSyncExternalStore } from 'react'

const palette: Record<string, string> = { primary: '#910D6C', 'primary-foreground': '#FFFFFF', accent: '#FABB00' }
let version = 0
const subs = new Set<() => void>()

export function setPalette(p: Record<string, string>) {
	Object.assign(palette, p)
	version++
	subs.forEach((f) => f())
}
export const useTheme = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version)
export const tokenHex = (name: string) => palette[name] || palette.primary
