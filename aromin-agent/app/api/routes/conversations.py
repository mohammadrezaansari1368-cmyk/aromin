from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from app.api.deps import ContainerDep, require
from app.api.schemas import ConversationOut, ConversationWithMessages, CreateConversationRequest, MessageOut
from app.core.ids import id_pattern
from app.models.conversation import Conversation
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


def _out(c: Conversation) -> dict:
    return {
        "id": c.id, "channel": c.channel, "status": c.status, "agent_profile": c.agent_profile,
        "created_at": c.created_at, "last_message_at": c.last_message_at, "metadata": c.metadata_ or {},
    }  # fmt: skip


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ConversationOut)
async def create_conversation(
    body: CreateConversationRequest,
    container: ContainerDep,
    principal: Annotated[Principal, Depends(require(Permission.conversation_write))],
) -> ConversationOut:
    conversation = await container.conversations.create(
        principal, channel=body.channel, customer_ref=body.customer_ref, metadata=body.metadata
    )
    return ConversationOut(**_out(conversation))


@router.get("/{conversation_id}", response_model=ConversationWithMessages)
async def get_conversation(
    conversation_id: Annotated[str, Path(pattern=id_pattern("conv"))],
    container: ContainerDep,
    _: Annotated[Principal, Depends(require(Permission.conversation_read))],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    cursor: Annotated[int, Query(ge=0, description="Return messages with seq greater than this")] = 0,
) -> ConversationWithMessages:
    page = await container.conversations.get_page(conversation_id, after_seq=cursor, limit=limit)
    messages = [
        MessageOut(id=m.id, seq=m.seq, role=m.role, content=m.content, created_at=m.created_at) for m in page.messages
    ]
    return ConversationWithMessages(**_out(page.conversation), messages=messages, next_cursor=page.next_cursor)
