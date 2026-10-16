import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { createApplication } from '../backend/app.mjs';
import { createUser, newSession } from '../backend/auth.mjs';
const password=()=>randomBytes(24).toString('base64url');
const fakeMobile=i=>'09'+String(900000000+i); // synthetic test values, never reference records
test('independent customer API, persistence and access boundaries', async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'xsi-api-'));
  let app=await createApplication({dataDir:dir,port:0});let cookie='',csrf='',recordId;
  const pass=password();
  const call=async(route,{method='GET',data,auth=true,headers={}}={})=>{
    const response=await fetch(app.origin+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...headers},body:data?JSON.stringify(data):undefined});
    let body;try{body=await response.json();}catch{body=null;}return {response,body};
  };
  try {
    await t.test('anonymous read and write are denied',async()=>{
      assert.equal((await call('/api/customers')).response.status,401);
      assert.equal((await call('/api/customers',{method:'POST',data:{}})).response.status,401);
    });
    await t.test('setup validates credentials and issues an HttpOnly session',async()=>{
      assert.equal((await call('/api/auth/setup',{method:'POST',data:{username:'a',password:'x'}})).response.status,422);
      const result=await call('/api/auth/setup',{method:'POST',data:{username:'owner',password:pass}});
      assert.equal(result.response.status,200);const setCookie=result.response.headers.get('set-cookie');
      assert.ok(setCookie.includes('HttpOnly')&&setCookie.includes('SameSite=Strict'));
      cookie=setCookie.split(';')[0];csrf=result.body.csrf;
      assert.equal((await call('/api/auth/setup',{method:'POST',data:{username:'other',password:pass}})).response.status,409);
    });
    await t.test('missing CSRF and cross-origin requests are denied',async()=>{
      assert.equal((await call('/api/customers',{method:'POST',data:{},headers:{'X-CSRF-Token':''}})).response.status,403);
      assert.equal((await call('/api/customers',{method:'POST',data:{},headers:{Origin:'https://example.invalid'}})).response.status,403);
    });
    await t.test('live starts empty and demo is separate and read-only',async()=>{
      assert.equal((await call('/api/customers')).body.total,0);
      const demo=await call('/api/customers?dataset=demo'); assert.equal(demo.body.total,125);assert.ok(demo.body.rows.every(r=>r.synthetic));
      assert.equal((await call('/api/customers?dataset=demo',{method:'POST',data:{}})).response.status,403);
    });
    await t.test('API rejects invalid and extra customer fields without writing',async()=>{
      assert.equal((await call('/api/customers',{method:'POST',data:{name:'',mobile:'x'}})).response.status,422);
      assert.equal((await call('/api/customers',{method:'POST',data:{name:'sample',mobile:fakeMobile(1),credit:999}})).response.status,400);
      assert.equal((await call('/api/customers')).body.total,0);
    });
    await t.test('create normalizes digits, returns stored data and prevents duplicates',async()=>{
      const mobile=fakeMobile(1).replace(/\d/g,c=>'۰۱۲۳۴۵۶۷۸۹'[Number(c)]);
      const result=await call('/api/customers',{method:'POST',data:{name:'مشتری آزمایشی API',mobile}});
      assert.equal(result.response.status,201);recordId=result.body.id;
      assert.equal(result.body.mobile,fakeMobile(1));assert.equal(result.body.credit,null);
      assert.equal((await call('/api/customers',{method:'POST',data:{name:'duplicate',mobile:fakeMobile(1)}})).response.status,409);
    });
    await t.test('list/search/page filters combine and invalid query is rejected',async()=>{
      for(let i=2;i<=24;i++)assert.equal((await call('/api/customers',{method:'POST',data:{name:'API synthetic '+i,mobile:fakeMobile(i)}})).response.status,201);
      assert.equal((await call('/api/customers?pageSize=10&page=2')).body.rows.length,10);
      const list=await call('/api/customers?dataset=demo&pageSize=10&fixed=0&trust=2&active=0&sms=0');
      assert.equal(list.body.filtered,4);
      assert.equal((await call('/api/customers?q=API%20synthetic%202&source=0&active=0')).body.filtered,6);
      assert.equal((await call('/api/customers?pageSize=13')).response.status,400);
      assert.equal((await call('/api/customers?page=-1')).response.status,400);
      assert.equal((await call('/api/customers?sms=9')).response.status,400);
      assert.equal((await call('/api/customers?owner_id=1')).response.status,400);
      assert.equal((await call('/api/customers?page=1&page=2')).response.status,400);
      assert.equal((await call('/api/customers?q=%27%20OR%201%3D1--')).body.filtered,0);
      assert.equal((await call('/api/customers?q=%25')).body.filtered,0);
    });
    await t.test('owner isolation blocks cross-account detail and list access',async()=>{
      const user=createUser(app.databases.live,'secondary',password());const session=newSession(app.databases.live,user);
      const secondaryCookie='xsi_session='+session.token;
      assert.equal((await call('/api/customers/'+recordId,{headers:{Cookie:secondaryCookie}})).response.status,404);
      assert.equal((await call('/api/customers',{headers:{Cookie:secondaryCookie}})).body.total,0);
    });
    await t.test('server/database restart preserves real rows, auth and separation',async()=>{
      await app.close();app=await createApplication({dataDir:dir,port:0});
      assert.equal((await call('/api/customers')).body.total,24);
      assert.equal((await call('/api/customers/'+recordId)).body.mobile,fakeMobile(1));
      assert.equal((await call('/api/customers?dataset=demo')).body.total,125);
      const schema=app.databases.live.prepare('SELECT password_hash FROM users WHERE username=?').get('owner');
      assert.ok(!schema.password_hash.includes(pass));
    });
    await t.test('unknown financial/write endpoints stay unimplemented',async()=>{
      assert.equal((await call('/api/customers/'+recordId+'/credit',{method:'POST',data:{amount:100}})).response.status,404);
      assert.equal((await call('/api/customers/'+recordId,{method:'DELETE'})).response.status,404);
    });
    await t.test('private filesystem paths cannot be served',async()=>{
      for(const route of ['/.data/xsi.sqlite','/.local-browser/','/.local-browser-chrome/','/backend/auth.mjs','/.env'])assert.equal((await fetch(app.origin+route)).status,404);
    });
    await t.test('logout revokes session and invalid login fails',async()=>{
      assert.equal((await call('/api/auth/logout',{method:'POST'})).response.status,200);
      assert.equal((await call('/api/customers')).response.status,401);
      assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'owner',password:password()}})).response.status,401);
      assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'owner',password:pass}})).response.status,200);
    });
  } finally {await app.close();await rm(dir,{recursive:true,force:true});}
});
test('API reports internal errors without exposing database details',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'xsi-fault-'));const app=await createApplication({dataDir:dir,port:0,fault:()=>{throw new Error('sensitive-internal-marker');}});
  try{
    const user=createUser(app.databases.live,'fault-user',password());const session=newSession(app.databases.live,user);
    const r=await fetch(app.origin+'/api/customers',{headers:{Cookie:'xsi_session='+session.token}});const b=await r.text();assert.equal(r.status,500);assert.ok(!b.includes('sensitive-internal-marker'));
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
