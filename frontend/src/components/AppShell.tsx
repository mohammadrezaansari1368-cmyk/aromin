'use client'

/**
 * پوستهٔ اپ — سایدبارِ RTL + نوارِ بالا + سوییچِ تب‌ها. همهٔ ابزارهای اپِ کامل این‌جا هستند:
 * تب‌های بومی (view) + تب‌هایی که هنوز روی موتورِ اپِ کامل اجرا می‌شوند (panel، با پوستهٔ طراحیِ جدید).
 * برای ایمنیِ داده: خروج از تبِ موتور → ذخیرهٔ فوری؛ ورود به آن بعد از تبِ بومی → بارگذاریِ تازه از سرور.
 */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LiveProvider } from '@/components/ui/kit'
import KidGuide from '@/components/ui/KidGuide'
import { useTabReveal } from '@/lib/motion'
import Board from '@/components/dashboard/Board'
import ImportPage from '@/components/ImportPage'
import ForecastPage from '@/components/forecast/ForecastPage'
import LegacyHost, { type LegacyHostHandle } from '@/components/LegacyHost'
import SignupRequests from '@/components/SignupRequests'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import { bindHost } from '@/lib/agent'
import { listenTaskImports } from '@/lib/performance'
import { setTileUser } from '@/components/ui/sortable'
import GoogleSettings from '@/components/agent/GoogleSettings'
import { KbConnectionCard } from '@/components/KnowledgeTile'
import { flushLedger } from '@/lib/ledgerStore'

// دستیارِ عامل (دکمهٔ سه‌بعدی + گفت‌وگو/صدا) — جدا بارگذاری می‌شود تا پوسته سبک بماند
const AgentDock = lazy(() => import('@/components/agent/AgentDock'))
// حضور و عملکرد (recharts + xlsx) — فقط وقتی تب باز شود بارگذاری می‌شود
const PerformancePage = lazy(() => import('@/components/performance/PerformancePage'))
const ReportsPerf = lazy(() => import('@/components/performance/PerformancePage').then((m) => ({ default: m.ReportsPerf })))
// دفتر فروش (C1…C6) — بومی؛ فقط وقتی تب باز شود بارگذاری می‌شود
const LedgerPage = lazy(() => import('@/components/ledger/LedgerPage'))
const CouncilRoom = lazy(() => import('@/components/council/CouncilRoom'))
const InstagramPage = lazy(() => import('@/components/instagram/InstagramPage'))
const InstagramConnectorCard = lazy(() => import('@/components/instagram/InstagramConnectorCard'))
const StarlightCluster = lazy(() => import('@/components/analytics/StarlightCluster'))
const WidgetInstallCard = lazy(() => import('@/components/WidgetInstallCard'))
const SalesAgentCard = lazy(() => import('@/components/sales/SalesAgentCard'))
const AgentSettingsCard = lazy(() => import('@/components/agent/AgentSettingsCard'))
const MessengerTokensCard = lazy(() => import('@/components/settings/MessengerTokensCard'))
const AgentsCard = lazy(() => import('@/components/agent/AgentsCard'))
const ReleaseCard = lazy(() => import('@/components/settings/ReleaseCard'))
const WebServiceCard = lazy(() => import('@/components/settings/WebServiceCard'))
const LeadsCard = lazy(() => import('@/components/sales/LeadsCard'))
import { TAB_ALIASES, setPerfView, takePerfView } from '@/components/performance/perfNav'
import { takeDeepLink } from '@/lib/deepLink'
import { isAdmin, roleLabel, type Session } from '@/lib/auth'
import { FOCUS } from '@/components/ui/tokens'

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
	{ id: 'p-dash', label: 'تحلیل مدیریتی', sub: 'Analytics', icon: I('M3 3v18h18|M8 17V11|M13 17V7|M18 17v-4'), view: (s) => <Suspense fallback={null}><StarlightCluster session={s} /></Suspense>, panel: 'p-dash' },
	{ id: 'p-inv', label: 'دفتر فروش', sub: 'Sales Ledger', icon: I('M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z|M15 4v5h5|M8 13h8M8 17h5'), view: (s, go) => <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted/50" />}><LedgerPage session={s} go={go} /></Suspense> },
	{ id: 'p-team', label: 'جبران خدمات و پورسانت', sub: 'Compensation', icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8'), panel: 'p-team' },
	{ id: 'performance', label: 'عملکرد', sub: 'Performance', icon: I('M22 12h-4l-3 8-4-16-3 8H2'), view: (s, go, setPanel) => <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted/50" />}><PerformancePage session={s} initial={takePerfView(['dash', 'people', 'recon', 'activity', 'data'] as const, 'dash')} go={go} setPanel={setPanel} /></Suspense> },
	{ id: 'p-ticket', label: 'پشتیبانی و تیکتینگ', sub: 'Support', icon: I('M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z'), panel: 'p-ticket' },
	{ id: 'forecast', label: 'پیش‌بینی و بودجه', sub: 'Forecast', icon: I('M3 3v18h18|M7 16l3-3 3 2 5-6'), view: (s, go) => <ForecastPage session={s} goImport={() => go('import')} /> },
	{ id: 'council', label: 'اتاق شورا', sub: 'Council', icon: I('M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z|M19 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z|M3 20c1-3 3-4 5-4h8c2 0 4 1 5 4'), view: (s) => (isAdmin(s.role) ? <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted/50" />}><CouncilRoom session={s} /></Suspense> : <p className="text-[13px] text-muted-foreground">فقط مدیر.</p>) },
	{ id: 'instagram', label: 'اینستاگرام', sub: 'Instagram', icon: I('M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z|M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M17.5 6.5h.01'), view: (s, go) => (isAdmin(s.role) ? <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted/50" />}><InstagramPage session={s} goSettings={() => go('p-set')} /></Suspense> : <p className="text-[13px] text-muted-foreground">فقط مدیر.</p>) },
	{ id: 'p-ladder', label: 'نردبان پیشرفت', sub: 'Growth Ladder', icon: I('M7 3v18|M17 3v18|M7 7h10|M7 12h10|M7 17h10'), panel: 'p-ladder' },
	{ id: 'import', label: 'مرکز ایمپورت', sub: 'Import Center', icon: I('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3'), view: (s) => <ImportPage session={s} /> },
	{ id: 'p-report', label: 'گزارش و بک‌آپ', sub: 'Reports', icon: I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6'), view: (s, go) => <Suspense fallback={null}>{(isAdmin(s.role) || s.role === 'finance') && <LeadsCard session={s} />}<ReportsPerf session={s} go={go} initial={takePerfView(['summary', 'lawyer'] as const, 'summary')} /></Suspense>, panel: 'p-report' },
	{ id: 'p-calc', label: 'ماشین‌حساب', sub: 'Calculator', icon: I('M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z|M8 6h8|M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2'), panel: 'p-calc' },
	{ id: 'p-hire', label: 'استخدام', sub: 'Hiring', icon: I('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6'), panel: 'p-hire' },
	{ id: 'p-set', label: 'تنظیمات', sub: 'Settings', icon: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'), view: (s) => <><Suspense fallback={null}><WidgetInstallCard session={s} />{isAdmin(s.role) && <><AgentSettingsCard session={s} /><AgentsCard session={s} /><MessengerTokensCard session={s} /><ReleaseCard /><WebServiceCard session={s} /><InstagramConnectorCard session={s} /><SalesAgentCard session={s} /></>}</Suspense><GoogleSettings session={s} /><KbConnectionCard session={s} /></>, panel: 'p-set' },
]

export default function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
	const [active, setActive] = useState(() => { const t = takeDeepLink().tab; return t && TABS.some((x) => x.id === t) ? t : 'dashboard' })
	const [reload, setReload] = useState(false)
	const [busy, setBusy] = useState(false)
	const host = useRef<LegacyHostHandle>(null)
	const mainRef = useRef<HTMLElement>(null)
	const [drawer, setDrawer] = useState(false)
	const menuBtn = useRef<HTMLButtonElement>(null)
	const drawerClose = useRef<HTMLButtonElement>(null)
	const closeDrawer = useCallback(() => { setDrawer(false); menuBtn.current?.focus() }, [])
	useEffect(() => {
		if (!drawer) return
		drawerClose.current?.focus()
		const prev = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
		window.addEventListener('keydown', esc)
		return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc) }
	}, [drawer, closeDrawer])
	const [rail, setRail] = useState(() => { try { return localStorage.getItem('aromin.sidebar.collapsed') === '1' } catch { return false } })
	const toggleRail = useCallback(() => setRail((v) => { try { localStorage.setItem('aromin.sidebar.collapsed', v ? '0' : '1') } catch { /* private mode */ } return !v }), [])
	useEffect(() => {
		const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); toggleRail() } }
		window.addEventListener('keydown', k)
		return () => window.removeEventListener('keydown', k)
	}, [toggleRail])
	useTabReveal(mainRef, active)
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
				{/* 3.9.78: سایدبار به سبکِ Claude — باز (۲۶۰px، آیکون + نام) یا بسته (ریلِ ۵۶px، فقط آیکون با راهنمای شناور)؛ دکمهٔ پنل بالا، Ctrl+. ، وضعیت در این مرورگر می‌ماند */}
				<aside data-testid="sidebar" data-collapsed={rail ? 'true' : 'false'}
					className={`sticky top-0 hidden h-screen shrink-0 flex-col border-l border-border/60 bg-surface/70 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex ${rail ? 'w-14 px-2 py-3' : 'w-[260px] px-3 py-3'}`}>
					<div className={`mb-3 flex items-center ${rail ? 'flex-col gap-2' : 'justify-between gap-2 px-1'}`}>
						{rail ? <img src="/aromin-mark.svg" alt="آرومین" className="size-7" /> : <img src="/aromin-logo.webp" alt="آرومین" className="h-7 w-auto" />}
						<button type="button" onClick={toggleRail} aria-label={rail ? 'باز کردنِ سایدبار' : 'بستنِ سایدبار'} aria-expanded={!rail} title={(rail ? 'باز کردن' : 'بستن') + ' (Ctrl+.)'}
							className={`grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground ${FOCUS}`}>
							<svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" />{rail ? <path d="M9 10l-2 2 2 2" /> : <path d="M7 10l2 2-2 2" />}
							</svg>
						</button>
					</div>
					<nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-1" aria-label="بخش‌ها">
						{TABS.map((t) => {
							const on = t.id === active
							return (
								<button
									key={t.id}
									onClick={() => go(t.id)}
									disabled={busy}
									aria-current={on ? 'page' : undefined}
									aria-label={rail ? t.label : undefined}
									title={rail ? t.label : undefined}
									className={`group flex min-h-10 items-center rounded-lg text-right transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS} ${rail ? 'justify-center px-0' : 'gap-3 px-2.5'} ${
										on ? 'bg-foreground/[.07] font-semibold text-foreground' : 'text-foreground/80 hover:bg-foreground/[.04] hover:text-foreground'
									}`}>
									<span className={`shrink-0 ${on ? 'text-primary-ink' : 'text-muted-foreground group-hover:text-foreground'}`}>{t.icon}</span>
									{!rail && <span className="truncate text-[13.5px]">{t.label}</span>}
								</button>
							)
						})}
					</nav>
					<div className={`mt-2 flex items-center border-t border-border/60 pt-3 ${rail ? 'flex-col gap-2' : 'gap-2.5 px-1'}`}>
						<span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground" title={rail ? session.name + ' · ' + roleLabel(session.role) : undefined}>
							{(session.name || 'ک').slice(0, 1)}
						</span>
						{!rail && <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{session.name}</div><div className="truncate text-[11px] text-muted-foreground">{roleLabel(session.role)}</div></div>}
						<button type="button" onClick={logout} aria-label="خروج" title="خروج"
							className={`grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-error ${FOCUS}`}>
							<svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></svg>
						</button>
					</div>
				</aside>

				{/* محتوا */}
				<div className="flex min-w-0 flex-1 flex-col">
					<header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:px-6">
						{/* 3.9.79: موبایل — دکمهٔ منو و کشوی کناری به سبکِ اپِ Claude (به‌جای فهرستِ کشویی) */}
						<button ref={menuBtn} type="button" onClick={() => setDrawer(true)} aria-label="منو" aria-expanded={drawer} aria-controls="mobile-drawer"
							className={`grid size-10 shrink-0 place-items-center rounded-lg text-foreground transition-colors hover:bg-foreground/[.06] lg:hidden ${FOCUS}`}>
							<svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
						</button>
						<h1 className="min-w-0 truncate text-[15px] font-semibold sm:text-lg sm:font-extrabold">{tab.label}</h1>
						<div className="mr-auto flex items-center gap-2">
							{isAdmin(session.role) && <SignupRequests beforeWrite={async () => { await host.current?.flush() }} afterWrite={() => host.current?.reload()} />}
							<ThemeSwitcher />
						</div>
					</header>
					<main ref={mainRef} className="mx-auto w-full max-w-[1180px] flex-1 p-4 sm:p-6">
						<KidGuide tab={active} />
						{tab.view && tab.view(session, go, setPanel)}
						<LegacyHost ref={host} session={session} panel={panel} reload={reload} />
					</main>
				</div>
				{drawer && (
					<div className="fixed inset-0 z-50 lg:hidden" data-testid="mobile-drawer-root">
						<button type="button" aria-label="بستنِ منو" tabIndex={-1} onClick={closeDrawer} className="absolute inset-0 bg-overlay/45 backdrop-blur-[2px] motion-safe:animate-[fadein_.2s_ease-out]" />
						<nav id="mobile-drawer" aria-label="بخش‌ها" className="absolute inset-y-0 right-0 flex w-[min(300px,86vw)] flex-col bg-background px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] shadow-2xl motion-safe:animate-[drawer-in_.24s_cubic-bezier(.16,1,.3,1)]">
							<div className="mb-3 flex items-center justify-between px-1">
								<img src="/aromin-logo.webp" alt="آرومین" className="h-7 w-auto" />
								<button ref={drawerClose} type="button" onClick={closeDrawer} aria-label="بستنِ منو" className={`grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[.06] ${FOCUS}`}>
									<svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
								</button>
							</div>
							<div className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
								{TABS.map((t) => {
									const on = t.id === active
									return (
										<button key={t.id} type="button" disabled={busy} aria-current={on ? 'page' : undefined} onClick={() => { go(t.id); closeDrawer() }}
											className={`flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-right transition-colors disabled:opacity-60 ${FOCUS} ${on ? 'bg-foreground/[.07] font-semibold text-foreground' : 'text-foreground/85 hover:bg-foreground/[.04]'}`}>
											<span className={`shrink-0 ${on ? 'text-primary-ink' : 'text-muted-foreground'}`}>{t.icon}</span>
											<span className="truncate text-[14.5px]">{t.label}</span>
										</button>
									)
								})}
							</div>
							<div className="mt-2 flex items-center gap-2.5 border-t border-border/60 px-1 pt-3">
								<span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">{(session.name || 'ک').slice(0, 1)}</span>
								<div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-semibold">{session.name}</div><div className="truncate text-[11.5px] text-muted-foreground">{roleLabel(session.role)}</div></div>
								<button type="button" onClick={logout} aria-label="خروج" className={`grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-error ${FOCUS}`}>
									<svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></svg>
								</button>
							</div>
						</nav>
					</div>
				)}
				<Suspense fallback={null}><AgentDock role={session.role} /></Suspense>
			</div>
		</LiveProvider>
	)
}
