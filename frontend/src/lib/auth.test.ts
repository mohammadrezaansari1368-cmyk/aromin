import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeAuthHeaders, authHeaders, clearSession, login } from './auth'

let tenant = 'team'
vi.mock('@/lib/data', () => ({ currentTenant: () => tenant }))
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const serverSession = () => reply({ ok: true, token: 'synthetic-session', session: { user: 'test', name: 'Test', role: 'manager', tenant: 'team' } })

beforeEach(() => { tenant = 'team'; clearSession() })
afterEach(() => { clearSession(); vi.unstubAllGlobals() })

describe('server sessions', () => {
	it('uses server login without reading directory passwords and sends Bearer', async () => {
		const fetcher = vi.fn().mockResolvedValue(serverSession())
		vi.stubGlobal('fetch', fetcher)
		const result = await login(' test ', 'synthetic-password')
		expect(result.ok).toBe(true)
		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(fetcher.mock.calls[0][0]).toBe('/api/auth/session')
		expect(JSON.parse(fetcher.mock.calls[0][1].body).username).toBe('test')
		if (!result.ok) throw new Error('Expected synthetic login success')
		expect(authHeaders(result.session)).toHaveProperty('Authorization')
		expect(authHeaders(result.session)).not.toHaveProperty('X-Aromin-Pass')
		expect(Object.keys(activeAuthHeaders())).toEqual(['Authorization'])
	})

	it.each([404, 405])('falls back to the old directory only for unavailable endpoint %s', async (status) => {
		const fetcher = vi.fn().mockResolvedValueOnce(reply({}, status)).mockResolvedValueOnce(reply({ full: { users: { test: { pass: 'synthetic-password', role: 'sales' } }, people: [] } }))
		vi.stubGlobal('fetch', fetcher)
		const result = await login('test', 'synthetic-password')
		expect(result.ok).toBe(true)
		expect(fetcher).toHaveBeenCalledTimes(2)
		if (!result.ok) throw new Error('Expected synthetic legacy login success')
		expect(authHeaders(result.session)).toHaveProperty('X-Aromin-User')
	})

	it.each([401, 403, 429, 500])('does not downgrade after server rejection %s', async (status) => {
		const fetcher = vi.fn().mockResolvedValue(reply({ ok: false, error: 'ورود معتبر نیست.' }, status))
		vi.stubGlobal('fetch', fetcher)
		expect((await login('test', 'synthetic-password')).ok).toBe(false)
		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(Object.keys(activeAuthHeaders())).toHaveLength(0)
	})

	it('does not downgrade after a network failure', async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error('synthetic network failure'))
		vi.stubGlobal('fetch', fetcher)
		expect((await login('test', 'synthetic-password')).ok).toBe(false)
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('clears the active token at logout and prevents sending it for another tenant', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(serverSession()))
		const result = await login('test', 'synthetic-password')
		if (!result.ok) throw new Error('Expected synthetic login success')
		tenant = 'other'
		expect(Object.keys(activeAuthHeaders())).toHaveLength(0)
		expect(Object.keys(authHeaders(result.session))).toHaveLength(0)
		tenant = 'team'
		clearSession()
		expect(Object.keys(activeAuthHeaders())).toHaveLength(0)
	})

	it('sends the active session when forecast saving requires a backup', async () => {
		const { saveState } = await import('./forecastStore')
		const fetcher = vi.fn().mockResolvedValueOnce(serverSession())
			.mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] } }))
			.mockResolvedValueOnce(reply({ ok: true })).mockResolvedValueOnce(reply({ ok: true }))
		vi.stubGlobal('fetch', fetcher)
		await login('test', 'synthetic-password')
		await saveState((full) => { full.forecast = {} }, { forceBackup: true })
		const backupCall = fetcher.mock.calls.find(([path]) => path === '/api/backup')
		expect(backupCall).toBeDefined()
		expect(backupCall![1].headers).toHaveProperty('Authorization')
	})
})
