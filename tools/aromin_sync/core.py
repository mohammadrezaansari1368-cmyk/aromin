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
            # data-url is absolute in production (https://crm…/users/show/102)
            uid = re.search(r'/users/show/(\d+)', a.attrs.get('data-url',''))
            ext = re.search(r'(?<!\d)([1-9]\d{1,3})\s*$', cell.text.translate(DIGITS))
            if not uid or not ext:
                raise ContractError('شناسه یا داخلیِ کاربر جولیو در پاسخ نیست.')
            return ext[1], uid[1], cell.text[:ext.start()].strip()
    values = [cell.text] + [v for a in cell.find('a') for v in a.attrs.values()]
    number = next((phone(v) for v in values if phone(v)), None)
    # Hidden/withheld callers exist in production; the server classifies an empty side as unknown.
    return number or '', '', cell.text if not phone(cell.text) else ''


def _html_of(text):
    """Overview endpoints answer JSON {"table": "<div>…<table>…"}; list endpoints answer HTML."""
    if text.lstrip().startswith('{'):
        try:
            data = json.loads(text)
        except ValueError:
            raise ContractError('پاسخ جدول ناشناخته است.')
        html = next((v for v in data.values() if isinstance(v, str) and '<tr' in v), None) if isinstance(data, dict) else None
        if html is None:
            raise ContractError('پاسخ جدول ناشناخته است.')
        return html
    return text


# Production layouts (checked by hand 1405/08/07): every data row starts with a checkbox cell and a row number;
# calls/deals carry an operations column and collapsed detail rows, summary rows end with «کارایی».
_MIN_CELLS = {'calls': 12, 'summary': 10, 'deals': 10}


def _stamp(cell):
    """«1405/08/08 12:30':05" (…پیش)» → «12:30:05 1405/08/08», the format the deal importer reads as «تغییر مرحله»."""
    m = re.search(r'(\d{4}/\d{2}/\d{2})\s+(\d{1,2})\D+(\d{2})(?:\D+(\d{2}))?', cell)
    return '%02d:%s:%s %s' % (int(m[2]), m[3], m[4] or '00', m[1]) if m else cell


def parse_table(html, kind):
    if kind not in _MIN_CELLS:
        raise ValueError('منبع ناشناخته است.')
    doc = Document(_html_of(html)).root
    tables = list(doc.find('table'))
    if not tables:
        raise ContractError('ساختار جدول جولیو تغییر کرده است.')
    result, seen_rows = [], 0
    for table in tables:
        for tr in table.find('tr'):
            cells = [c for c in tr.children if isinstance(c, Node) and c.tag == 'td']
            if len(cells) < _MIN_CELLS[kind]:
                continue   # header, detail, empty-state or totals rows
            text = [c.text.translate(DIGITS).strip() for c in cells]
            key = text[2] if kind != 'summary' else text[1]
            if not re.fullmatch(r'\d{5,}' if kind == 'calls' else r'\d+', key):
                continue
            seen_rows += 1
            if kind == 'calls':
                o, d = party(cells[5]), party(cells[6])
                values = [text[2], text[3].split()[0], text[4], *o, *d, text[7], text[8], text[10], text[11]]
                headers = LOG_HEADERS
            elif kind == 'summary':
                name = re.sub(r'\s*\d{1,4}$', '', text[2]).strip()
                values = [name, text[3], text[4], text[5], text[6], text[7], text[8], text[9]]
                headers = SUMMARY_HEADERS
            else:
                values = [text[2], _stamp(text[3]), _stamp(text[4]), text[5], text[6], text[7], text[8].replace(',', ''), text[9]]
                headers = DEAL_HEADERS
            result.append(dict(zip(headers, values)))
    if not seen_rows:
        wide = [tr for t in tables for tr in t.find('tr') if len([c for c in tr.children if isinstance(c, Node) and c.tag == 'td']) >= 3]
        if wide and not re.search(r'یافت نشد|رکوردی|No records', doc.text):
            raise ContractError('ساختار جدول جولیو تغییر کرده است.')
    pages = [1]
    for node in doc.find('*'):
        if 'pagination' in node.attrs.get('class','').split():
            # Joolio renders page links as <span href=…> as well as <a>.
            for a in node.find('*'):
                m = re.search(r'[?&]page=(\d+)', a.attrs.get('href',''))
                if m:
                    pages.append(int(m[1]))
                elif a.tag in ('a','span') and a.text.translate(DIGITS).strip().isdigit():
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
