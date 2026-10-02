"""Conversation and Message (blueprint §17, sequencing per Task Engine reference §9.14).

``customer_id`` is a plain nullable column for now; the ``customers`` table and its
foreign key arrive with the Customer entity in a later phase.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JSONType, TZDateTime, utcnow

CHANNELS = ("web", "sms", "api")
CONVERSATION_STATUSES = ("open", "closed")
MESSAGE_ROLES = ("user", "assistant", "system")


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint(f"channel IN {CHANNELS}", name="channel"),
        CheckConstraint(f"status IN {CONVERSATION_STATUSES}", name="status"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    customer_id: Mapped[str | None] = mapped_column(String(40), index=True)
    channel: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="open")
    agent_profile: Mapped[str] = mapped_column(String(64))
    handed_off_to: Mapped[str | None] = mapped_column(String(40))
    summary: Mapped[str | None] = mapped_column(Text)
    summary_upto_message_id: Mapped[str | None] = mapped_column(String(40))
    msg_seq: Mapped[int] = mapped_column(Integer, default=0)
    last_user_seq: Mapped[int] = mapped_column(Integer, default=0)
    answered_through_seq: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    last_message_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    messages: Mapped[list[Message]] = relationship(back_populates="conversation", order_by="Message.seq")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "seq"),
        CheckConstraint(f"role IN {MESSAGE_ROLES}", name="role"),
        Index(
            "uq_messages_conversation_id_channel_msg_id",
            "conversation_id",
            "channel_msg_id",
            unique=True,
            postgresql_where=text("channel_msg_id IS NOT NULL"),
            sqlite_where=text("channel_msg_id IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    seq: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    channel_msg_id: Mapped[str | None] = mapped_column(String(128))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    model: Mapped[str | None] = mapped_column(String(128))
    provider: Mapped[str | None] = mapped_column(String(64))
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
