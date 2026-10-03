import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({ plugins: [react()], resolve: { alias: [{ find: '@/lib/theme', replacement: fileURLToPath(new URL('./src/widget/theme-shim.ts', import.meta.url)) }, { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }] }, build: { emptyOutDir: false, lib: { entry: 'src/widget/bot-entry.tsx', name: 'ArominWidgetBot', formats: ['iife'], fileName: () => 'widget-bot.js' } } })
