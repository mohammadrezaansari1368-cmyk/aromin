/**
 * کلاس‌های مشترکِ Design System — همه فقط از توکن‌های موجود (index.css + tailwind.config: --radius، --focus، --shadow، رنگ‌های تم).
 * کارت‌های داشبورد، تنظیمات، ایمپورت، گزارش‌ها و سایدبار از همین‌ها استفاده می‌کنند تا یک زبانِ بصری داشته باشند.
 */
export const FOCUS = 'outline-none focus-visible:ring-4 focus-visible:ring-ring/30'
/** سطحِ کارت: شعاع = --radius، خطِ دور = border، سایه = shadow-card */
export const CARD = 'rounded-lg bg-card text-card-foreground ring-1 ring-inset ring-border shadow-card'
export const CARD_PAD = 'p-4 sm:p-5'
export const CARD_TITLE = 'text-[15px] font-extrabold leading-7 text-foreground'
export const CARD_SUB = 'mt-0.5 max-w-[75ch] text-[12.5px] leading-6 text-muted-foreground'
export const BTN = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-4 text-[12.5px] font-bold transition disabled:pointer-events-none disabled:opacity-50 ${FOCUS}`
export const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-hover`
export const BTN_GHOST = `${BTN} bg-card text-foreground ring-1 ring-border hover:bg-muted`
export const BTN_DANGER = `${BTN} text-error ring-1 ring-error/30 hover:bg-error/10`
export const INPUT = 'min-h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none transition placeholder:text-muted-foreground/80 hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-ring/15 disabled:opacity-60'
