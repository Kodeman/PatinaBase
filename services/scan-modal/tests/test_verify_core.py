"""`verify` geometry core — determinism, residual accuracy, curvature, rejection."""

from __future__ import annotations

import dataclasses

import pytest

from scan_modal.core.captured_room import parse_captured_room_meters
from scan_modal.core.verify import VerifyConfig, verify_room

import _synthetic as syn

WALL_REFS = {"wall-north", "wall-south", "wall-west", "wall-east"}


def cfg(backend: str, **overrides) -> VerifyConfig:
    return dataclasses.replace(VerifyConfig(backend=backend), **overrides)


@pytest.fixture
def parametric():
    return parse_captured_room_meters(syn.captured_room_json())


def test_parses_four_walls_from_captured_room(parametric):
    assert [w.apple_id for w in parametric.walls] == [
        "wall-north", "wall-south", "wall-west", "wall-east"
    ]
    assert parametric.warnings == []
    north = parametric.walls[0]
    assert north.length_m == pytest.approx(syn.WIDTH_M)
    assert north.base_y_m == pytest.approx(0.0)
    assert north.a_xz == pytest.approx((syn.WIDTH_M / 2, -syn.DEPTH_M / 2))


def test_clean_room_matches_every_wall(parametric, backend):
    result = verify_room(syn.mesh_points(), parametric, cfg(backend))

    assert result.walls_checked == 4
    assert {w.wall_ref for w in result.walls} == WALL_REFS
    assert result.unmatched_walls == []
    assert result.walls_within_tolerance == 4
    assert result.max_delta_mm < 5.0
    assert result.curved_walls == []
    for wall in result.walls:
        assert wall.parametric_mm == pytest.approx(syn.wall_length_mm(wall.wall_ref))
        assert abs(wall.offset_mm) < 10.0


def test_two_runs_are_identical(parametric, backend):
    points = syn.mesh_points(noise_m=0.003)
    first = verify_room(points, parametric, cfg(backend))
    second = verify_room(points, parametric, cfg(backend))
    assert first.to_dict() == second.to_dict()


def test_one_percent_oversize_mesh_reports_the_right_deltas(parametric, backend):
    result = verify_room(syn.mesh_points(mesh_scale=1.01), parametric, cfg(backend))

    assert result.walls_checked == 4
    for wall in result.walls:
        expected = 0.01 * syn.wall_length_mm(wall.wall_ref)
        assert wall.delta_mm == pytest.approx(expected, abs=3.0)
        assert wall.mesh_mm > wall.parametric_mm
        # The mesh room is also 1% wider, so each wall sits outside its
        # parametric centreline by half a percent of the OPPOSING dimension —
        # and outward is positive on every wall.
        opposing = syn.DEPTH_M if wall.wall_ref in ("wall-north", "wall-south") else syn.WIDTH_M
        assert wall.offset_mm == pytest.approx(0.005 * opposing * 1000, abs=2.0)
    assert result.max_delta_mm == pytest.approx(0.01 * syn.WIDTH_M * 1000, abs=3.0)


def test_tolerance_threshold_is_plumbed_from_config(parametric, backend):
    points = syn.mesh_points(mesh_scale=1.01)

    tight = verify_room(points, parametric, cfg(backend, tolerance_mm=25.0))
    assert tight.walls_within_tolerance == 0
    assert all(w.within_tolerance is False for w in tight.walls)

    loose = verify_room(points, parametric, cfg(backend, tolerance_mm=100.0))
    assert loose.walls_within_tolerance == 4
    # Only the verdict moves; the measurement does not.
    assert [w.delta_mm for w in tight.walls] == [w.delta_mm for w in loose.walls]


def test_bowed_wall_is_flagged_curved(parametric, backend):
    result = verify_room(
        syn.mesh_points(bow_wall="wall-north", bow_m=0.12), parametric, cfg(backend)
    )

    assert result.curved_walls == ["wall-north"]
    bowed = next(w for w in result.walls if w.wall_ref == "wall-north")
    assert bowed.planarity_rms_mm > VerifyConfig().curved_rms_mm
    for straight in (w for w in result.walls if w.wall_ref != "wall-north"):
        assert straight.curved_flag is False
        assert straight.planarity_rms_mm < VerifyConfig().curved_rms_mm


def test_curved_threshold_is_plumbed_from_config(parametric, backend):
    points = syn.mesh_points(bow_wall="wall-north", bow_m=0.12)
    relaxed = verify_room(points, parametric, cfg(backend, curved_rms_mm=500.0))
    assert relaxed.curved_walls == []


def test_furniture_slab_is_not_matched_as_a_wall(parametric, backend):
    result = verify_room(syn.mesh_points(furniture=True), parametric, cfg(backend))

    assert result.walls_checked == 4
    assert {w.wall_ref for w in result.walls} == WALL_REFS
    assert result.unmatched_walls == []
    assert result.walls_within_tolerance == 4
    # The slab is a real vertical plane, so it must surface as unmatched rather
    # than vanish — and it must be reported near the room centre, not at a wall.
    assert len(result.unmatched_planes) == 1
    slab = result.unmatched_planes[0]
    assert slab["inlier_count"] >= VerifyConfig().min_inliers
    assert abs(slab["centroid_m"][0]) < 0.1


def test_result_dict_shape(parametric, backend):
    doc = verify_room(syn.mesh_points(), parametric, cfg(backend)).to_dict()

    assert set(doc) == {"walls", "summary", "backend", "warnings"}
    assert doc["backend"] == backend
    assert set(doc["walls"][0]) == {
        "wall_ref", "parametric_mm", "mesh_mm", "delta_mm", "within_tolerance",
        "curved_flag", "offset_mm", "planarity_rms_mm", "mesh_points",
    }
    assert set(doc["summary"]) == {
        "walls_checked", "walls_within_tolerance", "max_delta_mm", "curved_walls", "unmatched",
    }
    assert set(doc["summary"]["unmatched"]) == {"parametric_walls", "planes"}


def test_sparse_cloud_degrades_instead_of_throwing(parametric, backend):
    thin = syn.mesh_points(spacing=1.0)
    result = verify_room(thin, parametric, cfg(backend))

    assert result.walls == []
    assert sorted(result.unmatched_walls) == sorted(WALL_REFS)
    assert any("too sparse" in w for w in result.warnings)


# ── matching: extent overlap and exclusive point ownership ──────────────────


def test_l_shaped_room_matches_all_six_walls(backend):
    """Six walls, two of them meeting at a 270° reflex corner, and three
    different lengths. Every one must match its own plane and measure true —
    the corner bands overlap here just as they do in a rectangle, and one wall
    stealing a neighbour's points would show up immediately as a bad span."""
    parametric = parse_captured_room_meters(syn.l_room_json())
    assert [w.apple_id for w in parametric.walls] == syn.L_ROOM_WALL_REFS

    result = verify_room(syn.l_room_points(), parametric, cfg(backend))

    assert result.unmatched_walls == []
    assert result.walls_checked == 6
    assert [w.wall_ref for w in result.walls] == syn.L_ROOM_WALL_REFS
    assert result.walls_within_tolerance == 6
    assert result.curved_walls == []
    for wall, ref in zip(result.walls, syn.L_ROOM_WALL_REFS):
        expected = next(w for w in parametric.walls if w.apple_id == ref).length_m * 1000.0
        assert wall.parametric_mm == pytest.approx(expected)
        assert wall.mesh_mm == pytest.approx(expected, abs=5.0)
    # Six walls, six distinct planes — no plane serves two walls.
    assert result.unmatched_planes == []


def test_short_parallel_closet_face_is_not_matched_as_the_wall_behind_it(backend):
    """The north wall is unscanned and a 1.5 m closet face stands 30 cm in front
    of it — inside `match_dist_m`, parallel, and the nearest vertical plane
    there is. Only extent overlap can refuse it."""
    parametric = parse_captured_room_meters(syn.captured_room_json())
    points = syn.closet_room_points()

    result = verify_room(points, parametric, cfg(backend))

    assert result.unmatched_walls == ["wall-north"]
    assert {w.wall_ref for w in result.walls} == WALL_REFS - {"wall-north"}
    assert result.walls_within_tolerance == 3
    # The closet face is a real vertical plane, so it surfaces as unmatched
    # rather than vanishing.
    assert len(result.unmatched_planes) == 1


def test_the_closet_gate_is_the_extent_overlap_and_nothing_else(backend):
    """The negative half — and the reason this gate is worth having.

    Open the gate and the SAME input verifies CLEAN: the north wall matches the
    closet face, and because the closet plane extends through the west and east
    walls' corner points it even measures the full 4 m and reports
    `within_tolerance`. A wall that was never scanned comes back perfect. The
    only trace is a 300 mm `offset_mm`, and nothing looks at that.

    So the failure this closes is not a wrong number — it is a CONFIDENT wrong
    number, which is the one thing a verification stage may not produce."""
    parametric = parse_captured_room_meters(syn.captured_room_json())
    points = syn.closet_room_points()

    ungated = verify_room(points, parametric, cfg(backend, min_extent_overlap=0.0))

    assert ungated.unmatched_walls == []
    assert ungated.walls_within_tolerance == 4          # every one a false pass
    north = next(w for w in ungated.walls if w.wall_ref == "wall-north")
    assert north.within_tolerance is True
    # The standoff is the only evidence, and it is the thing the gate keys on.
    assert north.offset_mm == pytest.approx(-300.0, abs=5.0)


def test_degenerate_wall_degrades_out(backend):
    doc = syn.captured_room_json()
    doc["walls"].append(
        {"identifier": "wall-degenerate", "dimensions": [0.0, 2.5, 0.1],
         "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.25, 0, 1]}
    )
    result = verify_room(syn.mesh_points(), parse_captured_room_meters(doc), cfg(backend))

    assert "wall-degenerate" in result.unmatched_walls
    assert result.walls_checked == 4
