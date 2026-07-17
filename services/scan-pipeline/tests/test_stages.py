"""Stage registry dispatch — all three stages are now implemented."""

from __future__ import annotations

from patina_scan_worker.stages import get_handler, known_task_types


def test_registry_has_three_stages():
    assert known_task_types() == [
        "scan_pipeline.drawings",
        "scan_pipeline.ingest",
        "scan_pipeline.solve",
    ]


def test_get_handler_unknown_returns_none():
    assert get_handler("scan_pipeline.splat") is None
    assert get_handler("something.else") is None


def test_all_handlers_registered():
    assert get_handler("scan_pipeline.ingest").stage == "ingest"       # item 9
    assert get_handler("scan_pipeline.solve").stage == "solve"         # item 10
    assert get_handler("scan_pipeline.drawings").stage == "drawing"    # item 11
