"""Solve math — scale fit, tolerance model, anchor matching, certificate."""

from __future__ import annotations

import math

import pytest

from patina_scan_worker.stages.solve_math import (
    SCALE_BOUNDS,
    SENSOR_FLOOR_MM,
    build_certificate,
    fit_scale,
    match_height_anchor,
    match_span_anchor,
    parse_anchors,
    scale_is_plausible,
    tolerance_mm,
    validate_certificate,
)


def _anchor(cid, model_m, typed_mm, kind="span", a=(0, 0, 0), b=None):
    if b is None:
        b = (model_m, 0, 0)
    return {
        "id": cid, "index": 0, "label": cid, "spanKind": kind, "entryMethod": "typed",
        "endpointA": {"x": a[0], "y": a[1], "z": a[2]},
        "endpointB": {"x": b[0], "y": b[1], "z": b[2]},
        "modelSpanMeters": model_m, "measuredValueMm": typed_mm,
    }


def test_fit_scale_unscaled_returns_one():
    # typed == model → s == 1 exactly (property: solve of an unscaled fixture ≈ 1)
    anchors = parse_anchors([
        _anchor("a1", 4.000, 4000),
        _anchor("a2", 5.000, 5000),
        _anchor("a3", 2.700, 2700, kind="height", b=(0, 2.7, 0)),
    ])
    fit = fit_scale(anchors)
    assert abs(fit.scale - 1.0) < 1e-9
    assert fit.rms_residual_mm < 1e-6


def test_fit_scale_known_scale():
    # typed = 1.01 × model → s ≈ 1.01
    anchors = parse_anchors([
        _anchor("a1", 4.000, 4040),
        _anchor("a2", 5.000, 5050),
        _anchor("a3", 2.700, 2727, kind="height", b=(0, 2.7, 0)),
    ])
    fit = fit_scale(anchors)
    assert abs(fit.scale - 1.01) < 1e-4
    assert len(fit.per_anchor) == 3


def test_fit_scale_uses_endpoint_distance_when_span_missing():
    a = _anchor("a1", float("nan"), 4000, b=(4.0, 0, 0))
    a["modelSpanMeters"] = None
    fit = fit_scale(parse_anchors([a]))
    assert abs(fit.scale - 1.0) < 1e-6  # model span derived as 4.0 m → 4000 mm


def test_scale_plausibility():
    assert scale_is_plausible(1.0)
    assert scale_is_plausible(SCALE_BOUNDS[0])
    assert scale_is_plausible(SCALE_BOUNDS[1])
    assert not scale_is_plausible(0.5)
    assert not scale_is_plausible(2.0)
    assert not scale_is_plausible(float("nan"))


def test_tolerance_model_floors_at_sensor():
    # tiny relative residual → floored at ±1 cm
    assert tolerance_mm(4000, 0.0001) == SENSOR_FLOOR_MM
    # a big relative residual widens proportionally
    assert tolerance_mm(4000, 0.02) == 80  # 0.02 * 4000


def test_match_span_anchor_either_orientation():
    walls = [((0.0, 0.0), (4.0, 0.0)), ((4.0, 0.0), (4.0, 5.0))]
    a = parse_anchors([_anchor("w0", 4.0, 4000, a=(4.0, 0, 0.0), b=(0.0, 0, 0.0))])[0]
    assert match_span_anchor(a, walls) == 0  # reversed orientation still matches
    far = parse_anchors([_anchor("x", 4.0, 4000, a=(9, 0, 9), b=(13, 0, 9))])[0]
    assert match_span_anchor(far, walls) is None


def test_match_height_anchor():
    a = parse_anchors([_anchor("h", 2.7, 2700, kind="height", a=(1, 0, 1), b=(1, 2.7, 1))])[0]
    assert match_height_anchor(a, [2.7, 2.7]) == 0
    assert match_height_anchor(a, [3.5]) is None


def _valid_cert():
    anchors = parse_anchors([
        _anchor("a1", 4.0, 4008), _anchor("a2", 5.0, 5010),
        _anchor("a3", 2.7, 2705, kind="height", b=(0, 2.7, 0)),
    ])
    fit = fit_scale(anchors)
    return build_certificate(
        fit=fit, used_anchor_ids={"a1", "a2", "a3"}, unverified=False,
        dimension_counts={"verified": 3, "measured": 6, "estimated": 4},
        floor_area_sqft=214.2, anchor_count=3,
    )


def test_certificate_valid():
    assert validate_certificate(_valid_cert()) == []


def test_certificate_verified_count_must_equal_anchors_used():
    cert = _valid_cert()
    cert["dimension_counts"]["verified"] = 2  # != 3 used
    errs = validate_certificate(cert)
    assert any("verified dim count" in e for e in errs)


def test_certificate_unverified_rules():
    cert = _valid_cert()
    cert["unverified"] = True
    cert["dimension_counts"]["verified"] = 3  # must be 0 when unverified
    errs = validate_certificate(cert)
    assert any("0 verified" in e for e in errs)


def test_certificate_missing_keys():
    assert any("missing keys" in e for e in validate_certificate({"scale": 1.0}))
