import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), ...(process.env.SINGLE ? [viteSingleFile()] : [])],
  base: './',
  // در حالت توسعه، درخواست‌های /api و /app به سرور محلی (پورت ۳۰۰۰) فرستاده می‌شوند
  server: { proxy: { '/api': 'http://localhost:3000', '/app': 'http://localhost:3000' } },
});
