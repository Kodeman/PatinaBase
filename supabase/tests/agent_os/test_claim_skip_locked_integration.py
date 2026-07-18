"""Static safety tests for the two-session SKIP LOCKED integration runner."""

from __future__ import annotations

import subprocess
import unittest
from unittest.mock import patch

from claim_skip_locked_integration import _start_psql, validate_local_db_url


class _CaptureStdin:
    def __init__(self) -> None:
        self.text = ""
        self.closed = False

    def write(self, value: str) -> None:
        self.text += value

    def close(self) -> None:
        self.closed = True

    def flush(self) -> None:
        pass


class _FakeProcess:
    def __init__(self) -> None:
        self.stdin = _CaptureStdin()


class LocalDatabaseUrlTests(unittest.TestCase):
    def test_accepts_only_the_two_local_host_spellings_on_supabase_port(self) -> None:
        for host in ("localhost", "127.0.0.1"):
            url = f"postgresql://postgres:postgres@{host}:54322/postgres"
            self.assertEqual(validate_local_db_url(url).hostname, host)

    def test_rejects_remote_host(self) -> None:
        with self.assertRaisesRegex(ValueError, "local Supabase"):
            validate_local_db_url(
                "postgresql://postgres:secret@db.bkvcixdmuyejfzcijpdg.supabase.co:5432/postgres"
            )

    def test_rejects_wrong_or_implicit_port(self) -> None:
        for url in (
            "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
            "postgresql://postgres:postgres@localhost/postgres",
        ):
            with self.assertRaisesRegex(ValueError, "port 54322"):
                validate_local_db_url(url)

    def test_rejects_libpq_query_target_override(self) -> None:
        with self.assertRaisesRegex(ValueError, "override its local target"):
            validate_local_db_url(
                "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
                "?hostaddr=192.0.2.10"
            )


class SessionLaunchTests(unittest.TestCase):
    def test_session_sql_is_sent_on_stdin_so_psql_expands_variables(self) -> None:
        process = _FakeProcess()
        capture = process.stdin
        sql = "SELECT :'worker_a';"

        with patch(
            "claim_skip_locked_integration.subprocess.Popen",
            return_value=process,
        ) as popen:
            returned = _start_psql(
                "psql",
                "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
                sql,
                {"worker_a": "worker-a"},
                "session-a",
            )

        self.assertIs(returned, process)
        command = popen.call_args.args[0]
        self.assertNotIn("-c", command)
        self.assertEqual(popen.call_args.kwargs["stdin"], subprocess.PIPE)
        self.assertEqual(process.stdin, None)
        self.assertTrue(capture.closed)
        self.assertEqual(capture.text, sql)

    def test_barrier_holder_keeps_stdin_open_for_cooperative_release(self) -> None:
        process = _FakeProcess()
        capture = process.stdin

        with patch(
            "claim_skip_locked_integration.subprocess.Popen",
            return_value=process,
        ):
            returned = _start_psql(
                "psql",
                "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
                "BEGIN; SELECT pg_advisory_xact_lock(1, 2);",
                {},
                "holder",
                close_stdin=False,
            )

        self.assertIs(returned, process)
        self.assertIs(process.stdin, capture)
        self.assertFalse(capture.closed)


if __name__ == "__main__":
    unittest.main()
