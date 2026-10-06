import { describe, it, expect } from 'vitest'
import { summarizeSupport } from './support'
import { supportFixture } from './fixture'

// تستِ طلایی: خروجیِ محاسبهٔ پورت‌شده باید مو‌به‌مو با خروجیِ تأییدشدهٔ اپِ فعلی یکی باشد.
describe('summarizeSupport (golden)', () => {
  const s = summarizeSupport(supportFixture)

  it('جمع‌ها با داشبوردِ تأییدشده یکی است', () => {
    expect(s.total).toBe(23)
    expect(s.met).toBe(12)
    expect(s.matched).toBe(0)
    expect(s.slaRate).toBe(52)
  })

  it('ردیفِ هر پشتیبان دقیقاً مطابقِ خروجیِ فعلی است', () => {
    expect(s.agents).toEqual([
      { agent: 'آقای ایلیا قویدل', installs: 9, met: 7, rate: 78 },
      { agent: 'آقای اعلا فدایی', installs: 3, met: 2, rate: 67 },
      { agent: 'آقای محمدرضا انصاری', installs: 1, met: 0, rate: 0 },
      { agent: 'خانم یاسمن امیری', installs: 1, met: 1, rate: 100 },
      { agent: 'آقای فرحان باقری', installs: 1, met: 1, rate: 100 },
    ])
  })
})
