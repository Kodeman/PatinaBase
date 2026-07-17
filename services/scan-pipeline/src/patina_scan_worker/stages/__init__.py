"""Stage registry — the task_type → handler dispatch table.

This is the seam items 10 (solve) and 11 (drawings) slot into: each replaces its
NOT-IMPLEMENTED stub with a real handler; nothing else in the worker changes.
The registry is keyed by the fully-qualified ``scan_pipeline.<stage>`` task type
(design §2.1).
"""

from __future__ import annotations

from ..config import TASK_TYPE_PREFIX
from .drawings import DrawingsStage
from .ingest import IngestStage
from .solve import SolveStage

# task_type → handler instance. Handlers are stateless; the per-job Context is
# passed to run().
_REGISTRY = {
    f"{TASK_TYPE_PREFIX}ingest": IngestStage(),
    f"{TASK_TYPE_PREFIX}solve": SolveStage(),
    f"{TASK_TYPE_PREFIX}drawings": DrawingsStage(),
}


def get_handler(task_type: str):
    """Return the handler for a task type, or None if it is not a scan_pipeline
    stage this codebase knows (the worker should never have claimed it —
    claim_agent_tasks filters by the worker's STAGES)."""
    return _REGISTRY.get(task_type)


def known_task_types() -> list[str]:
    return sorted(_REGISTRY.keys())
