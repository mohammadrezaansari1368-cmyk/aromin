import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const allowed = new Set(['index.html', 'branch.html', 'src/styles.css', 'src/app.mjs', 'src/dashboard-model.mjs', 'src/branch.mjs', 'src/branch-model.mjs', 'src/branch-state.mjs', 'src/synthetic-data.mjs']);
const port = Number(process.env.XSI_PREVIEW_PORT || 8081);
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['GET', 'HEAD'].includes(req.method) || !allowed.has(name)) { res.writeHead(404).end('Not found'); return; }
  try {
    const data = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`XSI synthetic preview: http://127.0.0.1:${port}`));
