// Generated XSI fixtures, never SmartX records or valid phone numbers.
export const syntheticCustomers = Array.from({ length: 125 }, (_, index) => {
  const id = index + 1;
  return Object.freeze({ id: `SYNTHETIC-${String(id).padStart(3, '0')}`,
    name: `مشتری مصنوعی ${String(id).padStart(3, '0')}`, mobile: `TEST-PHONE-${String(id).padStart(3, '0')}`,
    credit: id * 1000, lastPurchase: '1405/01/01', totalPurchase: id * 10000,
    group: id % 4 === 0 ? 'گروه ثابت نمونه' : 'گروه نمونه',
    smsBlocked: id % 2 === 0, trust: id % 5 === 0 ? 'blocked' : id % 3 === 0 ? 'trusted' : 'normal',
    fixed: id % 4 === 0, source: id % 3 === 0 ? 'sms' : 'other', deleted: id % 6 === 0, synthetic: true });
});
