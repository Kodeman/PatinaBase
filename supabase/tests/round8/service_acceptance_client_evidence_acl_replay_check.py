"""Check 00889's ACLs with the native legacy-grants extractor and against the regenerated seed."""
import importlib.util
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("legacy_grants", ROOT / "scripts/generate-legacy-grants.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
MIGRATION = ROOT / "supabase/migrations/00889_round8_service_acceptance_client_evidence.sql"
SEED = ROOT / "supabase/seed/00-legacy-grants.sql"
FUNCTIONS = (
    "_is_service_acceptance_client_reader(uuid)",
    "_service_acceptance_evidence_documents(uuid)",
    "_service_acceptance_scalars(jsonb,text[])",
    "_service_acceptance_client_member(uuid,jsonb)",
    "_service_acceptance_object_projects(text[])",
    "_can_read_service_acceptance_evidence_object(text)",
    "_guard_service_acceptance_evidence_object()",
    "get_my_service_acceptance_evidence(uuid)",
)
AUTHENTICATED = ("_can_read_service_acceptance_evidence_object(text)", "get_my_service_acceptance_evidence(uuid)")


def normalize(statement):
    return re.sub(r"\s+", "", statement).lower()


def main():
    sql = MIGRATION.read_text()
    statements = [stmt for _, stmt in legacy.iter_top_level_acl_statements(legacy.clean(sql))]
    expected = [f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon, authenticated, service_role;" for fn in FUNCTIONS]
    expected += [f"GRANT EXECUTE ON FUNCTION public.{fn} TO authenticated;" for fn in AUTHENTICATED]
    actual = [normalize(stmt) for stmt in statements]
    assert sorted(actual) == sorted(normalize(stmt) for stmt in expected), "native extractor loses or adds 00889 ACLs"
    print(f"PASS: native extractor yields exactly the {len(expected)} top-level 00889 ACL statements")
    for fn in AUTHENTICATED:
        revoke = actual.index(normalize(f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon, authenticated, service_role;"))
        grant = actual.index(normalize(f"GRANT EXECUTE ON FUNCTION public.{fn} TO authenticated;"))
        assert revoke < grant, f"{fn} is granted before its revoke"
    print("PASS: each authenticated grant follows its own revoke")
    bodies = re.finditer(r"(?P<tag>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(?P<body>.*?)(?P=tag)", sql, re.DOTALL)
    for body in bodies:
        assert not re.search(
            r"\b(?:GRANT|REVOKE)\s+(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE|USAGE|TRUNCATE|REFERENCES|TRIGGER|CREATE|CONNECT|TEMPORARY|TEMP|SET|ALTER|MAINTAIN)\b",
            legacy.clean(body["body"]), re.IGNORECASE,
        ), "ACL hidden inside a dollar body is not replayable"
    print("PASS: no 00889 ACL hidden inside a dollar body")
    seed = SEED.read_text().split(f"-- {MIGRATION.name}\n")[1:]
    seeded = [normalize(block.split("DO $g$ BEGIN", 1)[1].split("EXCEPTION WHEN", 1)[0]) for block in seed]
    assert seeded == actual, "regenerated legacy-grants seed does not replay 00889's ACLs in migration order"
    print(f"PASS: the regenerated seed replays all {len(seeded)} 00889 ACL statements in order")
    assert not any(normalize(stmt).startswith("grant") and "anon" in normalize(stmt) for stmt in statements), "anon grant"
    print("PASS: no 00889 statement grants anon")


if __name__ == "__main__":
    main()
