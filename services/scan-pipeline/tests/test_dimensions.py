"""Dimension building + tolerance classes: anchored-span snap, measured,
estimated, UNVERIFIED propagation, rollup."""

from __future__ import annotations

from patina_scan_worker.stages.captured_room import parse_captured_room_meters
from patina_scan_worker.stages.dimensions import build_measurements
from patina_scan_worker.stages.solve_math import fit_scale, parse_anchors
from _synthetic import matching_anchors, rectangular_room


def _setup(scale=1.002, unverified=False):
    room = parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7, th=0.1))
    anchors = parse_anchors(matching_anchors(0, 4, 0, 5, 2.7, scale=scale))
    fit = fit_scale(anchors)
    built = build_measurements(room, anchors, fit, unverified)
    return room, anchors, fit, built


def test_anchored_spans_snap_to_typed_exactly():
    _, anchors, fit, built = _setup(scale=1.002)
    verified = [s for s in built.specs if s.tolerance_class == "verified"]
    # north length, east length, north height → 3 verified, snapped to the typed value
    assert len(verified) == 3
    north_len = next(s for s in verified if s.element_ref.get("dim") == "length"
                     and s.element_ref.get("apple_id") == "wall-north")
    assert north_len.value_mm == round(4000 * 1.002)     # 4008 — the typed value, exactly
    assert north_len.tolerance_mm == 0
    assert north_len.source == "anchor"
    assert north_len.anchor_client_id == "a-north"


def test_class_counts_and_rollup():
    _, _, _, built = _setup(scale=1.002)
    c = built.dimension_counts
    assert c["verified"] == 3
    assert c["estimated"] == 4          # four wall thicknesses (RoomPlan-invented)
    assert c["measured"] == 7           # remaining core dims
    assert len(built.specs) == 14
    # verified+measured present, thickness excluded → room badge is 'measured'
    assert built.rollup_class == "measured"
    assert built.used_anchor_ids == {"a-north", "a-east", "a-height"}


def test_thickness_is_estimated_and_not_rollup_affecting():
    _, _, _, built = _setup()
    thick = [s for s in built.specs if s.element_ref.get("dim") == "thickness"]
    assert len(thick) == 4
    assert all(s.tolerance_class == "estimated" for s in thick)
    assert all(s.rollup is False for s in thick)


def test_unverified_propagation():
    # < 3 anchors → UNVERIFIED: every dimension 'estimated', no verified rows
    _, _, _, built = _setup(unverified=True)
    assert built.dimension_counts["verified"] == 0
    assert all(s.tolerance_class == "estimated" for s in built.specs)
    assert built.used_anchor_ids == set()
    assert built.rollup_class == "estimated"


def test_unscaled_fixture_measures_model_values():
    # property: solve of an unscaled fixture (s≈1) returns measured==model
    _, _, fit, built = _setup(scale=1.0)
    assert abs(fit.scale - 1.0) < 1e-9
    south_len = next(s for s in built.specs if s.element_ref.get("apple_id") == "wall-south"
                     and s.element_ref.get("dim") == "length")
    assert south_len.tolerance_class == "measured"
    assert south_len.value_mm == 4000   # s≈1 × 4.0 m


def test_measured_tolerance_floors_at_one_cm():
    _, _, _, built = _setup(scale=1.002)
    measured = [s for s in built.specs if s.tolerance_class == "measured"]
    # a near-perfect fit → every measured tolerance floors at the ±1 cm sensor floor
    assert all(s.tolerance_mm >= 10 for s in measured)
