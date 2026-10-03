'use client'

/**
 * پوستهٔ اپ — سایدبارِ RTL + نوارِ بالا + سوییچِ تب‌ها. همهٔ ابزارهای اپِ کامل این‌جا هستند:
 * تب‌های بومی (view) + تب‌هایی که هنوز روی موتورِ اپِ کامل اجرا می‌شوند (panel، با پوستهٔ طراحیِ جدید).
 * برای ایمنیِ داده: خروج از تبِ موتور → ذخیرهٔ فوری؛ ورود به آن بعد از تبِ بومی → بارگذاریِ تازه از سرور.
 */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LiveProvider } from '@/components/ui/kit'
import Board from '@/components/dashboard/Board'
import ImportPage from '@/components/ImportPage'
import ForecastPage from '@/components/forecast/ForecastPage'
import LegacyHost, { type LegacyHostHandle } from '@/components/LegacyHost'
import SignupRequests from '@/components/SignupRequests'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import { bindHost } from '@/lib/agent'
import { listenTaskImports } from '@/lib/performance'
import { setTileUser } from '@/components/ui/sortable'
import { KbConnectionCard } from '@/components/KnowledgeTile'
import { flushLedger } from '@/lib/ledgerStore'

// دستیارِ عامل (دکمهٔ سه‌بعدی + گفت‌وگو/صدا) — جدا بارگذاری می‌شود تا پوسته سبک بماند
const AgentDock = lazy(() => import('@/components/agent/AgentDock'))
// حضور و عملکرد (recharts + xlsx) — فقط وقتی تب باز شود بارگذاری می‌شود
const PerformancePage = lazy(() => import('@/components/performance/PerformancePage'))
const ReportsPerf = lazy(() => import('@/components/performance/PerformancePage').then((m) => ({ default: m.ReportsPerf })))
const PerfSettingsCard = lazy(() => import('@/components/performance/PerformancePage').then((m) => ({ default: m.PerfSettingsCard })))
// دفتر فروش (C1…C6) — بومی؛ فقط وقتی تب باز شود بارگذاری می‌شود
const LedgerPage = lazy(() => import('@/components/ledger/LedgerPage'))
const StarlightCluster = lazy(() => import('@/components/analytics/StarlightCluster'))
const WidgetInstallCard = lazy(() => import('@/components/WidgetInstallCard'))
const SalesAgentCard = lazy(() => import('@/components/sales/SalesAgentCard'))
const LeadsCard = lazy(() => import('@/components/sales/LeadsCard'))
import { TAB_ALIASES, setPerfView, takePerfView } from '@/components/performance/perfNav'
import { isAdmin, roleLabel, type Session } from '@/lib/auth'
import { BTN_GHOST, FOCUS, INPUT } from '@/components/ui/tokens'

interface Tab {
	id: string
	label: string
	sub: string
	icon: ReactNode
	view?: (s: Session, go: (id: string) => void, setPanel: (p: string | null) => void) => ReactNode
	panel?: string
}

const I = (d: string) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
		{d.split('|').map((p, i) => (
			<path key={i} d={p} />
		))}
	</svg>
)

const TABS: Tab[] = [
	{ id: 'dashboard', label: 'داشبورد', sub: 'Executive', icon: I('M3 13a9 9 0 0 1 18 0|M12 13l4-3|M3 13v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4'), view: (s) => <Board session={s} /> },
	{ id: 'p-dash', label: 'تحلیل مدیریتی', sub: 'Analytics', icon: I('M3 3v18h18|M8 17V11|M13 17V7|M18 17v-4'), view: () => <Suspense fallback={null}><StarlightCluster /></Suspense>, panel: 'p-dash' },
	{ id: 'p-inv', label: 'دفتر فروش', sub: 'Sales Ledger', icon: I('M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z|M15 4v5h5|M8 13h8M8 17h5'), view: (s, go) => <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted/50" />}><LedgerPage session={s} go={go} /></Suspense> },
	{ id: 'p-team', label: 'جبران خدمات و پورسانت', sub: 'Compensation', icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8'), panel: 'p-team' },
	{ id: 'performance', label: 'عملکرد', sub: 'Performance', icon: I('M22 12h-4l-3 8-4-16-3 8H2'), view: (s, go, setPanel) => <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted/50" />}><PerformancePage session={s} initial={takePerfView(['dash', 'people', 'recon', 'activity', 'data'] as const, 'dash')} go={go} setPanel={setPanel} /></Suspense> },
	{ id: 'p-ticket', label: 'پشتیبانی و تیکتینگ', sub: 'Support', icon: I('M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z'), panel: 'p-ticket' },
	{ id: 'forecast', label: 'پیش‌بینی و بودجه', sub: 'Forecast', icon: I('M3 3v18h18|M7 16l3-3 3 2 5-6'), view: (s, go) => <ForecastPage session={s} goImport={() => go('import')} /> },
	{ id: 'p-ladder', label: 'نردبان پیشرفت', sub: 'Growth Ladder', icon: I('M7 3v18|M17 3v18|M7 7h10|M7 12h10|M7 17h10'), panel: 'p-ladder' },
	{ id: 'import', label: 'مرکز ایمپورت', sub: 'Import Center', icon: I('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3'), view: (s) => <ImportPage session={s} /> },
	{ id: 'p-report', label: 'گزارش و بک‌آپ', sub: 'Reports', icon: I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6'), view: (s, go) => <Suspense fallback={null}>{(isAdmin(s.role) || s.role === 'finance') && <LeadsCard session={s} />}<ReportsPerf session={s} go={go} initial={takePerfView(['summary', 'lawyer'] as const, 'summary')} /></Suspense>, panel: 'p-report' },
	{ id: 'p-calc', label: 'ماشین‌حساب', sub: 'Calculator', icon: I('M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z|M8 6h8|M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2'), panel: 'p-calc' },
	{ id: 'p-hire', label: 'استخدام', sub: 'Hiring', icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6'), panel: 'p-hire' },
	{ id: 'p-set', label: 'تنظیمات', sub: 'Settings', icon: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'), view: (s) => <><Suspense fallback={null}><WidgetInstallCard session={s} />{isAdmin(s.role) && <SalesAgentCard session={s} />}</Suspense><KbConnectionCard session={s} /><Suspense fallback={null}><PerfSettingsCard session={s} /></Suspense></>, panel: 'p-set' },
]

export default function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
	const [active, setActive] = useState('dashboard')
	const [reload, setReload] = useState(false)
	const [busy, setBusy] = useState(false)
	const host = useRef<LegacyHostHandle>(null)
	const tab = TABS.find((t) => t.id === active) ?? TABS[0]
	// پنلِ موتورِ قبلی برای تبِ یکی‌شدهٔ «عملکرد» پویاست (فقط در بخشِ «فعالیت، امتیاز و ردیاب»)
	const [subPanel, setSubPanel] = useState<string | null>(null)
	const panelOf = (t: Tab) => (t.id === 'performance' ? subPanel : t.panel ?? null)
	const panel = panelOf(tab)
	const panelRef = useRef(panel)
	const setPanel = useCallback((p: string | null) => {
		const was = panelRef.current
		if (was === p) return
		if (was && !p) host.current?.flush() // خروج از موتور ← ذخیرهٔ فوری
		if (!was && p) setReload(true) // ورود به موتور از بومی ← بارگذاریِ تازه
		panelRef.current = p
		setSubPanel(p)
	}, [])
	setTileUser(session.user || session.name) // چیدمانِ کاشیِ تب‌های بومی برای هر کاربر جدا

	const go = async (id0: string) => {
		// شناسه‌های قدیمی (مثلاً p-kpi = تبِ E) ← تبِ جدید + بخش
		const alias = TAB_ALIASES[id0]
		if (alias) setPerfView(alias[1])
		const id = alias ? alias[0] : id0
		if (id === active || busy) return
		const next = TABS.find((t) => t.id === id)
		if (!next) return
		// خروج از دفترِ بومی → ویرایش‌های در صف اول روی سرور بنشینند (تا موتورِ قبلی دادهٔ تازه بخواند)
		if (active === 'p-inv') { setBusy(true); try { await flushLedger() } catch { /* خطا در نوارِ دفتر دیده می‌شود؛ صف حفظ است */ } finally { setBusy(false) } }
		if (panel && !next.panel) {
			// خروج از موتور → اول ذخیرهٔ فوری، بعد تبِ بومی (که دادهٔ تازه را می‌خواند)
			setBusy(true)
			try { await host.current?.flush() } finally { setBusy(false) }
		}
		setReload(!panel) // ورود از تبِ بومی (یا بارِ اول) → بارگذاریِ تازه از سرور
		if (id !== 'performance') { panelRef.current = null; setSubPanel(null) }
		setActive(id)
		window.scrollTo({ top: 0 })
	}
	// دستیار به ناوبری، ذخیرهٔ فوری و بارگذاریِ دوبارهٔ موتور دسترسی دارد (فقط از همین مسیرهای موجود)
	const activeRef = useRef(active)
	const goRef = useRef(go)
	useLayoutEffect(() => { activeRef.current = active; goRef.current = go; panelRef.current = panel })
	useEffect(() => {
		bindHost({
			session,
			tabs: TABS.map(({ id, label, sub }) => ({ id, label, sub })),
			activeTab: () => activeRef.current,
			go: (id) => goRef.current(id),
			flush: async () => { await host.current?.flush() },
			reload: () => host.current?.reload(),
		})
		return () => bindHost(null)
	}, [session])
	// همان فایلِ وظایفِ ایمپورت‌شده برای «حضور و عملکرد» هم ثبت شود (فقط مدیران/مالی؛ فقط پیامِ هم‌دامنه)
	useEffect(() => listenTaskImports(session), [session])

	const logout = async () => {
		try { await flushLedger() } catch { /* */ }
		if (panel) await host.current?.flush()
		onLogout()
	}

	return (
		<LiveProvider>
			<div dir="rtl" className="flex min-h-screen w-full bg-background text-foreground">
				{/* سایدبار */}
				<aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-1 border-l border-border bg-surface p-4 lg:flex">
					<div className="mb-4 flex items-center gap-2 px-1">
						<img src="/aromin-logo.webp" alt="آرومین" className="h-8 w-auto" />
					</div>
					<div className="mb-2 flex items-center gap-3 rounded-lg bg-muted/60 p-3">
						<span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
							{(session.name || 'ک').slice(0, 1)}
						</span>
						<div className="min-w-0">
							<div className="truncate text-sm font-bold">{session.name}</div>
							<div className="truncate text-[11px] text-muted-foreground">{roleLabel(session.role)}</div>
						</div>
					</div>
					<nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
						{TABS.map((t) => {
							const on = t.id === active
							return (
								<button
									key={t.id}
									onClick={() => go(t.id)}
									disabled={busy}
									aria-current={on ? 'page' : undefined}
									className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-right transition disabled:cursor-wait disabled:opacity-60 ${FOCUS} ${
										on ? 'bg-gradient-to-l from-primary to-active text-primary-foreground shadow-card' : 'text-foreground hover:bg-muted'
									}`}>
									<span className={on ? 'text-primary-foreground' : 'text-muted-foreground'}>{t.icon}</span>
									<span className="flex min-w-0 flex-col leading-tight">
										<span className="truncate text-[13px] font-bold">{t.label}</span>
										<span className={`truncate text-[10px] ${on ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{t.sub}</span>
									</span>
								</button>
							)
						})}
					</nav>
					<button type="button" onClick={logout} className={`mt-2 w-full ${BTN_GHOST}`}>
						خروج
					</button>
				</aside>

				{/* محتوا */}
				<div className="flex min-w-0 flex-1 flex-col">
					<header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
						<h1 className="hidden min-w-0 truncate text-lg font-extrabold sm:block">{tab.label}</h1>
						<div className="mr-auto flex items-center gap-2">
							{isAdmin(session.role) && <SignupRequests beforeWrite={async () => { await host.current?.flush() }} afterWrite={() => host.current?.reload()} />}
							<ThemeSwitcher />
						</div>
						<img src="/aromin-logo.webp" alt="آرومین" className="h-7 w-auto lg:hidden" />
						{/* ناوبریِ موبایل */}
						<select
							value={active}
							onChange={(e) => go(e.target.value)}
							className={`${INPUT} min-h-9 min-w-0 max-w-[44vw] px-2 lg:hidden`}
							aria-label="تب">
							{TABS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
						</select>
					</header>
					<main className="mx-auto w-full max-w-[1180px] flex-1 p-4 sm:p-6">
						{tab.view && tab.view(session, go, setPanel)}
						<LegacyHost ref={host} session={session} panel={panel} reload={reload} />
					</main>
				</div>
				<Suspense fallback={null}><AgentDock role={session.role} /></Suspense>
			</div>
		</LiveProvider>
	)
}
