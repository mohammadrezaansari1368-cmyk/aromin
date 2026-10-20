import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeAuthHeaders, authHeaders, clearSession, login, changePassword, verifyOtp, googleSignIn } from './auth'

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

	it.each([404, 405])('fails closed when session endpoint is unavailable %s', async (status) => {
		const fetcher = vi.fn().mockResolvedValue(reply({}, status))
		vi.stubGlobal('fetch', fetcher)
		expect((await login('test', 'synthetic-password')).ok).toBe(false)
		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(activeAuthHeaders()).toEqual({})
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

describe('password rotation and alternative login', () => {
  it('retains only the token and exposes the required password prompt flag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ ok: true, token: 'restricted', session: { user: 'test', role: 'sales', tenant: 'team', must_change_password: true } })))
    const result = await login('test', '123')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('login failed')
    expect(result.session.pass).toBe('')
    expect(result.session.must_change_password).toBe(true)
    const fetcher = vi.fn().mockResolvedValue(serverSession())
    vi.stubGlobal('fetch', fetcher)
    expect((await changePassword(result.session, 'replacement-password')).ok).toBe(true)
    expect(fetcher.mock.calls[0][0]).toBe('/api/auth/change-password')
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer restricted')
  })
  it('verifies OTP on the session endpoint without reading state', async () => {
    const fetcher = vi.fn().mockResolvedValue(serverSession())
    vi.stubGlobal('fetch', fetcher)
    expect((await verifyOtp('09123456789', '123456')).ok).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('/api/auth/session')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ mobile: '09123456789', code: '123456', tenant: 'team' })
  })
  it('exchanges the Google credential for a server session', async () => {
    const fetcher = vi.fn().mockResolvedValue(serverSession())
    vi.stubGlobal('fetch', fetcher)
    expect((await googleSignIn('synthetic-google-credential')).ok).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('/api/auth/session')
  })
})

it('does not send a non-manager token to automatic backups', async () => {
  const { saveState } = await import('./forecastStore')
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ ok: true, token: 'sales-session', session: { user: 'sales', role: 'sales', tenant: 'team' } }))
    .mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] } }))
    .mockResolvedValueOnce(reply({ ok: true }))
  vi.stubGlobal('fetch', fetcher)
  await login('sales', 'synthetic-password')
  await saveState((full) => { full.forecast = {} })
  expect(fetcher.mock.calls.some(([path]) => path === '/api/backup')).toBe(false)
  expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer sales-session')
})
