/** Unit-driven cluster: which metric drives the big gauge and which go to the minis. «presence» is server attendance (confirmed card mapping only). */
export const CLUSTER: Record<string, { main: string; minis: [string, string] }> = {
	sales: { main: 'activity', minis: ['efficiency', 'conversion'] },
	support: { main: 'activity', minis: ['efficiency', 'resolution'] },
	finance: { main: 'finance_documents', minis: ['efficiency', 'accuracy'] },
}
/** metric → import file that feeds it (shown in receipts and the data-health bar) */
export const IMPORT_SOURCE: Record<string, string> = {
	activity: 'تماس و ویزیت جولیو', efficiency: 'تماس + اشخاص جولیو', conversion: 'معاملات جولیو (تاریخچهٔ مراحل)',
	contract_average: 'معاملات جولیو', contracts: 'معاملات جولیو', finance_documents: 'دفتر فروش (تأیید مالی)', tasks: 'وظایف جولیو',
	presence: 'فایل حضور و غیاب', effort: 'حضور + وظایف', resolution: 'تیکت‌ها', quality: 'نظرسنجی تیکت‌ها',
	accuracy: 'اسناد مالی', effectiveness: 'اسناد مالی و وصول',
	calls_in: 'ریز تماس', calls_out: 'ریز تماس', calls_internal: 'ریز تماس', calls_answered: 'ریز تماس', calls_missed: 'ریز تماس', talk_seconds: 'ریز تماس',
}
export const WORKDAY_MIN = 450
