"""Check 00884 and 00887 with the native legacy-grants extractor, without editing seed ACLs."""
import importlib.util
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("legacy_grants", ROOT / "scripts/generate-legacy-grants.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
FUNCTIONS = ("get_project_external_fulfilments(uuid)",)


def check(path):
    sql = path.read_text()
    statements = [stmt for _, stmt in legacy.iter_top_level_acl_statements(legacy.clean(sql))]
    expected = [f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC,anon,authenticated,service_role;" for fn in FUNCTIONS]
    expected.append("GRANT EXECUTE ON FUNCTION public.get_project_external_fulfilments(uuid) TO authenticated;")
    normalize = lambda statement: re.sub(r"\s+", "", statement).lower()
    actual = {normalize(stmt) for stmt in statements}
    assert actual == {normalize(stmt) for stmt in expected}, "native extractor loses or adds reader ACLs"
    bodies = re.finditer(r"(?P<tag>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(?P<body>.*?)(?P=tag)", sql, re.DOTALL)
    for body in bodies:
        assert not re.search(
            r"\b(?:GRANT|REVOKE)\s+(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE|USAGE|TRUNCATE|REFERENCES|TRIGGER|CREATE|CONNECT|TEMPORARY|TEMP|SET|ALTER|MAINTAIN)\b",
            legacy.clean(body["body"]), re.IGNORECASE,
        ), "ACL hidden inside a dollar body is not replayable"
    print("PASS: native extractor retains reader revoke and only the native authenticated reader grant")
    print("PASS: no reader ACL hidden inside dollar bodies; no generated seed edit")


if __name__ == "__main__":
    # 00887 redefines the 00884 reader with the identical ACL pair; check both by default.
    paths = [Path(arg) for arg in sys.argv[1:]] or [
        ROOT / "supabase/migrations/00884_round8_external_package_reading.sql",
        ROOT / "supabase/migrations/00887_round8_external_reading_grant_binding.sql",
    ]
    for path in paths:
        print(f"-- {path.name}")
        check(path)
