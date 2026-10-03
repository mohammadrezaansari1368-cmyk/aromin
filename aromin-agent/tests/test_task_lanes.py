"""Local reservation races use a fake claim source, not PostgreSQL lock proof."""

import asyncio

import pytest
from sqlalchemy import select

from app.core.ids import new_id
from app.models.task import Task
from app.tasks.claim import Lease
from app.tasks.lanes import SlotPool


class FakeClaims:
    def __init__(self):
        self.claimed = set()
        self.attempts = []

    async def claim(self, session, *, owner, lane, kinds, excluded):
        self.attempts.append((lane, kinds))
        names = {item.rsplit("@", 1)[0] for item in kinds} - set(excluded)
        tasks = (
            await session.execute(
                select(Task).where(Task.lane == lane, Task.kind.in_(names)).order_by(Task.run_at, Task.id)
            )
        ).scalars()
        for task in tasks:
            if task.id not in self.claimed:
                self.claimed.add(task.id)
                return Lease(task.id, owner, 1)
        return None


async def seed(container, kind, lane, count):
    async with container.uow_factory() as uow:
        for _ in range(count):
            uow.tasks.add(Task(id=new_id("task"), kind=kind, lane=lane, mode="background", status="queued"))


async def test_concurrent_customer_claims_cannot_undercut_inbound_reserve(container):
    await seed(container, "test.web", 0, 20)
    claims = FakeClaims()
    pool = SlotPool(container.uow_factory, leases=claims, inbound_kinds=frozenset({"test.inbound"}))
    leases = await asyncio.gather(
        *(pool.claim(f"customer:{i}", owner=f"worker:{i}", kinds=("test.web@1", "test.inbound@1")) for i in range(8))
    )
    assert sum(lease is not None for lease in leases) == 6
    assert len(pool.busy) == 6
    await seed(container, "test.inbound", 1, 2)
    for index, lease in enumerate(leases):
        if lease is None:
            assert (
                await pool.claim(f"customer:{index}", owner=f"inbound:{index}", kinds=("test.web@1", "test.inbound@1"))
                is not None
            )
    assert sum(not busy.inbound for busy in pool.busy.values()) == 6
    assert sum(busy.inbound for busy in pool.busy.values()) == 2


async def test_bulk_isolation_and_slot_claim_orders(container):
    await seed(container, "test.bulk", 3, 1)
    claims = FakeClaims()
    main = SlotPool(container.uow_factory, leases=claims)
    assert await main.claim("default:0", owner="main", kinds=("test.bulk@1",)) is None
    assert [lane for lane, _ in claims.attempts] == [0, 1, 2]
    assert len(main.slots) == 16
    bulk = SlotPool(container.uow_factory, bulk=True, leases=claims)
    assert len(bulk.slots) == 2
    lease = await bulk.claim("bulk:0", owner="bulk", kinds=("test.bulk@1",))
    assert lease is not None
    with pytest.raises(ValueError, match="occupied"):
        await bulk.claim("bulk:0", owner="bulk", kinds=("test.bulk@1",))
    with pytest.raises(ValueError, match="mismatch"):
        await bulk.finished("bulk:0", Lease(lease.task_id, "other", 1))
    await bulk.finished("bulk:0", lease)
    assert bulk.busy == {}
