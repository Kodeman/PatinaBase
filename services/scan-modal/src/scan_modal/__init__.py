"""Patina Rendered Room v2 — the Modal side of the scan pipeline.

`verify` runs CPU-only, `splat` on an L4, `renders` on an L40S.

Nothing heavy is imported here: `app.py` runs inside the endpoint image (fastapi
only, no numpy) and `jobs/splat_job.py` runs inside the CUDA image, and both need
`SPLAT_CACHE_MOUNT`. A leaf module with no dependencies is the only place the two
can share a constant without dragging one image's dependencies into the other.
"""

__all__ = ["__version__", "SPLAT_CACHE_MOUNT"]

__version__ = "0.1.0"

#: Where the `splat` preemption-resume Volume is mounted. `app.py` mounts it,
#: `jobs/splat_job.py` builds its job-keyed workspace under it — one literal, so
#: a moved mount point cannot silently orphan every checkpoint.
SPLAT_CACHE_MOUNT = "/splat-cache"
