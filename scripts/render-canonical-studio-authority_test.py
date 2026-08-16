#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from collections import Counter
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("render-canonical-studio-authority.py")
SPEC = importlib.util.spec_from_file_location("canonical_renderer", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


class SqlLexerTest(unittest.TestCase):
    def test_only_real_calls_are_attributed(self) -> None:
        source = '''CREATE FUNCTION public.probe() RETURNS boolean
LANGUAGE plpgsql AS $body$
BEGIN
  -- public.is_studio_comember(comment_owner)
  PERFORM 'public.is_studio_comember(string_owner)';
  /* nested /* is_studio_comember(block_owner) */ comment */
  RETURN "public"."is_studio_comember"(coalesce(real_owner, fallback_owner));
END;
$body$;'''
        calls = renderer.find_calls(source, "is_studio_comember")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][2], "coalesce(real_owner, fallback_owner)")

    def test_dynamic_sql_is_not_rewritten_and_is_rejected(self) -> None:
        for literal in (
            "'select public.is_studio_comember(owner_id)'",
            "$sql$select public.is_studio_comember(owner_id)$sql$",
        ):
            source = f'''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  EXECUTE {literal};
END;
$body$;'''
            self.assertEqual(renderer.find_calls(source, "is_studio_comember"), [])
            self.assertTrue(renderer.dynamic_forbidden_call(source, "is_studio_comember"))

    def test_dynamic_scanner_handles_standard_and_escape_strings(self) -> None:
        standard_then_execute = r'''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM 'ends-with-backslash\'; EXECUTE dynamic_sql;
END;
$body$;'''
        self.assertTrue(renderer.has_real_dynamic_execute(standard_then_execute))
        for helper in ("is_studio_comember", "leads", "unrelated_token"):
            self.assertTrue(
                renderer.dynamic_forbidden_call(standard_then_execute, helper)
            )

        only_data = r'''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM E'escaped quote\' EXECUTE still_data';
  PERFORM 'EXECUTE data';
  PERFORM $sql$EXECUTE more_data$sql$;
  PERFORM "EXECUTE";
  -- EXECUTE comment_data;
END;
$body$;'''
        self.assertFalse(renderer.has_real_dynamic_execute(only_data))
        self.assertFalse(
            renderer.dynamic_forbidden_call(only_data, "is_studio_comember")
        )

        adjacent_quoted_identifier = '''CREATE FUNCTION public.probe()
RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  EXECUTE"sql";
END;
$body$;'''
        self.assertTrue(
            renderer.has_real_dynamic_execute(adjacent_quoted_identifier)
        )

    def test_dynamic_allowlist_is_exact_and_unknown_execute_fails_closed(self) -> None:
        profiles = renderer.load_routine_profiles()
        row = profiles["public.increment_campaign_counter(uuid,text)"]
        fragment = renderer.extract_profile_function(row)["fragment"]
        self.assertTrue(renderer.has_real_dynamic_execute(fragment))
        self.assertFalse(
            renderer.dynamic_forbidden_call(fragment, "is_studio_comember")
        )
        changed = fragment.replace("campaigns", "campaigns_changed", 1)
        self.assertTrue(renderer.has_real_dynamic_execute(changed))
        self.assertTrue(
            renderer.dynamic_forbidden_call(changed, "is_studio_comember")
        )

    def test_unterminated_nested_literals_fail_closed(self) -> None:
        unterminated_dollar = '''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM $sql$unterminated;
END;
$body$;'''
        with self.assertRaisesRegex(renderer.RenderError, "dollar literal"):
            renderer.find_calls(unterminated_dollar, "is_studio_comember")

        unterminated_identifier = '''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM "unterminated;
END;
$body$;'''
        with self.assertRaisesRegex(renderer.RenderError, "quoted identifier"):
            renderer.find_calls(unterminated_identifier, "is_studio_comember")

    def test_unicode_dollar_tags_and_identifier_boundaries_match_postgres(self) -> None:
        unicode_tag = '''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM $é$/*$é$; EXECUTE dynamic_sql; PERFORM $é$*/$é$;
END;
$body$;'''
        self.assertTrue(renderer.has_real_dynamic_execute(unicode_tag))

        high_bit_tag = '''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM $☃$/*$☃$; EXECUTE dynamic_sql; PERFORM $☃$*/$☃$;
END;
$body$;'''
        self.assertTrue(renderer.has_real_dynamic_execute(high_bit_tag))

        embedded_tag = '''CREATE FUNCTION public.probe() RETURNS void
LANGUAGE plpgsql AS $body$
BEGIN
  PERFORM 1 AS foo$tag$; EXECUTE 'SELECT 1'; PERFORM 1 AS bar$tag$;
END;
$body$;'''
        self.assertTrue(renderer.has_real_dynamic_execute(embedded_tag))

    def test_unicode_escaped_identifier_and_atomic_body_fail_closed(self) -> None:
        encoded_helper = r'''CREATE FUNCTION public.probe() RETURNS boolean
LANGUAGE plpgsql AS $body$
BEGIN
  RETURN public.U&"is_studio_comem\0062er"(owner_id);
END;
$body$;'''
        with self.assertRaisesRegex(renderer.RenderError, "Unicode-escaped"):
            renderer.find_calls(encoded_helper, "is_studio_comember")

        atomic = '''CREATE FUNCTION public.probe() RETURNS boolean
LANGUAGE sql BEGIN ATOMIC
  SELECT public.is_studio_comember(owner_id);
END;'''
        with self.assertRaisesRegex(renderer.RenderError, "body delimiter"):
            renderer.find_calls(atomic, "is_studio_comember")

    def test_typescript_writer_mask_rejects_fake_static_calls(self) -> None:
        source = '''
// client.from('leads').insert({ studio_id: forged })
const quoted = "client.from('leads').insert({ studio_id: forged })";
const templated = `client.from('leads').insert({ studio_id: forged })`;
await client.from('leads').insert({ studio_id: selectedStudioId });
await client.from(tableName).insert(payload);
'''
        masked = renderer.typescript_writer_mask(source)
        self.assertEqual(masked.count("'leads'"), 1)
        self.assertEqual(masked.count(".insert"), 2)
        self.assertIn("studio_id: selectedStudioId", masked)
        self.assertIn("from(tableName)", masked)

    def test_typescript_rpc_parser_pins_only_top_level_named_arguments(self) -> None:
        source = '''
// client.rpc('claim_design_request', { p_lead_id: fake, p_studio_id: fake })
const quoted = "client.rpc('claim_design_request', { p_lead_id: fake })";
await client.rpc('claim_design_request', {
  p_lead_id: leadId,
  p_studio_id: choose({ nested_key: ignored }),
});
'''
        masked = renderer.typescript_writer_mask(source, ("claim_design_request",))
        pattern = renderer.re.compile(
            r"\.\s*rpc\s*\(\s*(['\"])(?P<name>claim_design_request)\1\s*,\s*\{",
            renderer.re.S,
        )
        matches = list(pattern.finditer(masked))
        self.assertEqual(len(matches), 1)
        _, object_mask, _ = renderer.balanced_typescript_object(
            source, masked, matches[0].end() - 1
        )
        self.assertEqual(
            renderer.top_level_typescript_object_keys(object_mask),
            ("p_lead_id", "p_studio_id"),
        )


class LedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = renderer.load_review()
        cls.outputs = renderer.render_outputs(cls.document)

    def test_exact_reviewed_counts_and_portability(self) -> None:
        contract = json.loads(self.outputs[renderer.CONTRACT])
        self.assertEqual(len(contract["record_ids"]), 378)
        self.assertEqual(len(set(contract["record_ids"])), 378)
        self.assertEqual(len(contract["routines"]), 166)
        self.assertEqual(len(contract["policies"]), 193)
        self.assertEqual(len(contract["row_level_security_relations"]), 116)
        self.assertTrue(
            all(
                row["row_security_enabled"]
                and not row["force_row_security"]
                for row in contract["row_level_security_relations"]
            )
        )
        self.assertEqual(len(contract["runtime_writer_universe"]), 9)
        self.assertEqual(len(contract["runtime_rpc_caller_universe"]), 12)
        self.assertEqual(
            len(contract["generated_database_type_contract"]["snapshot_tables"]), 6
        )
        self.assertEqual(
            len(contract["generated_database_type_contract"]["rpc_types"]), 13
        )
        composite_returns = contract["generated_database_type_contract"][
            "composite_return_shapes"
        ]
        self.assertEqual(
            Counter(row["target"] for row in composite_returns),
            Counter({"proposals": 7, "client_decisions": 15}),
        )
        self.assertTrue(all(row["studio_id_type"] == "string | null" for row in composite_returns))
        self.assertEqual(
            contract["generated_database_type_contract"]["retired_rpc_types_absent"],
            ["_can_manage_invoice_owner"],
        )
        self.assertEqual(len(contract["runtime_workspace_contract"]), 5)
        self.assertEqual(len(contract["configured_seed_writer_universe"]), 15)
        self.assertEqual(len(contract["sql_regression_contract"]), 2)
        self.assertEqual(len(contract["reviewed_dynamic_routines"]), 5)
        self.assertEqual(
            sum(row["source_dynamic"] for row in contract["reviewed_dynamic_routines"]),
            5,
        )
        self.assertEqual(
            sum(row["final_dynamic"] for row in contract["reviewed_dynamic_routines"]),
            4,
        )
        self.assertEqual(
            [
                row["canonical_regprocedure"]
                for row in contract["dynamic_routine_dispositions"]
            ],
            [renderer.DYNAMIC_INVOICE_CORE],
        )
        self.assertEqual(
            contract["reviewed_sql_standard_body_universe"],
            {
                "schemas": ["public", "app_private"],
                "expected_count": 0,
                "disposition": "fail_closed_before_prosrc_lexical_contract",
            },
        )
        self.assertEqual(
            sum(row["disposition"] == "platform_admin_handoff" for row in contract["policies"]),
            9,
        )
        for payload in self.outputs.values():
            self.assertNotIn(b"/Users/", payload)

    def test_policy_fingerprints_use_pinned_catalog_deparses(self) -> None:
        contract = json.loads(self.outputs[renderer.CONTRACT])
        self.assertEqual(
            [row["reviewed_rows_used"] for row in contract["policy_catalog_sources"]],
            [169, 9, 15],
        )
        policies = {
            (row["relation"], row["policy"]): row
            for row in contract["policies"]
        }
        proposal_select = policies[
            ("public.proposals", "proposals_design_studio_select")
        ]
        self.assertEqual(
            proposal_select["final_catalog_qual"],
            "_can_read_studio_snapshot(studio_id, designer_id)",
        )
        self.assertEqual(
            proposal_select["final_catalog_fingerprint"],
            "a5829bd9d4385b8ed3f1a596e89c98ccd3ccef4e6e51e6eb3260aba3abbf3ab3",
        )
        migration = self.outputs[renderer.MIGRATION].decode()
        self.assertNotIn("pg_catalog.chr(0)", migration)
        self.assertIn("pg_catalog.decode('00', 'hex')", migration)
        self.assertIn("pg_temp._00488_catalog_policy_fingerprint", migration)
        self.assertEqual(contract["policy_fingerprint_contract"]["server_major"], 17)
        self.assertEqual(
            contract["policy_fingerprint_contract"]["pg_get_expr_arguments"], 2
        )

    def test_restrictive_mutation_guards_close_owner_policy_or_legs(self) -> None:
        contract = json.loads(self.outputs[renderer.CONTRACT])
        guards = contract["canonical_mutation_guards"]
        self.assertEqual(len(guards), 14)
        self.assertEqual(
            {(row["relation"], row["operation"]) for row in guards},
            {
                (f"public.{table_name}", operation)
                for table_name in (
                    "proposals", "designer_clients", "leads",
                    "client_decisions", "saved_vendors", "phase_templates",
                    "projects",
                )
                for operation in ("UPDATE", "DELETE")
            },
        )
        self.assertTrue(all(not row["permissive"] for row in guards))
        migration = self.outputs[renderer.MIGRATION].decode()
        for row in guards:
            self.assertIn(
                f'DROP POLICY IF EXISTS "{row["policy"]}" ON {row["relation"]};',
                migration,
            )

    def test_policy_fingerprint_preserves_literals_quotes_and_nulls(self) -> None:
        base = {"qual": "(label = 'A B')", "with_check": None}
        for changed in (
            {"qual": "(label = 'ab')", "with_check": None},
            {"qual": "(\"Label\" = 'A B')", "with_check": None},
            {"qual": "(label = 'A B')", "with_check": "<null>"},
        ):
            self.assertNotEqual(
                renderer.policy_fingerprint(base),
                renderer.policy_fingerprint(changed),
            )
        self.assertIn(
            "patina-csa-policy-v1",
            self.outputs[renderer.MIGRATION].decode(),
        )

    def test_policy_projection_only_unqualifies_real_helper_calls(self) -> None:
        expression = (
            "(public._can_read_studio_snapshot(studio_id, designer_id) "
            "AND note = 'public._can_read_studio_snapshot' "
            "AND \"public._can_read_studio_snapshot\" IS NOT NULL)"
        )
        projected = renderer.unqualify_public_helper_calls(
            expression, "_can_read_studio_snapshot"
        )
        self.assertIn(
            "_can_read_studio_snapshot(studio_id, designer_id)", projected
        )
        self.assertNotIn(
            "public._can_read_studio_snapshot(studio_id, designer_id)",
            projected,
        )
        self.assertIn("'public._can_read_studio_snapshot'", projected)
        self.assertIn('"public._can_read_studio_snapshot"', projected)

    def test_policy_clause_parser_masks_literals_comments_and_dollar_text(self) -> None:
        statement = (
            "CREATE POLICY p ON public.t USING ("
            "note = $snow$) fake ($snow$ AND label = '(()''x' "
            "/* ) */ AND public._can_read_studio_snapshot(studio_id, owner_id)"
            ") WITH CHECK (true);"
        )
        clause = renderer.policy_clause(statement, "USING")
        self.assertIsNotNone(clause)
        self.assertIn("$snow$) fake ($snow$", clause)
        self.assertTrue(clause.endswith(")"))

    def test_focused_two_phase_rollback_outputs_are_hash_pinned(self) -> None:
        self.assertEqual(
            set(self.outputs),
            {
                renderer.MIGRATION,
                renderer.ROLLBACK_SQL,
                renderer.CONTRACT,
                renderer.STORAGE_SQL,
                renderer.STORAGE_ROLLBACK_SQL,
                renderer.STORAGE_MANIFEST,
            },
        )
        contract = json.loads(self.outputs[renderer.CONTRACT])
        self.assertEqual(
            contract["rollback_contract"],
            {
                "execution_order": [
                    "supabase/platform-admin/00488_canonical_studio_storage_policies.rollback.sql",
                    "supabase/acl/00488_canonical_studio_authority_rollback.sql",
                ],
                "ordinary_source_routine_count": 129,
                "ordinary_source_policy_count": 136,
                "final_only_delete_guard_count": 36,
                "final_only_mutation_guard_count": 14,
                "storage_source_policy_count": 9,
                "final_only_surface_count": 11,
                "requires_zero_non_null_snapshots": True,
                "collapsed_source_keys": [
                    "public.designer_clients(designer_id,client_id) WHERE client_id IS NOT NULL AND status <> 'lead'",
                    "public.designer_clients(designer_id,client_email) WHERE client_email IS NOT NULL AND client_id IS NULL",
                    "public.saved_vendors(designer_id,vendor_id)",
                ],
            },
        )
        relative_outputs = {
            path.relative_to(renderer.ROOT).as_posix(): payload
            for path, payload in self.outputs.items()
        }
        for artifact in contract["generated_outputs"].values():
            self.assertIn(artifact["path"], relative_outputs)
            self.assertEqual(
                artifact["sha256"],
                renderer.digest(relative_outputs[artifact["path"]]),
            )
        storage_manifest = json.loads(self.outputs[renderer.STORAGE_MANIFEST])
        self.assertEqual(
            storage_manifest["rollback_artifact"],
            contract["generated_outputs"]["storage_rollback"],
        )
        self.assertEqual(
            {
                row["canonical_regprocedure"]: row["body_sha256"]
                for row in storage_manifest["reviewed_final_dynamic_routines"]
            },
            renderer.PERSISTENT_DYNAMIC_ROUTINES,
        )
        self.assertEqual(
            storage_manifest["reviewed_sql_standard_body_universe"],
            contract["reviewed_sql_standard_body_universe"],
        )

    def test_forward_final_snapshot_mismatch_gate_precedes_mutation(self) -> None:
        migration = self.outputs[renderer.MIGRATION].decode()
        first_mutation = migration.index("ALTER TABLE public.proposals ADD COLUMN")
        self.assertLess(
            migration.index("$c00488_proposal_snapshot_preflight$"),
            first_mutation,
        )
        for message in (
            "proposal project/relationship studio mismatch",
            "decision project/relationship studio mismatch",
            "relationship/lead studio mismatch",
            "phase-template studio snapshot is invalid",
        ):
            self.assertIn(message, migration[:first_mutation])

    def test_dynamic_invoice_core_is_static_final_and_exactly_rollbackable(self) -> None:
        migration = self.outputs[renderer.MIGRATION].decode()
        final_start = migration.index(
            "CREATE OR REPLACE FUNCTION public._void_invoice_authorized_legacy_00397"
        )
        final_end = migration.index(
            "ALTER FUNCTION public._void_invoice_authorized_legacy_00397",
            final_start,
        )
        final_core = migration[final_start:final_end]
        self.assertNotIn("is_studio_comember", final_core)
        self.assertNotRegex(final_core, r"(?i)\bEXECUTE\b")
        self.assertIn("UPDATE public.project_time_entries", final_core)

        rollback = self.outputs[renderer.ROLLBACK_SQL].decode()
        source_start = rollback.index(
            "CREATE OR REPLACE FUNCTION public._void_invoice_authorized_legacy_00397"
        )
        source_end = rollback.index(
            "ALTER FUNCTION public._void_invoice_authorized_legacy_00397",
            source_start,
        )
        source_core = rollback[source_start:source_end]
        self.assertIn("is_studio_comember", source_core)
        self.assertRegex(source_core, r"(?i)\bEXECUTE\b")
        for payload in (
            migration,
            self.outputs[renderer.STORAGE_SQL].decode(),
            rollback,
            self.outputs[renderer.STORAGE_ROLLBACK_SQL].decode(),
        ):
            self.assertIn(
                "reviewed dynamic routine profile/ACL/universe drifted", payload
            )
            self.assertNotRegex(payload, r"\$[0-9][A-Za-z0-9_]*\$")
        self.assertIn("pg_get_function_sqlbody", migration)
        self.assertIn(
            "unreviewed SQL-standard routine body outside prosrc", migration
        )

    def test_ordinary_rollback_refuses_loss_and_restores_exact_source_delta(self) -> None:
        rollback = self.outputs[renderer.ROLLBACK_SQL].decode()
        first_mutation = rollback.index(
            "CREATE OR REPLACE FUNCTION public._can_manage_invoice_owner"
        )
        self.assertIn(
            "rollback expected the exact reviewed final state",
            rollback[:first_mutation],
        )
        self.assertIn(
            "ordinary rollback requires exact source storage policies first",
            rollback[:first_mutation],
        )
        for table_name in (
            "proposals", "designer_clients", "leads", "client_decisions",
            "saved_vendors", "phase_templates",
        ):
            self.assertIn(
                f"SELECT 1 FROM public.{table_name} WHERE studio_id IS NOT NULL",
                rollback[:first_mutation],
            )
        for conflict in (
            "designer/client rows collide in source uniqueness",
            "designer/email rows collide in source uniqueness",
            "saved-vendor rows collide in source uniqueness",
        ):
            self.assertIn(conflict, rollback[:first_mutation])
        source_routines = rollback[
            rollback.index("-- Re-emit only bodies"):
            rollback.index("-- Restore the exact source security-invoker view")
        ]
        self.assertEqual(
            source_routines.count("CREATE OR REPLACE FUNCTION "), 129
        )
        self.assertEqual(rollback.count("DROP POLICY "), 186)
        self.assertNotIn("DROP POLICY IF EXISTS ", rollback)
        self.assertIsNone(
            renderer.re.search(
                r"(?is)\bDROP\b[^;]*\bCASCADE\b",
                renderer.sql_code_mask(rollback),
            )
        )
        self.assertGreater(
            rollback.rfind("rollback expected the exact reviewed source state"),
            rollback.index("DROP FUNCTION public._lock_designer_studio_authority"),
        )

    def test_storage_rollback_is_exact_platform_first_phase(self) -> None:
        rollback = self.outputs[renderer.STORAGE_ROLLBACK_SQL].decode()
        gate = rollback.index("DO $canonical_studio_storage_rollback_gate$")
        role_switch = rollback.index("SET LOCAL ROLE postgres;")
        policy_drop = rollback.index("DROP POLICY ")
        self.assertLess(gate, role_switch)
        self.assertLess(rollback.index("RESET ROLE;"), policy_drop)
        compatibility = rollback[role_switch:rollback.index("RESET ROLE;")]
        self.assertEqual(
            compatibility.count("CREATE OR REPLACE FUNCTION "), 4
        )
        self.assertEqual(
            compatibility.count("REVOKE EXECUTE ON FUNCTION "), 4
        )
        self.assertEqual(rollback.count("DROP POLICY "), 9)
        self.assertNotIn("DROP POLICY IF EXISTS ", rollback)
        self.assertGreater(
            rollback.rfind("storage rollback expected exact source policies"),
            rollback.rfind("DROP POLICY "),
        )

    def test_standalone_storage_role_fingerprint_keeps_public_oid(self) -> None:
        template = (
            renderer.ROOT
            / "supabase/acl/00488_canonical_studio_storage_template.sql"
        ).read_text(encoding="utf-8")
        self.assertEqual(
            template.count("WHEN role_oid.oid = 0 THEN 'public'::text"), 4
        )
        self.assertEqual(
            template.count(
                "LEFT JOIN pg_catalog.pg_roles AS role_row "
                "ON role_row.oid = role_oid.oid"
            ),
            2,
        )

    def test_frozen_rollback_source_body_is_exact(self) -> None:
        payload = renderer.ROLLBACK_OPEN_PROJECT_SOURCE.read_bytes()
        self.assertEqual(
            renderer.digest(payload), renderer.ROLLBACK_OPEN_PROJECT_SOURCE_SHA256
        )
        fragments = renderer.function_fragments(payload.decode())
        self.assertEqual(len(fragments), 1)
        self.assertEqual(
            fragments[0]["body_sha256"],
            "03841c221e3dc46a577143a651df8b950537d414f8a94af2673ddf6a52b9bf92",
        )

    def test_no_membership_derived_historical_backfill(self) -> None:
        migration = self.outputs[renderer.MIGRATION].decode()
        backfill = migration[
            migration.index("-- Historical NULL snapshots"):
            migration.index("-- ── Exact membership and revocation-safe")
        ]
        self.assertNotIn("organization_members", backfill)
        self.assertNotIn("_00488_unique_live_designer_studio", migration)

    def test_frozen_00485_overlay_and_invoice_dependency_contract(self) -> None:
        contract = json.loads(self.outputs[renderer.CONTRACT])
        self.assertEqual(
            contract["composed_00485_source"],
            {
                "path": "supabase/acl/canonical-studio-source/final_00485/supabase/migrations/00485_public_sd_hardening.sql",
                "commit": renderer.FINAL_00485_COMMIT,
                "sha256": renderer.FINAL_00485_SHA256,
                "routine_count": 25,
            },
        )
        self.assertEqual(len(contract["composed_upstream_routines"]), 14)
        self.assertEqual(
            sum(
                row["disposition"] == "preserved_frozen_composed_00485"
                for row in contract["routines"]
            ),
            7,
        )
        self.assertEqual(
            sum(
                row["disposition"] == "preserved_composed_00485"
                for row in contract["dispositioned_routine_profiles"]
            ),
            4,
        )
        migration = self.outputs[renderer.MIGRATION].decode()
        self.assertIn("frozen 00485 invoice-core caller universe drifted", migration)
        self.assertIn("frozen 00485 root/authority lock order drifted", migration)
        self.assertIn(
            "public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)",
            migration,
        )

    def test_root_authority_child_order_is_statically_pinned(self) -> None:
        contract = json.loads(self.outputs[renderer.CONTRACT])
        rows = {
            row["canonical_regprocedure"]: row
            for row in contract["canonical_lock_order"]
        }
        self.assertEqual(len(rows), 100)
        for signature, row in rows.items():
            before = set(row["snapshot_root_locks_before_first_authority"])
            after = set(row["snapshot_root_locks_after_first_authority"])
            mutations = set(
                row["snapshot_root_mutations_after_first_authority"]
            )
            if not row["target_row_lock_inherent"]:
                self.assertLessEqual(after, before, signature)
                self.assertLessEqual(mutations, before, signature)
            if row["explicit_locks_after_first_authority"]:
                self.assertTrue(
                    row["target_row_lock_inherent"]
                    or row["explicit_locks_before_first_authority"] > 0,
                    signature,
                )
        for signature in (
            "public.copy_schedule_as_built(uuid,uuid,uuid)",
            "public.create_plan_issue(uuid,text,text,uuid[])",
            "public.file_plan_prints(uuid,text,jsonb,text)",
            "public.ceremony_complete(uuid,text,jsonb,text,text,text)",
            "public.reassign_project_lead(uuid,uuid,uuid)",
            "public.seed_project_schedule_from_template(uuid,text)",
            "public.set_document_client(text,uuid,uuid,uuid)",
        ):
            self.assertGreater(rows[signature]["explicit_locks_before_first_authority"], 0)
        migration = self.outputs[renderer.MIGRATION].decode()
        self.assertIn("canonical authority-tier lock order drifted", migration)
        self.assertIn(
            "canonical root/authority order manifest or body drifted", migration
        )
        copy_start = migration.index(
            "CREATE OR REPLACE FUNCTION public.copy_schedule_as_built"
        )
        copy_end = migration.index(
            "ALTER FUNCTION public.copy_schedule_as_built", copy_start
        )
        copy_body = migration[copy_start:copy_end]
        self.assertEqual(
            copy_body.count(
                "copy_schedule_as_built: target proposal not found or access denied"
            ),
            2,
        )

    def test_rendered_plpgsql_if_blocks_are_balanced(self) -> None:
        migration = self.outputs[renderer.MIGRATION].decode()
        for fragment in renderer.function_fragments(migration):
            if re.search(r"(?i)LANGUAGE\s+plpgsql", fragment["fragment"]) is None:
                continue
            masked = renderer.sql_code_mask(
                fragment["fragment"], function_body_only=True
            )
            end_count = len(re.findall(r"(?i)\bEND\s+IF\s*;", masked))
            total_if_count = len(re.findall(r"(?i)\bIF\b", masked))
            self.assertEqual(
                total_if_count - end_count,
                end_count,
                fragment["name"],
            )

    def test_snapshot_guard_parent_locks_fail_bounded(self) -> None:
        migration = self.outputs[renderer.MIGRATION].decode()
        fragments = [
            fragment
            for fragment in renderer.function_fragments(migration)
            if fragment["name"] == "guard_canonical_studio_snapshot"
        ]
        self.assertEqual(len(fragments), 1)
        body = fragments[0]["body"]
        self.assertEqual(body.count("FOR SHARE NOWAIT;"), 6)
        self.assertNotRegex(body, r"(?i)FOR\s+SHARE\s*;")
        self.assertIn(
            "trigger_row.tgfoid =\n"
            "          'public.guard_canonical_studio_snapshot()'::pg_catalog.regprocedure",
            migration,
        )
        self.assertIn("OR trigger_row.tgqual IS NOT NULL", migration)
        self.assertIn(
            "OR trigger_row.tgattr <> ''::pg_catalog.int2vector", migration
        )

    def test_replaced_workspace_signatures_have_exact_callers(self) -> None:
        migration = self.outputs[renderer.MIGRATION].decode()
        self.assertIn(
            "DROP FUNCTION public.can_dispatch_proposal_send(uuid);", migration
        )
        self.assertIn(
            "replaced workspace signature has an unreviewed source caller",
            migration,
        )
        self.assertIn("explicit workspace/core caller universe drifted", migration)
        self.assertNotIn(
            "WHERE actual.call_count > 0 OR actual.dynamic_call\n"
            "      AND NOT EXISTS",
            migration,
        )

    def test_check_mode_detects_a_stale_target(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "artifact.sql"
            target.write_bytes(b"stale")
            with self.assertRaisesRegex(renderer.RenderError, "stale"):
                renderer.check_outputs({target: b"expected"})
            self.assertEqual(target.read_bytes(), b"stale")

    def test_source_hash_drift_and_duplicate_ids_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            review_path = Path(directory) / "review.json"
            findings_path = Path(directory) / "findings.json"
            document = json.loads(renderer.REVIEW.read_bytes())
            document["live_policies"][1]["record_id"] = document["live_policies"][0]["record_id"]
            review_payload = (json.dumps(document) + "\n").encode()
            review_path.write_bytes(review_payload)
            findings_payload = renderer.FINDINGS.read_bytes()
            findings_path.write_bytes(findings_payload)
            with mock.patch.multiple(
                renderer,
                REVIEW=review_path,
                REVIEW_SHA256=renderer.digest(review_payload),
                FINDINGS=findings_path,
                FINDINGS_SHA256=renderer.digest(findings_payload),
            ):
                with self.assertRaisesRegex(renderer.RenderError, "duplicates"):
                    renderer.load_review()
            review_path.write_bytes(review_payload + b"drift")
            with mock.patch.multiple(
                renderer,
                REVIEW=review_path,
                REVIEW_SHA256=renderer.digest(review_payload),
                FINDINGS=findings_path,
                FINDINGS_SHA256=renderer.digest(findings_payload),
            ):
                with self.assertRaisesRegex(renderer.RenderError, "hash drifted"):
                    renderer.load_review()

    def test_duplicate_routine_signatures_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            review_path = Path(directory) / "review.json"
            findings_path = Path(directory) / "findings.json"
            document = json.loads(renderer.REVIEW.read_bytes())
            document["live_routines"][1]["canonical_regprocedure"] = (
                document["live_routines"][0]["canonical_regprocedure"]
            )
            review_payload = (json.dumps(document) + "\n").encode()
            review_path.write_bytes(review_payload)
            findings_payload = renderer.FINDINGS.read_bytes()
            findings_path.write_bytes(findings_payload)
            with mock.patch.multiple(
                renderer,
                REVIEW=review_path,
                REVIEW_SHA256=renderer.digest(review_payload),
                FINDINGS=findings_path,
                FINDINGS_SHA256=renderer.digest(findings_payload),
            ):
                with self.assertRaisesRegex(renderer.RenderError, "routine signatures.*duplicates"):
                    renderer.load_review()

    def test_partial_replace_failure_restores_all_originals(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first"
            second = Path(directory) / "second"
            first.write_bytes(b"old-first")
            second.write_bytes(b"old-second")
            real_replace = renderer.os.replace
            calls = 0

            def fail_once(source: object, destination: object) -> None:
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("injected replacement failure")
                real_replace(source, destination)

            with mock.patch.object(renderer.os, "replace", side_effect=fail_once):
                with self.assertRaisesRegex(OSError, "injected"):
                    renderer.atomic_write_outputs({first: b"new-first", second: b"new-second"})
            self.assertEqual(first.read_bytes(), b"old-first")
            self.assertEqual(second.read_bytes(), b"old-second")


if __name__ == "__main__":
    unittest.main()
