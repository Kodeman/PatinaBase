"""PostgREST RPC client for the ``agent_tasks`` queue (00297 + 00378).

The worker holds a service-role client (the queue RPCs are granted to
service_role only). This wraps the five RPCs the worker calls:
claim / complete / enqueue (successor) / requeue / stats. It NEVER touches the
human-review states (awaiting_review/approved/rejected) and always leaves
``assignee`` NULL — a scan job has no human owner (design §2.1).

Lost-race guard (M1): a job whose lease expired (VISIBILITY_TIMEOUT) can be
re-claimed and completed by a second worker while this one is still finishing.
The completing RPC then rejects with the stable "lease ownership rejected"
message (or a terminal/not-found message if the new owner already finished).
That is a benign race, not a crash: the completion methods swallow it, log a
warning naming both workers, and let the loop continue.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from typing import Any

import httpx

from .config import Settings
from .errors import TransientError

log = logging.getLogger("patina_scan_worker.queue")

# Substrings in a complete_agent_task rejection that mean "someone else owns this
# task now" — a lost race, not an error (00378 plus 00297 terminal messages).
_LOST_RACE_MARKERS = ("lease ownership rejected", "must be running", "not found")


class LostRaceError(RuntimeError):
    """A queue write was rejected because the task is no longer this worker's to
    complete (re-claimed after a lease expiry). Benign — handled, never crashes
    the loop."""


class QueueClient:
    def __init__(
        self,
        session: httpx.Client,
        settings: Settings,
        lease_id_factory: Callable[[], str] | None = None,
    ):
        self._s = session
        self._cfg = settings
        self._lease_id_factory = lease_id_factory or (lambda: str(uuid.uuid4()))

    def _new_lease_owner(self) -> str:
        raw_suffix = self._lease_id_factory()
        if not isinstance(raw_suffix, str) or not raw_suffix.strip():
            raise RuntimeError("lease identity factory returned an empty value")
        suffix = raw_suffix.strip()
        return f"{self._cfg.worker_id}:{suffix}"

    def _require_lease_owner(self, lease_owner: str) -> str:
        if not isinstance(lease_owner, str):
            raise RuntimeError(
                "completion lease owner must be the exact base-prefixed identity "
                "carried by a task returned from claim()"
            )
        owner = lease_owner.strip()
        prefix = f"{self._cfg.worker_id}:"
        if not owner.startswith(prefix) or len(owner) == len(prefix):
            raise RuntimeError(
                "completion lease owner must be the exact base-prefixed identity "
                "carried by a task returned from claim()"
            )
        return owner

    def _rpc(self, name: str, body: dict[str, Any]) -> Any:
        try:
            resp = self._s.post(f"/rest/v1/rpc/{name}", json=body)
        except httpx.HTTPError as exc:  # network blip → transient
            raise TransientError(f"rpc {name}: {exc}") from exc
        if resp.status_code >= 500:
            raise TransientError(f"rpc {name} -> {resp.status_code}: {resp.text[:300]}")
        if resp.status_code >= 400:
            text = resp.text[:400]
            if any(m in text for m in _LOST_RACE_MARKERS):
                raise LostRaceError(f"rpc {name}: {text}")
            # any other 4xx is a contract/permission problem — surface loudly.
            raise RuntimeError(f"rpc {name} -> {resp.status_code}: {text}")
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def _current_holder(self, task_id: str) -> str:
        """Best-effort: who owns the task now (for the lost-race warning)."""
        try:
            resp = self._s.get(
                f"/rest/v1/agent_tasks?id=eq.{task_id}&select=locked_by,status"
            )
            if resp.status_code < 400 and resp.json():
                row = resp.json()[0]
                return f"{row.get('locked_by') or '<none>'}/{row.get('status')}"
        except (httpx.HTTPError, ValueError, KeyError, IndexError):
            pass
        return "<unknown>"

    # ── claim ───────────────────────────────────────────────────────────────
    def claim(self) -> list[dict[str, Any]]:
        """Atomically lease up to MAX_CONCURRENT queued/stale-running tasks whose
        task_type is in this worker's STAGES. FOR UPDATE SKIP LOCKED in the RPC
        makes a second worker's claims disjoint with zero coordination. Every
        call creates a fresh, base-prefixed lease owner and carries it on each
        returned task for exact completion."""
        lease_owner = self._new_lease_owner()
        rows = self._rpc(
            "claim_agent_tasks",
            {
                "p_task_types": list(self._cfg.task_types),
                "p_batch": self._cfg.max_concurrent,
                "p_worker": lease_owner,
                "p_visibility_timeout": self._cfg.visibility_timeout,
            },
        )
        # Carry the immutable authority on each returned task. Do not look it
        # up later by task id: the same id may be reclaimed under a newer token
        # while an old task object is still finishing.
        return [{**row, "_lease_owner": lease_owner} for row in (rows or [])]

    # ── complete (lost-race-guarded) ──────────────────────────────────────────
    def complete_done(
        self,
        task_id: str,
        artifacts: dict[str, Any],
        *,
        lease_owner: str,
    ) -> bool:
        """Returns True if we completed it, False if we lost the race."""
        return self._guarded_complete(task_id, {
            "p_id": task_id,
            "p_outcome": "done",
            "p_artifacts": artifacts,
            "p_actor": self._require_lease_owner(lease_owner),
        })

    def complete_failed(
        self,
        task_id: str,
        error: str,
        fatal: bool,
        artifacts: dict[str, Any] | None = None,
        *,
        lease_owner: str,
    ) -> bool:
        return self._guarded_complete(task_id, {
            "p_id": task_id,
            "p_outcome": "failed",
            "p_error": error[:2000],
            "p_fatal": fatal,
            "p_artifacts": artifacts or {},
            "p_actor": self._require_lease_owner(lease_owner),
        })

    def _guarded_complete(self, task_id: str, body: dict[str, Any]) -> bool:
        try:
            self._rpc("complete_agent_task", body)
            return True
        except LostRaceError as exc:
            log.warning(
                "worker %s lost the race completing task %s (now %s) — another "
                "worker owns it; skipping. (%s)",
                body["p_actor"], task_id, self._current_holder(task_id), exc,
            )
            return False

    # ── enqueue successor (lost-race-guarded) ─────────────────────────────────
    def enqueue_successor(
        self,
        task_type: str,
        payload: dict[str, Any],
        entity_id: str,
        idempotency_key: str,
        parent_task_id: str,
        *,
        lease_owner: str,
    ) -> dict[str, Any] | None:
        """Enqueue the next stage. Idempotent on its own key; assignee stays
        NULL; source is 'scan-pipeline'; entity_type 'room_scan' (design §2.1).
        Guarded so a concurrent completer never turns this into a crash."""
        try:
            return self._rpc(
                "enqueue_agent_task",
                {
                    "p_task_type": task_type,
                    "p_payload": payload,
                    "p_source": "scan-pipeline",
                    "p_entity_type": "room_scan",
                    "p_entity_id": entity_id,
                    "p_idempotency_key": idempotency_key,
                    "p_max_attempts": self._cfg.max_attempts,
                    "p_on_conflict": "ignore",
                    "p_parent_task_id": parent_task_id,
                    "p_actor": self._require_lease_owner(lease_owner),
                },
            )
        except LostRaceError as exc:
            log.warning(
                "worker %s: successor enqueue for %s hit a lost race (%s) — the "
                "idempotency key makes this a no-op; continuing.",
                self._require_lease_owner(lease_owner), idempotency_key, exc,
            )
            return None

    # ── requeue (operator re-run of a parked failed task) ─────────────────────
    def requeue(self, task_id: str) -> dict[str, Any] | None:
        return self._rpc(
            "requeue_agent_task",
            {"p_id": task_id, "p_actor": self._new_lease_owner()},
        )

    # ── stats (doctor DB-reachability probe) ──────────────────────────────────
    def stats(self) -> Any:
        return self._rpc("agent_queue_stats", {})
