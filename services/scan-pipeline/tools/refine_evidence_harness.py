"""Measure ``evaluate_refinement_evidence`` over real captures.  Never edit it.

WHY THIS EXISTS.  I102 recorded the first end-to-end COLMAP run on the
qualified host.  It reconstructed, and was then REFUSED:
``REFINE_EVIDENCE_REGRESSION / comparable_geometric_evidence_regressed``,
because ``loop_rotation_rmse_deg`` rose by 0.015 deg (0.31%) over FOUR verified
loop edges while reprojection RMSE fell by a third.  The numbers survived only
in one log line, and only because the refusal renders them.  A run that PASSES
prints nothing comparable, and a run refused for a different reason prints a
different line.  There was no way to tabulate the evidence across captures,
which is exactly what a ruling on that rule needs.

WHAT THIS IS.  A call-through observer around the rule, plus a driver that runs
the composed lifecycle over a directory of capture bundles and tabulates one
evidence row per run -- INCLUDING for runs the rule refuses, which is the whole
point.  The refusal is recorded and re-raised, never swallowed.

WHAT THIS IS NOT.  It does not change the rule, its comparisons, or its
tolerances; it does not change any module in ``patina_scan_worker``.  Every
patch it installs is a runtime wrapper in the harness process that calls the
original exactly once and returns the original's value unchanged.  The observer
has no branch on the verdict, so there is no code path by which it could turn a
refusal into a pass -- and ``test_refine_evidence_harness.py`` constructs both
directions to prove it rather than asserting it here.

THREE HOOKS, all observer-only:

  1. ``refine_runner.evaluate_refinement_evidence`` -- THE rule under study.
     Records the exact ``RefinementEvidence`` it was handed and the exact
     verdict it returned.  This is the required capture; the other two are
     context.
  2. ``refine_lifecycle.ComposedArtifactBuilder`` -- the parent-owned engine
     outputs, read positionally out of the anonymous descriptors with
     ``os.pread`` (no seek, no consumption) so the child's ``adapter-v2.json``
     and ``engine-command-evidence-v1.json`` survive the lease purge.  That is
     where the candidate-pair and verified-geometry counts live.
  3. ``refine_lifecycle.require_refined_shape_changed`` -- how much the
     published camera configuration actually moved IN SHAPE, so a reader can
     tell a refused-but-real refinement from a refused no-op.

USAGE::

    # one bundle, one run, on the qualified host
    python tools/refine_evidence_harness.py probe \\
        --bundle-dir ~/bundles/004aa5b0 --row-out /tmp/row.json \\
        --scratch-dir ... --publish-dir ... --user-id ... --scan-id ...

    # every bundle under a root, twice each, tabulated
    python tools/refine_evidence_harness.py run \\
        --bundles-root ~/harness/bundles --work-root ~/harness/work \\
        --out-dir ~/harness/out --repeat 2

ADDING A BUNDLE IS ONE DIRECTORY: a directory under ``--bundles-root`` holding
``sources.json`` and the four keys it names.  The driver reads the scan id and
the user id out of the object keys; nothing else has to be told about it.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

HARNESS_SCHEMA_VERSION = 1

#: The two child artifacts worth keeping.  Both are small JSON documents; the
#: five model/database archives are not read here.
ADAPTER_OUTPUT_TOKEN = "adapter-v2.json"
COMMAND_EVIDENCE_OUTPUT_TOKEN = "engine-command-evidence-v1.json"
SNAPSHOT_TOKENS = (ADAPTER_OUTPUT_TOKEN, COMMAND_EVIDENCE_OUTPUT_TOKEN)
#: A ceiling, not an expectation: these documents are tens of kilobytes.  It
#: exists so a harness reading a descriptor can never be handed a gigabyte.
MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024

#: The exact fields the rule reads, in the order a reader wants them.
EVIDENCE_FIELDS = (
    "input_images",
    "registered_images_before",
    "registered_images_after",
    "common_observations",
    "common_observation_set_sha256",
    "reprojection_rmse_px_before",
    "reprojection_rmse_px_after",
    "verified_loop_edges",
    "verified_loop_set_sha256",
    "loop_rotation_rmse_deg_before",
    "loop_rotation_rmse_deg_after",
    "loop_translation_direction_rmse_deg_before",
    "loop_translation_direction_rmse_deg_after",
    "external_error_m_before",
    "external_error_m_after",
    "external_evidence_kind",
    "external_evidence_ref",
)

VERDICT_FIELDS = (
    "refinement_evidenced",
    "absolute_accuracy_certified",
    "code",
    "reason",
    "registration_coverage_before",
    "registration_coverage_after",
)

SHAPE_FIELDS = ("fit_rmse_m", "seed_rms_radius_m", "floor_m")


# ---------------------------------------------------------------------------
# Documenting.  Every one of these is defensive on purpose: a harness that
# throws while recording would change the outcome of the run it is measuring.
# ---------------------------------------------------------------------------
def _plain(value: object) -> object:
    """Return a JSON-safe copy of a scalar, or a repr for anything else."""

    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else repr(value)
    return repr(value)


def _document(value: object, fields: Sequence[str]) -> dict[str, object]:
    document: dict[str, object] = {}
    for name in fields:
        try:
            document[name] = _plain(getattr(value, name))
        except Exception as exc:  # noqa: BLE001 - recording must never raise
            document[name] = f"<unreadable: {type(exc).__name__}>"
    return document


def evidence_document(evidence: object) -> dict[str, object]:
    """The rule's exact input, field for field."""

    return _document(evidence, EVIDENCE_FIELDS)


def verdict_document(verdict: object) -> dict[str, object]:
    """The rule's exact output, field for field."""

    return _document(verdict, VERDICT_FIELDS)


def shape_document(shape: object) -> dict[str, object]:
    return _document(shape, SHAPE_FIELDS)


# ---------------------------------------------------------------------------
# The observer.
# ---------------------------------------------------------------------------
class EvidenceRuleObserver:
    """Call-through recorder around ``evaluate_refinement_evidence``.

    Calls the wrapped rule EXACTLY once and returns its value unchanged.  There
    is no branch on the verdict here and no second call: the object handed back
    to ``refine_runner`` is the object the rule returned, so a refusal stays a
    refusal.  If the rule raises, the call is recorded WITH the exception and
    the exception is re-raised.

    Recording is wrapped in its own guard.  A harness that threw while
    documenting would change the outcome of the run it is measuring, so a
    documenting failure is stored as ``recordError`` on the call and nothing
    else happens.
    """

    def __init__(self, rule: Callable[[Any], Any]) -> None:
        if not callable(rule):
            raise TypeError("the evidence rule observer needs a callable rule")
        self._rule = rule
        self.calls: list[dict[str, object]] = []

    @property
    def wrapped(self) -> Callable[[Any], Any]:
        return self._rule

    def _record(
        self,
        evidence: object,
        verdict: object,
        *,
        rule_error: str | None,
        elapsed_seconds: float,
    ) -> None:
        call: dict[str, object] = {
            "elapsedSeconds": elapsed_seconds,
            "ruleError": rule_error,
            "recordError": None,
        }
        try:
            call["evidence"] = evidence_document(evidence)
            call["verdict"] = None if verdict is None else verdict_document(verdict)
        except Exception as exc:  # noqa: BLE001 - recording must never raise
            call["evidence"] = call.get("evidence")
            call["verdict"] = call.get("verdict")
            call["recordError"] = f"{type(exc).__name__}: {exc}"
        self.calls.append(call)

    def __call__(self, evidence: Any) -> Any:
        started = time.monotonic()
        try:
            verdict = self._rule(evidence)
        except BaseException as exc:  # noqa: BLE001 - recorded, then re-raised
            self._record(
                evidence,
                None,
                rule_error=f"{type(exc).__name__}: {exc}",
                elapsed_seconds=time.monotonic() - started,
            )
            raise
        self._record(
            evidence,
            verdict,
            rule_error=None,
            elapsed_seconds=time.monotonic() - started,
        )
        return verdict


class HarnessRecorder:
    """Everything one probe observed, and how to put the modules back."""

    def __init__(self) -> None:
        self.rule_observer: EvidenceRuleObserver | None = None
        self.child_artifacts: dict[str, object] = {}
        self.shape_changes: list[dict[str, object]] = []
        self.notes: list[str] = []
        self._restores: list[Callable[[], None]] = []

    @property
    def rule_calls(self) -> list[dict[str, object]]:
        return [] if self.rule_observer is None else list(self.rule_observer.calls)

    def restore(self) -> None:
        while self._restores:
            self._restores.pop()()


def read_output_snapshot(output: Any) -> object:
    """Read one engine output positionally out of its anonymous descriptor.

    ``os.pread`` does not move the file offset, so the publisher's own reads of
    the same descriptor are unaffected.  This is why the harness can see the
    child's evidence document without owning, closing, or consuming anything.
    """

    size = int(output.size_bytes)
    if size < 0 or size > MAX_SNAPSHOT_BYTES:
        return f"<skipped: {size} bytes>"
    payload = os.pread(int(output.descriptor), size, 0)
    return json.loads(payload.decode("utf-8"))


def install_observers(
    *,
    runner_module: Any,
    lifecycle_module: Any,
    recorder: HarnessRecorder | None = None,
) -> HarnessRecorder:
    """Wrap the three observation points and return the recorder.

    Every wrapper calls the original once and returns its value.  ``restore()``
    puts the module attributes back, so a probe that runs more than one bundle
    in one process cannot leave a wrapper behind.
    """

    recorder = recorder or HarnessRecorder()

    original_rule = runner_module.evaluate_refinement_evidence
    observer = EvidenceRuleObserver(original_rule)
    runner_module.evaluate_refinement_evidence = observer
    recorder.rule_observer = observer
    recorder._restores.append(
        lambda: setattr(runner_module, "evaluate_refinement_evidence", original_rule)
    )

    original_builder = lifecycle_module.ComposedArtifactBuilder

    def builder_factory(outputs: Mapping[str, Any]) -> Any:
        for token in SNAPSHOT_TOKENS:
            try:
                recorder.child_artifacts[token] = read_output_snapshot(outputs[token])
            except Exception as exc:  # noqa: BLE001 - context, never the outcome
                recorder.notes.append(f"{token} snapshot failed: {type(exc).__name__}: {exc}")
        return original_builder(outputs)

    lifecycle_module.ComposedArtifactBuilder = builder_factory
    recorder._restores.append(
        lambda: setattr(lifecycle_module, "ComposedArtifactBuilder", original_builder)
    )

    original_shape = lifecycle_module.require_refined_shape_changed

    def shape_wrapper(*args: Any, **kwargs: Any) -> Any:
        value = original_shape(*args, **kwargs)
        try:
            recorder.shape_changes.append(shape_document(value))
        except Exception as exc:  # noqa: BLE001 - context, never the outcome
            recorder.notes.append(f"shape snapshot failed: {type(exc).__name__}: {exc}")
        return value

    lifecycle_module.require_refined_shape_changed = shape_wrapper
    recorder._restores.append(
        lambda: setattr(lifecycle_module, "require_refined_shape_changed", original_shape)
    )
    return recorder


# ---------------------------------------------------------------------------
# The candidate graph, computed from the capture alone.
# ---------------------------------------------------------------------------
def candidate_graph_stats(keyframe_index_path: str | os.PathLike[str]) -> dict[str, object]:
    """Split the deterministic candidate graph into temporal and loop pairs.

    This needs no engine: ``build_pair_graph`` is a function of the ARKit camera
    centres and the frame order, so the number of pairs that are ELIGIBLE to
    become loop edges is knowable before COLMAP runs.  The gap between that
    number and ``verified_loop_edges`` is the difference between "the selection
    policy offered few candidates" and "matching verified few of them", which is
    the question I102 left open.
    """

    from patina_scan_worker.refine_adapter import (  # local: host-only import
        SPATIAL_MIN_BASELINE_M,
        SPATIAL_RADIUS_M,
        TEMPORAL_WINDOW,
        build_pair_graph,
        load_keyframe_index,
    )

    frames = load_keyframe_index(keyframe_index_path)
    ordinals = {frame.image_name: index for index, frame in enumerate(frames)}
    pairs = build_pair_graph(frames)
    separations = [abs(ordinals[second] - ordinals[first]) for first, second in pairs]
    loop_candidates = [value for value in separations if value > TEMPORAL_WINDOW]
    per_frame: dict[str, int] = {name: 0 for name in ordinals}
    for (first, second), separation in zip(pairs, separations):
        if separation > TEMPORAL_WINDOW:
            per_frame[first] += 1
            per_frame[second] += 1
    counts = sorted(per_frame.values())
    centres = [frame.camera_center_m for frame in frames]
    distances = [
        math.dist(centres[left], centres[right])
        for left in range(len(centres))
        for right in range(left + 1, len(centres))
        if right - left > TEMPORAL_WINDOW
    ]
    in_band = [value for value in distances if SPATIAL_MIN_BASELINE_M <= value <= SPATIAL_RADIUS_M]
    return {
        "frames": len(frames),
        "temporalWindow": TEMPORAL_WINDOW,
        "spatialMinBaselineM": SPATIAL_MIN_BASELINE_M,
        "spatialRadiusM": SPATIAL_RADIUS_M,
        "candidatePairs": len(pairs),
        "temporalCandidatePairs": len(separations) - len(loop_candidates),
        "loopCandidatePairs": len(loop_candidates),
        "framesWithNoLoopCandidate": sum(1 for value in counts if value == 0),
        "maxLoopCandidatesPerFrame": counts[-1] if counts else 0,
        "nonTemporalFramePairs": len(distances),
        "nonTemporalPairsInSpatialBand": len(in_band),
        "captureSpanSeconds": (
            frames[-1].frame_timestamp_s - frames[0].frame_timestamp_s if frames else 0.0
        ),
        "trajectoryExtentM": max(distances, default=0.0),
    }


# ---------------------------------------------------------------------------
# One row.
# ---------------------------------------------------------------------------
def build_row(
    *,
    bundle: str,
    scan_id: str,
    attempt: int,
    outcome: str,
    error_text: str | None,
    wall_clock_seconds: float,
    recorder: HarnessRecorder | None,
    graph: Mapping[str, object] | None,
) -> dict[str, object]:
    """One evidence row.  Built the same way whether or not the run was refused."""

    calls = recorder.rule_calls if recorder is not None else []
    last = calls[-1] if calls else None
    evidence = (last or {}).get("evidence") or {}
    verdict = (last or {}).get("verdict") or {}
    child = dict(recorder.child_artifacts) if recorder is not None else {}
    adapter = child.get(ADAPTER_OUTPUT_TOKEN)
    command = child.get(COMMAND_EVIDENCE_OUTPUT_TOKEN)
    return {
        "schemaVersion": HARNESS_SCHEMA_VERSION,
        "bundle": bundle,
        "scanId": scan_id,
        "attempt": attempt,
        "outcome": outcome,
        "errorText": error_text,
        "wallClockSeconds": wall_clock_seconds,
        "ruleCalls": calls,
        "evidence": evidence,
        "verdict": verdict,
        "shapeChange": (recorder.shape_changes[-1] if recorder and recorder.shape_changes else {}),
        "candidateGraph": dict(graph) if graph else {},
        "childTrackUniverse": (adapter or {}).get("trackUniverse") if isinstance(adapter, dict) else None,
        "childEngineTelemetry": _telemetry_rows(command),
        "notes": list(recorder.notes) if recorder is not None else [],
    }


def _telemetry_rows(command_document: object) -> list[dict[str, object]]:
    """The child's own per-phase clock, if the run got far enough to write it."""

    if not isinstance(command_document, dict):
        return []
    executed = command_document.get("executed")
    if not isinstance(executed, list):
        return []
    rows: list[dict[str, object]] = []
    for entry in executed:
        if isinstance(entry, dict):
            rows.append(entry)
    return rows


def determinism_key(row: Mapping[str, object]) -> str:
    """Canonical JSON of everything a repeat of the same bundle must reproduce.

    Wall clock and per-call timings are excluded because they are measurements
    of the box, not of the reconstruction.  Everything else -- every metric,
    every digest, every count, the verdict and its reason -- is included, so two
    runs comparing equal here reproduced byte for byte.
    """

    calls = []
    for call in row.get("ruleCalls") or []:  # type: ignore[union-attr]
        if isinstance(call, dict):
            calls.append(
                {
                    "evidence": call.get("evidence"),
                    "verdict": call.get("verdict"),
                    "ruleError": call.get("ruleError"),
                }
            )
    return json.dumps(
        {
            "outcome": row.get("outcome"),
            "errorText": row.get("errorText"),
            "ruleCalls": calls,
            "shapeChange": row.get("shapeChange"),
            "candidateGraph": row.get("candidateGraph"),
            "childTrackUniverse": row.get("childTrackUniverse"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )


# ---------------------------------------------------------------------------
# Rendering.
# ---------------------------------------------------------------------------
def _number(value: object, spec: str) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return "-"
    return format(value, spec)


def _delta_percent(before: object, after: object) -> str:
    if not isinstance(before, (int, float)) or not isinstance(after, (int, float)):
        return "-"
    if isinstance(before, bool) or isinstance(after, bool) or before <= 0:
        return "-"
    return format(100.0 * (after - before) / before, "+.2f")


def render_table(rows: Sequence[Mapping[str, object]]) -> str:
    """A table the owner can read at a glance.  One line per run."""

    header = (
        "bundle",
        "n",
        "frames",
        "cov b>a",
        "reproj b",
        "reproj a",
        "d%",
        "looprot b",
        "looprot a",
        "d%",
        "looptrn b",
        "looptrn a",
        "d%",
        "obs",
        "edges",
        "sec",
        "verdict",
    )
    table: list[tuple[str, ...]] = [header]
    for row in rows:
        evidence = row.get("evidence") or {}
        verdict = row.get("verdict") or {}
        graph = row.get("candidateGraph") or {}
        assert isinstance(evidence, dict) and isinstance(verdict, dict) and isinstance(graph, dict)
        coverage = "-"
        if isinstance(verdict.get("registration_coverage_before"), (int, float)) and isinstance(
            verdict.get("registration_coverage_after"), (int, float)
        ):
            coverage = (
                f"{verdict['registration_coverage_before']:.3f}>"
                f"{verdict['registration_coverage_after']:.3f}"
            )
        outcome = str(row.get("outcome", "?"))
        reason = verdict.get("reason") or ""
        code = verdict.get("code") or ""
        if verdict.get("refinement_evidenced") is True:
            token = f"PASS {reason}"
        elif code:
            token = f"REFUSED {code}/{reason}"
        else:
            token = outcome.upper()
        table.append(
            (
                str(row.get("bundle", "?")),
                str(row.get("attempt", "?")),
                _number(evidence.get("input_images") or graph.get("frames"), "d"),
                coverage,
                _number(evidence.get("reprojection_rmse_px_before"), ".6f"),
                _number(evidence.get("reprojection_rmse_px_after"), ".6f"),
                _delta_percent(
                    evidence.get("reprojection_rmse_px_before"),
                    evidence.get("reprojection_rmse_px_after"),
                ),
                _number(evidence.get("loop_rotation_rmse_deg_before"), ".6f"),
                _number(evidence.get("loop_rotation_rmse_deg_after"), ".6f"),
                _delta_percent(
                    evidence.get("loop_rotation_rmse_deg_before"),
                    evidence.get("loop_rotation_rmse_deg_after"),
                ),
                _number(evidence.get("loop_translation_direction_rmse_deg_before"), ".6f"),
                _number(evidence.get("loop_translation_direction_rmse_deg_after"), ".6f"),
                _delta_percent(
                    evidence.get("loop_translation_direction_rmse_deg_before"),
                    evidence.get("loop_translation_direction_rmse_deg_after"),
                ),
                _number(evidence.get("common_observations"), "d"),
                _number(evidence.get("verified_loop_edges"), "d"),
                _number(row.get("wallClockSeconds"), ".1f"),
                token,
            )
        )
    widths = [max(len(row[index]) for row in table) for index in range(len(header))]
    lines = []
    for index, row in enumerate(table):
        lines.append("  ".join(value.ljust(widths[column]) for column, value in enumerate(row)).rstrip())
        if index == 0:
            lines.append("  ".join("-" * width for width in widths))
    return "\n".join(lines)


def render_graph_table(rows: Sequence[Mapping[str, object]]) -> str:
    """Why the loop-edge count is what it is, per capture."""

    header = (
        "bundle",
        "frames",
        "cand pairs",
        "temporal",
        "loop cand",
        "nontemp pairs",
        "in band",
        "verified edges",
        "span s",
    )
    table: list[tuple[str, ...]] = [header]
    seen: set[str] = set()
    for row in rows:
        bundle = str(row.get("bundle", "?"))
        if bundle in seen:
            continue
        seen.add(bundle)
        graph = row.get("candidateGraph") or {}
        evidence = row.get("evidence") or {}
        assert isinstance(graph, dict) and isinstance(evidence, dict)
        table.append(
            (
                bundle,
                _number(graph.get("frames"), "d"),
                _number(graph.get("candidatePairs"), "d"),
                _number(graph.get("temporalCandidatePairs"), "d"),
                _number(graph.get("loopCandidatePairs"), "d"),
                _number(graph.get("nonTemporalFramePairs"), "d"),
                _number(graph.get("nonTemporalPairsInSpatialBand"), "d"),
                _number(evidence.get("verified_loop_edges"), "d"),
                _number(graph.get("captureSpanSeconds"), ".1f"),
            )
        )
    widths = [max(len(row[index]) for row in table) for index in range(len(header))]
    lines = []
    for index, row in enumerate(table):
        lines.append("  ".join(value.ljust(widths[column]) for column, value in enumerate(row)).rstrip())
        if index == 0:
            lines.append("  ".join("-" * width for width in widths))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Bundles.
# ---------------------------------------------------------------------------
def read_bundle_identity(bundle_dir: Path) -> tuple[str, str]:
    """``(user_id, scan_id)`` read out of the bundle's own object keys."""

    document = json.loads((bundle_dir / "sources.json").read_text(encoding="utf-8"))
    key = document["bundleManifest"]["objectKey"]
    parts = str(key).split("/")
    if len(parts) != 4 or parts[0] != "manifests":
        raise ValueError(f"{bundle_dir}: bundleManifest key is not manifests/<user>/<scan>/manifest.json")
    return parts[1], parts[2]


def keyframe_index_path(bundle_dir: Path) -> Path:
    document = json.loads((bundle_dir / "sources.json").read_text(encoding="utf-8"))
    return bundle_dir / str(document["keyframeIndex"]["objectKey"])


def discover_bundles(root: Path) -> list[Path]:
    """Every directory under ``root`` that carries a ``sources.json``."""

    return sorted(path for path in root.iterdir() if (path / "sources.json").is_file())


# ---------------------------------------------------------------------------
# The probe: one bundle, one run, in this process.
# ---------------------------------------------------------------------------
def run_probe(arguments: argparse.Namespace) -> int:
    from patina_scan_worker import refine_lifecycle, refine_runner

    bundle_dir = Path(arguments.bundle_dir).resolve(strict=True)
    user_id, scan_id = read_bundle_identity(bundle_dir)
    graph: dict[str, object] | None = None
    try:
        graph = candidate_graph_stats(keyframe_index_path(bundle_dir))
    except Exception as exc:  # noqa: BLE001 - context, never the outcome
        graph = {"error": f"{type(exc).__name__}: {exc}"}

    recorder = install_observers(
        runner_module=refine_runner,
        lifecycle_module=refine_lifecycle,
    )
    argv = [
        "--bundle-dir",
        str(bundle_dir),
        "--scratch-dir",
        str(arguments.scratch_dir),
        "--publish-dir",
        str(arguments.publish_dir),
        "--user-id",
        user_id,
        "--scan-id",
        scan_id,
        "--task-id",
        arguments.task_id,
        "--lease-id",
        arguments.lease_id,
        "--room-file-id",
        arguments.room_file_id,
        "--lease-seconds",
        str(arguments.lease_seconds),
        "--gpu-index",
        str(arguments.gpu_index),
    ]
    outcome = "passed"
    error_text: str | None = None
    started = time.monotonic()
    try:
        code = refine_lifecycle.main(argv)
        if code != 0:
            outcome = "preflight_failed"
            error_text = f"lifecycle main returned {code}"
    except BaseException as exc:  # noqa: BLE001 - the refusal is the measurement
        outcome = "refused" if recorder.rule_calls else "failed"
        error_text = f"{type(exc).__name__}: {exc}"
        sys.stderr.write(traceback.format_exc())
    finally:
        wall_clock = time.monotonic() - started
        recorder.restore()

    row = build_row(
        bundle=bundle_dir.name,
        scan_id=scan_id,
        attempt=int(arguments.attempt),
        outcome=outcome,
        error_text=error_text,
        wall_clock_seconds=wall_clock,
        recorder=recorder,
        graph=graph,
    )
    Path(arguments.row_out).write_text(json.dumps(row, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    sys.stderr.write(f"harness: {bundle_dir.name} attempt {arguments.attempt} -> {outcome}\n")
    # The probe's exit status reports the RUN, and the driver ignores it: a
    # refused run is a successful measurement.
    return 0 if outcome == "passed" else 1


# ---------------------------------------------------------------------------
# The driver: every bundle, N attempts each, one row per attempt.
# ---------------------------------------------------------------------------
def run_bundles(
    plan: Sequence[tuple[Path, int]],
    *,
    execute: Callable[[Path, int], Mapping[str, object]],
) -> list[dict[str, object]]:
    """Run every planned attempt, keeping a row for each even when one blows up.

    ``execute`` raising is itself recorded as a row and the next attempt runs.
    That is the requirement this harness exists for: an attempt that produces no
    row is an attempt whose evidence was lost.
    """

    rows: list[dict[str, object]] = []
    for bundle, attempt in plan:
        try:
            rows.append(dict(execute(bundle, attempt)))
        except BaseException as exc:  # noqa: BLE001 - never lose the attempt
            rows.append(
                build_row(
                    bundle=bundle.name,
                    scan_id="",
                    attempt=attempt,
                    outcome="harness_error",
                    error_text=f"{type(exc).__name__}: {exc}",
                    wall_clock_seconds=0.0,
                    recorder=None,
                    graph=None,
                )
            )
    return rows


#: The six numbers the rule compares.  Drift is reported over exactly these.
COMPARABLE_METRICS = (
    "reprojection_rmse_px_before",
    "reprojection_rmse_px_after",
    "loop_rotation_rmse_deg_before",
    "loop_rotation_rmse_deg_after",
    "loop_translation_direction_rmse_deg_before",
    "loop_translation_direction_rmse_deg_after",
)


def _verdict_token(row: Mapping[str, object]) -> str:
    verdict = row.get("verdict") or {}
    assert isinstance(verdict, dict)
    return json.dumps(
        [verdict.get("refinement_evidenced"), verdict.get("code"), verdict.get("reason")],
        sort_keys=True,
    )


def metric_drift(rows: Sequence[Mapping[str, object]]) -> dict[str, float]:
    """Largest relative spread of each comparable metric across the attempts.

    Reported per metric because the parts of a run are not equally reproducible:
    everything upstream of bundle adjustment is deterministic, and Ceres running
    multithreaded is not.  A single number would hide which is which.
    """

    drift: dict[str, float] = {}
    for metric in COMPARABLE_METRICS:
        values = []
        for row in rows:
            evidence = row.get("evidence") or {}
            assert isinstance(evidence, dict)
            value = evidence.get(metric)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values.append(float(value))
        if len(values) < 2:
            continue
        low, high = min(values), max(values)
        drift[metric] = 0.0 if high == 0.0 else (high - low) / abs(high)
    return drift


def renders_identically(rows: Sequence[Mapping[str, object]]) -> bool:
    """Do the attempts agree on every digit the refusal actually prints?

    The refusal renders each comparable at ``%.6f``.  This is the exact claim
    "it reproduces to the digit" -- weaker than bit-identity and worth stating
    separately, because it is the one an operator reading a log can check.
    """

    rendered: set[str] = set()
    for row in rows:
        evidence = row.get("evidence") or {}
        assert isinstance(evidence, dict)
        rendered.add(
            "|".join(
                _number(evidence.get(metric), ".6f") for metric in COMPARABLE_METRICS
            )
        )
    return len(rendered) == 1


def summarize_determinism(rows: Sequence[Mapping[str, object]]) -> dict[str, object]:
    """Per bundle: what reproduced across attempts, and what only nearly did.

    ``reproduced`` is the strict claim -- every recorded number and digest
    identical.  It is reported alongside the weaker claims because a run can be
    stable in its VERDICT and in every digit an operator ever sees while still
    not being bit-identical, and conflating those two would let "it reproduces
    to the digit" stand in for "it reproduces".
    """

    by_bundle: dict[str, list[Mapping[str, object]]] = {}
    for row in rows:
        by_bundle.setdefault(str(row.get("bundle", "?")), []).append(row)
    summary: dict[str, object] = {}
    for bundle, attempts in sorted(by_bundle.items()):
        keys = [determinism_key(row) for row in attempts]
        drift = metric_drift(attempts)
        summary[bundle] = {
            "attempts": len(attempts),
            "distinctEvidence": len(set(keys)),
            "reproduced": len(keys) > 1 and len(set(keys)) == 1,
            "distinctVerdicts": len({_verdict_token(row) for row in attempts}),
            "maxRelativeMetricDrift": max(drift.values(), default=0.0),
            "metricDrift": drift,
            "rendersIdentically": renders_identically(attempts),
        }
    return summary


def _probe_command(
    *,
    bundle: Path,
    attempt: int,
    work_root: Path,
    row_path: Path,
    lease_seconds: float,
    gpu_index: int,
) -> list[str]:
    scratch = work_root / f"{bundle.name}-{attempt}" / "scratch"
    publish = work_root / f"{bundle.name}-{attempt}" / "publish"
    scratch.mkdir(parents=True, exist_ok=True)
    publish.mkdir(parents=True, exist_ok=True)
    # The raster adapter opens its scratch parent by descriptor and refuses a
    # group-writable directory.  0700 is what the composed runs already used.
    scratch.chmod(0o700)
    publish.chmod(0o700)
    return [
        sys.executable,
        str(Path(__file__).resolve()),
        "probe",
        "--bundle-dir",
        str(bundle),
        "--scratch-dir",
        str(scratch),
        "--publish-dir",
        str(publish),
        "--row-out",
        str(row_path),
        "--attempt",
        str(attempt),
        "--task-id",
        f"harness-{bundle.name}-{attempt}",
        "--lease-id",
        f"harness-lease-{bundle.name}-{attempt}",
        "--room-file-id",
        "9d3e2a70-0000-4000-8000-000000000122",
        "--lease-seconds",
        str(lease_seconds),
        "--gpu-index",
        str(gpu_index),
    ]


def run_driver(arguments: argparse.Namespace) -> int:
    bundles_root = Path(arguments.bundles_root).resolve(strict=True)
    work_root = Path(arguments.work_root).resolve()
    out_dir = Path(arguments.out_dir).resolve()
    work_root.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    bundles = discover_bundles(bundles_root)
    if not bundles:
        sys.stderr.write(f"no bundles under {bundles_root}\n")
        return 2
    plan = [(bundle, attempt) for bundle in bundles for attempt in range(1, int(arguments.repeat) + 1)]

    def execute(bundle: Path, attempt: int) -> Mapping[str, object]:
        row_path = out_dir / f"row-{bundle.name}-{attempt}.json"
        command = _probe_command(
            bundle=bundle,
            attempt=attempt,
            work_root=work_root,
            row_path=row_path,
            lease_seconds=arguments.lease_seconds,
            gpu_index=arguments.gpu_index,
        )
        log_path = out_dir / f"log-{bundle.name}-{attempt}.txt"
        with log_path.open("wb") as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=False)
        if not row_path.is_file():
            raise RuntimeError(f"probe wrote no row; see {log_path}")
        row = json.loads(row_path.read_text(encoding="utf-8"))
        row["logPath"] = str(log_path)
        return row

    rows = run_bundles(plan, execute=execute)
    (out_dir / "rows.json").write_text(json.dumps(rows, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report = "\n\n".join(
        (
            "EVIDENCE ROWS",
            render_table(rows),
            "CANDIDATE GRAPH",
            render_graph_table(rows),
            "DETERMINISM",
            json.dumps(summarize_determinism(rows), indent=2, sort_keys=True),
        )
    )
    (out_dir / "table.txt").write_text(report + "\n", encoding="utf-8")
    sys.stdout.write(report + "\n")
    return 0


def run_report(arguments: argparse.Namespace) -> int:
    rows: list[Mapping[str, object]] = []
    for path in arguments.rows:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
        rows.extend(document if isinstance(document, list) else [document])
    report = "\n\n".join(
        (
            "EVIDENCE ROWS",
            render_table(rows),
            "CANDIDATE GRAPH",
            render_graph_table(rows),
            "DETERMINISM",
            json.dumps(summarize_determinism(rows), indent=2, sort_keys=True),
        )
    )
    sys.stdout.write(report + "\n")
    return 0


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="mode", required=True)

    probe = subparsers.add_parser("probe", help="run one bundle in this process and write one row")
    probe.add_argument("--bundle-dir", required=True)
    probe.add_argument("--scratch-dir", required=True)
    probe.add_argument("--publish-dir", required=True)
    probe.add_argument("--row-out", required=True)
    probe.add_argument("--attempt", default=1, type=int)
    probe.add_argument("--task-id", default="harness-probe")
    probe.add_argument("--lease-id", default="harness-lease")
    probe.add_argument("--room-file-id", default="9d3e2a70-0000-4000-8000-000000000122")
    probe.add_argument("--lease-seconds", default=3600.0, type=float)
    probe.add_argument("--gpu-index", default=0, type=int)
    probe.set_defaults(handler=run_probe)

    driver = subparsers.add_parser("run", help="run every bundle under a root and tabulate")
    driver.add_argument("--bundles-root", required=True)
    driver.add_argument("--work-root", required=True)
    driver.add_argument("--out-dir", required=True)
    driver.add_argument("--repeat", default=1, type=int)
    driver.add_argument("--lease-seconds", default=3600.0, type=float)
    driver.add_argument("--gpu-index", default=0, type=int)
    driver.set_defaults(handler=run_driver)

    report = subparsers.add_parser("report", help="re-render a table from saved rows")
    report.add_argument("rows", nargs="+")
    report.set_defaults(handler=run_report)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_argument_parser().parse_args(argv)
    return int(arguments.handler(arguments))


if __name__ == "__main__":  # pragma: no cover - manual entry point
    raise SystemExit(main())
