// 3.9.64: shared labels/types for the specialist agents and the knowledge collections they may read (server: AGENT_META, KB_COLLECTIONS).
export const COLLECTION_FA: Record<string, string> = {
	general: 'عمومی',
	zurvan_public: 'زروان — فروش عمومی',
	zurvan_setup: 'زروان — راه‌اندازی داخلی',
	products: 'محصولات',
	sales_playbook: 'راهنمای فروش',
	support: 'پشتیبانی',
	after_sales: 'پس از فروش',
	marketing: 'مارکتینگ',
	dashboard_help: 'راهنمای داشبورد (داخلی)',
	council: 'دانشنامهٔ شورا',
}
export const SURFACE_FA: Record<string, string> = { website: 'سایت', dashboard: 'داشبورد', bale: 'بله', telegram: 'تلگرام' }
export const SKILL_FIELDS: { key: keyof Skill; label: string; long?: boolean }[] = [
	{ key: 'name', label: 'نام' }, { key: 'trigger', label: 'وقتی (کلیدواژه‌ها با ، جدا)' }, { key: 'inputs', label: 'ورودی' },
	{ key: 'steps', label: 'مراحل', long: true }, { key: 'questions', label: 'سؤال‌هایی که بپرسد' }, { key: 'output', label: 'خروجی' }, { key: 'limits', label: 'محدودیت‌ها' },
]
export type Skill = { name: string; trigger: string; inputs: string; steps: string; questions: string; output: string; limits: string }
export type InstalledSkill = { id: string; name: string; description: string; enabled: boolean; source: { url?: string; upload?: string; sha?: string; installedAt?: string; installedBy?: string } }
export type AgentRec = {
	model?: string; name: string; enabled: boolean; surfaces: string[]; sites: string[]; prompt: string; skills: Skill[]
	ragScope: string[]; actions: string[]; mood: string; version: number; updatedAt: string; updatedBy: string; installed?: InstalledSkill[]
}
export type AgentMeta = {
	models?: string[]; keys: string[]; surfaces: string[]; onlySurfaces: Record<string, string[]>; managerOnly: string[]; collections: string[]
	actions: Record<string, { label: string; surfaces: string[] }>
}
/** کارهایی که روی سطح‌های انتخاب‌شدهٔ ایجنت معنا دارند */
export const actionsFor = (meta: AgentMeta, surfaces: string[]) =>
	Object.entries(meta.actions).filter(([, a]) => a.surfaces.some((s) => surfaces.includes(s))).map(([k, a]) => ({ key: k, label: a.label }))
