"""Stage registry dispatch + the NOT-IMPLEMENTED stubs park fatally."""

from __future__ import annotations

import pytest

from patina_scan_worker.errors import StageNotImplemented
from patina_scan_worker.stages import get_handler, known_task_types
from patina_scan_worker.stages.base import Context


class _NullTelemetry:
    def emit(self, *a, **k):  # swallow — stubs emit a *.failed event before raising
        pass


def _ctx() -> Context:
    return Context(
        settings=None, queue=None, storage=None, db=None, telemetry=_NullTelemetry()
    )


def test_registry_has_three_stages():
    assert known_task_types() == [
        "scan_pipeline.drawings",
        "scan_pipeline.ingest",
        "scan_pipeline.solve",
    ]


def test_get_handler_unknown_returns_none():
    assert get_handler("scan_pipeline.splat") is None
    assert get_handler("something.else") is None


def test_ingest_handler_registered():
    h = get_handler("scan_pipeline.ingest")
    assert h is not None and h.stage == "ingest"


@pytest.mark.parametrize(
    "task_type,stage",
    [("scan_pipeline.solve", "solve"), ("scan_pipeline.drawings", "drawing")],
)
def test_stub_stages_park_fatally(task_type, stage):
    h = get_handler(task_type)
    assert h is not None
    task = {"id": "t1", "task_type": task_type, "payload": {"scan_id": "s1"}}
    with pytest.raises(StageNotImplemented) as ei:
        h.run(_ctx(), task)
    # StageNotImplemented is fatal → the worker parks it (no retry loop).
    assert ei.value.fatal is True
