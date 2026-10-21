// باندلِ کوچک و بدونِ وابستگیِ «دستیارِ آرومین» → dist/widget-agent.js (IIFE؛ تنبل از public/widget.js)
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	build: {
		outDir: 'dist',
		emptyOutDir: false,
		copyPublicDir: false,
		lib: { entry: path.resolve(root, 'src/widget/agent/entry.ts'), name: 'ArominAgentBundle', formats: ['iife'], fileName: () => 'widget-agent.js' },
	},
})
