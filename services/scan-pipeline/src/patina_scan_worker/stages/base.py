"""Shared stage plumbing: the per-job Context, the success StageOutcome, and the
BaseStage interface every handler implements.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..config import Settings
from ..db import DbClient
from ..queue import QueueClient
from ..storage import StorageClient
from ..telemetry import Telemetry


@dataclass
class Context:
    settings: Settings
    queue: QueueClient
    storage: StorageClient
    db: DbClient
    telemetry: Telemetry


@dataclass
class StageOutcome:
    """A successful stage's result. ``artifacts`` is merged into the agent_tasks
    row by ``complete_agent_task`` (design §8.2). The successor, if any, was
    already enqueued by the handler (design §2.3: enqueue BEFORE complete)."""

    artifacts: dict[str, Any] = field(default_factory=dict)


class BaseStage:
    #: coarse pipeline phase for scan_pipeline_events.stage (CHECK-bounded).
    stage: str = "ingest"

    def run(self, ctx: Context, task: dict[str, Any]) -> StageOutcome:
        raise NotImplementedError
