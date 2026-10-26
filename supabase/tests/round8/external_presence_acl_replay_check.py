"""Check 00876 ACLs through the native seed extractor without rewriting the seed.

The exact manifest grows with each safety RPC and private receipt table.
"""
import importlib.util
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("legacy_grants", ROOT / "scripts/generate-legacy-grants.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)


def check(path):
    sql = path.read_text()
    actual = {re.sub(r"\s+", "", stmt).lower()
              for _, stmt in legacy.iter_top_level_acl_statements(legacy.clean(sql))}
    expected = {re.sub(r"\s+", "", stmt).lower() for stmt in (
        "REVOKE ALL ON FUNCTION public._ffe_bump_item_row_version() FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON TABLE public.project_ffe_scope_assignment_receipts FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON FUNCTION public._ffe_guard_scope_binding() FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON FUNCTION public._ffe_scope_assignment_receipt_guard() FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON FUNCTION public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text) FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON FUNCTION public._ffe_external_pricing_snapshot(public.project_ffe_items) FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON TABLE public.project_ffe_external_conversion_receipts FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON FUNCTION public._ffe_external_conversion_receipt_guard() FROM PUBLIC,anon,authenticated,service_role;",
        "REVOKE ALL ON FUNCTION public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;",
    )}
    assert actual == expected, "native extractor loses or adds an ACL: " + repr(actual ^ expected)
    bodies = re.finditer(r"(?P<tag>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(?P<body>.*?)(?P=tag)", sql, re.DOTALL)
    for body in bodies:
        assert not re.search(r"\b(?:GRANT|REVOKE)\b", legacy.clean(body["body"]), re.IGNORECASE), (
            "ACL inside dollar-quoted body is not replayable"
        )
    print("PASS: native extractor preserves the exact inactive safety ACL manifest")
    print("PASS: no GRANT/REVOKE in dollar-quoted bodies")


if __name__ == "__main__":
    check(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "supabase/migrations/00876_round8_external_presence_parity.sql")
