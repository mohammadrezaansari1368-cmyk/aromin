"""Offline parsers and durable transfer checkpoints. No customer data in diagnostics."""
import csv
import hashlib
import io
import json
import re
from html.parser import HTMLParser
from pathlib import Path

DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
LOG_HEADERS = ('کد کانال','تاریخ کانال','ساعت','مبدا تماس','مبدا تماس-ID','نام مبدا','مقصد تماس','مقصد تماس-ID','نام مقصد','زمان کل','مدت مکالمه','وضعیت کانال','وضعیت تماس')
SUMMARY_HEADERS = ('کارشناس','داخلی','تمامی رکوردها','موفق','بدون‌پاسخ','مشغول','عدم‌موفقیت','مدت مکالمه')
DEAL_HEADERS = ('معامله','تاریخ ثبت','تغییر مرحله','ثبت‌کننده','کارشناس','شرکت','ارزش','مرحله')


class ContractError(ValueError):
    pass


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    @property
    def text(self):
        return ' '.join(''.join(c.text if isinstance(c, Node) else c for c in self.children).split())

    def find(self, tag):
        for c in self.children:
            if isinstance(c, Node):
                if c.tag == tag or tag == '*':
                    yield c
                yield from c.find(tag)


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('br','input','meta','img','hr','link','source','wbr','area','base','embed','param','col'):
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def phone(value):
    value = re.sub(r'[\s()\-]', '', value.translate(DIGITS))
    m = re.search(r'(?<!\d)(?:0098|\+98|98|0)?(9\d{9})(?!\d)', value)
    return '0' + m[1] if m else None


def party(cell):
    for a in cell.find('a'):
        if a.attrs.get('data-target') == '#user_detail':
            uid = re.fullmatch(r'/users/show/(\d+)', a.attrs.get('data-url',''))
            ext = re.search(r'(?<!\d)([1-9]\d{1,3})\s*$', cell.text.translate(DIGITS))
            if not uid or not ext:
                raise ContractError('شناسه یا داخلیِ کاربر جولیو در پاسخ نیست.')
            return ext[1], uid[1], cell.text[:ext.start()].strip()
    values = [cell.text] + [v for a in cell.find('a') for v in a.attrs.values()]
    number = next((phone(v) for v in values if phone(v)), None)
    if not number:
        raise ContractError('طرف تماس شناسهٔ معتبر ندارد؛ انتقال متوقف شد.')
    return number, '', cell.text if not phone(cell.text) else ''


def parse_table(html, kind):
    doc = Document(html).root
    tables = list(doc.find('table'))
    if len(tables) != 1:
        raise ContractError('ساختار جدول جولیو تغییر کرده است.')
    result = []
    for tr in tables[0].find('tr'):
        cells = [c for c in tr.children if isinstance(c, Node) and c.tag == 'td']
        if not cells:
            continue
        if len(cells) == 1 and cells[0].attrs.get('colspan'):
            if re.search(r'یافت نشد|رکوردی|No records', cells[0].text):
                continue
            raise ContractError('پاسخ جدول ناشناخته است.')
        if kind == 'calls':
            if len(cells) != 12:
                raise ContractError('تعداد ستون‌های تماس تغییر کرده است.')
            o, d = party(cells[5]), party(cells[6])
            values = [cells[2].text, cells[3].text.split()[0], cells[4].text, *o, *d,
                      cells[7].text, cells[8].text, cells[10].text, cells[11].text]
            headers = LOG_HEADERS
        elif kind in ('summary','deals'):
            if len(cells) != 8:
                raise ContractError('تعداد ستون‌های جدول تغییر کرده است.')
            values = [c.text for c in cells]
            headers = SUMMARY_HEADERS if kind == 'summary' else DEAL_HEADERS
        else:
            raise ValueError('منبع ناشناخته است.')
        result.append(dict(zip(headers, values)))
    pages = [1]
    for node in doc.find('*'):
        if 'pagination' in node.attrs.get('class','').split():
            for a in node.find('a'):
                m = re.search(r'[?&]page=(\d+)', a.attrs.get('href',''))
                if m:
                    pages.append(int(m[1]))
                elif a.text.translate(DIGITS).isdigit():
                    pages.append(int(a.text.translate(DIGITS)))
    return result, max(pages)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',',':'), allow_nan=False).encode()).hexdigest()


def payload(tenant, rows, **extra):
    content = dict(tenant=tenant, source='import-center', rows=rows, **extra)
    return dict(content, fileName='aromin-sync.json', sha256=digest(content))


def deals_csv(rows):
    out = io.StringIO(newline='')
    writer = csv.DictWriter(out, fieldnames=DEAL_HEADERS)
    writer.writeheader()
    writer.writerows(rows)
    return ('\ufeff'+out.getvalue()).encode('utf-8')


def atomic_json(path, value):
    path = Path(path)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    temp.replace(path)


class State:
    def __init__(self, path):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}

    def identical(self, source, body):
        previous = self.data.get(source, {})
        sha = digest(body)
        return previous.get('sha256') == sha or sha in previous.get('sent', [])

    def acknowledged(self, source, body, date, page):
        previous = self.data.get(source, {})
        sent = set(previous.get('sent', []))
        if previous.get('sha256'):
            sent.add(previous['sha256'])
        sha = digest(body)
        sent.add(sha)
        self.data[source] = dict(sha256=sha, date=date, page=page, sent=sorted(sent))
        atomic_json(self.path, self.data)
