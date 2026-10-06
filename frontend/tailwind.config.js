import containerQueries from '@tailwindcss/container-queries'

// رنگ‌ها = توکن‌های تم (src/index.css)؛ <alpha-value> تا bg-primary/10 و مانندش کار کند
const t = (v) => `hsl(var(--${v}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chart: Object.fromEntries(['background', 'foreground', 'foreground-muted', 'label', 'line-primary', 'line-secondary', 'crosshair', 'grid', 'indicator-color', 'indicator-secondary-color', 'marker-background', 'marker-border', 'marker-foreground', 'marker-badge-background', 'marker-badge-foreground', 'segment-background', 'segment-line', 'brush-border', 'tooltip-background', 'tooltip-foreground', 'tooltip-muted'].map(name => [name, `var(--chart-${name})`])),
        border: t('border'),
        background: t('bg'),
        foreground: t('text'),
        bg: t('bg'),
        surface: t('surface'),
        card: { DEFAULT: t('card'), foreground: t('text') },
        muted: { DEFAULT: t('muted'), foreground: t('muted-foreground') },
        primary: { DEFAULT: t('primary'), foreground: t('primary-foreground'), ink: t('primary-ink') },
        secondary: { DEFAULT: t('secondary'), foreground: t('secondary-foreground'), ink: t('secondary-ink') },
        accent: { DEFAULT: t('accent'), foreground: t('accent-foreground'), ink: t('accent-ink') },
        hover: t('hover'),
        active: t('active'),
        focus: t('focus'),
        overlay: t('overlay'),
        shadow: t('shadow'),
        success: t('success'),
        warning: t('warning'),
        error: t('error'),
        ring: t('focus'),
        gold: t('warning'),
        moss: t('success'),
        rose: t('error'),
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      boxShadow: { card: '0 1px 2px hsl(var(--shadow) / .05), 0 14px 34px -20px hsl(var(--shadow) / .22)' },
      fontFamily: { sans: ['Peyda', 'PeydaWeb', 'Vazirmatn', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [containerQueries],
}
