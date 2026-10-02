"""Authentication abstraction (blueprint §14).

``Authenticator`` is the interface; Phase 1 implements server-to-server API keys
(``Authorization: Bearer ak_<env>_<random>``), stored only as SHA-256 hashes. Staff JWT and
website-visitor tokens are later implementations of the same interface.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from typing import Protocol

from app.core.errors import Unauthorized
from app.db.uow import UowFactory
from app.models.base import utcnow
from app.security.permissions import permissions_for


@dataclass(frozen=True)
class Principal:
    id: str
    type: str  # "api_key" | later: "user", "visitor"
    roles: tuple[str, ...]
    permissions: frozenset[str] = field(default_factory=frozenset)

    def has(self, permission: str) -> bool:
        return permission in self.permissions


class Authenticator(Protocol):
    async def authenticate(self, authorization: str | None) -> Principal: ...


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key(prefix: str, env: str) -> str:
    return f"{prefix}_{env}_{secrets.token_urlsafe(32)}"


def _bearer(authorization: str | None) -> str:
    if not authorization:
        raise Unauthorized()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise Unauthorized("Use 'Authorization: Bearer <api key>'")
    return token.strip()


class ApiKeyAuthenticator:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def authenticate(self, authorization: str | None) -> Principal:
        token = _bearer(authorization)
        if len(token) > 200:
            raise Unauthorized("Invalid API key")
        digest = hash_api_key(token)
        async with self._uow_factory() as uow:
            key = await uow.api_keys.by_hash(digest)
            if key is None or key.revoked_at is not None or not hmac.compare_digest(key.key_hash, digest):
                raise Unauthorized("Invalid API key")
            key.last_used_at = utcnow()
            roles = tuple(key.roles or ())
            return Principal(id=key.id, type="api_key", roles=roles, permissions=permissions_for(roles))
