// E3: observed dashboard labels only. No live account values are retained.
export const products = [
  { id: 'club', title: 'باشگاه مشتریان', actions: ['دستيار باشگاه', 'ليست مشتريان شعبه', 'گزارش مالي شعبه'] },
  { id: 'insight', title: 'نگاه هوشمند', actions: [] },
];
export const generalLinks = ['شارژ پیامک', 'گزارش پیام‌های ارسالی', 'گزارش فاکتور‌ها'];
export function resolvePanel(id) {
  const product = products.find(product => product.id === id);
  return product ? { title: product.title, status: 'UNKNOWN', actions: [...product.actions] } : null;
}
