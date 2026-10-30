"""Read-only performance projections. No payroll/commission/attendance engine changes."""
from aromin_security import PublicValidationError, PublicPermissionError
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from aromin_stage import parse_stage_change

UNITS = {'sales':'sales','online':'sales','salesmgr':'sales','finance':'finance','accmgr':'finance','support':'support'}
AXES = {
 'sales': [('activity','میزان فعالیت','تماس','تماس‌های پاسخ‌دادهٔ ورودی و خروجی از ریز تماسِ سرور (تصمیم مالک)؛ تماس صف، داخلی و بی‌نگاشت شمرده نمی‌شود.'),('efficiency','راندمان','٪','تماس پاسخ‌داده ÷ (ورودی + خروجی) × ۱۰۰ از ریز تماسِ سرور (تصمیم مالک)؛ تماس صف و داخلی شمرده نمی‌شود.'),('conversion','نرخ تبدیل','٪','تاریخچه ورود به گروه واجد شرایط و نتیجه همان گروه لازم است.'),('contract_average','میانگین ارزش قرارداد','تومان','مجموع مبلغ خام قراردادهای بستن ÷ تعداد همان قراردادها؛ خالص از مالیات/تخفیف ادعا نمی‌شود.')],
 'support':[('activity','میزان فعالیت','فعالیت','تیکت یکتا به تاریخ ثبت + تماس پاسخ‌دادهٔ ورودی + تماس پاسخ‌دادهٔ خروجی؛ فقط منابع سروری و نگاشت تأییدشده.'),('efficiency','راندمان','٪','تیکت‌های به‌موقع در SLA و OLA هر دو ÷ تیکت‌های دارای هر دو وضعیت × ۱۰۰ (تصمیم مالک)؛ وضعیت خالی شمرده نمی‌شود.'),('resolution','نرخ حل موفق','٪','FCR به سابقه تماس اول و بازه مشاهده نیاز دارد.'),('quality','کیفیت خدمات','٪','نظرسنجی معتبر و تعداد پاسخ‌ها موجود نیست.')],
 'finance':[('finance_documents','میزان فعالیت','سند','اسناد یکتای دارای رویداد fin_by برای حسابدار منتخب؛ ثبت‌کننده با مسئول مالی متفاوت است.'),('efficiency','راندمان','٪','وظایف دارای سررسید و زمان انجام موجود نیست.'),('accuracy','دقت مالی','٪','نتیجه اولین بررسی و علت اصلاح ساخت‌یافته موجود نیست.'),('effectiveness','اثربخشی مالی','٪','مسئول وصول، گروه سررسید و پرداخت جزئی قابل انتساب موجود نیست.')]
}

# WP-3: server call stats (aromin_calls.daily_records). Kept beside the axes, not mapped onto activity/efficiency (owner has not defined that mapping).
CALL_METRICS=('calls_in','calls_out','calls_internal','calls_answered','calls_missed','talk_seconds','calls_in_answered','calls_out_answered','effort_talk_seconds','calls_peak_answered')
CALL_UNITS={m:('ثانیه' if m in ('talk_seconds','effort_talk_seconds') else 'تماس') for m in CALL_METRICS}

def call_totals(rows):
    """Per-metric sums of call records; None when there is no call record (no data ≠ zero)."""
    group=[r for r in rows if r['metric'] in CALL_METRICS]
    if not group: return None
    totals={m:sum(r['value'] for r in group if r['metric']==m) for m in CALL_METRICS}
    totals['peakHourShare']=totals['calls_peak_answered']/totals['calls_answered']*100 if totals['calls_answered'] else None
    return totals

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
    return {'id':str(p['id']),'name':p['name'],'role':p.get('role',''),'unit':UNITS.get(p.get('role'),'other'),'inactive':bool(p.get('inactive')),'employmentKnown':False,'level':('middle' if p.get('level')=='mid' else p.get('level'))}

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

def month_dates(year, month):
    from aromin_calls import _ordinal
    first = '%04d/%02d/01' % (year, month)
    following = '%04d/%02d/01' % (year + (month == 12), month % 12 + 1)
    return ['%04d/%02d/%02d' % (year, month, day) for day in range(1, _ordinal(following)-_ordinal(first)+1)]

def calendar_days(start, end, holidays=()):
    from aromin_calls import _ordinal
    import datetime
    y, m = map(int, start.split('/')[:2]); out=[]
    while '%04d/%02d/01' % (y,m) <= end:
        out += [d for d in month_dates(y,m) if start<=d<=end and d not in holidays
                and datetime.date.fromordinal(_ordinal(d)).weekday()!=4]
        y, m = y+(m==12), m%12+1
    return out

def sales_targets(full, person, start, end, attendance, holidays, history):
    """Existing forecast targets are monthly toman amounts, indexed from zero, by fiscal year."""
    pid=str(person['id']); cfg=full.get('perf') or {}; level=person.get('level')
    if level=='mid': level='middle'
    levels=cfg.get('levelCallTarget') or {}
    daily=next((n for v in [(person.get('perfSet') or {}).get('dailyCallTarget'), levels.get(level), cfg.get('dailyCallTarget'),40]
                if (n:=number(v)) is not None),40)
    from aromin_holidays import effective_holidays_named
    # Full boundary months are needed for partial-month target denominators.
    last=month_dates(*map(int,end.split('/')[:2]))[-1]
    holidays=set(effective_holidays_named(start[:8]+'01',last,cfg,holidays))
    attendance=attendance or {}
    own=[r for r in attendance.get('rows',[]) if str(r['personId'])==pid and start<=r['date']<=end]
    covered={d for d in attendance.get('coverage',()) if start<=d<=end}
    all_dates=set()
    cy,cm=map(int,start.split('/')[:2])
    while '%04d/%02d/01' % (cy,cm)<=end:
        all_dates.update(d for d in month_dates(cy,cm) if start<=d<=end)
        cy,cm=cy+(cm==12),cm%12+1
    # Explicit day types override minutes; coverage with no presence closes the company.
    def status(r):
        return r.get('dayStatus') or r.get('day_status') or r.get('status')
    def present(r):
        code=status(r)
        return code in ('present','mission') if code else (r.get('presentMin') or 0)>0
    grouped=defaultdict(list)
    for r in attendance.get('rows',[]):
        if r['date'] in covered: grouped[r['date']].append(r)
    closures={d for d in covered if not any(present(r) for r in grouped[d])}
    calendar=set(calendar_days(start,end,holidays))
    own_by_date={r['date']:r for r in own}
    worked={d for d in calendar if d not in closures and
            (d not in covered or (d in own_by_date and present(own_by_date[d])))}
    attendance_days=len(worked & covered)
    calendar_count=len(worked-covered)
    days=len(worked)
    day_counts={'presentDays':attendance_days,
                'leaveDays':sum(status(r) in ('leave','sick') for r in own),
                'absentDays':sum(status(r)=='absent' or (not status(r) and r.get('presentMin')==0) for r in own),
                'holidayDays':sum(status(r)=='holiday' for r in own),
                'closureDays':len((closures & calendar) | {r['date'] for r in own if status(r)=='closure'}),
                'calendarDays':len(calendar)}
    basis='mixed' if covered and all_dates-covered else 'attendance' if covered else 'calendar'
    target_issues=[]
    if covered and pid not in attendance.get('mappedPersons',()):
        target_issues.append({'personId':pid,'metric':'activity','reason':'کارتِ حضورِ این شخص نگاشت نشده'})
    if not attendance.get('available',True) or any(r.get('presentMin') is None and not status(r) for r in own):
        target_issues.append({'personId':pid,'metric':'activity','reason':'دادهٔ حضور ناقص یا در دسترس نیست'})
    amount=0; missing=False
    y,m=map(int,start.split('/')[:2])
    while '%04d/%02d/01' % (y,m)<=end:
        bucket=(full.get('years') or {}).get(str(y)) or {}
        targets=bucket.get('targets')
        if targets is None and str(full.get('fy'))==str(y): targets=full.get('targets')
        monthly=(targets or {}).get(pid)
        value=number(monthly[m-1]) if isinstance(monthly,list) and len(monthly)>=m else None
        if value is None: missing=True
        else:
            dates=month_dates(y,m); working=calendar_days(dates[0],dates[-1],holidays)
            included=sum(d in worked for d in working)
            amount+=value*(included/len(working) if working else 0)
        y,m=y+(m==12),m%12+1
    # Twelve Jalali calendar months ending on the selected end date, inclusive.
    ey,em,ed=map(int,end.split('/')); sy=ey-1
    cutoff='%04d/%02d/%02d' % (sy,em,min(ed,len(month_dates(sy,em))))
    won=[r for r in history if r['metric']=='contracts' and cutoff<r['date']<=end]
    personal=[r for r in won if r['personId']==pid]
    sample=personal or won
    avg=sum(r['value'] for r in sample)/len(sample) if sample else None
    amount=None if missing else amount
    import math
    return {'activity':None if target_issues else daily*days,'amount':amount,'count':math.floor(amount/avg+0.5) if amount is not None and avg else None,
            'basis':basis,'workingDays':days,'attendanceDays':attendance_days,'calendarDays':calendar_count,'dailyCallTarget':daily,
            'attendance':{**day_counts,'basis':basis},'issue':bool(target_issues),'issues':target_issues,'avgContract':avg}

def sales_projection(base, rows, targets, cfg, issues=(), calls_available=True):
    """Sum member actuals/targets before achievement; missing member targets keep the group partial."""
    keys=('activity','count','amount')
    calls=call_totals(rows)
    contracts=[r for r in rows if r['metric']=='contracts']
    actual={'activity':(calls['calls_answered'] if calls else 0) if calls_available else None,
            'count':len(contracts),'amount':sum(r['value'] for r in contracts)}
    totals={k:sum(t[k] for t in targets if t[k] is not None) if any(t[k] is not None for t in targets) else None for k in keys}
    parts={k:{'actual':actual[k],'target':totals[k], 'pct':min(150,actual[k]/totals[k]*100)
              if actual[k] is not None and totals[k] and totals[k]>0 else None} for k in keys}
    configured=cfg.get('efficiencyWeights') or {}
    weights={k:number(configured.get(k,1/3)) or 0 for k in keys if parts[k]['pct'] is not None}
    total=sum(weights.values())
    if weights and not total: weights={k:1 for k in weights}; total=len(weights)
    weights={k:v/total for k,v in weights.items()}
    parts['weights']={k:weights.get(k,0) for k in keys}
    issues=list(issues)
    for target in targets:
        for issue in target.get('issues',[]):
            if issue not in issues: issues.append(issue)
    relevant=[i for i in issues if not i.get('metric') or set(([i['metric']] if isinstance(i['metric'],str) else i['metric'])).intersection(set(CALL_METRICS)|{'contracts','efficiency','activity'})]
    partial=bool(relevant) or any(t.get('issue') for t in targets) or any(t[k] is None for t in targets for k in keys) or len(weights)<3
    denominator=sum(r['value'] for r in rows if r['metric'] in ('calls_in','calls_out'))
    for metric in base:
        if metric['id']=='activity':
            target_issues=[i for t in targets for i in t.get('issues',[])]
            metric['attendance']={k:sum(t.get('attendance',{}).get(k,0) for t in targets) for k in ('presentDays','leaveDays','absentDays','holidayDays','closureDays','calendarDays')}
            metric['attendance']['basis']=targets[0]['basis'] if len({t['basis'] for t in targets})==1 else 'mixed'
            metric.update(target=totals['activity'],pct=parts['activity']['pct'],basis=targets[0]['basis'] if len({t['basis'] for t in targets})==1 else 'mixed',workingDays=sum(t['workingDays'] for t in targets),
                          attendanceDays=sum(t.get('attendanceDays',0) for t in targets),calendarDays=sum(t.get('calendarDays',0) for t in targets),
                          targetStatus='partial' if any(t.get('issue') for t in targets) else 'valid',targetIssues=target_issues)
            if target_issues:
                metric['status']='partial'
                metric['coverage']['issues']=sum(not i.get('metric') or bool(set([i['metric']] if isinstance(i['metric'],str) else i['metric']).intersection(set(CALL_METRICS)|{'activity'})) for i in issues)
        if metric['id']=='efficiency':
            metric.update(value=sum(parts[k]['pct']*w for k,w in weights.items()) if weights else None,
                          target=100,parts=parts,numerator=None,denominator=None,
                          answerRate=actual['activity']/denominator*100 if denominator and actual['activity'] is not None else None,
                          status=('partial' if partial else 'valid') if weights else ('partial' if any(t.get('issue') for t in targets) or any(totals[k] and totals[k]>0 for k in keys) else 'no_data'),
                          definition='میانگین وزنی تحقق هدف فعالیت، تعداد و مبلغ قرارداد؛ هر بخش با سقف ۱۵۰٪.',
                          source=['call_logs','people.invY','targets','attendance_days'])
            metric['coverage']['issues']=len(relevant)
    return base

# Owner decision (2026-10-14): sales activity = answered calls; sales efficiency = answered ÷ (in + out) × 100.
SALES_CALL_AXES={'activity':'calls_answered','efficiency':'calls_answered'}
# Support activity = unique tickets by registration date + answered inbound/outbound calls; efficiency unchanged.
SUPPORT_TICKET_AXES={'activity':'tickets','efficiency':'tickets'}

def metrics(unit,rows,issues,start,end,updated):
    result=[]
    for key,label,measure,definition in AXES.get(unit,[]):
        call=SALES_CALL_AXES.get(key) if unit=='sales' else None
        ticket=SUPPORT_TICKET_AXES.get(key) if unit=='support' else None
        source_metric='contracts' if key=='contract_average' else call or ticket or key
        relevant={key,source_metric}
        if call or (ticket and key=='activity'): relevant.update(CALL_METRICS)
        metric_issues=[i for i in issues if not i.get('metric') or relevant.intersection([i['metric']] if isinstance(i['metric'],str) else i['metric'])]
        group=[r for r in rows if r['metric']==source_metric]
        value=None; num=None; den=None; status='no_data'; parts=None
        if ticket and key=='activity':
            parts={'tickets':len({r['id'] for r in group}),
                   'callsIn':sum(r['value'] for r in rows if r['metric']=='calls_in_answered'),
                   'callsOut':sum(r['value'] for r in rows if r['metric']=='calls_out_answered')}
            group=group+[r for r in rows if r['metric'] in ('calls_in_answered','calls_out_answered')]
            if group or any(r['metric'] in ('calls_in','calls_out') for r in rows):
                num=value=sum(parts.values()); status='partial' if metric_issues else 'valid'
        elif call and key=='efficiency':
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
            value=num/den if den else num; status='partial' if metric_issues else 'valid'
        result.append({'id':key,'label':label,'unit':measure,'definition':definition,'value':value,'numerator':num,'denominator':den,'status':status,'target':None,'period':{'from':start,'to':end},'updatedAt':updated,'coverage':{'records':len(group),'issues':len(metric_issues)},'source':sorted({r['source'] for r in group}),'detailsMetric':'support_activity' if ticket and key=='activity' else source_metric,**({'parts':parts} if parts is not None else {})})
    return result
