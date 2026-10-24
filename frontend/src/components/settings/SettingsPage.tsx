/**
 * تنظیمات به سبکِ Claude Desktop (3.9.81): فهرستِ ساده‌ی بخش‌ها در کنار، محتوای همان بخش با عنوان و ردیف‌های تخت (بدونِ کارتِ سایه‌دار).
 * بخشِ انتخاب‌شده در همین مرورگر می‌ماند؛ «طرحِ پورسانت» همان پنلِ قدیمیِ p-set را زیرِ عنوان نشان می‌دهد.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import GoogleSettings from '@/components/agent/GoogleSettings'
import { KbConnectionCard } from '@/components/KnowledgeTile'
import { isAdmin, roleLabel, type Session } from '@/lib/auth'

const InstagramConnectorCard = lazy(() => import('@/components/instagram/InstagramConnectorCard'))
const WidgetInstallCard = lazy(() => import('@/components/WidgetInstallCard'))
const SalesAgentCard = lazy(() => import('@/components/sales/SalesAgentCard'))
const AgentSettingsCard = lazy(() => import('@/components/agent/AgentSettingsCard'))
const MessengerTokensCard = lazy(() => import('@/components/settings/MessengerTokensCard'))
const AgentsCard = lazy(() => import('@/components/agent/AgentsCard'))
const ReleaseCard = lazy(() => import('@/components/settings/ReleaseCard'))
const WebServiceCard = lazy(() => import('@/components/settings/WebServiceCard'))

type Sec = { id: string; label: string; hint: string; admin?: boolean; legacy?: boolean; body: (s: Session) => ReactNode }
const Row = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
	<div className="flex items-center justify-between gap-4 border-b border-border/60 py-4">
		<div className="min-w-0"><div className="text-[14px] font-medium">{title}</div>{hint && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{hint}</div>}</div>
		<div className="shrink-0">{children}</div>
	</div>
)

export const SECTIONS: Sec[] = [
	{ id: 'general', label: 'عمومی', hint: 'حساب، ظاهر و نسخه', body: (s) => <>
		<Row title="حساب" hint={roleLabel(s.role)}><span className="text-[13px] text-muted-foreground">{s.name}</span></Row>
		<Row title="ظاهر" hint="تمِ روشن، تیره یا برند"><ThemeSwitcher /></Row>
		{isAdmin(s.role) && <ReleaseCard />}
	</> },
	{ id: 'plan', label: 'طرحِ پورسانت', hint: 'قواعدِ محاسبه و سقف‌ها', legacy: true, body: () => null },
	{ id: 'assistant', label: 'دستیار', hint: 'رفتار، ایجنت‌ها و کارشناسِ فروش', admin: true, body: (s) => <><AgentSettingsCard session={s} /><AgentsCard session={s} /><SalesAgentCard session={s} /></> },
	{ id: 'connectors', label: 'اتصال‌ها', hint: 'پیام‌رسان‌ها، اینستاگرام، گوگل و دانشنامه', body: (s) => <>
		{isAdmin(s.role) && <><MessengerTokensCard session={s} /><InstagramConnectorCard session={s} /></>}
		<GoogleSettings session={s} /><KbConnectionCard session={s} />
	</> },
	{ id: 'widget', label: 'ابزارکِ سایت', hint: 'پاپ‌آپِ گفت‌وگو روی arominco.com', body: (s) => <WidgetInstallCard session={s} /> },
	{ id: 'developer', label: 'توسعه‌دهنده', hint: 'کلیدِ API و وب‌سرویس', admin: true, body: (s) => <WebServiceCard session={s} /> },
]
const KEY = 'aromin.settings.section'

export default function SettingsPage({ session, setPanel }: { session: Session; setPanel?: (p: string | null) => void }) {
	const list = SECTIONS.filter((x) => !x.admin || isAdmin(session.role))
	const [id, setId] = useState(() => { try { return localStorage.getItem(KEY) || 'general' } catch { return 'general' } })
	const sec = list.find((x) => x.id === id) || list[0]
	useEffect(() => { setPanel?.(sec.legacy ? 'p-set' : null) }, [sec, setPanel])
	const pick = (v: string) => { setId(v); try { localStorage.setItem(KEY, v) } catch { /* private mode */ } }
	return (
		<div dir="rtl" className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]" data-testid="settings-page">
			<nav aria-label="بخش‌های تنظیمات" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible">
				{list.map((x) => (
					<button key={x.id} type="button" onClick={() => pick(x.id)} aria-current={x.id === sec.id ? 'page' : undefined}
						className={`shrink-0 rounded-lg px-3 py-2 text-right text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${x.id === sec.id ? 'bg-foreground/[.07] font-semibold text-foreground' : 'text-foreground/75 hover:bg-foreground/[.04] hover:text-foreground'}`}>
						{x.label}
					</button>
				))}
			</nav>
			<section className="min-w-0 max-w-[720px]" aria-labelledby="settings-title">
				<h2 id="settings-title" className="text-[20px] font-semibold">{sec.label}</h2>
				<p className="mt-1 border-b border-border/60 pb-4 text-[13px] text-muted-foreground">{sec.hint}</p>
				<div className="cs-pane"><Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted/50" />}>{sec.body(session)}</Suspense></div>
			</section>
		</div>
	)
}
