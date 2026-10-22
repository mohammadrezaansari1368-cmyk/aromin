// @vitest-environment jsdom
// 3.9.64: the dashboard client keeps the server-chosen agent and never runs a tool outside the server's allowedTools.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearChat, getAgent, send } from './agent'

afterEach(() => { vi.unstubAllGlobals(); clearChat() })

describe('dashboard agent client', () => {
	it('denies a tool the server did not allow and sends the agent back next round', async () => {
		const replies = [
			{ ok: true, text: '```tool\n{"name": "navigateToTab", "args": {"tab": "import"}}\n```', allowedTools: [], agent: { key: 'support', name: 'پشتیبانی' } },
			{ ok: true, text: 'باشه.', allowedTools: [], agent: { key: 'support', name: 'پشتیبانی' } },
		]
		const fetchMock = vi.fn(async () => ({ json: async () => replies.shift() }))
		vi.stubGlobal('fetch', fetchMock)
		await send('برو ایمپورت')
		const tool = getAgent().msgs.find((m) => m.role === 'tool')
		expect(tool?.tool?.status).toBe('denied')
		expect(getAgent().agent).toEqual({ key: 'support', name: 'پشتیبانی' })
		const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))
		expect(second.agent).toBe('support')
		clearChat()
		expect(getAgent().agent).toBeNull()
	})
})
