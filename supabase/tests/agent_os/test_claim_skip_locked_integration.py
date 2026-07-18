"""Static safety tests for the two-session SKIP LOCKED integration runner."""

from __future__ import annotations

import unittest

from claim_skip_locked_integration import validate_local_db_url


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


if __name__ == "__main__":
    unittest.main()
