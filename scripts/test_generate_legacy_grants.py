#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("generate-legacy-grants.py")
SPEC = importlib.util.spec_from_file_location("generate_legacy_grants", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
GENERATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GENERATOR)


class LegacyGrantGeneratorTest(unittest.TestCase):
    def test_default_privilege_clause_is_preserved_whole(self) -> None:
        raw = """
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres
          REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
        GRANT USAGE ON SCHEMA edge_api TO edge_catalog_reader;
        """

        cleaned = GENERATOR.clean(raw)

        self.assertIn("ALTER DEFAULT PRIVILEGES", cleaned)
        self.assertIn("REVOKE EXECUTE ON FUNCTIONS", cleaned)
        self.assertIn("GRANT USAGE ON SCHEMA edge_api", cleaned)

    def test_migration_extract_has_full_default_privilege_not_suffix(self) -> None:
        statements = [statement for _, statement in GENERATOR.extract_statements()]

        self.assertIn(
            "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLES FROM authenticated;",
            statements,
        )
        self.assertIn(
            "ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;",
            statements,
        )
        self.assertIn(
            "REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC, edge_catalog_reader, edge_rls_user;",
            statements,
        )
        self.assertNotIn(
            "REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLES FROM authenticated;",
            statements,
        )


if __name__ == "__main__":
    unittest.main()
