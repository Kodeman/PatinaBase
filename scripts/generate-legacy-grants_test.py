#!/usr/bin/env python3
"""Focused regression tests for the legacy-grant statement extractor."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("generate-legacy-grants.py")
SPEC = importlib.util.spec_from_file_location("generate_legacy_grants", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
GENERATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GENERATOR)


class TopLevelAclStatementTest(unittest.TestCase):
    def test_default_privilege_subcommands_are_not_split(self) -> None:
        fixture = """
BEGIN;

GRANT SELECT ON TABLE public.reviewed_object TO authenticated;

-- Exact multiline form from 00438_ffe_release_security_hardening.sql.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLES FROM authenticated;

REVOKE UPDATE ON TABLE public.reviewed_object FROM authenticated;

-- Exact multiline form from 00483_public_acl_allowlist.sql.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
"""

        statements = [
            statement
            for _, statement in GENERATOR.iter_top_level_acl_statements(
                GENERATOR.clean(fixture)
            )
        ]

        self.assertEqual(
            statements,
            [
                "GRANT SELECT ON TABLE public.reviewed_object TO authenticated;",
                "REVOKE UPDATE ON TABLE public.reviewed_object FROM authenticated;",
            ],
        )

    def test_file_initial_acl_statement_is_replayed(self) -> None:
        fixture = "REVOKE EXECUTE ON FUNCTION public.f() FROM PUBLIC;\n"

        statements = [
            statement
            for _, statement in GENERATOR.iter_top_level_acl_statements(
                GENERATOR.clean(fixture)
            )
        ]

        self.assertEqual(
            statements,
            ["REVOKE EXECUTE ON FUNCTION public.f() FROM PUBLIC;"],
        )


if __name__ == "__main__":
    unittest.main()
