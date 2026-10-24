'use client'

/**
 * چهرهٔ احساسیِ دستیار برای داشبورد — همان EmotionController/SVGِ ابزارکِ سایت (widget/agent)،
 * این‌بار روی وضعیتِ دستیارِ عامل (lib/agent: idle/listening/thinking/tool/speaking).
 */
import { useEffect, useRef } from 'react'
import { EmotionController, type AgentEvent, type EmotionState } from '@/widget/agent/core'
import { FACE_SVG, FACE_CSS, applyState } from '@/widget/agent/face'
import type { Status } from '@/lib/agent'

let styleInjected = false
function ensureStyle() {
	if (styleInjected || typeof document === 'undefined') return
	styleInjected = true
	const st = document.createElement('style')
	st.textContent = FACE_CSS
	document.head.appendChild(st)
}

const STATUS_EVENT: Record<Status, AgentEvent> = { idle: 'idle', listening: 'typing', thinking: 'send', tool: 'send', speaking: 'reply' }

export default function EmotionFace({ status, text, className = 'size-8' }: { status: Status; text?: string; className?: string }) {
	const span = useRef<HTMLSpanElement>(null)
	const ctrl = useRef<EmotionController | null>(null)
	useEffect(() => {
		ensureStyle()
		const svg = span.current?.querySelector('svg')
		if (!svg) return
		applyState(svg, 'neutral')
		ctrl.current = new EmotionController((s: EmotionState) => applyState(svg, s))
		return () => ctrl.current?.destroy()
	}, [])
	useEffect(() => { ctrl.current?.emit(STATUS_EVENT[status], status === 'speaking' ? text : undefined) }, [status, text])
	// eslint-disable-next-line react/no-danger -- FACE_SVG ثابتِ داخلی است، بدونِ ورودیِ کاربر
	return <span ref={span} aria-hidden className={className} dangerouslySetInnerHTML={{ __html: FACE_SVG }} />
}
