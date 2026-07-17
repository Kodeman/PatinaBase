"""Error taxonomy for the worker.

The queue owns all retry logic (00297). The worker's only job on failure is to
classify the error and call ``complete_agent_task`` with the right ``p_fatal``
(design §7):

  * TransientError  → complete(outcome='failed', p_fatal=False)  → backoff requeue
  * PermanentError  → complete(outcome='failed', p_fatal=True)   → parked, no retry

Validator failure tokens (design §2.4) map to permanence per the ingest rule
(design §2.3): a bad bundle will not get better on retry, so schema/checksum/
path/anchor/size/count problems are PERMANENT; a MISSING_FILE on a not-yet-
consistent storage read is TRANSIENT for a bounded number of attempts, then
PERMANENT.
"""

from __future__ import annotations


class WorkerError(Exception):
    """Base for classified worker failures. ``token`` is the stable failure
    name that lands in telemetry ``detail.failure_token``."""

    fatal: bool = False

    def __init__(self, message: str, token: str | None = None):
        super().__init__(message)
        self.token = token


class TransientError(WorkerError):
    """Network blip, storage eventual-consistency, lock contention — retry with
    backoff, same room_file_version."""

    fatal = False


class PermanentError(WorkerError):
    """Corrupt/invalid bundle, unsolvable geometry, poison — parked immediately,
    no further retries."""

    fatal = True


class StageNotImplemented(PermanentError):
    """A registered-but-not-yet-built stage was claimed. Fails FATALLY with a
    clear message (design: the stub visibly parks the task so items 10/11 slot
    in without changing the chain wiring)."""


# ── Validator token → permanence (design §2.3) ──────────────────────────────

# Content problems that a retry cannot fix.
PERMANENT_TOKENS: frozenset[str] = frozenset(
    {
        "MISSING_MANIFEST",
        "MANIFEST_PARSE",
        "SCHEMA_VIOLATION",
        "MISSING_ARTIFACT",
        "PATH_VIOLATION",
        "CHECKSUM_MISMATCH",
        "SIZE_MISMATCH",
        "ANCHOR_INCONSISTENCY",
        "KEYFRAME_INCONSISTENCY",
        "PHOTO_COUNT_MISMATCH",
        # server-side reconciliation (manifest hash vs uploader's per-PUT ledger)
        "ARTIFACTS_SHA256_MISMATCH",
    }
)

# MISSING_FILE is transient while storage may still be catching up, then fatal.
TRANSIENT_UNTIL_ATTEMPTS = 2


def classify_failures(
    tokens: list[str], attempts: int
) -> tuple[bool, str]:
    """Given the set of validator/reconciliation tokens raised for a bundle and
    the task's current attempt count, decide ``(is_fatal, reason)``.

    * Any PERMANENT token → fatal immediately.
    * Only MISSING_FILE token(s) → transient until ``TRANSIENT_UNTIL_ATTEMPTS``
      attempts have elapsed (storage eventual consistency), then fatal.
    * Empty token list is a programming error — callers must not call this on a
      clean bundle.
    """
    if not tokens:
        raise ValueError("classify_failures called with no failure tokens")

    unique = sorted(set(tokens))
    permanent = [t for t in unique if t in PERMANENT_TOKENS]
    if permanent:
        return True, f"permanent bundle failure(s): {', '.join(unique)}"

    if unique == ["MISSING_FILE"]:
        if attempts >= TRANSIENT_UNTIL_ATTEMPTS:
            return True, (
                f"MISSING_FILE persisted past {TRANSIENT_UNTIL_ATTEMPTS} attempts "
                f"(attempt {attempts}) — treating as fatal"
            )
        return False, f"MISSING_FILE (attempt {attempts}) — transient, will retry"

    # Mixed or unknown tokens: be conservative — treat as fatal so a poison
    # bundle never loops. (Unknown tokens shouldn't occur; the validator's set
    # is closed.)
    return True, f"unclassified bundle failure(s), treating as fatal: {', '.join(unique)}"
