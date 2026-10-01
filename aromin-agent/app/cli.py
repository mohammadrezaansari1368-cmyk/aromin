"""Operator CLI. API keys are managed here only; there is no HTTP endpoint for it.

python -m app.cli create-api-key --name dashboard --role service
python -m app.cli revoke-api-key key_01J...
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory
from app.db.uow import make_uow_factory
from app.security.permissions import Role
from app.services.api_keys import ApiKeyService
from app.services.audit import AuditLogger


async def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    engine = create_engine(settings)
    try:
        service = ApiKeyService(
            make_uow_factory(create_session_factory(engine)), AuditLogger(), settings.api_key_prefix,
            "live" if settings.app_env.value == "production" else "test",
        )  # fmt: skip
        if args.command == "create-api-key":
            key, raw = await service.create(args.name, args.role)
            print(f"id={key.id} roles={','.join(key.roles)}")
            print(f"api_key={raw}")
            print("Store this key now; it cannot be shown again.", file=sys.stderr)
            return 0
        if args.command == "revoke-api-key":
            ok = await service.revoke(args.key_id)
            print("revoked" if ok else "not found or already revoked")
            return 0 if ok else 1
        return 2
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-api-key")
    create.add_argument("--name", required=True)
    create.add_argument("--role", action="append", required=True, choices=[r.value for r in Role])
    revoke = sub.add_parser("revoke-api-key")
    revoke.add_argument("key_id")
    return asyncio.run(_run(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
