"""Rendered Room v2 W1 golden cases, at the JOB layer (`verify_job.run_verify`).

DELIVERY-PLAN.md W1: "Write golden cases for duplicate delivery, stale
room-file version, and lease expiry" plus the W1 exit bar's determinism test
("two runs over the same bundle produce identical residuals"). This module is
the catalog: one test (or documented xfail) per golden case, at the job layer
— fake DB + fake HTTP, no network, no Postgres — reusing test_verify_job.py's
fixtures (`payload`, `fetches`, `LEASE`, `RecordingDb`, `LeaseRejectingDb`)
rather than re-deriving them.

Case-by-case coverage already exists at finer grain in test_verify_job.py
(the lease-rejection parametrization in particular); this module exists so
the four W1 golden cases are named, grouped, and traceable to the plan in one
place, not scattered as incidental assertions.
"""

from __future__ import annotations

import json

import pytest

from scan_modal.io.db import (
    LEASE_REJECTED_SQLSTATE,
    STALE_VERSION_SQLSTATE,
    LeaseRejected,
    StaleVersion,
)
from scan_modal.jobs import verify_job

from test_verify_job import (  # noqa: F401 — `fetches` is a fixture, imported for pytest to resolve
    LEASE,
    LeaseRejectingDb,
    RecordingDb,
    fetches,
    payload,
)

# ─── golden case: duplicate delivery ───────────────────────────────────────
#
# Modal's own retry/at-least-once semantics (or an operator re-POSTing the
# same dispatch body by hand) can spawn the SAME task twice. The second
# invocation must hit the lease/task-binding gate 00490's wrappers enforce —
# scan_worker_complete_task returning `false` once the task has already gone
# terminal — and back off cleanly: no fail_task (that would requeue a task
# nobody is running), no second room_file write.


class StatefulDb(RecordingDb):
    """Models the ONE piece of real 00490 semantics this golden case needs:
    a task is claimed by exactly one `locked_by` lease at a time, and every
    RPC on it is refused (LeaseRejected, the P0403 mapping) once the task has
    gone terminal OR the lease token no longer matches — exactly the
    SELECT...FOR UPDATE + `locked_by` check every 00490 wrapper performs.
    Unlike `LeaseRejectingDb` (which force-rejects one named call), this
    tracks real state across MULTIPLE `run_verify` invocations against the
    same task — what a duplicate delivery actually looks like."""

    def __init__(self, task_id: str, lease_owner: str):
        super().__init__()
        self._task_id = task_id
        self._locked_by: str | None = lease_owner
        self._terminal = False

    def _check(self, task_id, lease_token) -> None:
        if task_id != self._task_id or self._terminal or lease_token != self._locked_by:
            raise LeaseRejected(f"task {task_id} refused: stale lease or terminal")

    def append_event(self, task_id, lease_token, *args, **kwargs):
        self._check(task_id, lease_token)
        return super().append_event(task_id, lease_token, *args, **kwargs)

    def update_room_file(self, task_id, lease_token, *args, **kwargs):
        self._check(task_id, lease_token)
        return super().update_room_file(task_id, lease_token, *args, **kwargs)

    def complete_task(self, task_id, lease_token, result):
        self._check(task_id, lease_token)
        out = super().complete_task(task_id, lease_token, result)
        self._terminal = True  # scan_worker_complete_task's effect: the task is now terminal
        return out


def test_duplicate_delivery_second_spawn_is_lease_rejected_no_double_write(fetches, capsys):
    """Two identical spawns of the same task/lease. The first completes
    normally; the second — Modal's own retry semantics, or a duplicate
    dispatch — finds the task already terminal and is refused at its first
    ledger write (LeaseRejected). No fail_task, no second room_file write,
    no second completion."""
    db = StatefulDb("task-1", LEASE)

    first = verify_job.run_verify(payload(), db=db)
    assert first["summary"]["walls_checked"] == 4
    assert len(db.completed) == 1
    assert len(db.room_files) == 1

    second = verify_job.run_verify(payload(), db=db)

    assert second == {"skipped": "lease_rejected"}
    # THE assertion: no amplification. A duplicate delivery must never
    # requeue live work or write the ledger twice.
    assert db.failed == []
    assert len(db.completed) == 1
    assert len(db.room_files) == 1

    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "lease_rejected"


# ─── golden case: stale content (roomFileVersion) ──────────────────────────
#
# A task dispatched against an OLDER room_file than the scan's current one —
# a 25-minute stage racing a newer solve — must not merge results computed
# against superseded geometry. W1 recorded this as a strict xfail because
# nothing enforced it: `scan_worker_update_room_file` merged unconditionally
# by `room_file_id`, and `roomFileVersion` was only ever telemetry.
#
# 00492 closes it. The RPC now reads the target room file's own `version` and
# refuses (dedicated ERRCODE **P0404**) unless it is still `max(version)` for
# its `scan_id` — the check and the merge share one `FOR UPDATE` lock, so a
# newer room file landing concurrently cannot slip between them.
#
# The lease gate does NOT cover this case, which is why it needed its own:
# a lease proves the CALLER is still the live worker for its task; it says
# nothing about whether the GEOMETRY that task was dispatched for is current.
# Both tasks can hold perfectly valid leases on different rows at once.
#
# The RESPONSE is the same as a lost lease and for a related reason: the work
# is obsolete, not broken. Failing the task would requeue it, and the next
# dispatcher tick would spend another GPU run reproducing the same obsolete
# answer.


class StaleVersionDb(RecordingDb):
    """The ledger 00492 describes: the room file this task names is no longer
    the newest for its scan, so `scan_worker_update_room_file` raises P0404 —
    which `scan_modal.io.db._call` maps to `StaleVersion`."""

    def update_room_file(self, task_id, lease_token, *args, **kwargs):
        raise StaleVersion(
            "scan_worker_update_room_file refused: room file superseded by a newer version"
        )


def test_a_superseded_room_file_version_is_refused_and_exits_clean(fetches, capsys):
    db = StaleVersionDb()

    result = verify_job.run_verify(payload(roomFileVersion=2), db=db)

    assert result == {"skipped": "stale_version"}
    # THE assertion the W1 xfail was holding open: the stale write never lands.
    assert db.room_files == [], "a superseded roomFileVersion write must be refused"
    # And it is not treated as a failure — no requeue, no second GPU run.
    assert db.failed == []
    assert db.completed == []
    # The started event ran before the refusal and stands.
    assert db.events[0] == ("verify", "started", "started")

    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "stale_version"
    assert line["taskId"] == "task-1"
    assert line["roomFileVersion"] == 2


def test_stale_version_and_lease_rejection_are_distinguishable(fetches):
    """Two different facts, two different SQLSTATEs, two different markers.
    A worker that could not tell them apart would report the wrong cause."""
    assert STALE_VERSION_SQLSTATE == "P0404"
    assert LEASE_REJECTED_SQLSTATE == "P0403"
    assert STALE_VERSION_SQLSTATE != LEASE_REJECTED_SQLSTATE

    stale = verify_job.run_verify(payload(), db=StaleVersionDb())
    lost = verify_job.run_verify(payload(), db=LeaseRejectingDb("update_room_file"))
    assert stale == {"skipped": "stale_version"}
    assert lost == {"skipped": "lease_rejected"}


# ─── golden case: lease expiry mid-run ─────────────────────────────────────
#
# The lease can expire and be re-claimed by a later dispatcher tick WHILE
# this invocation is mid-run. The job's own writes up to that point (already
# accepted under a lease that was still live) stand; only the call that finds
# the lease gone is refused — and it is refused with the dedicated P0403
# SQLSTATE 00490 raises for exactly this, which `scan_modal.io.db` maps to
# `LeaseRejected`. The job must exit clean: no fail_task (that would requeue
# a task another worker's later claim now owns).


def test_lease_expiry_mid_run_is_p0403_mapped_and_exits_clean(fetches):
    assert LEASE_REJECTED_SQLSTATE == "P0403"  # the mapping this whole case rests on

    db = LeaseRejectingDb("complete_task")
    result = verify_job.run_verify(payload(), db=db)

    assert result == {"skipped": "lease_rejected"}
    # The started/completed events and the room_file write ran under a lease
    # that was still live — those stand. Only completion, the point the
    # lease had moved on by, was refused.
    assert db.events[0] == ("verify", "started", "started")
    assert db.room_files, "writes accepted before the lease expired must stand"
    assert db.failed == [], "a stale invocation must never fail a task it no longer owns"
    assert db.completed == []


# ─── golden case: determinism ───────────────────────────────────────────────
#
# The W1 exit bar (DELIVERY-PLAN.md): "two runs over the same bundle produce
# identical residuals." test_verify_core.py already proves this at the pure
# geometry-core layer; this proves it survives the JOB layer too — the same
# dispatch payload, run twice through `run_verify` end to end (download →
# parse → verify_room → to_dict), produces a byte-identical verify document.


def test_two_full_job_runs_produce_byte_identical_verify_docs(fetches):
    db_a = RecordingDb()
    db_b = RecordingDb()

    doc_a = verify_job.run_verify(payload(taskId="task-a"), db=db_a)
    doc_b = verify_job.run_verify(payload(taskId="task-b"), db=db_b)

    assert json.dumps(doc_a, sort_keys=True) == json.dumps(doc_b, sort_keys=True)
    # And what actually got merged onto room_files is the same document too.
    assert db_a.room_files[0][1] == db_b.room_files[0][1]
