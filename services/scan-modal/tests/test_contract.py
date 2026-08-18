"""The cross-language dispatch contract.

`supabase/functions/dispatch-scan-modal/contract.json` is ONE canonical example
body, read by both sides: the Deno test asserts the dispatcher BUILDS it, this
one asserts the Modal side ACCEPTS it. Neither half owns the file, so neither
can drift alone.

It is worth the machinery because the drift already happened once, silently and
in the worst possible place: the dispatcher sent
`inputs.meshUrl`/`inputs.capturedRoomJsonUrl` while `verify_job` read
`inputs.meshPlyUrl`/`inputs.capturedRoomUrl`. Both sides' own tests were green.
Every dispatched job would have raised InputError on a payload that was, by its
own author's lights, correct.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scan_modal import app as modal_app
from scan_modal.jobs import verify_job

# tests/ → scan-modal/ → services/ → repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_CONTRACT = _REPO_ROOT / "supabase" / "functions" / "dispatch-scan-modal" / "contract.json"


def load_contract() -> dict:
    body = json.loads(_CONTRACT.read_text())
    body.pop("_comment", None)
    return body


def test_the_contract_file_is_where_both_sides_look():
    assert _CONTRACT.is_file(), f"contract not found at {_CONTRACT}"


def test_parse_spawn_body_accepts_the_contract():
    payload, reason = modal_app.parse_spawn_body(load_contract())

    assert reason == "ok"
    assert payload is not None
    # Every field the endpoint forwards to the job is present and carried through.
    contract = load_contract()
    for field in ("taskId", "leaseToken", "scanId", "roomFileId", "roomFileVersion",
                  "taskType", "traceId"):
        assert payload[field] == contract[field]
    assert payload["inputs"] == contract["inputs"]


def test_the_contract_spawns_the_verify_function():
    calls: list[tuple[str, dict]] = []
    status, content = modal_app.handle_spawn(
        {"Authorization": "Bearer tok"},
        load_contract(),
        lambda name, payload: calls.append((name, payload)),
        expected_token="tok",
    )

    assert status == 202
    assert content["spawned"] is True
    assert calls[0][0] == "verify"


def test_verify_job_finds_the_contract_input_keys(monkeypatch):
    """The half that actually drifted: the job must read the keys the contract
    carries, not keys of its own invention."""
    contract = load_contract()
    fetched: list[str] = []

    def fake_fetch(url: str) -> bytes:
        fetched.append(url)
        raise _StopHere()

    monkeypatch.setattr(verify_job, "_fetch", fake_fetch)

    class _RecordingDb:
        def append_event(self, *a, **k):
            return None

        def fail_task(self, *a, **k):
            return None

        def close(self):
            return None

    with pytest.raises(_StopHere):
        verify_job.run_verify(contract, db=_RecordingDb())

    # It got past the input check and reached the network with the contract's
    # own URLs — which is only possible if it read the contract's key names.
    assert fetched, "verify_job never resolved an input URL from the contract"
    assert set(fetched) <= set(contract["inputs"].values())


class _StopHere(RuntimeError):
    """Cuts the job off at the first download — the contract check is upstream
    of any real geometry work."""


@pytest.mark.parametrize(
    "field",
    ["taskId", "leaseToken", "scanId", "roomFileId", "roomFileVersion", "taskType"],
)
def test_the_contract_carries_every_required_field(field):
    contract = load_contract()
    assert field in contract
    del contract[field]
    payload, reason = modal_app.parse_spawn_body(contract)
    assert payload is None and field in reason
