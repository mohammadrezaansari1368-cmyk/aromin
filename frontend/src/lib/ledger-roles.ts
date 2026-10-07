/**
 * بخشِ جمع‌شوندهٔ «نقش‌ها، وزن‌ها، مشارکت مدیر و تأیید مالی» در پنلِ سند.
 * payload فقط تغییراتِ واقعی را دارد: بسته بودنِ بخش یا ذخیرهٔ بی‌تغییر هیچ مقداری را حذف یا reset نمی‌کند.
 * finBy («تأیید مالی و صحتِ داده») از مسیرِ سرور (/api/c1/finance-by) ثبت می‌شود؛ سرور همین قواعد را دوباره می‌سنجد.
 */
import { DEFAULT_WEIGHTS, funnelOf, isLocked, STAGE_KEYS, stagesOf, type Deal, type StageKey } from '@/engines/commission/index.ts'
import { isAdmin } from '@/lib/auth'

const ord = (a: StageKey[]) => STAGE_KEYS.filter((k) => a.includes(k))

export function rolesPatch(d: Deal, draft: { stages: StageKey[]; mgrShare: boolean }): Partial<Deal> {
	const p: Partial<Deal> = {}
	if (ord(draft.stages).join() !== ord(stagesOf(d)).join()) { p.stages = ord(draft.stages); p.close = undefined }
	if (draft.mgrShare !== !!d.mgrShare) p.mgrShare = draft.mgrShare
	return p
}

/** همان قواعدِ سرور: فقط مالی/مدیر؛ پس از ثبت فقط مدیر؛ سندِ قفل هرگز */
export function financeControl(role: string, d: Deal): { editable: boolean; why: string } {
	if (isLocked(d)) return { editable: false, why: 'سند قفل است (تصویب/بسته).' }
	if (role !== 'finance' && !isAdmin(role)) return { editable: false, why: 'تعیینِ تأیید مالی فقط با کارشناسِ مالی یا مدیر است.' }
	if (String(d.finBy || '').trim() && !isAdmin(role)) return { editable: false, why: 'تأیید مالی ثبت شده — فقط مدیر تغییر یا لغو می‌کند.' }
	return { editable: true, why: '' }
}

/** Read-only business progress; never changes commission ownership or ledger approval. */
export function salesProgress(d: Deal) {
 const count = ({ start: 1, qualify: 2, advance: 5, won: 5, lost: 0 })[funnelOf(d)] ?? 0
 const stages: StageKey[] = STAGE_KEYS.slice(0, count)
 if (count === 5) {
  if ((d.supportGen && d.supportSla === true) || Number(d.taskPost) > 0) stages.push('post')
  // finBy is persisted by the authenticated financial verification route.
  // finApproval.by / finState / finClosed describe ledger approval, not this stage.
  if (typeof d.finBy === 'string' && d.finBy.trim()) stages.push('fin')
 }
 return { stages, percent: stages.reduce((sum, k) => sum + DEFAULT_WEIGHTS[k], 0) }
}
