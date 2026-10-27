"""Verified Goftino wire format; AROMIN gateway auth (not a provider signature claim)."""
import hashlib
import hmac
import json
import re
import time
import urllib.request
from typing import Protocol
from aromin_support import SupportError, canonical, digest
from aromin_support_campaign import SmartxSupport


class ReplyAdapter(Protocol):
    def send(self,config:dict,chat:str,text:str)->str: ...


def verify_inbound(config,headers,raw,clock=time.time):
    secret=config.get('webhookSecret','')
    if config.get('enabled') is not True or not isinstance(secret,str) or len(secret)<32: raise SupportError('goftino_not_configured',503)
    supplied=headers.get('x-aromin-goftino-secret','')
    if supplied and hmac.compare_digest(supplied.encode(),secret.encode()): return
    stamp=headers.get('x-aromin-goftino-timestamp','');sig=headers.get('x-aromin-goftino-signature','')
    if not re.fullmatch(r'\d{10}',stamp) or abs(clock()-int(stamp))>300: raise SupportError('unauthorized',401)
    expected=hmac.new(secret.encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig.encode(),('sha256='+expected).encode()): raise SupportError('unauthorized',401)


class GoftinoAdapter:
    def __init__(self,http=None): self.http=http or self._http
    @staticmethod
    def _http(url,headers,body):
        request=urllib.request.Request(url,data=body,headers=headers,method='POST')
        with urllib.request.urlopen(request,timeout=10) as response: return json.loads(response.read(65536))
    def send(self,config,chat,text):
        key,operator=config.get('apiKey'),config.get('operatorId')
        if not isinstance(key,str) or len(key)<16 or not operator: raise SupportError('goftino_not_configured',503)
        # Plain text only; do not pass Goftino button markup from untrusted customer data.
        text=text.replace('[','［').replace(']','］')[:6000]
        try:
            out=self.http('https://api.goftino.com/v1/send_message',{'Content-Type':'application/json','goftino-key':key},canonical({'chat_id':chat,'operator_id':operator,'message':text}))
            if out.get('status')!='success' or not isinstance(out.get('data',{}).get('message_id'),str): raise ValueError()
            return out['data']['message_id']
        except Exception: raise SupportError('goftino_unavailable',503) from None


class _VerifiedChannelSupport(SmartxSupport):
    def check(self,token):
        # Only receive() constructs this after route-level gateway auth and tenant binding.
        pass


def receive(service,config,event,answer=None):
    if config.get('tenant')!=service.tenant: raise SupportError('tenant_denied',403)
    if event.get('event')!='new_message': return None
    data=event.get('data')
    if not isinstance(data,dict) or not isinstance(data.get('sender'),dict): raise SupportError('invalid_event')
    if data['sender'].get('from')!='user' or data.get('type')!='text': return None
    for key in ('chat_id','user_id','message_id'):
        if not isinstance(data.get(key),str) or not 1<=len(data[key])<=160: raise SupportError('invalid_event')
    content=data.get('content')
    if not isinstance(content,str) or not 1<=len(content)<=2000: raise SupportError('invalid_event')
    channel=_VerifiedChannelSupport(service.state,service.tenant,service.key,service.clock)
    state=service.state.setdefault('goftino',{})
    now=service.clock()
    for key in list(state):
        if now-state[key]['at']>=86400: del state[key]
    chatkey=digest(data['chat_id']+'\0'+data['user_id'])
    restarted=chatkey in state and state[chatkey]['sid'] not in service.state['sessions']
    if restarted: del state[chatkey]
    if chatkey not in state:
        if len(state)>=100: raise SupportError('session_limit',429)
        started=channel.start('')
        state[chatkey]={'sid':started['sessionId'],'at':now,'seen':[],'pending':{}}
        response=dict(started,question=started['question']+' برای پرسش دانشی «سؤال: ...» بنویسید.')
        if restarted:
            response=dict(started,question='نشست قبلی منقضی شده است؛ لطفاً از ابتدا اطلاعات را تأیید کنید. '+started['question'])
        elif answer is None and content.strip() not in ('سلام','شروع','hi','hello'):
            try: response=channel.message('',started['sessionId'],content)
            except SupportError as error:
                if error.status>=500: raise
                response={'question':'این مقدار قابل ثبت نیست ('+error.code+'). رمز یا کد نفرستید؛ '+started['question'],'complete':False}
    else:
        response=None
    conversation=state[chatkey];mid=digest(data['message_id'])
    if mid in conversation['seen']:
        text=conversation['pending'].get(mid)
        if text is not None: return {'chat':data['chat_id'],'text':text,'duplicate':True,'chatKey':chatkey,'messageKey':mid}
        return None
    if len(conversation['pending'])>=10 or len(conversation['seen'])>=100:
        raise SupportError('goftino_backlog',503)
    if answer is not None:
        response={'question':answer+'\n'+channel.response(conversation['sid'],channel.state['sessions'][conversation['sid']])['question'],'complete':False}
    if response is None:
        if channel.state['sessions'][conversation['sid']].get('requestId'):
            if content.strip()=='شروع':
                started=channel.start('');conversation['sid']=started['sessionId'];response=started
            else: response={'question':'درخواست قبلی ثبت شده است. برای درخواست تازه یا اصلاح متن، «شروع» بنویسید.','complete':False}
        try:
            if response is None: response=channel.message('',conversation['sid'],content)
        except SupportError as e:
            if e.status>=500: raise
            # Validation failures do not persist sensitive text or advance interview slots.
            response={'question':'این مقدار قابل ثبت نیست ('+e.code+'). رمز یا کد نفرستید؛ پاسخ همین مرحله را اصلاح کنید.','complete':False}
    if response.get('complete'):
        submitted=channel.submit('',conversation['sid'])
        row=channel.state['requests'][submitted['reference']]
        row.update(replyChannel='goftino',replyChat=data['chat_id'],replyAccount=config.get('account'))
        text='درخواست ثبت شد. شماره پیگیری: '+submitted['reference']+'؛ سروش فرم و فعال‌سازی را با تیم فنی تهران هماهنگ می‌کند. زمان قطعی تضمین نیست.'
    else: text=response['question']
    conversation['seen'].append(mid)
    conversation['pending'][mid]=text;conversation['at']=now
    channel.admit()
    return {'chat':data['chat_id'],'text':text,'duplicate':False,'chatKey':chatkey,'messageKey':mid}


def sent(service,reply):
    conversation=service.state.get('goftino',{}).get(reply['chatKey'])
    if conversation: conversation['pending'].pop(reply['messageKey'],None)
    return True
