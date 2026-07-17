"""Queue client — the M1 lost-race guard: a completion rejected because the task
is no longer running is swallowed (logged, returns False), never crashes."""

from __future__ import annotations

import pytest

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.errors import TransientError
from patina_scan_worker.queue import QueueClient

BASE = {
    "WORKER_ID": "test-worker",
    "SUPABASE_URL": "https://x.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "svc",
}


class _Resp:
    def __init__(self, status_code, text="", json_data=None):
        self.status_code = status_code
        self.text = text
        self._json = json_data
        self.content = (text or (json_data is not None)) and b"x" or b""

    def json(self):
        return self._json


class _FakeSession:
    """Records POSTs; returns a scripted response per RPC path."""

    def __init__(self, post_resp: _Resp, get_resp: _Resp | None = None):
        self._post_resp = post_resp
        self._get_resp = get_resp
        self.posts: list[tuple[str, dict]] = []

    def post(self, path, json=None):
        self.posts.append((path, json))
        return self._post_resp

    def get(self, path):
        return self._get_resp or _Resp(200, json_data=[{"locked_by": "worker-b", "status": "done"}])


def _client(post_resp, get_resp=None):
    return QueueClient(_FakeSession(post_resp, get_resp), settings_from_env(BASE))


def test_complete_done_lost_race_returns_false_no_raise():
    resp = _Resp(400, text='{"code":"P0001","message":"complete_agent_task: task 1 is done (must be running)"}')
    qc = _client(resp)
    # must NOT raise; returns False (we lost the race)
    assert qc.complete_done("task-1", {"validated": True}) is False


def test_complete_failed_lost_race_returns_false_no_raise():
    resp = _Resp(400, text='{"message":"complete_agent_task: task 1 not found"}')
    qc = _client(resp)
    assert qc.complete_failed("task-1", "boom", fatal=True) is False


def test_complete_done_success_returns_true():
    resp = _Resp(204)
    qc = _client(resp)
    assert qc.complete_done("task-1", {}) is True


def test_real_4xx_still_raises_runtimeerror():
    # a non-lost-race 4xx (e.g. a contract error) must still surface loudly
    resp = _Resp(400, text='{"message":"invalid input syntax for type uuid"}')
    qc = _client(resp)
    with pytest.raises(RuntimeError):
        qc.complete_done("task-1", {})


def test_5xx_is_transient():
    resp = _Resp(503, text="upstream down")
    qc = _client(resp)
    with pytest.raises(TransientError):
        qc.complete_done("task-1", {})


def test_enqueue_successor_lost_race_is_noop():
    resp = _Resp(400, text='{"message":"task not found"}')
    qc = _client(resp)
    # idempotent successor: a lost race is a no-op, returns None, never raises
    assert qc.enqueue_successor(
        "scan_pipeline.solve", {"scan_id": "s"}, "s", "s:solve:1", "parent"
    ) is None
