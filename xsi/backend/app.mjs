import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabases } from './database.mjs';
import { ApiError } from './errors.mjs';
import { authenticate, validateCredentials, createUser, newSession, login } from './auth.mjs';
import { createCustomer, listCustomers } from './customers.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicFiles = new Set(['index.html','branch.html','login.html','src/styles.css','src/app.mjs','src/dashboard-model.mjs','src/branch.mjs','src/branch-model.mjs','src/branch-state.mjs','src/api.mjs','src/login-client.mjs']);
export async function createApplication({ dataDir = path.join(root,'.data'), port = 8082, fault = null } = {}) {
  const databases = openDatabases(dataDir), attempts = new Map();
  let origin;
  const send = (res, status, data, headers = {}) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers }); res.end(JSON.stringify(data)); };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415,'json_required','فقط JSON پذیرفته می‌شود.');
    let value=''; for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value)>8192) throw new ApiError(413,'body_too_large','درخواست بیش از حد بزرگ است.'); }
    try { return JSON.parse(value); } catch { throw new ApiError(400,'invalid_json','JSON معتبر نیست.'); }
  }
  const server = http.createServer(async (req,res) => {
    try {
      if (!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0])) throw new ApiError(403,'host_denied','میزبان مجاز نیست.');
      const url = new URL(req.url, origin), route = url.pathname;
      if (route.startsWith('/api/')) {
        if (req.method !== 'GET' && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==origin))) throw new ApiError(403,'origin_denied','مبدأ درخواست مجاز نیست.');
        if (req.method==='GET' && route==='/api/auth/status') { send(res,200,{configured:!!databases.live.prepare('SELECT id FROM users LIMIT 1').get()}); return; }
        if (req.method==='POST' && ['/api/auth/setup','/api/auth/login'].includes(route)) {
          const key=req.socket.remoteAddress, now=Date.now(); let limit=attempts.get(key);
          if (!limit || now-limit.start>60000) { limit={start:now,count:0}; attempts.set(key,limit); }
          if (++limit.count>20) throw new ApiError(429,'rate_limited','کمی بعد دوباره تلاش کنید.');
          const input=await body(req); validateCredentials(input);
          let session;
          if (route.endsWith('/setup')) {
            if (databases.live.prepare('SELECT id FROM users LIMIT 1').get()) throw new ApiError(409,'already_configured','حساب محلی قبلاً ایجاد شده است.');
            session=newSession(databases.live,createUser(databases.live,input.username,input.password));
          } else session=login(databases.live,input);
          send(res,200,{user:session.user,csrf:session.csrf},{'Set-Cookie':`xsi_session=${session.token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800`}); return;
        }
        const session=authenticate(databases.live,req.headers.cookie);
        if (req.method!=='GET' && req.headers['x-csrf-token']!==session.csrf) throw new ApiError(403,'csrf_invalid','اعتبار درخواست پایان یافته است.');
        if (req.method==='GET' && route==='/api/session') { send(res,200,{user:{id:session.id,username:session.username},csrf:session.csrf}); return; }
        if (req.method==='POST' && route==='/api/auth/logout') {
          databases.live.prepare('DELETE FROM sessions WHERE digest=?').run(session.digest);
          send(res,200,{ok:true},{'Set-Cookie':'xsi_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0'}); return;
        }
        if (req.method==='GET' && route==='/api/customers') { if(fault) await fault(); send(res,200,listCustomers(databases,session.id,url.searchParams)); return; }
        if (req.method==='POST' && route==='/api/customers') {
          if (url.searchParams.get('dataset')==='demo') throw new ApiError(403,'demo_read_only','دادهٔ نمایشی قابل ثبت نیست.');
          if ([...url.searchParams.keys()].length) throw new ApiError(400,'query_invalid','پارامتر ثبت معتبر نیست.');
          send(res,201,createCustomer(databases.live,session.id,await body(req))); return;
        }
        if (req.method==='GET' && /^\/api\/customers\/[^/]+$/.test(route)) {
          const id=decodeURIComponent(route.split('/').at(-1));
          const row=databases.live.prepare('SELECT id,name,mobile,created_at AS createdAt FROM customers WHERE id=? AND owner_id=?').get(id,session.id);
          if(!row) throw new ApiError(404,'not_found','موردی در حساب شما یافت نشد.');
          send(res,200,row); return;
        }
        throw new ApiError(404,'unimplemented','این مسیر پیاده‌سازی نشده است.');
      }
      const name=route==='/'?'index.html':route.slice(1);
      if(!['GET','HEAD'].includes(req.method)||!publicFiles.has(name)) { res.writeHead(404).end('Not found'); return; }
      const bytes=await readFile(path.join(root,name));
      res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
      res.end(req.method==='HEAD'?undefined:bytes);
    } catch(error) { send(res,error instanceof ApiError?error.status:500,{error:{code:error instanceof ApiError?error.code:'internal_error',message:error instanceof ApiError?error.message:'خطای داخلی؛ دوباره تلاش کنید.',fields:error instanceof ApiError?error.fields:{}}}); }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return { server, databases, origin, async close() { await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())); databases.close(); } };
}
