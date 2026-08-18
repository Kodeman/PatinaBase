"""Direct Postgres from Modal, as the `scan_worker` role. Never `service_role`.

Per DELIVERY-PLAN R2 the connection string is a Modal Secret (`SCAN_WORKER_DSN`)
for a LOGIN role whose grants are exactly the four RPCs below. Nothing here
touches a table directly, so a leaked Modal credential reaches the scan RPCs and
nothing else.

RPC signatures are being authored in a sibling lane; W1 reconciles if they drift.

──────────────────────────────────────────────────────────────────────────────
IDEMPOTENCY / LEASE GUARD — the choice, and why
──────────────────────────────────────────────────────────────────────────────
The intended first act of any Modal job is a lease-guard read of the
`agent_tasks` row, so a duplicate delivery or a stale room-file version becomes
a no-op rather than a second write. There is no read RPC on the `scan_worker`
grant surface, and `scan_worker` must not be given a direct SELECT on
`agent_tasks` — that would widen the credential past "the scan RPCs" for the
sake of a check the ledger can make itself.

So the guard is implemented in TWO parts, both server-side:

  1. `scan_worker_append_event(..., stage='verify', event='started', ...)` is the
     job's first statement. It is the observable claim: a duplicate delivery
     leaves two `started` rows for one task, which is the signal that the
     dispatcher double-delivered. It is deliberately NOT a mutual-exclusion
     primitive — appending an event cannot fail a stale worker.

  2. `scan_worker_complete_task(task_id, result)` carries the actual lease check
     inside the RPC: a completion from a worker whose lease has expired, or for
     a task already terminal, is rejected there. `complete()` below surfaces that
     rejection to the caller instead of swallowing it.

The cost of this arrangement, stated plainly: a stale duplicate still burns the
compute — it runs the whole stage and is only rejected at completion. It cannot
corrupt the record, which is the property that matters. Cheap early rejection
needs a `scan_worker`-granted read RPC; if the sibling lane adds one, the first
statement of `run_verify` should become that call.
"""

from __future__ import annotations

import os
from typing import Any

__all__ = ["DbError", "LeaseRejected", "ScanWorkerDb"]

_DSN_ENV = "SCAN_WORKER_DSN"

# Exactly the RPCs the scan_worker role is granted.
_RPC_COMPLETE = "scan_worker_complete_task"
_RPC_FAIL = "scan_worker_fail_task"
_RPC_EVENT = "scan_worker_append_event"
_RPC_ROOM_FILE = "scan_worker_update_room_file"


class DbError(RuntimeError):
    """The database seam is unusable in this environment."""


class LeaseRejected(RuntimeError):
    """The ledger refused this write — stale lease, or an already-terminal task."""


class ScanWorkerDb:
    """A short-lived connection wrapper over the four scan_worker RPCs."""

    def __init__(self, conn: Any):
        self._conn = conn

    @classmethod
    def from_env(cls) -> "ScanWorkerDb":
        dsn = os.environ.get(_DSN_ENV)
        if not dsn:
            raise DbError(f"{_DSN_ENV} is not set")
        import psycopg

        return cls(psycopg.connect(dsn, autocommit=True))

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass

    def __enter__(self) -> "ScanWorkerDb":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()

    # ── the four RPCs ────────────────────────────────────────────────────────

    def complete_task(self, task_id: str, result: dict[str, Any]) -> Any:
        """Terminal success. The lease check lives inside this RPC (see module docstring).

        A `false` return is the RPC's stale-lease rejection and is raised, not
        swallowed — a job that silently believes it completed is exactly the
        failure this guard exists to prevent.
        """
        outcome = self._call(_RPC_COMPLETE, (task_id, self._json(result)))
        if outcome is False:
            raise LeaseRejected(f"{_RPC_COMPLETE} rejected task {task_id} (stale lease or terminal)")
        return outcome

    def fail_task(self, task_id: str, error: str) -> Any:
        return self._call(_RPC_FAIL, (task_id, error))

    def append_event(
        self,
        scan_id: str,
        room_file_id: str | None,
        stage: str,
        event: str,
        status: str,
        duration_ms: int,
        detail: dict[str, Any] | None = None,
    ) -> Any:
        return self._call(
            _RPC_EVENT,
            (scan_id, room_file_id, stage, event, status, int(duration_ms), self._json(detail or {})),
        )

    def update_room_file(
        self,
        room_file_id: str,
        verify: dict[str, Any] | None,
        artifacts: dict[str, Any] | None,
    ) -> Any:
        return self._call(
            _RPC_ROOM_FILE,
            (room_file_id, self._json(verify), self._json(artifacts)),
        )

    # ── plumbing ─────────────────────────────────────────────────────────────

    @staticmethod
    def _json(value: Any) -> Any:
        if value is None:
            return None
        from psycopg.types.json import Jsonb

        return Jsonb(value)

    def _call(self, rpc: str, params: tuple[Any, ...]) -> Any:
        from psycopg import sql

        placeholders = sql.SQL(", ").join(sql.Placeholder() * len(params))
        statement = sql.SQL("SELECT {}({})").format(sql.Identifier(rpc), placeholders)
        with self._conn.cursor() as cur:
            cur.execute(statement, params)
            row = cur.fetchone()
        return row[0] if row else None
