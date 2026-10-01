"""Database models, constraints and migrations."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.exc import IntegrityError

from app.core.ids import is_valid_id, new_id
from app.memory.conversation import ConversationMemory
from app.models import Base, Conversation, Task
from app.models.base import utcnow
from app.tasks.engine import ALLOWED_TRANSITIONS, IllegalTransition, TaskEngine


async def test_migrations_match_models(container):
    async with container.engine.connect() as conn:
        diff = await conn.run_sync(lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata))
    assert diff == []


def test_prefixed_ulid_ids():
    a, b = new_id("conv"), new_id("conv")
    assert a != b and is_valid_id(a, "conv") and not is_valid_id(a, "task") and len(a) == 31


async def test_conversation_message_sequence_and_uniqueness(container):
    memory = ConversationMemory()
    async with container.uow_factory() as uow:
        conv = memory.new_conversation("api", "generic")
        uow.conversations.add(conv)
        m1 = memory.append(uow, conv, role="user", content="a", channel_msg_id="c1")
        m2 = memory.append(uow, conv, role="assistant", content="b")
        await uow.messages.flush()
        assert (m1.seq, m2.seq, conv.msg_seq, conv.last_user_seq) == (1, 2, 2, 1)
        conv_id = conv.id

    with pytest.raises(IntegrityError):  # duplicate client message id in one conversation
        async with container.uow_factory() as uow:
            conv = await uow.conversations.get(conv_id)
            memory.append(uow, conv, role="user", content="again", channel_msg_id="c1")
            await uow.messages.flush()


@pytest.mark.parametrize("field,value", [("status", "bogus"), ("mode", "later"), ("lane", 9)])
async def test_task_check_constraints(container, field, value):
    row = dict(
        id=new_id("task"), kind="agent.run", lane=0, mode="immediate", status="queued", input={}, state={},
        run_at=utcnow(), created_at=utcnow(), updated_at=utcnow(),
    )  # fmt: skip
    row[field] = value
    with pytest.raises(IntegrityError):
        async with container.uow_factory() as uow:
            uow.tasks.add(Task(**row))
            await uow.tasks.flush()


async def test_running_task_requires_lease(container):
    with pytest.raises(IntegrityError):
        async with container.uow_factory() as uow:
            uow.tasks.add(Task(
                id=new_id("task"), kind="agent.run", lane=0, mode="immediate", status="running", input={},
                state={}, run_at=utcnow(), created_at=utcnow(), updated_at=utcnow(),
            ))  # fmt: skip
            await uow.tasks.flush()


async def test_one_running_task_per_conversation_index(container):
    async with container.uow_factory() as uow:
        conv = Conversation(id=new_id("conv"), channel="api", agent_profile="generic", metadata_={})
        uow.conversations.add(conv)
        await uow.conversations.flush()
        await container.tasks.start_inline_turn(uow, conversation_id=conv.id, trigger_seq=1, created_by="t")
        conv_id = conv.id
    with pytest.raises(IntegrityError):  # bypass the engine's pre-check: the DB index still refuses
        async with container.uow_factory() as uow:
            uow.tasks.add(Task(
                id=new_id("task"), kind="agent.run", lane=0, mode="immediate", status="running",
                lease_owner="x", lease_until=utcnow(), concurrency_key=f"conv:{conv_id}", input={}, state={},
                run_at=utcnow(), created_at=utcnow(), updated_at=utcnow(),
            ))  # fmt: skip
            await uow.tasks.flush()


def test_transition_table_matches_reference():
    assert len(ALLOWED_TRANSITIONS) == 15
    t = Task(status="succeeded")
    with pytest.raises(IllegalTransition):
        TaskEngine.transition(t, "running")
    t = Task(status="running", lease_owner="x", lease_until=utcnow())
    TaskEngine.transition(t, "failed")
    assert t.lease_owner is None and t.finished_at is not None


async def test_postgres_trigger_rejects_illegal_transition(container):
    if container.engine.dialect.name != "postgresql":
        pytest.skip("trigger exists on PostgreSQL only")
    from sqlalchemy import update

    async with container.uow_factory() as uow:
        conv = Conversation(id=new_id("conv"), channel="api", agent_profile="generic", metadata_={})
        uow.conversations.add(conv)
        await uow.conversations.flush()
        task = await container.tasks.start_inline_turn(uow, conversation_id=conv.id, trigger_seq=1, created_by="t")
        container.tasks.succeed(task, {})
        task_id = task.id
    with pytest.raises(IntegrityError):
        async with container.uow_factory() as uow:
            await uow.session.execute(update(Task).where(Task.id == task_id).values(status="running"))


async def test_postgres_audit_log_is_append_only(container):
    if container.engine.dialect.name != "postgresql":
        pytest.skip("trigger exists on PostgreSQL only")
    from sqlalchemy import delete
    from sqlalchemy.exc import DBAPIError

    from app.models import AuditLog
    from app.services.audit import AuditLogger

    async with container.uow_factory() as uow:
        AuditLogger().record(uow, actor_type="system", actor_id="t", action="test")
    with pytest.raises(DBAPIError):
        async with container.uow_factory() as uow:
            await uow.session.execute(delete(AuditLog))
