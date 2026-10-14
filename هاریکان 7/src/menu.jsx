import {
  AppstoreOutlined, HomeOutlined, FieldTimeOutlined, TeamOutlined, FileTextOutlined, HourglassOutlined,
  SettingOutlined, MessageOutlined, CloudDownloadOutlined, CustomerServiceOutlined, ShoppingCartOutlined, MobileOutlined,
} from '@ant-design/icons';

// تعریف منوی سایدبار — مسیرها با routes در App.jsx یکی هستند
export const MENU = [
  { label: 'داشبورد', icon: <AppstoreOutlined />, path: '/' },
  { label: 'محل کار', icon: <HomeOutlined />, children: [
    { label: 'لیست محل کار', path: '/workplaces' },
    { label: 'افزودن محل کار', path: '/workplaces/new' },
  ] },
  { label: 'شیفت ها', icon: <FieldTimeOutlined />, children: [
    { label: 'لیست شیفت ها', path: '/shifts' },
    { label: 'تعریف شیفت', path: '/shifts/create' },
  ] },
  { label: 'پرسنل', icon: <TeamOutlined />, children: [
    { label: 'لیست پرسنل', path: '/personnel' },
    { label: 'افزودن پرسنل', path: '/personnel/new' },
  ] },
  { label: 'گزارشات', icon: <FileTextOutlined />, children: [
    { label: 'کارکرد', path: '/performance' },
    { label: 'تردد', path: '/performance-audit' },
    { label: 'مرخصی', path: '/vacation-report' },
    { label: 'جزییات مرخصی', path: '/vacation-details' },
    { label: 'پروژه', path: '/project/report' },
    { label: 'رهگیری', path: '/tracking-report' },
    { label: 'تردد ناقص', path: '/incomplete-entrance-report' },
  ] },
  { label: 'درخواست ها', icon: <HourglassOutlined />, path: '/requests/new', badge: 'requests' },
  { label: 'ترددهای تخلیه‌شده', icon: <CloudDownloadOutlined />, path: '/device-records' },
  { label: 'تنظیمات کسب و کار', icon: <SettingOutlined />, children: [
    { label: 'تعطیلات', path: '/holidays' },
    { label: 'لیست سیاست کاری', path: '/policies' },
    { label: 'ثبت سیاست کاری', path: '/policies/new' },
    { label: 'لیست گروه ها', path: '/groups' },
    { label: 'گروه جدید', path: '/groups/add' },
    { label: 'لیست پروژه ها', path: '/project/list' },
    { label: 'پروژه جدید', path: '/project/add' },
    { label: 'دستگاه ها', path: '/devices' },
    { label: 'پنل پیامک', path: '/sms-panel' },
    { label: 'تنظیمات درخواست', path: '/requests/settings' },
    { label: 'وب سرویس', path: '/web-service' },
    { label: 'سرویس تشخیص چهره', path: '/settings/face-service' },
  ] },
  { label: 'پیام', icon: <MessageOutlined />, path: '/messages' },
  { sep: true },
  { label: 'پشتیبانی', icon: <CustomerServiceOutlined />, children: [
    { label: 'لیست تیکت ها', path: '/tickets' },
    { label: 'ثبت تیکت', path: '/tickets/new' },
  ] },
  { label: 'خرید پکیج', icon: <ShoppingCartOutlined />, path: '/packages' },
  { label: 'نصب اپلیکیشن موبایل', icon: <MobileOutlined />, path: '/application' },
];

export const titleFor = (path) => {
  for (const m of MENU) {
    if (m.path === path) return m.label;
    for (const c of m.children || []) if (c.path === path) return c.label;
  }
  if (path.includes('/edit/')) return 'ویرایش';
  return '';
};
