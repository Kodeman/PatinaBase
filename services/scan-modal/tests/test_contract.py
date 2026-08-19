"""The cross-language dispatch contract.

`supabase/functions/dispatch-scan-modal/contract.json` holds ONE canonical
example body PER STAGE, read by both sides: the Deno test asserts the dispatcher
BUILDS them, this one asserts the Modal side ACCEPTS them. Neither half owns the
file, so neither can drift alone.

It is worth the machinery because the drift already happened once, silently and
in the worst possible place: the dispatcher sent
`inputs.meshUrl`/`inputs.capturedRoomJsonUrl` while `verify_job` read
`inputs.meshPlyUrl`/`inputs.capturedRoomUrl`. Both sides' own tests were green.
Every dispatched job would have raised InputError on a payload that was, by its
own author's lights, correct.

W2 raises the stakes: three stages now have three different `inputs` shapes, and
a splat body that reaches `verify`'s reader (or vice versa) would burn a GPU
before failing. So the tests below check every stage in lockstep — that the
envelope is identical, that each stage spawns ITS OWN Modal function, and that
each stage's JOB reads exactly the keys its contract carries.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scan_modal import app as modal_app
from scan_modal.core.transforms import parse_photo_rows
from scan_modal.jobs import renders_job, splat_job, verify_job

# tests/ → scan-modal/ → services/ → repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_CONTRACT = _REPO_ROOT / "supabase" / "functions" / "dispatch-scan-modal" / "contract.json"

STAGES = ("verify", "splat", "renders")


def load_stages() -> dict:
    return json.loads(_CONTRACT.read_text())["stages"]


def load_variants() -> dict:
    return json.loads(_CONTRACT.read_text())["variants"]


def load_contract(stage: str = "verify") -> dict:
    return load_stages()[stage]


def test_the_contract_file_is_where_both_sides_look():
    assert _CONTRACT.is_file(), f"contract not found at {_CONTRACT}"


def test_the_contract_covers_every_dispatchable_stage():
    assert set(load_stages()) == set(STAGES)
    assert set(modal_app.TASK_FUNCTIONS) == {f"scan_pipeline.{s}" for s in STAGES}


@pytest.mark.parametrize("stage", STAGES)
def test_parse_spawn_body_accepts_the_contract(stage):
    contract = load_contract(stage)
    payload, reason = modal_app.parse_spawn_body(contract)

    assert reason == "ok"
    assert payload is not None
    # Every field the endpoint forwards to the job is present and carried through.
    for field in ("taskId", "leaseToken", "scanId", "roomFileId", "roomFileVersion",
                  "taskType", "traceId"):
        assert payload[field] == contract[field]
    assert payload["inputs"] == contract["inputs"]


@pytest.mark.parametrize("stage", STAGES)
def test_each_contract_spawns_its_own_modal_function(stage):
    calls: list[tuple[str, dict]] = []
    status, content = modal_app.handle_spawn(
        {"Authorization": "Bearer tok"},
        load_contract(stage),
        lambda name, payload: calls.append((name, payload)),
        expected_token="tok",
    )

    assert status == 202
    assert content["spawned"] is True
    assert calls[0][0] == stage


def test_the_envelope_is_identical_across_stages():
    """Only `inputs` differs. An envelope that drifted per stage would mean the
    dispatcher had three bodies to keep right instead of one."""
    envelopes = [set(load_contract(s)) - {"inputs"} for s in STAGES]
    assert envelopes[0] == envelopes[1] == envelopes[2]


def test_each_stages_inputs_are_closed_no_cross_stage_keys():
    stages = load_stages()
    assert set(stages["verify"]["inputs"]) == {"meshUrl", "capturedRoomJsonUrl"}
    assert set(stages["splat"]["inputs"]) == {
        "photosSource", "photosManifestUrl", "photoUrls", "capturedRoomJsonUrl",
        "photoUrlsCapped", "photoCount",
    }
    # `capturedRoomJsonUrl` is `renders`' required input and `glbUrl` its
    # optional overlay — the parametric room is the subject, the GLB is merged
    # on top. See jobs/renders_job.py's docstring.
    assert set(stages["renders"]["inputs"]) == {"capturedRoomJsonUrl", "glbUrl"}


# ─── the splat pose-carrier fallback ────────────────────────────────────────


def test_the_splat_rows_variant_is_accepted_and_spawns_splat():
    variant = load_variants()["splat_rows"]
    payload, reason = modal_app.parse_spawn_body(variant)
    assert reason == "ok" and payload is not None
    assert payload["inputs"] == variant["inputs"]

    calls: list[tuple[str, dict]] = []
    status, _ = modal_app.handle_spawn(
        {"Authorization": "Bearer tok"}, variant,
        lambda name, p: calls.append((name, p)), expected_token="tok",
    )
    assert status == 202 and calls[0][0] == "splat"


def test_the_splat_rows_variant_carries_records_and_no_manifest_url():
    inputs = load_variants()["splat_rows"]["inputs"]
    assert set(inputs) == {
        "photosSource", "photoRecords", "photoUrls", "capturedRoomJsonUrl",
        "photoUrlsCapped", "photoCount",
    }
    assert inputs["photosSource"] == "rows"
    assert "photosManifestUrl" not in inputs


def test_the_two_splat_carriers_differ_only_in_the_carrier():
    """Everything except the pose carrier must be identical across the two
    splat shapes — if the fallback drifted into a second dialect, the job would
    need two readers instead of one."""
    manifest = set(load_stages()["splat"]["inputs"])
    rows = set(load_variants()["splat_rows"]["inputs"])
    assert manifest - rows == {"photosManifestUrl"}
    assert rows - manifest == {"photoRecords"}


def test_splat_job_reads_the_rows_variant_without_touching_the_network(tmp_path, monkeypatch):
    """The fallback's whole point: no sidecar to download. The job must build
    its poses from the inlined records and reach the network only for the
    photos and the parametric room."""
    monkeypatch.setattr(splat_job, "CACHE_ROOT", tmp_path / "cache")
    variant = load_variants()["splat_rows"]
    reached = _urls_reached(splat_job, variant)

    assert reached, "splat never resolved an input URL from the rows variant"
    assert reached <= _contract_urls(variant)
    # And the poses it would have used parse cleanly from the contract's records.
    poses = parse_photo_rows(variant["inputs"]["photoRecords"])
    assert [p.relative_path for p in poses] == ["hero.heic", "auto_001.50.heic"]


class _StopHere(RuntimeError):
    """Cuts the job off at its first download — the contract check is upstream
    of any real geometry, training or rendering work."""


class _RecordingDb:
    def append_event(self, *a, **k):
        return None

    def fail_task(self, *a, **k):
        return None

    def close(self):
        return None


def _urls_reached(job_module, contract) -> set[str]:
    """Run the job far enough to see which input URLs it actually resolves."""
    fetched: list[str] = []

    def fake_fetch(url, timeout=None):
        fetched.append(url)
        raise _StopHere()

    original = job_module._fetch
    job_module._fetch = fake_fetch
    try:
        with pytest.raises(_StopHere):
            job_module_run(job_module)(contract, db=_RecordingDb())
    finally:
        job_module._fetch = original
    return set(fetched)


def job_module_run(job_module):
    return {
        verify_job: verify_job.run_verify,
        splat_job: splat_job.run_splat,
        renders_job: renders_job.run_renders,
    }[job_module]


def _contract_urls(contract) -> set[str]:
    urls: set[str] = set()
    for value in contract["inputs"].values():
        if isinstance(value, str):
            urls.add(value)
        elif isinstance(value, list):
            urls.update(v for v in value if isinstance(v, str))
    return urls


@pytest.mark.parametrize("stage,module", [
    ("verify", verify_job), ("splat", splat_job), ("renders", renders_job),
])
def test_each_job_finds_its_contract_input_keys(stage, module, tmp_path, monkeypatch):
    """The half that actually drifted: each job must read the keys ITS contract
    carries, not keys of its own invention."""
    if module is splat_job:
        monkeypatch.setattr(splat_job, "CACHE_ROOT", tmp_path / "cache")
    contract = load_contract(stage)
    reached = _urls_reached(module, contract)

    assert reached, f"{stage} never resolved an input URL from the contract"
    assert reached <= _contract_urls(contract)


@pytest.mark.parametrize("stage", STAGES)
@pytest.mark.parametrize(
    "field",
    ["taskId", "leaseToken", "scanId", "roomFileId", "roomFileVersion", "taskType"],
)
def test_the_contract_carries_every_required_field(stage, field):
    contract = load_contract(stage)
    assert field in contract
    del contract[field]
    payload, reason = modal_app.parse_spawn_body(contract)
    assert payload is None and field in reason
