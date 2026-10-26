"""Check 00878 ACLs with the native replay extractor; never regenerate the seed."""
import importlib.util
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("legacy_grants", ROOT / "scripts/generate-legacy-grants.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
FUNCTIONS = (
    "guard_fabrication_grant_overlap()",
    "guard_fabrication_authority_immutable()",
    "grant_fabrication_authority(uuid,date,text,date,integer,uuid[],text)",
    "revoke_fabrication_authority(uuid,text)",
    "party_holds_fabrication_authority(uuid,bigint,date)",
    "end_party_authority_at_seat_close()",
)


def check(path):
    sql = path.read_text()
    statements = [stmt for _, stmt in legacy.iter_top_level_acl_statements(legacy.clean(sql))]
    expected = [f"REVOKE ALL ON FUNCTION public.{f} FROM PUBLIC,anon,authenticated;" for f in FUNCTIONS]
    expected += [f"GRANT EXECUTE ON FUNCTION public.{f} TO service_role;" for f in FUNCTIONS[2:4]]
    normalize = lambda statement: re.sub(r"\s+", "", statement).lower()
    actual = {normalize(stmt) for stmt in statements}
    missing = [stmt for stmt in expected if normalize(stmt) not in actual]
    assert not missing, "native extractor loses ACLs: " + "; ".join(missing)
    assert actual == {normalize(stmt) for stmt in expected}, "unexpected replayed ACL changes"
    bodies = re.finditer(r"(?P<tag>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(?P<body>.*?)(?P=tag)", sql, re.DOTALL)
    for body in bodies:
        # Native HINT prose says "standing grant recorded". Match SQL privilege
        # syntax, including dynamic literal ACLs, rather than that prose word.
        assert not re.search(r"\b(?:GRANT|REVOKE)\s+(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE|USAGE|TRUNCATE|REFERENCES|TRIGGER|CREATE|CONNECT|TEMPORARY|TEMP|SET|ALTER|MAINTAIN)\b", legacy.clean(body["body"]), re.IGNORECASE), "ACL inside dollar body is not replayable"
    assert not re.search(r"party_holds_field_authority\s*\([^;]*'fabrication'", legacy.clean(sql), re.IGNORECASE), "fabrication cannot use legacy holder predicate"
    print("PASS: native extractor retains six function revokes and only two service-role lifecycle grants")
    print("PASS: no ACL hidden in dollar bodies; no legacy fabrication predicate")


if __name__ == "__main__":
    check(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "supabase/migrations/00878_round8_fabrication_authority.sql")
