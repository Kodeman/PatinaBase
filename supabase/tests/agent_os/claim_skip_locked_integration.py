#!/usr/bin/env python3
"""Prove claim_agent_tasks uses row locks + SKIP LOCKED across real sessions.

This runner is deliberately local-only. It creates two uniquely keyed,
committed fixtures under a per-run task-type namespace, holds session A's claim
transaction at an advisory-lock barrier, then lets session B claim while A
still owns the first row lock. A third, differently typed owned fixture proves
the claim filter is exact. Cleanup targets only the generated idempotency keys.

The database and migration are not started or applied by this script. Example:

    python3 supabase/tests/agent_os/claim_skip_locked_integration.py \
      --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
import uuid
from typing import Dict, List, Optional, Sequence, Tuple
from urllib.parse import SplitResult, parse_qsl, urlsplit


LOCAL_HOSTS = {"localhost", "127.0.0.1"}
LOCAL_PORT = 54322
BARRIER_CLASS = 0x50415449  # "PATI", within signed int32.
LOCK_WAIT_SECONDS = 10.0
PROCESS_WAIT_SECONDS = 10.0


def validate_local_db_url(db_url: str) -> SplitResult:
    """Return the parsed URL or reject anything that could target non-local DB."""

    if not db_url:
        raise ValueError("--db-url is required; no implicit database target is allowed")
    try:
        parsed = urlsplit(db_url)
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f"invalid database URL: {exc}") from exc

    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("database URL must use postgres:// or postgresql://")
    if parsed.hostname not in LOCAL_HOSTS:
        raise ValueError("database URL must target local Supabase at localhost or 127.0.0.1")
    if port != LOCAL_PORT:
        raise ValueError("database URL must explicitly use local Supabase port 54322")

    # libpq accepts connection-target overrides in URI query parameters. Refuse
    # those even though the authority above is local.
    target_overrides = {"host", "hostaddr", "port", "service", "servicefile"}
    query_keys = {key.lower() for key, _value in parse_qsl(parsed.query, keep_blank_values=True)}
    dangerous = sorted(query_keys & target_overrides)
    if dangerous:
        raise ValueError(
            "database URL must not override its local target via query parameter(s): "
            + ", ".join(dangerous)
        )
    return parsed


def _psql_env(app_name: str) -> Dict[str, str]:
    env = os.environ.copy()
    for key in ("PGHOST", "PGHOSTADDR", "PGPORT", "PGSERVICE", "PGSERVICEFILE"):
        env.pop(key, None)
    env["PGAPPNAME"] = app_name
    env["PGCONNECT_TIMEOUT"] = "5"
    return env


def _psql_command(psql: str, db_url: str, variables: Dict[str, str]) -> List[str]:
    cmd = [psql, db_url, "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1"]
    for key, value in variables.items():
        cmd.extend(("-v", f"{key}={value}"))
    return cmd


def _run_psql(
    psql: str,
    db_url: str,
    sql: str,
    variables: Dict[str, str],
    app_name: str,
    timeout: float = PROCESS_WAIT_SECONDS,
) -> str:
    result = subprocess.run(
        _psql_command(psql, db_url, variables),
        input=sql,
        text=True,
        capture_output=True,
        timeout=timeout,
        env=_psql_env(app_name),
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown psql failure"
        raise RuntimeError(f"psql ({app_name}) failed: {detail}")
    return result.stdout


def _start_psql(
    psql: str,
    db_url: str,
    sql: str,
    variables: Dict[str, str],
    app_name: str,
    *,
    close_stdin: bool = True,
) -> subprocess.Popen[str]:
    process = subprocess.Popen(
        _psql_command(psql, db_url, variables),
        stdin=subprocess.PIPE,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_psql_env(app_name),
    )
    if process.stdin is None:
        process.terminate()
        raise RuntimeError(f"psql ({app_name}) did not expose stdin")
    process.stdin.write(sql)
    process.stdin.flush()
    if close_stdin:
        process.stdin.close()
        # communicate() tries to flush stdin when the attribute is non-None.
        # The full script is delivered and EOF is required for psql to exit, so
        # clear the closed handle before later communicate() calls.
        process.stdin = None
    return process


def _process_output(process: subprocess.Popen[str], name: str) -> str:
    try:
        stdout, stderr = process.communicate(timeout=PROCESS_WAIT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        process.terminate()
        try:
            process.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
        raise RuntimeError(f"{name} did not finish after its barrier was released") from exc
    if process.returncode != 0:
        raise RuntimeError(f"{name} failed: {(stderr or stdout).strip()}")
    return stdout


def _stop_process(process: Optional[subprocess.Popen[str]]) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.communicate(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()


def _lock_count(
    psql: str,
    db_url: str,
    barrier_object: int,
    granted: bool,
    run_token: str,
) -> int:
    predicate = "granted" if granted else "NOT granted"
    sql = f"""
SELECT count(*)
  FROM pg_catalog.pg_locks
 WHERE locktype = 'advisory'
   AND database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
   AND classid = {BARRIER_CLASS}::oid
   AND objid = {barrier_object}::oid
   AND objsubid = 2
   AND {predicate};
"""
    output = _run_psql(
        psql,
        db_url,
        sql,
        {},
        f"patina-skip-locked-probe-{run_token}",
    ).strip()
    return int(output)


def _wait_for_barrier_state(
    psql: str,
    db_url: str,
    barrier_object: int,
    granted: bool,
    process: subprocess.Popen[str],
    run_token: str,
) -> None:
    deadline = time.monotonic() + LOCK_WAIT_SECONDS
    while time.monotonic() < deadline:
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            raise RuntimeError(
                "barrier participant exited early: " + (stderr or stdout or "no output").strip()
            )
        if _lock_count(psql, db_url, barrier_object, granted, run_token) == 1:
            return
        time.sleep(0.05)
    state = "granted" if granted else "waiting"
    raise RuntimeError(f"timed out waiting for advisory barrier to be {state}")


def _release_barrier_holder(
    process: subprocess.Popen[str],
    *,
    commit: bool,
) -> None:
    """Release the holder through its own open psql session.

    Keeping stdin open lets the backend sit idle-in-transaction with the
    advisory xact lock. COMMIT/ROLLBACK then releases it cooperatively; killing
    a client during a server-side sleep can leave the backend locked until the
    sleep finishes.
    """

    if process.stdin is None:
        raise RuntimeError("barrier holder stdin is already closed")
    process.stdin.write("COMMIT;\n\\q\n" if commit else "ROLLBACK;\n\\q\n")
    process.stdin.flush()
    process.stdin.close()
    process.stdin = None
    _process_output(process, "barrier holder")


def _claim_line(output: str, session_name: str) -> Tuple[str, str]:
    rows = [line.strip() for line in output.splitlines() if "|" in line]
    if len(rows) != 1:
        raise AssertionError(f"{session_name} expected one claim row, got {rows!r}")
    task_id, locked_by = rows[0].split("|", 1)
    return task_id, locked_by


def _cleanup(
    psql: str,
    db_url: str,
    variables: Dict[str, str],
    run_token: str,
) -> None:
    sql = """
BEGIN;
SELECT set_config('app.actor', :'cleanup_actor', true);
CREATE TEMP TABLE owned_skip_locked_fixtures ON COMMIT DROP AS
SELECT id
  FROM public.agent_tasks
 WHERE idempotency_key IN (:'fixture_key_a', :'fixture_key_b', :'fixture_key_decoy');
DELETE FROM public.agent_tasks t
 USING owned_skip_locked_fixtures f
 WHERE t.id = f.id;
DELETE FROM public.agent_task_audit a
 USING owned_skip_locked_fixtures f
 WHERE a.task_id = f.id;
COMMIT;
"""
    _run_psql(
        psql,
        db_url,
        sql,
        variables,
        f"patina-skip-locked-cleanup-{run_token}",
    )


def run_proof(db_url: str, psql: str) -> Tuple[str, str]:
    run_uuid = uuid.uuid4()
    run_token = run_uuid.hex[:12]
    fixture_prefix = f"skip-locked-proof:{run_uuid}:"
    variables = {
        "fixture_key_a": fixture_prefix + "a",
        "fixture_key_b": fixture_prefix + "b",
        "fixture_key_decoy": fixture_prefix + "decoy",
        "proof_task_type": f"scan_pipeline.refine.proof.{run_uuid}",
        "decoy_task_type": f"scan_pipeline.refine.proof.decoy.{run_uuid}",
        "setup_actor": f"skip-locked-setup:{run_uuid}",
        "cleanup_actor": f"skip-locked-cleanup:{run_uuid}",
        "worker_a": f"skip-locked-worker-a:{run_uuid}",
        "worker_b": f"skip-locked-worker-b:{run_uuid}",
    }
    barrier_object = run_uuid.int % 2_000_000_000 + 1
    holder: Optional[subprocess.Popen[str]] = None
    session_a: Optional[subprocess.Popen[str]] = None
    setup_started = False
    primary_error: Optional[BaseException] = None

    try:
        preflight_sql = """
SELECT count(*)
  FROM public.agent_tasks
 WHERE idempotency_key IN (:'fixture_key_a', :'fixture_key_b', :'fixture_key_decoy');
"""
        preflight = _run_psql(
            psql,
            db_url,
            preflight_sql,
            variables,
            f"patina-skip-locked-preflight-{run_token}",
        ).strip()
        if preflight != "0":
            raise RuntimeError("unique fixture preflight unexpectedly found existing rows")

        setup_started = True
        setup_sql = """
BEGIN;
SELECT set_config('app.actor', :'setup_actor', true);
SELECT (public.enqueue_agent_task(
  p_task_type => :'proof_task_type',
  p_priority => 1,
  p_idempotency_key => :'fixture_key_a',
  p_actor => :'setup_actor'
)).id;
SELECT (public.enqueue_agent_task(
  p_task_type => :'proof_task_type',
  p_priority => 1,
  p_idempotency_key => :'fixture_key_b',
  p_actor => :'setup_actor'
)).id;
SELECT (public.enqueue_agent_task(
  p_task_type => :'decoy_task_type',
  p_priority => 1,
  p_idempotency_key => :'fixture_key_decoy',
  p_actor => :'setup_actor'
)).id;
UPDATE public.agent_tasks
   SET created_at = CASE idempotency_key
     WHEN :'fixture_key_a' THEN '1900-01-01T00:00:00Z'::timestamptz
     WHEN :'fixture_key_b' THEN '1900-01-02T00:00:00Z'::timestamptz
   END,
       run_after = now()
 WHERE idempotency_key IN (:'fixture_key_a', :'fixture_key_b');
COMMIT;
SELECT id::text || '|' || idempotency_key
  FROM public.agent_tasks
 WHERE idempotency_key IN (:'fixture_key_a', :'fixture_key_b')
 ORDER BY created_at;
"""
        setup_output = _run_psql(
            psql,
            db_url,
            setup_sql,
            variables,
            f"patina-skip-locked-setup-{run_token}",
        )
        fixture_rows = [line.strip().split("|", 1) for line in setup_output.splitlines() if "|" in line]
        if len(fixture_rows) != 2:
            raise AssertionError(f"expected two committed fixtures, got {fixture_rows!r}")
        fixture_a_id, fixture_b_id = fixture_rows[0][0], fixture_rows[1][0]

        holder_sql = f"""
BEGIN;
SELECT pg_advisory_xact_lock({BARRIER_CLASS}, {barrier_object});
"""
        holder = _start_psql(
            psql,
            db_url,
            holder_sql,
            {},
            f"patina-skip-locked-holder-{run_token}",
            close_stdin=False,
        )
        _wait_for_barrier_state(
            psql, db_url, barrier_object, True, holder, run_token
        )

        session_a_sql = f"""
BEGIN;
SELECT id::text || '|' || locked_by
  FROM public.claim_agent_tasks(
    ARRAY[:'proof_task_type'], 1, :'worker_a', '15 minutes');
SELECT pg_advisory_xact_lock({BARRIER_CLASS}, {barrier_object});
COMMIT;
"""
        session_a = _start_psql(
            psql,
            db_url,
            session_a_sql,
            variables,
            f"patina-skip-locked-a-{run_token}",
        )

        # Session A can wait here only after claim_agent_tasks returned inside
        # its still-open transaction, so the non-granted advisory lock proves
        # A reached the barrier while retaining its claimed row lock.
        _wait_for_barrier_state(
            psql, db_url, barrier_object, False, session_a, run_token
        )

        session_b_sql = """
BEGIN;
SELECT id::text || '|' || locked_by
  FROM public.claim_agent_tasks(
    ARRAY[:'proof_task_type'], 1, :'worker_b', '15 minutes');
COMMIT;
"""
        session_b_output = _run_psql(
            psql,
            db_url,
            session_b_sql,
            variables,
            f"patina-skip-locked-b-{run_token}",
        )
        claim_b_id, claim_b_worker = _claim_line(session_b_output, "session B")

        _release_barrier_holder(holder, commit=True)
        holder = None
        session_a_output = _process_output(session_a, "session A")
        session_a = None
        claim_a_id, claim_a_worker = _claim_line(session_a_output, "session A")

        if (claim_a_id, claim_b_id) != (fixture_a_id, fixture_b_id):
            raise AssertionError(
                "claims did not follow the two isolated fixture rows: "
                f"A={claim_a_id}, B={claim_b_id}, fixtures={fixture_a_id},{fixture_b_id}"
            )
        if claim_a_id == claim_b_id:
            raise AssertionError("SKIP LOCKED proof failed: both sessions claimed the same task")
        if claim_a_worker != variables["worker_a"]:
            raise AssertionError("session A row did not retain worker A's locked_by")
        if claim_b_worker != variables["worker_b"]:
            raise AssertionError("session B row did not retain worker B's locked_by")

        final_sql = """
SELECT id::text || '|' || locked_by || '|' || status
  FROM public.agent_tasks
 WHERE idempotency_key IN (:'fixture_key_a', :'fixture_key_b')
 ORDER BY created_at;
"""
        final_rows = [
            line.strip().split("|", 2)
            for line in _run_psql(
                psql,
                db_url,
                final_sql,
                variables,
                f"patina-skip-locked-assert-{run_token}",
            ).splitlines()
            if "|" in line
        ]
        expected_rows = [
            [fixture_a_id, variables["worker_a"], "running"],
            [fixture_b_id, variables["worker_b"], "running"],
        ]
        if final_rows != expected_rows:
            raise AssertionError(f"unexpected committed lease rows: {final_rows!r}")

        decoy_sql = """
SELECT status || '|' || coalesce(locked_by, '')
  FROM public.agent_tasks
 WHERE idempotency_key = :'fixture_key_decoy';
"""
        decoy_state = _run_psql(
            psql,
            db_url,
            decoy_sql,
            variables,
            f"patina-skip-locked-decoy-{run_token}",
        ).strip()
        if decoy_state != "queued|":
            raise AssertionError(
                "claim filter touched the differently typed owned fixture: "
                f"{decoy_state!r}"
            )

        audit_sql = """
SELECT t.idempotency_key || '|' || a.actor || '|' ||
       (a.new_row ->> 'locked_by') || '|' || count(*)::text
  FROM public.agent_task_audit a
  JOIN public.agent_tasks t ON t.id = a.task_id
 WHERE t.idempotency_key IN (:'fixture_key_a', :'fixture_key_b')
   AND a.op = 'UPDATE'
   AND a.old_row ->> 'status' = 'queued'
   AND a.new_row ->> 'status' = 'running'
 GROUP BY t.idempotency_key, a.actor, a.new_row ->> 'locked_by'
 ORDER BY t.idempotency_key;
"""
        audit_rows = [
            line.strip().split("|", 3)
            for line in _run_psql(
                psql,
                db_url,
                audit_sql,
                variables,
                f"patina-skip-locked-audit-{run_token}",
            ).splitlines()
            if "|" in line
        ]
        expected_audits = [
            [variables["fixture_key_a"], variables["worker_a"], variables["worker_a"], "1"],
            [variables["fixture_key_b"], variables["worker_b"], variables["worker_b"], "1"],
        ]
        if audit_rows != expected_audits:
            raise AssertionError(
                "each overlapping claim must leave exactly one independently "
                f"attributed queued->running audit: {audit_rows!r}"
            )
        decoy_audits_sql = """
SELECT count(*)
  FROM public.agent_task_audit a
  JOIN public.agent_tasks t ON t.id = a.task_id
 WHERE t.idempotency_key = :'fixture_key_decoy'
   AND a.op = 'UPDATE'
   AND a.old_row ->> 'status' = 'queued'
   AND a.new_row ->> 'status' = 'running';
"""
        decoy_audits = _run_psql(
            psql,
            db_url,
            decoy_audits_sql,
            variables,
            f"patina-skip-locked-decoy-audit-{run_token}",
        ).strip()
        if decoy_audits != "0":
            raise AssertionError(
                "claim filter left a queued->running audit for the decoy fixture"
            )
        return claim_a_id, claim_b_id
    except BaseException as exc:
        primary_error = exc
        raise
    finally:
        if holder is not None and holder.poll() is None:
            try:
                _release_barrier_holder(holder, commit=False)
                holder = None
            except BaseException as release_exc:
                if primary_error is None:
                    raise
                print(
                    f"WARNING: barrier-holder release also failed: {release_exc}",
                    file=sys.stderr,
                )
        _stop_process(holder)
        # Releasing the holder lets A finish normally. If A is still alive for
        # another reason, terminate only this runner's own psql process.
        if session_a is not None and session_a.poll() is None:
            try:
                session_a.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                _stop_process(session_a)
        if setup_started:
            try:
                _cleanup(psql, db_url, variables, run_token)
            except BaseException as cleanup_exc:
                if primary_error is None:
                    raise
                print(f"WARNING: fixture cleanup also failed: {cleanup_exc}", file=sys.stderr)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db-url",
        default=os.environ.get("LOCAL_DB_URL"),
        help="Local Supabase URL; must be localhost/127.0.0.1:54322 (or LOCAL_DB_URL)",
    )
    args = parser.parse_args(argv)
    try:
        parsed = validate_local_db_url(args.db_url)
    except ValueError as exc:
        parser.error(str(exc))

    psql = shutil.which("psql")
    if psql is None:
        parser.error("psql is required on PATH")

    claim_a, claim_b = run_proof(args.db_url, psql)
    print(
        "PASS: advisory barrier held session A's row lock; session B used "
        f"SKIP LOCKED (A={claim_a}, B={claim_b}, target={parsed.hostname}:{parsed.port})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
