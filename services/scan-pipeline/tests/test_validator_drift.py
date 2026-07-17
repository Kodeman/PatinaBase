"""Drift guard — the vendored validator MUST be byte-identical to the canonical
source in scripts/. Single canonical source stays scripts/validate_capture_bundle.py;
the worker vendors a byte-for-byte copy so device-side and server-side verdicts
run the same code path (design §2.4, blessed item-9 call).

If this fails: re-copy the canonical script over the vendored module.
  cp scripts/validate_capture_bundle.py \
     services/scan-pipeline/src/patina_scan_worker/stages/validator.py
"""

from __future__ import annotations

from pathlib import Path

# tests/ -> scan-pipeline -> services -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_CANONICAL = _REPO_ROOT / "scripts" / "validate_capture_bundle.py"
_VENDORED = (
    _REPO_ROOT
    / "services" / "scan-pipeline" / "src" / "patina_scan_worker" / "stages" / "validator.py"
)


def test_vendored_validator_is_byte_identical():
    assert _CANONICAL.is_file(), f"canonical validator missing: {_CANONICAL}"
    assert _VENDORED.is_file(), f"vendored validator missing: {_VENDORED}"
    canonical = _CANONICAL.read_bytes()
    vendored = _VENDORED.read_bytes()
    assert vendored == canonical, (
        "vendored validator has drifted from scripts/validate_capture_bundle.py — "
        "re-copy the canonical source over "
        "services/scan-pipeline/src/patina_scan_worker/stages/validator.py"
    )


def test_vendored_validator_is_importable():
    # The vendored copy must be importable as a module (it exposes validate_bundle,
    # make_fixture, sha256_of) without executing the CLI at import time.
    from patina_scan_worker.stages import validator

    assert hasattr(validator, "validate_bundle")
    assert hasattr(validator, "make_fixture")
    assert hasattr(validator, "sha256_of")
