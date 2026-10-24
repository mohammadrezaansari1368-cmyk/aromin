// @vitest-environment jsdom
// 3.9.63: the session survives a reload (server-signed token only, never the password); logout and server rejection clear it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeAuthHeaders, clearSession, login, resumeSession, storedToken } from './auth'
import { currentTenant } from './data'

const ok = (token: string) => ({ ok: true, json: async () => ({ ok: true, token, session: { name: 'م', role: 'manager', user: 'boss', tenant: currentTenant() } }) })
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => { localStorage.clear(); clearSession(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('session persistence', () => {
	it('login stores only the token; resume after reload uses it as Bearer and renews it', async () => {
		fetchMock.mockResolvedValueOnce(ok('tok-1'))
		expect((await login('boss', 'secret-pass')).ok).toBe(true)
		expect(storedToken()).toBe('tok-1')
		expect(JSON.stringify({ ...localStorage })).not.toContain('secret-pass')
		const key = localStorage.key(0)!
		clearSession(); localStorage.setItem(key, 'tok-1')          // a reload: memory gone, storage kept
		fetchMock.mockResolvedValueOnce(ok('tok-2'))
		const s = await resumeSession()
		expect(s?.user).toBe('boss')
		const [url, init] = fetchMock.mock.calls.at(-1)!
		expect(url).toBe('/api/auth/session')
		expect(init.headers.Authorization).toBe('Bearer tok-1')
		expect(JSON.parse(init.body).resume).toBeTruthy()
		expect(storedToken()).toBe('tok-2')
		expect(activeAuthHeaders()).toEqual({ Authorization: 'Bearer tok-2' })
	})
	it('logout clears the stored token; no token → no request', async () => {
		fetchMock.mockResolvedValueOnce(ok('tok-1'))
		await login('boss', 'p')
		clearSession()
		expect(storedToken()).toBeNull()
		expect(await resumeSession()).toBeNull()
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})
	it('a rejected token (expired/401) is cleared; a network error keeps it for the next load', async () => {
		fetchMock.mockResolvedValueOnce(ok('tok-1'))
		await login('boss', 'p')
		fetchMock.mockRejectedValueOnce(new TypeError('offline'))
		expect(await resumeSession()).toBeNull()
		expect(storedToken()).toBe('tok-1')
		fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'نشست منقضی شده است.' }) })
		expect(await resumeSession()).toBeNull()
		expect(storedToken()).toBeNull()
	})
})
