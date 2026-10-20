"""Short-lived, versioned HMAC sessions; no client-controlled signing algorithm."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import stat
import tempfile
import time

TTL = 3600


def signing_key():
    configured = os.environ.get('AROMIN_SESSION_SECRET', '')
    if configured:
        if len(configured.encode('utf-8')) < 32:
            raise RuntimeError('Session secret must contain at least 32 bytes')
        return configured.encode('utf-8')
    path = Path(os.environ.get('AROMIN_SESSION_SECRET_FILE',
                str(Path(__file__).resolve().parent / '.assistant-secrets' / 'session.key')))
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.exists():
        fd, temporary = tempfile.mkstemp(prefix='.session-', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(secrets.token_bytes(32))
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)  # atomic, never replace another worker's key
            except FileExistsError:
                pass
        finally:
            os.unlink(temporary)
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise RuntimeError('Session key file must be private')
        key = stream.read(4097)
    if not 32 <= len(key) <= 4096:
        raise RuntimeError('Invalid session key file')
    return key


def _encode(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def issue(user, role, tenant, must_change_password=False, credential=None):
    now = int(time.time())
    claims = {'v': 1, 'user': user, 'role': role, 'tenant': tenant,
              'iat': now, 'exp': now + TTL, 'must_change_password': bool(must_change_password)}
    if credential is not None:
        claims['credential'] = credential
    body = _encode(json.dumps(claims, separators=(',', ':'), ensure_ascii=True).encode())
    signature = _encode(hmac.new(signing_key(), body.encode('ascii'), hashlib.sha256).digest())
    return body + '.' + signature


def verify(token, tenant):
    try:
        if len(token) > 4096:
            return None
        body, signature = token.split('.')
        expected = _encode(hmac.new(signing_key(), body.encode('ascii'), hashlib.sha256).digest())
        if not hmac.compare_digest(signature.encode('ascii'), expected.encode('ascii')):
            return None
        claims = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))
        now = time.time()
        if (claims.get('v') != 1 or claims.get('tenant') != tenant
                or type(claims.get('exp')) is not int or type(claims.get('iat')) is not int
                or not claims['iat'] <= now < claims['exp']
                or claims['exp'] - claims['iat'] != TTL
                or not isinstance(claims.get('user'), str) or not claims['user']
                or not isinstance(claims.get('role'), str)):
            return None
        return {k: claims[k] for k in ('user', 'role', 'tenant', 'must_change_password', 'credential') if k in claims}
    except (ValueError, TypeError, KeyError, UnicodeError):
        return None
