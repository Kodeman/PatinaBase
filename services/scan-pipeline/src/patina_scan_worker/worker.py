"""The claim → dispatch → complete loop.

All retry logic lives in the queue (00297); the worker classifies each error and
calls complete_agent_task with the right p_fatal (design §7). Every claim batch
uses a fresh UUID-backed identity prefixed by WORKER_ID, so a second worker
claims disjoint tasks with zero coordination (claim_agent_tasks uses FOR UPDATE
SKIP LOCKED) — the burst-ready proof.
"""

from __future__ import annotations

import logging
import shutil
import time
from typing import Any

from .config import Settings
from .db import DbClient
from .errors import WorkerError
from .http import build_session
from .queue import QueueClient
from .stages import get_handler
from .stages.base import Context
from .storage import StorageClient
from .telemetry import Telemetry

log = logging.getLogger("patina_scan_worker.worker")


def _task_lease_owner(task: dict[str, Any]) -> str:
    owner = task.get("_lease_owner")
    if not isinstance(owner, str) or not owner.strip():
        raise RuntimeError("claimed task is missing its immutable _lease_owner")
    return owner


def build_context(settings: Settings) -> Context:
    session = build_session(settings)
    return Context(
        settings=settings,
        queue=QueueClient(session, settings),
        storage=StorageClient(session, settings),
        db=DbClient(session, settings),
        telemetry=Telemetry(session, settings),
    )


def prune_work_dir(settings: Settings) -> int:
    """Janitor: remove scratch scan dirs older than RETENTION_HOURS. Returns the
    count pruned. Best-effort — a prune error never blocks claiming."""
    import os

    root = settings.work_dir
    if not os.path.isdir(root):
        return 0
    cutoff = time.time() - settings.retention_hours * 3600
    pruned = 0
    for name in os.listdir(root):
        path = os.path.join(root, name)
        try:
            if os.path.getmtime(path) < cutoff:
                shutil.rmtree(path, ignore_errors=True)
                pruned += 1
        except OSError:
            continue
    return pruned


def process_one(ctx: Context, task: dict[str, Any]) -> str:
    """Run one claimed task to completion. Returns a short outcome string."""
    task_id = task["id"]
    task_type = task["task_type"]
    lease_owner = _task_lease_owner(task)
    handler = get_handler(task_type)
    if handler is None:
        completed = ctx.queue.complete_failed(
            task_id,
            f"no handler registered for {task_type}",
            fatal=True,
            lease_owner=lease_owner,
        )
        if not completed:
            return "lease-lost"
        log.error("task %s: no handler for %s — parked", task_id, task_type)
        return "no-handler"

    try:
        outcome = handler.run(ctx, task)
    except WorkerError as exc:
        completed = ctx.queue.complete_failed(
            task_id,
            str(exc),
            fatal=exc.fatal,
            artifacts={"failure_token": exc.token} if exc.token else {},
            lease_owner=lease_owner,
        )
        if not completed:
            return "lease-lost"
        log.warning(
            "task %s (%s): %s (fatal=%s)", task_id, task_type, exc, exc.fatal
        )
        return "fatal" if exc.fatal else "retry"
    except Exception as exc:  # unexpected — transient, let backoff/max handle it
        completed = ctx.queue.complete_failed(
            task_id,
            f"unexpected: {exc}",
            fatal=False,
            lease_owner=lease_owner,
        )
        if not completed:
            return "lease-lost"
        log.exception("task %s (%s): unexpected error", task_id, task_type)
        return "error"

    completed = ctx.queue.complete_done(
        task_id,
        outcome.artifacts,
        lease_owner=lease_owner,
    )
    if not completed:
        return "lease-lost"
    log.info("task %s (%s): done %s", task_id, task_type, outcome.artifacts)
    return "done"


def run(settings: Settings, once: bool = False) -> dict[str, int]:
    """Long-lived loop (``once=False``) or single claim-and-drain (``once=True``).

    Returns a tally of outcomes (useful for ``once`` / tests)."""
    ctx = build_context(settings)
    tally = {
        "done": 0,
        "fatal": 0,
        "retry": 0,
        "error": 0,
        "no-handler": 0,
        "lease-lost": 0,
        "batches": 0,
    }
    log.info(
        "worker %s starting: stages=%s poll=%ss batch=%s",
        settings.worker_id,
        ",".join(settings.stages),
        settings.poll_seconds,
        settings.max_concurrent,
    )
    while True:
        prune_work_dir(settings)
        tasks = ctx.queue.claim()
        if not tasks:
            if once:
                break
            time.sleep(settings.poll_seconds)
            continue
        tally["batches"] += 1
        log.info("worker %s claimed %d task(s)", settings.worker_id, len(tasks))
        for task in tasks:
            outcome = process_one(ctx, task)
            tally[outcome] = tally.get(outcome, 0) + 1
        if once:
            break
    return tally
