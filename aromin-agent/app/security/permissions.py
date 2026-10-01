"""Role-based permissions (blueprint §14 RBAC roles)."""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    admin = "admin"
    sales_manager = "sales_manager"
    salesperson = "salesperson"
    service = "service"
    visitor = "visitor"


class Permission(StrEnum):
    conversation_read = "conversation:read"
    conversation_write = "conversation:write"
    chat_write = "chat:write"
    task_read = "task:read"
    admin = "admin"


ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.admin: frozenset(Permission),
    Role.sales_manager: frozenset({Permission.conversation_read, Permission.task_read}),
    Role.salesperson: frozenset({Permission.conversation_read}),
    Role.service: frozenset(
        {Permission.conversation_read, Permission.conversation_write, Permission.chat_write, Permission.task_read}
    ),
    Role.visitor: frozenset(),  # visitor tokens (website widget) arrive with the web chat integration
}


def permissions_for(roles: list[str] | tuple[str, ...]) -> frozenset[str]:
    out: set[str] = set()
    for name in roles:
        try:
            out |= {p.value for p in ROLE_PERMISSIONS[Role(name)]}
        except ValueError:
            continue  # unknown role names grant nothing
    return frozenset(out)
