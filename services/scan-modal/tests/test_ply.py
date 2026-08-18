"""PLY vertex reader — round-trips, header variants, and refusals."""

from __future__ import annotations

import numpy as np
import pytest

from scan_modal.io.ply import PlyError, read_ply_vertices

import _synthetic as syn

FORMATS = ["ascii", "binary_little_endian", "binary_big_endian"]


@pytest.fixture
def points():
    return syn.mesh_points(spacing=0.5)


@pytest.mark.parametrize("fmt", FORMATS)
def test_round_trip(fmt, points):
    read = read_ply_vertices(syn.write_ply(points, fmt=fmt))

    assert read.shape == points.shape
    assert read.dtype == np.float64
    # float32 storage in the PLY sets the comparison floor.
    assert np.allclose(read, points, atol=1e-5)


@pytest.mark.parametrize("fmt", FORMATS)
def test_extra_properties_are_skipped(fmt, points):
    read = read_ply_vertices(syn.write_ply(points, fmt=fmt, extras=True))
    assert np.allclose(read, points, atol=1e-5)


def test_double_precision_ascii_round_trips_exactly():
    pts = np.array([[1.0, -2.5, 3.25], [0.0, 0.0, 0.0]])
    ply = (
        b"ply\nformat ascii 1.0\nelement vertex 2\n"
        b"property double x\nproperty double y\nproperty double z\nend_header\n"
        b"1.0 -2.5 3.25\n0.0 0.0 0.0\n"
    )
    assert np.array_equal(read_ply_vertices(ply), pts)


def test_property_order_is_honoured():
    ply = (
        b"ply\nformat ascii 1.0\nelement vertex 1\n"
        b"property float z\nproperty float y\nproperty float x\nend_header\n"
        b"3 2 1\n"
    )
    assert np.allclose(read_ply_vertices(ply), [[1.0, 2.0, 3.0]])


def test_rejects_non_ply():
    with pytest.raises(PlyError):
        read_ply_vertices(b"not a ply at all")


def test_rejects_missing_vertex_element():
    ply = b"ply\nformat ascii 1.0\nelement face 0\nproperty list uchar int vertex_indices\nend_header\n"
    with pytest.raises(PlyError):
        read_ply_vertices(ply)


def test_rejects_truncated_body():
    ply = b"ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n"
    with pytest.raises(PlyError):
        read_ply_vertices(ply)


def test_reader_output_feeds_the_core(points):
    from scan_modal.core.captured_room import parse_captured_room_meters
    from scan_modal.core.verify import VerifyConfig, verify_room

    dense = syn.mesh_points()
    read = read_ply_vertices(syn.write_ply(dense, fmt="binary_little_endian"))
    result = verify_room(
        read, parse_captured_room_meters(syn.captured_room_json()), VerifyConfig(backend="numpy")
    )
    assert result.walls_checked == 4
    assert result.walls_within_tolerance == 4
