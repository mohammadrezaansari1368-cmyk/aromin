import type { Status } from '../data/types'

/** Section 7 table: how each status draws. irrelevant = removed from the cluster. */
export interface Visual { needle: 'value' | 'parked'; arc: 'full' | 'hatched' | 'off' | 'error'; center: 'value' | 'value*' | 'dash' | 'bang'; hidden: boolean; label: string }
export function statusVisual(s: Status): Visual {
	switch (s) {
		case 'valid': return { needle: 'value', arc: 'full', center: 'value', hidden: false, label: 'معتبر' }
		case 'partial': return { needle: 'value', arc: 'hatched', center: 'value*', hidden: false, label: 'ناقص' }
		case 'not_computable': return { needle: 'parked', arc: 'off', center: 'dash', hidden: false, label: 'قابل محاسبه نیست' }
		case 'irrelevant': return { needle: 'parked', arc: 'off', center: 'dash', hidden: true, label: 'نامرتبط' }
		default: return { needle: 'parked', arc: 'error', center: 'bang', hidden: false, label: 'خطا' }
	}
}
