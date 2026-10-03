// باندلِ مستقلِ ربات سه‌بعدیِ ابزارکِ سایت → dist/widget-bot.js (IIFE، بدونِ وابستگی به داشبورد)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: [
			{ find: '@/lib/theme', replacement: path.resolve(root, 'src/widget/theme-shim.ts') },
			{ find: '@', replacement: path.resolve(root, 'src') },
		],
	},
	define: { 'process.env.NODE_ENV': '"production"' },
	build: {
		outDir: 'dist',
		emptyOutDir: false,
		copyPublicDir: false,
		lib: { entry: path.resolve(root, 'src/widget/bot-entry.tsx'), name: 'ArominWidgetBotBundle', formats: ['iife'], fileName: () => 'widget-bot.js' },
	},
})
