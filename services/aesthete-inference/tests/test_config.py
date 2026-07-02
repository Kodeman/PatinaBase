"""Startup posture: no INFERENCE_TOKEN → refuse to start, loudly (§12.1)."""

from __future__ import annotations

import pytest

from app.config import settings_from_env


def test_missing_token_refuses_to_start(monkeypatch):
    monkeypatch.delenv("INFERENCE_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="INFERENCE_TOKEN"):
        settings_from_env()


def test_blank_token_refuses_to_start(monkeypatch):
    monkeypatch.setenv("INFERENCE_TOKEN", "   ")
    with pytest.raises(RuntimeError, match="INFERENCE_TOKEN"):
        settings_from_env()


def test_env_overrides_flow_through(monkeypatch):
    monkeypatch.setenv("INFERENCE_TOKEN", "tok")
    monkeypatch.setenv("INFERENCE_MAX_CONCURRENCY", "4")
    monkeypatch.setenv("TEXT_MAX_TOKENS", "512")
    s = settings_from_env()
    assert s.inference_token == "tok"
    assert s.max_concurrency == 4
    assert s.text_max_tokens == 512
