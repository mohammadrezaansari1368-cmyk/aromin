// E5: UI labels and checked state from passive observation only.
export const branchColumns = ['نام', 'موبایل', 'اعتبار', 'آخرین خرید', 'مبلغ کل خرید', 'گروه', 'عملیات'];
export const pageSizes = [10, 20, 50, 100];
export const branchFilters = [
  { id: 'sms', label: 'لغو دریافت پیامک', options: ['بله', 'لغو دریافت پیامک', 'خیر'], selected: 1 },
  { id: 'trust', label: 'وضعیت مشتری', options: ['مشتریان مورد اطمینان', 'همه', 'مسدود شده توسط مدیر'], selected: 1 },
  { id: 'fixed', label: 'گروه ثابت', options: ['بله', 'گروه ثابت', 'خیر'], selected: 1 },
  { id: 'source', label: 'روش ثبت نام', options: ['همه مشتریان', 'ثبت نام از طریق پیامک'], selected: 0 },
  { id: 'active', label: 'وضعیت فعالیت', options: ['مشتریان فعال', 'مشتریان حذف شده'], selected: 0 },
];
// Record actions are unimplemented. Read-only controls use synthetic fixtures.
export const unavailableActions = ['مشتری جدید', 'ورودی اکسل', 'خروجی اکسل', 'اعتبارهای دریافتی', 'اعتبارهای استفاده شده', 'لیست خرید', 'لیست پیام های ارسالی', 'افزودن اعتبار', 'ویرایش', 'حذف مشتری'];
export const branchMenu = ['تنظیمات شعبه', 'مدیریت گروه مشتریان', 'گروه بندی پیشرفته', 'مدیریت پروفایل شروط باشگاه', 'مدیریت شروط باشگاه', 'مشتریان جدید شعبه', 'لیست مشتریان', 'گزارش مالی شعبه', 'پنل کمکی دستیار باشگاه'];
export function getBranchPreview() {
  return { status: 'CONFIRMED', dataSource: 'synthetic-only', filtersEnabled: true, actionsEnabled: false };
}
