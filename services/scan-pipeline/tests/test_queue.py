"""Queue client — the M1 lost-race guard: a completion rejected because this
worker no longer owns the lease is swallowed (logged, returns False), never
crashes."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.errors import TransientError
from patina_scan_worker.queue import QueueClient
from patina_scan_worker.worker import process_one

BASE = {
    "WORKER_ID": "test-worker",
    "SUPABASE_URL": "https://x.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "svc",
}
LEASE_OWNER = "test-worker:test-lease"


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
    return QueueClient(
        _FakeSession(post_resp, get_resp),
        settings_from_env(BASE),
        lease_id_factory=lambda: "test-lease",
    )


def test_complete_done_lost_race_returns_false_no_raise():
    resp = _Resp(
        400,
        text=(
            '{"code":"P0001","message":"complete_agent_task: lease ownership '
            'rejected for task 1 (locked_by worker-b, p_actor test-worker:test-lease)"}'
        ),
    )
    qc = _client(resp)
    # must NOT raise; returns False (we lost the race)
    assert qc.complete_done(
        "task-1", {"validated": True}, lease_owner=LEASE_OWNER
    ) is False


def test_complete_failed_lost_race_returns_false_no_raise():
    resp = _Resp(400, text='{"message":"complete_agent_task: task 1 not found"}')
    qc = _client(resp)
    assert qc.complete_failed(
        "task-1", "boom", fatal=True, lease_owner=LEASE_OWNER
    ) is False


def test_complete_done_success_returns_true():
    resp = _Resp(204)
    qc = _client(resp)
    assert qc.complete_done("task-1", {}, lease_owner=LEASE_OWNER) is True


def test_real_4xx_still_raises_runtimeerror():
    # a non-lost-race 4xx (e.g. a contract error) must still surface loudly
    resp = _Resp(400, text='{"message":"invalid input syntax for type uuid"}')
    qc = _client(resp)
    with pytest.raises(RuntimeError):
        qc.complete_done("task-1", {}, lease_owner=LEASE_OWNER)


def test_5xx_is_transient():
    resp = _Resp(503, text="upstream down")
    qc = _client(resp)
    with pytest.raises(TransientError):
        qc.complete_done("task-1", {}, lease_owner=LEASE_OWNER)


@pytest.mark.parametrize("invalid_owner", ["test-worker", "test-worker:"])
def test_completion_rejects_static_worker_label_instead_of_falling_back(invalid_owner):
    session = _FakeSession(_Resp(204))
    qc = QueueClient(session, settings_from_env(BASE))
    with pytest.raises(RuntimeError, match="exact base-prefixed identity"):
        qc.complete_done("task-1", {}, lease_owner=invalid_owner)
    assert session.posts == []


def test_enqueue_successor_lost_race_is_noop():
    resp = _Resp(
        400,
        text=(
            '{"message":"enqueue_agent_successor_if_owned: owner task '
            'task-1 not found"}'
        ),
    )
    qc = _client(resp)
    # idempotent successor: a lost race is a no-op, returns None, never raises
    assert qc.enqueue_successor(
        "scan_pipeline.solve",
        {"scan_id": "s"},
        "s",
        "s:solve:1",
        owner_task_id="task-1",
        parent_task_id="task-1",
        lease_owner=LEASE_OWNER,
    ) is None


def test_enqueue_successor_keeps_branch_owner_separate_from_join_lineage():
    session = _FakeSession(_Resp(200, json_data={"id": "child-1"}))
    qc = QueueClient(
        session,
        settings_from_env(BASE),
        lease_id_factory=lambda: "test-lease",
    )

    assert qc.enqueue_successor(
        "scan_pipeline.present",
        {"scan_id": "s"},
        "s",
        "s:present:1",
        owner_task_id="branch-tip-task",
        parent_task_id="refine-task",
        lease_owner=LEASE_OWNER,
    ) == {"id": "child-1"}
    assert session.posts == [
        (
            "/rest/v1/rpc/enqueue_agent_successor_if_owned",
            {
                "p_owner_task_id": "branch-tip-task",
                "p_task_type": "scan_pipeline.present",
                "p_payload": {"scan_id": "s"},
                "p_source": "scan-pipeline",
                "p_entity_type": "room_scan",
                "p_entity_id": "s",
                "p_idempotency_key": "s:present:1",
                "p_max_attempts": 5,
                "p_parent_task_id": "refine-task",
                "p_actor": LEASE_OWNER,
            },
        )
    ]


def test_unguarded_rpc_does_not_swallow_not_found_as_a_lease_race():
    qc = _client(_Resp(400, text='{"message":"task not found"}'))
    with pytest.raises(RuntimeError, match="task not found"):
        qc.requeue("task-1")


def test_missing_guarded_rpc_is_not_misclassified_as_a_lease_race():
    qc = _client(
        _Resp(
            404,
            text=(
                '{"message":"Could not find the function '
                'public.enqueue_agent_successor_if_owned in the schema cache"}'
            ),
        )
    )
    with pytest.raises(RuntimeError, match="Could not find the function"):
        qc.enqueue_successor(
            "scan_pipeline.solve",
            {"scan_id": "s"},
            "s",
            "s:solve:1",
            owner_task_id="task-1",
            parent_task_id="task-1",
            lease_owner=LEASE_OWNER,
        )


def test_same_task_in_overlapping_claim_batches_keeps_immutable_lease_owners():
    class _BatchSession:
        def __init__(self):
            self.posts: list[tuple[str, dict]] = []
            self.claim_count = 0

        def post(self, path, json=None):
            self.posts.append((path, json))
            if path.endswith("/claim_agent_tasks"):
                self.claim_count += 1
                return _Resp(
                    200,
                    json_data=[
                        {
                            "id": "task-shared",
                            "task_type": "scan_pipeline.ingest",
                        }
                    ],
                )
            return _Resp(204)

        def get(self, path):
            return _Resp(200, json_data=[])

    suffixes = iter(("batch-a", "batch-b"))
    session = _BatchSession()
    qc = QueueClient(
        session,
        settings_from_env(BASE),
        lease_id_factory=lambda: next(suffixes),
    )

    first = qc.claim()
    second = qc.claim()
    assert first[0]["_lease_owner"] == "test-worker:batch-a"
    assert second[0]["_lease_owner"] == "test-worker:batch-b"
    assert qc.complete_done(
        first[0]["id"], {}, lease_owner=first[0]["_lease_owner"]
    ) is True
    assert qc.complete_done(
        second[0]["id"], {}, lease_owner=second[0]["_lease_owner"]
    ) is True

    claim_bodies = [body for path, body in session.posts if path.endswith("/claim_agent_tasks")]
    completion_bodies = [
        body for path, body in session.posts if path.endswith("/complete_agent_task")
    ]
    assert [body["p_worker"] for body in claim_bodies] == [
        "test-worker:batch-a",
        "test-worker:batch-b",
    ]
    assert [body["p_actor"] for body in completion_bodies] == [
        "test-worker:batch-a",
        "test-worker:batch-b",
    ]


def test_process_one_reports_lease_lost_instead_of_a_durable_outcome():
    class _LostQueue:
        def complete_failed(self, task_id, error, fatal, *, lease_owner):
            assert task_id == "task-stale"
            assert fatal is True
            assert lease_owner == LEASE_OWNER
            return False

    ctx = SimpleNamespace(queue=_LostQueue())
    task = {
        "id": "task-stale",
        "task_type": "scan_pipeline.unknown",
        "_lease_owner": LEASE_OWNER,
    }
    assert process_one(ctx, task) == "lease-lost"
