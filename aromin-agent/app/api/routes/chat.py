"""POST /v1/chat — JSON transport over the runtime's event stream.

The runtime yields transport-neutral events; this endpoint collects them. An SSE route
(``Accept: text/event-stream``) can forward the same events later without runtime changes.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.agent.events import MessageDelta, TurnCompleted, TurnFailed, TurnStarted
from app.agent.runtime import TurnInput
from app.api.deps import ContainerDep, rate_limit, require
from app.api.schemas import ChatRequestIn, ChatResponseOut, MessageOut, UsageOut
from app.core.errors import AgentError, AppError
from app.providers import errors as perr
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1", tags=["chat"])

_FAILURES: dict[str, type[AppError]] = {
    cls.code: cls
    for cls in (
        perr.ProviderTimeoutError, perr.ProviderRateLimitError, perr.ProviderUnavailableError,
        perr.ProviderBadRequestError, perr.ProviderResponseError, perr.ProviderConfigurationError,
        perr.ProviderError, AgentError,
    )
}  # fmt: skip


@router.post("/chat", response_model=ChatResponseOut, dependencies=[Depends(rate_limit("chat"))])
async def chat(
    body: ChatRequestIn,
    container: ContainerDep,
    principal: Annotated[Principal, Depends(require(Permission.chat_write))],
) -> ChatResponseOut:
    turn = TurnInput(
        content=body.message,
        actor_id=principal.id,
        channel=body.channel,
        conversation_id=body.conversation_id,
        client_msg_id=body.client_msg_id,
    )
    started: TurnStarted | None = None
    async for event in container.runtime.run_turn(turn):
        match event:
            case TurnStarted():
                started = event
            case MessageDelta():
                pass  # a streaming transport forwards these
            case TurnFailed():
                raise _FAILURES.get(event.code, AppError)(extra={"task_id": event.task_id})
            case TurnCompleted():
                assert started is not None
                usage = event.usage
                return ChatResponseOut(
                    conversation_id=event.conversation_id,
                    task_id=event.task_id,
                    user_message_id=started.user_message_id,
                    message=MessageOut(
                        id=event.message_id,
                        seq=event.seq,
                        role="assistant",
                        content=event.content,
                        created_at=event.created_at,
                    ),
                    usage=UsageOut(**usage.model_dump()) if usage else None,
                    replayed=event.replayed,
                )
    raise AppError("The turn ended without a reply")
