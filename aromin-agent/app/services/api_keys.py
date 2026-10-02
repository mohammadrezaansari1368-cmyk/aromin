"""API key management (used by the CLI; there is no HTTP endpoint for key management)."""

from __future__ import annotations

from app.core.ids import new_id
from app.db.uow import UowFactory
from app.models.base import utcnow
from app.models.security import ApiKey
from app.security.auth import generate_api_key, hash_api_key
from app.security.permissions import Role
from app.services.audit import AuditLogger


class ApiKeyService:
    def __init__(self, uow_factory: UowFactory, audit: AuditLogger, prefix: str, env: str) -> None:
        self._uow_factory = uow_factory
        self._audit = audit
        self._prefix = prefix
        self._env = env

    async def create(self, name: str, roles: list[str], *, actor: str = "cli") -> tuple[ApiKey, str]:
        """Return the stored key record and the raw key. The raw key is shown once, never stored."""
        valid = [Role(r).value for r in roles]
        raw = generate_api_key(self._prefix, self._env)
        async with self._uow_factory() as uow:
            key = ApiKey(
                id=new_id("key"), name=name, key_prefix=raw[:12], key_hash=hash_api_key(raw),
                roles=valid, created_at=utcnow(),
            )  # fmt: skip
            uow.api_keys.add(key)
            self._audit.record(
                uow, actor_type="system", actor_id=actor, action="api_key.created", target=key.id,
                details={"name": name, "roles": valid},
            )  # fmt: skip
        return key, raw

    async def revoke(self, key_id: str, *, actor: str = "cli") -> bool:
        async with self._uow_factory() as uow:
            key = await uow.api_keys.get(key_id)
            if key is None or key.revoked_at is not None:
                return False
            key.revoked_at = utcnow()
            self._audit.record(uow, actor_type="system", actor_id=actor, action="api_key.revoked", target=key_id)
            return True
