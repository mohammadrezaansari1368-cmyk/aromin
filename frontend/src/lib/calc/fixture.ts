import type { Ticket } from './support'

/**
 * دادهٔ طلایی: بازسازیِ همان تیکت‌هایی که خروجیِ تأییدشدهٔ اپِ فعلی را می‌دهند
 * (۲۳ تیکتِ نصب، ۱۲ در مهلتِ SLA، ۰ وصل‌به‌معامله، نرخ ۵۲٪).
 */
function make(agent: string, n: number, met: number): Ticket[] {
  return Array.from({ length: n }, (_, i) => ({
    agent,
    channel: 'نصب',
    matched: false,
    met: i < met,
  }))
}

export const supportFixture: Ticket[] = [
  ...make('آقای ایلیا قویدل', 9, 7),
  ...make('آقای اعلا فدایی', 3, 2),
  ...make('آقای محمدرضا انصاری', 1, 0),
  ...make('خانم یاسمن امیری', 1, 1),
  ...make('آقای فرحان باقری', 1, 1),
  ...make('', 8, 1), // ۸ تیکتِ بدونِ پشتیبانِ نام‌دار، ۱ در مهلت (تا جمعِ met=۱۲)
]
