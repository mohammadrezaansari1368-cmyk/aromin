import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * mockِ /api/state فقط برای dev — همان قراردادِ سرورِ آرومین را شبیه‌سازی می‌کند
 * (GET → state، POST { tenant, patch } → merge). در تولید حذف/جایگزین می‌شود.
 */
function apiStateMock(): Plugin {
  const FILE = path.resolve(root, 'node_modules/.aromin-state.json')
  const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }
  const write = (o: unknown) => { try { fs.writeFileSync(FILE, JSON.stringify(o)) } catch { /* noop */ } }
  const deepMerge = (a: any, b: any): any => {
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      const out = { ...(a && typeof a === 'object' ? a : {}) }
      for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k])
      return out
    }
    return b
  }
  return {
    name: 'aromin-api-state-mock',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true, state: read() }))
          return
        }
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            try {
              const { patch } = JSON.parse(body || '{}')
              write(deepMerge(read(), patch ?? {}))
            } catch { /* ignore */ }
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          })
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), ...(process.env.AROMIN_MOCK === '1' ? [apiStateMock()] : [])],
  resolve: { alias: { '@': path.resolve(root, './src') } },
  server: { host: '127.0.0.1', port: 5183, proxy: process.env.AROMIN_MOCK === '1' ? undefined : { '/api': 'http://127.0.0.1:3000', '/legacy': 'http://127.0.0.1:3000' } },
  // فقط برای `npm run preview`: /api را به سرورِ زنده می‌فرستد تا با دادهٔ واقعی تست شود.
  preview: {
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:3000', changeOrigin: true, secure: true },
    },
  },
})
