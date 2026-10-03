"""Align journal fencing token width with the task's bigint; never rewrite 0003."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("task_steps") as batch:
        batch.alter_column("lease_token", existing_type=sa.Integer(), type_=sa.BigInteger(), existing_nullable=True)


def downgrade():
    rows = sa.table("task_steps", sa.column("lease_token"))
    if (
        op.get_bind()
        .execute(
            sa.select(sa.func.count())
            .select_from(rows)
            .where(sa.or_(rows.c.lease_token > 2147483647, rows.c.lease_token < -2147483648))
        )
        .scalar()
    ):
        raise RuntimeError("0004 downgrade refused: journal token exceeds integer range")
    with op.batch_alter_table("task_steps") as batch:
        batch.alter_column("lease_token", existing_type=sa.BigInteger(), type_=sa.Integer(), existing_nullable=True)
