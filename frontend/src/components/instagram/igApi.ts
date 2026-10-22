// 3.9.73: shared client for /api/instagram/* (managers only; the Composio key never leaves the server).
import { authHeaders, type Session } from '@/lib/auth'
import { currentTenant } from '@/lib/data'

export type IgStatus = { keySet: boolean; connected: boolean; username: string; enabled: boolean; lastRun: string | null; running: boolean }
export type IgEvent = { n: number; t: string; kind: 'step' | 'ok' | 'warn' | 'error' | 'done'; text: string }
export type IgReel = { id: string; permalink?: string; hook: string; timestamp?: string; score: number; likes?: number; comments?: number; views?: number; x: number | null; reason: string }
export type IgItem = { id: string; kind: 'comment' | 'dm'; from: string; text: string; at?: string; media?: string; agent: string; category: string; reply: string
	lead?: { name: string; phone: string; city: string; need: string; score: number; handoff?: boolean; assignedTo?: string } }
export type IgPanel = { at: string; profile: { username: string; followers_count: number; media_count: number }; average: number; analysis: IgReel[]
	viral: { patterns: string[]; note: string; compare: Record<string, { top: number | null; rest: number | null }> }; inbox: IgItem[]
	plan: { day: string; idea: string; hook: string; format: string }[]; summary: string }

export async function igApi<T>(session: Session, path: string, body?: unknown): Promise<T> {
	const r = await fetch('/api/instagram/' + path + (path.includes('?') ? '&' : '?') + 'tenant=' + encodeURIComponent(currentTenant()),
		{ method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...authHeaders(session) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' })
	const j = await r.json().catch(() => ({ ok: false, error: 'پاسخِ نامعتبر (' + r.status + ')' }))
	if (!r.ok || j.ok === false) throw new Error(j.error || 'خطا ' + r.status)
	return j as T
}
