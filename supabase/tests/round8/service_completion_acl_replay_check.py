"""Check 00888's ACLs with the native legacy-grants extractor and against the regenerated seed."""
import importlib.util
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("legacy_grants", ROOT / "scripts/generate-legacy-grants.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
MIGRATION = ROOT / "supabase/migrations/00888_round8_service_completion.sql"
SEED = ROOT / "supabase/seed/00-legacy-grants.sql"
TABLES = ("studio_service_completions", "service_acceptance_condition_resolutions")
FUNCTIONS = (
    "_guard_studio_service_completion()",
    "_guard_service_acceptance_condition_resolution()",
    "_service_obligation_key(uuid)",
    "_service_obligation_write_lock(uuid)",
    "_service_obligation_lock_row()",
    "_service_obligation_label(text)",
    "_service_obligation_items(uuid,uuid)",
    "_service_acceptance_open_conditions(uuid)",
    "_service_completion_financial_hold(uuid)",
    "_derive_studio_service_obligations(uuid)",
    "_can_complete_studio_service(uuid)",
    "_service_completion_receipt(uuid,boolean)",
    "_lock_service_completion_scope(uuid)",
    "_assert_service_completion_read_committed()",
    "complete_studio_service(uuid,uuid,text,text)",
    "resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text)",
    "revoke_studio_service_completion(uuid,text)",
    "derive_studio_service_obligations(uuid)",
    "get_studio_service_completion(uuid)",
)
READS = ("derive_studio_service_obligations(uuid)", "get_studio_service_completion(uuid)")


def normalize(statement):
    return re.sub(r"\s+", "", statement).lower()


def main():
    sql = MIGRATION.read_text()
    statements = [stmt for _, stmt in legacy.iter_top_level_acl_statements(legacy.clean(sql))]
    expected = [f"REVOKE ALL ON TABLE public.{t} FROM PUBLIC, anon, authenticated, service_role;" for t in TABLES]
    expected += [f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon, authenticated, service_role;" for fn in FUNCTIONS]
    expected += [f"GRANT EXECUTE ON FUNCTION public.{fn} TO authenticated;" for fn in READS]
    actual = [normalize(stmt) for stmt in statements]
    assert sorted(actual) == sorted(normalize(stmt) for stmt in expected), "native extractor loses or adds 00888 ACLs"
    print(f"PASS: native extractor yields exactly the {len(expected)} top-level 00888 ACL statements")
    bodies = re.finditer(r"(?P<tag>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(?P<body>.*?)(?P=tag)", sql, re.DOTALL)
    for body in bodies:
        assert not re.search(
            r"\b(?:GRANT|REVOKE)\s+(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE|USAGE|TRUNCATE|REFERENCES|TRIGGER|CREATE|CONNECT|TEMPORARY|TEMP|SET|ALTER|MAINTAIN)\b",
            legacy.clean(body["body"]), re.IGNORECASE,
        ), "ACL hidden inside a dollar body is not replayable"
    print("PASS: no 00888 ACL hidden inside a dollar body")
    seed = SEED.read_text().split(f"-- {MIGRATION.name}\n")[1:]
    seeded = [normalize(block.split("DO $g$ BEGIN", 1)[1].split("EXCEPTION WHEN", 1)[0]) for block in seed]
    assert seeded == actual, "regenerated legacy-grants seed does not replay 00888's ACLs in migration order"
    print(f"PASS: the regenerated seed replays all {len(seeded)} 00888 ACL statements in order")
    assert not any(normalize(stmt).startswith("grant") and "anon" in normalize(stmt) for stmt in statements), "anon grant"
    print("PASS: no 00888 statement grants anon")


if __name__ == "__main__":
    main()
