import { expect, it } from 'vitest'
import { moveRow, orderRows } from './row-order'
it('moves display rows without modifying transactions or their original order', () => {
 const rows = [{id:'a'}, {id:'b'}, {id:'c'}]
 const order = moveRow(rows.map(r=>r.id), 'a', 'c')
 expect(order).toEqual(['b','c','a'])
 expect(orderRows(rows, order, r=>r.id).map(r=>r.id)).toEqual(order)
 expect(rows.map(r=>r.id)).toEqual(['a','b','c'])
 expect(moveRow(order, 'missing', 'b')).toBe(order)
})
