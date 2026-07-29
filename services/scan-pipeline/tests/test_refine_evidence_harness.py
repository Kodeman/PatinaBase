"""The harness measures ``evaluate_refinement_evidence`` and cannot bend it.

Every case here is CONSTRUCTED.  None of them asserts a number a real run
produced: the point of the harness is that the numbers are unknown until a
capture is measured, so what has to be pinned is the harness's BEHAVIOUR --
that it passes the rule's verdict through untouched, that it keeps the row when
the rule refuses, and that a refusal in one bundle does not cost the next one
its row.
"""

from __future__ import annotations

import importlib.util
import json
import types
from dataclasses import replace
from pathlib import Path

import pytest

from patina_scan_worker.refine_adapter import (
    AdapterError,
    RefinementEvidence,
    evaluate_refinement_evidence,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
HARNESS_PATH = SERVICE_ROOT / "tools" / "refine_evidence_harness.py"


def _load_harness() -> types.ModuleType:
    specification = importlib.util.spec_from_file_location(
        "patina_refine_evidence_harness", HARNESS_PATH
    )
    assert specification is not None and specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


harness = _load_harness()

_DIGEST_A = "a" * 64
_DIGEST_B = "b" * 64


def _evidence(**overrides: object) -> RefinementEvidence:
    """A refinement that improves everything, unless a case says otherwise."""

    base = RefinementEvidence(
        input_images=49,
        registered_images_before=49,
        registered_images_after=49,
        common_observations=42587,
        common_observation_set_sha256=_DIGEST_A,
        reprojection_rmse_px_before=2.015458,
        reprojection_rmse_px_after=1.351599,
        verified_loop_edges=4,
        verified_loop_set_sha256=_DIGEST_B,
        loop_rotation_rmse_deg_before=4.915408,
        loop_rotation_rmse_deg_after=4.800000,
        loop_translation_direction_rmse_deg_before=17.165228,
        loop_translation_direction_rmse_deg_after=17.080197,
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


#: The exact shape I102 recorded: reprojection down a third, loop rotation up by
#: 0.015 deg over four edges.  Used as a CASE, never as an expected number.
_I102_SHAPED = _evidence(loop_rotation_rmse_deg_after=4.930533)


def test_the_rule_refuses_the_i102_shaped_case_and_accepts_the_improving_one():
    """The two directions the harness has to be able to tell apart."""

    refused = evaluate_refinement_evidence(_I102_SHAPED)
    assert refused.refinement_evidenced is False
    assert refused.code == "REFINE_EVIDENCE_REGRESSION"
    assert refused.reason == "comparable_geometric_evidence_regressed"
    assert evaluate_refinement_evidence(_evidence()).refinement_evidenced is True


def test_observer_hands_back_the_rules_own_verdict_object():
    """Not an equal verdict -- the same object.  There is nothing to rewrite."""

    sentinel = object()
    calls: list[object] = []

    def rule(evidence: object) -> object:
        calls.append(evidence)
        return sentinel

    observer = harness.EvidenceRuleObserver(rule)
    returned = observer(_I102_SHAPED)
    assert returned is sentinel
    assert calls == [_I102_SHAPED]
    assert len(observer.calls) == 1


def test_observer_calls_the_rule_exactly_once_per_invocation():
    counter = {"n": 0}

    def rule(evidence: object) -> str:
        counter["n"] += 1
        return "verdict"

    observer = harness.EvidenceRuleObserver(rule)
    observer(_evidence())
    observer(_evidence())
    assert counter["n"] == 2


def test_a_refused_run_still_produces_a_full_evidence_row():
    """The requirement the harness exists for: the refusal keeps its numbers."""

    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    verdict = observer(_I102_SHAPED)
    assert verdict.refinement_evidenced is False

    (call,) = observer.calls
    assert call["ruleError"] is None and call["recordError"] is None
    evidence = call["evidence"]
    assert evidence["reprojection_rmse_px_before"] == 2.015458
    assert evidence["reprojection_rmse_px_after"] == 1.351599
    assert evidence["loop_rotation_rmse_deg_before"] == 4.915408
    assert evidence["loop_rotation_rmse_deg_after"] == 4.930533
    assert evidence["loop_translation_direction_rmse_deg_before"] == 17.165228
    assert evidence["loop_translation_direction_rmse_deg_after"] == 17.080197
    assert evidence["common_observations"] == 42587
    assert evidence["verified_loop_edges"] == 4
    assert evidence["input_images"] == 49
    assert set(harness.EVIDENCE_FIELDS) == set(evidence)
    assert call["verdict"]["code"] == "REFINE_EVIDENCE_REGRESSION"
    assert call["verdict"]["reason"] == "comparable_geometric_evidence_regressed"
    assert call["verdict"]["registration_coverage_after"] == 1.0


def test_an_accepted_run_produces_the_same_shaped_row():
    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    verdict = observer(_evidence())
    assert verdict.refinement_evidenced is True
    (call,) = observer.calls
    assert call["verdict"]["refinement_evidenced"] is True
    assert set(harness.EVIDENCE_FIELDS) == set(call["evidence"])


def test_observer_records_then_reraises_when_the_rule_raises():
    """Malformed evidence is the rule's business; losing the row is not."""

    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    with pytest.raises(AdapterError):
        observer(_evidence(common_observations=0))
    (call,) = observer.calls
    assert call["verdict"] is None
    assert "AdapterError" in str(call["ruleError"])
    assert call["evidence"]["common_observations"] == 0


def test_a_documenting_failure_cannot_change_the_verdict():
    """The harness must never be able to break the run it is measuring."""

    class Hostile:
        @property
        def input_images(self) -> int:
            raise RuntimeError("unreadable")

    sentinel = object()
    observer = harness.EvidenceRuleObserver(lambda evidence: sentinel)
    assert observer(Hostile()) is sentinel
    (call,) = observer.calls
    assert call["evidence"]["input_images"].startswith("<unreadable:")
    assert call["ruleError"] is None


def test_install_observers_wraps_and_restores_both_modules():
    runner = types.SimpleNamespace(evaluate_refinement_evidence=evaluate_refinement_evidence)
    original_builder = object()
    original_shape = object()
    lifecycle = types.SimpleNamespace(
        ComposedArtifactBuilder=original_builder,
        require_refined_shape_changed=original_shape,
    )
    recorder = harness.install_observers(runner_module=runner, lifecycle_module=lifecycle)
    assert runner.evaluate_refinement_evidence is not evaluate_refinement_evidence
    assert runner.evaluate_refinement_evidence.wrapped is evaluate_refinement_evidence
    assert lifecycle.ComposedArtifactBuilder is not original_builder
    recorder.restore()
    assert runner.evaluate_refinement_evidence is evaluate_refinement_evidence
    assert lifecycle.ComposedArtifactBuilder is original_builder
    assert lifecycle.require_refined_shape_changed is original_shape


def test_installed_observer_records_through_the_runner_module_attribute():
    runner = types.SimpleNamespace(evaluate_refinement_evidence=evaluate_refinement_evidence)
    lifecycle = types.SimpleNamespace(
        ComposedArtifactBuilder=lambda outputs: outputs,
        require_refined_shape_changed=lambda value: value,
    )
    recorder = harness.install_observers(runner_module=runner, lifecycle_module=lifecycle)
    try:
        verdict = runner.evaluate_refinement_evidence(_I102_SHAPED)
    finally:
        recorder.restore()
    assert verdict.refinement_evidenced is False
    assert len(recorder.rule_calls) == 1
    assert recorder.rule_calls[0]["verdict"]["reason"] == "comparable_geometric_evidence_regressed"


def test_child_artifact_snapshot_reads_positionally_without_consuming(tmp_path):
    """``os.pread`` leaves the descriptor offset alone, so the publisher's own
    read of the same fd is unaffected."""

    import os

    payload = json.dumps({"trackUniverse": {"rawUsableTracks": 7}}).encode("utf-8")
    path = tmp_path / "adapter-v2.json"
    path.write_bytes(payload)
    descriptor = os.open(path, os.O_RDONLY)
    try:
        output = types.SimpleNamespace(descriptor=descriptor, size_bytes=len(payload))
        assert harness.read_output_snapshot(output) == {"trackUniverse": {"rawUsableTracks": 7}}
        assert os.lseek(descriptor, 0, os.SEEK_CUR) == 0
        assert os.read(descriptor, len(payload)) == payload
    finally:
        os.close(descriptor)


def test_one_failing_bundle_does_not_cost_the_others_their_rows():
    """A driver that stops at the first refusal measures one capture, not N."""

    attempted: list[str] = []

    def execute(bundle: Path, attempt: int):
        attempted.append(bundle.name)
        if bundle.name == "second":
            raise RuntimeError("probe blew up")
        return harness.build_row(
            bundle=bundle.name,
            scan_id="scan",
            attempt=attempt,
            outcome="refused",
            error_text="REFINE_EVIDENCE_REGRESSION",
            wall_clock_seconds=29.4,
            recorder=None,
            graph=None,
        )

    plan = [(Path("first"), 1), (Path("second"), 1), (Path("third"), 1)]
    rows = harness.run_bundles(plan, execute=execute)
    assert attempted == ["first", "second", "third"]
    assert [row["bundle"] for row in rows] == ["first", "second", "third"]
    assert [row["outcome"] for row in rows] == ["refused", "harness_error", "refused"]
    assert "probe blew up" in str(rows[1]["errorText"])


def test_rendered_table_carries_every_row_its_metrics_and_its_verdict():
    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    observer(_I102_SHAPED)
    refused = harness.build_row(
        bundle="004aa5b0",
        scan_id="scan-a",
        attempt=1,
        outcome="refused",
        error_text=None,
        wall_clock_seconds=29.4,
        recorder=_recorder_with(observer),
        graph={"frames": 49, "candidatePairs": 435},
    )
    accepting = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    accepting(_evidence())
    passed = harness.build_row(
        bundle="second",
        scan_id="scan-b",
        attempt=1,
        outcome="passed",
        error_text=None,
        wall_clock_seconds=31.0,
        recorder=_recorder_with(accepting),
        graph={"frames": 49, "candidatePairs": 435},
    )
    table = harness.render_table([refused, passed])
    assert "004aa5b0" in table and "second" in table
    assert "4.930533" in table and "4.800000" in table
    assert "REFUSED REFINE_EVIDENCE_REGRESSION/comparable_geometric_evidence_regressed" in table
    assert "PASS" in table
    # The direction of every comparable is visible without arithmetic.
    assert "-32.94" in table
    assert "+0.31" in table


def _recorder_with(observer) -> object:
    recorder = harness.HarnessRecorder()
    recorder.rule_observer = observer
    return recorder


def test_determinism_key_ignores_the_clock_and_nothing_else():
    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    observer(_I102_SHAPED)
    first = harness.build_row(
        bundle="b",
        scan_id="s",
        attempt=1,
        outcome="refused",
        error_text=None,
        wall_clock_seconds=29.4,
        recorder=_recorder_with(observer),
        graph={"frames": 49},
    )
    second = dict(first)
    second["wallClockSeconds"] = 31.9
    second["attempt"] = 2
    assert harness.determinism_key(first) == harness.determinism_key(second)

    moved = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    moved(_evidence(loop_rotation_rmse_deg_after=4.930534))
    third = harness.build_row(
        bundle="b",
        scan_id="s",
        attempt=3,
        outcome="refused",
        error_text=None,
        wall_clock_seconds=29.4,
        recorder=_recorder_with(moved),
        graph={"frames": 49},
    )
    assert harness.determinism_key(first) != harness.determinism_key(third)


def test_determinism_summary_reports_reproduction_only_when_repeats_agree():
    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    observer(_I102_SHAPED)
    row = harness.build_row(
        bundle="stable",
        scan_id="s",
        attempt=1,
        outcome="refused",
        error_text=None,
        wall_clock_seconds=29.4,
        recorder=_recorder_with(observer),
        graph={},
    )
    repeat = dict(row)
    repeat["attempt"] = 2
    repeat["wallClockSeconds"] = 30.1
    drifted = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    drifted(_evidence(loop_rotation_rmse_deg_after=4.930534))
    other = harness.build_row(
        bundle="drifting",
        scan_id="s",
        attempt=1,
        outcome="refused",
        error_text=None,
        wall_clock_seconds=29.4,
        recorder=_recorder_with(drifted),
        graph={},
    )
    other_repeat = dict(row)
    other_repeat["bundle"] = "drifting"
    other_repeat["attempt"] = 2
    summary = harness.summarize_determinism([row, repeat, other, other_repeat])
    assert summary["stable"]["attempts"] == 2
    assert summary["stable"]["distinctEvidence"] == 1
    assert summary["stable"]["reproduced"] is True
    assert summary["drifting"]["distinctEvidence"] == 2
    assert summary["drifting"]["reproduced"] is False
    # A single attempt is never evidence of reproduction.
    single = harness.summarize_determinism([row])
    assert single["stable"]["reproduced"] is False


def _row_with(evidence: RefinementEvidence, *, attempt: int) -> dict:
    observer = harness.EvidenceRuleObserver(evaluate_refinement_evidence)
    observer(evidence)
    return harness.build_row(
        bundle="capture",
        scan_id="s",
        attempt=attempt,
        outcome="refused",
        error_text=None,
        wall_clock_seconds=29.0 + attempt,
        recorder=_recorder_with(observer),
        graph={},
    )


def test_a_run_that_is_stable_in_its_verdict_is_not_therefore_bit_identical():
    """The distinction the qualified host actually produced: bundle adjustment
    moves the last few digits, so the digests differ while every printed digit
    and the verdict itself do not.  Reporting only "reproduced" would call that
    a failure to reproduce; reporting only "to the digit" would call it
    determinism.  Both claims are made, separately."""

    first = _row_with(_I102_SHAPED, attempt=1)
    second = _row_with(
        replace(_I102_SHAPED, loop_rotation_rmse_deg_after=4.9305327211473),
        attempt=2,
    )
    summary = harness.summarize_determinism([first, second])["capture"]
    assert summary["reproduced"] is False
    assert summary["distinctEvidence"] == 2
    assert summary["distinctVerdicts"] == 1
    assert summary["rendersIdentically"] is True
    assert 0.0 < summary["maxRelativeMetricDrift"] < 1e-6


def test_a_metric_that_moves_in_the_sixth_decimal_is_reported_as_not_rendering_alike():
    first = _row_with(_I102_SHAPED, attempt=1)
    second = _row_with(
        replace(_I102_SHAPED, loop_rotation_rmse_deg_after=4.931533),
        attempt=2,
    )
    summary = harness.summarize_determinism([first, second])["capture"]
    assert summary["rendersIdentically"] is False
    assert summary["maxRelativeMetricDrift"] > 1e-5


def test_metric_drift_is_reported_per_metric_not_as_one_number():
    first = _row_with(_I102_SHAPED, attempt=1)
    second = _row_with(
        replace(_I102_SHAPED, reprojection_rmse_px_after=1.3515991),
        attempt=2,
    )
    drift = harness.metric_drift([first, second])
    assert set(drift) == set(harness.COMPARABLE_METRICS)
    assert drift["reprojection_rmse_px_after"] > 0.0
    assert drift["loop_rotation_rmse_deg_after"] == 0.0
    assert drift["reprojection_rmse_px_before"] == 0.0


def test_a_changed_verdict_across_attempts_is_reported_as_two_verdicts():
    refused = _row_with(_I102_SHAPED, attempt=1)
    passed = _row_with(_evidence(), attempt=2)
    summary = harness.summarize_determinism([refused, passed])["capture"]
    assert summary["distinctVerdicts"] == 2
    assert summary["reproduced"] is False


# ---------------------------------------------------------------------------
# The candidate graph, pinned by construction rather than by a recorded number.
# ---------------------------------------------------------------------------
def _transform(center: tuple[float, float, float]) -> list[float]:
    # Row-major: the camera centre sits in the last COLUMN and the bottom row
    # is the rigid ``0 0 0 1`` the adapter requires.
    return [
        1.0, 0.0, 0.0, center[0],
        0.0, 1.0, 0.0, center[1],
        0.0, 0.0, 1.0, center[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def _row(index: int, center: tuple[float, float, float]) -> dict[str, object]:
    return {
        "heicPath": f"keyframes/keyframe_{index:06d}.heic",
        "timestampSeconds": float(index),
        "frameTimestamp": float(index),
        "cameraTransform": _transform(center),
        "intrinsics": {
            "fx": 3200.0,
            "fy": 3180.0,
            "cx": 2016.0,
            "cy": 1512.0,
            "imageWidth": 4032,
            "imageHeight": 3024,
        },
        "width": 3024,
        "height": 4032,
        "sharpness": 0.9,
        "hasDepth": False,
        "smoothedDepth": False,
    }


def _write_index(path: Path, centers: list[tuple[float, float, float]]) -> Path:
    path.write_text(
        "\n".join(json.dumps(_row(index, center)) for index, center in enumerate(centers)) + "\n",
        encoding="utf-8",
    )
    return path


def test_a_straight_walk_offers_no_loop_candidates_at_all(tmp_path):
    """Every non-temporal pair is beyond the 1.5 m band, so none is eligible."""

    centers = [(float(index) * 1.0, 0.0, 0.0) for index in range(30)]
    stats = harness.candidate_graph_stats(_write_index(tmp_path / "index.ndjson", centers))
    assert stats["frames"] == 30
    assert stats["nonTemporalPairsInSpatialBand"] == 0
    assert stats["loopCandidatePairs"] == 0
    assert stats["candidatePairs"] == stats["temporalCandidatePairs"]


def test_a_returning_walk_offers_loop_candidates_only_where_the_band_admits(tmp_path):
    """Bring the walk back to its start and the eligible pairs appear -- exactly
    the ones inside the 0.25-1.5 m band and more than ten frames apart."""

    out = [(float(index) * 1.0, 0.0, 0.0) for index in range(15)]
    back = [(float(14 - index) * 1.0, 0.30, 0.0) for index in range(15)]
    stats = harness.candidate_graph_stats(_write_index(tmp_path / "index.ndjson", out + back))
    assert stats["frames"] == 30
    assert stats["loopCandidatePairs"] > 0
    assert stats["loopCandidatePairs"] <= stats["nonTemporalPairsInSpatialBand"]
    assert stats["candidatePairs"] == stats["temporalCandidatePairs"] + stats["loopCandidatePairs"]


def test_frames_standing_still_are_excluded_by_the_minimum_baseline(tmp_path):
    """A capture that retraces its own path exactly offers nothing: the
    revisited pairs are 0.05 m apart, BELOW the 0.25 m minimum baseline, and the
    2 m stride puts every other non-temporal pair beyond the 1.5 m radius.  The
    band is a window, not a ceiling."""

    out = [(float(index) * 2.0, 0.0, 0.0) for index in range(15)]
    back = [(float(14 - index) * 2.0, 0.05, 0.0) for index in range(15)]
    stats = harness.candidate_graph_stats(_write_index(tmp_path / "index.ndjson", out + back))
    assert stats["nonTemporalPairsInSpatialBand"] == 0
    assert stats["loopCandidatePairs"] == 0


def test_the_bundle_identity_comes_from_the_bundles_own_object_keys(tmp_path):
    """Segment ``[2]`` is the ROOM, and the harness now names it that.

    The bundles on the qualified host were laid out under the manifest's own
    ``scanId`` to satisfy the old contract (I104, measurement only).  A bundle
    laid out under the real ``room_scans.room_id`` -- which is what
    ``RoomScanStoragePath.object`` writes -- is the shape this reads.
    """

    bundle = tmp_path / "capture"
    bundle.mkdir()
    (bundle / "sources.json").write_text(
        json.dumps(
            {
                "bundleManifest": {
                    "objectKey": "manifests/user-1/room-9/manifest.json",
                    "sha256": _DIGEST_A,
                    "sizeBytes": 1,
                },
                "keyframeIndex": {
                    "objectKey": "keyframes/user-1/room-9/keyframe_index.ndjson",
                    "sha256": _DIGEST_A,
                    "sizeBytes": 1,
                },
            }
        ),
        encoding="utf-8",
    )
    assert harness.read_bundle_identity(bundle) == ("user-1", "room-9")
    assert harness.keyframe_index_path(bundle).name == "keyframe_index.ndjson"
    assert harness.discover_bundles(tmp_path) == [bundle]


def test_the_probe_passes_the_room_to_the_reader_and_a_scan_to_the_publisher(
    tmp_path, monkeypatch
):
    """The harness plumbs TWO identifiers now, and does not invent the second.

    ``--room-id`` is derived from the bundle's own keys; ``--scan-id`` cannot be
    (no bundle directory carries ``room_scans.id``), so it is an operator
    argument that falls back to the room.  This pins both the derivation and the
    fallback without running a reconstruction.
    """

    bundle = tmp_path / "capture"
    bundle.mkdir()
    (bundle / "sources.json").write_text(
        json.dumps(
            {
                kind: {"objectKey": key, "sha256": _DIGEST_A, "sizeBytes": 1}
                for kind, key in (
                    ("bundleManifest", "manifests/user-1/room-9/manifest.json"),
                    ("keyframeIndex", "keyframes/user-1/room-9/keyframe_index.ndjson"),
                )
            }
        ),
        encoding="utf-8",
    )

    seen: list[list[str]] = []

    class _Lifecycle:
        @staticmethod
        def main(argv):
            seen.append(list(argv))
            return 0

    # ``run_probe`` does ``from patina_scan_worker import refine_lifecycle``,
    # which resolves by ATTRIBUTE on the already-imported package -- patching
    # ``sys.modules`` alone silently misses once any other test module has
    # imported the real one, which is exactly how this test first passed alone
    # and failed in the suite.
    import patina_scan_worker

    # ``raising=False`` because the attribute only exists once something has
    # imported the submodule -- which depends on test ordering, and is precisely
    # the ordering dependence this patch is here to remove.
    monkeypatch.setattr(
        patina_scan_worker, "refine_lifecycle", _Lifecycle, raising=False
    )
    monkeypatch.setattr(harness, "install_observers", lambda **_kwargs: _Recorder())

    def _probe(scan_argument):
        arguments = harness.build_argument_parser().parse_args(
            [
                "probe",
                "--bundle-dir", str(bundle),
                "--scratch-dir", str(tmp_path),
                "--publish-dir", str(tmp_path),
                "--row-out", str(tmp_path / "row.json"),
                *scan_argument,
            ]
        )
        harness.run_probe(arguments)
        argv = seen[-1]
        return argv[argv.index("--user-id") + 1], argv[argv.index("--scan-id") + 1], argv[
            argv.index("--room-id") + 1
        ]

    assert _probe([]) == ("user-1", "room-9", "room-9")
    assert _probe(["--scan-id", "scan-7"]) == ("user-1", "scan-7", "room-9")

    row = json.loads((tmp_path / "row.json").read_text(encoding="utf-8"))
    assert row["roomId"] == "room-9"
    assert row["scanId"] == "scan-7"


class _Recorder:
    """The observer surface ``run_probe`` touches, and nothing more."""

    rule_calls: list = []
    child_artifacts: dict = {}
    shape_changes: list = []
    notes: list = []

    def restore(self) -> None:
        return None
