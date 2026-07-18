"""Config: required-var enforcement, stage validation, task_type derivation."""

from __future__ import annotations

import pytest

from patina_scan_worker.config import ConfigError, settings_from_env

BASE = {
    "WORKER_ID": "homelab-1",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "svc-key",
}


def test_required_missing_refuses_to_start():
    for missing in ("WORKER_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        env = dict(BASE)
        del env[missing]
        with pytest.raises(ConfigError) as ei:
            settings_from_env(env)
        assert missing in str(ei.value)


def test_defaults_and_task_types():
    s = settings_from_env(dict(BASE))
    assert s.stages == ("ingest", "solve", "drawings")
    assert s.task_types == (
        "scan_pipeline.ingest",
        "scan_pipeline.solve",
        "scan_pipeline.drawings",
    )
    assert s.poll_seconds == 5
    assert s.max_concurrent == 2
    assert s.gpu == "auto"
    assert s.visibility_timeout == "60 minutes"
    assert s.room_scans_bucket == "room-scans"


def test_stages_subset_and_filtering():
    s = settings_from_env({**BASE, "STAGES": "ingest"})
    assert s.stages == ("ingest",)
    assert s.task_types == ("scan_pipeline.ingest",)

    s2 = settings_from_env({**BASE, "STAGES": "drawings, solve"})
    assert s2.stages == ("drawings", "solve")


def test_unknown_stage_rejected():
    with pytest.raises(ConfigError) as ei:
        settings_from_env({**BASE, "STAGES": "ingest,warp"})
    assert "warp" in str(ei.value)


def test_p2_gpu_stages_are_known():
    # item 3: the P2 stage names are declared in KNOWN_STAGES so a GPU box can
    # advertise them ahead of their handlers landing (items 4–7).
    s = settings_from_env({**BASE, "STAGES": "ingest,refine,fuse,splat,present"})
    assert s.stages == ("ingest", "refine", "fuse", "splat", "present")
    assert s.task_types == (
        "scan_pipeline.ingest", "scan_pipeline.refine", "scan_pipeline.fuse",
        "scan_pipeline.splat", "scan_pipeline.present",
    )


def test_gpu_stages_constant_and_cpu_default():
    from patina_scan_worker.config import DEFAULT_STAGES, GPU_STAGES
    assert GPU_STAGES == frozenset({"refine", "fuse", "splat"})
    # the default stays CPU-only — a box opts into GPU stages explicitly.
    assert GPU_STAGES.isdisjoint(DEFAULT_STAGES.split(","))


def test_gpu_must_be_legal():
    with pytest.raises(ConfigError):
        settings_from_env({**BASE, "GPU": "maybe"})
    assert settings_from_env({**BASE, "GPU": "off"}).gpu == "off"


def test_numeric_fields_parse_and_validate():
    s = settings_from_env(
        {**BASE, "POLL_SECONDS": "10", "MAX_CONCURRENT": "4", "RETENTION_HOURS": "72"}
    )
    assert (s.poll_seconds, s.max_concurrent, s.retention_hours) == (10, 4, 72)

    with pytest.raises(ConfigError):
        settings_from_env({**BASE, "MAX_CONCURRENT": "0"})
    with pytest.raises(ConfigError):
        settings_from_env({**BASE, "POLL_SECONDS": "not-an-int"})


def test_url_trailing_slash_trimmed():
    s = settings_from_env({**BASE, "SUPABASE_URL": "https://x.supabase.co/"})
    assert s.supabase_url == "https://x.supabase.co"
