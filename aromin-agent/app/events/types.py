"""Domain event types (blueprint §10, v1 list plus reference §9.19 additions)."""

from __future__ import annotations

from enum import StrEnum


class EventType(StrEnum):
    message_received = "message.received"
    message_sent = "message.sent"
    conversation_created = "conversation.created"
    lead_created = "lead.created"
    lead_qualified = "lead.qualified"
    lead_scored = "lead.scored"
    lead_assigned = "lead.assigned"
    followup_due = "followup.due"
    followup_sent = "followup.sent"
    task_created = "task.created"
    task_completed = "task.completed"
    task_failed = "task.failed"
    task_cancelled = "task.cancelled"
    handoff_created = "handoff.created"
    handoff_accepted = "handoff.accepted"
    approval_requested = "approval.requested"
    approval_resolved = "approval.resolved"
    side_effect_unknown = "side_effect.unknown"
