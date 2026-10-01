# AROMIN AI — Task Engine Reference

Detailed design behind §9 of the [AROMIN AI Architecture Blueprint](aromin-ai-blueprint.md#9-task--background-job-architecture). The blueprint section gives the architecture and key principles; this document holds the implementation-level detail. Section numbers below (§9.x) refer to this document; other § numbers refer to the blueprint.

## 9. Task / Background Job Architecture

The Task Engine runs every unit of work that must survive a crash: multi-step agent work, follow-ups, SMS turns, memory extraction, ingestion, scheduled jobs. PostgreSQL is the only durable store for it (queue, journal, schedules, side-effect ledger). Redis carries only progress fan-out and rate-limit buckets; losing Redis loses no task and no result.

**Assumptions** (where the brief is silent):
- Volume: ≤ ~50k tasks/day *including one row per inline chat turn* (§9.1), ≤ ~100 tasks running at once, one Postgres primary. The design targets ≤ ~100 claims/s; beyond that, revisit (§21).
- Time comes from Postgres `now()` only (stored UTC). Worker and API clocks are never compared. Cron and quiet hours are evaluated in `Asia/Tehran` via `zoneinfo` (Iran has had no DST since 2023, but code must not assume that).
- Whether Iranian SMS providers accept a client dedupe id (e.g. Kavenegar `localid`) and offer a lookup by it is **[VERIFY]**. The design is correct either way (§9.7).
- "Customer-facing work" means the `interactive` and `customer` lanes (§9.5).

### 9.1 Execution model: one engine, two hosts

A task is a durable row plus an append-only step journal. One `TaskRunner` executes it, and both process types can host the runner:

| Mode | Who runs it | When |
|---|---|---|
| **Immediate** | `api` process, inside the request | Agent turn with a user waiting. The task row is created eagerly, in the same transaction as the user's message, for every turn, including turns with no tool calls. The API holds a normal lease and heartbeats like a worker, so a crashed or redeployed API pod never silently drops a turn. |
| **Background** | `worker` | Escalated turns, inbound SMS turns, post-turn jobs, API-submitted tasks. `run_at = now()`. |
| **Scheduled** | `worker` | `run_at` in the future (follow-ups, reminders) or materialized from a `schedules` row (recurring jobs, §9.12). |

Escalation (§9.14) means handing over the lease: the API sets the row from `running` (owner `api:…`) to `queued` (or `waiting`) in one transaction, and a worker continues from the journal. Escalation happens only at a step boundary. A step that has *completed* is never re-run, and a step with side effects (`internal_write`, `external_*`) is never interrupted. The only work that can be repeated is a `pure` step the API aborted at the turn time limit (§9.14 step 3b), and repeating it is safe by definition.

Choice: create the task row at the start of every inline turn (eager), not at the first tool call (lazy).
Why: the brief requires that tasks "survive temporary failures". With a lazy row, the most common turn (a plain answer, no tools) has no lease, so an OOM-kill or a deploy during the model call loses the reply unless the client happens to retry. An eager row costs one `INSERT` in a transaction we already open for the user's message, plus one HOT heartbeat `UPDATE` every 15s while the turn runs (a turn lasts ≤ 25s, so ≤ 2 heartbeats).
Alternative: a lazy row plus a sweeper that answers user messages left without a reply.
Why not: a sweeper cannot tell "API still working" from "API died" without a lease, which is exactly what the row provides. It would be a second, weaker recovery path.

Choice: Postgres-backed queue (`FOR UPDATE SKIP LOCKED`) with our own runner and step journal.
Why: queue state, task state and domain writes commit in one transaction (enqueue a follow-up atomically with the `followups` row; complete a step atomically with the lead it created). There is one source of truth and nothing is lost when Redis evicts keys. The runner is about 1.5k LOC and testable with testcontainers.
Alternative: Procrastinate (Postgres-based Python queue); Celery/Arq on Redis; Temporal.
Why not: Procrastinate solves claim and retry but not step journaling, waiting states, fencing or side-effect ledgers, which are the hard 80% here. We would build those on top and also inherit its schema. Celery/Arq put durable state in Redis, which §1 forbids, and Celery is sync-first. Temporal gives durable workflows but adds a cluster (server, its own DB, UI) to run on Arvan. Revisit Temporal if task graphs become long-lived and branching (fan-in, sagas).

Choice: the same runner and lease protocol in `api` (immediate) and `worker` (background).
Why: an inline turn that crashes, times out or needs a wait becomes a background task without a second code path. A crashed API pod's turn is reaped and finished by a worker.
Alternative: the API always enqueues and waits on the worker, or inline turns use a separate non-durable path.
Why not: always enqueueing adds queue latency and a cross-process stream to every chat turn. A separate inline path duplicates the turn loop and loses steps on crash.

### 9.2 Data model

All tables use ULID text ids (`task_…`), `timestamptz` and `snake_case`, as in §17. Status values are `text` + `CHECK`, not enums, so adding a value is a simple migration.

```sql
CREATE TABLE tasks (
  id                  text PRIMARY KEY,
  kind                text NOT NULL,                 -- 'agent.run', 'followup.send', ...
  kind_version        smallint NOT NULL DEFAULT 1,   -- input/state schema version
  lane                smallint NOT NULL,             -- 0 interactive, 1 customer, 2 default, 3 bulk
  mode                text NOT NULL CHECK (mode IN ('immediate','background','scheduled')),
  status              text NOT NULL CHECK (status IN
                        ('queued','running','waiting','succeeded','failed','cancelled','dead')),
  run_at              timestamptz NOT NULL DEFAULT now(),  -- earliest claim time; 'infinity' = no timer
  deadline_at         timestamptz,                   -- stale work is not done (§9.9); NULL while waiting if active_deadline set
  active_deadline     interval,                      -- set: deadline counts active time only, re-armed on every wake (§9.9)
                                                     -- NULL: deadline_at is absolute and waits never extend it
  -- lease / fencing
  lease_owner         text,                          -- 'worker:<host>:<pid>:<slot>' | 'api:<host>:<pid>'
  lease_token         bigint NOT NULL DEFAULT 0,     -- incremented on every claim; fences all writes
  lease_until         timestamptz,
  heartbeat_at        timestamptz,
  -- failure accounting (§9.8, §9.13)
  attempt             int NOT NULL DEFAULT 0,        -- number of claims (informational)
  consecutive_failures int NOT NULL DEFAULT 0,       -- reset when a step succeeds
  expiries_since_progress int NOT NULL DEFAULT 0,    -- lease expiries since last successful step
  total_failures      int NOT NULL DEFAULT 0,
  max_consecutive_failures int NOT NULL DEFAULT 5,
  max_total_failures  int NOT NULL DEFAULT 20,
  generation          int NOT NULL DEFAULT 0,        -- current journal generation; bumped by admin rewind (§9.13)
  -- waiting
  wait_kind           text CHECK (wait_kind IN ('approval','human','time')),
  wait_ref            text,                          -- 'approval:<id>' | 'handoff:<id>' | 'user:<id>' | 'conversation:<id>'
                                                     -- | 'side_effect:<idempotency_key>' (unknown outcome, §9.7)
  -- control
  cancel_requested    boolean NOT NULL DEFAULT false,
  cancel_reason       text,
  concurrency_key     text,                          -- e.g. 'conv:<id>': max one running per key
  dedupe_key          text UNIQUE,                   -- permanent: schedule slot, API Idempotency-Key, SMS msg id
  coalesce_key        text,                          -- collapses not-yet-started duplicates
  emit_events         boolean NOT NULL DEFAULT true, -- false for fan-out children (campaign sends)
  parent_task_id      text REFERENCES tasks(id) ON DELETE CASCADE,  -- children are pruned/erased with their root
  schedule_id         text REFERENCES schedules(id) ON DELETE SET NULL,
  -- scope (server-bound, never model-supplied; §6)
  conversation_id     text REFERENCES conversations(id),
  customer_id         text REFERENCES customers(id),
  lead_id             text REFERENCES leads(id),
  reply_to            jsonb,                         -- {"channel":"web|sms|api","conversation_id":…,"in_reply_to":"msg_…"}
  created_by          text NOT NULL,                 -- 'agent:conv_…' | 'api_key:ak_…' | 'user:…' | 'schedule:…' | 'system'
  trace_parent        text,                          -- W3C traceparent of the originating request
  -- payload
  input               jsonb NOT NULL,                -- validated by the kind's Pydantic model; ids, not raw phone numbers
  state               jsonb NOT NULL DEFAULT '{}',   -- {"v":1, "plan":[…], "profile_version":…, …}; ≤ 8 KB (CHECK in repo)
  initial_state       jsonb NOT NULL DEFAULT '{}',   -- copy of state at creation; rewind to step 1 restores it (§9.13)
  progress            jsonb,                         -- {"step_no":7, "label":"در حال بررسی قیمت‌ها"} display-safe
  result              jsonb,
  last_error          jsonb,                         -- {"class":"transient","code":"llm_timeout","msg":…,"step_no":…}
  step_count          int NOT NULL DEFAULT 0,
  cost_estimate       numeric(12,4) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  CHECK ((status = 'running') = (lease_owner IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((status = 'waiting') = (wait_kind IS NOT NULL))
) WITH (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02);

-- claim: ready work per lane, FIFO by run_at
CREATE INDEX tasks_claim      ON tasks (lane, run_at) WHERE status IN ('queued','waiting');
-- reaper / per-kind running counts (tiny: only running rows)
CREATE INDEX tasks_running    ON tasks (kind) WHERE status = 'running';
-- hard guarantee: at most one running task per concurrency key
CREATE UNIQUE INDEX tasks_one_running_per_key ON tasks (concurrency_key)
  WHERE status = 'running' AND concurrency_key IS NOT NULL;
-- coalescing only among never-started tasks (attempt = 0), so requeues never collide
CREATE UNIQUE INDEX tasks_coalesce ON tasks (coalesce_key)
  WHERE status = 'queued' AND attempt = 0 AND coalesce_key IS NOT NULL;
CREATE INDEX tasks_wait_ref   ON tasks (wait_ref) WHERE status = 'waiting';
CREATE INDEX tasks_conv       ON tasks (conversation_id, created_at);
CREATE INDEX tasks_lead       ON tasks (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX tasks_parent     ON tasks (parent_task_id, status) WHERE parent_task_id IS NOT NULL;
CREATE INDEX tasks_finished   ON tasks (finished_at) WHERE status IN ('succeeded','failed','cancelled');
```

Enqueue uses `INSERT … ON CONFLICT (dedupe_key) DO NOTHING` or `ON CONFLICT (coalesce_key) WHERE status = 'queued' AND attempt = 0 AND coalesce_key IS NOT NULL DO NOTHING`, then re-selects the existing row. A kind sets at most one of the two keys, because `ON CONFLICT` takes one arbiter.

`lease_until` and `heartbeat_at` are deliberately in no index and no index predicate, so the heartbeat `UPDATE` is a HOT update: it writes no index entries and causes little bloat.

```sql
CREATE TABLE task_steps (
  task_id         text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  generation      int  NOT NULL,                 -- = tasks.generation when written; resume reads only the current one
  step_no         int  NOT NULL,                 -- dense within a generation, assigned when the step is planned
  parent_step_no  int,                           -- tool_call → the model_call that proposed it
  type            text NOT NULL CHECK (type IN ('model_call','tool_call','signal','wait','deliver','custom')),
  name            text NOT NULL,                 -- tool name | model tier | custom step name
  effect          text NOT NULL CHECK (effect IN ('pure','internal_write','external_idempotent','external_unsafe')),
  status          text NOT NULL CHECK (status IN ('planned','started','succeeded','failed','cancelled','unknown','skipped')),
  idempotency_key text,                          -- §9.7; computed once when planned, copied verbatim on rewind
  tries           smallint NOT NULL DEFAULT 0,   -- in-process tries in the current claim
  input           jsonb,                         -- tool args (scope params included) | context manifest
  output          jsonb,                         -- compact result | model response (text + tool calls)
  state_after     jsonb,                         -- tasks.state as written by this step's completion txn (rewind, §9.13)
  error           jsonb,
  lease_token     bigint NOT NULL,               -- token of the claim that last wrote the row
  tokens_in int, tokens_out int, cost_estimate numeric(12,4),
  started_at timestamptz, finished_at timestamptz,
  PRIMARY KEY (task_id, generation, step_no)
);

CREATE TABLE task_events (            -- append-only transition log, same txn as each transition
  id bigserial PRIMARY KEY, task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(), from_status text, to_status text NOT NULL,
  reason text NOT NULL,               -- 'claimed','lease_expired','retry','escalated','approval_resolved',…
  actor text, lease_token bigint, details jsonb);

CREATE TABLE task_signals (           -- inputs delivered to a task at its next step boundary
  id text PRIMARY KEY, task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note','human_reply','customer_reply','resume')),
  payload jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  consumed_generation int, consumed_step_no int);  -- NULL until journaled as a 'signal' step
CREATE INDEX task_signals_pending ON task_signals (task_id) WHERE consumed_step_no IS NULL;

CREATE TABLE side_effects (           -- ledger for external calls (§9.7)
  idempotency_key text PRIMARY KEY, task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  generation int NOT NULL, step_no int NOT NULL, kind text NOT NULL,  -- 'sms.send', 'http.post', …
  request_hash text NOT NULL,                        -- sha256 of canonical args incl. scope params
  status text NOT NULL CHECK (status IN ('pending','succeeded','failed','unknown')),
  provider_ref text, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE schedules (              -- recurring jobs (§9.12); synced from code by the release job; create before tasks (FK)
  id text PRIMARY KEY,                -- 'kb.rescan', 'tasks.prune', …
  kind text NOT NULL, input jsonb NOT NULL DEFAULT '{}', lane smallint NOT NULL,
  cron text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Tehran',
  misfire text NOT NULL DEFAULT 'coalesce' CHECK (misfire IN ('coalesce','skip')),
  overlap text NOT NULL DEFAULT 'skip'     CHECK (overlap IN ('skip','allow')),
  enabled boolean NOT NULL DEFAULT true, def_hash text NOT NULL,
  synced_build int NOT NULL,          -- build of the release job that last synced this row (audit only, §9.12)
  removed_at timestamptz,             -- set when the id disappears from code; row kept for history
  next_run_at timestamptz NOT NULL, last_slot_at timestamptz, last_task_id text,
  consecutive_skips int NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX schedules_due ON schedules (next_run_at) WHERE enabled;

CREATE TABLE worker_registry (        -- which kind@versions each live process can run (§9.4 unclaimable sweep)
  process_id text PRIMARY KEY,        -- 'worker:<host>:<pid>' | 'api:<host>:<pid>'
  build int NOT NULL, lanes smallint[] NOT NULL, kinds text[] NOT NULL,   -- {'agent.run@1','agent.run@2',…}
  started_at timestamptz NOT NULL, last_seen timestamptz NOT NULL);       -- upserted with the reaper tick (15s)
```

Columns added to existing tables: `approvals(+task_id REFERENCES tasks ON DELETE SET NULL, +step_no, +expires_at, status += 'expired')`; `messages(+task_id NULL REFERENCES tasks ON DELETE SET NULL, +seq bigint NOT NULL, UNIQUE (conversation_id, seq))` (messages are kept 12 months, task rows 90 days, so the reference must survive pruning); `conversations(+msg_seq bigint NOT NULL DEFAULT 0, +last_user_seq bigint NOT NULL DEFAULT 0, +answered_through_seq bigint NOT NULL DEFAULT 0)`; `webhook_deliveries(+next_attempt_at, +lease_until, +lease_token)`; unique `messages(conversation_id, channel_msg_id)` for `client_msg_id` / provider message dedupe.

Message sequencing is one rule for every message row, user or assistant (reply, ack, fallback template), always under the conversation row lock: `seq := msg_seq + 1; UPDATE conversations SET msg_seq = seq`. A *user* message additionally sets `last_user_seq = seq`; an assistant message never touches `last_user_seq`. So `seq` is dense over all messages of a conversation, `last_user_seq` is the `seq` of the newest user message (seqs between user messages belong to assistant messages), and `answered_through_seq` is the highest user-message `seq` that a **delivered** assistant reply has taken into account. Every gate comparison (`last_user_seq > seen_through_seq`) is between user-message seqs and is therefore never triggered by the bot's own messages. The "no message left unanswered" invariant of §9.14 is stated on these columns.

### 9.3 State machine

```
             ┌──────────── cancel (API) ─────────────┐
             │                                       ▼
 INSERT ─▶ queued ──claim──▶ running ──────────▶ succeeded | failed | cancelled | dead
   │          ▲  ▲             │  │                                   (failed, dead) ──admin retry──▶ queued
   │          │  └retry/release┘  │
   └─(inline)─┼──▶ running        └─wait─▶ waiting ──signal──▶ queued
              │                             │  └─timer/deadline/customer-reply claim─▶ running
              └──────────────────────────── └─cancel (API)─▶ cancelled

 (queued | waiting) ──unclaimable sweep (§9.4)──▶ failed
 running ──lease expired + cancel_requested (reaper)──▶ cancelled
```

Allowed transitions. Every other transition is rejected by code (`TaskStore.transition()` uses `WHERE status = ANY(:from)`) and by a DB trigger:

| # | From → To | Trigger | Side effects in the same txn |
|---|---|---|---|
| 1 | *(insert)* → `queued` | enqueue | `task.created` if `emit_events` and mode ≠ immediate; `NOTIFY task_ready` |
| 2 | *(insert)* → `running` | inline turn start, same txn as the user message (owner `api:…`) | none (immediate tasks are internal until escalated) |
| 3 | `queued` → `running` | claim | `attempt+1`, `lease_token+1` |
| 4 | `queued` → `cancelled` | cancel API | `task.cancelled`; child cascade (§9.10) |
| 5 | `running` → `succeeded` | handler done | `result`, `finished_at`; `task.completed` (+ `message.sent` if a reply was posted) |
| 6 | `running` → `failed` | permanent error, deadline, budget | `task.failed`; if the kind declares `on_failure`: INSERT its `task.fallback` task (§9.13). The hook itself never runs inside this txn |
| 7 | `running` → `cancelled` | cancel observed at a step boundary, or reaper finds an expired lease with `cancel_requested` (§9.4) | `task.cancelled`; child cascade again (catches children committed by the last step); no fallback |
| 8 | `running` → `queued` | retryable error (backoff), graceful release, lease expiry (reaper), escalation from API | counters per §9.8; lease cleared |
| 9 | `running` → `waiting` | step requests approval/human/time wait | a `wait` step is journaled (§9.14 uses it to reset the replan cap); `wait_kind`, `wait_ref`, `run_at` = wake time or wait deadline or `'infinity'`; `deadline_at = NULL` if `active_deadline` is set, else `run_at` clamped to `deadline_at`; `lane = GREATEST(lane, 1)` (no user is blocked on a waiting task); if `mode='immediate'`: escalation fields (§9.14) |
| 10 | `running` → `dead` | failure limits reached (§9.13), by the runner or the reaper | `task.failed` with `data.terminal_status = "dead"`; `task.fallback` task as in row 6; alert |
| 11 | `waiting` → `queued` | signal: approval decided, staff reply, resume API | `run_at = now()`, wait cleared, deadline re-armed |
| 12 | `waiting` → `running` | claim at `run_at` (timer fired or wait deadline) or API claim on customer reply | wake reason recorded in `task_events`; deadline re-armed |
| 13 | `waiting` → `cancelled` | cancel API, parent cascade, schedule removal | `wait_kind = NULL`; pending approval → `expired`; `task.cancelled`; child cascade |
| 14 | `failed`/`dead` → `queued` | `POST /v1/tasks/{id}/retry` (admin) | counters reset; optional rewind (§9.13) |
| 15 | `queued`/`waiting` → `failed` | unclaimable sweep: no live process supports `kind@version` (§9.4) | `wait_kind = NULL`, `finished_at`; `last_error.code = unsupported_kind_version`; `task.failed`; `task.fallback` as in row 6; alert |

Every transition out of `running` clears `lease_owner`/`lease_until` (required by the `CHECK`), and every transition out of `waiting` clears `wait_kind`. "Deadline re-armed" means `deadline_at = CASE WHEN active_deadline IS NOT NULL THEN now() + active_deadline ELSE deadline_at END`; the claim statement (§9.4) and the wake `UPDATE`s (§9.11) include that expression. Lane follows "is a web user blocked on this right now": entering `waiting` sets `lane = GREATEST(lane, 1)`, and every API claim (ADOPT or customer-reply wake, §9.14) sets `lane = 0`, because the API only claims when a web user has just written and is holding a stream open. So a resumed web turn that escalates again stays in lane 0 (§9.14 3b), and the interactive lane holds exactly the work a user is blocked on. `succeeded` and `cancelled` are final. On insert, `CHECK (status IN ('queued','running'))` is enforced by the repository.

```sql
CREATE FUNCTION tasks_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status AND (OLD.status, NEW.status) NOT IN (
     ('queued','running'),('queued','cancelled'),
     ('running','succeeded'),('running','failed'),('running','cancelled'),
     ('running','queued'),('running','waiting'),('running','dead'),
     ('waiting','queued'),('waiting','running'),('waiting','cancelled'),
     ('queued','failed'),('waiting','failed'),
     ('failed','queued'),('dead','queued')) THEN
    RAISE EXCEPTION 'illegal task transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- normalization: the two CHECKs can never be broken by a transition that forgot a column
  IF NEW.status <> 'waiting' THEN NEW.wait_kind := NULL; END IF;          -- wait_ref kept (read on wake)
  IF NEW.status <> 'running' THEN NEW.lease_owner := NULL; NEW.lease_until := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_guard BEFORE UPDATE OF status ON tasks FOR EACH ROW EXECUTE FUNCTION tasks_guard();
```

Row `CHECK`s are evaluated after `BEFORE` row triggers, so the normalization runs first. It is a backstop, not the contract: every transition statement in this section still clears `wait_kind` and the lease columns explicitly, and a test asserts that each statement works with the normalization block removed. Without the backstop, a single statement that forgets `wait_kind = NULL` fails as a whole: a campaign cancel during quiet hours would roll back, and a reaper batch containing such a row would fail every tick (§9.4 has a second guard against that).

Choice: one `waiting` status with `wait_kind` (`approval|human|time`), always claimable at `run_at`.
Why: a single claim path covers timers (`run_at` = wake time), wait deadlines (`run_at` = approval expiry) and indefinite waits (`run_at = 'infinity'`). No sweeper per wait type is needed, and the API still shows the wait kind.
Alternative: three statuses (`waiting_approval|waiting_time|waiting_human`) plus a deadline sweeper.
Why not: three statuses triple the transition table, every claim and dashboard query must list all of them, and a separate deadline sweeper is one more loop that can be wrong.

### 9.4 Claiming, leases, heartbeats, fencing, reaping

**Claim** (one row per statement, per lane, lanes tried in the slot type's claim order; §9.5):

```sql
WITH c AS (
  SELECT t.id, t.status AS prev_status
  FROM tasks t
  WHERE t.lane = $1
    AND t.status IN ('queued','waiting')
    AND t.run_at <= now()
    AND t.kind || '@' || t.kind_version = ANY($2)   -- only kinds/versions this binary supports
    AND t.kind <> ALL($3)                           -- kinds at their global cap (computed per poll)
    AND (t.concurrency_key IS NULL OR NOT EXISTS (
          SELECT 1 FROM tasks r WHERE r.concurrency_key = t.concurrency_key AND r.status = 'running'))
  ORDER BY t.run_at, t.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE tasks t
SET status = 'running', lease_owner = $4, lease_token = t.lease_token + 1,
    lease_until = now() + make_interval(secs => 60), heartbeat_at = now(),
    attempt = t.attempt + 1, started_at = coalesce(t.started_at, now()),
    deadline_at = CASE WHEN c.prev_status = 'waiting' AND t.active_deadline IS NOT NULL
                       THEN now() + t.active_deadline ELSE t.deadline_at END,
    wait_kind = NULL, updated_at = now()            -- wait_ref kept: handler reads it on wake
FROM c WHERE t.id = c.id
RETURNING t.*, c.prev_status;                       -- prev_status='waiting' ⇒ timer/deadline wake
```

- The `NOT EXISTS` check is a fast path only. Two claimers racing on the same key are stopped by the `tasks_one_running_per_key` unique index: the loser gets `23505`, rolls back, and polls again (at most 3 immediate retries, then the normal poll interval).
- Filtering on `kind@version` means that during a rolling deploy an old worker never claims a task kind it doesn't know (it would otherwise dead-letter it). Handlers must accept every `kind_version` they declare. A task that *no* live process supports is caught by the unclaimable sweep below, not left queued.
- Per-kind global caps (e.g. `kb.ingest` ≤ 2) come from `SELECT kind FROM tasks WHERE status='running' AND kind = ANY(:capped) GROUP BY kind HAVING count(*) >= cap`. This is a soft cap: it can be exceeded by at most the number of simultaneous claimers. That is acceptable because hard limits that protect providers are Redis token buckets.
- Wake-up: enqueue runs `SELECT pg_notify('task_ready', '<lane>')` in its transaction (delivered on commit; `NOTIFY` in this document means `pg_notify`). Each worker `LISTEN`s on one dedicated raw asyncpg connection. Polling is the fallback: idle slots poll every 1s (interactive, customer), 2s (default) or 5s (bulk). A lost notification only costs latency. If PgBouncer in transaction mode is added later, the LISTEN connection must bypass it.

**Heartbeat**. Every 15s, on a separate 2-connection pool so a saturated main pool cannot starve it:

```sql
UPDATE tasks SET lease_until = now() + interval '60 seconds', heartbeat_at = now()
WHERE id = $1 AND lease_token = $2 AND status = 'running'
RETURNING cancel_requested;
```

0 rows means the lease is lost. The runner cancels the local coroutine at once and writes nothing more. `true` means cancel was requested (§9.10). CPU-heavy work (PDF/DOCX extraction) runs in a process pool, never on the event loop, so heartbeats are not delayed by our own code.

**Fencing**. Every write the runner makes is conditional on its token:
- Step start: `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM tasks WHERE id=$id AND lease_token=$tok AND status='running')`.
- Step completion and transitions start with `SELECT 1 FROM tasks WHERE id=$id AND lease_token=$tok AND status='running' FOR UPDATE`.

0 rows raises `LeaseLost`, the transaction rolls back and the runner stops. A worker that stalled (GC pause, VM freeze, network partition) and woke after being reaped can therefore never commit a step, a transition or an internal side effect. External calls are covered separately in §9.7.

**Reaper**. Every 15s in every worker replica; `SKIP LOCKED` makes concurrent reapers safe, so there is no leader election. It is one statement (data-modifying CTEs touch disjoint rows, so this is legal in Postgres):

```sql
WITH x AS (
  SELECT id, mode AS old_mode, cancel_requested AS to_cancel,
         NOT cancel_requested AND (consecutive_failures + 1 >= max_consecutive_failures
              OR total_failures + 1 >= max_total_failures
              OR expiries_since_progress + 1 >= 3) AS to_dead
  FROM tasks WHERE status = 'running' AND lease_until < now()
  ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED
), u AS (
  UPDATE tasks t SET
    consecutive_failures    = t.consecutive_failures + 1,
    expiries_since_progress = t.expiries_since_progress + 1,
    total_failures          = t.total_failures + 1,
    status      = CASE WHEN x.to_cancel THEN 'cancelled' WHEN x.to_dead THEN 'dead' ELSE 'queued' END,
    run_at      = CASE WHEN x.to_cancel OR x.to_dead THEN t.run_at
                       ELSE now() + backoff_interval(t.lane, t.consecutive_failures + 1) END,  -- §9.8
    finished_at = CASE WHEN x.to_cancel OR x.to_dead THEN now() END,
    result      = CASE WHEN x.to_cancel THEN jsonb_build_object('effects_completed',
                    (SELECT coalesce(jsonb_agg(jsonb_build_object('step_no',s.step_no,'kind',s.kind,
                            'provider_ref',s.provider_ref)), '[]') FROM side_effects s
                      WHERE s.task_id = t.id AND s.status = 'succeeded')) ELSE t.result END,
    lease_owner = NULL, lease_until = NULL,
    mode            = CASE WHEN t.mode = 'immediate' AND NOT (x.to_cancel OR x.to_dead)
                           THEN 'background' ELSE t.mode END,                       -- crashed API turn
    last_error  = jsonb_build_object('class','lease_expired','owner',t.lease_owner,'token',t.lease_token),
    updated_at  = now()
  FROM x WHERE t.id = x.id
  RETURNING t.id, t.status, t.kind, t.generation, t.emit_events, t.conversation_id,
            t.customer_id, t.lead_id, t.reply_to,
            (x.old_mode = 'immediate' AND t.status = 'queued') AS became_bg     -- RETURNING sees new values
), ev AS (
  INSERT INTO task_events (task_id, from_status, to_status, reason)
  SELECT id, 'running', status, CASE status WHEN 'cancelled' THEN 'cancel_on_expiry' ELSE 'lease_expired' END FROM u
), se AS (            -- a cancelled task never resumes, so a send it left 'pending' is never reconciled by a runner
  UPDATE side_effects s SET status = 'unknown', updated_at = now()
  FROM u WHERE s.task_id = u.id AND u.status = 'cancelled' AND s.status = 'pending'
  RETURNING s.task_id                                                    -- count → side_effects_total{status="unknown"} → page
), kids AS (          -- child cascade (§9.10) for tasks cancelled here
  UPDATE tasks c SET status = 'cancelled', cancel_reason = 'parent_cancelled', wait_kind = NULL,
                     finished_at = now(), updated_at = now()
  FROM u WHERE c.parent_task_id = u.id AND u.status = 'cancelled' AND c.status IN ('queued','waiting')
), fb AS (            -- the on_failure hook is a task, never inline code (§9.13)
  INSERT INTO tasks (id, kind, lane, mode, status, dedupe_key, concurrency_key, conversation_id,
                     customer_id, lead_id, reply_to, created_by, input, deadline_at)
  SELECT aromin_ulid('task'), 'task.fallback', 1, 'background', 'queued',
         'fallback:' || u.id || ':' || u.generation,
         'conv:' || u.conversation_id,                  -- NULL when no conversation; serialized with agent turns (§9.13)
         u.conversation_id, u.customer_id, u.lead_id,
         u.reply_to, 'system', jsonb_build_object('failed_task_id', u.id, 'terminal_status', 'dead'),
         now() + interval '24 hours'
  FROM u WHERE u.status = 'dead' AND u.kind = ANY($1)                   -- $1 = kinds that declare on_failure
  ON CONFLICT (dedupe_key) DO NOTHING
)
INSERT INTO events_outbox (…)                                            -- §10
SELECT … FROM u WHERE u.emit_events AND u.status IN ('dead','cancelled') -- task.failed{terminal_status:dead} | task.cancelled
UNION ALL SELECT … FROM u WHERE u.status = 'queued' AND u.became_bg;     -- task.created for reaped immediate turns
-- then: SELECT pg_notify('task_ready', '1') if fb inserted rows (in the same txn, delivered on commit)
```

A cancelled task is never requeued or dead-lettered by the reaper: an expired lease with `cancel_requested = true` goes straight to `cancelled` (row 7), with no fallback, no dead alert and no backoff. `$1` exists because `on_failure` is declared data (`FallbackSpec`, §9.15), not arbitrary Python, so SQL can act on it without loading the handler. `aromin_ulid(prefix)` is the plpgsql ULID generator also used by migrations.

**Reaper error isolation.** The batch statement is all-or-nothing, and `x` picks rows `ORDER BY lease_until`, so one row that makes it fail would be picked again on every tick and stop crash recovery for every task. Therefore: on any error the reaper rolls back, increments `aromin_reaper_errors_total`, logs the error with the batch's ids, and re-runs the same statement with `LIMIT 1` and `AND id <> ALL($quarantine)` once per id in the batch, one transaction each. Ids that fail alone are added to an in-memory quarantine list for 10 minutes (per process), so healthy rows behind them keep being reaped. Alert: `increase(reaper_errors_total[5m]) > 0` pages. The cause is always a bug (a constraint the statement violates), and the alert names the task.

**Unclaimable sweep** (same 15s loop, `LIMIT 100 FOR UPDATE SKIP LOCKED`). Because the claim filters on `kind@version`, a task whose kind or version no binary supports would otherwise sit in `queued`/`waiting` forever. Every process upserts its row in `worker_registry` (`kinds` = every `kind@version` string its binary supports, regardless of the lanes it serves) on the same tick. A whole lane with no live worker (e.g. `worker-bulk` crash-looping) is therefore a capacity problem caught by the lag and liveness alerts (§9.16), never mistaken for a version problem. The sweep fails tasks with `status IN ('queued','waiting') AND run_at <= now() - interval '15 minutes'` whose `kind || '@' || kind_version` is in no `kinds` array of a registry row with `last_seen > now() - interval '2 minutes'` (transition 15, `SET status='failed', wait_kind=NULL, finished_at=now(), …`, `unsupported_kind_version`, fallback as in row 6). The 15-minute grace covers a rolling deploy, where for a moment only the old or only the new binary is live; registry rows older than 1 day are deleted. A queued row that is not yet due (a follow-up in 2 weeks) is not failed early, but the deploy guard below normally prevents that case from arising at all.

**Version retirement guard**: a release may drop `kind@version` from `supported_versions` only when `SELECT count(*) FROM tasks WHERE kind = $k AND kind_version = $v AND status IN ('queued','running','waiting')` is 0. The check runs in the release pipeline against production (read-only) and blocks the deploy; the sweep is the backstop for anything that slipped through.

The values are 60s lease, 15s heartbeat and 15s reaper period, so a dead owner is detected within 60–75s, after 4 missed heartbeats. The lease is not tied to step length because the heartbeat is independent of the step.

Choice: short leases + heartbeat + monotonically increasing fencing token; no lock held during execution.
Why: work takes seconds to minutes (LLM calls, provider HTTP). Holding a row lock or open transaction that long pins a connection per task, blocks vacuum and dies with the connection. The fencing token makes "two workers think they own it" harmless for everything inside Postgres.
Alternative: keep the `FOR UPDATE` transaction open for the whole job, or session-level advisory locks.
Why not: connection-per-task caps concurrency at pool size, and advisory locks are released when the connection drops while the code keeps running. Neither fences a stalled process.

### 9.5 Lanes, priorities, fairness

| Lane | Rank | Kinds (examples) | Main `worker` slots | `worker-bulk` slots |
|---|---|---|---|---|
| `interactive` | 0 | `agent.run` with a web user waiting, resumes of those | 4 | — |
| `customer` | 1 | inbound SMS turns, `task.fallback`, `followup.send`, `handoff.notify`, `lead.route` | 8 | — |
| `default` | 2 | `memory.extract`, `summary.refresh`, `lead.score` | 4 | — |
| `bulk` | 3 | `kb.ingest`, `kb.rescan`, `sms.campaign(_send)`, `tasks.prune` | 0 | 2 |

Rules:
1. **Each customer-facing lane owns a floor; spare capacity is lent only toward more urgent work.** Claim order per slot type, tried lane by lane (one claim statement per lane, §9.4):

   | Slot type | Claim order | Can never take |
   |---|---|---|
   | `interactive` (4) | lane 0 | lanes 1–3 |
   | `customer` (8) | lane 1, then lane 0 | lanes 2–3 |
   | `default` (4) | lane 0, then lane 1, then lane 2 | lane 3 |
   | `bulk` (2, `worker-bulk` only) | lane 3 | lanes 0–2 |

   The customer slot tries its *own* lane first, but own-lane-first alone is not a reserve: at a quiet moment idle customer slots would pick up 10-minute web turns and be busy when an SMS arrives. Hence the **inbound reserve** (local and exact): a customer slot may claim lane-0 work or an *outbound* lane-1 kind (`followup.send`, `handoff.notify`, `lead.route`) only if, after that claim, at least 2 of the replica's 8 customer slots are idle or running inbound work (an SMS `agent.run` or a `task.fallback`). The slot counts live in the worker process, and the check plus claim run under one per-replica `asyncio.Lock`, so the reserve can never be undercut; when it is at its minimum, the slot passes the outbound kinds in `$3` and skips the lane-0 attempt. A burst of web turns therefore gets the 4 interactive slots, the 4 default slots and at most 6 customer slots; a customer who just texted always finds a slot within one poll. A burst in lane 1 can never take the 4 interactive slots. Per main `worker` replica: lane 0 has a floor of 4 and a ceiling of 14, lane 1 a floor of 8 (2 of them reserved for inbound work) and a ceiling of 12, lane 2 a floor of 0 and a ceiling of 4 (it is not customer-facing, and its lag alert, §9.16, catches starvation), lane 3 exactly 2 in `worker-bulk`. The slot type is a property of the slot in code, and `--lanes` only selects which slot types a container starts.
2. **Bulk runs in a separate container** (`worker --lanes bulk`, same image). Memory-heavy ingestion that OOMs cannot take customer tasks down with it.
3. **Within a lane: FIFO by `run_at`.** There is no numeric priority. The index `(lane, run_at)` serves the claim exactly.
4. **One kind cannot flood a lane**: per-kind global caps (§9.4) plus Redis token buckets for shared providers. Inside the customer lane, *outbound* kinds are capped so that *inbound* (a customer who just wrote) always has slots: `followup.send` ≤ 3 running, `handoff.notify` + `lead.route` ≤ 2 together (global caps), inbound SMS `agent.run` and `task.fallback` uncapped. The global caps keep one outbound kind from crowding the others; the per-replica inbound reserve (rule 1) is what guarantees customers who just wrote a slot, whatever lane 0 and the outbound kinds are doing. The claim skips capped kinds (`kind <> ALL($3)`), so a FIFO head of 600 due follow-ups does not block the inbound turn behind it: once 3 follow-ups run, the next free slot claims the inbound turn (the index scan steps over the capped rows; a few hundred rows cost well under 1 ms). The SMS provider budget has three buckets: replies in a live conversation ≥ 40% reserved, `followup.send` ≤ 30%, bulk (`sms.campaign_send`) ≤ 30%; an unused share is borrowable only by a higher-priority class (bulk never borrows the reply share). The LLM limiter reserves ≥ 50% of request rate for lanes 0–1.
   **Wake-up spreading**: a wake time computed by policy (quiet hours end at 09:00, business-hours start) gets a deterministic offset `hash(task_id) mod 1800 s`, so 600 follow-ups held overnight become due over 09:00–09:30 instead of all at 09:00:00. Waits for a specific instant chosen by the model or user ("remind me at 14:00") are not spread.
5. **One turn owner per conversation**: every `agent.run`, inline ones included, and every `task.fallback` carries `concurrency_key = 'conv:<id>'`, so at most one of them (API- or worker-hosted) is `running` for a conversation at any instant, and only that task can post an assistant message there. A new customer message never starts a second, parallel turn: it is attached to the running owner, or it adopts the conversation's open task, or it starts a new turn (exact protocol in §9.14). Before any reply is committed, the owner checks for user messages it has not seen and re-plans instead of answering a stale question (the *deliver gate*, §9.14). Domain uniqueness (one open lead per conversation, one open handoff) remains as a backstop; a unique violation inside a tool becomes a `tool_error`, never a task failure (§9.6).

Choice: four lanes; customer-facing lanes have reserved floors (own lane first), spare slots are lent only toward more urgent lanes; FIFO inside a lane.
Why: neither customer-facing lane can be starved by any other lane or by a burst of one kind: lane 0 has 4 slots lane 1 can never take, lane 1 has 2 per replica that neither web turns nor outbound kinds can take (inbound reserve), and bulk runs in its own container. A burst of 20,000 campaign sends only lengthens the bulk lane; a promo burst of 40 web turns lengthens lane 0 (its lag alert pages at 10 s and triggers scaling, §9.17) while inbound SMS turns keep their reserve. FIFO is fair and fully index-supported.
Alternative: one queue ordered by an integer `priority DESC, run_at`.
Why not: strict priority starves low priorities, and aging needs a query the index cannot serve. With many future-dated rows (scheduled follow-ups, approval deadlines) an index on `(priority, run_at)` scans rows that are not ready. A burst at equal priority still starves everything else at that priority.

Choice: serialize all agent turns of a conversation (one owner, new messages attach to it), rather than letting an inline turn run beside a background task.
Why: two concurrent turns produce two replies, each blind to the other's input (customer asks for a 3-branch quote, then adds "with the SMS module?"; the inline turn answers from partial state, then the background task posts a quote that ignores the follow-up). Serializing plus the deliver gate gives one reply that covers every message the owner has seen. The cost is latency: a message attached to a running owner is answered at the owner's next step boundary, bounded by the longest step timeout (model call 60s) plus the reply itself. The widget shows the owner's progress label meanwhile, so the customer is not left with silence.
Alternative: inline turns bypass the key (customer never waits behind a background task), and the two coordinate through `task.add_note`; or a new message cancels the running task and starts over.
Why not: coordination through notes depends on the model choosing to call a tool, so the double reply is the default outcome, not the exception. Cancel-and-restart discards completed work, repeats token spend, and, if the cancelled task was mid-`sms.send`, still leaves a send in flight; a customer who sends three quick messages would restart the work three times.

### 9.6 Step journal and crash resume

The journal is write-ahead: a step is recorded before it runs and completed after, so on resume the runner knows exactly which step is unfinished.

**Step protocol** (runner, per step):

```
1. txn (fenced): INSERT/UPDATE task_steps SET status='started', tries=tries+1, started_at=now()
                 [external steps: also INSERT side_effects(status='pending') — §9.7]
2. execute with timeout (no DB transaction open, except internal_write: see 3)
3. txn (fenced, task row FOR UPDATE):
     internal_write → SAVEPOINT tool; run the tool's DB writes on THIS session
                      (integrity error → ROLLBACK TO SAVEPOINT tool; result = tool_error, see below)
     UPDATE task_steps SET status='succeeded', output=…, state_after=<new state>, finished_at=now()
     model_call     → INSERT the proposed tool calls as 'planned' steps (step_no assigned here)
     UPDATE tasks SET state=…, progress=…, step_count+=1, consecutive_failures=0,
                      expiries_since_progress=0, cost_estimate+=…
     INSERT events_outbox … (domain events of internal writes)
   COMMIT → PUBLISH progress to Redis 'conv:<id>' (best effort)
```

The §3 step names map as follows: `model_request` + `model_response` become one `model_call` row, and `tool_call` + `tool_result` become one `tool_call` row (input = args, output = result). The model output, including tool-call arguments, is durable before any tool runs. **On resume the model is never re-asked for a decision it already made.** This matters because model output is not deterministic, so re-asking after a crash could give different arguments and duplicate side effects.

**Integrity errors inside `internal_write` tools are tool results, not task failures.** An `internal_write` tool should write idempotently by itself where the domain allows it (`crm.create_lead` = `INSERT … ON CONFLICT (conversation_id) WHERE status = 'open' DO NOTHING` + select, returning the existing lead with `created=false`; this needs the partial unique index `leads(conversation_id) WHERE status = 'open'`, added to §17). Anything that still raises `23505` (unique), `23503` (FK) or `23514` (check) inside the tool's savepoint is rolled back to that savepoint only; the step then completes normally as `succeeded` with output `{ok:false, error_code:"already_exists"|"conflict"|"invalid_reference", constraint:<name>}`, mapped per tool through `ToolSpec.on_integrity_error` (default: that generic mapping). The model sees it as a §3 tool error and moves on; deterministic kinds treat it per their step definition (usually "already done → continue"). Because the outcome is journaled as the step's output, a resume never replays the failing insert. Integrity errors raised by the runner's own writes (journal, fencing, task row) are not caught by this rule: they are bugs (§9.8). Without this rule, a pinned tool call that collides with a concurrent domain write would fail identically on every resume and walk the task into `dead`.

**Resume** (on every claim):

```
steps = SELECT * FROM task_steps WHERE task_id=$1 AND generation=tasks.generation ORDER BY step_no
        -- after a rewind, the current generation holds copies of steps < N (§9.13), so this is the full journal
signals = pending task_signals → journal each as a 'signal' step (consumed_generation/step_no set in same txn)
for s in steps where s.status == 'started':           -- at most one per tool batch, normally one
    recover(s) per table below
for s in steps where s.status == 'cancelled' and not tasks.cancel_requested:
    -- only a pure step aborted at the inline turn limit (§9.14 3b) can be here
    tool_call  → UPDATE status='planned' (same step_no, same pinned args) and run it
    model_call → stays 'cancelled' (audit); next_step appends a fresh model_call
next = handler.next_step(state, steps)                 -- pure function of durable data
```

| Unfinished step (`started`) effect | Action on resume | Why it is safe |
|---|---|---|
| `pure`: `model_call`, `kb.search`, `web.fetch`, `catalog.*`, `customer.get_profile` | Re-execute | No side effect; costs tokens, counted in budget |
| `internal_write`: `crm.*`, `sales.*`, `customer.update_facts`, `followup.schedule`, `quote.draft` | Re-execute | Its writes commit in the same txn as step completion, so `started` proves nothing was written. The effect happens exactly once. |
| `external_idempotent`: provider honors our key | Re-execute with the same `idempotency_key` | Provider dedupes |
| `external_unsafe`: SMS provider without dedupe, any non-idempotent HTTP | Reconcile (§9.7); never blind re-send | At-most-once |

`agent.run.next_step`: if the last `model_call` has `planned` tool steps, run them (independent `pure` ones in parallel). Final step statuses are `succeeded`, `failed`, `skipped` and (for a resumed abort, §9.14 3b) `cancelled`; `unknown` is **not** final and blocks the batch until it is resolved (§9.7 Resolution), and the runner never claims past it because the task is in `waiting(human, 'side_effect:…')`. If all tool steps of the batch are final, build context (task state + compacted tool outputs, §5) and add a new `model_call`. If the model returned a final answer, add a `deliver` step. Deterministic kinds (`followup.send`, `kb.ingest`) have code-defined step lists, e.g. `kb.ingest`: fetch → extract → chunk → embed batch *i* (one step per 64 chunks) → activate version.

**Plan**: multi-step agent tasks keep `state.plan = [{id, goal, status}]`, maintained by the model through the internal tool `task.update_plan` (`internal_write`, ≤ 10 items). The plan feeds §5 slot 3 (≤ 300 tokens) and `progress.label`. It is guidance for the model; the journal remains the source of truth for what has been executed.

Steps never store chain-of-thought: provider "reasoning" fields are dropped before persistence. `model_call.input` stores a context manifest (message ids, chunk ids, slot token counts), not the prompt text.

### 9.7 Idempotency of side effects

**Key**: `idempotency_key = sha256(task_id ‖ generation ‖ step_no)[:32]` (hex), and `request_hash = sha256(canonical_json(args incl. injected scope params))`. The key is computed once, when the step is planned, and stored in `task_steps.idempotency_key`; nothing recomputes it. Because `step_no` is fixed when the model's proposal is persisted, the key is identical across retries, reclaims and process crashes. Steps copied into a new generation by a rewind keep their stored key, so their ledger rows still match; only re-planned steps ≥ N get keys of the new generation. This replaces §3's `hash(task_id, step_no, tool, args)`: args are already pinned by the journal, so hashing them into the key adds nothing, and they are kept in `request_hash` to detect bugs.

| Side effect | Mechanism | Guarantee |
|---|---|---|
| DB writes by tools (lead, signals, stage, facts, follow-up row + its task, approval, handoff) | Same transaction as step completion, fenced (§9.6) | Exactly once |
| Domain events → webhooks | Outbox row in that same transaction (§10) | Exactly-once enqueue, at-least-once delivery |
| Outbound webhooks | `webhook_deliveries` with `UNIQUE(subscription_id, event_id)`, own dispatcher loop with lease + fencing on the delivery row; headers `X-Aromin-Event-Id` (stable) and `X-Aromin-Delivery-Attempt` | At-least-once; receivers dedupe by event id (contract, §10) |
| SMS / external HTTP | `side_effects` ledger + provider dedupe id when supported | Exactly once if provider dedupes, otherwise at most once with human review on unknown outcome |

**External call protocol** (`sms.send`, future CRM writes):

```
step start txn (fenced):
    INSERT INTO side_effects(key, task_id, generation, step_no, kind, request_hash, status) VALUES (…,'pending')
    ON CONFLICT (idempotency_key) DO NOTHING;
    SELECT * FROM side_effects WHERE idempotency_key = key;
row.request_hash ≠ hash   → IdempotencyConflict (permanent; bug) → step failed
row.status = succeeded    → return stored response, no call
row.status = failed       → return stored permanent error, no call
row.status = unknown      → task → waiting(human, 'side_effect:<key>') unless already resolved (see Resolution)
row.status = pending and it existed before this claim   → RECONCILE
row.status = pending, just inserted                     → CALL provider (dedupe id = key if supported)
    2xx                → txn: side_effects=succeeded(provider_ref), step succeeded
    definite 4xx       → txn: side_effects=failed, step failed (tool error to the model / kind)
    pre-send failure (DNS, connect, TLS) or 429 → nothing was sent: in-process retry per §9.8 (same key);
                       if retries run out, the fenced requeue txn DELETEs the 'pending' row (this claim
                       inserted it and every call it made provably never left), so the next claim
                       starts clean instead of reconciling a send that never happened
    read timeout / conn drop / 5xx / garbled reply after send → outcome unknown → RECONCILE

RECONCILE:
    adapter.supports_dedupe      → call again with the same dedupe id (provider returns the original)
    elif adapter.lookup(key) found → mark succeeded
    else                         → one fenced txn: side_effects=unknown, step=unknown, task → waiting(human,
                                   wait_ref='side_effect:<key>', run_at = now() + 4 business hours,
                                   clamped to deadline_at), outbox side_effect.unknown, alert
                                   "SMS outcome unknown" (never auto re-send)
```

**Resolution of an unknown outcome.** `unknown` is a non-final step status: `next_step` never plans past a batch containing an `unknown` step, so the task cannot continue until a person or the expiry decides. The decision is recorded on the ledger, not as a free-text signal:

`POST /v1/side-effects/{idempotency_key}/resolve {outcome: "sent"|"resend"|"abandon", provider_ref?, note}` — roles `admin`, `sales_manager` (§14); the dashboard's "unknown sends" list (`side_effects WHERE status='unknown'`) links each row to the conversation and the provider's delivery report page so staff can check. One txn:

```sql
UPDATE side_effects SET status = CASE $outcome WHEN 'sent' THEN 'succeeded' ELSE 'failed' END,
       provider_ref = coalesce($provider_ref, provider_ref),
       response = jsonb_build_object('resolved_by',$user,'outcome',$outcome,'note',$note), updated_at = now()
 WHERE idempotency_key = $key AND status = 'unknown' RETURNING task_id, generation, step_no;  -- 0 rows → 409
UPDATE task_steps SET status = CASE $outcome WHEN 'sent' THEN 'succeeded' ELSE 'failed' END,
       output = …, error = CASE WHEN $outcome <> 'sent' THEN jsonb_build_object('code','operator_'||$outcome) END
 WHERE (task_id, generation, step_no) = (…) AND status = 'unknown';
UPDATE tasks SET status = 'queued', run_at = now(), wait_kind = NULL, updated_at = now(),
       deadline_at = CASE WHEN active_deadline IS NOT NULL THEN now() + active_deadline ELSE deadline_at END
 WHERE id = $task_id AND status = 'waiting' AND wait_ref = 'side_effect:' || $key;   -- 0 rows if the task is
INSERT INTO audit_log …;  NOTIFY task_ready, '<lane>';                               -- terminal: ledger only
```

On the next claim the step is final, so the loop the old "unknown → wait" rule would create cannot occur. What the kind does with it:

| Outcome | `agent.run` `deliver` step | `followup.send` / `task.fallback` SMS step |
|---|---|---|
| `sent` | step `succeeded` → the normal completion txn (§9.14: assistant message, `answered_through_seq`, successor check) | `succeeded`; follow-up marked `sent` |
| `resend` (staff confirmed it did not arrive) | step `failed(operator_resend)`; `next_step` plans a **new** `deliver` step with the same text (new `step_no` → new key → new ledger row), planned through the pre-send gate (§9.14), so if the customer wrote meanwhile the reply is re-planned first. The ledger shows both rows, and the re-send is attributable to a person | same: a new send step |
| `abandon` | step `failed(operator_abandon)` → task `failed` (`deliver_abandoned`) → `task.fallback` with **handoff only, no SMS** (the fallback skips its SMS step when the failed task's `last_error.code` is in `FallbackSpec.no_sms_codes`, default `{deliver_abandoned, side_effect_unresolved}`), so a salesperson contacts the customer by phone | follow-up marked `failed`; fallback task: handoff only, no SMS |

**Expiry** (no decision within the wait, i.e. the claim wakes with the ledger row still `unknown`): `agent.run` → `failed` with `side_effect_unresolved` → `task.fallback` handoff-only (a human takes over the customer without risking a second SMS); `followup.send` → `failed`, follow-up marked `unknown`, warn alert. The ledger row stays `unknown`, and the resolve endpoint still works on it afterwards (it only updates the ledger and audit once the task is terminal). Cancellation of the waiting task (§9.10) is the third exit. Every exit is therefore defined, and none re-sends without a person's decision.

A not-found lookup is not proof that nothing was sent, because a stalled former lease holder may still send after its lease expired. For providers without dedupe, the design picks at-most-once, since a duplicate SMS to a customer is worse than a delayed one that a human confirms. One tool step makes at most one external call. Notifications caused by internal writes (e.g. handoff → notify salesperson) go through the outbox to their own task.

Choice: transactional internal effects + external ledger keyed by journal position.
Why: most agent side effects are DB writes, and making them atomic with the step record makes them exactly-once without any idempotency logic in each tool. Only true external calls pay for the ledger.
Alternative: idempotency keys on every tool, enforced by each handler; or args-hash keys alone.
Why not: per-handler idempotency is easy to get subtly wrong in each of N tools. Args-hash keys change when a resumed task re-asks the model, which is the duplicate-SMS bug this design exists to prevent.

### 9.8 Errors, retries, backoff

Retries happen at two levels. **In-process**: short retries inside the current claim, per `ToolSpec.retry` (default 3 tries, 0.5s/1s/2s with jitter) and §3's model policy (3 tries, then the secondary model). **Task-level**: when in-process retries are exhausted, the task is requeued with backoff and the slot is freed. Workers never sleep longer than 2s on one task.

| Class | Examples | In-process retry | Task-level | Counts toward dead-letter |
|---|---|---|---|---|
| `transient` | on `pure`/`internal_write`/`external_idempotent` steps: timeout, conn reset, HTTP 408/429/5xx; PG `40001`, `40P01`, `57P01`, `08*`. On `external_unsafe` steps **only pre-send failures**: DNS failure, connect refused/connect timeout, TLS handshake failure (the request was never written), and HTTP 429 (a definite rejection) | yes | requeue, backoff | yes |
| `dependency_unavailable` | circuit breaker open (LLM provider, SMS provider), limiter exhausted >5s, provider 401/403 (our credentials) | no | requeue at breaker half-open time (default +60s) | **no**; bounded by `deadline_at`; pages ops |
| `outcome_unknown` | any failure of an `external_unsafe` call after the first request byte may have been written: read timeout, conn reset/drop, HTTP 5xx (a 502/504 from a gateway says nothing about whether the provider processed it), malformed response | **no** | reconcile (§9.7) | no; alert |
| `tool_error` | tool validation error, not found, policy deny, approval rejected, unique/FK/check violation inside an `internal_write` tool | no | none: returned to the model as a structured result (agent kinds); `failed` for deterministic kinds | no |
| `permanent` | invalid task input, HTTP 400/404/422 from a provider, `IdempotencyConflict`, budget exceeded | no | `failed` | — |
| `unsupported` | `kind@version` that no live process supports (never claimed, so never seen by a runner) | — | unclaimable sweep → `failed` (§9.4) | — |
| `bug` | unhandled exception, including integrity errors from the runner's own writes (an integrity error inside an `internal_write` tool's savepoint is a `tool_error`, §9.6) | no | requeue, backoff (may be flaky) | yes |
| `lease_lost` | fence mismatch | — | abort locally, no write; reaper/new owner handles it | via reaper |

**Rule for `external_unsafe`**: the HTTP adapter tracks whether the request was written to the socket (httpx: the error type distinguishes `ConnectError`/`ConnectTimeout` from `ReadTimeout`/`RemoteProtocolError`). Before that point every failure is `transient`; after it, only a parsed definite response (2xx, 4xx other than 408) is final, and everything else is `outcome_unknown`. The adapter never retries in process after the request has left; the classification lives in the shared adapter, not in each tool, and a contract test feeds it every error type.

A tool failing is not a task failure for agent tasks: the model gets `{ok:false, error_code, message}` and can choose another path (§3). Provider auth errors count as `dependency_unavailable`, not `permanent`, so a rotated API key does not permanently fail every in-flight task.

**Backoff** (task-level, equal jitter, n = `consecutive_failures` after increment):

```
b     = min(cap[lane], base[lane] * 2^(n-1))
delay = b/2 + uniform(0, b/2)
run_at = now() + max(delay, retry_after_header or 0)      -- never beyond deadline_at
base/cap: interactive 2s/30s · customer 15s/10min · default 30s/30min · bulk 60s/2h
```

`backoff_interval(lane, n)` is the same formula as a SQL function so the reaper can use it. Circuit breakers are per process and per dependency: open after 5 consecutive `transient` failures within 30s, half-open after 60s. That is enough because every replica opens its own breaker within seconds.

### 9.9 Timeouts, deadlines, budgets

| Limit | Default | On exceed |
|---|---|---|
| Step timeout | `ToolSpec.timeout_s`; model call 60s; SMS send 10s; webhook 10s | `transient` (pure/idempotent) or `outcome_unknown` (external_unsafe) |
| Inline turn | `max_turn_seconds` 25s, `max_steps` 6 (§3) | escalate to background (§9.14) |
| Task deadline `deadline_at` | **active** (`active_deadline` set): web `agent.run` 10 min, SMS `agent.run` 2 h of running/queued time, re-armed to `now() + active_deadline` on every wake and suspended (`NULL`) while `waiting`. **Absolute** (`active_deadline` NULL): `followup.send` `due_at` + 24h, `sms.campaign(_send)` campaign end; waits never extend it and a wait's `run_at` is clamped to it. Bulk maintenance: none | checked at claim and at every step boundary → `failed` (`deadline_exceeded`) → `task.fallback` if the kind declares one |
| Approval wait | `expires_at` = +24h (policy-configurable) | wake, expire approval, model told "approval expired" |
| Human wait | staff reply: +4h business hours; customer reply: +48h; unknown side-effect review: +4h business hours | staff/customer: wake → kind decides (nudge once, then close / hand off); side effect: §9.7 Expiry (fail → handoff-only fallback) |
| Background agent budget | 20 model calls, 40 tool steps, cost cap per task (config) | `failed` (`budget_exceeded`) → handoff |

The two policies answer different questions. An agent turn's deadline protects against work that keeps *running* or *queuing* while nobody gets an answer; time spent legitimately waiting for an approver (24h), a salesperson (4h) or the customer (48h) is not staleness, so it must not count, otherwise every approval-gated turn would fail on wake. A follow-up's deadline is about the calendar ("a Tuesday follow-up sent on Thursday is wrong"), so waits do count. Each wait has its own expiry (table rows above), which bounds the total lifetime of an active-deadline task: e.g. web turn ≤ 10 min active + 24h approval + 10 min active.

Stale work is not done late. A web reply 3 hours late with no wait in between helps nobody, so `agent.run`'s fallback (a `task.fallback` task, §9.13) posts a fixed Persian template message (not LLM-generated, so it works during an LLM outage) and creates a handoff (§11).

### 9.10 Cancellation

`POST /v1/tasks/{id}/cancel {reason}`, or the agent tool `task.cancel` (scoped to the caller's conversation):

| Status at cancel | Effect |
|---|---|
| `queued`, `waiting` | Same txn: → `cancelled`; linked pending approval → `expired`; child cascade; `task.cancelled`. Returns 200. |
| `running` | Same txn: `cancel_requested = true`, child cascade, `NOTIFY task_cancel, '<id>'`. Returns 202 with `status=running, cancel_requested=true`. |
| `cancelled` | 200 (idempotent) |
| `succeeded`/`failed`/`dead` | 409 `task_finished` |

**Child cascade** (fan-out kinds such as `sms.campaign`; children have `parent_task_id`). One statement pair, served by `tasks_parent (parent_task_id, status)`:

```sql
UPDATE tasks SET status='cancelled', cancel_reason='parent_cancelled', wait_kind=NULL,
       finished_at=now(), updated_at=now()
 WHERE parent_task_id = $1 AND status IN ('queued','waiting');            -- transitions 4/13, no events (emit_events=false)
UPDATE tasks SET cancel_requested = true, updated_at = now()
 WHERE parent_task_id = $1 AND status = 'running';                        -- observed like any cancel
```

Children in `waiting(time)` are the normal case during quiet hours (every `sms.campaign_send` re-checks quiet hours, §9.11), which is why `wait_kind = NULL` is in the statement; the §9.3 trigger normalization is the backstop. 20,000 queued or waiting children are one `UPDATE` of 20k rows (≈ 1 s, row locks only on those rows). A running child is mid-`sms.send`, which is non-cancellable, so it finishes its one send and stops. Children can never outlive a cancellable parent, for two reasons. (1) A fan-out parent does not finish while it has non-terminal children: after inserting the last batch it goes to `waiting(time, run_at = min(now() + 5 min, deadline_at))`, wakes, counts children by status, and either waits again or completes with the aggregate (`sent/failed/skipped`). So a cancel during a campaign always finds the parent `running` or `waiting`, never `succeeded` (no 409). (2) Children are inserted in batches of 1,000, one fenced step per batch, and the step start re-checks `cancel_requested`. A batch committed by the in-flight step after the cancel `UPDATE` is caught by the second cascade at transition 7, which runs after that step's commit. The cascade recurses only one level; there are no grandchildren in the initial kinds.

The running owner observes the cancel through `NOTIFY` (immediately), the heartbeat's `RETURNING cancel_requested` (≤ 15s), or the check at every step boundary. Then:
- **In-flight cancellable step** (`ToolSpec.cancellable`: model calls/streams, `pure` tools, backoff sleeps): the asyncio task is cancelled and the step is marked `cancelled`.
- **In-flight non-cancellable step** (`internal_write` in its commit, any `external_*`): it runs to completion within its timeout and the result and ledger are recorded. This avoids an "unknown" SMS created by our own cancel.
- Then → `cancelled` with `result.effects_completed = [{step_no, tool, provider_ref}]`, so staff can see what already happened. There is no automatic compensation (no "un-send"). Kinds may define a `compensate` hook later.
- After `cancel_requested`, no new step starts. A fenced step-start re-checks `cancel_requested` in its `EXISTS` clause.

Inline (API-hosted) tasks use the same flag. The SSE stream ends with `event: error` carrying problem+json `type=…/task-cancelled`.

### 9.11 Waiting states

The task releases its slot and lease while waiting. A waiting task costs one row.

**Approval**: a tool returns `require_approval` (§6), so the runner creates `approvals(task_id, step_no, expires_at)` + outbox `approval.requested` in the step txn, and the task goes `running → waiting(approval, 'approval:<id>', run_at = expires_at)`. In an inline turn, the model first receives the `pending` result and answers the user ("I've asked a colleague to approve this"); the task then goes to `waiting` instead of `succeeded`, in the same fenced txn as the reply message and with the same escalation fields as §9.14 3b (`mode='background'`, outbox `task.created`; the `conv:<id>` concurrency key is already set at insert) plus `lane = 1` and `deadline_at = NULL`. From then on it is an ordinary background task: it is serialized against other background work on the conversation and emits `task.*` events. The decision endpoint runs in one txn:

```sql
UPDATE approvals SET status = $decision, decided_by = $user, decided_at = now()
 WHERE id = $id AND status = 'pending' RETURNING task_id;          -- 0 rows → 409 (expired/decided)
UPDATE tasks SET status = 'queued', run_at = now(), wait_kind = NULL, updated_at = now(),
       deadline_at = CASE WHEN active_deadline IS NOT NULL THEN now() + active_deadline ELSE deadline_at END
 WHERE id = $task_id AND status = 'waiting' AND wait_ref = 'approval:' || $id;
INSERT INTO events_outbox … 'approval.resolved' …;  NOTIFY task_ready, '<lane>';
```

On wake the handler re-reads the approval. If it is approved, it executes the original planned tool step with its original key. If it is rejected, the model gets the rejection. If it is still pending at the deadline, it runs `UPDATE approvals SET status='expired' WHERE id=$id AND status='pending'`. If that returns 0 rows the approver won the race, so the handler re-reads and proceeds with the decision.

**Human (staff)**: e.g. "ask the salesperson whether integration X is possible". The task goes to `waiting(human, 'handoff:<id>' | 'user:<id>')`. `POST /v1/tasks/{id}/resume {payload}` (role-checked: only the addressed user or `sales_manager`) inserts a `task_signals(kind='human_reply')` row and does the `waiting → queued` update (`run_at = now()`, `wait_kind = NULL`, deadline re-armed, `WHERE status = 'waiting'`) in one txn.

**Human (side-effect review)**: `waiting(human, 'side_effect:<key>')`, entered only by RECONCILE (§9.7). Its only wake signals are the resolve endpoint, its expiry and cancel; `/resume` refuses this wait (`409 use_side_effect_resolve`), because a free-text reply cannot say whether the SMS left.

**Human (customer reply)**: the task posts its question and goes to `waiting(human, 'conversation:<id>', run_at = +48h)`. When the customer's next message arrives, the API tries to claim this task (`waiting → running`, owner `api:…`, conditional on `status='waiting'`). It journals the message as a `customer_reply` signal and runs the turn as the task's continuation with streaming. The claim sets `lease_owner='api:…'`, `lane = 0` (a web user is now blocked on it, §9.3) and `wait_kind = NULL`, and re-arms the deadline. If this API binary does not support the task's `kind@version` (rolling deploy), it does not claim: it inserts the signal and does `waiting → queued` instead, as the SMS webhook does, and a worker that supports the version continues. The task keeps its `concurrency_key`, so if a background task for the same conversation is running, the claim hits `tasks_one_running_per_key` (`23505`). If the claim fails for that reason or because a worker just claimed it on deadline, the API does not start a parallel turn: it attaches the message to whichever task is now `running` for the conversation, and that owner's deliver gate picks it up (§9.14, decision table). This, together with the one-owner rule (§9.5 rule 5), is what prevents a background task and an inline turn from both answering.

**Time**: `waiting(time, NULL, run_at = wake_at)` (policy-computed wake times are spread, §9.5 rule 4). Used for quiet hours: `sms.send` policy says "not before 09:00 Asia/Tehran", so the task waits instead of failing. Also used for in-task delays ("check payment link status in 2h"). Long-range follow-ups are separate `followup.send` tasks, not waits inside one task (§9.12).

### 9.12 Scheduled and recurring jobs

**One-off scheduled work** is a task with a future `run_at` and a `dedupe_key`. For example, `followup.schedule` inserts the `followups` row and a task `followup.send` with `dedupe_key = 'followup:<id>'` in one txn. When it fires it emits `followup.due` and re-checks everything that may have changed since scheduling: consent/opt-out, lead stage (`lost`/`handed_off` → `skipped`), customer replied after scheduling (→ skip), daily SMS cap, quiet hours (→ `waiting(time)`). Rescheduling updates `run_at` on the queued task, and cancelling a follow-up cancels its task.

**Recurring jobs** are defined in code (`tasks/schedules.py`: id, kind, cron, tz, input, lane, misfire, overlap). They are synced into `schedules` by the **release job**, not by worker start: the one-off job that §18 already runs before every rollout executes `alembic upgrade head` and then `python -m aromin.tasks.sync_schedules`. On a rollback the job skips the migration (the database stays at the newer revision, which is backward-compatible by the §18 expand → contract rule, and an older Alembic tree cannot upgrade from a revision it doesn't know) but always runs the sync. The sync is one transaction under `pg_advisory_xact_lock(hashtext('schedules.sync'))`:
- ids in code: upsert, `enabled = true`, `removed_at = NULL`, `synced_build = build`; `next_run_at` is recomputed only when `def_hash` (hash of cron + tz) changed or the row was re-enabled (then `cron_next(after = now())`).
- ids in the table but not in code: `enabled = false`, `removed_at = now()`; their `queued`/`waiting` tasks are cancelled (`SET status='cancelled', wait_kind=NULL, cancel_reason='schedule_removed', finished_at=now()`); a running one finishes normally. Rows are never deleted by sync (history, and `tasks.schedule_id` points at them); `tasks.prune` deletes a removed schedule row 90 days after `removed_at`, and `ON DELETE SET NULL` on `tasks.schedule_id` means that delete can never be blocked.

Choice: the release job is the only writer of schedule definitions, and it applies the definitions of the build being deployed, whether that build is newer or older.
Why: a deploy and a rollback are the same operation (run the release job of build B, then roll out B), so the table always matches the build that is being rolled out. Rolling back from 42 (renamed `tasks.prune` → `tasks.prune_v2`) to 41 runs build 41's sync, which re-enables `tasks.prune` and disables `tasks.prune_v2`. Old replicas that are still running during a rolling deploy never sync, so they cannot undo the new definitions.
Alternative: sync at worker start, guarded by `build ≥ max(synced_build)`.
Why not: that guard treats "older" as "stale". After a rollback every live worker is older than the highest synced build, so sync never runs again: the renamed schedule stays disabled and nothing alerts (lag alerts only cover enabled rows), while the new id keeps materializing tasks that no live process can claim. Worker-start sync without the guard has the reverse bug: an old replica restarting during a rolling deploy reverts the new definitions.

During the rollout window the table already holds build B's definitions while some build-(B−1) workers still run. A new schedule whose kind only B knows materializes a task that old workers do not claim (`kind@version` filter), so new workers pick it up. A schedule that B removed is already disabled. Neither case needs coordination. A guard alert catches the remaining drift: `schedule_kind_unsupported` (any `enabled` schedule whose `kind` appears in no live `worker_registry.kinds`, checked on the reaper tick) warns. This happens if someone deploys an image without running the release job.

Every worker runs a scheduler tick every 15s:

```
BEGIN;
SELECT * FROM schedules WHERE enabled AND next_run_at <= now()
  ORDER BY next_run_at LIMIT 20 FOR UPDATE SKIP LOCKED;
for s in rows:
    slot = s.next_run_at
    skipped_for_overlap = false
    if s.misfire == 'skip' and slot < now() - interval '60 seconds':
        metric schedule_misfired_total                       -- late slot dropped, by policy
    elif s.overlap == 'skip' and EXISTS(task with schedule_id = s.id and status in (queued,running,waiting)):
        skipped_for_overlap = true; log + metric schedule_skipped_total
    else:
        INSERT INTO tasks(kind, lane, mode='scheduled', schedule_id, input, run_at=now(),
                          dedupe_key = 'sched:' || s.id || ':' || slot::text, ...)
        ON CONFLICT (dedupe_key) DO NOTHING
    -- both policies jump past every missed slot in ONE tick; 'coalesce' differs only in running the late slot once
    next = cron_next(s.cron, s.timezone, after = max(slot, now()))
    UPDATE schedules SET next_run_at = next, last_slot_at = slot, last_task_id = …,
           consecutive_skips = CASE WHEN skipped_for_overlap THEN consecutive_skips + 1 ELSE 0 END
     WHERE id = s.id;
COMMIT;
```

Why there are no double runs with N replicas: (1) the row lock plus `SKIP LOCKED` lets only one tick process a due schedule. (2) Inserting the task and advancing `next_run_at` are one transaction: either both happen or neither. (3) The slot-based `dedupe_key` is a permanent unique backstop even if (1) and (2) were somehow bypassed (e.g. a manual `UPDATE` of `next_run_at`). Why no lost runs: a crash before commit leaves `next_run_at` due, and the next tick in any replica picks it up. After downtime spanning several slots, `coalesce` runs the job once rather than N times, and `skip` runs it at the next future slot; neither walks through the missed slots one tick at a time, because `next_run_at` is always computed after `max(slot, now())`. A run stuck in `queued`/`waiting` cannot silently block an `overlap='skip'` schedule: `consecutive_skips ≥ 3` raises an alert (§9.16), and an unrunnable task is failed by the unclaimable sweep (§9.4), which frees the schedule.

Cron parsing uses a maintained cron library with tz-aware datetimes (croniter or equivalent; **[VERIFY maintenance status]**), wrapped behind `cron_next()` so it can be replaced.

Initial schedules: `kb.rescan` (hourly, bulk), `tasks.prune` (daily 03:40 Tehran, bulk), `steps.compact` (daily 03:50, bulk), `leads.unassigned_check` (every 5 min, customer), `approvals.reminder` (every 30 min in business hours, customer).

Choice: `schedules` table + transactional slot materialization in every worker.
Why: no leader election, no separate scheduler process, and double-run safety rests on a row lock plus a unique key.
Alternative: the previous design (materialize the next row after each run); APScheduler/Celery beat; a leader via advisory lock.
Why not: "next row after run" breaks the chain when a run dies or is dead-lettered, and drifts by run duration. APScheduler/beat keep schedule state outside the DB and double-fire with several replicas. A leader lock still needs dedupe keys for failover and adds a failure mode.

### 9.13 Poison tasks and dead-letter

A task goes to `dead` when any of these holds:
- `consecutive_failures ≥ max_consecutive_failures` (default 5, i.e. roughly 3–4 min of task-level backoff in the customer lane, on top of in-process retries);
- `total_failures ≥ max_total_failures` (default 20), which catches tasks that flap between progress and failure;
- `expiries_since_progress ≥ 3`, which catches crash loops (OOM, segfault, a stall on the same step). A task that crashes its worker never gets to record an error, so only lease expiry can count it.

Waits, graceful releases and `dependency_unavailable` never count, so a 2-week nurture task with ten waits, or a 30-minute provider outage, never dead-letters anything.

On `dead`: the full journal, ledger and `last_error` are kept, and outbox `task.failed` gets `data.terminal_status="dead"`; metric `aromin_tasks_dead_total`, alert. Dead tasks are excluded from pruning until resolved.

**Fallback (`on_failure`) is a task, not a hook call.** Every transition into `failed` or `dead` (rows 6, 10, 15), whether made by the runner, the reaper or the unclaimable sweep, inserts in the same transaction a `task.fallback` task (lane 1, `dedupe_key = 'fallback:<task_id>:<generation>'`, `concurrency_key = 'conv:<conversation_id>'`, `input = {failed_task_id, terminal_status}`, scope and `reply_to` copied) when the kind declares a `FallbackSpec` (§9.15). Nothing user-visible happens inside the failing transaction, so the pure-SQL reaper can trigger it, and a rollback cannot leave a half-sent apology. `task.fallback` is an ordinary deterministic kind with code-defined steps, so it gets the journal, the ledger and fencing like everything else.

It posts into the conversation, so it obeys the one-owner rule (§9.5 rule 5): it holds `conv:<id>` while running, so it never runs beside an `agent.run` of the same conversation. Its decision and its post happen in **one** transaction under the conversation row lock, so no reply can land between "check" and "post". Define `covered_seq(F) = greatest(failed.input.trigger_seq, failed.state.seen_through_seq)`: the messages the failed task owned.

1. `apologize` (`internal_write`). One fenced txn: `SELECT … FROM conversations WHERE id = $c FOR UPDATE`; then
   - `answered_through_seq >= covered_seq(F)` (a later owner already answered those messages): no message, no handoff (unless `FallbackSpec.handoff_always`). The step output is `{skipped:"answered"}` and the task succeeds.
   - otherwise: INSERT the assistant message from the spec's fixed Persian template (`messages.task_id` = F), then set `answered_through_seq` to:
     - `greatest(answered_through_seq, covered_seq(F))` if a non-terminal `agent.run` exists for the conversation (e.g. B, queued for a message that arrived after the failure). B's messages stay B's: B's superseded check (`trigger_seq <= answered_through_seq`, §9.14) stays false, and B answers them.
     - `last_user_seq` if no non-terminal `agent.run` exists. Messages that were attached to the failed task but never seen by it have no other owner, and the apology and handoff ("a colleague will contact you") are their answer. Any message committed after this txn finds no running owner and starts a new turn as usual.
   Web: delivered through the conversation stream like any reply.
2. `handoff.create` (`internal_write`, only if step 1 posted; idempotent through the partial unique index "one open handoff per conversation", returning an existing one, §9.6).
3. SMS channel only (and not when the failed task's `last_error.code` is in `no_sms_codes`, §9.7): `deliver` = `sms.send` through policy and the §9.7 ledger, with the step's own `idempotency_key`. Unlike an agent reply, F advances `answered_through_seq` in step 1, before this send: F's real answer is the handoff of step 2 (a person now owns the customer), and the SMS is a courtesy. If it fails for good, F is `failed` and pages ("Fallback failed or dead", §9.16) with the handoff already open. Quiet hours → `waiting(time)`. On wake, the step first checks whether an assistant message newer than F's own exists in the conversation (a later turn answered meanwhile). If one does, the SMS is skipped (`skipped:"superseded"`), so a stale apology never arrives after a real answer.

Interaction with message intake (§9.14): a web message that arrives while F is `running` cannot start an inline turn (the `conv:<id>` unique index would reject it). Intake sees F as the running owner and inserts the new `agent.run` as `queued`. F is short (one template insert and one handoff, no LLM), so a worker claims the new turn within seconds of F finishing. If F is still `queued` when the message arrives, the inline turn runs first; F then runs, finds `answered_through_seq >= covered_seq(F)` and posts nothing.

`task.fallback` declares no `FallbackSpec` itself, so there is no recursion. If it goes `dead`, the customer has been dropped silently, so that is a separate page-severity alert ("fallback dead"), and the dead task's conversation is listed for manual follow-up. Kinds without customer impact (`memory.extract`, `kb.ingest`, `followup.send`, maintenance) declare no fallback; their failure is visible through status, `task.failed` and alerts only. `followup.send` deliberately has none: a follow-up that could not be sent must not become an unsolicited apology SMS.

Operator actions (`admin` role):
- `GET /v1/tasks?status=dead&kind=…`: list with `last_error`.
- `POST /v1/tasks/{id}/retry {rewind_to_step?: int}`: resets failure counters and requeues (transition 14). Without `rewind_to_step` the task resumes from its journal as on any claim. With `rewind_to_step = N`, one txn (task row `FOR UPDATE`, status `failed`/`dead`):

  ```sql
  -- validate: N is a step of generation g with parent_step_no IS NULL (a model_call or a
  -- deterministic step, never the middle of a tool batch); every step < N is final; else 422
  INSERT INTO task_steps (task_id, generation, step_no, …all other columns incl. idempotency_key…)
  SELECT task_id, g + 1, step_no, … FROM task_steps
   WHERE task_id = $id AND generation = g AND step_no < N;                -- copies, keys unchanged
  UPDATE task_signals SET consumed_generation = NULL, consumed_step_no = NULL
   WHERE task_id = $id AND consumed_generation = g AND consumed_step_no >= N;  -- re-delivered
  UPDATE tasks SET generation = g + 1,
         state = coalesce((SELECT state_after FROM task_steps WHERE task_id=$id AND generation=g
                           AND step_no < N AND state_after IS NOT NULL ORDER BY step_no DESC LIMIT 1),
                          initial_state),
         step_count = N - 1, status = 'queued', run_at = now(), … counters reset
   WHERE id = $id;
  ```

  Generation g stays intact for audit; the PK `(task_id, generation, step_no)` lets the new step N coexist with the old one. Resume reads generation g+1 only, which now holds steps 1…N-1 (with their original outputs and keys) and nothing ≥ N, so the handler continues exactly at step N. Steps ≥ N get keys derived from g+1, so a deliberately re-run SMS is a conscious operator decision and the ledger shows both sends. `side_effects` rows carry `generation`, so the two are distinguishable.
- `POST /v1/tasks/{id}/cancel`: on `dead` returns 409, because `dead` is terminal unless retried. The operator marks them resolved via `POST /v1/tasks/{id}/resolve {note}` (sets `result.resolution`, unblocks pruning).

Blast-radius limits: ingestion parses inside a subprocess with an RSS limit (`resource.setrlimit`, 1 GB) and a 50 MB input cap. A bad PDF then becomes a `permanent` `extract_failed` error instead of a worker OOM, and the bulk container isolates whatever still slips through.

Choice: `dead` is a status in `tasks`, not a separate DLQ table.
Why: the evidence (steps, ledger, events) stays joined and in place, and retry is a status change, not a copy.
Alternative: move rows to `tasks_dead`.
Why not: copying breaks foreign keys from `task_steps`/`side_effects` and loses the journal needed to resume without repeating side effects.

### 9.14 From an agent turn to a background task, and back to the user

**Ownership.** At most one `agent.run` per conversation is `running` at any instant (`concurrency_key = 'conv:<id>'` on every agent task, inline ones included; §9.5 rule 5). Every message intake (web POST, SMS webhook) and every reply commit first locks the conversation row, so the two are serialized per conversation. Lock order is always `conversations` → `tasks`; the worker's claim takes only the task row, so no cycle exists. Conversation-level counters (§9.2): `msg_seq` (every message, user or assistant, takes the next value), `last_user_seq` (seq of the newest user message) and `answered_through_seq` (newest user message that a *delivered* reply took into account). Each `agent.run` keeps `input.trigger_seq` and `state.seen_through_seq` (the highest `seq` included in its last `model_call` context).

**Invariant (no message unanswered, none answered twice):** after any committed transaction, every user message with `seq > answered_through_seq` is covered by a non-terminal `agent.run` of the conversation that will either include it in its delivered reply (gate) or hand it to a successor in its reply commit, or by a non-terminal `task.fallback` whose `covered_seq` includes it (or, when no `agent.run` exists at its commit, every message up to `last_user_seq`; §9.13). A user cancel (§9.10) is the only intentional exception.

```
POST /v1/chat {conversation_id, message, client_msg_id}     (§16)
 1. One txn:
    SELECT … FROM conversations WHERE id = $c FOR UPDATE;
    INSERT message(seq = msg_seq + 1) ON CONFLICT (conversation_id, channel_msg_id = client_msg_id) DO NOTHING;
      if it already existed → return its reply, or attach to its task (client retry after a dropped
      connection; the turn is never started twice)
    UPDATE conversations SET msg_seq = seq, last_user_seq = seq;   -- only if the row was inserted (§9.2 sequencing)
    owner := SELECT … FROM tasks WHERE concurrency_key = 'conv:'||$c
               AND kind IN ('agent.run','task.fallback')
               AND status IN ('running','queued','waiting') FOR UPDATE
             -- preference: running > queued agent.run (oldest) > waiting(human,'conversation:…') > none
             -- a queued/waiting task.fallback is ignored here (it posts nothing once a turn answers, §9.13)
    ┌─────────────────────────────────────────┬──────────────────────────────────────────────────────┐
    │ owner                                   │ action                                               │
    ├─────────────────────────────────────────┼──────────────────────────────────────────────────────┤
    │ running agent.run (API or worker)       │ ATTACH: nothing else to write. The owner's deliver    │
    │                                         │ gate will see seq. Response: SSE message.accepted     │
    │                                         │ {task_id, attached:true}, stream closes; the reply    │
    │                                         │ arrives on the conversation stream.                   │
    │ running task.fallback                   │ QUEUE: INSERT agent.run (mode 'background', lane 0,   │
    │                                         │ status 'queued', run_at now(), trigger_seq = seq,     │
    │                                         │ conv key); NOTIFY task_ready,'0'. Response as ATTACH; │
    │                                         │ a worker claims it as soon as the fallback finishes.  │
    │ queued agent.run with run_at <= now()   │ ADOPT: claim it (queued → running, owner api:…,       │
    │ and kind@version supported by this API; │ lease_token+1, lane = 0, wait_kind = NULL, deadline   │
    │ waiting(human,'conversation:<id>')      │ re-armed, reply_to = this channel; waiting: +         │
    │ (same version condition)                │ customer_reply signal, §9.11) and continue it inline  │
    │                                         │ with streaming from its journal.                      │
    │ queued agent.run with run_at > now()    │ ATTACH-QUEUED: write nothing more. The task is in     │
    │ (backoff, breaker half-open wait) or a  │ backoff because of a recent failure (often the very   │
    │ version this API does not support       │ provider an inline run would call), so it is not      │
    │                                         │ pulled forward. Its next model_call context includes  │
    │                                         │ seq. Response as ATTACH, progress label "تأخیر موقت". │
    │                                         │ Unsupported waiting version: signal + waiting→queued. │
    │ waiting(approval | staff | time), none  │ NEW: INSERT agent.run (mode 'immediate', lane 0,      │
    │                                         │ status 'running', owner api:…, lease_token 1,         │
    │                                         │ concurrency_key 'conv:<id>', trigger_seq = seq,       │
    │                                         │ active_deadline 10 min, state = initial_state =       │
    │                                         │ {profile_version, seen_through_seq: 0,…}). A waiting  │
    │                                         │ task stays waiting; when it wakes it is serialized    │
    │                                         │ behind this turn and its gate sees what happened.     │
    └─────────────────────────────────────────┴──────────────────────────────────────────────────────┘
    The INSERT/claim can still hit tasks_one_running_per_key (23505) if a worker claimed the queued
    owner (or a fallback started) between our SELECT and our write: roll back, restart the txn (≤ 3
    times); the next pass finds the running owner and ATTACHes or QUEUEs.
    COMMIT.  Heartbeat every 15s from here on (ADOPT/NEW).
 2. Turn loop inline. Journal model_call + tool steps as in §9.6 (a no-tool turn is one model_call
    step + the completion txn).
 3a. Finishes within limits → completion txn = deliver gate (below): assistant message
     (messages.task_id), answered_through_seq advanced, task succeeded. No task.* events (internal);
     message.sent as usual.
 3b. Escalation trigger (§3: > max_steps, > max_turn_seconds, external wait). Escalation happens
     only at a step boundary; at the trigger instant the in-flight step is handled by its effect:
       pure (model_call, kb.search, web.fetch, …) → cancel it now, journal it 'cancelled'
           (the worker re-plans it, §9.6; an aborted pure step has no effect, only token cost)
       internal_write / external_* → never interrupted; wait for it to finish
           (bounded by its timeout: external ≤ 10s, internal_write txn ≤ 5s statement_timeout)
     So an escalated turn closes its POST by 25s + 10s = 35s at worst. Then one fenced txn:
       INSERT assistant ack message (fixed per-profile template, e.g. «دارم بررسی می‌کنم؛ نتیجه را همین‌جا می‌فرستم.»)
         -- an ack is not an answer: answered_through_seq is NOT advanced
       UPDATE tasks SET mode='background', status='queued', run_at=now(), lane=0,
                        lease_owner=NULL, lease_until=NULL     -- lane 0: the web user is still waiting,
       INSERT events_outbox task.created;   NOTIFY task_ready,'0'  -- also for a resumed (formerly lane 1) task
     (approval / customer-reply wait instead: the model's reply is the message and does advance
      answered_through_seq; task → waiting with the same escalation fields, lane 1, deadline suspended; §9.11)
     SSE: event: message.completed {message_id: ack, task_id}; the widget drops any partial tokens
     of a cancelled model_call. The POST stream closes.
 4. Worker claims (interactive lane), continues from the journal. After each step:
     Redis PUBLISH conv:<id>  {event:"task.progress", task_id, label}      (display-safe label only)
 5. Deliver (through the gate):
     web → completion txn: assistant message + task succeeded + outbox message.sent, task.completed
           → PUBLISH conv:<id> message.completed
     sms → pre-send gate (plans the 'deliver' step, writes no message), then sms.send through policy +
           ledger (quiet hours → waiting(time)); on 2xx the step's completion txn is the reply commit
           (assistant message + answered_through_seq + succeeded + successor check)
     api → result in GET /v1/tasks/{id}; webhook task.completed to subscribers
 6. Failure/deadline/dead → task.failed + task.fallback task (template message + handoff, §9.13).
```

**Deliver gate and reply commit.** Two fenced transactions under the conversation row lock. On web/API they are one and the same transaction (posting the message *is* delivery). On SMS they are separated by the `sms.send`, and `answered_through_seq` moves only in the second, after the provider accepted the SMS: a reply counts as an answer only once it has been delivered.

```
GATE  (when the model returns a final answer, and again whenever a claim resumes a planned-but-unstarted deliver step,
       e.g. after a quiet-hours wait)
  SELECT last_user_seq, answered_through_seq FROM conversations WHERE id = $c FOR UPDATE;
  fence: SELECT 1 FROM tasks WHERE id = $t AND lease_token = $tok AND status = 'running' FOR UPDATE;
  replans := count of 'deliver' steps with status 'skipped' journaled after the task's latest 'wait'
             step (or since step 1 if it never waited)    -- derived from the journal, no counter to reset
  if last_user_seq > seen_through_seq and replans < 2:
      journal the draft as a 'deliver' step with status 'skipped' (output kept for audit);
      append a model_call (its context includes the new messages)
  elif channel in (web, api):  REPLY_COMMIT in this same txn
  else (sms):  journal 'deliver' step = sms.send, status 'planned', input {text, covers_seq: seen_through_seq};
               no message row, answered_through_seq unchanged

REPLY_COMMIT  (web/api: inside GATE; sms: the completion txn of the deliver step after 2xx, or after
               an operator resolves its unknown outcome as 'sent', §9.7)
  [sms: lock + fence as above]
  INSERT assistant message (seq per §9.2; messages.task_id; sms: provider_ref);
  answered_through_seq = greatest(answered_through_seq, covers_seq);     -- web: covers_seq = seen_through_seq
  task succeeded (+ outbox message.sent; task.completed unless mode='immediate', §9.3 row 5)
  if last_user_seq > covers_seq:   -- typed after the gate (sms: during the send) or after the replan cap
      INSERT agent.run successor (queued, lane 0 for web | 1 for sms, trigger_seq = last_user_seq,
                                  concurrency_key conv:<id>); NOTIFY task_ready
```

The successor check in REPLY_COMMIT is what makes ATTACH and "queued owner → nothing more" correct on every channel: an owner that has already passed its gate still commits its reply under the conversation lock, sees every user message that arrived meanwhile (`last_user_seq > covers_seq`) and hands them to a successor in the same transaction. Example (SMS): A passes its gate with `covers_seq = 3`; `sms.send` gets 429, A is requeued with backoff; at +5 s the customer texts seq 4 and intake sees queued A (nothing more to write); A is reclaimed, the send succeeds, and REPLY_COMMIT sets `answered_through_seq = 3` and inserts successor B with `trigger_seq = 4`, which is not superseded (4 > 3) and answers. If the send instead fails for good (definite 4xx, `dead`, `abandon`), `answered_through_seq` is still below `covered_seq(F)`, so the fallback F posts its template and opens a handoff (§9.13) instead of recording `skipped:"answered"`.

Because the gate, the reply commit and message intake all hold the conversation row lock, a message is committed either before the gate reads `last_user_seq` (re-planned into this reply), or between gate and reply commit (handed to the successor by REPLY_COMMIT), or after the reply commit (intake finds no running owner and starts or adopts a turn). There is no fourth interleaving. The replan cap (2) stops a fast typist from keeping one task looping forever; the successor answers the rest. The cap applies to one *reply episode*, not to the task's whole life: it counts only skipped drafts since the latest `wait` step. A task that used both replans during its inline turn, then waited 30 min for an approval, therefore re-plans again on wake if the customer wrote meanwhile ("forget the discount, I'll take the basic plan"). It does not post the stale approved quote. The count is a pure function of the journal, so it survives crashes and resumes without a separate state field. **Superseded check at first claim**: an `agent.run` with `step_count = 0` whose `trigger_seq <= answered_through_seq` (an earlier owner's reply already covered its message) succeeds at once with `result = {superseded: true}`: no model call, no second SMS. A task that has already done work is never superseded, because it may hold a result the customer is still owed (a discount approved 30 min later); its gate instead re-plans with the newer messages, so its reply accounts for what was said meanwhile.

Choice: attach new messages to the running owner and gate the reply, not answer each message independently.
Why: one coherent reply per burst of messages, and no reply that ignores a message the customer sent before it was posted. The only cost is that an attached message waits for the owner's next step boundary (≤ one step timeout, 60s for a model call); the progress label shows the customer that work is under way.
Alternative: every message gets its own concurrent turn (the default of most chat backends).
Why not: with background tasks in the picture, concurrent turns are exactly the double, mutually inconsistent reply (§9.5 rule 5 counterexample), and they also race on domain writes.

**Getting results to the widget**: the widget keeps `GET /v1/conversations/{id}/stream` (SSE) open. The API pod relays Redis `conv:<id>` pub/sub to it. Redis is only a doorbell: on (re)connect with `Last-Event-ID = <last message id>`, the API replays from `messages` in Postgres, so a lost pub/sub message or a reconnect loses nothing. A visitor who closed the tab sees the reply on return. If they left a phone number with SMS consent, kind `agent.run` may deliver an SMS notice instead (policy-checked).

**API pod crash mid-turn**: every turn has a task row (step 1), committed together with the user message, so there is no window in which the message exists without a task. The lease expires and the reaper requeues the task into lane 0 as `mode='background'` (it already carries `concurrency_key`). A worker resumes from the journal: a `started` model_call is `pure`, so it is re-run, and the reply is delivered through the conversation stream, or seen on return if the visitor closed the tab. This holds for any client, including future API/n8n channels, because nothing depends on the client retrying. A widget retry with the same `client_msg_id` hits step 1's conflict and joins the existing task instead of starting a second one; a *new* message sent while the crashed turn is still leased (≤ 75s) ATTACHes to it and is answered by the worker that resumes it.

**API graceful shutdown** (deploys): on SIGTERM the API stops accepting new turns, and every in-flight inline turn escalates at its next step boundary (3b, reason `released`, no failure counted), within the same 30s budget as workers (§9.17). The SSE client receives the ack and the worker finishes the turn.

**Inbound SMS** (§13) never runs inline. The webhook runs step 1's transaction (conversation lock, message deduped on `channel_msg_id = '<provider>:<provider_msg_id>'`), then: running `agent.run` → ATTACH; running `task.fallback` → enqueue as below (it is claimed after the fallback finishes); queued `agent.run` → nothing more (its gate includes the message, or, if it is already past its gate, its REPLY_COMMIT hands it to a successor); `waiting(human, 'conversation:<id>')` or `waiting(time)` `agent.run` → `customer_reply` signal + `waiting → queued` (`run_at = now()`) in the same txn (a quiet-hours wait on a planned deliver step wakes, its gate sees the new message and re-plans, and the new draft's send waits for 09:00 again; this prevents a second task from waiting in parallel and sending its own reply at 09:00); otherwise → enqueue `agent.run` (lane 1, `dedupe_key = 'sms_in:<provider>:<provider_msg_id>'`, `concurrency_key = 'conv:<id>'`, `trigger_seq`). It returns 200 in all cases. Two SMS sent 5 s apart therefore produce one task or two serialized tasks, and in the second case the later task is superseded if the first one's reply already covered its message.

The background task uses the profile/prompt version pinned at creation (`state.profile_version`) for coherent behavior. It always uses the currently active `policy_set`, so a policy kill-switch (tool disabled, SMS paused) takes effect on in-flight tasks at their next step.

### 9.15 Task kinds (initial)

Each kind is registered in code:

```python
class TaskKind(BaseModel):
    name: str; version: int; supported_versions: set[int]
    lane: Lane; input_model: type[BaseModel]
    handler: Callable[[TaskCtx], Awaitable[StepOutcome]]
    max_consecutive_failures: int = 5; max_total_failures: int = 20
    deadline: timedelta | None; global_cap: int | None
    concurrency_key: Callable[[BaseModel], str | None] | None
    coalesce_key: Callable[[BaseModel], str | None] | None
    emit_events: bool = True
    api_enqueueable: bool = False          # POST /v1/tasks allowed (with permission task:enqueue:<name>)
    on_failure: FallbackSpec | None        # data, not code: {template_id, handoff: bool, handoff_always: bool, sms: bool,
                                           #   no_sms_codes: set[str]}  (no apology SMS after an unresolved/abandoned send, §9.7)
                                           # → a task.fallback task is inserted on failed/dead (§9.13)
    on_integrity_error: Callable | None    # per tool in ToolSpec; maps 23505/23503/23514 to tool_error (§9.6)
```

| Kind | Lane | Keys | Deadline | API-enqueueable |
|---|---|---|---|---|
| `agent.run` | 0 (web user waiting) / 1 | concurrency `conv:<id>` (inline too); fallback: apology template + handoff | active 10 min / 2 h | no |
| `task.fallback` | 1 | dedupe `fallback:<task_id>:<generation>`, concurrency `conv:<id>` (serialized with agent turns); no fallback of its own | absolute: 24 h | no |
| `followup.send` | 1 | dedupe `followup:<id>`, concurrency `lead:<id>`, cap 3 | absolute: due + 24h | via `followup.schedule` only |
| `handoff.notify`, `lead.route` | 1 | dedupe `<event_id>:<kind>`, cap 2 (shared) | absolute: 1 h | no |
| `memory.extract`, `summary.refresh` | 2 | coalesce `<kind>:conv:<id>` | — | no |
| `lead.score` | 2 | coalesce `lead.score:<id>` | — | no |
| `kb.ingest` | 3 | concurrency `doc:<id>`, cap 2 | — | yes (admin) |
| `sms.campaign` → `sms.campaign_send` ×N | 3 | children `emit_events=false`, cap 2, `run_at` spread to the provider rate; parent inserts children in fenced batches of 1,000 and stays open until all children are terminal (§9.10) | absolute: campaign end (parent: + 1h to aggregate) | yes (`service`) |
| `tasks.prune`, `steps.compact`, `kb.rescan` | 3 | schedule slot dedupe | — | no |

`POST /v1/tasks` accepts only `api_enqueueable` kinds, validates `input` with the kind's model, and maps `Idempotency-Key` to `dedupe_key = 'api:<api_key_id>:<key>'` (a repeat returns the existing task, 200). Scope (`customer_id`, etc.) is resolved server-side as in §6. Outbox dispatch and webhook deliveries are not tasks. They are dedicated loops in the main worker with their own concurrency (8 in flight, ≤ 2 per subscription), so a slow subscriber can never consume task slots.

### 9.16 Observability

**Metrics** (Prometheus, prefix `aromin_`). Queue gauges (`task_queue_depth`, `task_queue_lag_seconds`, `tasks_waiting`, `task_live_workers`, schedule gauges) come from SQL every 15s, computed by **every `api` and every `worker` process** (label `source`); alerts aggregate with `max()` over sources. Because the `api` process computes them too, the queue keeps being measured when every worker is down, which is exactly when it matters:

| Metric | Type | Labels |
|---|---|---|
| `tasks_enqueued_total` | counter | kind, lane, mode |
| `tasks_finished_total` | counter | kind, status (succeeded/failed/cancelled/dead) |
| `task_queue_depth` | gauge | lane, status (ready/delayed/waiting) |
| `task_queue_lag_seconds` | gauge | lane: `now() − min(run_at)` of claimable rows |
| `task_duration_seconds` | histogram | kind (first start → finish, waits excluded via `task_events`) |
| `task_step_duration_seconds` | histogram | kind, type, name (tool/model tier), status |
| `task_retries_total` | counter | kind, error_class |
| `task_lease_expired_total` / `task_lease_lost_total` | counter | kind / owner type |
| `tasks_waiting` / `task_oldest_wait_seconds` | gauge | wait_kind |
| `side_effects_total` | counter | kind, status (succeeded/failed/unknown/deduped) |
| `worker_slots_busy` / `worker_last_poll_timestamp` | gauge | lane, replica |
| `schedule_lag_seconds` / `schedule_skipped_total` / `schedule_misfired_total` / `schedule_consecutive_skips` | gauge / counter / counter / gauge | schedule |
| `tasks_unclaimable_failed_total` | counter | kind, kind_version |
| `chat_messages_attached_total` / `agent_gate_replans_total` / `agent_superseded_total` | counter | channel |
| `circuit_breaker_open` | gauge | dependency |
| `task_live_workers` | gauge | lane: `worker_registry` rows serving the lane with `last_seen > now() − 60s` |
| `reaper_errors_total` | counter | — |
| `task_cost_estimate_total` | counter | kind, model tier |

**Logs** (structlog JSON). Every line in task context carries `task_id, kind, lane, attempt, lease_token, step_no, conversation_id, trace_id`. The events logged are `task.enqueued`, `task.claimed`, `step.started`, `step.finished` (duration, status, error_class, tokens), `task.transition`, `lease.lost`, `side_effect.unknown`, `task.dead`. Logs never contain prompts, model output text, chain-of-thought, tool args or results (only allow-listed non-PII fields such as tool name and `ok`), or phone numbers. The journal in Postgres holds the payloads, behind RBAC. Unhandled exceptions go to GlitchTip with the same tags. OTel spans (phase 8) link worker steps to the originating request via `tasks.trace_parent`.

**Alerts** (Prometheus Alertmanager → ops channel; business alerts via outbox events):

| Alert | Condition | Severity |
|---|---|---|
| Interactive lane stalled | `task_queue_lag_seconds{lane="interactive"} > 10` for 2m | page |
| Customer lane stalled | lag `customer` > 120s for 5m | page |
| No live worker | `max by (lane) (task_live_workers{source="api"}) == 0` for 2m, per lane (bulk included). It is computed by the `api` from `worker_registry`, so it fires when every worker is down or crash-looping | page |
| Worker metrics absent | `absent(aromin_worker_last_poll_timestamp)` for 3m, or `up{job="worker"} == 0` for 2m | page |
| No worker polling | `time() − max(worker_last_poll_timestamp) > 60` and `max(task_queue_depth{status="ready",source="api"}) > 0` | page |
| API down | `up{job="api"} == 0` for 2m (then the api-computed gauges are gone too). An external uptime probe on `/health` covers Prometheus itself being down | page |
| Reaper error | `increase(reaper_errors_total[5m]) > 0` | page |
| Side effect unknown | `increase(side_effects_total{status="unknown"}[5m]) > 0` | page |
| Dead tasks | any in 15m → warn; > 5 in 15m → page | warn/page |
| Fallback failed or dead | any `task.fallback` in `failed`/`dead` (a customer may have been dropped without apology or handoff) | page |
| Unknown send unresolved | `side_effects` row `unknown` for > 2 business hours | page (staff must resolve, §9.7) |
| Unclaimable task | `increase(tasks_unclaimable_failed_total[15m]) > 0` | page (a deploy dropped a kind/version) |
| Crash loop | `increase(task_lease_expired_total[10m]) > 3` | warn |
| Breaker open | `circuit_breaker_open == 1` for 5m | page |
| Kind failure ratio | failed+dead / finished > 10% over 30m (min 20 tasks) | warn |
| Default / bulk lag | > 15 min / > 2 h | warn |
| Schedule late | `schedule_lag_seconds > max(300, 2 × interval)` | warn |
| Schedule blocked | `schedules.consecutive_skips ≥ 3` (exported as gauge `schedule_consecutive_skips`) | warn |
| Schedule kind unsupported | an `enabled` schedule whose kind no live process supports (§9.12, image deployed without its release job) | warn |
| Approval waiting | approval pending > 4 business hours | business: reminder to sales manager |

Grafana dashboard "Tasks": lag per lane, throughput by status, step latency p50/p95 per tool, retries by class, waiting counts, dead list, cost per kind.

### 9.17 Operations

- **Graceful shutdown** (SIGTERM; compose `stop_grace_period: 45s`): stop claiming and the scheduler; let in-flight steps reach a boundary (≤ 30s); then for each owned task run the fenced `running → queued` with reason `released`, no failure counted. A non-cancellable external step is allowed to finish (all have ≤ 10s timeouts). Anything not released in time is reaped normally.
- **Rolling deploys**: claim filter by `kind@version` (§9.4); new `kind_version` handlers ship one release before producers start emitting them (expand → migrate → contract, §18); `state.v` is migrated lazily in the handler.
- **Deployment** (§18): release job (migrations + schedule sync, §9.12) before every rollout and rollback; `worker` (lanes 0–2, 16 slots, scheduler, reaper, outbox + webhook dispatchers) ×1–2; `worker-bulk` (lane 3, 2 slots) ×1. Pool sizing per worker: main pool 10 (connections are taken per step, never held across LLM/HTTP calls), heartbeat pool 2, 1 LISTEN connection.
- **Retention** (§4): `tasks.prune` deletes whole task *trees*, never a single node. It selects roots only (`parent_task_id IS NULL`) that are terminal with `finished_at < now() − 90 days`, are not unresolved `dead`, and have no child that is non-terminal, finished within 90 days, or unresolved `dead` (`NOT EXISTS` on `tasks_parent`). Deleting a root cascades to its children (`parent_task_id … ON DELETE CASCADE`), and every task's `task_steps`, `task_events`, `task_signals`, `side_effects` go with it. `messages.task_id` and `approvals.task_id` are `ON DELETE SET NULL`, so pruning never conflicts with the 12-month message retention. No FK can therefore block the `DELETE`. Deletion runs in batches of 1,000 roots, one transaction per batch, so a bad batch cannot roll back the others. Because a parent stays open until its children are terminal (§9.10), a tree's root always finishes last in practice. The `NOT EXISTS` check covers the remaining case: a root kept back by a slow child is simply deleted on a later day. `steps.compact` truncates `model_call.output` and large tool outputs of tasks finished > 7 days ago to summaries. `audit_log` is kept independently.
- **Privacy**: `input`/`state` hold ids (customer, message), not raw phone numbers. `DELETE /v1/customers/{id}/data` cancels the customer's open tasks (with child cascade) and deletes their task rows, children included (cascade), before deleting conversations, since `tasks.conversation_id` references them.

### 9.18 Failure scenarios checked against this design

| # | Scenario | What happens | Fixed by |
|---|---|---|---|
| 1 | Worker SIGKILLed after the SMS provider accepted, before the completion commit | Ledger row `pending`; reaped ≤ 75s; new owner finds `started` external step → reconcile: dedupe re-call or lookup → `succeeded`. Without either → `unknown`, `waiting(human, 'side_effect:<key>')`; staff resolve `sent`/`resend`/`abandon`, or expiry fails the task into a handoff-only fallback. No unattributed duplicate. | §9.7 ledger + Resolution |
| 2 | Worker stalls 90s (VM freeze), is reaped, another worker resumes; the stalled one wakes | Its heartbeat and every fenced write return 0 rows → `LeaseLost`, it stops. Its in-flight DB effects roll back. An SMS it was mid-sending is covered by #1 (pending → never blind re-send). | §9.4 fencing token |
| 3 | n8n enqueues a 20,000-recipient campaign at 10:00 while customers chat | Children are in lane 3 only, in `worker-bulk`, cap 2, ≤ 50% of SMS rate, `emit_events=false` (no 20k webhooks); every send re-checks consent/quiet hours/daily cap. Interactive/customer lag unchanged. | §9.5 lanes, caps, buckets |
| 4 | Two replicas restart during a deploy at the hourly cron minute; the system was down for 3 slots | One tick locks the schedule row; task insert + `next_run_at` advance commit together; `coalesce` → one run; `dedupe_key` blocks any second insert. | §9.12 |
| 5 | A malformed PDF makes the extractor eat memory | Subprocess hits rlimit → `permanent` `extract_failed` → `failed`. If the worker itself dies: lease expiry ×3 without progress → `dead`; co-located bulk tasks normally made progress (completed steps) between crashes, so their counters reset. Customer workers unaffected. | §9.13, separate container |
| 6 | Customer cancels while the model streams and an `sms.send` runs in parallel | Stream cancelled (cancellable), SMS allowed to finish and recorded; task `cancelled` with `effects_completed`. | §9.10 |
| 7 | Arvan LLM down 30 min | §3 secondary model first. If that also fails: breaker → `dependency_unavailable` → requeue without counting failures; interactive tasks pass their 10-min deadline → template apology + handoff; background tasks resume when the provider returns. Nothing dead-lettered. | §9.8, §9.9 |
| 8 | Approver clicks "approve" at the same moment the approval expires | The `approvals` row lock serializes the two; the expirer's `WHERE status='pending'` update returns 0 rows → it re-reads and proceeds with the decision. Approve after cancel → 409. | §9.11 |
| 9 | Visitor asks for a 3-branch quote; the turn escalates at 25 s; 10 s later the visitor adds "with the SMS module too?" | The escalated task is `queued` or `running`. Queued → the POST ADOPTs it and continues inline with both messages in context. Running on a worker → ATTACH; the worker's deliver gate sees `last_user_seq > seen_through_seq`, skips its draft, re-plans with the follow-up, and posts one quote that includes the SMS module. No second turn exists, so no second reply. | §9.5 rule 5, §9.14 gate |
| 10 | Postgres connection drops during a step-completion COMMIT (outcome unknown) | Runner abandons local execution; on reclaim the journal shows `succeeded` (it committed) or `started` (nothing written, internal effects atomic) and proceeds accordingly. | §9.6 |
| 11 | New API version enqueues `agent.run@2` while old workers are still running | Old workers don't claim it (`kind@version` filter); new workers do. | §9.4 |
| 12 | Web visitor asks for a discount; the tool needs approval; the manager approves 30 min later | Inline task → `waiting(approval)` with escalation fields, lane 1, deadline suspended. Decide endpoint → `queued` with `deadline_at = now() + 10 min`; worker claims, runs the original planned step with its original key, posts the result to the conversation. | §9.3 rows 9/11, §9.9 active deadline |
| 13 | Operator retries a dead 8-step task with `rewind_to_step = 5` | Steps 1–4 are copied into generation g+1 with their keys, and state comes from step 4's `state_after`. Resume reads g+1 = steps 1–4 and plans step 5 fresh. Steps 1–4 do not re-run, and there is no PK collision with the old step 5. | §9.13, PK `(task_id, generation, step_no)` |
| 14 | Campaign of 20,000 cancelled at 11:00 while the parent is still fanning out | Cancel txn: queued children → `cancelled`, running children flagged. The in-flight batch step commits, and the transition-7 cascade cancels that batch too. Running children finish at most their one send each. | §9.10 child cascade |
| 15 | 600 follow-ups held by quiet hours; a customer texts at 09:00:05 | Wakes are spread over 09:00–09:30 and at most 3 `followup.send` run at once. The capped kind is skipped by the claim, so the inbound turn takes the next free customer/default slot (≤ 1 s poll), and its SMS reply draws on the reserved reply bucket. | §9.5 rule 4 |
| 16 | API pod OOM-killed during the model call of a no-tool turn; the visitor's network drops | The task row exists (committed with the message). Reaped within 75 s and resumed by a worker, which re-runs the `pure` model_call. The reply is in `messages` and the visitor sees it on return. | §9.1 eager row, §9.14 |
| 17 | Day 90 after a campaign whose child is an unresolved `dead` | The root is not eligible (child guard), so nothing is deleted and no FK error occurs. Once the child is resolved, the whole tree is deleted in one cascade. | §9.17 retention |
| 18 | Inbound SMS `agent.run` OOM-kills its worker three times in a row | Third expiry: the reaper sets `dead` and, in the same statement, inserts `task.fallback`. The fallback posts the template, opens a handoff and sends the apology SMS as its own journaled `sms.send` step with its own ledger key; a crash during that send is reconciled like any other (§9.7), never re-sent blind. | §9.4 reaper `fb`, §9.13 |
| 19 | An escalated `agent.run` calls `crm.create_lead` while an earlier owner already created the open lead for the conversation | The insert hits the partial unique index inside the tool's savepoint → step `succeeded` with `{ok:false, error_code:"already_exists", lead_id}`; the model continues with the existing lead. No retry loop, no dead task, no apology. | §9.6 integrity rule |
| 20 | Release N+1 drops `followup.send@1` while a v1 follow-up is due in 2 weeks; separately, schedule `kb.rescan` is deleted from code | The retirement guard blocks the release (non-terminal v1 rows exist). If it is bypassed, the due task is failed by the unclaimable sweep 15 min after `run_at` and pages. The release job's sync marks `kb.rescan` `enabled=false, removed_at`, cancels its queued run, and no replica materializes it again. | §9.4 sweep, §9.12 sync |
| 21 | User cancels a running task (202); the worker then OOMs before seeing the flag | Reaper finds `cancel_requested` → `cancelled` (not `dead`, no backoff, no fallback apology); children cascaded; a `pending` ledger row becomes `unknown` and pages for review. | §9.4 reaper |
| 22 | 5-minute `misfire='skip'` schedule after 24 h of downtime | First tick: slot is late → not run; `next_run_at = cron_next(after = now())`, so the job runs on time at the next 5-minute boundary, not 288 ticks later. | §9.12 |
| 23 | 20,000-recipient campaign enqueued at 20:00; children reach quiet hours and sit in `waiting(time, ≈09:00+spread)`; operator cancels at 22:00 | The cascade sets `status='cancelled', wait_kind=NULL` on queued and waiting children in one `UPDATE`. The `wait_kind` CHECK holds (the trigger normalization would also catch an omission). Cancel returns 200/202, and no SMS goes out at 09:00. | §9.10, §9.3 trigger |
| 24 | A reaper batch contains a row that makes the batch statement fail (a bug) | Batch rolls back → per-row retry, one txn each; the failing id is quarantined for 10 min, every other expired lease is reaped this tick; `reaper_errors_total` pages. | §9.4 reaper error isolation |
| 25 | SMS `agent.run` A goes `dead` at 10:00, fallback F is queued; the customer texts question 7 at 10:00:01 → B queued (`trigger_seq=7`) | F runs first (both hold `conv:<id>`, never concurrently). Under the conversation lock F sees a non-terminal B, so it advances `answered_through_seq` only to `covered_seq(F)` ≤ 6. B is not superseded and answers question 7. If B had not existed, F would have covered through `last_user_seq`. | §9.13 |
| 26 | Web: F is queued for a failed turn; the visitor writes again and a new inline turn answers correctly | The inline turn runs first (F cannot be running beside it, and a queued F is not an owner). F runs afterwards, finds `answered_through_seq ≥ covered_seq(F)`: no apology, no handoff. If F was already running when the message arrived, intake QUEUEs the new turn behind F and it runs seconds later. | §9.13, §9.14 table |
| 27 | Build 42 renames `tasks.prune` → `tasks.prune_v2`; the release is rolled back to 41 | The rollback's release job (migration skipped) runs build 41's sync: `tasks.prune` re-enabled with `next_run_at = cron_next(now())`, `tasks.prune_v2` disabled and its queued run cancelled. Nothing is silently off. | §9.12 |
| 28 | `worker` container crash-loops on start after a bad deploy; no worker exports metrics | The `api` still computes `task_live_workers` and the queue lag from SQL: "No live worker" and "Interactive lane stalled" page within 2 min; `absent(worker_last_poll_timestamp)` pages as a second path. | §9.16 |
| 29 | Web visitor answers the agent's question, the API claims the waiting task (was lane 1), a `web.fetch` pushes the turn past 25 s | API claim set `lane = 0`; escalation keeps lane 0 and notifies `'0'`; the turn runs in interactive slots under the 10 s lag alert. | §9.3, §9.14 3b |
| 30 | LLM provider failing; an escalated turn is queued with `run_at = now()+60s` (breaker half-open); the visitor writes again | `run_at > now()` → ATTACH-QUEUED, not ADOPT: no inline re-run against the failing provider, no extra retry consumed; the message is in the task's next context. | §9.14 table |
| 31 | Fast typist uses both replans in the inline turn; turn waits for approval; customer changes their mind during the wait; approval arrives | Replan count restarts after the `wait` step, so the gate sees the new message and re-plans; the reply reflects the customer's latest request. | §9.14 gate |
| 32 | SMS reply passes its gate (covers seq 3); `sms.send` gets 429 and the task is requeued; the customer texts seq 4 meanwhile | Intake sees a queued owner and writes nothing more. On reclaim the send succeeds; REPLY_COMMIT sets `answered_through_seq = 3` and inserts a successor with `trigger_seq = 4`, which answers. If the send had failed for good, `answered_through_seq` would still be below `covered_seq(F)`, so F apologizes and hands off. | §9.14 REPLY_COMMIT |
| 33 | Provider without dedupe or lookup times out on the reply SMS | RECONCILE → `unknown`, wait with a 4-business-hour expiry, page. Staff check the provider panel and resolve: `sent` → reply committed; `resend` → a new deliver step (new key) planned through the gate; `abandon` or no decision → `failed` → handoff, no apology SMS. | §9.7 Resolution |
| 34 | Instagram promo: 40 web visitors in 5 min, each turn escalates and runs up to 10 min; an inbound SMS arrives | Web turns hold interactive, default and at most 6 customer slots; 2 customer slots per replica stay reserved for inbound work, so the SMS turn is claimed within one poll. Lane-0 lag pages at 10 s. | §9.5 rule 1 |
| 35 | `sms.send` to a non-dedupe provider returns 502 | Classified `outcome_unknown` (request had left), never retried in process; RECONCILE decides. A connect refusal instead is `transient` and retried with the same key. | §9.8 `external_unsafe` rule |

**Required tests** (§19, integration with testcontainers): kill the runner at each of the 6 protocol points (before/after step start, before/after provider call, before/after completion commit) and assert no duplicated or lost effect. 4 workers × 2,000 tasks: each runs exactly once. Frozen-worker fencing test. 3-replica scheduler race over 100 simulated slots: exactly 100 tasks. Cancel in every state. Approval decide-vs-expire race. Coalescing under concurrent enqueue. Dead-letter thresholds, including a crash loop with an innocent co-runner. Transition trigger rejects every pair not in §9.3. Wait → wake after longer than the active deadline does not fail (approval, staff and customer-reply paths). Rewind to N: journal equals steps 1…N-1, no PK error, consumed signals ≥ N re-delivered. Cancel a campaign parent in each phase (fan-out running, waiting on children); assert no child `sms.send` starts afterwards. 600 simultaneous follow-ups + 1 inbound SMS: inbound claim latency < 2 s; the same with 40 long-running lane-0 turns occupying every borrowable slot: inbound SMS claim latency < 2 s and at no instant fewer than 2 customer slots per replica are idle or running inbound work. SMS reply whose send is requeued (429) while the customer writes again: successor created, new message answered. Unknown SMS outcome resolved as `sent`, `resend`, `abandon`, and left to expire: each exits the wait exactly once, no unattributed re-send. `external_unsafe` adapter fed every httpx error type: only pre-send errors and 429 retry in process. Assistant messages never change `last_user_seq`. Kill the API process mid-model-call on a no-tool turn: the reply is delivered by a worker. Prune with parent/child trees in every mix of child states: no FK error. Escalation at 25 s with an in-flight model call and with an in-flight `sms.send`. Message intake racing a reply commit at every interleaving (property test over the conversation lock): every user message answered exactly once or covered by a fallback. Reaper on a crash-looping task: dead + exactly one `task.fallback`; with `cancel_requested`: cancelled, no fallback. Pinned `internal_write` tool colliding with a unique index: step succeeds with `tool_error`, task not retried. Unclaimable sweep with a mixed-version registry during a simulated rolling deploy: nothing failed inside the grace period. Schedule renamed in build N and rolled back to N−1: after the rollback's release job, the old id is enabled and due, the new id disabled. Every transition statement in this section run with the trigger's normalization block disabled: no CHECK violation (proves each statement clears `wait_kind`/lease itself). Cancel a campaign whose children are in `waiting(time)`. Reaper with one deliberately broken row in the batch: all other rows reaped in the same tick. Fallback vs. new message at every interleaving (queued/running F × queued/running/no successor): no message superseded without an answer, no apology after a real answer. All workers stopped: "No live worker" fires from api-side metrics. Re-escalation of an API-claimed waiting task lands in lane 0. ADOPT never claims a task with `run_at > now()` or an unsupported version. Replan cap resets after a wait.

### 9.19 Required edits to other sections

- **§3**: every agent turn of a conversation is serialized under `conv:<id>`; a message arriving during a turn is attached to it and handled by the deliver gate (§9.14); the step types collapse to `model_call`/`tool_call` (§9.6); the idempotency key becomes `sha256(task_id‖generation‖step_no)` (§9.7); the task row is created at the start of every inline turn, in the user-message transaction; approvals in inline turns put the task into `waiting` as a background task; escalation happens only at step boundaries (in-flight `pure` steps are aborted, side-effecting ones finish).
- **§6 `ToolSpec`**: replace `idempotent: bool` with `effect: Literal['pure','internal_write','external_idempotent','external_unsafe']`; add `cancellable: bool`, `reconcile: Callable | None` and `on_integrity_error: Callable | None` (§9.6); `internal_write` handlers receive the step's DB session via `ctx.db`. New internal tools: `task.update_plan`, `task.add_note`, `task.cancel` (conversation-scoped).
- **§10**: add `task.cancelled` and `side_effect.unknown`; `task.failed` carries `terminal_status` (`failed|dead`) and `error_class`; `task.*` events only for tasks with `emit_events` that were background/scheduled.
- **§16**: add `GET /v1/tasks` (filters), `POST /v1/tasks/{id}/retry`, `/resume`, `/resolve`, `POST /v1/side-effects/{key}/resolve` (`admin`, `sales_manager`; §9.7), and `GET /v1/conversations/{id}/stream` (SSE). `GET /v1/tasks/{id}` for a visitor token returns only `status`, `progress.label` and `result.message_id` of tasks in their own conversation.
- **§17**: `messages.task_id`/`approvals.task_id` are `ON DELETE SET NULL`; add `messages.seq` (unique per conversation, assigned to every message from `conversations.msg_seq`), `conversations.msg_seq/last_user_seq/answered_through_seq`, `worker_registry`, partial unique indexes `leads(conversation_id) WHERE status='open'` and `handoffs(conversation_id) WHERE status='open'`; tables and indexes from §9.2 replace `tasks(...)`, `task_steps(...)` and the index `tasks(run_at) WHERE status='queued'`; columns added to `approvals`, `messages`, `webhook_deliveries`.
- **§18**: the one-off release job runs `alembic upgrade head` (skipped on rollback) and then `sync_schedules`, on every deploy and every rollback; add the `worker-bulk` service and `stop_grace_period: 45s`; add the alert rules of §9.16 that use `up`/`absent()` and the external `/health` probe; scale `worker` on `task_queue_lag_seconds{lane=~"interactive|customer"}`, not on raw depth.
- **§22**: `tasks/` becomes `engine.py` (TaskStore, transitions), `runner.py` (step protocol, resume), `claim.py`, `reaper.py`, `scheduler.py`, `schedules.py`, `ledger.py`, `lanes.py`, `kinds/`.
