"""Read-only performance projections. No payroll/commission/attendance engine changes."""
from aromin_security import PublicValidationError, PublicPermissionError
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from aromin_stage import parse_stage_change

UNITS = {'sales':'sales','online':'sales','salesmgr':'sales','finance':'finance','accmgr':'finance','support':'support'}
AXES = {
 'sales': [('activity','میزان فعالیت','تماس','تماس‌های پاسخ‌دادهٔ ورودی و خروجی از ریز تماسِ سرور (تصمیم مالک)؛ تماس صف، داخلی و بی‌نگاشت شمرده نمی‌شود.'),('efficiency','راندمان','٪','تماس پاسخ‌داده ÷ (ورودی + خروجی) × ۱۰۰ از ریز تماسِ سرور (تصمیم مالک)؛ تماس صف و داخلی شمرده نمی‌شود.'),('conversion','نرخ تبدیل','٪','تاریخچه ورود به گروه واجد شرایط و نتیجه همان گروه لازم است.'),('contract_average','میانگین ارزش قرارداد','تومان','مجموع مبلغ خام قراردادهای بستن ÷ تعداد همان قراردادها؛ خالص از مالیات/تخفیف ادعا نمی‌شود.')],
 'support':[('activity','میزان فعالیت','فعالیت','تیکت یکتا به تاریخ ثبت + تماس ورودی + تماس خروجیِ کارشناس با نگاشت تأییدشده؛ تماس داخلی و صف شمرده نمی‌شود. این جمعِ فعالیت‌هاست، نه تعداد مشتری یکتا.'),('efficiency','راندمان','٪','تیکت‌های به‌موقع در SLA و OLA هر دو ÷ تیکت‌های دارای هر دو وضعیت × ۱۰۰ (تصمیم مالک)؛ وضعیت خالی شمرده نمی‌شود.'),('resolution','نرخ حل موفق','٪','FCR به سابقه تماس اول و بازه مشاهده نیاز دارد.'),('quality','کیفیت خدمات','٪','نظرسنجی معتبر و تعداد پاسخ‌ها موجود نیست.')],
 'finance':[('finance_documents','میزان فعالیت','سند','اسناد یکتای دارای رویداد fin_by برای حسابدار منتخب؛ ثبت‌کننده با مسئول مالی متفاوت است.'),('efficiency','راندمان','٪','وظایف دارای سررسید و زمان انجام موجود نیست.'),('accuracy','دقت مالی','٪','نتیجه اولین بررسی و علت اصلاح ساخت‌یافته موجود نیست.'),('effectiveness','اثربخشی مالی','٪','مسئول وصول، گروه سررسید و پرداخت جزئی قابل انتساب موجود نیست.')]
}

# WP-3: server call stats (aromin_calls.daily_records). Kept beside the axes, not mapped onto activity/efficiency (owner has not defined that mapping).
CALL_METRICS=('calls_in','calls_out','calls_internal','calls_answered','calls_missed','talk_seconds')
CALL_UNITS={m:('ثانیه' if m=='talk_seconds' else 'تماس') for m in CALL_METRICS}

def call_totals(rows):
    """Per-metric sums of call records; None when there is no call record (no data ≠ zero)."""
    group=[r for r in rows if r['metric'] in CALL_METRICS]
    if not group: return None
    return {m:sum(r['value'] for r in group if r['metric']==m) for m in CALL_METRICS}

def date_key(raw):
    r = parse_stage_change(str(raw or ''))
    return r.get('date') if r.get('ok') else None

def directory(full, ident, users):
    people = [p for p in full.get('people',[]) if isinstance(p,dict)]
    if any(p.get('id') is None or not p.get('name') for p in people): raise PublicValidationError('شناسه یا نام شخص ناقص است؛ مدیر نگاشت را اصلاح کند.')
    ids = [str(p['id']) for p in people]
    if len(ids)!=len(set(ids)): raise PublicValidationError('شناسه تکراری اشخاص؛ نگاشت باید اصلاح شود.')
    rec=users.get(ident['user'],{})
    linked=[p for p in people if (str(p['id'])==str(rec['personId']) if rec.get('personId') is not None else p['name']==rec.get('person'))]
    role=ident['role']
    if role=='manager': allowed=people
    elif role in ('salesmgr','accmgr'): allowed=[p for p in people if UNITS.get(p.get('role'))==UNITS[role]]
    elif len(linked)==1 and not linked[0].get('inactive'): allowed=linked
    else: raise PublicPermissionError('حساب به شناسه یکتای کارمند متصل نیست؛ مدیر نگاشت حساب را اصلاح کند.')
    return allowed

def select(people, pid='', unit=''):
    if pid and not any(str(p['id'])==str(pid) for p in people): raise PublicPermissionError('شخص خارج از دامنه مجاز است.')
    if unit and unit not in {UNITS.get(p.get('role'),'other') for p in people}: raise PublicPermissionError('واحد خارج از دامنه مجاز است.')
    return [p for p in people if (not pid or str(p['id'])==str(pid)) and (not unit or UNITS.get(p.get('role'),'other')==unit)]

def public_person(p):
    return {'id':str(p['id']),'name':p['name'],'role':p.get('role',''),'unit':UNITS.get(p.get('role'),'other'),'inactive':bool(p.get('inactive')),'employmentKnown':False}

def number(value):
    try:
        n=Decimal(str(value).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹','0123456789')).replace(',','').replace('٬',''))
        return float(n) if n.is_finite() and n>=0 else None
    except (InvalidOperation,ValueError): return None

def records(full, people, stamp_to_j):
    """Dates remain source-specific: task date, saleDate/stage-change, financial audit timestamp."""
    ids={str(p['id']) for p in people}; out=[]; issues=[]
    names=defaultdict(list)
    for p in full.get('people',[]):
        if isinstance(p,dict) and p.get('id') is not None: names[p.get('name')].append(str(p['id']))
    seen={}
    for owner in full.get('people',[]):
        if not isinstance(owner,dict): continue
        pid=str(owner.get('id')); pf=owner.get('perf') or {}
        if pid in ids:
            task_dates=set(); conflicts=set()
            for raw,value in (pf.get('dailyTasks') or {}).items():
                date=date_key(raw); n=number(value)
                if date in task_dates:
                    out[:] = [r for r in out if r['id'] != 'tasks:'+pid+':'+date]
                    if date not in conflicts: issues.append({'personId':pid,'metric':'tasks','reason':'چند کلید برای یک روز وظیفه؛ بدون جمع حدسی از شاخص حذف شد.'})
                    conflicts.add(date)
                    continue
                if date: task_dates.add(date)
                if date and n is not None and n.is_integer(): out.append({'id':'tasks:'+pid+':'+date,'personId':pid,'date':date,'metric':'tasks','value':n,'unit':'وظیفه','source':'people.perf.dailyTasks','note':'تجمیع روزانه؛ ریز وظایف در منبع موجود نیست.'})
                else: issues.append({'personId':pid,'metric':'tasks','reason':'تاریخ یا تعداد وظیفه نامعتبر؛ وارد شاخص نشد.'})
        years=owner.get('invY') or {}
        buckets=list(years.items())
        if str(full.get('fy') or '') not in years: buckets.append((str(full.get('fy') or ''),owner.get('inv') or []))
        for fy, invoices in buckets:
            if not isinstance(invoices,list): continue
            for d in invoices:
                if not isinstance(d,dict) or d.get('id') is None: continue
                key=(str(fy),str(d['id']))
                if key in seen:
                    previous, previous_pid = seen[key]
                    if previous != d or previous_pid != pid:
                        out[:] = [r for r in out if r['id'] not in ('contract:'+':'.join(key),'finance:'+':'.join(key))]
                        for affected in {pid,previous_pid} & ids:
                            issues.append({'personId':affected,'metric':['contracts','finance_documents'],'reason':'شناسه سند تکراری با محتوای متعارض؛ از شاخص حذف شد.'})
                    continue
                seen[key]=(d,pid)
                date=date_key(d.get('saleDate')) or date_key(d.get('stageChangedAt'))
                amount=number(d.get('amount'))
                if pid in ids and d.get('funnel','won')=='won':
                    if date and amount is not None:
                        out.append({'id':'contract:'+':'.join(key),'personId':pid,'date':date,'metric':'contracts','value':amount,'unit':'تومان','source':'people.invY','fiscalYear':str(d.get('fy') or fy),'note':'مبلغ خام قرارداد بستن؛ بدون تغییر قواعد پورسانت.'})
                    else: issues.append({'personId':pid,'metric':'contracts','reason':'قرارداد بدون تاریخ یا مبلغ معتبر؛ از میانگین حذف شد.'})
                fin=names.get(d.get('finBy'),[])
                if len(fin)==1 and fin[0] in ids:
                    audits=[a for a in d.get('finAudit',[]) if isinstance(a,dict) and a.get('action')=='fin_by' and a.get('to')==d.get('finBy') and a.get('ts')]
                    try:
                        stamp=max((float(a['ts']) for a in audits),default=None)
                        fd=stamp_to_j(stamp) if stamp is not None else None
                    except (ValueError,TypeError,OverflowError): fd=None
                    if fd: out.append({'id':'finance:'+':'.join(key),'personId':fin[0],'date':fd,'metric':'finance_documents','value':1,'unit':'سند','source':'finAudit.fin_by','fiscalYear':str(d.get('fy') or fy),'note':'صاحب سهم مالی؛ نه ثبت‌کننده رویداد و نه تصویب‌کننده سند.'})
                    else: issues.append({'personId':fin[0],'metric':'finance_documents','reason':'تخصیص مالی بدون زمان ممیزی معتبر؛ به دوره حدسی نسبت داده نشد.'})
    return out,issues

def in_period(rows,start,end): return [r for r in rows if start<=r['date']<=end]

# Owner decision (2026-10-14): sales activity = answered calls; sales efficiency = answered ÷ (in + out) × 100.
SALES_CALL_AXES={'activity':'calls_answered','efficiency':'calls_answered'}
# Owner decision (2026-10-29): support activity = unique tickets + incoming + outgoing calls.
# Ticket efficiency remains on-time in both SLA and OLA / tickets with both known.
SUPPORT_ACTIVITY_METRICS=('tickets','calls_in','calls_out')
SUPPORT_TICKET_AXES={'activity':'support_activity','efficiency':'tickets'}

def metric_rows(rows, metric):
    keys=SUPPORT_ACTIVITY_METRICS if metric=='support_activity' else (metric,)
    return [r for r in rows if r['metric'] in keys]


def metrics(unit,rows,issues,start,end,updated):
    result=[]
    for key,label,measure,definition in AXES.get(unit,[]):
        call=SALES_CALL_AXES.get(key) if unit=='sales' else None
        ticket=SUPPORT_TICKET_AXES.get(key) if unit=='support' else None
        source_metric='contracts' if key=='contract_average' else call or ticket or key
        relevant={key,source_metric}
        if call: relevant.update(CALL_METRICS)
        if source_metric=='support_activity': relevant.update(SUPPORT_ACTIVITY_METRICS)
        metric_issues=[i for i in issues if not i.get('metric') or relevant.intersection([i['metric']] if isinstance(i['metric'],str) else i['metric'])]
        group=metric_rows(rows,source_metric)
        value=None; num=None; den=None; status='no_data'
        if call and key=='efficiency':
            base=[r for r in rows if r['metric'] in ('calls_in','calls_out')]
            if base and sum(r['value'] for r in base):
                num=sum(r['value'] for r in group); den=sum(r['value'] for r in base)
                value=num/den*100; status='partial' if metric_issues else 'valid'; group=group+base
        elif ticket and key=='efficiency':
            known=[r for r in group if r.get('onTime') is not None]
            if known:
                num=sum(r['onTime'] for r in known); den=len(known)
                value=num/den*100; status='partial' if metric_issues or den<len(group) else 'valid'
            group=known
        elif call and not group:
            # daily_records skips zeros: calls with none answered are activity 0, not no_data
            base=[r for r in rows if r['metric'] in ('calls_in','calls_out')]
            if base and sum(r['value'] for r in base):
                num=0; value=0; status='partial' if metric_issues else 'valid'; group=base
        elif group:
            num=sum(r['value'] for r in group); den=len(group) if key=='contract_average' else None
            value=num/den if den else num; status='partial' if metric_issues or key=='contract_average' else 'valid'
        result.append({'id':key,'label':label,'unit':measure,'definition':definition,'value':value,'numerator':num,'denominator':den,'status':status,'target':None,'period':{'from':start,'to':end},'updatedAt':updated,'coverage':{'records':len(group),'issues':len(metric_issues)},'source':sorted({r['source'] for r in group}),'detailsMetric':source_metric})
    return result
