"""Expand journal generations without replacing legacy identities or effect keys."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None
JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TABLES = ("task_steps", "tool_executions", "approvals", "side_effects", "llm_usage")


def upgrade():
    with op.batch_alter_table("tasks") as batch:
        for name, default in (
            ("generation", "0"),
            ("expiries_since_progress", "0"),
            ("max_consecutive_failures", "5"),
            ("max_total_failures", "20"),
        ):
            batch.add_column(sa.Column(name, sa.Integer(), nullable=False, server_default=default))
        batch.add_column(sa.Column("initial_state", JSON, nullable=False, server_default="{}"))
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("generation", sa.Integer(), nullable=False, server_default="0"))
    with op.batch_alter_table("task_steps") as batch:
        batch.add_column(sa.Column("idempotency_key", sa.String(64)))
        batch.add_column(sa.Column("replay_input", JSON))
        batch.add_column(sa.Column("state_after", JSON))
        batch.add_column(sa.Column("lease_token", sa.Integer()))
        batch.add_column(sa.Column("parent_step_no", sa.Integer()))
        batch.drop_constraint("uq_task_steps_task_id_step_no", type_="unique")
        batch.create_unique_constraint("uq_task_steps_task_generation_step", ["task_id", "generation", "step_no"])
    # Keys belong to the historical execution, not to a new hash of preview arguments.
    steps = sa.table(
        "task_steps",
        sa.column("task_id"),
        sa.column("step_no"),
        sa.column("execution_id"),
        sa.column("idempotency_key"),
    )
    executions = sa.table(
        "tool_executions", sa.column("id"), sa.column("task_id"), sa.column("step_no"), sa.column("idempotency_key")
    )
    historical_key = (
        sa.select(executions.c.idempotency_key)
        .where(
            executions.c.task_id == steps.c.task_id,
            executions.c.step_no == steps.c.step_no,
            sa.or_(steps.c.execution_id.is_(None), executions.c.id == steps.c.execution_id),
        )
        .scalar_subquery()
    )
    op.execute(steps.update().values(idempotency_key=historical_key))
    # Never promote sanitized legacy previews to executable replay_input.
    with op.batch_alter_table("tool_executions") as batch:
        batch.drop_index("uq_tool_executions_task_id_step_no")
        batch.create_index("uq_tool_executions_task_id_step_no", ["task_id", "generation", "step_no"], unique=True)
    with op.batch_alter_table("approvals") as batch:
        batch.drop_index("uq_approvals_pending_step")
        batch.create_index(
            "uq_approvals_pending_step",
            ["task_id", "generation", "step_no"],
            unique=True,
            postgresql_where=sa.text("status = 'pending'"),
            sqlite_where=sa.text("status = 'pending'"),
        )


def downgrade():
    # Refuse evidence loss. Expanded-schema compatible rollback is the production path.
    bind = op.get_bind()
    for table in ("tasks", *TABLES):
        rows = sa.table(table, sa.column("generation"))
        if bind.execute(sa.select(sa.func.count()).select_from(rows).where(rows.c.generation != 0)).scalar():
            raise RuntimeError("0003 downgrade refused: nonzero journal generation; retain expanded schema")
    rows = sa.table("task_steps", sa.column("replay_input"), sa.column("state_after"), sa.column("lease_token"))
    if bind.execute(
        sa.select(sa.func.count())
        .select_from(rows)
        .where(
            sa.or_(rows.c.replay_input.is_not(None), rows.c.state_after.is_not(None), rows.c.lease_token.is_not(None))
        )
    ).scalar():
        raise RuntimeError("0003 downgrade refused: durable replay evidence; retain expanded schema")
    with op.batch_alter_table("approvals") as batch:
        batch.drop_index("uq_approvals_pending_step")
        batch.create_index(
            "uq_approvals_pending_step",
            ["task_id", "step_no"],
            unique=True,
            postgresql_where=sa.text("status = 'pending'"),
            sqlite_where=sa.text("status = 'pending'"),
        )
    with op.batch_alter_table("tool_executions") as batch:
        batch.drop_index("uq_tool_executions_task_id_step_no")
        batch.create_index("uq_tool_executions_task_id_step_no", ["task_id", "step_no"], unique=True)
    with op.batch_alter_table("task_steps") as batch:
        batch.drop_constraint("uq_task_steps_task_generation_step", type_="unique")
        batch.create_unique_constraint("uq_task_steps_task_id_step_no", ["task_id", "step_no"])
        for name in ("idempotency_key", "replay_input", "state_after", "lease_token", "parent_step_no"):
            batch.drop_column(name)
    for table in reversed(TABLES):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("generation")
    with op.batch_alter_table("tasks") as batch:
        for name in (
            "generation",
            "initial_state",
            "expiries_since_progress",
            "max_consecutive_failures",
            "max_total_failures",
        ):
            batch.drop_column(name)
