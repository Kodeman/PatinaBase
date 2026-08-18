"""Shared fixtures. Every geometry test runs on every backend present.

Open3D is the preferred backend and the numpy RANSAC is the fallback for
interpreters it has no wheel for, so both must produce the same verdicts. When
Open3D is not installed the parametrization collapses to numpy alone and the
suite still runs.
"""

from __future__ import annotations

import pytest

from scan_modal.core.verify import open3d_available

BACKENDS = ["numpy"] + (["open3d"] if open3d_available() else [])


@pytest.fixture(params=BACKENDS)
def backend(request) -> str:
    return request.param
