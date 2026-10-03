"""Bounded leased runner for explicitly registered INTERNAL PURE computation.

Experimental core, not wired to API/worker entry points. agent.run, tools,
internal writes and external effects remain disabled until their full fenced
security/ledger/approval integration is ready. No built-in kinds are registered.
"""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import func
from sqlalchemy.exc import DBAPIError

from app.db.uow import UowFactory
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.tasks.claim import Lease, LeaseLost, LeaseStore
from app.tasks.journal import BoundaryStopped, JournalStore
from app.tasks.replay import ReplayUnavailable, exact_json, replay_input
from app.tasks.retry import FailureClass, RetryStore


@dataclass(frozen=True)
class PureResult:
    output: dict[str, Any]
    state_after: dict[str, Any]


@dataclass(frozen=True)
class PurePlan:
    name: str
    input: dict[str, Any]
    compute: Callable[[dict[str, Any]], Awaitable[PureResult]]
    timeout_seconds: float = 60


@dataclass(frozen=True)
class PureKind:
    name: str
    version: int
    input_model: type[BaseModel]
    next_step: Callable[[dict[str, Any], dict[str, Any]], PurePlan | None]
    max_steps: int = 40

    def __post_init__(self):
        if not self.name.startswith(("internal.", "test.")) or self.version < 1 or not 1 <= self.max_steps <= 100:
            raise ValueError("only bounded internal/test pure kinds are supported by this experimental runner")


class TaskRunner:
    def __init__(
        self,
        uow_factory: UowFactory,
        *,
        heartbeat_uow_factory: UowFactory,
        leases: LeaseStore | None = None,
        heartbeat_seconds: float = 15,
    ):
        self.uows = uow_factory
        # Production hosts must supply a separate 2-connection heartbeat pool.
        self.heartbeat_uows = heartbeat_uow_factory
        self.leases = leases or LeaseStore()
        self.journal = JournalStore(self.leases)
        self.retry = RetryStore(self.journal)
        if not 0 < heartbeat_seconds < 60:
            raise ValueError("heartbeat interval must be shorter than the standard lease")
        self.heartbeat_seconds = heartbeat_seconds

    async def _heartbeat(self, lease: Lease):
        while True:
            await asyncio.sleep(self.heartbeat_seconds)
            async with self.heartbeat_uows() as uow:
                if await self.leases.heartbeat(uow.session, lease):
                    raise BoundaryStopped("cancellation requested")

    async def run(self, lease: Lease, kind: PureKind, *, stop: asyncio.Event | None = None) -> str:
        work = asyncio.create_task(self._execute(lease, kind, stop))
        heartbeat = asyncio.create_task(self._heartbeat(lease))
        try:
            done, _ = await asyncio.wait((work, heartbeat), return_when=asyncio.FIRST_COMPLETED)
            if work in done:
                return work.result()
            # Fence/heartbeat failure or uncertain DB outcome: stop local pure work.
            work.cancel()
            await asyncio.gather(work, return_exceptions=True)
            heartbeat.result()
            raise AssertionError("heartbeat ended without a result")
        except (LeaseLost, DBAPIError, asyncio.CancelledError):
            # Never write after lease loss or an ambiguous commit; leave recovery to DB state.
            raise
        except BoundaryStopped:
            async with self.uows() as uow:
                plan = await self.retry.fail(uow.session, lease, FailureClass.permanent)
            return plan.status
        except (ValidationError, ReplayUnavailable, ValueError):
            async with self.uows() as uow:
                plan = await self.retry.fail(uow.session, lease, FailureClass.permanent)
            return plan.status
        except Exception:
            async with self.uows() as uow:
                plan = await self.retry.fail(uow.session, lease, FailureClass.bug)
            return plan.status
        finally:
            for task in (work, heartbeat):
                if not task.done():
                    task.cancel()
            await asyncio.gather(work, heartbeat, return_exceptions=True)

    async def _execute(self, lease: Lease, kind: PureKind, stop: asyncio.Event | None):
        while True:
            async with self.uows() as uow:
                task = await self.journal.owned_task(uow.session, lease, starting=True)
                if task.kind != kind.name or task.kind_version != kind.version:
                    raise ValueError("claimed task and handler version mismatch")
                payload = kind.input_model.model_validate(task.input, strict=True).model_dump(mode="json")
                state = exact_json(task.state, max_bytes=8192)
                steps = await uow.steps.for_task(task.id)
                pending = [step for step in steps if step.status in ("pending", "running")]
                if any(step.status not in ("pending", "running", "succeeded") for step in steps):
                    raise ReplayUnavailable("unsupported journal recovery state")
                if len(pending) > 1:
                    raise ReplayUnavailable("pure runner cannot recover a tool batch")
                if stop is not None and stop.is_set():
                    cancelled = await self.leases.release(uow.session, lease)
                    return "cancelled" if cancelled else "queued"
                plan = kind.next_step(state, payload)
                if plan is None:
                    if pending:
                        raise ReplayUnavailable("handler omitted an unfinished durable step")
                    task.status = "succeeded"
                    task.lease_owner = task.lease_until = None
                    task.wait_kind = None

                    task.finished_at = task.updated_at = func.current_timestamp()
                    task.result = {"state": state}
                    if task.emit_events:
                        EventRecorder().record(uow, EventType.task_completed, subject={"task_id": task.id})
                    return "succeeded"
                if not isinstance(plan, PurePlan) or not 0 < plan.timeout_seconds <= 60:
                    raise ValueError("unsupported pure plan")
                if len(steps) >= kind.max_steps and not pending:
                    raise ValueError("durable step budget exceeded")
                if pending:
                    step = pending[0]
                    if step.name != plan.name or step.type != "tool_call":
                        raise ReplayUnavailable("handler no longer supports persisted step")
                    arguments = replay_input(step)
                else:
                    step = await self.journal.plan(
                        uow.session, lease, type="tool_call", name=plan.name, payload=plan.input
                    )
                    arguments = replay_input(step)
                number = step.step_no
                await self.journal.start(uow.session, lease, number)
            # The journal start has committed; there is NO DB transaction during compute.
            async with asyncio.timeout(plan.timeout_seconds):
                result = await plan.compute(arguments)
            if not isinstance(result, PureResult):
                raise ValueError("invalid pure result")
            async with self.uows() as uow:
                await self.journal.complete(
                    uow.session, lease, number, output=result.output, state_after=result.state_after
                )
