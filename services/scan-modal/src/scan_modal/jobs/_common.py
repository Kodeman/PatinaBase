"""Glue every scan_modal stage repeats: download, redact, release, log.

Extracted (not duplicated) because all three stages must behave IDENTICALLY on
the paths that matter operationally — a task must never stay claimed after a
genuine failure, and no persisted error may carry a signed URL. Three copies of
that is three chances to drift.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

__all__ = ["fetch", "redact", "error_text", "release", "log_skip", "DOWNLOAD_TIMEOUT_S"]

# Presigned URLs are already time-bounded; this bounds a hung origin.
DOWNLOAD_TIMEOUT_S = 300.0

# A signed URL's whole point is that its query string is a credential. Anything
# derived from an exception can carry one — httpx puts the full request URL in
# HTTPStatusError's message — and this text is persisted to
# `agent_tasks.last_error`, which is far more readable than the URL it would
# leak. Redact before persisting, not at some display layer.
_URL_RE = re.compile(r"https?://[^\s'\"<>]+")
# A bare storage key with a signature appended (no scheme). Anchored on a `/`
# so ordinary prose containing a question mark is left alone.
_BARE_QUERY_RE = re.compile(r"(/[^\s'\"<>?]*)\?[^\s'\"<>]*")


def fetch(url: str, timeout: float = DOWNLOAD_TIMEOUT_S) -> bytes:
    import httpx

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.content


def redact(text: str) -> str:
    return _BARE_QUERY_RE.sub(r"\1", _URL_RE.sub("[url]", text))


def error_text(stage: str) -> str:
    import sys
    import traceback

    exc = sys.exc_info()[1]
    if exc is None:
        return f"{stage} exited without completing"
    return redact("".join(traceback.format_exception_only(type(exc), exc)).strip())


def log_skip(stage: str, event: str, **fields: Any) -> None:
    """One structured line for a clean non-completion. Ids only — never a URL."""
    print(json.dumps({"fn": f"scan-modal-{stage}", "event": event, **fields}))


def release(
    db: Any, stage: str, task_id: Any, lease_token: Any, scan_id: Any,
    room_file_id: Any, detail: dict[str, Any], started: float,
) -> None:
    """Best-effort failure record. Every call is individually guarded: this runs
    from a `finally` during an exception unwind, so a second exception raised
    out of it would MASK the real one."""
    from ..io.db import ScanWorkerDb

    message = error_text(stage)
    own_db = False
    if db is None:
        # The connection itself is what failed. One fresh attempt, so a
        # transient connect error still gets recorded rather than leaving the
        # task to time out silently.
        try:
            db, own_db = ScanWorkerDb.from_env(), True
        except Exception:
            return
    try:
        elapsed = int((time.monotonic() - started) * 1000)
        try:
            db.append_event(task_id, lease_token, scan_id, room_file_id, stage,
                            "failed", "failed", elapsed, detail)
        except Exception:
            pass
        try:
            db.fail_task(task_id, lease_token, message)
        except Exception:
            pass
    finally:
        if own_db:
            db.close()
