"""Phase 2 built-in tools: internal, read-only, LOW risk.

All of them read through ``ToolDataAccess`` and are scoped to the current turn: the
conversation and task come from ``ToolContext``, never from model arguments.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field

from app.security.permissions import Permission
from app.tools.calculator import evaluate
from app.tools.errors import ToolBusinessError
from app.tools.registry import ToolRegistry
from app.tools.spec import RiskLevel, ToolContext, ToolSpec


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- get_conversation ---------------------------------------------------------------


class GetConversationIn(_In):
    pass


class GetConversationOut(BaseModel):
    channel: str
    status: str
    created_at: datetime
    last_message_at: datetime | None
    message_count: int


async def get_conversation(ctx: ToolContext, _: GetConversationIn) -> GetConversationOut:
    view = await ctx.data.conversation(ctx.conversation_id)
    if view is None:
        raise ToolBusinessError("conversation not found", code="not_found")
    return GetConversationOut(
        channel=view.channel, status=view.status, created_at=view.created_at,
        last_message_at=view.last_message_at, message_count=view.message_count,
    )  # fmt: skip


# --- get_message_history --------------------------------------------------------------


class GetMessageHistoryIn(_In):
    limit: int = Field(default=10, ge=1, le=50, description="How many recent messages to return")
    before_seq: int | None = Field(default=None, ge=1, description="Only messages with seq below this")


class HistoryItem(BaseModel):
    seq: int
    role: str
    content: str
    created_at: datetime


class GetMessageHistoryOut(BaseModel):
    messages: list[HistoryItem]


async def get_message_history(ctx: ToolContext, args: GetMessageHistoryIn) -> GetMessageHistoryOut:
    rows = await ctx.data.messages(ctx.conversation_id, limit=args.limit, before_seq=args.before_seq)
    return GetMessageHistoryOut(
        messages=[HistoryItem(seq=m.seq, role=m.role, content=m.content[:2000], created_at=m.created_at) for m in rows]
    )


# --- get_task -------------------------------------------------------------------------


class GetTaskIn(_In):
    pass


class GetTaskOut(BaseModel):
    kind: str
    status: str
    created_at: datetime
    step_count: int


async def get_task(ctx: ToolContext, _: GetTaskIn) -> GetTaskOut:
    view = await ctx.data.task(ctx.task_id)
    if view is None:
        raise ToolBusinessError("task not found", code="not_found")
    return GetTaskOut(kind=view.kind, status=view.status, created_at=view.created_at, step_count=view.step_count)


# --- get_current_time -------------------------------------------------------------------

Timezone = Literal["Asia/Tehran", "UTC"]


class GetCurrentTimeIn(_In):
    timezone: Timezone = Field(default="Asia/Tehran")


class GetCurrentTimeOut(BaseModel):
    timezone: str
    iso: str
    weekday: str


async def get_current_time(_: ToolContext, args: GetCurrentTimeIn) -> GetCurrentTimeOut:
    now = datetime.now(UTC).astimezone(ZoneInfo(args.timezone))
    return GetCurrentTimeOut(timezone=args.timezone, iso=now.isoformat(timespec="seconds"), weekday=now.strftime("%A"))


# --- calculate --------------------------------------------------------------------------


class CalculateIn(_In):
    expression: str = Field(min_length=1, max_length=200, description="Arithmetic only, e.g. (3 * 1250000) * 0.9")


class CalculateOut(BaseModel):
    result: float | int


async def calculate(_: ToolContext, args: CalculateIn) -> CalculateOut:
    return CalculateOut(result=evaluate(args.expression))


BUILTIN_TOOL_NAMES = frozenset({"get_conversation", "get_message_history", "get_task", "get_current_time", "calculate"})


def register_builtin_tools(registry: ToolRegistry) -> None:
    read = Permission.conversation_read.value
    registry.register(ToolSpec(
        name="get_conversation", description="Metadata of the current conversation.",
        input_model=GetConversationIn, output_model=GetConversationOut, risk_level=RiskLevel.LOW,
        permissions_required=frozenset({read}), requires_conversation=True, timeout_s=5, handler=get_conversation,
    ))  # fmt: skip
    registry.register(ToolSpec(
        name="get_message_history", description="Recent messages of the current conversation, oldest first.",
        input_model=GetMessageHistoryIn, output_model=GetMessageHistoryOut, risk_level=RiskLevel.LOW,
        permissions_required=frozenset({read}), requires_conversation=True, timeout_s=5,
        handler=get_message_history,
    ))  # fmt: skip
    registry.register(ToolSpec(
        name="get_task", description="Status of the current agent task.",
        input_model=GetTaskIn, output_model=GetTaskOut, risk_level=RiskLevel.LOW,
        permissions_required=frozenset({Permission.task_read.value}), timeout_s=5, handler=get_task,
    ))  # fmt: skip
    registry.register(ToolSpec(
        name="get_current_time", description="Current date and time (Asia/Tehran by default).",
        input_model=GetCurrentTimeIn, output_model=GetCurrentTimeOut, risk_level=RiskLevel.LOW,
        timeout_s=2, handler=get_current_time,
    ))  # fmt: skip
    registry.register(ToolSpec(
        name="calculate", description="Evaluate an arithmetic expression exactly; use it for prices and totals.",
        input_model=CalculateIn, output_model=CalculateOut, risk_level=RiskLevel.LOW, timeout_s=2,
        handler=calculate,
    ))  # fmt: skip
