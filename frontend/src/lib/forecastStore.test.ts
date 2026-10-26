import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tenant = 'team'
vi.mock('@/lib/data', () => ({ currentTenant: () => tenant }))
vi.mock('@/lib/auth', () => ({ activeAuthHeaders: () => ({}), activeManagerSession: () => false }))
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

beforeEach(() => { tenant = 'team'; vi.resetModules() })
afterEach(() => { vi.unstubAllGlobals() })

describe('forecastStore concurrency (WP-04)', () => {
	it('sends the version from GET as If-Match on the next POST', async () => {
		const { saveState } = await import('./forecastStore')
		const fetcher = vi.fn()
			.mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] }, version: 7 }))
			.mockResolvedValueOnce(reply({ ok: true, version: 8 }))
		vi.stubGlobal('fetch', fetcher)
		await saveState((full) => { full.forecast = {} })
		const postCall = fetcher.mock.calls[1]
		expect(postCall[1].headers['If-Match']).toBe('7')
	})

	it('surfaces a conflict on 409 without retrying with the stale payload', async () => {
		const { saveState } = await import('./forecastStore')
		const fetcher = vi.fn()
			.mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] }, version: 3 }))
			.mockResolvedValueOnce(reply({ ok: false, conflict: true, version: 4 }, 409))
		vi.stubGlobal('fetch', fetcher)
		await expect(saveState((full) => { full.forecast = {} })).rejects.toThrow('conflict')
		expect(fetcher).toHaveBeenCalledTimes(2)
	})

	it('never adopts the server version carried on a 409 conflict response', async () => {
		const { saveState } = await import('./forecastStore')
		const fetcher = vi.fn()
			.mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] }, version: 3 }))
			.mockResolvedValueOnce(reply({ ok: false, conflict: true, version: 4 }, 409))
		vi.stubGlobal('fetch', fetcher)
		await expect(saveState((full) => { full.forecast = {} })).rejects.toThrow('conflict')

		// GET دوباره نسخه نمی‌دهد؛ اگر نسخهٔ ۴ از پاسخِ ۴۰۹ پذیرفته شده بود، If-Match این بار ۴ می‌شد نه ۳.
		fetcher
			.mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] } }))
			.mockResolvedValueOnce(reply({ ok: true }))
		await saveState((full) => { full.forecast = {} })
		const postCall = fetcher.mock.calls[3]
		expect(postCall[1].headers['If-Match']).toBe('3')
	})

	it('omits If-Match before any version is known (legacy compat)', async () => {
		const { saveState } = await import('./forecastStore')
		const fetcher = vi.fn()
			.mockResolvedValueOnce(reply({ ok: true, full: { people: [{ name: 'Synthetic' }] } }))
			.mockResolvedValueOnce(reply({ ok: true }))
		vi.stubGlobal('fetch', fetcher)
		await saveState((full) => { full.forecast = {} })
		const postCall = fetcher.mock.calls[1]
		expect(postCall[1].headers).not.toHaveProperty('If-Match')
	})
})
