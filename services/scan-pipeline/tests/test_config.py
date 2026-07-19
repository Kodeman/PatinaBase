"""Config: required-var enforcement, stage validation, task_type derivation."""

from __future__ import annotations

from dataclasses import replace

import pytest

from patina_scan_worker.config import ConfigError, Settings, settings_from_env

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
    assert s.visibility_timeout_seconds == 60 * 60
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


@pytest.mark.parametrize(
    ("raw", "seconds"),
    [
        ("90 seconds", 90.0),
        ("1.5 minutes", 90.0),
        ("2 hours", 7200.0),
        ("1 SEC", 1.0),
        ("2 mins", 120.0),
        ("0.5 hr", 1800.0),
    ],
)
def test_visibility_timeout_normalizes_supported_intervals(raw, seconds):
    settings = settings_from_env({**BASE, "VISIBILITY_TIMEOUT": raw})
    assert settings.visibility_timeout == raw
    assert settings.visibility_timeout_seconds == pytest.approx(seconds)


@pytest.mark.parametrize(
    "raw",
    [
        "0 seconds",
        "-1 minute",
        "nan seconds",
        "inf hours",
        "1 day",
        "1 month",
        "1 hour 30 minutes",
        "15",
        "15 minutes; select 1",
    ],
)
def test_visibility_timeout_rejects_unsafe_or_ambiguous_intervals(raw):
    with pytest.raises(ConfigError, match="VISIBILITY_TIMEOUT"):
        settings_from_env({**BASE, "VISIBILITY_TIMEOUT": raw})


def test_visibility_timeout_has_one_source_of_truth_for_direct_settings():
    settings = Settings(
        worker_id="direct-worker",
        supabase_url="https://example.supabase.co",
        service_role_key="svc-key",
        visibility_timeout="2 minutes",
    )
    assert settings.visibility_timeout_seconds == 120.0

    updated = replace(settings, visibility_timeout="90 seconds")
    assert updated.visibility_timeout_seconds == 90.0

    with pytest.raises(ConfigError, match="VISIBILITY_TIMEOUT"):
        replace(settings, visibility_timeout="1 day")


def test_url_trailing_slash_trimmed():
    s = settings_from_env({**BASE, "SUPABASE_URL": "https://x.supabase.co/"})
    assert s.supabase_url == "https://x.supabase.co"
