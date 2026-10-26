"""Check 00877 ACLs through the native legacy-grants parser; never write the seed."""
import importlib.util
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("legacy_grants", ROOT / "scripts/generate-legacy-grants.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)

TABLES = ('evidence_manifests', 'evidence_manifest_requests')
FUNCTIONS = ('_subject_project_id(text,uuid)', '_guard_margin_note_subject()', 'escalate_margin_note(uuid,uuid)', '_evidence_manifest_member(uuid,jsonb)', 'create_evidence_manifest(uuid,uuid,text,jsonb,text)')


def check(path):
    sql = path.read_text()
    statements = [stmt for _, stmt in legacy.iter_top_level_acl_statements(legacy.clean(sql))]
    # These exact statements retain all four roles, including service_role's
    # blanket seed grants. The sole regrant is the authorized read RPC.
    expected = [
        f"REVOKE ALL ON {kind} public.{target} FROM PUBLIC,anon,authenticated,service_role;"
        for kind, targets in (("TABLE", TABLES), ("FUNCTION", FUNCTIONS))
        for target in targets
    ] + ["GRANT SELECT ON TABLE public.evidence_manifests TO authenticated;", "GRANT SELECT ON TABLE public.evidence_manifest_requests TO authenticated;", "GRANT EXECUTE ON FUNCTION public.create_evidence_manifest(uuid,uuid,text,jsonb,text) TO service_role;"]
    normalize = lambda statement: re.sub(r"\s+", "", statement).lower()
    actual = {normalize(stmt) for stmt in statements}
    missing = [stmt for stmt in expected if normalize(stmt) not in actual]
    assert not missing, "native extractor loses ACLs: " + "; ".join(missing)
    assert actual == {normalize(stmt) for stmt in expected}, "unexpected replayed ACL changes"

    # Inspect dollar bodies separately: the native cleaner intentionally removes
    # them, so extractor completeness alone cannot detect hidden extra ACLs.
    bodies = re.finditer(r"(?P<tag>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(?P<body>.*?)(?P=tag)", sql, re.DOTALL)
    for body in bodies:
        assert not re.search(r"\b(?:GRANT|REVOKE)\b", legacy.clean(body["body"]), re.IGNORECASE), (
            "ACL inside dollar-quoted body is not replayable"
        )
    print(f"PASS: native extractor preserves {len(TABLES)} table and {len(FUNCTIONS)} function revokes; only authorized reads and service mint regranted")
    print("PASS: no GRANT/REVOKE in dollar-quoted bodies")


if __name__ == "__main__":
    check(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "supabase/migrations/00877_round8_evidence_manifests.sql")
