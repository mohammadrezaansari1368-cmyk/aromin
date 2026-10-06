import { expect, it } from 'vitest'
import { sep } from '../commission'
it('formats balance values using grouped Persian digits and stable signs', () => {
 expect(sep(1234567)).toBe('۱٬۲۳۴٬۵۶۷')
 expect(sep(-1234567)).toBe('−۱٬۲۳۴٬۵۶۷')
 expect(sep(0)).toBe('۰')
 expect(sep(1234567890123)).toBe('۱٬۲۳۴٬۵۶۷٬۸۹۰٬۱۲۳')
 expect(sep(NaN)).toBe('۰')
})
