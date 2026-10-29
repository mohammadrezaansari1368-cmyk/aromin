"""Durable MariaDB queue. Short transactions, expiring leases and fenced completion.

Delivery is at least once. Only explicitly registered read-only report handlers
may run; arbitrary functions, commands, URLs and notification tasks are rejected.
"""
import hashlib
import json
import re
import time
import uuid
from contextlib import contextmanager

from aromin_security import PublicValidationError
from aromin_stage import parse_stage_change

KINDS = ('performance_report', 'ledger_audit')
TERMINAL = ('succeeded', 'failed', 'cancelled')
MAX_PAYLOAD = 8192
MAX_RESULT = 512 * 1024


class Conflict(PublicValidationError):
    pass


def encode(value, limit):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    if len(raw.encode('utf-8')) > limit:
        raise PublicValidationError('حجم دادهٔ کار بیش از حد مجاز است.')
    return raw


def validate(kind, payload):
    if kind not in KINDS or not isinstance(payload, dict):
        raise PublicValidationError('نوع کار یا دادهٔ ورودی معتبر نیست.')
    if kind == 'ledger_audit':
        if set(payload) - {'fy'} or not re.fullmatch(r'1[34][0-9]{2}', str(payload.get('fy', ''))):
            raise PublicValidationError('سال مالی چهاررقمی لازم است.')
        return {'fy': str(payload['fy'])}
    if set(payload) - {'start', 'end', 'person', 'unit'}:
        raise PublicValidationError('فیلد ورودی ناشناخته است.')
    dates = []
    for key in ('start', 'end'):
        parsed = parse_stage_change(str(payload.get(key) or ''))
        if not parsed.get('ok'):
            raise PublicValidationError('بازهٔ شمسی معتبر لازم است.')
        dates.append(parsed['date'])
    if dates[0] > dates[1] or int(dates[1][:4]) - int(dates[0][:4]) > 1:
        raise PublicValidationError('بازهٔ گزارش معتبر نیست؛ حداکثر دو سال تقویمی.')
    person, unit = str(payload.get('person') or ''), str(payload.get('unit') or '')
    if len(person) > 80 or unit not in ('', 'sales', 'support', 'finance'):
        raise PublicValidationError('شخص یا واحد معتبر نیست.')
    return {'start': dates[0], 'end': dates[1], 'person': person, 'unit': unit}


def public_job(row, result=False):
    keys = ('id', 'kind', 'status', 'attempts', 'max_attempts', 'created_at', 'updated_at',
            'started_at', 'finished_at', 'available_at', 'error_code')
    out = {key: row.get(key) for key in keys}
    if result and row.get('status') == 'succeeded':
        out['result'] = json.loads(row.get('result_json') or 'null')
    return out


class Store:
    def __init__(self, connect, clock=None):
        self.connect = connect
        self.clock = clock or (lambda: int(time.time() * 1000))

    @contextmanager
    def transaction(self):
        cx = self.connect()
        try:
            cx.begin()
            with cx.cursor() as cur:
                yield cur
            cx.commit()
        except BaseException:
            cx.rollback()
            raise
        finally:
            cx.close()

    def enqueue(self, tenant, user, kind, payload, key):
        if not re.fullmatch(r'[A-Za-z0-9._:-]{8,120}', str(key or '')):
            raise PublicValidationError('کلید یکتای درخواست باید ۸ تا ۱۲۰ نویسه باشد.')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(tenant or '')) or not user or len(user) > 120:
            raise PublicValidationError('کسب‌وکار یا درخواست‌کننده معتبر نیست.')
        raw = encode(validate(kind, payload), MAX_PAYLOAD)
        digest = hashlib.sha256((kind + '\n' + raw).encode()).hexdigest()
        now, job_id = self.clock(), uuid.uuid4().hex
        with self.transaction() as cur:
            cur.execute('INSERT IGNORE INTO background_jobs '
                        '(id,tenant,kind,requested_by,idempotency_key,payload_hash,payload_json,status,created_at,updated_at,available_at) '
                        'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                        (job_id, tenant, kind, user, key, digest, raw, 'queued', now, now, now))
            created = cur.rowcount == 1
            cur.execute('SELECT * FROM background_jobs WHERE tenant=%s AND idempotency_key=%s FOR UPDATE', (tenant, key))
            row = cur.fetchone()
            if row['payload_hash'] != digest:
                raise Conflict('این کلید قبلاً برای کار متفاوتی استفاده شده است.')
            return public_job(row), created

    def get(self, tenant, job_id, result=True):
        with self.transaction() as cur:
            cur.execute('SELECT * FROM background_jobs WHERE tenant=%s AND id=%s', (tenant, job_id))
            row = cur.fetchone()
            return public_job(row, result) if row else None

    def list(self, tenant, limit=50):
        with self.transaction() as cur:
            cur.execute('SELECT * FROM background_jobs WHERE tenant=%s ORDER BY created_at DESC,id DESC LIMIT %s',
                        (tenant, min(100, max(1, int(limit)))))
            return [public_job(row) for row in cur.fetchall()]

    def claim(self, lease_ms=60000):
        if not 10000 <= lease_ms <= 3600000:
            raise ValueError('Invalid lease duration')
        now, token = self.clock(), uuid.uuid4().hex
        with self.transaction() as cur:
            # A durable one-row mutex keeps recovery/claim index locks in one order.
            # It is released before executing the job; workers still run in parallel.
            cur.execute("SELECT id FROM background_job_locks WHERE id='claim' FOR UPDATE")
            if not cur.fetchone():
                raise RuntimeError('Queue claim lock is missing; run migrations')
            # A crashed worker cannot permanently strand a job. Old tokens are invalidated.
            cur.execute("UPDATE background_jobs SET status='failed',finished_at=%s,updated_at=%s,lease_token=NULL,lease_until=NULL,error_code='lease_expired' "
                        "WHERE status='running' AND lease_until<=%s AND attempts>=max_attempts", (now, now, now))
            cur.execute("UPDATE background_jobs SET status='retry_wait',available_at=%s,updated_at=%s,lease_token=NULL,lease_until=NULL,error_code='lease_expired' "
                        "WHERE status='running' AND lease_until<=%s AND attempts<max_attempts", (now, now, now))
            # FOR UPDATE is inside a transaction, including with autocommit connections.
            cur.execute("SELECT * FROM background_jobs WHERE status IN ('queued','retry_wait') AND available_at<=%s "
                        "AND attempts<max_attempts ORDER BY available_at,created_at,id LIMIT 1 FOR UPDATE", (now,))
            row = cur.fetchone()
            if not row:
                return None
            cur.execute("UPDATE background_jobs SET status='running',attempts=attempts+1,started_at=%s,updated_at=%s,"
                        "finished_at=NULL,lease_until=%s,lease_token=%s,error_code=NULL WHERE id=%s",
                        (now, now, now + lease_ms, token, row['id']))
            row.update(status='running', attempts=row['attempts'] + 1, lease_token=token, lease_until=now + lease_ms)
            return row

    def renew(self, job_id, token, lease_ms=60000):
        now = self.clock()
        with self.transaction() as cur:
            cur.execute("UPDATE background_jobs SET lease_until=%s,updated_at=%s WHERE id=%s AND status='running' "
                        "AND lease_token=%s AND lease_until>%s", (now + lease_ms, now, job_id, token, now))
            return cur.rowcount == 1

    def complete(self, job_id, token, result):
        raw, now = encode(result, MAX_RESULT), self.clock()
        with self.transaction() as cur:
            cur.execute("UPDATE background_jobs SET status='succeeded',result_json=%s,finished_at=%s,updated_at=%s,"
                        "lease_until=NULL,lease_token=NULL,error_code=NULL WHERE id=%s AND status='running' AND lease_token=%s AND lease_until>%s",
                        (raw, now, now, job_id, token, now))
            return cur.rowcount == 1

    def fail(self, job_id, token, code='processing_failed', retry=True):
        now = self.clock()
        # Public codes only. Never store exceptions, payloads, credentials or tracebacks.
        if not re.fullmatch(r'[a-z_]{1,80}', code):
            code = 'processing_failed'
        with self.transaction() as cur:
            cur.execute("SELECT * FROM background_jobs WHERE id=%s AND status='running' AND lease_token=%s AND lease_until>%s FOR UPDATE", (job_id, token, now))
            row = cur.fetchone()
            if not row:
                return False
            again = retry and row['attempts'] < row['max_attempts']
            delay = min(300000, 5000 * 2 ** min(row['attempts'] - 1, 6))
            cur.execute('UPDATE background_jobs SET status=%s,error_code=%s,updated_at=%s,available_at=%s,finished_at=%s,lease_token=NULL,lease_until=NULL WHERE id=%s',
                        ('retry_wait' if again else 'failed', code, now, now + delay, None if again else now, job_id))
            return True

    def cancel(self, tenant, job_id):
        now = self.clock()
        with self.transaction() as cur:
            cur.execute("UPDATE background_jobs SET status='cancelled',updated_at=%s,finished_at=%s,lease_token=NULL,lease_until=NULL "
                        "WHERE tenant=%s AND id=%s AND status IN ('queued','retry_wait','running')", (now, now, tenant, job_id))
            return cur.rowcount == 1

    def retry(self, tenant, job_id):
        now = self.clock()
        with self.transaction() as cur:
            # Preserve the attempt history; each manual retry grants three more attempts.
            cur.execute("UPDATE background_jobs SET status='queued',max_attempts=max_attempts+3,available_at=%s,updated_at=%s,"
                        "finished_at=NULL,error_code=NULL,result_json=NULL WHERE tenant=%s AND id=%s AND status='failed' AND max_attempts<=17",
                        (now, now, tenant, job_id))
            return cur.rowcount == 1
