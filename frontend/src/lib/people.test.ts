import { expect, it } from 'vitest'
import { isActivePerson } from './people'
it('filters only inactive experts, preserving the legacy default and history', () => {
 const people = [{ name:'active', inactive:false }, { name:'past', inactive:true }, { name:'legacy' }]
 expect(people.filter(isActivePerson).map(p=>p.name)).toEqual(['active','legacy'])
 expect(people).toHaveLength(3)
 expect(isActivePerson(null)).toBe(false)
})
