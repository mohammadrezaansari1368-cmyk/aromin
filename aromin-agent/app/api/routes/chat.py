"""POST /v1/chat — JSON transport over the runtime's event stream.

The runtime yields transport-neutral events; this endpoint collects them. An SSE route
(``Accept: text/event-stream``) can forward the same events later without runtime changes.
When a tool call needs approval the turn pauses and the endpoint answers ``202`` with the
``approval_id``; the turn continues after ``POST /v1/approvals/{id}/approve|reject``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.agent.runtime import TurnInput
from app.api.deps import ContainerDep, rate_limit, require
from app.api.schemas import ChatRequestIn, ChatResponseOut, MessageOut, UsageOut
from app.api.turns import collect
from app.core.errors import AppError
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1", tags=["chat"])


@router.post(
    "/chat",
    response_model=ChatResponseOut,
    responses={202: {"model": ChatResponseOut, "description": "Paused: a tool call is waiting for approval"}},
    dependencies=[Depends(rate_limit("chat"))],
)
async def chat(
    body: ChatRequestIn,
    container: ContainerDep,
    principal: Annotated[Principal, Depends(require(Permission.chat_write))],
):
    turn = TurnInput(
        content=body.message,
        actor_id=principal.id,
        channel=body.channel,
        conversation_id=body.conversation_id,
        client_msg_id=body.client_msg_id,
        actor_type=principal.type,
        roles=principal.roles,
        permissions=principal.permissions,
    )
    result = await collect(container.runtime.run_turn(turn))
    result.raise_if_failed()
    started = result.started
    if started is None:
        raise AppError("The turn ended without a result")
    if result.waiting is not None:
        out = ChatResponseOut(
            conversation_id=started.conversation_id, task_id=started.task_id, user_message_id=started.user_message_id,
            status="waiting_approval", approval_id=result.waiting.approval_id, tool_calls=result.tool_calls,
        )  # fmt: skip
        return JSONResponse(out.model_dump(mode="json"), status_code=202)
    event = result.completed
    if event is None:
        raise AppError("The turn ended without a reply")
    usage = event.usage
    return ChatResponseOut(
        conversation_id=event.conversation_id,
        task_id=event.task_id,
        user_message_id=started.user_message_id,
        message=MessageOut(
            id=event.message_id, seq=event.seq, role="assistant", content=event.content, created_at=event.created_at
        ),
        tool_calls=result.tool_calls,
        usage=UsageOut(**usage.model_dump()) if usage else None,
        replayed=event.replayed,
    )
