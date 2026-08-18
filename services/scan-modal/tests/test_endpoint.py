"""Spawn endpoint — bearer auth and task dispatch, with the Modal layer faked.

`scan_modal.app` imports without the `modal` package installed, which is the
property that lets these run at all.
"""

from __future__ import annotations

import pytest

from scan_modal import app as modal_app

TOKEN = "s3cret-dispatcher-token"


def body(**overrides) -> dict:
    payload = {
        "taskId": "task-1",
        "scanId": "scan-1",
        "roomFileId": "rf-1",
        "roomFileVersion": 3,
        "taskType": "scan_pipeline.verify",
        "traceId": "trace-1",
        "inputs": {"meshPlyUrl": "https://example/mesh.ply"},
    }
    payload.update(overrides)
    return payload


class FakeSpawner:
    """Stands in for Function.spawn — records the call, returns a handle."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, function_name: str, payload: dict):
        self.calls.append((function_name, payload))
        return object()


def auth(token: str = TOKEN) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_module_imports_without_modal():
    assert modal_app.modal is None or hasattr(modal_app.modal, "App")
    assert modal_app.AUTH_SECRET_NAME == "scan-modal-auth"


def test_spawns_verify_and_returns_202():
    spawner = FakeSpawner()
    status, content = modal_app.handle_spawn(auth(), body(), spawner, expected_token=TOKEN)

    assert status == 202
    assert content == {"spawned": True, "taskId": "task-1"}
    assert len(spawner.calls) == 1
    name, payload = spawner.calls[0]
    assert name == "verify"
    assert payload["roomFileVersion"] == 3
    assert payload["traceId"] == "trace-1"
    assert payload["inputs"] == {"meshPlyUrl": "https://example/mesh.ply"}


@pytest.mark.parametrize(
    "task_type,expected",
    [
        ("scan_pipeline.verify", "verify"),
        ("scan_pipeline.splat", "splat"),
        ("scan_pipeline.renders", "renders"),
        ("verify", "verify"),
    ],
)
def test_dispatches_each_known_task_type(task_type, expected):
    spawner = FakeSpawner()
    status, _ = modal_app.handle_spawn(
        auth(), body(taskType=task_type), spawner, expected_token=TOKEN
    )
    assert status == 202
    assert spawner.calls[0][0] == expected


def test_unknown_task_type_is_400_and_never_spawns():
    spawner = FakeSpawner()
    status, content = modal_app.handle_spawn(
        auth(), body(taskType="scan_pipeline.teleport"), spawner, expected_token=TOKEN
    )

    assert status == 400
    assert content["error"] == "unknown_task_type"
    assert spawner.calls == []


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong-token"},
        {"Authorization": TOKEN},                    # no scheme
        {"Authorization": "Basic " + TOKEN},         # wrong scheme
        {"Authorization": "Bearer "},                # empty token
        {"Authorization": f"Bearer {TOKEN}x"},       # prefix of the real token
    ],
)
def test_bad_auth_is_401_and_never_spawns(headers):
    spawner = FakeSpawner()
    status, content = modal_app.handle_spawn(headers, body(), spawner, expected_token=TOKEN)

    assert status == 401
    assert content["spawned"] is False
    assert spawner.calls == []


def test_header_name_is_case_insensitive():
    spawner = FakeSpawner()
    status, _ = modal_app.handle_spawn(
        {"authorization": f"Bearer {TOKEN}"}, body(), spawner, expected_token=TOKEN
    )
    assert status == 202


def test_missing_secret_fails_closed_as_503():
    spawner = FakeSpawner()
    status, content = modal_app.handle_spawn(auth(), body(), spawner, expected_token="")

    assert status == 503
    assert content["error"] == "auth_not_configured"
    assert spawner.calls == []


@pytest.mark.parametrize("field", ["taskId", "scanId", "roomFileId", "roomFileVersion", "taskType"])
def test_missing_required_field_is_400(field):
    spawner = FakeSpawner()
    payload = body()
    payload.pop(field)
    status, content = modal_app.handle_spawn(auth(), payload, spawner, expected_token=TOKEN)

    assert status == 400
    assert field in content["error"]
    assert spawner.calls == []


@pytest.mark.parametrize("bad", [None, [], "string", {"inputs": []}])
def test_malformed_body_is_400(bad):
    spawner = FakeSpawner()
    status, _ = modal_app.handle_spawn(auth(), bad, spawner, expected_token=TOKEN)
    assert status == 400
    assert spawner.calls == []


def test_optional_fields_default():
    spawner = FakeSpawner()
    payload = body()
    del payload["traceId"]
    del payload["inputs"]
    status, _ = modal_app.handle_spawn(auth(), payload, spawner, expected_token=TOKEN)

    assert status == 202
    assert spawner.calls[0][1]["traceId"] is None
    assert spawner.calls[0][1]["inputs"] == {}


def test_token_read_from_environment_when_not_passed(monkeypatch):
    monkeypatch.setenv(modal_app.AUTH_TOKEN_ENV, TOKEN)
    spawner = FakeSpawner()
    status, _ = modal_app.handle_spawn(auth(), body(), spawner)
    assert status == 202

    monkeypatch.delenv(modal_app.AUTH_TOKEN_ENV)
    status, content = modal_app.handle_spawn(auth(), body(), spawner)
    assert status == 503
