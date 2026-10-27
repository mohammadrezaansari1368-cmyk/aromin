"""SmartX form authority. Template/model output never bypasses these typed slots."""
import copy
import datetime
import json
import re
import secrets
import time
from pathlib import Path
from zoneinfo import ZoneInfo
from aromin_stage import jalali_valid
from aromin_support import Support, SupportError, canonical, clean, digest, sign, utc

TEMPLATE = Path(__file__).with_name('support_prompts') / 'aromin-support-agent.fa.md'
PRIORITIES = {
 'P1':'قطع کامل سرویس/اتصال صندوق در همه شعب، پیامک/کد اعتبار برای همه ناکار، افشای داده',
 'P2':'قطعی یک شعبه، پیامک/نظرسنجی/کد اعتبار برای بخشی ناکار، لایسنس معلق با سرویس قطع',
 'P3':'مشکل ورود/دسترسی، تنظیمات برند/شعبه، خطاهای غیرمسدودکننده',
 'P4':'سؤال/درخواست بهبود/اصلاح اطلاعات'}
VARIABLES = {'AGENT_NAME':'سروش','MEHR_CONTACT':'مسیر موفقیت مشتری هنوز تنظیم نشده است',
 'SALES_CONTACT':'مسیر فروش هنوز تأیید نشده است','SOROUSH_HANDOFF_CHANNEL':'صف داخلی Soroush-Support',
 'TICKET_TOOL':'خروجی support_ticket در صف Soroush-Support'}


def jalali_today(stamp=None):
    # Same conversion used by server._jalali; Tehran date, never browser time.
    dt=datetime.datetime.fromtimestamp(time.time() if stamp is None else stamp,ZoneInfo('Asia/Tehran'))
    gy,gm,gd=dt.year,dt.month,dt.day
    gy2=gy+1 if gm>2 else gy
    days=355666+365*gy+(gy2+3)//4-(gy2+99)//100+(gy2+399)//400+gd+[0,31,59,90,120,151,181,212,243,273,304,334][gm-1]
    jy=-1595+33*(days//12053);days%=12053;jy+=4*(days//1461);days%=1461
    if days>365: jy+=(days-1)//365;days=(days-1)%365
    jm=1+days//31 if days<186 else 7+(days-186)//30
    jd=1+(days%31 if days<186 else (days-186)%30)
    return '%04d/%02d/%02d'%(jy,jm,jd)


def settings_defaults():
    return {'template':TEMPLATE.read_text(encoding='utf-8'),'variables':dict(VARIABLES),'brands':[],
            'priorities':dict(PRIORITIES),'prioritiesConfirmed':False}


def render_template(template,variables):
    text = re.sub(r'\{([A-Z_]+)\}',lambda m:str(variables.get(m[1]) or 'هنوز تنظیم نشده است'),template)
    return re.sub(r'\{[A-Z_]+\}', 'هنوز تنظیم نشده است', text)


def safe_text(text):
    # Reject before persistence. No OTP/password/card is needed by this workflow.
    if re.search(r'(?i)(رمز|password|authorization|bearer|api[_ -]?key|توکن|\botp\b|کد ورود)',text) or re.search(r'(?<!\d)\d{16}(?!\d)',digits(text)):
        raise SupportError('sensitive_input')
    return text


def digits(text):
    return text.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'))


def number(text,maximum=1000000000000):
    text=digits(text).replace(',','').replace('٬','')
    if not re.fullmatch(r'\d{1,13}',text) or not 1<=int(text)<=maximum: raise SupportError('invalid_number')
    return int(text)


def choice(text,values):
    if text not in values: raise SupportError('invalid_choice')
    return values[text]


def date_value(text,today):
    text=digits(text).replace('-','/')
    if not re.fullmatch(r'\d{4}/\d{2}/\d{2}',text): raise SupportError('invalid_date')
    if not jalali_valid(*map(int,text.split('/'))) or text<today: raise SupportError('invalid_date')
    return text


def fields(v):
    f=[('brand','نام برند/کسب‌وکار شما چیست؟',120),('branch','نام شعبه چیست؟ اگر مربوط نیست «-» بنویسید.',120),
       ('name','نام شما چیست؟',120),('role','سمت شما چیست؟',80),('phone','شماره موبایل پیگیری چیست؟ رمز یا کد ورود نفرستید.',20),
       ('need','چه کمکی نیاز دارید؟ کمپین / پشتیبانی / فروش / شکایت',30)]
    if v.get('need')=='campaign_request':
        f += [('event_name','نام رویداد/مناسبت چیست؟',120),('benefit_type','نوع مزیت: ۱) فقط اطلاع‌رسانی ۲) اعتبار هدیه ۳) تخفیف درصدی',40)]
        if v.get('benefit_type')=='gift_credit':
            f += [('amount_toman','مبلغ اعتبار پیشنهادی شما به تومان چقدر است؟ تأیید نهایی با بررسی فنی است.',20),('validity_days','مدت اعتبار چند روز است؟',10),('wallet_mode','اعتبار با کیف پول ادغام شود یا جدا باشد؟ ادغام / جدا',30)]
        if v.get('benefit_type')=='percent_discount':
            f += [('percent','درصد پیشنهادی تخفیف (۱ تا ۱۰۰)؟ تأیید نهایی با بررسی فنی است.',10),('cap_toman','سقف مبلغ به تومان چقدر است؟ یا «بدون سقف» بنویسید.',20),('usage_count','تعداد دفعات استفاده چند بار است؟',10),('validity_days','مدت اعتبار چند روز است؟',10)]
        if v.get('benefit_type') in ('gift_credit','percent_discount'):
            f += [('reminder','یادآوری انقضا داشته باشد؟ بله / خیر',10)]
            if v.get('reminder'):
                f += [('days_before','چند روز قبل از انقضا؟ ۱، ۲ یا ۳',10),('reminder_text','متن یادآوری اختیاری است؛ اگر ندارید «-» بنویسید.',500)]
        f += [('audience','مخاطب: همه / RFM (گروه‌بندی خرید مشتریان)',20)]
        if v.get('audience')=='rfm': f += [('rfm_groups','گروه‌های RFM را با ویرگول جدا کنید؛ فعال‌بودن گروه‌بندی نیازمند بررسی فنی است.',500)]
        f += [('send_date_jalali','تاریخ ارسال جلالی از امروز به بعد (YYYY/MM/DD)؟',10),('send_time','ساعت ارسال با گام ۱۵ دقیقه چیست؟ توصیه ۹–۲۱؛ ممکن است تا ۲ ساعت تأخیر داشته باشد.',5),
              ('message_text','متن پیام چیست؟ باید عضویت در باشگاه مشتریان را ذکر کند و تبلیغ صرف نباشد؛ متن نیازمند تأیید فنی است.',1000),
              ('holdout','سنجش اثربخشی با گروه شاهد انجام شود؟ بله / خیر',10),('notes','یادداشت یا درخواست خارج از فرم؟ اگر ندارید «-» بنویسید.',500),
              ('expert','پرسش‌های اختیاری برای بهترشدن کمپین؟ بله / رد',10)]
        if v.get('expert'):
            f += [('top_margin_item','کدام محصول بیشترین حاشیه سود را دارد؟ یا «-».',200),('busy_slow_times','زمان‌های شلوغ و کم‌رونق شما چیست؟ یا «-».',200),('avg_ticket_toman','میانگین مبلغ فاکتور به تومان؟ یا «-».',20),('goal','هدف: بازگشت / جذب / سبد / -',20)]
    else:
        f += [('details','شرح مشکل یا درخواست و نتیجهٔ مورد انتظار چیست؟ اطلاعات حساس نفرستید.',1000)]
        if v.get('need')=='support_ticket':
            f += [('error','پیام خطا چیست؟ اگر ندارید «-».',300),('since','مشکل از چه زمانی شروع شد؟',120),('actions','چه اقدام‌هایی انجام داده‌اید؟',300),('impact','اثر مشکل بر کسب‌وکار و شعب چیست؟',300),('priority','اولویت بر اساس تعاریف ثبت‌شده: P1 / P2 / P3 / P4',2)]
    return f+[('confirmation','برای ارسال این اطلاعات به سروش و پیگیری از همین چت، دقیقاً «تأیید می‌کنم» بنویسید؛ برای اصلاح «اصلاح» بنویسید.',40)]


def parse_field(name,text,v,today):
    safe_text(text)
    if name=='phone':
        text=digits(text).replace(' ','').replace('-','')
        if not re.fullmatch(r'09\d{9}',text): raise SupportError('invalid_phone')
    elif name=='need': text=choice(text,{'کمپین':'campaign_request','پشتیبانی':'support_ticket','فروش':'sales_followup','شکایت':'complaint_escalation'})
    elif name=='benefit_type': text=choice(digits(text),{'1':'inform_only','2':'gift_credit','3':'percent_discount','فقط اطلاع‌رسانی':'inform_only','اعتبار هدیه':'gift_credit','تخفیف درصدی':'percent_discount'})
    elif name in ('amount_toman','validity_days','percent','usage_count','days_before','avg_ticket_toman'):
        if name=='avg_ticket_toman' and text=='-': return None
        text=number(text,{'percent':100,'days_before':3,'validity_days':3650,'usage_count':10000}.get(name,1000000000000))
        if name=='days_before' and text>v['validity_days']: raise SupportError('invalid_reminder')
    elif name=='cap_toman': text=None if text=='بدون سقف' else number(text)
    elif name=='wallet_mode': text=choice(text,{'ادغام':'merge_with_wallet','جدا':'separate'})
    elif name in ('reminder','holdout','expert'): text=choice(text,{'بله':True,'خیر':False,'رد':False})
    elif name=='audience': text=choice(text,{'همه':'all','RFM':'rfm','rfm':'rfm'})
    elif name=='rfm_groups':
        text=[x.strip() for x in re.split('[,،]',text) if x.strip()]
        if not 1<=len(text)<=10 or any(len(x)>80 for x in text): raise SupportError('invalid_rfm')
    elif name=='send_date_jalali': text=date_value(text,today)
    elif name=='send_time':
        text=digits(text)
        if not re.fullmatch(r'(?:[01]\d|2[0-3]):(?:00|15|30|45)',text): raise SupportError('invalid_time')
    elif name=='message_text':
        if 'باشگاه' not in text or not any(x in text for x in ('عضو','عضویت','مشتری')) or re.search('خرید کنید|فروش ویژه|حراج',text): raise SupportError('club_message_required')
    elif name=='goal': text=choice(text,{'بازگشت':'winback','جذب':'new_customers','سبد':'basket_size','-':None})
    elif name=='priority': text=choice(text,{x:x for x in PRIORITIES})
    elif name=='confirmation':
        if text not in ('تأیید می‌کنم','تایید می‌کنم'): raise SupportError('explicit_confirmation_required')
    elif text=='-' and name in ('branch','notes','reminder_text','top_margin_item','busy_slow_times','error'): text=None
    return text


def validate_campaign(body,today):
    """Reconstruct from typed slots, then require exact canonical stage-5 shape."""
    try:
        v=body['_slots'] if '_slots' in body else None
        if v is not None: raise SupportError('invalid_campaign')
        c=body['campaign']; contact=body['contact']
        flat={'brand':contact['brand'],'branch':contact['branch'],'name':contact['name'],'role':contact['role'],'phone':contact['phone'],'need':'campaign_request',
              'event_name':c['event_name'],'benefit_type':c['benefit_type'],'audience':c['audience']['type'],'send_date_jalali':c['send_date_jalali'],'send_time':c['send_time'],'message_text':c['message_text'],'holdout':c['measure_effectiveness_holdout'],'notes':c['notes']}
        if c['benefit_type'] not in ('inform_only','gift_credit','percent_discount'): raise SupportError('invalid_campaign')
        gift,discount=c['gift_credit'],c['percent_discount']
        if (c['benefit_type']=='gift_credit') != isinstance(gift,dict) or (c['benefit_type']=='percent_discount') != isinstance(discount,dict): raise SupportError('exclusive_benefit')
        if c['benefit_type']!='gift_credit' and gift is not None or c['benefit_type']!='percent_discount' and discount is not None: raise SupportError('exclusive_benefit')
        for key,limit in [('brand',120),('name',120),('role',80),('event_name',120),('message_text',1000)]: safe_text(clean(flat[key],limit))
        parse_field('phone',flat['phone'],{},today);date_value(c['send_date_jalali'],today);parse_field('send_time',c['send_time'],{},today);parse_field('message_text',c['message_text'],{},today)
        for selected in (gift,discount):
            if selected is None: continue
            for key in ('validity_days','usage_count','percent','amount_toman'):
                if key in selected and (type(selected[key]) is not int or selected[key]<=0 or selected[key]>{'percent':100,'validity_days':3650,'usage_count':10000}.get(key,1000000000000)): raise SupportError('invalid_benefit')
            required={'amount_toman','validity_days','wallet_mode','expiry_reminder'} if selected is gift else {'percent','cap_toman','no_cap','usage_count','validity_days','expiry_reminder'}
            if set(selected)!=required: raise SupportError('invalid_benefit')
            if selected is gift and selected['wallet_mode'] not in ('merge_with_wallet','separate'): raise SupportError('invalid_wallet')
            if selected is discount:
                if type(selected['no_cap']) is not bool or (selected['no_cap'] and selected['cap_toman'] is not None) or (not selected['no_cap'] and (type(selected['cap_toman']) is not int or not 1<=selected['cap_toman']<=1000000000000)): raise SupportError('invalid_cap')
            r=selected['expiry_reminder']
            if set(r)!= {'enabled','days_before','text'} or type(r['enabled']) is not bool: raise SupportError('invalid_reminder')
            if r['enabled']:
                if type(r['days_before']) is not int or not 1<=r['days_before']<=min(3,selected['validity_days']): raise SupportError('invalid_reminder')
                if r['text'] is not None: safe_text(clean(r['text'],500))
            elif r['days_before'] is not None or r['text'] is not None: raise SupportError('invalid_reminder')
        audience=c['audience']
        if set(audience)!= {'type','rfm_groups','rfm_may_be_unavailable'} or audience['type'] not in ('all','rfm') or type(audience['rfm_may_be_unavailable']) is not bool or not isinstance(audience['rfm_groups'],list): raise SupportError('invalid_audience')
        if audience['type']=='all' and audience['rfm_groups'] or audience['type']=='rfm' and not 1<=len(audience['rfm_groups'])<=10: raise SupportError('invalid_audience')
        for x in audience['rfm_groups']: safe_text(clean(x,80))
        if type(c['measure_effectiveness_holdout']) is not bool or c['message_mentions_club'] is not True: raise SupportError('invalid_holdout')
        if c['notes'] is not None: safe_text(clean(c['notes'],500))
        confirmation=body['customer_confirmation']
        if set(confirmation)!= {'confirmed','confirmed_at_jalali','confirmation_quote'}: raise SupportError('invalid_confirmation')
        for stamp in (body['created_at_jalali'],confirmation['confirmed_at_jalali']):
            if not isinstance(stamp,str) or not re.fullmatch(r'\d{4}/\d{2}/\d{2} \d{2}:\d{2}',stamp): raise SupportError('invalid_timestamp')
        if body['customer_confirmation']['confirmed'] is not True or body['customer_confirmation']['confirmation_quote'] not in ('تأیید می‌کنم','تایید می‌کنم'): raise SupportError('explicit_confirmation_required')
        if set(c)!= {'event_name','benefit_type','gift_credit','percent_discount','audience','send_date_jalali','send_time','time_note','message_text','message_mentions_club','measure_effectiveness_holdout','notes'}: raise SupportError('invalid_campaign')
        if set(body)!= {'handoff_type','schema_version','created_at_jalali','contact','campaign','expert_answers','customer_confirmation','flags','open_questions','next_steps_for_soroush'} or body['handoff_type']!='campaign_request' or body['schema_version']!='1.0': raise SupportError('invalid_campaign')
        if set(contact)!= {'brand','brand_matched','branch','name','role','phone','preferred_contact'} or type(contact['brand_matched']) is not bool or contact['preferred_contact'] not in ('chat','phone',None): raise SupportError('invalid_contact')
        if contact['branch'] is not None: safe_text(clean(contact['branch'],120))
        expert=body['expert_answers']
        if set(expert)!= {'top_margin_item','busy_slow_times','avg_ticket_toman','goal'} or expert['goal'] not in ('winback','new_customers','basket_size',None): raise SupportError('invalid_expert')
        for key in ('top_margin_item','busy_slow_times'):
            if expert[key] is not None: safe_text(clean(expert[key],200))
        if expert['avg_ticket_toman'] is not None and (type(expert['avg_ticket_toman']) is not int or not 1<=expert['avg_ticket_toman']<=1000000000000): raise SupportError('invalid_expert')
        if set(body['flags'])!={'sales_followup','price_asked','complaint_escalated_to_mehr'} or any(type(x) is not bool for x in body['flags'].values()): raise SupportError('invalid_flags')
        if not isinstance(body['open_questions'],list) or len(body['open_questions'])>10 or not isinstance(body['next_steps_for_soroush'],list) or len(body['next_steps_for_soroush'])>5: raise SupportError('invalid_questions')
        for x in body['open_questions']+body['next_steps_for_soroush']: safe_text(clean(x,300))
        if len(canonical(body))>14000: raise SupportError('payload_too_large',413)
        return body
    except (KeyError,TypeError,ValueError,AttributeError): raise SupportError('invalid_campaign') from None


class SmartxSupport(Support):
    def link(self,action):
        # A customer capability rotation must not revoke separately authenticated Goftino chats.
        channel_ids={v['sid'] for v in self.state.get('goftino',{}).values()}
        preserved={k:v for k,v in self.state['sessions'].items() if k in channel_ids}
        result=super().link(action)
        self.state['sessions'].update(preserved)
        return result
    def today(self): return jalali_today(self.clock())
    def settings(self):
        return copy.deepcopy(self.state.get('settings') or settings_defaults())
    def save_settings(self,cfg):
        if not isinstance(cfg,dict) or set(cfg)!=set(settings_defaults()): raise SupportError('invalid_settings')
        clean(cfg['template'],50000)
        if not isinstance(cfg['variables'],dict) or not isinstance(cfg['priorities'],dict): raise SupportError('invalid_settings')
        if set(cfg['variables'])!=set(VARIABLES) or set(cfg['priorities'])!=set(PRIORITIES) or type(cfg['prioritiesConfirmed']) is not bool: raise SupportError('invalid_settings')
        for x in list(cfg['variables'].values())+list(cfg['priorities'].values()): safe_text(clean(x,500))
        if not isinstance(cfg['brands'],list) or len(cfg['brands'])>500: raise SupportError('invalid_brands')
        for b in cfg['brands']:
            if not isinstance(b,dict) or set(b)!= {'name','active'} or type(b['active']) is not bool: raise SupportError('invalid_brands')
            safe_text(clean(b['name'],120))
        if len(canonical(cfg))>150000: raise SupportError('invalid_settings')
        self.state['settings']=copy.deepcopy(cfg);self.admit();self.audit('settings',actor='manager')
        return {'ok':True,'settings':self.settings(),'todayJalali':self.today()}
    def system_prompt(self,link='',brand=''):
        cfg=self.settings(); values={**cfg['variables'],'BRAND_LIST':json.dumps(cfg['brands'],ensure_ascii=False),'TODAY_JALALI':self.today(),'LINK':link or 'لینک در این کانال نمایش داده نمی‌شود','BRAND':brand or 'کسب‌وکار شما'}
        template=cfg['template']; start=template.find('## ۱)');end=template.find('## پیوست')
        if start>=0: template=template[start:end if end>start else None]
        template='\n'.join(line for line in template.splitlines() if 'یادداشت داخلی' not in line)
        for priority,definition in cfg['priorities'].items():
            template=re.sub(r'(?m)^\| \*\*'+priority+r'\*\*[^\n]*$', '| '+priority+' | '+definition+' | طبق تعریف عملیات |',template)
        return render_template(template,values)+'\nتعاریف اولویت (پیشنهادی؛ تأیید عملیات: '+str(cfg['prioritiesConfirmed'])+'):\n'+json.dumps(cfg['priorities'],ensure_ascii=False)+'\nمشتری فقط با ایجنت در لینک یا گفتینو صحبت می‌کند. JSON داخلی هرگز به مشتری نمایش داده نشود.'
    def start(self,token,session_id=None):
        if session_id: return super().start(token,session_id)
        out=super().start(token)
        self.state['sessions'][out['sessionId']]['flow']='smartx'
        return self.response(out['sessionId'],self.state['sessions'][out['sessionId']])
    def response(self,sid,session):
        if session.get('flow')!='smartx': return super().response(sid,session)
        fs=fields(session['values']);step=session['step']; done=step>=len(fs)
        question='اطلاعات تأیید شد؛ برای ثبت نهایی ارسال درخواست را بزنید.' if done else fs[step][1]
        if step==0: question='سلام، من '+self.settings()['variables']['AGENT_NAME']+'، ایجنت هوش مصنوعی آرومین هستم. '+question
        if not done and fs[step][0]=='priority': question+='\n'+'\n'.join(k+': '+x for k,x in self.settings()['priorities'].items())+('\nتعاریف تأییدشده توسط عملیات.' if self.settings()['prioritiesConfirmed'] else '\nتعاریف پیشنهادی؛ نیازمند تأیید عملیات.')
        if not done and fs[step][0]=='confirmation': question=self.summary(session['values'])+'\n'+question
        return {'ok':True,'sessionId':sid,'question':render_template(question,{}),'complete':done,'reference':session.get('requestId'),'step':step,'totalSteps':len(fs),'maxLength':40 if done else fs[step][2]}
    def message(self,token,sid,text,expected_step=None):
        session=self.session(token,sid)
        if session.get('flow')!='smartx': return super().message(token,sid,text,expected_step)
        if expected_step is not None and (type(expected_step) is not int or expected_step!=session['step']):
            if type(expected_step) is int and session.get('lastStep')==expected_step and isinstance(text,str) and session.get('lastHash')==digest(text): return self.response(sid,session)
            raise SupportError('stale_step',409)
        fs=fields(session['values']); step=session['step']
        if step>=len(fs): raise SupportError('interview_complete',409)
        name,_,limit=fs[step];text=clean(text,limit)
        if text.startswith(('قیمت','هزینه')):
            session.setdefault('flags',{}).update(price_asked=True,sales_followup=True)
            return dict(self.response(sid,session),question='قیمت دقیق و به‌روز را فروش اعلام می‌کند. اگر می‌خواهید درخواست فروش ثبت شود «اصلاح» را در مرحلهٔ تأیید انتخاب کنید و مسیر فروش را انتخاب کنید.')
        if name=='confirmation' and text=='اصلاح':
            session.update(values={},step=0);return self.response(sid,session)
        if name=='confirmation' and text not in ('تأیید می‌کنم','تایید می‌کنم'):
            return dict(self.response(sid,session),question='بدون تأیید صریح تحویل نمی‌شود. دقیقاً «تأیید می‌کنم» بنویسید یا «اصلاح».')
        parsed=parse_field(name,text,session['values'],self.today())
        session['values'][name]=parsed;session['lastStep']=step;session['lastHash']=digest(text);session['step']+=1
        if name=='confirmation': session['confirmedAt']=self.today()+' '+datetime.datetime.fromtimestamp(self.clock(),ZoneInfo('Asia/Tehran')).strftime('%H:%M')
        self.admit()
        response=self.response(sid,session)
        if name=='brand' and not any(b['active'] and b['name'].strip()==parsed for b in self.settings()['brands']):
            response['question']='این برند را در فهرست فعال نمی‌بینم؛ برای پیگیری علامت می‌زنم. '+response['question']
        return response
    def summary(self,v):
        text='خلاصه درخواست:\nبرند/شعبه: '+v.get('brand','')+' / '+str(v.get('branch') or '—')+'\nتماس: '+v.get('name','')+'، '+v.get('role','')+'، '+v.get('phone','')
        if v.get('need')=='campaign_request':
            text+='\nمناسبت: '+v.get('event_name','')+'\nمزیت: '+{'inform_only':'فقط اطلاع‌رسانی','gift_credit':'اعتبار هدیه','percent_discount':'تخفیف درصدی'}.get(v.get('benefit_type'),'')+'\nجزئیات مزیت: '+'؛ '.join({'amount_toman':'اعتبار (تومان)','validity_days':'مدت (روز)','wallet_mode':'کیف پول','percent':'درصد','cap_toman':'سقف (تومان)','usage_count':'دفعات','reminder':'یادآوری','days_before':'روز قبل انقضا','reminder_text':'متن یادآوری'}[k]+': '+str({'merge_with_wallet':'ادغام','separate':'جدا',True:'بله',False:'خیر'}.get(v[k],v[k]) if isinstance(v[k],(str,bool)) else v[k] if v[k] is not None else '—') for k in ('amount_toman','validity_days','wallet_mode','percent','cap_toman','usage_count','reminder','days_before','reminder_text') if k in v)
            text+='\nمخاطب: '+{'all':'همهٔ مشتریان','rfm':'گروه‌بندی خرید'}.get(v.get('audience'),'')+' '+ '، '.join(v.get('rfm_groups',[]))+'\nارسال: '+v.get('send_date_jalali','')+' '+v.get('send_time','')+' (ممکن است تا ۲ ساعت تأخیر داشته باشد)\nمتن: '+v.get('message_text','')+'\nگروه شاهد: '+('بله' if v.get('holdout') else 'خیر')+'\nیادداشت: '+str(v.get('notes') or '—')
        else: text+='\nشرح: '+v.get('details','')+'\nاولویت: '+v.get('priority','—')
        return text+'\nسروش فرم و فعال‌سازی را با تیم فنی تهران هماهنگ می‌کند؛ زمان قطعی تضمین نمی‌شود.'
    def build_campaign(self,v,session):
        reminder={'enabled':v.get('reminder',False),'days_before':v.get('days_before'),'text':v.get('reminder_text')}
        benefit=v['benefit_type']; gift=discount=None
        if benefit=='gift_credit': gift={k:v[k] for k in ('amount_toman','validity_days','wallet_mode')};gift['expiry_reminder']=reminder
        if benefit=='percent_discount':
            discount={k:v[k] for k in ('percent','cap_toman','usage_count','validity_days')};discount.update(no_cap=v['cap_toman'] is None,expiry_reminder=reminder)
        matched=any(b['active'] and b['name'].strip()==v['brand'] for b in self.settings()['brands'])
        return {'handoff_type':'campaign_request','schema_version':'1.0','created_at_jalali':self.today()+' '+datetime.datetime.fromtimestamp(self.clock(),ZoneInfo('Asia/Tehran')).strftime('%H:%M'),
            'contact':{'brand':v['brand'],'brand_matched':matched,'branch':v.get('branch'),'name':v['name'],'role':v['role'],'phone':v['phone'],'preferred_contact':'chat'},
            'campaign':{'event_name':v['event_name'],'benefit_type':benefit,'gift_credit':gift,'percent_discount':discount,
                        'audience':{'type':v['audience'],'rfm_groups':v.get('rfm_groups',[]),'rfm_may_be_unavailable':v['audience']=='rfm'},
                        'send_date_jalali':v['send_date_jalali'],'send_time':v['send_time'],'time_note':'ارسال تا حدود ۲ ساعت ممکن است تأخیر داشته باشد','message_text':v['message_text'],'message_mentions_club':True,'measure_effectiveness_holdout':v['holdout'],'notes':v.get('notes')},
            'expert_answers':{k:v.get(k) for k in ('top_margin_item','busy_slow_times','avg_ticket_toman','goal')},
            'customer_confirmation':{'confirmed':True,'confirmed_at_jalali':session['confirmedAt'],'confirmation_quote':v['confirmation']},
            'flags':{'sales_followup':session.get('flags',{}).get('sales_followup',False),'price_asked':session.get('flags',{}).get('price_asked',False),'complaint_escalated_to_mehr':False},'open_questions':[] if matched else ['برند با فهرست فعال تطبیق نشد؛ بررسی شود.'],
            'next_steps_for_soroush':['فرم کمپین اسمارت‌ایکس را پر کن','تأیید متن و فعال‌سازی را با تیم فنی تهران هماهنگ کن','هر اصلاح متن را از همین چت به ایجنت برگردان و تأیید دوباره بگیر','تا تأیید فنی فعال‌سازی نکن؛ تأیید مالک لازم نیست']}
    def status(self,token,sid):
        session=self.session(token,sid);rid=session.get('requestId')
        if not rid: raise SupportError('request_unavailable',404)
        row=self.state['requests'].get(rid)
        if not row: raise SupportError('request_unavailable',404)
        return {'ok':True,'reference':rid,'status':row['status'],'resultNote':row['resultNote']}
    def submit(self,token,sid):
        session=self.session(token,sid)
        if session.get('flow')!='smartx': return super().submit(token,sid)
        if session.get('requestId'):
            rid=session['requestId'];return {'ok':True,'reference':rid,'status':self.state['requests'][rid]['status']}
        v=session['values']
        if session['step']!=len(fields(v)) or v.get('confirmation') not in ('تأیید می‌کنم','تایید می‌کنم'): raise SupportError('explicit_confirmation_required')
        if len(self.state['requests'])>=150 or sum(r['status'] not in ('done','failed') for r in self.state['requests'].values())>=100: raise SupportError('queue_full',503)
        # Re-parse every persisted field: neither the model nor a forged draft is trusted.
        for name,_,limit in fields(v):
            value=v.get(name)
            if name=='confirmation': continue
            if isinstance(value,str): safe_text(clean(value,limit))
        now=self.clock();rid=secrets.token_urlsafe(16)
        campaign=validate_campaign(self.build_campaign(v,session),self.today()) if v['need']=='campaign_request' else None
        ticket=None if campaign else {'handoff_type':v['need'],'contact':{'brand':v['brand'],'branch':v.get('branch'),'name':v['name'],'role':v['role'],'phone':v['phone']},'details':v['details'],'priority':v.get('priority'),'error':v.get('error'),'since':v.get('since'),'actions':v.get('actions'),'impact':v.get('impact'),'confirmed':True,'routing':self.settings()['variables'],'flags':{'sales_followup':v['need']=='sales_followup','price_asked':session.get('flags',{}).get('price_asked',False),'complaint_escalated_to_mehr':v['need']=='complaint_escalation'},'priorityDefinition':self.settings()['priorities'].get(v.get('priority')),'priorityDefinitionStatus':'confirmed' if self.settings()['prioritiesConfirmed'] else 'proposed'}
        payload={'schemaVersion':1,'requestId':rid,'tenantId':self.tenant,'createdAt':utc(now),'customer':{'name':v['name'],'contact':v['phone']},'chatSummary':'درخواست '+v['need']+'؛ تأیید صریح ثبت شد','requestType':v['need'],'details':v.get('details') or v.get('event_name'),'campaign':campaign,'ticket':ticket}
        payload['signature']=sign(payload,self.key)
        if len(canonical(payload))>16384: raise SupportError('payload_too_large',413)
        self.state['requests'][rid]={'payload':payload,'status':'queued','created':now,'updated':now,'timestamps':{'queued':utc(now)},'attempts':0,'nextAt':now,'resultNote':''}
        session['requestId']=rid;session['values']={};self.audit('create',rid);self.admit()
        return {'ok':True,'reference':rid,'status':'queued'}
