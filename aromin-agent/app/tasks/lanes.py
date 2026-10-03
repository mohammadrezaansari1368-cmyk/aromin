"""Per-replica lane floors and EXACT customer inbound reservation.

The same process lock covers eligibility, database claim/commit, and occupancy.
Main and bulk pools are constructed separately. Hosts are not yet wired.
"""

import asyncio
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError

from app.db.uow import UowFactory
from app.tasks.claim import Lease, LeaseStore

ORDERS = {"interactive": (0,), "customer": (1, 0), "default": (0, 1, 2), "bulk": (3,)}


@dataclass(frozen=True)
class BusySlot:
    lease: Lease
    inbound: bool


class SlotPool:
    def __init__(
        self,
        uow_factory: UowFactory,
        *,
        bulk: bool = False,
        leases: LeaseStore | None = None,
        inbound_kinds: frozenset[str] = frozenset({"agent.run", "task.fallback"}),
    ):
        self.uows = uow_factory
        self.leases = leases or LeaseStore()
        self.inbound_kinds = inbound_kinds
        counts = {"bulk": 2} if bulk else {"interactive": 4, "customer": 8, "default": 4}
        self.slots = {f"{kind}:{number}": kind for kind, count in counts.items() for number in range(count)}
        self.busy: dict[str, BusySlot] = {}
        self.lock = asyncio.Lock()

    async def claim(self, slot: str, *, owner: str, kinds: tuple[str, ...], excluded: tuple[str, ...] = ()):
        if slot not in self.slots:
            raise ValueError("unknown slot")
        async with self.lock:
            if slot in self.busy:
                raise ValueError("slot is already occupied")
            slot_type = self.slots[slot]
            noninbound = sum(not busy.inbound for name, busy in self.busy.items() if self.slots[name] == "customer")
            restricted = slot_type == "customer" and noninbound >= 6
            for lane in ORDERS[slot_type]:
                if restricted and lane == 0:
                    continue
                supported = tuple(
                    item for item in kinds if not restricted or item.rsplit("@", 1)[0] in self.inbound_kinds
                )
                if not supported:
                    continue
                for attempt in range(3):
                    try:
                        async with self.uows() as uow:
                            lease = await self.leases.claim(
                                uow.session, owner=owner, lane=lane, kinds=supported, excluded=excluded
                            )
                            task = await uow.tasks.get(lease.task_id) if lease is not None else None
                            inbound = task is not None and lane == 1 and task.kind in self.inbound_kinds
                        # Transaction has COMMITTED before exposing the lease or occupying capacity.
                        if lease is not None:
                            self.busy[slot] = BusySlot(lease, inbound)
                            return lease
                        break
                    except IntegrityError as exc:
                        # Claim concurrency-key race only. Other integrity errors remain visible.
                        if getattr(exc.orig, "sqlstate", None) != "23505":
                            raise
                        if attempt == 2:
                            return None
            return None

    async def finished(self, slot: str, lease: Lease):
        """Local capacity only: caller first completes/releases/abandons DB ownership."""
        async with self.lock:
            occupied = self.busy.get(slot)
            if occupied is None or occupied.lease != lease:
                raise ValueError("slot lease mismatch")
            del self.busy[slot]
