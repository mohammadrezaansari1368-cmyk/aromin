"""Tenant-scoped Grok SMS integration; no credentials in tenant state or logs."""
import os
import re
import json
import time
import hmac
import hashlib
import secrets
import tempfile
import urllib.request
import urllib.error
from contextlib import contextmanager
from pathlib import Path
import fcntl
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

PROVIDER_URL = 'https://api.payamresanbastani.ir/api/sendsms'

def error(message, code):
    return JSONResponse({'success': False, 'message': message, 'message_ids': []}, status_code=code, headers={'Cache-Control':'no-store'})

def mobile(value):
    if not isinstance(value, str): raise ValueError('شماره موبایل باید رشته باشد.')
    n=value.strip().translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'))
    if n.startswith('+98'): n='0'+n[3:]
    elif n.startswith('0098'): n='0'+n[4:]
    elif n.startswith('98'): n='0'+n[2:]
    if not re.fullmatch(r'09[0-9]{9}',n): raise ValueError('شماره موبایل ایران معتبر نیست.')
    return n

def sender(value):
    if not isinstance(value,str) or not re.fullmatch(r'\+?[0-9]{3,20}',value.strip()): raise ValueError('شماره خط ارسال معتبر نیست.')
    return value.strip()

class Store:
    def __init__(self,root): self.root=Path(root)
    def path(self,tenant,suffix='json'):
        return self.root/(hashlib.sha256(tenant.encode()).hexdigest()+'.'+suffix)
    @contextmanager
    def lock(self,tenant):
        self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        fd=os.open(self.path(tenant,'lock'),os.O_CREAT|os.O_RDWR,0o600)
        with os.fdopen(fd,'w') as f:
            fcntl.flock(f,fcntl.LOCK_EX)
            yield
    def read(self,tenant):
        try: return json.loads(self.path(tenant).read_text(encoding='utf8'))
        except FileNotFoundError: return {'SMS_MAX_RECIPIENTS':100,'SMS_REQUIRE_CONFIRMATION':True}
    def write(self,tenant,cfg):
        fd,tmp=tempfile.mkstemp(dir=self.root)
        try:
            with os.fdopen(fd,'w',encoding='utf8') as f:
                json.dump(cfg,f);f.flush();os.fsync(f.fileno())
            os.replace(tmp,self.path(tenant))
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
    def audit(self,tenant,record):
        fd=os.open(self.path(tenant,'audit.jsonl'),os.O_APPEND|os.O_CREAT|os.O_WRONLY,0o600)
        with os.fdopen(fd,'a',encoding='utf8') as f:
            f.write(json.dumps({'time':int(time.time()*1000),**record},ensure_ascii=False)+'\n');f.flush();os.fsync(f.fileno())
    def recent(self,tenant):
        from collections import deque
        try:
            with open(self.path(tenant,'audit.jsonl'),encoding='utf8') as f:return [json.loads(x) for x in deque(f,maxlen=50)]
        except FileNotFoundError:return []

def public(cfg):
    return {'success':True,'api_key_configured':bool(cfg.get('PAYAMRESAN_API_KEY')),'token_configured':bool(cfg.get('token_hash')),'PAYAMRESAN_DEFAULT_SENDER':cfg.get('PAYAMRESAN_DEFAULT_SENDER',''),'SMS_MAX_RECIPIENTS':cfg.get('SMS_MAX_RECIPIENTS',100),'SMS_REQUIRE_CONFIRMATION':cfg.get('SMS_REQUIRE_CONFIRMATION',True)}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def send_provider(cfg,body):
    req=urllib.request.Request(PROVIDER_URL,data=json.dumps(body).encode(),method='POST',headers={'ApiKey':cfg['PAYAMRESAN_API_KEY'],'Content-Type':'application/json'})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as res:
        data=json.loads(res.read(1024*1024))
    # Conservative boundary: a transport 200 alone never establishes an accepted send.
    if not isinstance(data,dict): raise ValueError('Unrecognized provider response')
    success=data.get('success',data.get('Success',data.get('IsSuccess')))
    ids=data.get('message_ids',data.get('MessageIds',data.get('MessageIDs',[])))
    if success is not True or not isinstance(ids,list): raise ValueError('Provider did not confirm success')
    ids=[str(x) for x in ids if isinstance(x,(str,int)) and not isinstance(x,bool)]
    if not ids or any(not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',x) for x in ids): raise ValueError('Invalid message ids')
    # Do not reflect arbitrary provider content: it can echo credentials or message text.
    return ids

def schema(base,tenant):
    return {'openapi':'3.1.0','info':{'title':'AROMIN Grok SMS','version':'1.0.0','description':'Obtain explicit user confirmation for recipients and message before sending. Never retry an uncertain send automatically.'},'servers':[{'url':base.rstrip('/')}],'security':[{'grokBearer':[]}],'components':{'securitySchemes':{'grokBearer':{'type':'http','scheme':'bearer'}}},'paths':{'/api/grok/health':{'get':{'operationId':'grokSmsHealth','parameters':[{'in':'query','name':'tenant','schema':{'type':'string','default':tenant}}],'responses':{'200':{'description':'Configuration readiness only'},'401':{'description':'Unauthorized'}}}},'/api/grok/send-sms':{'post':{'operationId':'grokSendSms','description':'Send only after explicit user confirmation; confirmed_by_user must reflect that approval.','x-openai-isConsequential':True,'parameters':[{'in':'query','name':'tenant','schema':{'type':'string','default':tenant}}],'requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','additionalProperties':False,'required':['recipients','message','confirmed_by_user'],'properties':{'recipients':{'type':'array','minItems':1,'items':{'type':'string','pattern':'^(09[0-9]{9}|\\+989[0-9]{9})$'}},'message':{'type':'string','minLength':1},'sender_number':{'type':'string'},'send_to_blocked_numbers':{'type':'boolean','default':False},'confirmed_by_user':{'type':'boolean','default':False}}}}}},'responses':{str(c):{'description':m} for c,m in [(200,'Accepted: success, message, message_ids'),(400,'Invalid input'),(401,'Unauthorized'),(409,'Confirmation required'),(502,'Provider failed or delivery status unknown')]}}}}}

def router(identity,root):
    routes=APIRouter();store=Store(root)
    def tenant_of(request): return request.query_params.get('tenant','team')
    def admin(request,tenant):
        who=identity(request,tenant)
        return bool(who and who.get('role')=='manager')
    async def payload(request):
        if int(request.headers.get('content-length','0'))>100000: raise ValueError('درخواست بیش از حد بزرگ است.')
        raw=b''
        async for chunk in request.stream():
            raw+=chunk
            if len(raw)>100000:raise ValueError('درخواست بیش از حد بزرگ است.')
        data=json.loads(raw)
        if not isinstance(data,dict):raise ValueError('ورودی باید شیء JSON باشد.')
        return data
    def bearer(request,cfg):
        auth=request.headers.get('authorization','')
        return auth.lower().startswith('bearer ') and bool(cfg.get('token_hash')) and hmac.compare_digest(hashlib.sha256(auth[7:].encode()).hexdigest(),cfg['token_hash'])
    @routes.get('/api/settings/grok-sms')
    def get_settings(request:Request):
        tenant=tenant_of(request)
        if not admin(request,tenant):return error('فقط مدیر سازمان دسترسی دارد.',403)
        return JSONResponse(public(store.read(tenant)),headers={'Cache-Control':'no-store'})
    @routes.post('/api/settings/grok-sms')
    async def save_settings(request:Request):
        tenant=tenant_of(request)
        if not admin(request,tenant):return error('فقط مدیر سازمان دسترسی دارد.',403)
        try:
            data=await payload(request)
            with store.lock(tenant):
                cfg=store.read(tenant)
                for k in ('PAYAMRESAN_API_KEY','GROK_SMS_API_TOKEN'):
                    v=data.get(k,'')
                    if not isinstance(v,str) or len(v)>4096 or any(ord(c)<32 for c in v):raise ValueError('کلید یا توکن معتبر نیست.')
                    if v:
                        if k=='GROK_SMS_API_TOKEN':
                            if len(v)<32 or not re.fullmatch(r'[A-Za-z0-9_-]+',v):raise ValueError('توکن حداقل ۳۲ نویسهٔ انگلیسی، عدد، خط تیره یا زیرخط باشد.')
                            cfg['token_hash']=hashlib.sha256(v.encode()).hexdigest()
                        else:cfg[k]=v
                if 'PAYAMRESAN_DEFAULT_SENDER' in data:cfg['PAYAMRESAN_DEFAULT_SENDER']=sender(data['PAYAMRESAN_DEFAULT_SENDER'])
                n=data.get('SMS_MAX_RECIPIENTS',cfg['SMS_MAX_RECIPIENTS'])
                if type(n) is not int or not 1<=n<=10000:raise ValueError('حداکثر گیرنده باید عدد صحیح بین ۱ و ۱۰۰۰۰ باشد.')
                confirmation=data.get('SMS_REQUIRE_CONFIRMATION',cfg['SMS_REQUIRE_CONFIRMATION'])
                if type(confirmation) is not bool:raise ValueError('مقدار الزام تأیید باید boolean باشد.')
                cfg.update(SMS_MAX_RECIPIENTS=n,SMS_REQUIRE_CONFIRMATION=confirmation)
                store.write(tenant,cfg)
            return JSONResponse(public(cfg),headers={'Cache-Control':'no-store'})
        except (ValueError,TypeError):return error('تنظیمات معتبر نیست؛ شماره خط، توکن و تعداد گیرنده را بررسی کنید.',400)
    @routes.post('/api/settings/grok-sms/regenerate')
    def regenerate(request:Request):
        tenant=tenant_of(request)
        if not admin(request,tenant):return error('فقط مدیر سازمان دسترسی دارد.',403)
        token=secrets.token_urlsafe(48)
        with store.lock(tenant):
            cfg=store.read(tenant);cfg['token_hash']=hashlib.sha256(token.encode()).hexdigest();store.write(tenant,cfg)
        return JSONResponse({'success':True,'token':token,'message':'فقط یک‌بار نمایش داده می‌شود؛ توکن قبلی باطل شد.'},headers={'Cache-Control':'no-store'})
    @routes.post('/api/settings/grok-sms/test')
    def test(request:Request):
        tenant=tenant_of(request)
        if not admin(request,tenant):return error('فقط مدیر سازمان دسترسی دارد.',403)
        cfg=store.read(tenant)
        if not cfg.get('PAYAMRESAN_API_KEY') or not cfg.get('PAYAMRESAN_DEFAULT_SENDER'):return error('ابتدا کلید و شماره خط را ذخیره کنید.',400)
        return {'success':True,'message':'کلید و شماره خط تنظیم شده‌اند. برای تست واقعی، یک پیامک آزمایشی باید ارسال شود.','provider_verified':False}
    @routes.get('/api/settings/grok-sms/audit')
    def audit(request:Request):
        tenant=tenant_of(request)
        if not admin(request,tenant):return error('فقط مدیر سازمان دسترسی دارد.',403)
        return JSONResponse({'success':True,'rows':store.recent(tenant)},headers={'Cache-Control':'no-store'})
    @routes.get('/api/settings/grok-sms/schema')
    def get_schema(request:Request):
        tenant=tenant_of(request)
        if not admin(request,tenant):return error('فقط مدیر سازمان دسترسی دارد.',403)
        return schema(os.environ.get('PUBLIC_BASE_URL','https://dashboard.arominco.com'),tenant)
    @routes.get('/api/grok/health')
    def health(request:Request):
        cfg=store.read(tenant_of(request))
        if not bearer(request,cfg):return error('توکن معتبر نیست.',401)
        return {'success':True,'configured':bool(cfg.get('PAYAMRESAN_API_KEY') and cfg.get('PAYAMRESAN_DEFAULT_SENDER')),'provider_verified':False}
    @routes.post('/api/grok/send-sms')
    async def send(request:Request):
        tenant=tenant_of(request);cfg=store.read(tenant)
        if not bearer(request,cfg):return error('توکن معتبر نیست.',401)
        try:
            data=await payload(request)
            recipients=data.get('recipients');message=data.get('message')
            if not isinstance(recipients,list) or not 1<=len(recipients)<=cfg['SMS_MAX_RECIPIENTS']:raise ValueError('تعداد گیرنده مجاز نیست.')
            recipients=list(dict.fromkeys(mobile(n) for n in recipients))
            if not isinstance(message,str) or not message.strip() or len(message)>10000:raise ValueError('متن پیام معتبر نیست.')
            blocked=data.get('send_to_blocked_numbers',False);confirmed=data.get('confirmed_by_user',False)
            if type(blocked) is not bool or type(confirmed) is not bool:raise ValueError('گزینه‌های تأیید و ارسال مسدود باید boolean باشند.')
            if cfg['SMS_REQUIRE_CONFIRMATION'] and not confirmed:return error('پیش از ارسال، تأیید صریح کاربر لازم است.',409)
            line=sender(data.get('sender_number') or cfg.get('PAYAMRESAN_DEFAULT_SENDER',''))
        except (ValueError,TypeError):return error('ورودی نامعتبر است؛ شماره‌ها، متن و تعداد گیرندگان را بررسی کنید.',400)
        if not cfg.get('PAYAMRESAN_API_KEY'):return error('سرویس پیامک پیکربندی نشده است.',502)
        event={'request_id':secrets.token_hex(12),'recipient_count':len(recipients),'sender':line,'message_hash':hashlib.sha256(message.encode()).hexdigest(),'message_ids':[]}
        # Write durable intent before contacting a billable provider. Never auto-retry.
        with store.lock(tenant):store.audit(tenant,{**event,'status':'pending'})
        try:
            ids=await run_in_threadpool(send_provider,cfg,{'SenderNumber':line,'Message':message,'MobileNumber':recipients,'SendToBlocksNumber':blocked})
        except Exception:
            with store.lock(tenant):store.audit(tenant,{**event,'status':'failed_or_unknown'})
            return error('سرویس پیامک ارسال را تأیید نکرد؛ وضعیت ممکن است نامشخص باشد. پیش از ارسال مجدد بررسی کنید.',502)
        with store.lock(tenant):store.audit(tenant,{**event,'status':'success','message_ids':ids})
        return {'success':True,'message':'سرویس پیامک درخواست را پذیرفت.','message_ids':ids}
    return routes
