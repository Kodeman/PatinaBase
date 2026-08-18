"""scan_pipeline.drawings stage integration: exercises DrawingsStage.run()
end to end against fake db/storage/telemetry, and asserts the ``drawings``
manifest gains an ``ifc`` entry (item 11 + the W2 IFC lane). The degrade path
does NOT need ifcopenshell installed (build_ifc is monkeypatched out); the
happy path does, so it is skip-guarded the same way tests/test_ifc.py is."""

from __future__ import annotations

import json

import pytest

from patina_scan_worker.config import Settings
from patina_scan_worker.stages.base import Context
from patina_scan_worker.stages.drawings import DrawingsStage
from _synthetic import rectangular_room

USER_ID = "11111111-1111-1111-1111-111111111111"
ROOM_ID = "22222222-2222-2222-2222-222222222222"
SCAN_ID = "33333333-3333-3333-3333-333333333333"
ROOM_FILE_ID = "44444444-4444-4444-4444-444444444444"


class FakeStorage:
    def __init__(self, captured_room_json: dict):
        self._captured_room_json = captured_room_json
        self.uploaded: dict[str, bytes] = {}

    def download_to(self, key: str, path: str) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self._captured_room_json, fh)

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.uploaded[key] = data


class FakeDb:
    def __init__(self, scan_row: dict, room_file_row: dict):
        self._scan_row = scan_row
        self._room_file_row = dict(room_file_row)
        self.finalized: dict | None = None
        self.errors: list[str] = []

    def get_room_scan(self, scan_id: str) -> dict:
        return self._scan_row

    def get_room_file(self, room_file_id: str) -> dict:
        return self._room_file_row

    def get_measurements(self, room_file_id: str) -> list:
        return []

    def finalize_room_file_generated(self, room_file_id, svg_url, pdf_url, dxf_url, drawings):
        self.finalized = {
            "svg_url": svg_url, "pdf_url": pdf_url, "dxf_url": dxf_url,
            "drawings": drawings,
        }
        self._room_file_row["status"] = "generated"
        return True

    def mark_room_file_error(self, room_file_id: str, error: str) -> None:
        self.errors.append(error)


class FakeTelemetry:
    def __init__(self):
        self.events: list[tuple] = []

    def emit(self, *args, **kwargs):
        self.events.append((args, kwargs))


def _ctx(tmp_path) -> tuple[Context, FakeDb, FakeStorage, FakeTelemetry]:
    scan_row = {
        "id": SCAN_ID, "user_id": USER_ID, "room_id": ROOM_ID,
        "name": "Living Room",
        "bundle_manifest_url": f"manifests/{USER_ID}/{ROOM_ID}/manifest.json",
        "captured_room_json_url": f"captured_room/{USER_ID}/{ROOM_ID}/captured_room.json",
    }
    room_file_row = {
        "id": ROOM_FILE_ID, "scan_id": SCAN_ID, "version": 1,
        "status": "solved", "tolerance_class": "estimated",
        "certificate": {
            "scale": 1.0, "unverified": False, "anchor_count": 0,
            "floor_area_sqft": 200.0, "dimension_counts": {"measured": 4},
        },
    }
    captured_room_json = rectangular_room(0, 4, 0, 5, 2.7, with_door=True)
    settings = Settings(
        worker_id="test", supabase_url="https://example.supabase.co",
        service_role_key="test-key", work_dir=str(tmp_path),
    )
    db = FakeDb(scan_row, room_file_row)
    storage = FakeStorage(captured_room_json)
    telemetry = FakeTelemetry()
    ctx = Context(settings=settings, queue=None, storage=storage, db=db, telemetry=telemetry)
    return ctx, db, storage, telemetry


def _task():
    return {"payload": {
        "scan_id": SCAN_ID, "room_file_id": ROOM_FILE_ID, "room_file_version": 1,
    }}


def test_drawings_manifest_gains_ifc_entry_on_success(tmp_path):
    pytest.importorskip("ifcopenshell")
    ctx, db, storage, _telemetry = _ctx(tmp_path)

    outcome = DrawingsStage().run(ctx, _task())

    assert outcome.artifacts["ifc_url"] is not None
    drawings = db.finalized["drawings"]
    ifc_entries = [a for a in drawings["artifacts"] if a["kind"] == "ifc"]
    assert len(ifc_entries) == 1
    assert ifc_entries[0]["status"] == "generated"
    assert ifc_entries[0]["url"] == outcome.artifacts["ifc_url"]
    assert ifc_entries[0]["sha256"]
    ifc_key = next(k for k in storage.uploaded if k.endswith("/room.ifc"))
    assert storage.uploaded[ifc_key].startswith(b"ISO-10303-21;")


def test_drawings_stage_degrades_when_ifc_generation_fails(tmp_path, monkeypatch):
    """A model that trips IFC generation must still leave the stage
    successful — svg/pdf/dxf generation and room_files.status='generated'
    are unaffected — with the manifest's ifc entry flagged 'skipped'."""
    ctx, db, storage, telemetry = _ctx(tmp_path)

    def _boom(model, meta):
        raise RuntimeError("synthetic IFC failure")

    monkeypatch.setattr("patina_scan_worker.stages.drawings.ifc_mod.build_ifc", _boom)

    outcome = DrawingsStage().run(ctx, _task())

    assert outcome.artifacts["ifc_url"] is None
    assert outcome.artifacts["svg_url"] and outcome.artifacts["dxf_url"]
    assert db.finalized is not None                 # core sheet set still committed
    assert db._room_file_row["status"] == "generated"
    assert not db.errors                             # not a fatal room_file error

    drawings = db.finalized["drawings"]
    ifc_entries = [a for a in drawings["artifacts"] if a["kind"] == "ifc"]
    assert len(ifc_entries) == 1
    assert ifc_entries[0]["status"] == "skipped"
    assert "synthetic IFC failure" in ifc_entries[0]["error"]
    assert not any(k.endswith("/room.ifc") for k in storage.uploaded)

    # event detail flag, per the degrade contract in stages/drawings.py.
    skip_events = [
        (a, kw) for (a, kw) in telemetry.events
        if len(a) > 2 and a[2] == "drawings.ifc_skipped"
    ]
    assert len(skip_events) == 1
    _, kwargs = skip_events[0]
    assert kwargs["detail"]["ifc_skipped"] is True


def test_drawings_rendered_event_formats_include_ifc_on_success(tmp_path):
    pytest.importorskip("ifcopenshell")
    ctx, _db, _storage, telemetry = _ctx(tmp_path)

    DrawingsStage().run(ctx, _task())

    rendered = [
        (a, kw) for (a, kw) in telemetry.events
        if len(a) > 2 and a[2] == "drawings.rendered"
    ]
    assert len(rendered) == 1
    _, kwargs = rendered[0]
    assert "ifc" in kwargs["detail"]["formats"]
    assert kwargs["detail"]["ifc_skipped"] is False
