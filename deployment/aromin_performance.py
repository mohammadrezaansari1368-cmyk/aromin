"""Read-only performance projections. No payroll/commission/attendance engine changes."""
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from aromin_stage import parse_stage_change

UNITS = {'sales':'sales','online':'sales','salesmgr':'sales','finance':'finance','accmgr':'finance','support':'support'}
AXES = {
 'sales': [('activity','میزان فعالیت','تعامل','تماس، ویزیت و پیگیری معتبر با شناسه یکتا لازم است.'),('efficiency','راندمان','٪','اتصال تماس به مشتری واجد شرایط موجود نیست.'),('conversion','نرخ تبدیل','٪','تاریخچه ورود به گروه واجد شرایط و نتیجه همان گروه لازم است.'),('contract_average','میانگین ارزش قرارداد','تومان','مجموع مبلغ خام قراردادهای بستن ÷ تعداد همان قراردادها؛ خالص از مالیات/تخفیف ادعا نمی‌شود.')],
 'support':[('activity','میزان فعالیت','خدمت','شناسه پرونده یکتا، مسئول و تاریخ واقعی خدمت لازم است.'),('efficiency','راندمان','٪','تیکت‌های فعلی تاریخ خدمت/سررسید و وضعیت باز قابل اتکا ندارند.'),('resolution','نرخ حل موفق','٪','FCR به سابقه تماس اول و بازه مشاهده نیاز دارد.'),('quality','کیفیت خدمات','٪','نظرسنجی معتبر و تعداد پاسخ‌ها موجود نیست.')],
 'finance':[('finance_documents','میزان فعالیت','سند','اسناد یکتای دارای رویداد fin_by برای حسابدار منتخب؛ ثبت‌کننده با مسئول مالی متفاوت است.'),('efficiency','راندمان','٪','وظایف دارای سررسید و زمان انجام موجود نیست.'),('accuracy','دقت مالی','٪','نتیجه اولین بررسی و علت اصلاح ساخت‌یافته موجود نیست.'),('effectiveness','اثربخشی مالی','٪','مسئول وصول، گروه سررسید و پرداخت جزئی قابل انتساب موجود نیست.')]
}

def date_key(raw):
    r = parse_stage_change(str(raw or ''))
    return r.get('date') if r.get('ok') else None

def directory(full, ident, users):
    people = [p for p in full.get('people',[]) if isinstance(p,dict)]
    if any(p.get('id') is None or not p.get('name') for p in people): raise ValueError('شناسه یا نام شخص ناقص است؛ مدیر نگاشت را اصلاح کند.')
    ids = [str(p['id']) for p in people]
    if len(ids)!=len(set(ids)): raise ValueError('شناسه تکراری اشخاص؛ نگاشت باید اصلاح شود.')
    rec=users.get(ident['user'],{})
    linked=[p for p in people if (str(p['id'])==str(rec['personId']) if rec.get('personId') is not None else p['name']==rec.get('person'))]
    role=ident['role']
    if role=='manager': allowed=people
    elif role in ('salesmgr','accmgr'): allowed=[p for p in people if UNITS.get(p.get('role'))==UNITS[role]]
    elif len(linked)==1 and not linked[0].get('inactive'): allowed=linked
    else: raise PermissionError('حساب به شناسه یکتای کارمند متصل نیست؛ مدیر نگاشت حساب را اصلاح کند.')
    return allowed

def select(people, pid='', unit=''):
    if pid and not any(str(p['id'])==str(pid) for p in people): raise PermissionError('شخص خارج از دامنه مجاز است.')
    if unit and unit not in {UNITS.get(p.get('role'),'other') for p in people}: raise PermissionError('واحد خارج از دامنه مجاز است.')
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
                    if date not in conflicts: issues.append({'personId':pid,'reason':'چند کلید برای یک روز وظیفه؛ بدون جمع حدسی از شاخص حذف شد.'})
                    conflicts.add(date)
                    continue
                if date: task_dates.add(date)
                if date and n is not None and n.is_integer(): out.append({'id':'tasks:'+pid+':'+date,'personId':pid,'date':date,'metric':'tasks','value':n,'unit':'وظیفه','source':'people.perf.dailyTasks','note':'تجمیع روزانه؛ ریز وظایف در منبع موجود نیست.'})
                else: issues.append({'personId':pid,'reason':'تاریخ یا تعداد وظیفه نامعتبر؛ وارد شاخص نشد.'})
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
                            issues.append({'personId':affected,'reason':'شناسه سند تکراری با محتوای متعارض؛ از شاخص حذف شد.'})
                    continue
                seen[key]=(d,pid)
                date=date_key(d.get('saleDate')) or date_key(d.get('stageChangedAt'))
                amount=number(d.get('amount'))
                if pid in ids and d.get('funnel','won')=='won':
                    if date and amount is not None:
                        out.append({'id':'contract:'+':'.join(key),'personId':pid,'date':date,'metric':'contracts','value':amount,'unit':'تومان','source':'people.invY','fiscalYear':str(d.get('fy') or fy),'note':'مبلغ خام قرارداد بستن؛ بدون تغییر قواعد پورسانت.'})
                    else: issues.append({'personId':pid,'reason':'قرارداد بدون تاریخ یا مبلغ معتبر؛ از میانگین حذف شد.'})
                fin=names.get(d.get('finBy'),[])
                if len(fin)==1 and fin[0] in ids:
                    audits=[a for a in d.get('finAudit',[]) if isinstance(a,dict) and a.get('action')=='fin_by' and a.get('to')==d.get('finBy') and a.get('ts')]
                    try:
                        stamp=max((float(a['ts']) for a in audits),default=None)
                        fd=stamp_to_j(stamp) if stamp is not None else None
                    except (ValueError,TypeError,OverflowError): fd=None
                    if fd: out.append({'id':'finance:'+':'.join(key),'personId':fin[0],'date':fd,'metric':'finance_documents','value':1,'unit':'سند','source':'finAudit.fin_by','fiscalYear':str(d.get('fy') or fy),'note':'صاحب سهم مالی؛ نه ثبت‌کننده رویداد و نه تصویب‌کننده سند.'})
                    else: issues.append({'personId':fin[0],'reason':'تخصیص مالی بدون زمان ممیزی معتبر؛ به دوره حدسی نسبت داده نشد.'})
    return out,issues

def in_period(rows,start,end): return [r for r in rows if start<=r['date']<=end]

def metrics(unit,rows,issues,start,end,updated):
    result=[]
    for key,label,measure,definition in AXES.get(unit,[]):
        group=[r for r in rows if r['metric']==('contracts' if key=='contract_average' else key)]
        value=None; num=None; den=None; status='no_data'
        if group:
            num=sum(r['value'] for r in group); den=len(group) if key=='contract_average' else None
            value=num/den if den else num; status='partial' if issues or key=='contract_average' else 'valid'
        result.append({'id':key,'label':label,'unit':measure,'definition':definition,'value':value,'numerator':num,'denominator':den,'status':status,'target':None,'period':{'from':start,'to':end},'updatedAt':updated,'coverage':{'records':len(group),'issues':len(issues)},'source':sorted({r['source'] for r in group}),'detailsMetric':'contracts' if key=='contract_average' else key})
    return result
