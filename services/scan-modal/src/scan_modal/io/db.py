"""Direct Postgres from Modal, as the `scan_worker` role. Never `service_role`.

Per DELIVERY-PLAN R2 the connection string is a Modal Secret (`SCAN_WORKER_DSN`)
for a LOGIN role whose grants are exactly the four RPCs below. Nothing here
touches a table directly, so a leaked Modal credential reaches the scan RPCs and
nothing else.

──────────────────────────────────────────────────────────────────────────────
IDEMPOTENCY / LEASE GUARD — the lease token, and what it costs
──────────────────────────────────────────────────────────────────────────────
Every one of the four RPCs takes the `lease_token` this invocation was
dispatched with — the per-invocation id the edge dispatcher used as
`claim_agent_tasks`' `p_worker`. 00490's wrappers compare it against the task
row's current `locked_by` (`SELECT ... FOR UPDATE`, so the check and the write
share one lock) and refuse a mismatch with SQLSTATE **P0403**, which `_call`
below raises as `LeaseRejected`.

That dedicated code is the whole point. A stale invocation — one whose lease
expired and was re-claimed by a later dispatcher tick — must be able to tell
"my lease is gone" apart from "the stage failed". If it read a generic error it
would call `fail_task`, requeueing a task another worker is actively running,
and the next tick would spawn a second GPU job for it. So `LeaseRejected` is
never treated as a failure: `jobs/verify_job.py` logs one line and exits, and
writes nothing.

The first statement of the job is still `append_event(... 'started' ...)` — but
it is now lease-gated too, so a stale invocation is rejected at its FIRST
statement rather than after the whole stage has run. The observable-claim
property survives (a genuine duplicate under one live lease still leaves two
`started` rows); the wasted compute mostly does not.

RPC names are schema-qualified (`public.<name>`) rather than bare: the
`scan_worker_login` role's `search_path` is whatever the connection string
happens to set, and a bare name would resolve against it.
"""

from __future__ import annotations

import os
from typing import Any

__all__ = ["DbError", "LeaseRejected", "StaleVersion", "ScanWorkerDb"]

_DSN_ENV = "SCAN_WORKER_DSN"

# Exactly the RPCs the scan_worker role is granted, schema-qualified.
_SCHEMA = "public"
_RPC_COMPLETE = "scan_worker_complete_task"
_RPC_FAIL = "scan_worker_fail_task"
_RPC_EVENT = "scan_worker_append_event"
_RPC_ROOM_FILE = "scan_worker_update_room_file"
# The 00489 media registry — also granted to scan_worker. No lease parameter:
# these RPCs are bound to the object key, not to a task.
_RPC_REGISTER_MEDIA = "register_media_object"
_RPC_MARK_MEDIA = "mark_media_object_state"

# 00490 raises the lease mismatch with this SQLSTATE, and nothing else does.
LEASE_REJECTED_SQLSTATE = "P0403"
# 00492 raises the version-monotonicity refusal with this one, and nothing else
# does. Deliberately a DIFFERENT code from P0403: "your lease is gone" and "the
# room file you were dispatched for has been superseded" are different facts,
# and a stage that could not tell them apart would report the wrong one.
STALE_VERSION_SQLSTATE = "P0404"


class DbError(RuntimeError):
    """The database seam is unusable in this environment."""


class LeaseRejected(RuntimeError):
    """The ledger refused this write — stale lease, or an already-terminal task."""


class StaleVersion(RuntimeError):
    """The target room_file is no longer the newest version for its scan.

    A newer solve has produced a newer room_file since this task was dispatched,
    so whatever this invocation computed is about superseded geometry. Treated
    exactly like `LeaseRejected` by the job glue: exit clean, write nothing, and
    never `fail_task` — the work is obsolete, not broken, and requeueing it
    would just spend another GPU hour reproducing the same obsolete answer.
    """


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

    # ── the four RPCs — every one carries the lease token ────────────────────

    def complete_task(self, task_id: str, lease_token: str, result: dict[str, Any]) -> Any:
        """Terminal success. The lease check lives inside this RPC (see module docstring).

        A `false` return is the RPC's stale-lease rejection and is raised, not
        swallowed — a job that silently believes it completed is exactly the
        failure this guard exists to prevent.
        """
        outcome = self._call(_RPC_COMPLETE, (task_id, lease_token, self._json(result)))
        if outcome is False:
            raise LeaseRejected(f"{_RPC_COMPLETE} rejected task {task_id} (stale lease or terminal)")
        return outcome

    def fail_task(self, task_id: str, lease_token: str, error: str) -> Any:
        return self._call(_RPC_FAIL, (task_id, lease_token, error))

    def append_event(
        self,
        task_id: str,
        lease_token: str,
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
            (
                task_id, lease_token, scan_id, room_file_id, stage, event, status,
                int(duration_ms), self._json(detail or {}),
            ),
        )

    def update_room_file(
        self,
        task_id: str,
        lease_token: str,
        room_file_id: str,
        verify: dict[str, Any] | None,
        artifacts: dict[str, Any] | None,
    ) -> Any:
        return self._call(
            _RPC_ROOM_FILE,
            (task_id, lease_token, room_file_id, self._json(verify), self._json(artifacts)),
        )

    # ── the 00489 media registry (no lease parameter — see _RPC_REGISTER_MEDIA) ──

    def register_media_object(
        self,
        bucket: str,
        object_key: str,
        access_class: str,
        sha256: str | None = None,
        etag: str | None = None,
        mime: str | None = None,
        size_bytes: int | None = None,
        scan_id: str | None = None,
        owner_user_id: str | None = None,
        provenance: dict[str, Any] | None = None,
    ) -> Any:
        """Upsert the registry row for one artifact key; returns its object id.

        Called BEFORE the bytes are proved: the RPC lands the row `pending`, and
        `mark_media_object_state(..., 'stored')` is what asserts the object
        actually exists in R2. Registering after the PUT instead would leave an
        orphaned object with no row if the process died between the two.
        """
        return self._call(
            _RPC_REGISTER_MEDIA,
            (
                bucket, object_key, access_class, sha256, etag, mime,
                size_bytes, scan_id, owner_user_id, self._json(provenance or {}),
            ),
        )

    def mark_media_object_state(
        self,
        object_id: str,
        state: str,
        sha256: str | None = None,
        etag: str | None = None,
        size_bytes: int | None = None,
    ) -> Any:
        return self._call(_RPC_MARK_MEDIA, (object_id, state, sha256, etag, size_bytes))

    # ── plumbing ─────────────────────────────────────────────────────────────

    @staticmethod
    def _json(value: Any) -> Any:
        if value is None:
            return None
        from psycopg.types.json import Jsonb

        return Jsonb(value)

    def _call(self, rpc: str, params: tuple[Any, ...]) -> Any:
        import psycopg
        from psycopg import sql

        placeholders = sql.SQL(", ").join(sql.Placeholder() * len(params))
        statement = sql.SQL("SELECT {}({})").format(
            sql.Identifier(_SCHEMA, rpc), placeholders
        )
        try:
            with self._conn.cursor() as cur:
                cur.execute(statement, params)
                row = cur.fetchone()
        except psycopg.Error as exc:
            # The lease is gone. Surfaced as its own type so callers never
            # mistake it for a stage failure and requeue live work.
            sqlstate = getattr(exc, "sqlstate", None)
            if sqlstate == LEASE_REJECTED_SQLSTATE:
                raise LeaseRejected(f"{rpc} refused: lease no longer held") from exc
            if sqlstate == STALE_VERSION_SQLSTATE:
                raise StaleVersion(f"{rpc} refused: room file superseded by a newer version") from exc
            raise
        return row[0] if row else None
