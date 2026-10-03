/**
 * باندلِ مستقلِ ابزارکِ سایت (widget-bot.js): همان SmartAssistant3Dِ داشبورد، بدونِ تغییر.
 * public/widget.js آن را داخلِ Shadow DOM سوار می‌کند و فقط وضعیت/پالس را می‌فرستد.
 */
import { createElement, useSyncExternalStore, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import SmartAssistant3D from '@/components/agent/SmartAssistant3D'
import { setPalette } from './theme-shim'

type Status = ComponentProps<typeof SmartAssistant3D>['status']

function mount(el: HTMLElement, anchor: HTMLElement, opts: { color?: string; still?: boolean }) {
	if (opts.color) setPalette({ primary: opts.color })
	let state = { status: 'idle' as Status, pulse: 0 }
	const subs = new Set<() => void>()
	const set = (p: Partial<typeof state>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
	const ref = { current: anchor }
	function Bot() {
		const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
		return createElement(SmartAssistant3D, { status: s.status, pulse: s.pulse, still: !!opts.still, anchor: ref })
	}
	const root = createRoot(el)
	root.render(createElement(Bot))
	return {
		setStatus: (status: Status) => set({ status }),
		pulse: () => set({ pulse: state.pulse + 1 }),
		setColor: (color: string) => setPalette({ primary: color }),
		unmount: () => root.unmount(),
	}
}

;(window as unknown as { ArominWidgetBot: { mount: typeof mount } }).ArominWidgetBot = { mount }
