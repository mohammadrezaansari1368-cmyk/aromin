from datetime import timedelta

import pytest

from app.models.base import utcnow
from app.models.task import Task
from app.tasks.retry import FailureClass, backoff, classify_external, retry_plan


def task(**overrides):
    return Task(
        lane=1,
        consecutive_failures=0,
        total_failures=0,
        expiries_since_progress=0,
        max_consecutive_failures=5,
        max_total_failures=20,
        cancel_requested=False,
        **overrides,
    )


@pytest.mark.parametrize("lane,base,cap", [(0, 2, 30), (1, 15, 600), (2, 30, 1800), (3, 60, 7200)])
def test_equal_jitter_boundaries(lane, base, cap):
    assert backoff(lane, 1, fraction=0) == base / 2
    assert backoff(lane, 1, fraction=1) == base
    assert backoff(lane, 100, fraction=1) == cap


def test_dependency_outage_wait_does_not_poison_task():
    t = task()
    for _ in range(30):
        plan = retry_plan(t, FailureClass.dependency_unavailable, now=utcnow())
        assert plan.status == "queued"
        assert plan.delay_seconds == 60
        assert plan.total_failures == plan.consecutive_failures == plan.expiries_since_progress == 0


def test_crash_loop_total_failures_and_cancel_precedence():
    t = task()
    t.expiries_since_progress = 2
    assert retry_plan(t, FailureClass.bug, now=utcnow(), expired=True).status == "dead"
    t.expiries_since_progress = 0
    t.total_failures = 19
    assert retry_plan(t, FailureClass.transient, now=utcnow()).status == "dead"
    t.cancel_requested = True
    plan = retry_plan(t, FailureClass.bug, now=utcnow(), expired=True)
    assert plan.status == "cancelled"
    assert plan.total_failures == 19 and plan.expiries_since_progress == 0


def test_absolute_deadline_never_extended_or_stranded():
    now = utcnow()
    t = task(deadline_at=now + timedelta(seconds=30))
    assert retry_plan(t, FailureClass.dependency_unavailable, now=now).status == "failed"
    assert t.deadline_at == now + timedelta(seconds=30)
    t.deadline_at = now - timedelta(seconds=1)
    assert retry_plan(t, FailureClass.transient, now=now).code == "deadline_exceeded"


@pytest.mark.parametrize("status", [None, 408, 500, 502, 504])
def test_unknown_unsafe_effect_never_blindly_retries(status):
    assert classify_external(unsafe=True, status_code=status) == FailureClass.outcome_unknown
    with pytest.raises(ValueError, match="reconciliation"):
        retry_plan(task(), FailureClass.outcome_unknown, now=utcnow())


def test_definite_rejection_or_unsent_failure_can_retry():
    assert classify_external(unsafe=True, status_code=429) == FailureClass.transient
    assert classify_external(unsafe=True, definitely_unsent=True) == FailureClass.transient
    assert classify_external(unsafe=True, status_code=401) == FailureClass.dependency_unavailable
    assert classify_external(unsafe=True, status_code=422) == FailureClass.permanent
    with pytest.raises(ValueError, match="lost owners"):
        retry_plan(task(), FailureClass.lease_lost, now=utcnow())


def test_success_and_invalid_retry_after_are_not_retried():
    with pytest.raises(ValueError, match="successful"):
        classify_external(unsafe=True, status_code=200)
    for value in (-1, float("nan"), float("inf")):
        with pytest.raises(ValueError, match="retry_after"):
            retry_plan(task(), FailureClass.transient, now=utcnow(), retry_after=value)
