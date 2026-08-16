#!/usr/bin/env python3
"""Render the hash-pinned canonical-studio authority closure.

This is a one-time provenance renderer.  It consumes the reviewed queue and
the exact composed source roots recorded by that queue, then emits checked-in
SQL/JSON artifacts.  Runtime migration replay never reads sibling worktrees or
the review JSON; only this renderer does.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / "supabase/acl/canonical-studio-authority-review.json"
REVIEW_SHA256 = "7d4a3de8ef879787abc2df50e3d3801ffa128ff1f41e58194ddb3b00f79deab7"
FINDINGS = ROOT / "supabase/acl/canonical-studio-authority-review-findings.json"
FINDINGS_SHA256 = "b488869dee309a9ea9f9f0bfc22f6172ee0dea196989a3486818db917c716000"
PUBLIC_POLICY_CATALOG_SNAPSHOT = (
    ROOT / "docs/ops/wave1-apply-2026-08-12/snapshot-2.2-public-policies.json"
)
PUBLIC_POLICY_CATALOG_SNAPSHOT_SHA256 = (
    "182aafa6f072df808f162b3022f77421b6b7722c410c87181f6d5c29528b7708"
)
STORAGE_POLICY_CATALOG_SNAPSHOT = (
    ROOT / "docs/ops/wave1-apply-2026-08-12/snapshot-2.3-storage-objects-policies.json"
)
STORAGE_POLICY_CATALOG_SNAPSHOT_SHA256 = (
    "f6e97c0d75f1a6bcf583a3229158b55992f4c8ff92475191387ecc2032b089a1"
)

# Nine policies landed after the checked catalog snapshot and six were
# redefined after it. Their PG17 catalog forms are pinned here from the exact
# composed source boundary. The renderer validates every reviewed helper-call
# profile before using them, and final forms change only those exact call nodes.
POST_SNAPSHOT_POLICY_CATALOG_EXPRESSIONS = {
    "public.decision_comments:decision_comments_insert": {
        "qual": None,
        "with_check": "((author_id = auth.uid()) AND "
                      "app_private.is_decision_comment_client(decision_id))",
    },
    "public.decision_comments:decision_comments_participant_select": {
        "qual": "app_private.is_decision_comment_client(decision_id)",
        "with_check": None,
    },
    "public.install_windows:install_windows_studio_rw": {
        "qual": "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = "
                "install_windows.project_id) AND is_studio_comember(p.designer_id))))",
        "with_check": "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = "
                      "install_windows.project_id) AND is_studio_comember(p.designer_id))))",
    },
    "public.project_approval_action_receipts:project_approval_receipts_studio_select": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "project_approval_action_receipts.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.project_approval_artifacts:project_approval_artifacts_studio_select": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "project_approval_artifacts.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.project_boards:project_boards_participant_select": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "project_boards.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.project_decision_authorities:project_decision_authorities_studio_select": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "project_decision_authorities.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.project_decision_authority_snapshots:project_authority_snapshots_studio_select": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "project_decision_authority_snapshots.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.project_decision_review_confirmations:project_review_confirmations_studio_select": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "project_decision_review_confirmations.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.schedule_proposals:schedule_proposals_studio_rw": {
        "qual": "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = "
                "schedule_proposals.project_id) AND is_studio_comember(p.designer_id))))",
        "with_check": "(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = "
                      "schedule_proposals.project_id) AND is_studio_comember(p.designer_id))))",
    },
    "public.site_binder_entries:site_binder_designer_read": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "site_binder_entries.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.site_deliverables:site_deliverables_designer_read": {
        "qual": "(EXISTS ( SELECT 1 FROM (site_requests request JOIN projects "
                "project ON ((project.id = request.project_id))) WHERE "
                "((request.id = site_deliverables.request_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.site_request_item_versions:site_request_versions_designer_read": {
        "qual": "(EXISTS ( SELECT 1 FROM ((site_request_items item JOIN "
                "site_requests request ON ((request.id = item.request_id))) JOIN "
                "projects project ON ((project.id = request.project_id))) WHERE "
                "((item.id = site_request_item_versions.item_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.site_request_items:site_request_items_designer_read": {
        "qual": "(EXISTS ( SELECT 1 FROM (site_requests request JOIN projects "
                "project ON ((project.id = request.project_id))) WHERE "
                "((request.id = site_request_items.request_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
    "public.site_requests:site_requests_designer_read": {
        "qual": "(EXISTS ( SELECT 1 FROM projects project WHERE ((project.id = "
                "site_requests.project_id) AND "
                "is_design_studio_comember(project.designer_id))))",
        "with_check": None,
    },
}

AFFECTED_POLICY_COMPATIBILITY = (
    ("public.client_decisions", "Clients can view their decisions"),
    ("public.client_decisions", "client_decisions_client_compat_update"),
    ("public.client_decisions", "coordination_party_decisions_select"),
    ("public.designer_clients", "Designers can manage their clients"),
    ("public.leads", "Designers can create leads"),
    ("public.leads", "Designers can update their leads"),
    ("public.leads", "Designers can view their leads"),
    ("public.leads", "Homeowners can create leads"),
    ("public.leads", "Homeowners can view their leads"),
    ("public.phase_templates", "phase_templates_designer_delete"),
    ("public.phase_templates", "phase_templates_designer_update"),
    ("public.phase_templates", "phase_templates_designer_writes"),
    ("public.phase_templates", "phase_templates_select_all"),
    ("public.projects", "Lead designer can create projects"),
    ("public.projects", "Lead designer can delete projects"),
    ("public.projects", "Lead designer can update projects"),
    ("public.projects", "Project participants can view projects"),
    ("public.projects", "Service role full access to projects"),
    ("public.proposals", "proposals_legacy_ios_client_select"),
    ("public.saved_vendors", "Designers can manage their saved vendors"),
)
AFFECTED_AUTHORITY_RELATIONS = (
    "public.client_decisions",
    "public.designer_clients",
    "public.leads",
    "public.phase_templates",
    "public.projects",
    "public.proposals",
    "public.saved_vendors",
)
SOURCE_ROOTS = {
    "moving_00484": ROOT,
    "frozen_00485": ROOT / "supabase/acl/canonical-studio-source/frozen_00485",
    "moving_00486": ROOT / "supabase/acl/canonical-studio-source/frozen_00486",
}
FINAL_00485 = (
    ROOT
    / "supabase/acl/canonical-studio-source/final_00485/supabase/migrations"
    / "00485_public_sd_hardening.sql"
)
FINAL_00485_COMMIT = "5528d0a788776ca04b05e3957cfdb08ce8ea1e5e"
FINAL_00485_SHA256 = "22ba5a8b16a11bdfd09ff33a03052f7a84557dc483b0cc0fa16b06533b2f8afd"

# The reviewed 378-row queue remains immutable provenance.  These are the
# later, frozen 00485 bodies that actually exist at the 00488 source boundary.
# Keeping the composed overlay separate prevents the renderer from silently
# treating an older reviewed body as current authority.
FINAL_00485_ROUTINES = {
    "public.begin_proposal_send_provider_attempt(uuid,uuid)": "d397dff1554e3900ae88a36c03f99fc0de8dfed0f3756b454c908d7a7c758427",
    "public.complete_proposal_send_dispatch(uuid,uuid,text,text,text)": "3c4c0ad27c8ff731bd9195ba231c55d7e2d89e7c0fb106303457cc26591fc46f",
    "public.suppress_proposal_send_dispatch(uuid,uuid,text)": "8656a0f6a7ce43fa1cada96876b37f570e7cc583408f7eab3d3e453990be7d26",
    "public.release_proposal_send_dispatch(uuid,uuid,text)": "c42006d734dd3c577ac4282ed6e18ec1a3b371e3ce25c13395d993b451c0c547",
    "public.notify_decision_required(uuid)": "f785ab8588cc55a693a146984a71319e7afe9e27cbfee1154fc08d4b9c68156e",
    "public.notify_decision_overdue(uuid)": "f3ef2f42fa4667fce41e01342d0cea6df256f9df50940f32ce65e6c46fd64030",
    "public.notify_decision_resolved(uuid)": "6e0a32a2fbc1a57d7c4da7fca2d108d2b813923ec58ec731a132a66d36958483",
    "public.consume_board_unfurl_quota(uuid)": "310624681b340da2ef06a057a03f2d43962a3d19f0bffa35f5722ff4cc1eb992",
    "public.accept_trade_scope_with_trusted_ip(uuid,text,uuid,text)": "66c3128ffcfcea9b9f43c3a5b7db7b003fcd0189af3ee26a15e71d69139ead4f",
    "public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)": "6c615ca417d594865e1f0772ee862c312e7a398d037c141366c8a1b97fd6f17d",
    "public.execute_furnishings_authorization_with_trusted_ip(uuid,text,uuid,text)": "2caebad912c73b5d4a80c91a9e1608c2fdc8b9e6d020839ca04ff84f58ee4283",
    "public.execute_trade_scope_with_trusted_ip(uuid,text,uuid,text)": "83b0a7f5a54c33a80c3e9333603f3c4391cfa0f1913feb21ed1c1bb645017a12",
    "public.prepare_spec_book_issue(uuid,text[],text,text,uuid,text,jsonb)": "1b63dbc14bcdcc8a7a5b19e7375bf80d117159429b87d2cc5048a2ace9242b4b",
    "public.guard_commercial_signature_insert()": "cebd8924bd0de977fc47b137c77df7945906eb4955acf70fdb41f386eb04f255",
    "public.set_project_studio_id()": "9fb547de4460ddbc9d939f747e554b3f8340293da214fa911e874c4cc31ae7bf",
    "public.set_invoice_studio_id()": "f08204081f3b22f845b46af0e00f6b13e4aa578c9744e323481c24d28d59a18f",
    "public.publish_project_review(jsonb)": "d5770d33ce7d1572603f020ff63c05c7d8b7f1f27f573cc97d816becd2dfe22b",
    "public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)": "ae0f955f26b0cd4570f2b1dfe5d0762cdd387475033281f4abfddb1637f14000",
    "app_private.issue_invoice_for_actor(uuid,date,uuid)": "2f89692c867a5bd0c7d44eea587b7a82d0715a1e542254b8e0870b98349abaf7",
    "public._countersign_design_services_agreement_impl(uuid,text,jsonb)": "91cda0b749a9f82ae3e91db4a567d40c400c4c0d722b5c8d150bf736b4802f8e",
    "public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)": "d14f7a3cf958ff2c99f43d45cc2d3f2941ca49175d495e613cea346ff59fec86",
    "public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)": "f9904c33fb253e1210dbc16ad1c84ac55bd23df41e22783a72cca31f687eb7f0",
    "public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)": "f9031e3b7cefb9cc0de4a2c3d98adc470488f40c677b811de620ff40e9ee4e84",
    "public._execute_trade_scope_authorized(uuid,text,uuid,text)": "03277ddec803f42c90e96f67e5fba134b91342677bb44d672f927565a64fc541",
    "public.issue_trade_draw_invoice(uuid)": "fdbbbcb8bcf4df64d25492affe45e99d4cecb2721171af41cc3fe282e231a7fb",
}
PUBLIC_ROUTINE_CONTRACT = (
    ROOT
    / "supabase/acl/canonical-studio-source/moving_00484/supabase/acl"
    / "public-security-definer-contract.json"
)
PUBLIC_ROUTINE_CONTRACT_SHA256 = "1226038afc2a3b7f396d9abbb22ab0e8cb13e2da5fdd825da9c321cc302ec808"

# These are the only reviewed source routines whose executable bodies contain
# genuine dynamic SQL.  Four remain unchanged.  The legacy invoice core is a
# source-only dynamic disposition: 00488 removes its redundant owner-helper
# check and replaces its schema-probe EXECUTE with the now-guaranteed static
# project_time_entries update.
PERSISTENT_DYNAMIC_ROUTINES = {
    "public.evaluate_collection_rules(uuid)":
        "c3cf2fc6b7a6e4f856b6c76d4fea40bb11d40885328e4e8a4e7bc3ebbb34c455",
    "public.get_aesthete_matches(uuid,uuid,real,text,uuid,text,integer,integer,real,text)":
        "05e2f08a10ca3ce9b356fc8f45a93da6f8003165085d8793c46a3d53e6033732",
    "public.increment_campaign_counter(uuid,text)":
        "0f733420758c50632ab9bcdb73fdfe61de21286d598451957ed01055da1ffce6",
    "public.increment_sequence_counter(uuid,text)":
        "9d7c2703645fb8f774ff37698453de7c15d1fa0e67e2d902f3fd49ae17511142",
}
DYNAMIC_INVOICE_CORE = "public._void_invoice_authorized_legacy_00397(uuid,text)"
DYNAMIC_INVOICE_SOURCE_SHA256 = (
    "20c4720148d16b9711a045b06ede7449d9d53e1e55f1a12a419a9db7ab3a0a66"
)
REVIEWED_DYNAMIC_SOURCE_BODY_SHA256 = frozenset({
    *PERSISTENT_DYNAMIC_ROUTINES.values(),
    DYNAMIC_INVOICE_SOURCE_SHA256,
})

APP_ROLE_UNIVERSE = (
    "anon",
    "authenticated",
    "service_role",
    "dashboard_user",
    "agent_reader",
    "agent_writer",
    "edge_catalog_reader",
    "edge_rls_user",
)

MIGRATION = ROOT / "supabase/migrations/00488_canonical_studio_authority_closure.sql"
CONTRACT = ROOT / "supabase/acl/canonical-studio-authority-contract.json"
STORAGE_SQL = ROOT / "supabase/platform-admin/00488_canonical_studio_storage_policies.sql"
STORAGE_MANIFEST = ROOT / "supabase/platform-admin/00488_canonical_studio_storage_policies.manifest.json"
ROLLBACK_SQL = ROOT / "supabase/acl/00488_canonical_studio_authority_rollback.sql"
STORAGE_ROLLBACK_SQL = (
    ROOT
    / "supabase/platform-admin/00488_canonical_studio_storage_policies.rollback.sql"
)
ROLLBACK_TEMPLATE = (
    ROOT / "supabase/acl/00488_canonical_studio_authority_rollback_template.sql"
)
STORAGE_ROLLBACK_TEMPLATE = (
    ROOT / "supabase/acl/00488_canonical_studio_storage_rollback_template.sql"
)
ROLLBACK_OPEN_PROJECT_SOURCE = (
    ROOT
    / "supabase/acl/canonical-studio-source/rollback_00488"
    / "open_project_direct.sql"
)
ROLLBACK_OPEN_PROJECT_SOURCE_SHA256 = (
    "ab276ec525d566c011d370b71f8479c4a1bab9f3b4b2a10ec4bda1a3ee26a4b9"
)
DATABASE_TYPES = ROOT / "packages/supabase/src/database.types.ts"
CANONICAL_SQL_REGRESSION = (
    ROOT / "supabase/tests/rls/canonical_studio_authority_test.sql"
)
DESIGN_REQUEST_SQL_REGRESSION = ROOT / "supabase/tests/rls/design_requests_test.sql"

FORBIDDEN_HELPERS = (
    "_can_author_proposal",
    "is_active_studio_member",
    "is_design_studio_comember",
    "is_studio_comember",
)

SOURCE_AUTHORITY_HELPERS = (
    "_can_manage_invoice_owner",
    *FORBIDDEN_HELPERS,
)

READ_PREFIXES = (
    "_can_",
    "can_",
    "get_",
    "list_",
    "may_",
)

ROUTINE_STUDIO_OVERRIDES = {
    "public.activate_proposal_as_project(uuid,date)": {
        "v_designer_id": "(SELECT studio_id FROM public.proposals WHERE id = p_proposal_id)",
    },
    "public.apply_decision(uuid,uuid,uuid)": {
        "v_designer_id": "(SELECT studio_id FROM public.client_decisions WHERE id = p_decision_id)",
    },
    "public.send_proposal(uuid,timestamp with time zone,integer,text,text,text,timestamp with time zone)": {
        "v_designer_id": "(SELECT studio_id FROM public.proposals WHERE id = p_proposal_id)",
    },
    "public.create_spec_book_share(uuid,text,timestamp with time zone)": {
        "v_designer_id": "(SELECT project.studio_id FROM public.spec_book_artifacts AS artifact JOIN public.spec_book_revisions AS revision ON revision.id = artifact.revision_id JOIN public.spec_books AS book ON book.id = revision.spec_book_id JOIN public.projects AS project ON project.id = book.project_id WHERE artifact.id = p_artifact_id)",
    },
    "public.save_board_as_template(uuid,uuid,text,text)": {
        "v_owner_id": "COALESCE((SELECT studio_id FROM public.proposals WHERE id = v_board.proposal_id), (SELECT studio_id FROM public.projects WHERE id = v_board.project_id))",
    },
    "public.may_resolve_coordination_item(public.client_decisions,uuid)": {
        "v_owner": "p_item.studio_id",
    },
    "public.get_proposal_send_dispatch_status(uuid,uuid,timestamp with time zone)": {
        "v_dispatch.designer_id": "(SELECT studio_id FROM public.proposals WHERE id = v_dispatch.proposal_id)",
    },
    "public.log_po_acknowledgment(uuid,text,date)": {
        "v_po.designer_id": "(SELECT project.studio_id FROM public.projects AS project WHERE project.id = v_po.project_id)",
    },
}

ROUTINE_TEXT_REPLACEMENTS: dict[str, tuple[tuple[str, str], ...]] = {
    "public.seed_project_schedule_from_template(uuid,text)": (
        (
            "  IF NOT FOUND OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN\n"
            "    RAISE EXCEPTION\n"
            "      'seed_project_schedule_from_template: project not found or access denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;",
            "  IF NOT FOUND THEN\n"
            "    RAISE EXCEPTION\n"
            "      'seed_project_schedule_from_template: project not found or access denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n"
            "  -- A custom template is a revocable snapshot root. Lock the exact\n"
            "  -- system-or-project-studio row before taking studio authority.\n"
            "  SELECT * INTO v_template\n"
            "  FROM public.phase_templates\n"
            "  WHERE slug = p_template_slug\n"
            "    AND (is_system OR studio_id = v_project.studio_id)\n"
            "  FOR SHARE;\n\n"
            "  IF NOT FOUND THEN\n"
            "    RAISE EXCEPTION 'template not found or access denied: %', p_template_slug\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n"
            "  IF NOT public._can_author_studio_snapshot(\n"
            "           v_project.studio_id, v_project.designer_id\n"
            "         )\n"
            "  THEN\n"
            "    RAISE EXCEPTION\n"
            "      'seed_project_schedule_from_template: project not found or access denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;",
        ),
        (
            "  SELECT * INTO v_template\n"
            "  FROM public.phase_templates\n"
            "  WHERE slug = p_template_slug\n"
            "    AND (is_system OR public._can_author_studio_snapshot(studio_id, designer_id))\n"
            "  FOR SHARE;\n\n"
            "  IF NOT FOUND THEN\n"
            "    RAISE EXCEPTION 'template not found or access denied: %', p_template_slug\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n",
            "",
        ),
    ),
    "public.apply_phase_template(uuid,text,uuid)": (
        (
            "  IF NOT FOUND OR NOT public._can_author_studio_snapshot(v_proposal.studio_id, v_proposal.designer_id) THEN",
            "  IF NOT FOUND THEN\n"
            "    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n"
            "  PERFORM template.id\n"
            "  FROM public.phase_templates AS template\n"
            "  WHERE template.slug = p_template_slug\n"
            "    AND (template.is_system OR template.studio_id = v_proposal.studio_id)\n"
            "  FOR SHARE;\n\n"
            "  IF NOT public._can_author_studio_snapshot(v_proposal.studio_id, v_proposal.designer_id) THEN",
        ),
        (
            "  SELECT * INTO v_template\n"
            "  FROM public.phase_templates\n"
            "  WHERE slug = p_template_slug\n"
            "    AND (is_system OR public._can_author_studio_snapshot(studio_id, designer_id))\n"
            "  FOR SHARE;",
            "  SELECT * INTO v_template\n"
            "  FROM public.phase_templates\n"
            "  WHERE slug = p_template_slug\n"
            "    AND (\n"
            "      is_system\n"
            "      OR (\n"
            "        NOT is_system\n"
            "        AND studio_id = v_proposal.studio_id\n"
            "        AND public._can_author_studio_snapshot(studio_id, designer_id)\n"
            "      )\n"
            "    )\n"
            "  FOR SHARE;",
        ),
    ),
    "public.delete_plan_sheet(uuid)": (
        (
            "  v_sheet public.plan_sheets%ROWTYPE;",
            "  v_sheet public.plan_sheets%ROWTYPE;\n  v_project public.projects%ROWTYPE;",
        ),
        (
            "-- Authority before the lock, one answer for both misses — see the same note\n"
            "  -- on set_plan_sheet_state.\n"
            "  IF NOT EXISTS (\n"
            "    SELECT 1 FROM public.plan_sheets s\n"
            "    JOIN public.projects p ON p.id = s.project_id\n"
            "    WHERE s.id = p_sheet_id AND public._can_author_studio_snapshot(p.studio_id, p.designer_id)\n"
            "  ) THEN",
            "-- Discover the root through the sheet, then lock the canonical project\n"
            "  -- before acquiring revocable authority and finally the sheet child.\n"
            "  SELECT project.* INTO v_project\n"
            "  FROM public.plan_sheets AS sheet\n"
            "  JOIN public.projects AS project ON project.id = sheet.project_id\n"
            "  WHERE sheet.id = p_sheet_id\n"
            "  FOR SHARE OF project;\n"
            "  IF NOT FOUND\n"
            "     OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN",
        ),
        (
            "SELECT * INTO v_sheet FROM public.plan_sheets WHERE id = p_sheet_id FOR UPDATE;",
            "SELECT * INTO v_sheet FROM public.plan_sheets\n"
            "  WHERE id = p_sheet_id AND project_id = v_project.id FOR UPDATE;",
        ),
    ),
    "public.lock_client_decision_option_parent(uuid,text)": (
        (
            "SELECT decision.* INTO v_decision\n"
            "  FROM public.client_decisions AS decision\n"
            "  WHERE decision.id = p_decision_id\n"
            "    AND CASE p_path\n"
            "      WHEN 'studio_draft_delete' THEN\n"
            "        decision.status = 'draft'\n"
            "        AND public._can_author_studio_snapshot(decision.studio_id, decision.designer_id)\n"
            "      WHEN 'studio_option_insert' THEN\n"
            "        decision.status IN ('draft', 'pending')\n"
            "        AND public._can_author_studio_snapshot(decision.studio_id, decision.designer_id)\n"
            "      WHEN 'studio_override_insert' THEN\n"
            "        decision.status = 'pending'\n"
            "        AND decision.coordination_kind = 'selection'\n"
            "        AND decision.court = 'client'\n"
            "        AND public._can_author_studio_snapshot(decision.studio_id, decision.designer_id)\n"
            "      WHEN 'client_pending_update' THEN\n"
            "        decision.status = 'pending'\n"
            "        AND decision.coordination_kind = 'selection'\n"
            "        AND decision.court = 'client'\n"
            "        AND public.is_addressed_client_decision(decision.id)\n"
            "      WHEN 'studio_expired_reopen_update' THEN\n"
            "        decision.status = 'expired'\n"
            "        AND public._can_author_studio_snapshot(decision.studio_id, decision.designer_id)\n"
            "      ELSE false\n"
            "    END\n"
            "  FOR UPDATE;\n\n"
            "  RETURN FOUND;",
            "SELECT decision.* INTO v_decision\n"
            "  FROM public.client_decisions AS decision\n"
            "  WHERE decision.id = p_decision_id\n"
            "  FOR UPDATE;\n"
            "  IF NOT FOUND THEN\n"
            "    RETURN false;\n"
            "  END IF;\n\n"
            "  RETURN CASE p_path\n"
            "    WHEN 'studio_draft_delete' THEN\n"
            "      v_decision.status = 'draft'\n"
            "      AND public._can_author_studio_snapshot(v_decision.studio_id, v_decision.designer_id)\n"
            "    WHEN 'studio_option_insert' THEN\n"
            "      v_decision.status IN ('draft', 'pending')\n"
            "      AND public._can_author_studio_snapshot(v_decision.studio_id, v_decision.designer_id)\n"
            "    WHEN 'studio_override_insert' THEN\n"
            "      v_decision.status = 'pending'\n"
            "      AND v_decision.coordination_kind = 'selection'\n"
            "      AND v_decision.court = 'client'\n"
            "      AND public._can_author_studio_snapshot(v_decision.studio_id, v_decision.designer_id)\n"
            "    WHEN 'client_pending_update' THEN\n"
            "      v_decision.status = 'pending'\n"
            "      AND v_decision.coordination_kind = 'selection'\n"
            "      AND v_decision.court = 'client'\n"
            "      AND public.is_addressed_client_decision(v_decision.id)\n"
            "    WHEN 'studio_expired_reopen_update' THEN\n"
            "      v_decision.status = 'expired'\n"
            "      AND public._can_author_studio_snapshot(v_decision.studio_id, v_decision.designer_id)\n"
            "    ELSE false\n"
            "  END;",
        ),
    ),
    "public.lock_proposal_authored_parent(uuid)": (
        (
            "SELECT proposal.id\n"
            "  INTO v_locked_id\n"
            "  FROM public.proposals AS proposal\n"
            "  WHERE proposal.id = p_proposal_id\n"
            "    AND proposal.status = 'draft'\n"
            "    AND public._can_author_studio_snapshot(proposal.studio_id, proposal.designer_id)\n"
            "  FOR UPDATE;\n\n"
            "  RETURN v_locked_id IS NOT NULL;",
            "SELECT proposal.id\n"
            "  INTO v_locked_id\n"
            "  FROM public.proposals AS proposal\n"
            "  WHERE proposal.id = p_proposal_id\n"
            "  FOR UPDATE;\n"
            "  IF NOT FOUND THEN\n"
            "    RETURN false;\n"
            "  END IF;\n\n"
            "  RETURN EXISTS (\n"
            "    SELECT 1 FROM public.proposals AS proposal\n"
            "    WHERE proposal.id = v_locked_id\n"
            "      AND proposal.status = 'draft'\n"
            "      AND public._can_author_studio_snapshot(proposal.studio_id, proposal.designer_id)\n"
            "  );",
        ),
    ),
    "public.override_budget_checkpoint(uuid,text)": (
        (
            "  v_newly boolean := false;",
            "  v_newly boolean := false;\n  v_project public.projects%ROWTYPE;",
        ),
        (
            "SELECT c.* INTO v_checkpoint\n"
            "  FROM public.project_budget_checkpoints c\n"
            "  JOIN public.projects p ON p.id = c.project_id\n"
            "  WHERE c.id = p_checkpoint_id AND public._can_author_studio_snapshot(p.studio_id, p.designer_id)\n"
            "  FOR UPDATE OF c;\n"
            "  IF NOT FOUND OR v_actor IS NULL THEN",
            "SELECT project.* INTO v_project\n"
            "  FROM public.project_budget_checkpoints AS checkpoint\n"
            "  JOIN public.projects AS project ON project.id = checkpoint.project_id\n"
            "  WHERE checkpoint.id = p_checkpoint_id\n"
            "  FOR SHARE OF project;\n"
            "  IF NOT FOUND OR v_actor IS NULL\n"
            "     OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN\n"
            "    RAISE EXCEPTION 'budget checkpoint % not found or access denied', p_checkpoint_id\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n"
            "  SELECT checkpoint.* INTO v_checkpoint\n"
            "  FROM public.project_budget_checkpoints AS checkpoint\n"
            "  WHERE checkpoint.id = p_checkpoint_id\n"
            "    AND checkpoint.project_id = v_project.id\n"
            "  FOR UPDATE;\n"
            "  IF NOT FOUND THEN",
        ),
    ),
    "public.publish_budget_checkpoint(uuid,uuid)": (
        (
            "  v_previous_publish text := current_setting('app.budget_publish_id', true);",
            "  v_previous_publish text := current_setting('app.budget_publish_id', true);\n  v_project public.projects%ROWTYPE;",
        ),
        (
            "SELECT v.* INTO v_version\n"
            "  FROM public.project_budget_versions v\n"
            "  JOIN public.projects p ON p.id = v.project_id\n"
            "  WHERE v.id = p_version_id AND v.project_id = p_project_id\n"
            "    AND public._can_author_studio_snapshot(p.studio_id, p.designer_id)\n"
            "  FOR UPDATE OF v;\n"
            "  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN",
            "SELECT project.* INTO v_project\n"
            "  FROM public.projects AS project\n"
            "  WHERE project.id = p_project_id\n"
            "  FOR SHARE;\n"
            "  IF NOT FOUND OR v_actor IS NULL\n"
            "     OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN\n"
            "    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n"
            "  SELECT version.* INTO v_version\n"
            "  FROM public.project_budget_versions AS version\n"
            "  WHERE version.id = p_version_id AND version.project_id = v_project.id\n"
            "  FOR UPDATE;\n"
            "  IF NOT FOUND OR v_version.status <> 'draft' THEN",
        ),
    ),
    "public.set_plan_sheet_state(uuid,text)": (
        (
            "  v_sheet public.plan_sheets%ROWTYPE;",
            "  v_sheet public.plan_sheets%ROWTYPE;\n  v_project public.projects%ROWTYPE;",
        ),
        (
            "-- Authority BEFORE the lock, and one answer for both misses. Locking first\n"
            "  -- would let an unauthorized caller hold a foreign row for the length of the\n"
            "  -- refusal, and answering 'not found' separately from 'access denied' would\n"
            "  -- turn this RPC into an existence oracle for other studios' sheets (00424's\n"
            "  -- non-enumeration posture).\n"
            "  IF NOT EXISTS (\n"
            "    SELECT 1 FROM public.plan_sheets s\n"
            "    JOIN public.projects p ON p.id = s.project_id\n"
            "    WHERE s.id = p_sheet_id AND public._can_author_studio_snapshot(p.studio_id, p.designer_id)\n"
            "  ) THEN",
            "-- Discover the root through the sheet, then lock the canonical project\n"
            "  -- before acquiring revocable authority and finally the sheet child.\n"
            "  SELECT project.* INTO v_project\n"
            "  FROM public.plan_sheets AS sheet\n"
            "  JOIN public.projects AS project ON project.id = sheet.project_id\n"
            "  WHERE sheet.id = p_sheet_id\n"
            "  FOR SHARE OF project;\n"
            "  IF NOT FOUND\n"
            "     OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN",
        ),
        (
            "SELECT * INTO v_sheet FROM public.plan_sheets WHERE id = p_sheet_id FOR UPDATE;",
            "SELECT * INTO v_sheet FROM public.plan_sheets\n"
            "  WHERE id = p_sheet_id AND project_id = v_project.id FOR UPDATE;",
        ),
    ),
    "public.copy_schedule_as_built(uuid,uuid,uuid)": (
        (
            "    IF v_source_project.id IS NULL\n"
            "       OR NOT public._can_author_studio_snapshot(v_source_project.studio_id, v_source_project.designer_id) THEN",
            "    IF v_source_project.id IS NULL THEN",
        ),
        (
            "    IF v_target_project.id IS NULL\n"
            "       OR NOT public._can_author_studio_snapshot(v_target_project.studio_id, v_target_project.designer_id) THEN",
            "    IF v_target_project.id IS NULL THEN",
        ),
        (
            "SELECT * INTO v_source_project\n"
            "    FROM public.projects\n"
            "    WHERE id = p_source_project_id\n"
            "    FOR UPDATE;\n"
            "    IF NOT FOUND\n"
            "       OR NOT public._can_author_studio_snapshot(v_source_project.studio_id, v_source_project.designer_id) THEN\n"
            "      RAISE EXCEPTION\n"
            "        'copy_schedule_as_built: source project not found or access denied'\n"
            "        USING ERRCODE = 'insufficient_privilege';\n"
            "    END IF;\n\n"
            "    SELECT * INTO v_target_proposal\n"
            "    FROM public.proposals\n"
            "    WHERE id = p_target_proposal_id\n"
            "    FOR UPDATE;\n"
            "    IF NOT FOUND\n"
            "       OR NOT public._can_author_studio_snapshot(v_target_proposal.studio_id, v_target_proposal.designer_id) THEN\n"
            "      RAISE EXCEPTION\n"
            "        'copy_schedule_as_built: target proposal not found or access denied'\n"
            "        USING ERRCODE = 'insufficient_privilege';\n"
            "    END IF;",
            "SELECT * INTO v_source_project\n"
            "    FROM public.projects\n"
            "    WHERE id = p_source_project_id\n"
            "    FOR UPDATE;\n"
            "    IF NOT FOUND THEN\n"
            "      RAISE EXCEPTION\n"
            "        'copy_schedule_as_built: source project not found or access denied'\n"
            "        USING ERRCODE = 'insufficient_privilege';\n"
            "    END IF;\n\n"
            "    SELECT * INTO v_target_proposal\n"
            "    FROM public.proposals\n"
            "    WHERE id = p_target_proposal_id\n"
            "    FOR UPDATE;\n"
            "    IF NOT FOUND THEN\n"
            "      RAISE EXCEPTION\n"
            "        'copy_schedule_as_built: target proposal not found or access denied'\n"
            "        USING ERRCODE = 'insufficient_privilege';\n"
            "    END IF;",
        ),
        (
            "  END IF;\n\n"
            "  PERFORM phase.id\n"
            "  FROM public.project_phases AS phase\n"
            "  WHERE phase.project_id = p_source_project_id",
            "  END IF;\n\n"
            "  -- Every selected project/proposal root is locked above before any\n"
            "  -- revocable authority row, including the mutually exclusive target\n"
            "  -- branches. This keeps the branch order project/root -> authority.\n"
            "  IF NOT public._can_author_studio_snapshot(\n"
            "           v_source_project.studio_id, v_source_project.designer_id\n"
            "         )\n"
            "  THEN\n"
            "    RAISE EXCEPTION\n"
            "      'copy_schedule_as_built: source project not found or access denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n"
            "  IF p_target_project_id IS NOT NULL THEN\n"
            "    IF NOT public._can_author_studio_snapshot(\n"
            "             v_target_project.studio_id, v_target_project.designer_id\n"
            "           )\n"
            "    THEN\n"
            "      RAISE EXCEPTION\n"
            "        'copy_schedule_as_built: target project not found or access denied'\n"
            "        USING ERRCODE = 'insufficient_privilege';\n"
            "    END IF;\n"
            "  ELSIF NOT public._can_author_studio_snapshot(\n"
            "              v_target_proposal.studio_id, v_target_proposal.designer_id\n"
            "            )\n"
            "  THEN\n"
            "    RAISE EXCEPTION\n"
            "      'copy_schedule_as_built: target proposal not found or access denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n"
            "  PERFORM phase.id\n"
            "  FROM public.project_phases AS phase\n"
            "  WHERE phase.project_id = p_source_project_id",
        ),
    ),
    "public.create_plan_issue(uuid,text,text,uuid[])": (
        (
            "  v_unchanged  jsonb;\nBEGIN",
            "  v_unchanged  jsonb;\n  v_project    public.projects%ROWTYPE;\nBEGIN",
        ),
        (
            "IF NOT EXISTS (\n"
            "    SELECT 1 FROM public.projects p\n"
            "    WHERE p.id = p_project_id AND public._can_author_studio_snapshot(p.studio_id, p.designer_id)\n"
            "  ) THEN",
            "SELECT project.* INTO v_project\n"
            "  FROM public.projects AS project\n"
            "  WHERE project.id = p_project_id\n"
            "  FOR UPDATE;\n"
            "  IF NOT FOUND\n"
            "     OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN",
        ),
        (
            "\n  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;\n",
            "\n",
        ),
    ),
    "public.file_plan_prints(uuid,text,jsonb,text)": (
        (
            "  v_results      jsonb := '[]'::jsonb;\nBEGIN",
            "  v_results      jsonb := '[]'::jsonb;\n  v_project      public.projects%ROWTYPE;\nBEGIN",
        ),
        (
            "IF NOT EXISTS (\n"
            "    SELECT 1 FROM public.projects p\n"
            "    WHERE p.id = p_project_id AND public._can_author_studio_snapshot(p.studio_id, p.designer_id)\n"
            "  ) THEN",
            "SELECT project.* INTO v_project\n"
            "  FROM public.projects AS project\n"
            "  WHERE project.id = p_project_id\n"
            "  FOR UPDATE;\n"
            "  IF NOT FOUND\n"
            "     OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN",
        ),
        (
            "\n  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;\n",
            "\n",
        ),
    ),
    "public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)": (
        (
            "  IF NOT FOUND OR NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN",
            "  IF NOT FOUND THEN\n"
            "    RAISE EXCEPTION 'project not found or approval creation denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n"
            "  PERFORM relationship.id\n"
            "  FROM public.designer_clients AS relationship\n"
            "  WHERE relationship.designer_id = v_project.designer_id\n"
            "    AND relationship.client_id = v_project.client_id\n"
            "    AND relationship.studio_id = v_project.studio_id\n"
            "    AND relationship.status = 'active'\n"
            "  ORDER BY relationship.id\n"
            "  FOR SHARE;\n\n"
            "  IF NOT public._can_author_studio_snapshot(v_project.studio_id, v_project.designer_id) THEN",
        ),
        (
            "WHERE relationship.designer_id = v_project.designer_id\n"
            "    AND relationship.client_id = v_project.client_id\n"
            "    AND relationship.status = 'active'\n"
            "  ORDER BY relationship.created_at, relationship.id\n"
            "  LIMIT 1;",
            "WHERE relationship.designer_id = v_project.designer_id\n"
            "    AND relationship.client_id = v_project.client_id\n"
            "    AND relationship.studio_id = v_project.studio_id\n"
            "    AND relationship.status = 'active'\n"
            "    AND NOT EXISTS (\n"
            "      SELECT 1 FROM public.designer_clients AS other\n"
            "      WHERE other.designer_id = relationship.designer_id\n"
            "        AND other.client_id = relationship.client_id\n"
            "        AND other.studio_id = relationship.studio_id\n"
            "        AND other.status = 'active'\n"
            "        AND other.id <> relationship.id\n"
            "    )\n"
            "  FOR SHARE;",
        ),
        (
            "blocking_status, blocks_kind, court, designer_id, phase_id,\n"
            "    section_key, approval_contract, predecessor_decision_id",
            "blocking_status, blocks_kind, court, designer_id, studio_id, phase_id,\n"
            "    section_key, approval_contract, predecessor_decision_id",
        ),
        (
            "'client', v_project.designer_id, v_phase_id, v_section_key,",
            "'client', v_project.designer_id, v_project.studio_id, v_phase_id, v_section_key,",
        ),
    ),
    "public.begin_discovery(uuid)": (
        (
            "IF NOT FOUND OR NOT public._can_author_studio_snapshot(v_lead.studio_id, v_lead.designer_id) THEN",
            "IF NOT FOUND OR v_lead.studio_id IS NULL THEN\n"
            "    RAISE EXCEPTION 'lead % not found or access denied', p_lead_id\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n\n"
            "  PERFORM relationship.id\n"
            "  FROM public.designer_clients AS relationship\n"
            "  WHERE relationship.designer_id = v_lead.designer_id\n"
            "    AND relationship.studio_id = v_lead.studio_id\n"
            "    AND (\n"
            "      relationship.lead_id = p_lead_id\n"
            "      OR (\n"
            "        relationship.lead_id IS NULL\n"
            "        AND relationship.status = 'lead'\n"
            "        AND (\n"
            "          relationship.client_id = v_lead.homeowner_id\n"
            "          OR (\n"
            "            relationship.client_id IS NULL\n"
            "            AND relationship.client_email = v_lead.contact_email\n"
            "          )\n"
            "        )\n"
            "      )\n"
            "    )\n"
            "  ORDER BY relationship.id\n"
            "  FOR UPDATE;\n\n"
            "  IF NOT public._can_author_studio_snapshot(v_lead.studio_id, v_lead.designer_id) THEN",
        ),
        (
            "WHERE designer_id = v_lead.designer_id\n    AND lead_id = p_lead_id",
            "WHERE designer_id = v_lead.designer_id\n"
            "    AND lead_id = p_lead_id\n"
            "    AND studio_id = v_lead.studio_id",
        ),
        (
            "AND status = 'lead'\n      AND lead_id IS NULL",
            "AND status = 'lead'\n"
            "      AND studio_id = v_lead.studio_id\n"
            "      AND lead_id IS NULL",
        ),
        (
            "AND client_id IS NULL\n        AND lead_id IS NULL",
            "AND client_id IS NULL\n"
            "        AND studio_id = v_lead.studio_id\n"
            "        AND lead_id IS NULL",
        ),
        (
            "designer_id, client_id, source, lead_id, status\n      ) VALUES (\n"
            "        v_lead.designer_id, v_lead.homeowner_id, 'lead', p_lead_id, 'lead'",
            "designer_id, client_id, studio_id, source, lead_id, status\n      ) VALUES (\n"
            "        v_lead.designer_id, v_lead.homeowner_id, v_lead.studio_id, 'lead', p_lead_id, 'lead'",
        ),
        (
            "designer_id, client_id, client_name, client_email, source, lead_id, status\n      ) VALUES (\n"
            "        v_lead.designer_id, NULL, v_lead.contact_name, v_lead.contact_email,\n"
            "        'lead', p_lead_id, 'lead'",
            "designer_id, client_id, client_name, client_email, studio_id, source, lead_id, status\n      ) VALUES (\n"
            "        v_lead.designer_id, NULL, v_lead.contact_name, v_lead.contact_email,\n"
            "        v_lead.studio_id, 'lead', p_lead_id, 'lead'",
        ),
        (
            "designer_id, client_id, client_name, client_email, source, lead_id, status\n      ) VALUES (\n"
            "        v_lead.designer_id, NULL, v_lead.contact_name, NULL,\n"
            "        'lead', p_lead_id, 'lead'",
            "designer_id, client_id, client_name, client_email, studio_id, source, lead_id, status\n      ) VALUES (\n"
            "        v_lead.designer_id, NULL, v_lead.contact_name, NULL,\n"
            "        v_lead.studio_id, 'lead', p_lead_id, 'lead'",
        ),
    ),
    "public.create_client_decision(uuid,jsonb,jsonb,uuid[],uuid[])": (
        (
            "  SELECT * INTO v_relationship\n"
            "  FROM public.designer_clients",
            "  SELECT decision.* INTO v_decision\n"
            "  FROM public.client_decisions AS decision\n"
            "  WHERE decision.id = p_decision_id\n"
            "  FOR UPDATE;\n\n"
            "  SELECT * INTO v_relationship\n"
            "  FROM public.designer_clients",
        ),
        (
            "IF NOT FOUND OR NOT public._can_author_studio_snapshot(v_relationship.studio_id, v_relationship.designer_id) THEN",
            "IF NOT FOUND OR v_relationship.studio_id IS NULL THEN\n"
            "    RAISE EXCEPTION 'relationship not found or access denied'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;\n"
            "  IF v_decision.id IS NOT NULL\n"
            "     AND v_decision.designer_client_id IS DISTINCT FROM v_relationship.id\n"
            "  THEN\n"
            "    RAISE EXCEPTION 'p_decision_id was already used for another decision'\n"
            "      USING ERRCODE = 'serialization_failure';\n"
            "  END IF;\n"
            "  IF NOT public._can_author_studio_snapshot(\n"
            "           v_relationship.studio_id, v_relationship.designer_id\n"
            "         )\n"
            "  THEN",
        ),
        (
            "id, designer_client_id, designer_id, project_id, title, context,",
            "id, designer_client_id, designer_id, studio_id, project_id, title, context,",
        ),
        (
            "p_decision_id, v_relationship.id, v_relationship.designer_id, v_project_id,",
            "p_decision_id, v_relationship.id, v_relationship.designer_id,\n"
            "    v_relationship.studio_id, v_project_id,",
        ),
    ),
    "public.create_service_addendum(uuid,text)": (
        (
            "id, designer_id, client_id, designer_client_id, title, description,",
            "id, designer_id, client_id, designer_client_id, studio_id, title, description,",
        ),
        (
            "v_origin.designer_client_id, v_title, 'Additional design-services authority',",
            "v_origin.designer_client_id, v_origin.studio_id, v_title, 'Additional design-services authority',",
        ),
    ),
    "public.create_trade_scope(uuid,text)": (
        (
            "id, designer_id, client_id, designer_client_id, title, description,",
            "id, designer_id, client_id, designer_client_id, studio_id, title, description,",
        ),
        (
            "v_origin.designer_client_id, v_title,",
            "v_origin.designer_client_id, v_project.studio_id, v_title,",
        ),
    ),
}

# These latest live SQL writers are outside the helper-dependent 378-row
# queue.  Two need body changes because they can create a row without an exact
# parent snapshot; the other four are pinned as exact-parent writers in the
# writer universe below.
EXTRA_WRITER_SIGNATURES = (
    "public._sign_proposal_authorized_00400(uuid,text,uuid,text)",
    "public.begin_direction_from_discovery(uuid)",
    "public.ceremony_complete(uuid,text,jsonb,text,text,text)",
    "public.reassign_project_lead(uuid,uuid,uuid)",
    "public.record_offline_signature(uuid,text,boolean,date)",
    "public.submit_design_request(uuid[],text,uuid,text,text,text,uuid,text,uuid)",
)

PRESERVED_WRITER_SIGNATURES = (
    "public._sign_proposal_authorized_00400(uuid,text,uuid,text)",
)

SQL_WRITER_UNIVERSE = (
    ("public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)", "client_decisions", "explicit_project_snapshot"),
    ("public._sign_proposal_authorized_00400(uuid,text,uuid,text)", "client_decisions", "exact_project_and_relationship_parent"),
    ("public.begin_direction_from_discovery(uuid)", "proposals", "explicit_relationship_snapshot"),
    ("public.begin_discovery(uuid)", "designer_clients", "explicit_lead_snapshot"),
    ("public.ceremony_complete(uuid,text,jsonb,text,text,text)", "designer_clients", "explicit_lead_snapshot"),
    ("public.create_client_decision(uuid,jsonb,jsonb,uuid[],uuid[])", "client_decisions", "explicit_relationship_snapshot"),
    ("public.create_service_addendum(uuid,text)", "proposals", "explicit_origin_snapshot"),
    ("public.create_trade_scope(uuid,text)", "proposals", "explicit_project_snapshot"),
    ("public.reassign_project_lead(uuid,uuid,uuid)", "designer_clients", "explicit_project_snapshot"),
    ("public.record_offline_signature(uuid,text,boolean,date)", "client_decisions", "exact_project_and_relationship_parent"),
    ("public.submit_design_request(uuid[],text,uuid,text,text,text,uuid,text,uuid)", "leads", "locked_relationship_or_quarantined_intake"),
)

SNAPSHOT_TABLES = (
    "proposals",
    "designer_clients",
    "leads",
    "client_decisions",
    "saved_vendors",
    "phase_templates",
)

# Runtime Supabase writers execute after 00488 and therefore must stamp an
# exact studio.  This is deliberately an exact source universe, not a loose
# grep allow-list: a new/moved writer makes --check fail until it is reviewed.
RUNTIME_WRITER_EXPECTATIONS = (
    ("packages/supabase/src/hooks/use-leads.ts", 215, "leads", "insert", "literal_studio_id"),
    ("packages/supabase/src/hooks/use-leads.ts", 394, "designer_clients", "insert", "literal_studio_id"),
    ("packages/supabase/src/hooks/use-leads.ts", 446, "designer_clients", "insert", "literal_studio_id"),
    ("packages/supabase/src/hooks/use-proposals.ts", 583, "proposals", "insert", "literal_studio_id"),
    ("packages/supabase/src/hooks/use-vendors.ts", 401, "saved_vendors", "insert", "literal_studio_id"),
    ("packages/supabase/src/hooks/use-vendors.ts", 452, "saved_vendors", "upsert", "literal_studio_id"),
    ("apps/designer-portal/src/app/api/vendors/[id]/save/route.ts", 81, "saved_vendors", "upsert", "literal_studio_id"),
    ("apps/designer-portal/src/app/api/clients/invite/route.ts", 273, "designer_clients", "insert", "reviewed_insert_data"),
    ("apps/designer-portal/src/components/document/rooms/drafting/draft-proposal-opener.tsx", 99, "proposals", "insert", "literal_studio_id"),
)

RUNTIME_RPC_EXPECTATIONS = (
    (
        "packages/supabase/src/hooks/use-phase-templates.ts", 94,
        "apply_phase_template",
        ("p_proposal_id", "p_request_id", "p_template_slug"),
    ),
    (
        "packages/supabase/src/hooks/use-decisions.ts", 462,
        "create_client_decision",
        (
            "p_blocked_ffe_item_ids", "p_blocked_task_ids", "p_decision_id",
            "p_options", "p_payload",
        ),
    ),
    (
        "packages/supabase/src/hooks/use-coordination.ts", 926,
        "create_client_decision",
        (
            "p_blocked_ffe_item_ids", "p_blocked_task_ids", "p_decision_id",
            "p_options", "p_payload",
        ),
    ),
    (
        "apps/designer-portal/src/hooks/use-section-work.ts", 191,
        "create_client_decision",
        (
            "p_blocked_ffe_item_ids", "p_blocked_task_ids", "p_decision_id",
            "p_options", "p_payload",
        ),
    ),
    (
        "apps/designer-portal/src/hooks/use-margin-notes.ts", 85,
        "create_client_decision",
        (
            "p_blocked_ffe_item_ids", "p_blocked_task_ids", "p_decision_id",
            "p_options", "p_payload",
        ),
    ),
    (
        "apps/extension/src/state/effects.ts", 310,
        "create_client_decision",
        (
            "p_blocked_ffe_item_ids", "p_blocked_task_ids", "p_decision_id",
            "p_options", "p_payload",
        ),
    ),
    (
        "packages/supabase/src/hooks/use-design-requests.ts", 171,
        "claim_design_request", ("p_lead_id", "p_studio_id"),
    ),
    (
        "packages/supabase/src/hooks/use-design-requests.ts", 261,
        "accept_design_request", ("p_lead_id", "p_studio_id"),
    ),
    (
        "apps/designer-portal/src/hooks/use-project-lifecycle.ts", 78,
        "open_project_direct",
        (
            "p_budget_max_cents", "p_budget_min_cents", "p_designer_client_id",
            "p_id", "p_start_date", "p_studio_id", "p_title",
        ),
    ),
    (
        "apps/designer-portal/src/hooks/use-attach-client.ts", 36,
        "set_document_client",
        (
            "p_client_id", "p_designer_client_id", "p_engagement_kind", "p_target_id",
        ),
    ),
    (
        "supabase/functions/proposal-send/index.ts", 208,
        "can_dispatch_proposal_send", ("p_proposal_id",),
    ),
    (
        "packages/supabase/src/hooks/use-invoices.ts", 702,
        "create_draft_invoice",
        (
            "p_expected_client_id", "p_expected_designer_id", "p_expected_studio_id",
            "p_internal_notes", "p_lines", "p_memo", "p_payment_terms_days",
            "p_project_id", "p_tax_rate",
        ),
    ),
)

GENERATED_RPC_TYPE_EXPECTATIONS = {
    "_accept_design_request_00488_core": ("p_lead_id",),
    "_can_author_studio_snapshot": ("p_exact_owner", "p_studio_id"),
    "_can_read_studio_snapshot": ("p_exact_owner", "p_studio_id"),
    "_claim_design_request_00488_core": ("p_lead_id",),
    "_lock_designer_studio_authority": ("p_designer_id", "p_studio_id"),
    "_prepare_canonical_lead_claim": ("p_lead_id", "p_studio_id"),
    "accept_design_request": ("p_lead_id", "p_studio_id"),
    "can_dispatch_proposal_send": ("p_proposal_id",),
    "claim_design_request": ("p_lead_id", "p_studio_id"),
    "create_client_decision": (
        "p_blocked_ffe_item_ids", "p_blocked_task_ids", "p_decision_id",
        "p_options", "p_payload",
    ),
    "create_draft_invoice": (
        "p_expected_client_id", "p_expected_designer_id", "p_expected_studio_id",
        "p_internal_notes", "p_lines", "p_memo", "p_payment_terms_days",
        "p_project_id", "p_tax_rate",
    ),
    "open_project_direct": (
        "p_budget_max_cents", "p_budget_min_cents", "p_designer_client_id",
        "p_id", "p_start_date", "p_studio_id", "p_title",
    ),
    "set_document_client": (
        "p_client_id", "p_designer_client_id", "p_engagement_kind", "p_target_id",
    ),
}

GENERATED_COMPOSITE_RETURN_EXPECTATIONS = {
    "proposals": 7,
    "client_decisions": 15,
}

MANUAL_WRITER_PROFILES: dict[str, dict[str, Any]] = {
    "public.begin_direction_from_discovery(uuid)": {
        "canonical_regprocedure": "public.begin_direction_from_discovery(uuid)",
        "arguments_with_defaults": "p_designer_client_id uuid",
        "source_definition": {
            "path": "supabase/migrations/00414_design_services_rail_completion.sql",
            "line": 57,
            "file_sha256": "49a530e39119ae35d88b971ce9efc1cbb3cfbef86d283cb9aa77e3424797638d",
        },
        "allowed_roles": ["authenticated"],
        "profile": {
            "owner": "postgres",
            "language": "plpgsql",
            "kind": "f",
            "security_definer": False,
            "leakproof": False,
            "strict": False,
            "parallel": "u",
            "volatility": "v",
            "returns_set": False,
            "result": "uuid",
            "source_config": ["search_path=public, pg_temp"],
            "final_config": ["search_path=public, pg_temp"],
            "body_sha256": "ca39d9053704df9f76c98c60d3b89a2958199f28b39d07ae754442b499a9cd65",
            "body_octets": 4582,
        },
        "evidence": {
            "references": [
                "packages/supabase/src/hooks/use-discovery.ts:182",
                "supabase/migrations/00414_design_services_rail_completion.sql:57",
            ]
        },
    }
}

EXTRA_WRITER_REPLACEMENTS: dict[str, tuple[tuple[str, str], ...]] = {
    "public.begin_direction_from_discovery(uuid)": (
        (
            "  select * into v_dc from designer_clients where id = p_designer_client_id;",
            "  select * into v_dc from designer_clients where id = p_designer_client_id;\n"
            "  if not found or v_dc.studio_id is null then\n"
            "    raise exception 'discovery relationship has no exact studio snapshot'\n"
            "      using errcode = 'check_violation';\n"
            "  end if;",
        ),
        (
            "    designer_id, client_id, designer_client_id, title, status, description,\n"
            "    document_kind, commercial_state",
            "    designer_id, client_id, designer_client_id, studio_id, title, status, description,\n"
            "    document_kind, commercial_state",
        ),
        (
            "    p_designer_client_id,\n"
            "    coalesce(nullif(v_dc.client_name, ''), 'New proposal'),",
            "    p_designer_client_id,\n"
            "    v_dc.studio_id,\n"
            "    coalesce(nullif(v_dc.client_name, ''), 'New proposal'),",
        ),
    ),
    "public.ceremony_complete(uuid,text,jsonb,text,text,text)": (
        (
            "SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;",
            "SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;",
        ),
        (
            "  IF NOT FOUND OR v_lead.designer_id IS DISTINCT FROM v_uid THEN",
            "  IF NOT FOUND OR v_lead.studio_id IS NULL\n"
            "     OR v_lead.designer_id IS DISTINCT FROM v_uid THEN\n"
            "    RAISE EXCEPTION 'not_authorized' USING DETAIL = p_lead_id::text;\n"
            "  END IF;\n\n"
            "  PERFORM relationship.id\n"
            "  FROM designer_clients AS relationship\n"
            "  WHERE relationship.designer_id = v_uid\n"
            "    AND relationship.studio_id = v_lead.studio_id\n"
            "    AND relationship.lead_id = p_lead_id\n"
            "    AND relationship.status = 'lead'\n"
            "  ORDER BY relationship.id\n"
            "  FOR UPDATE;\n\n"
            "  IF NOT public._can_author_studio_snapshot(v_lead.studio_id, v_uid) THEN",
        ),
        (
            "  SELECT * INTO v_dc FROM designer_clients\n"
            "   WHERE designer_id = v_uid AND lead_id = p_lead_id AND status = 'lead'\n"
            "   ORDER BY created_at LIMIT 1;\n\n"
            "  IF NOT FOUND THEN\n"
            "    SELECT * INTO v_dc FROM designer_clients\n"
            "     WHERE designer_id = v_uid AND client_id = v_lead.homeowner_id\n"
            "       AND status = 'lead' AND lead_id IS NULL\n"
            "     ORDER BY created_at LIMIT 1;\n\n"
            "    IF FOUND THEN\n"
            "      UPDATE designer_clients\n"
            "         SET lead_id     = p_lead_id,\n"
            "             client_name = COALESCE(client_name, v_client_name),\n"
            "             source      = COALESCE(source, 'design_request'),\n"
            "             updated_at  = now()\n"
            "       WHERE id = v_dc.id\n"
            "       RETURNING * INTO v_dc;\n"
            "    ELSE\n"
            "      INSERT INTO designer_clients (designer_id, client_id, client_name, source, lead_id, status)\n"
            "      VALUES (v_uid, v_lead.homeowner_id, v_client_name, 'design_request', p_lead_id, 'lead')\n"
            "      RETURNING * INTO v_dc;\n"
            "    END IF;\n"
            "  END IF;",
            "  SELECT relationship.* INTO v_dc\n"
            "  FROM designer_clients AS relationship\n"
            "  WHERE relationship.designer_id = v_uid\n"
            "    AND relationship.studio_id = v_lead.studio_id\n"
            "    AND relationship.lead_id = p_lead_id\n"
            "    AND relationship.status = 'lead'\n"
            "  FOR UPDATE;\n\n"
            "  IF NOT FOUND THEN\n"
            "    INSERT INTO designer_clients (\n"
            "      designer_id, client_id, studio_id, client_name, source, lead_id, status\n"
            "    ) VALUES (\n"
            "      v_uid, v_lead.homeowner_id, v_lead.studio_id, v_client_name,\n"
            "      'design_request', p_lead_id, 'lead'\n"
            "    )\n"
            "    RETURNING * INTO v_dc;\n"
            "  END IF;",
        ),
    ),
    "public.reassign_project_lead(uuid,uuid,uuid)": (
        (
            "  SELECT organization.id INTO v_studio_id\n"
            "    FROM public.organizations AS organization\n"
            "    JOIN public.organization_members AS old_membership\n"
            "      ON old_membership.organization_id = organization.id\n"
            "    JOIN public.organization_members AS new_membership\n"
            "      ON new_membership.organization_id = organization.id\n"
            "    WHERE organization.id = v_project.studio_id\n"
            "      AND old_membership.user_id = v_project.designer_id\n"
            "      AND old_membership.status = 'active'\n"
            "      AND old_membership.role <> 'guest'\n"
            "      AND new_membership.user_id = p_new_designer_id\n"
            "      AND new_membership.status = 'active'\n"
            "      AND new_membership.role <> 'guest'\n"
            "      AND organization.type = 'design_studio'\n"
            "      AND organization.status = 'active'\n"
            "      AND (\n"
            "        v_actor = v_project.designer_id\n"
            "        OR EXISTS (\n"
            "          SELECT 1\n"
            "          FROM public.organization_members AS actor_membership\n"
            "          WHERE actor_membership.organization_id = organization.id\n"
            "            AND actor_membership.user_id = v_actor\n"
            "            AND actor_membership.status = 'active'\n"
            "            AND actor_membership.role IN ('owner', 'admin')\n"
            "        )\n"
            "      )\n"
            "    ORDER BY organization.id\n"
            "    LIMIT 1;\n\n"
            "  IF v_studio_id IS NULL\n"
            "     OR NOT EXISTS (\n"
            "       SELECT 1 FROM public.profiles\n"
            "       WHERE id = p_new_designer_id AND is_designer IS TRUE\n"
            "     )\n"
            "  THEN\n"
            "    RAISE EXCEPTION\n"
            "      'lead reassignment requires the current lead or an exact-studio owner/admin and an active designer target'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;",
            "  v_studio_id := v_project.studio_id;\n"
            "  -- Lock every existing snapshot row this reassignment can mutate,\n"
            "  -- in stable row-id order, before either target or actor authority.\n"
            "  PERFORM relationship.id\n"
            "  FROM public.designer_clients AS relationship\n"
            "  WHERE relationship.id IN (\n"
            "    SELECT proposal.designer_client_id\n"
            "    FROM public.proposals AS proposal\n"
            "    WHERE v_project.proposal_id IS NOT NULL\n"
            "      AND proposal.id = v_project.proposal_id\n"
            "      AND proposal.studio_id = v_studio_id\n"
            "    UNION\n"
            "    SELECT incumbent.id\n"
            "    FROM public.designer_clients AS incumbent\n"
            "    WHERE v_project.proposal_id IS NULL\n"
            "      AND incumbent.studio_id = v_studio_id\n"
            "      AND incumbent.designer_id = v_project.designer_id\n"
            "      AND incumbent.client_id = v_project.client_id\n"
            "      AND incumbent.status <> 'lead'\n"
            "    UNION\n"
            "    SELECT destination.id\n"
            "    FROM public.designer_clients AS destination\n"
            "    WHERE destination.studio_id = v_studio_id\n"
            "      AND destination.designer_id = p_new_designer_id\n"
            "      AND destination.client_id = v_project.client_id\n"
            "      AND destination.status <> 'lead'\n"
            "  )\n"
            "  ORDER BY relationship.id\n"
            "  FOR UPDATE;\n\n"
            "  PERFORM decision.id\n"
            "  FROM public.client_decisions AS decision\n"
            "  WHERE decision.project_id = p_project_id\n"
            "    AND decision.linked_proposal_id IS NULL\n"
            "  ORDER BY decision.id\n"
            "  FOR UPDATE;\n\n"
            "  IF v_studio_id IS NULL\n"
            "     OR NOT public._lock_designer_studio_authority(v_studio_id, p_new_designer_id)\n"
            "     OR NOT public._can_author_studio_snapshot(v_studio_id, v_actor)\n"
            "     OR NOT (\n"
            "       v_actor = v_project.designer_id\n"
            "       OR EXISTS (\n"
            "         SELECT 1\n"
            "         FROM public.organization_members AS actor_membership\n"
            "         WHERE actor_membership.organization_id = v_studio_id\n"
            "           AND actor_membership.user_id = v_actor\n"
            "           AND actor_membership.status = 'active'\n"
            "           AND actor_membership.role IN ('owner', 'admin')\n"
            "       )\n"
            "     )\n"
            "  THEN\n"
            "    RAISE EXCEPTION\n"
            "      'lead reassignment requires the current lead or an exact-studio owner/admin and an active designer target'\n"
            "      USING ERRCODE = 'insufficient_privilege';\n"
            "  END IF;",
        ),
        (
            "  SELECT * INTO v_old_relationship\n"
            "  FROM public.designer_clients\n"
            "  WHERE (\n"
            "      v_project.proposal_id IS NOT NULL\n"
            "      AND id = (\n"
            "        SELECT proposal.designer_client_id\n"
            "        FROM public.proposals AS proposal\n"
            "        WHERE proposal.id = v_project.proposal_id\n"
            "      )\n"
            "    ) OR (\n"
            "      v_project.proposal_id IS NULL\n"
            "      AND designer_id = v_project.designer_id\n"
            "      AND client_id = v_project.client_id\n"
            "    )\n"
            "  ORDER BY (status <> 'lead') DESC, created_at, id\n"
            "  LIMIT 1\n"
            "  FOR UPDATE;",
            "  IF v_project.proposal_id IS NOT NULL THEN\n"
            "    SELECT relationship.* INTO v_old_relationship\n"
            "    FROM public.proposals AS proposal\n"
            "    JOIN public.designer_clients AS relationship\n"
            "      ON relationship.id = proposal.designer_client_id\n"
            "    WHERE proposal.id = v_project.proposal_id\n"
            "      AND proposal.studio_id = v_studio_id\n"
            "      AND relationship.studio_id = v_studio_id\n"
            "      AND relationship.designer_id = v_project.designer_id\n"
            "    FOR UPDATE OF relationship;\n"
            "  ELSE\n"
            "    SELECT relationship.* INTO v_old_relationship\n"
            "    FROM public.designer_clients AS relationship\n"
            "    WHERE relationship.studio_id = v_studio_id\n"
            "      AND relationship.designer_id = v_project.designer_id\n"
            "      AND relationship.client_id = v_project.client_id\n"
            "      AND relationship.status <> 'lead'\n"
            "    FOR UPDATE;\n"
            "  END IF;",
        ),
        (
            "    designer_id, client_id, client_name, client_email, nickname,\n"
            "    status, source, first_project_at, last_project_at",
            "    designer_id, client_id, studio_id, client_name, client_email, nickname,\n"
            "    status, source, first_project_at, last_project_at",
        ),
        (
            "    p_new_designer_id, v_project.client_id,\n"
            "    v_old_relationship.client_name, v_old_relationship.client_email,",
            "    p_new_designer_id, v_project.client_id, v_studio_id,\n"
            "    v_old_relationship.client_name, v_old_relationship.client_email,",
        ),
        (
            "  ON CONFLICT (designer_id, client_id)\n"
            "    WHERE client_id IS NOT NULL AND status <> 'lead'",
            "  ON CONFLICT (studio_id, designer_id, client_id)\n"
            "    WHERE studio_id IS NOT NULL AND client_id IS NOT NULL AND status <> 'lead'",
        ),
    ),
    "public.submit_design_request(uuid[],text,uuid,text,text,text,uuid,text,uuid)": (
        (
            "  v_dc_designers uuid[];",
            "  v_relationship designer_clients%ROWTYPE;\n"
            "  v_candidate designer_clients%ROWTYPE;\n"
            "  v_relationship_count integer := 0;",
        ),
        (
            "  IF v_designer_id IS NOT NULL\n"
            "     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_designer_id AND p.is_designer) THEN\n"
            "    RAISE EXCEPTION 'designer_not_found' USING DETAIL = v_designer_id::text;\n"
            "  END IF;",
            "  IF v_designer_id IS NOT NULL THEN\n"
            "    FOR v_candidate IN\n"
            "      SELECT dc.*\n"
            "      FROM designer_clients AS dc\n"
            "      WHERE dc.client_id = v_uid\n"
            "        AND dc.designer_id = v_designer_id\n"
            "        AND dc.status = 'active'\n"
            "        AND dc.studio_id IS NOT NULL\n"
            "      ORDER BY dc.id\n"
            "      FOR SHARE\n"
            "    LOOP\n"
            "      v_relationship_count := v_relationship_count + 1;\n"
            "      v_relationship := v_candidate;\n"
            "    END LOOP;\n"
            "    IF v_relationship_count IS DISTINCT FROM 1 THEN\n"
            "      RAISE EXCEPTION 'designer_not_found_or_ambiguous'\n"
            "        USING DETAIL = v_designer_id::text;\n"
            "    END IF;\n"
            "  END IF;",
        ),
        (
            "  IF v_designer_id IS NULL THEN\n"
            "    SELECT array_agg(DISTINCT dc.designer_id) INTO v_dc_designers\n"
            "    FROM designer_clients dc\n"
            "    WHERE dc.client_id = v_uid AND dc.status = 'active';\n\n"
            "    IF array_length(v_dc_designers, 1) = 1 THEN\n"
            "      v_designer_id := v_dc_designers[1];\n"
            "    END IF;\n"
            "  END IF;",
            "  -- A NULL target remains a quarantined unassigned intake.  It\n"
            "  -- is never auto-bound from a current/first membership or pair.\n"
            "  -- A non-NULL target was bound above to exactly one locked,\n"
            "  -- already-snapshotted active relationship.",
        ),
        (
            "      homeowner_id, designer_id, project_type, project_description,",
            "      homeowner_id, designer_id, studio_id, project_type, project_description,",
        ),
        (
            "      v_uid, v_designer_id, p_project_type, p_description,",
            "      v_uid, v_designer_id,\n"
            "      CASE WHEN v_designer_id IS NULL THEN NULL ELSE v_relationship.studio_id END,\n"
            "      p_project_type, p_description,",
        ),
    ),
}


class RenderError(RuntimeError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RenderError(message)


def sql_regression_contract() -> list[dict[str, Any]]:
    canonical = CANONICAL_SQL_REGRESSION.read_text(encoding="utf-8")
    required_cases = (
        "$paired_authority$",
        "$legacy_null_owner_only$",
        "$snapshot_writer_guards$",
        "$snapshot_parent_mismatch$",
        "$open_project_workspace$",
        "$phase_template_workspace$",
        "$next_request_revocation$",
        "$policy_anti_extra$",
        "$bounded_revocation_races$",
        "designer-role revocation",
        "membership revocation",
        "organization revocation",
        "dblink_send_query",
        "studio_snapshot_parent_mismatch",
        "studio_snapshot_immutable",
        "p_designer_client_id =>",
        "same-workspace idempotent retry",
        "legacy NULL owner authoring must not be rebound",
        "role-removed owner must be denied by representative snapshot author DML",
        "representative author DML precondition is false",
        "pg_blocking_pids",
        "target-first snapshot DML must fail bounded on a locked parent",
        "snapshot/root policy relations must keep exact RLS enforcement",
        "policy.polpermissive",
        "snapshot-table permissive policy name universe has an extra or omission",
        "extensions.digest",
    )
    for token in required_cases:
        require(token in canonical, f"canonical SQL regression lost {token}")
    require(
        canonical.count("public._can_author_studio_snapshot(") >= 11,
        "canonical SQL regression lost paired author/revocation probes",
    )

    intake = DESIGN_REQUEST_SQL_REGRESSION.read_text(encoding="utf-8")
    for token in (
        "roomless intake must remain quarantined",
        "current relationship must not infer a studio",
        "public.claim_design_request(",
        "claim atomically freezes the explicit studio",
    ):
        require(token in intake, f"design-request SQL regression lost {token}")
    require("expected no_scans" not in intake, "obsolete roomless denial test survived")
    return [
        {
            "path": str(CANONICAL_SQL_REGRESSION.relative_to(ROOT)),
            "sha256": digest(canonical.encode("utf-8")),
            "case_count": 11,
        },
        {
            "path": str(DESIGN_REQUEST_SQL_REGRESSION.relative_to(ROOT)),
            "sha256": digest(intake.encode("utf-8")),
            "case_count": 12,
        },
    ]


def load_review() -> dict[str, Any]:
    review_bytes = REVIEW.read_bytes()
    findings_bytes = FINDINGS.read_bytes()
    require(digest(review_bytes) == REVIEW_SHA256, "review artifact hash drifted")
    require(digest(findings_bytes) == FINDINGS_SHA256, "findings artifact hash drifted")
    document = json.loads(review_bytes)
    counts = document["validated_counts"]
    require(len(document["live_policies"]) == 193, "expected 193 live policies")
    require(len(document["live_routines"]) == 166, "expected 166 live routines")
    require(len(document["live_views"]) == 1, "expected one live view")
    require(len(document["already_dispositioned"]["routines"]) == 14, "expected 14 routine dispositions")
    require(len(document["already_dispositioned"]["policies"]) == 4, "expected four policy dispositions")
    ids = [row["record_id"] for key in ("live_policies", "live_routines", "live_views") for row in document[key]]
    ids += [row["record_id"] for key in ("routines", "policies") for row in document["already_dispositioned"][key]]
    require(len(ids) == counts["unique_record_ids"] == 378, "expected 378 reviewed record ids")
    require(len(ids) == len(set(ids)), "reviewed record ids contain duplicates")
    routine_signatures = [
        row["canonical_regprocedure"]
        for group in (document["live_routines"], document["already_dispositioned"]["routines"])
        for row in group
    ]
    require(
        len(routine_signatures) == len(set(routine_signatures)),
        "reviewed routine signatures contain duplicates",
    )
    storage = [row for row in document["live_policies"] if row["relation"] == "storage.objects"]
    require(len(storage) == counts["storage_objects_platform_handoffs"] == 9, "expected nine storage handoffs")
    return document


def load_policy_catalog_expressions(
    document: dict[str, Any],
) -> dict[str, dict[str, str | None]]:
    """Load the exact PG17 source-catalog deparses for the reviewed policies."""
    public_payload = PUBLIC_POLICY_CATALOG_SNAPSHOT.read_bytes()
    storage_payload = STORAGE_POLICY_CATALOG_SNAPSHOT.read_bytes()
    require(
        digest(public_payload) == PUBLIC_POLICY_CATALOG_SNAPSHOT_SHA256,
        "public policy catalog snapshot hash drifted",
    )
    require(
        digest(storage_payload) == STORAGE_POLICY_CATALOG_SNAPSHOT_SHA256,
        "storage policy catalog snapshot hash drifted",
    )
    result: dict[str, dict[str, str | None]] = {}
    for row in json.loads(public_payload):
        key = f"{row['schemaname']}.{row['tablename']}:{row['policyname']}"
        require(key not in result, f"duplicate public policy catalog row: {key}")
        result[key] = {
            "qual": row["qual"],
            "with_check": row["with_check"],
        }
    for row in json.loads(storage_payload):
        key = f"storage.objects:{row['policyname']}"
        require(key not in result, f"duplicate storage policy catalog row: {key}")
        result[key] = {
            "qual": row["qual"],
            "with_check": row["with_check"],
        }

    reviewed: dict[str, dict[str, str | None]] = {}
    projected = 0
    for row in document["live_policies"]:
        key = f"{row['relation']}:{row['policy']}"
        expressions = POST_SNAPSHOT_POLICY_CATALOG_EXPRESSIONS.get(key)
        if expressions is not None:
            projected += 1
        else:
            expressions = result.get(key)
        require(expressions is not None, f"missing policy catalog source row: {key}")
        require(key not in reviewed, f"duplicate reviewed policy catalog row: {key}")
        reviewed[key] = dict(expressions)
    require(len(reviewed) == 193, "reviewed policy catalog universe is not 193")
    require(projected == 15, "post-snapshot policy catalog universe is not 15")
    return reviewed


def load_affected_policy_compatibility() -> list[dict[str, Any]]:
    """Pin surviving owner/client legs on canonical snapshot/root tables."""
    payload = PUBLIC_POLICY_CATALOG_SNAPSHOT.read_bytes()
    require(
        digest(payload) == PUBLIC_POLICY_CATALOG_SNAPSHOT_SHA256,
        "public policy catalog snapshot hash drifted",
    )
    indexed = {
        (f"{row['schemaname']}.{row['tablename']}", row["policyname"]): row
        for row in json.loads(payload)
    }
    require(len(indexed) == 750, "public policy snapshot key universe drifted")
    result: list[dict[str, Any]] = []
    for relation, policy_name in AFFECTED_POLICY_COMPATIBILITY:
        row = indexed.get((relation, policy_name))
        require(
            row is not None,
            f"affected compatibility policy snapshot is missing: {relation}:{policy_name}",
        )
        role_text = row["roles"]
        require(
            role_text.startswith("{") and role_text.endswith("}"),
            f"affected compatibility roles malformed: {relation}:{policy_name}",
        )
        roles = [
            role for role in role_text[1:-1].split(",") if role
        ]
        expressions = {
            "qual": row["qual"],
            "with_check": row["with_check"],
        }
        result.append({
            "relation": relation,
            "policy": policy_name,
            "operation": row["cmd"],
            "roles": roles,
            "permissive": True,
            "source_catalog_qual": expressions["qual"],
            "source_catalog_with_check": expressions["with_check"],
            "final_catalog_qual": expressions["qual"],
            "final_catalog_with_check": expressions["with_check"],
            "source_catalog_fingerprint": policy_fingerprint(expressions),
            "final_catalog_fingerprint": policy_fingerprint(expressions),
            "source_present": True,
            "final_present": True,
            "disposition": "exact_owner_client_compatibility_preserved",
        })
    require(
        len(result) == len(AFFECTED_POLICY_COMPATIBILITY) == 20,
        "affected policy compatibility universe is not 20",
    )
    return result


def load_routine_profiles() -> dict[str, dict[str, Any]]:
    payload = PUBLIC_ROUTINE_CONTRACT.read_bytes()
    require(digest(payload) == PUBLIC_ROUTINE_CONTRACT_SHA256, "public routine profile contract hash drifted")
    document = json.loads(payload)
    rows = [
        *document["routines"],
        *document["dependent_private"]["routines"],
        *document["dependent_invokers"],
    ]
    mapping = {row["canonical_regprocedure"]: row for row in rows}
    require(len(mapping) == len(rows), "public routine profile contract contains duplicate signatures")
    return mapping


def source_text(row: dict[str, Any]) -> tuple[Path, str]:
    source = row["source"]
    root = SOURCE_ROOTS[source["source_root"]]
    path = root / source["path"]
    payload = path.read_bytes()
    require(digest(payload) == source["file_sha256"], f"source hash drifted: {path}")
    return path, payload.decode("utf-8")


FUNCTION_START = re.compile(
    r"(?im)^CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+"
    r"(?:(?P<schema>[A-Za-z_][A-Za-z0-9_]*)\.)?"
    r"(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\("
)
DOLLAR_TAG_PATTERN = (
    r"\$(?:[A-Za-z_\u0080-\U0010FFFF]"
    r"[A-Za-z0-9_\u0080-\U0010FFFF]*)?\$"
)


def function_fragments(source: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for match in FUNCTION_START.finditer(source):
        tail = source[match.start():]
        marker = re.search(rf"(?is)\bAS\s+({DOLLAR_TAG_PATTERN})", tail)
        if marker is None:
            continue
        tag = marker.group(1)
        body_start = marker.end()
        body_end = tail.find(tag, body_start)
        if body_end < 0:
            continue
        semicolon = tail.find(";", body_end + len(tag))
        require(semicolon >= 0, f"unterminated function {match.group('name')}")
        fragment = tail[:semicolon + 1]
        body = tail[body_start:body_end]
        rows.append({
            "schema": match.group("schema") or "public",
            "name": match.group("name"),
            "fragment": fragment,
            "body": body,
            "body_sha256": digest(body.encode("utf-8")),
            "line": source.count("\n", 0, match.start()) + 1,
        })
    return rows


def load_final_00485_fragments() -> dict[str, dict[str, Any]]:
    payload = FINAL_00485.read_bytes()
    require(digest(payload) == FINAL_00485_SHA256, "frozen final 00485 hash drifted")
    parsed = function_fragments(payload.decode("utf-8"))
    result: dict[str, dict[str, Any]] = {}
    for signature, expected_body in FINAL_00485_ROUTINES.items():
        schema, remainder = signature.split(".", 1)
        name = remainder.split("(", 1)[0]
        matches = [
            row for row in parsed
            if row["schema"] == schema
            and row["name"] == name
            and row["body_sha256"] == expected_body
        ]
        require(len(matches) == 1, f"{signature}: frozen final 00485 body is not unique")
        result[signature] = matches[0]
    require(len(result) == 25, "frozen final 00485 routine overlay is not exactly 25")
    return result


def extract_function(row: dict[str, Any]) -> dict[str, Any]:
    _, source = source_text(row)
    schema_name = row["canonical_regprocedure"].split(".", 1)
    schema, rest = schema_name
    name = rest.split("(", 1)[0]
    matches = [
        item for item in function_fragments(source)
        if item["schema"] == schema and item["name"] == name and item["body_sha256"] == row["body_sha256"]
    ]
    require(len(matches) == 1, f"{row['canonical_regprocedure']}: expected one exact source body, found {len(matches)}")
    return matches[0]


def extract_profile_function(profile_row: dict[str, Any]) -> dict[str, Any]:
    source = profile_row["source_definition"]
    path = ROOT / source["path"]
    payload = path.read_bytes()
    require(digest(payload) == source["file_sha256"], f"writer source hash drifted: {path}")
    schema, rest = profile_row["canonical_regprocedure"].split(".", 1)
    name = rest.split("(", 1)[0]
    matches = [
        item for item in function_fragments(payload.decode("utf-8"))
        if item["schema"] == schema
        and item["name"] == name
        and item["body_sha256"] == profile_row["profile"]["body_sha256"]
    ]
    require(
        len(matches) == 1,
        f"{profile_row['canonical_regprocedure']}: expected one exact writer source body",
    )
    return matches[0]


def extract_rollback_source_surface(profile_row: dict[str, Any]) -> dict[str, Any]:
    signature = profile_row["canonical_regprocedure"]
    if signature != "public.open_project_direct(text,uuid,integer,integer,date,uuid)":
        return extract_profile_function(profile_row)

    payload = ROLLBACK_OPEN_PROJECT_SOURCE.read_bytes()
    require(
        digest(payload) == ROLLBACK_OPEN_PROJECT_SOURCE_SHA256,
        "frozen rollback open_project_direct source hash drifted",
    )
    matches = [
        item for item in function_fragments(payload.decode("utf-8"))
        if item["schema"] == "public"
        and item["name"] == "open_project_direct"
        and item["body_sha256"] == profile_row["profile"]["body_sha256"]
    ]
    require(
        len(matches) == 1,
        "public.open_project_direct(text,uuid,integer,integer,date,uuid): "
        "frozen rollback source body is not exact",
    )
    return matches[0]


def transform_extra_writer(
    profile_row: dict[str, Any], extracted: dict[str, Any]
) -> tuple[str, str]:
    signature = profile_row["canonical_regprocedure"]
    fragment = extracted["fragment"]
    for source_value, replacement in EXTRA_WRITER_REPLACEMENTS.get(signature, ()):
        require(
            fragment.count(source_value) == 1,
            f"{signature}: extra-writer replacement source must occur exactly once",
        )
        fragment = fragment.replace(source_value, replacement, 1)
    fragment = re.sub(
        r"(?im)^CREATE\s+FUNCTION\b",
        "CREATE OR REPLACE FUNCTION",
        fragment,
        count=1,
    )
    parsed = function_fragments(fragment)
    require(len(parsed) == 1, f"{signature}: transformed writer body extraction failed")
    return fragment, parsed[0]["body_sha256"]


def dynamic_invoice_core_disposition(
    profile_contract: dict[str, dict[str, Any]],
) -> tuple[str, str, dict[str, Any]]:
    """Replace the one source-only dynamic/helper core with a static core.

    The source contract records the post-rename signature but points at the
    original ``void_invoice`` definition, so extraction is deliberately by
    the pinned body hash and the header is renamed explicitly.
    """
    profile_row = profile_contract[DYNAMIC_INVOICE_CORE]
    source = profile_row["source_definition"]
    path = ROOT / source["path"]
    payload = path.read_bytes()
    require(
        digest(payload) == source["file_sha256"],
        f"dynamic invoice source hash drifted: {path}",
    )
    matches = [
        item for item in function_fragments(payload.decode("utf-8"))
        if item["body_sha256"] == DYNAMIC_INVOICE_SOURCE_SHA256
    ]
    require(len(matches) == 1, "dynamic invoice source body is not unique")
    extracted = matches[0]
    source_fragment = re.sub(
        r"(?im)^(CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.)void_invoice(\s*\()",
        r"\1_void_invoice_authorized_legacy_00397\2",
        extracted["fragment"],
        count=1,
    )
    require(
        source_fragment != extracted["fragment"],
        "dynamic invoice source header rename failed",
    )

    owner_check = (
        "  IF NOT FOUND OR NOT public.is_studio_comember(v_invoice.designer_id) THEN\n"
        "    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;\n"
        "  END IF;"
    )
    static_missing_check = (
        "  IF NOT FOUND THEN\n"
        "    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;\n"
        "  END IF;"
    )
    dynamic_update = (
        "  IF to_regclass('public.project_time_entries') IS NOT NULL THEN\n"
        "    EXECUTE 'UPDATE public.project_time_entries SET invoice_id = NULL WHERE invoice_id = $1'\n"
        "    USING p_invoice_id;\n"
        "  END IF;"
    )
    static_update = (
        "  UPDATE public.project_time_entries\n"
        "  SET invoice_id = NULL\n"
        "  WHERE invoice_id = p_invoice_id;"
    )
    require(source_fragment.count(owner_check) == 1, "dynamic invoice owner check drifted")
    require(source_fragment.count(dynamic_update) == 1, "dynamic invoice update drifted")
    final_fragment = source_fragment.replace(owner_check, static_missing_check, 1)
    final_fragment = final_fragment.replace(dynamic_update, static_update, 1)
    final_fragment = final_fragment.replace(
        "SET search_path = public, pg_temp",
        "SET search_path = pg_catalog, public, pg_temp",
        1,
    )
    parsed = function_fragments(final_fragment)
    require(len(parsed) == 1, "static invoice core extraction failed")
    require(
        not dynamic_forbidden_call(final_fragment, "is_studio_comember"),
        "static invoice core retained dynamic SQL",
    )
    require(
        not find_calls(final_fragment, "is_studio_comember"),
        "static invoice core retained legacy owner authority",
    )

    source_profile = dict(profile_row["profile"])
    source_profile["pre_00484_config"] = source_profile.get("source_config")
    source_profile["source_config"] = source_profile["final_config"]
    source_profile["body_octets"] = len(extracted["body"].encode("utf-8"))
    final_profile = dict(profile_row["profile"])
    final_profile["body_sha256"] = parsed[0]["body_sha256"]
    final_profile["body_octets"] = len(parsed[0]["body"].encode("utf-8"))
    manifest = {
        "record_id": "dynamic-routine:" + DYNAMIC_INVOICE_CORE,
        "canonical_regprocedure": DYNAMIC_INVOICE_CORE,
        "dependency_kind": "source_dynamic_routine_disposition",
        "source_body_sha256": DYNAMIC_INVOICE_SOURCE_SHA256,
        "final_body_sha256": parsed[0]["body_sha256"],
        "source": source,
        "roles": profile_row["allowed_roles"],
        "allowed_roles": profile_row["allowed_roles"],
        "security_definer": profile_row["profile"]["security_definer"],
        "source_arguments_with_defaults": profile_row["arguments_with_defaults"],
        "arguments_with_defaults": profile_row["arguments_with_defaults"],
        "source_profile": source_profile,
        "profile": final_profile,
        "trigger_bindings": [],
        "caller_evidence": profile_row["evidence"]["references"],
        "source_authority_calls": helper_call_profile(
            source_fragment, SOURCE_AUTHORITY_HELPERS
        ),
        "disposition": "source_dynamic_core_rewritten_static_internal",
    }
    final_sql = (
        final_fragment
        + f"\nALTER FUNCTION {DYNAMIC_INVOICE_CORE} "
          "SET search_path = pg_catalog, public, pg_temp;"
    )
    return source_fragment, final_sql, manifest


def reviewed_dynamic_routine_contract(
    profile_contract: dict[str, dict[str, Any]],
    invoice_core: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for signature, expected_sha256 in sorted(PERSISTENT_DYNAMIC_ROUTINES.items()):
        profile_row = profile_contract.get(signature)
        require(profile_row is not None, f"{signature}: dynamic profile missing")
        extracted = extract_profile_function(profile_row)
        require(
            extracted["body_sha256"] == expected_sha256,
            f"{signature}: reviewed dynamic body drifted",
        )
        require(
            has_real_dynamic_execute(extracted["fragment"]),
            f"{signature}: reviewed dynamic body has no real EXECUTE",
        )
        composed = dict(profile_row["profile"])
        composed["config"] = composed["final_config"]
        composed["body_sha256"] = expected_sha256
        composed["body_octets"] = len(extracted["body"].encode("utf-8"))
        rows.append({
            "canonical_regprocedure": signature,
            "arguments_with_defaults": profile_row["arguments_with_defaults"],
            "allowed_roles": profile_row["allowed_roles"],
            "source_profile": composed,
            "profile": composed,
            "source_dynamic": True,
            "final_dynamic": True,
            "source": profile_row["source_definition"],
            "caller_evidence": profile_row["evidence"]["references"],
            "disposition": "hash_pinned_dynamic_domain_preserved",
        })

    source_profile = dict(invoice_core["source_profile"])
    source_profile["config"] = source_profile["source_config"]
    final_profile = dict(invoice_core["profile"])
    final_profile["config"] = final_profile["final_config"]
    rows.append({
        "canonical_regprocedure": DYNAMIC_INVOICE_CORE,
        "arguments_with_defaults": invoice_core["arguments_with_defaults"],
        "allowed_roles": invoice_core["allowed_roles"],
        "source_profile": source_profile,
        "profile": final_profile,
        "source_dynamic": True,
        "final_dynamic": False,
        "source": invoice_core["source"],
        "caller_evidence": invoice_core["caller_evidence"],
        "disposition": "source_dynamic_core_rewritten_static_internal",
    })
    rows.sort(key=lambda row: row["canonical_regprocedure"])
    require(len(rows) == 5, "reviewed source dynamic universe is not exactly five")
    require(
        sum(row["final_dynamic"] for row in rows) == 4,
        "reviewed final dynamic universe is not exactly four",
    )
    return rows


def compatibility_core_sql(
    profile_contract: dict[str, dict[str, Any]],
) -> list[str]:
    specs = (
        (
            "public.claim_design_request(uuid)",
            "claim_design_request",
            "_claim_design_request_00488_core",
            "  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_uid AND p.is_designer) THEN\n"
            "    RAISE EXCEPTION 'not_designer' USING DETAIL = v_uid::text;\n"
            "  END IF;\n\n",
        ),
        (
            "public.accept_design_request(uuid)",
            "accept_design_request",
            "_accept_design_request_00488_core",
            "  IF NOT EXISTS (\n"
            "    SELECT 1 FROM public.profiles\n"
            "    WHERE id = v_actor AND is_designer IS TRUE\n"
            "  ) THEN\n"
            "    RAISE EXCEPTION 'not_designer' USING DETAIL = v_actor::text;\n"
            "  END IF;\n",
        ),
    )
    result: list[str] = []
    for signature, source_name, final_name, profile_block in specs:
        source = extract_profile_function(profile_contract[signature])["fragment"]
        require(
            source.count(profile_block) == 1,
            f"{signature}: designer-profile compatibility block drifted",
        )
        source = source.replace(profile_block, "", 1)
        source = re.sub(
            rf"(?im)^(CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.){source_name}(\s*\()",
            rf"\1{final_name}\2",
            source,
            count=1,
        )
        source = source.replace(
            "SET search_path = public, pg_temp",
            "SET search_path = pg_catalog, public, pg_temp",
            1,
        )
        require(
            "is_designer" not in sql_code_mask(source, function_body_only=True),
            f"{signature}: profile flag survived in zero-grant compatibility core",
        )
        parsed = function_fragments(source)
        require(
            len(parsed) == 1 and parsed[0]["name"] == final_name,
            f"{signature}: compatibility core rename failed",
        )
        result.append(source)
    return result


def disposition_routine_manifests(
    document: dict[str, Any],
    profile_contract: dict[str, dict[str, Any]],
    final_00485: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row in document["already_dispositioned"]["routines"]:
        signature = row["canonical_regprocedure"]
        profile_row = profile_contract.get(signature)
        require(profile_row is not None, f"{signature}: disposition profile missing")
        if signature in final_00485:
            matches = [final_00485[signature]]
            source_descriptor = {
                "path": str(FINAL_00485.relative_to(ROOT)),
                "file_sha256": FINAL_00485_SHA256,
                "commit": FINAL_00485_COMMIT,
                "line": matches[0]["line"],
            }
        else:
            _, final_source = source_text({"source": row["final_source"]})
            matches = [
                fragment for fragment in function_fragments(final_source)
                if fragment["body_sha256"] == row["final_body_sha256"]
            ]
            require(len(matches) == 1, f"{signature}: final disposition body is not unique")
            source_descriptor = row["final_source"]
        composed_body_sha = matches[0]["body_sha256"]
        final_profile = dict(profile_row["profile"])
        final_profile["body_sha256"] = composed_body_sha
        final_profile["body_octets"] = len(matches[0]["body"].encode("utf-8"))
        final_profile["source_config"] = final_profile["final_config"]
        result.append({
            "record_id": row["record_id"],
            "canonical_regprocedure": signature,
            "dependency_kind": "already_dispositioned",
            "review_final_body_sha256": row["final_body_sha256"],
            "source_body_sha256": composed_body_sha,
            "final_body_sha256": composed_body_sha,
            "source": source_descriptor,
            "roles": profile_row["allowed_roles"],
            "allowed_roles": profile_row["allowed_roles"],
            "security_definer": profile_row["profile"]["security_definer"],
            "source_arguments_with_defaults": profile_row["arguments_with_defaults"],
            "arguments_with_defaults": profile_row["arguments_with_defaults"],
            "source_profile": final_profile,
            "profile": final_profile,
            "trigger_bindings": profile_row["bindings"]["triggers"],
            "caller_evidence": profile_row["evidence"]["references"],
            "source_authority_calls": helper_call_profile(
                matches[0]["fragment"], SOURCE_AUTHORITY_HELPERS
            ),
            "disposition": (
                "preserved_composed_00485"
                if signature in final_00485
                else "preserved_00485_00486"
            ),
        })
    return result


def normalize_expression(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def sql_identifier_continuation(character: str) -> bool:
    """Conservatively classify a PostgreSQL identifier continuation."""
    return (
        character.isalnum()
        or character in ("_", "$")
        or (bool(character) and ord(character) >= 128)
    )


def sql_code_mask(
    source: str,
    *,
    function_body_only: bool = False,
    preserve_quoted_identifiers: bool = True,
) -> str:
    """Return same-length SQL with comments and data literals blanked.

    Double-quoted identifiers remain visible when call/table attribution needs
    them.  Keyword scans blank them so a quoted ``"EXECUTE"`` identifier is
    not confused with the PL/pgSQL keyword while ``EXECUTE"sql"`` remains
    visible.  For a function fragment, the outer AS $tag$ body delimiter is
    structural and only the body is scanned; nested dollar-quoted dynamic SQL
    is data and is blanked.
    """
    scan_start = 0
    scan_end = len(source)
    if function_body_only:
        marker = re.search(rf"(?is)\bAS\s+({DOLLAR_TAG_PATTERN})", source)
        require(marker is not None, "function body delimiter missing")
        tag = marker.group(1)
        scan_start = marker.end()
        scan_end = source.find(tag, scan_start)
        require(scan_end >= 0, "function body delimiter is unterminated")

    masked = [" "] * len(source)
    index = scan_start
    block_depth = 0
    while index < scan_end:
        if block_depth:
            if source.startswith("/*", index):
                block_depth += 1
                index += 2
            elif source.startswith("*/", index):
                block_depth -= 1
                index += 2
            else:
                index += 1
            continue
        if source.startswith("--", index):
            newline = source.find("\n", index + 2, scan_end)
            index = scan_end if newline < 0 else newline
            continue
        if source.startswith("/*", index):
            block_depth = 1
            index += 2
            continue
        if source[index] == "'":
            escape_string = (
                index > scan_start
                and source[index - 1] in ("e", "E")
                and (
                    index - 1 == scan_start
                    or not sql_identifier_continuation(source[index - 2])
                )
            )
            index += 1
            string_closed = False
            while index < scan_end:
                if source[index] == "'":
                    if index + 1 < scan_end and source[index + 1] == "'":
                        index += 2
                        continue
                    index += 1
                    string_closed = True
                    break
                if escape_string and source[index] == "\\" and index + 1 < scan_end:
                    index += 2
                else:
                    index += 1
            require(string_closed, "unterminated SQL string literal")
            continue
        if source[index] == "$" and (
            index == scan_start
            or not sql_identifier_continuation(source[index - 1])
        ):
            dollar = re.match(DOLLAR_TAG_PATTERN, source[index:scan_end])
            if dollar:
                tag = dollar.group(0)
                close = source.find(tag, index + len(tag), scan_end)
                require(close >= 0, "unterminated SQL dollar literal")
                index = close + len(tag)
                continue
        if source[index] == '"':
            unicode_quoted = (
                index >= scan_start + 2
                and source[index - 2:index].lower() == "u&"
                and (
                    index == scan_start + 2
                    or not (
                        source[index - 3].isalnum()
                        or source[index - 3] in ("_", "$")
                    )
                )
            )
            require(
                not unicode_quoted,
                "Unicode-escaped SQL quoted identifier is not permitted",
            )
            # Double-quoted identifiers are code for call attribution, but
            # data for keyword recognition. Preserve escaped quote pairs only
            # in the former mask.
            if preserve_quoted_identifiers:
                masked[index] = source[index]
            index += 1
            quoted_closed = False
            while index < scan_end:
                if preserve_quoted_identifiers:
                    masked[index] = source[index]
                if source[index] == '"':
                    if index + 1 < scan_end and source[index + 1] == '"':
                        if preserve_quoted_identifiers:
                            masked[index + 1] = source[index + 1]
                        index += 2
                        continue
                    index += 1
                    quoted_closed = True
                    break
                index += 1
            require(quoted_closed, "unterminated SQL quoted identifier")
            continue
        masked[index] = source[index]
        index += 1
    require(block_depth == 0, "unterminated SQL block comment")
    return "".join(masked)


def has_real_dynamic_execute(source: str) -> bool:
    parsed = function_fragments(source)
    if parsed:
        require(len(parsed) == 1, "dynamic routine fragment is not unique")
        masked = sql_code_mask(
            source,
            function_body_only=True,
            preserve_quoted_identifiers=False,
        )
    else:
        masked = sql_code_mask(source, preserve_quoted_identifiers=False)
    return re.search(
        r"(?i)(^|[^A-Za-z0-9_$])execute([^A-Za-z0-9_$]|$)", masked
    ) is not None


def dynamic_forbidden_call(source: str, helper: str) -> bool:
    require(bool(helper), "dynamic authority token must not be empty")
    parsed = function_fragments(source)
    body_sha256 = (
        parsed[0]["body_sha256"]
        if parsed
        else digest(source.encode("utf-8"))
    )
    return (
        has_real_dynamic_execute(source)
        and body_sha256 not in REVIEWED_DYNAMIC_SOURCE_BODY_SHA256
    )


def helper_call_profile(source: str, helpers: tuple[str, ...]) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for helper in helpers:
        lexical = len(find_calls(source, helper))
        if lexical:
            # The SQL catalog gate uses the equivalent state-machine masker;
            # comments, literals, dynamic EXECUTE text, and quoted identifiers
            # therefore have the same attribution semantics as generation.
            result[helper] = {"lexical": lexical, "catalog": lexical}
    return result


def find_calls(source: str, helper: str) -> list[tuple[int, int, str]]:
    is_function = FUNCTION_START.search(source) is not None
    masked = sql_code_mask(source, function_body_only=is_function)
    ident = rf'(?:"{re.escape(helper)}"|{re.escape(helper)})'
    pattern = re.compile(
        rf'(?<![A-Za-z0-9_$])(?:(?:"public"|public)\s*\.\s*)?{ident}\s*\(',
        re.I,
    )
    result: list[tuple[int, int, str]] = []
    for match in pattern.finditer(masked):
        depth = 1
        index = match.end()
        argument_start = index
        while index < len(masked) and depth:
            char = masked[index]
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    result.append((match.start(), index + 1, source[argument_start:index]))
                    break
            index += 1
    return result


def typescript_writer_mask(
    source: str,
    preserve_literals: tuple[str, ...] = SNAPSHOT_TABLES,
) -> str:
    """Mask TS comments/data strings while retaining exact table literals.

    The result is the same length as the input.  Only string literals whose
    complete value is one of the six snapshot tables survive, so a fake call
    embedded in a comment, ordinary string, or template cannot enter the
    writer universe.
    """
    masked = list(source)
    index = 0
    while index < len(source):
        if source.startswith("//", index):
            end = source.find("\n", index + 2)
            end = len(source) if end < 0 else end
            for offset in range(index, end):
                masked[offset] = " "
            index = end
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            require(end >= 0, "unterminated TypeScript block comment")
            end += 2
            for offset in range(index, end):
                if masked[offset] != "\n":
                    masked[offset] = " "
            index = end
            continue
        if source[index] == "/":
            previous = index - 1
            while previous >= 0 and source[previous].isspace():
                previous -= 1
            # JavaScript regular-expression literals are expression starters.
            # Mask them so quotes/comment tokens inside a regex are data.
            if previous < 0 or source[previous] in "([{:;,=!?&|+*%^~<>":
                start = index
                index += 1
                in_class = False
                while index < len(source):
                    if source[index] == "\\":
                        index += 2
                        continue
                    if source[index] == "[":
                        in_class = True
                    elif source[index] == "]":
                        in_class = False
                    elif source[index] == "/" and not in_class:
                        index += 1
                        while index < len(source) and source[index].isalpha():
                            index += 1
                        break
                    index += 1
                for offset in range(start, index):
                    if masked[offset] != "\n":
                        masked[offset] = " "
                continue
        quote = source[index]
        if quote in ("'", '"', "`"):
            start = index
            index += 1
            while index < len(source):
                if source[index] == "\\":
                    index += 2
                    continue
                if source[index] == quote:
                    index += 1
                    break
                index += 1
            require(index <= len(source) and source[index - 1] == quote,
                    "unterminated TypeScript string literal")
            literal = source[start + 1:index - 1]
            preserve = quote != "`" and literal in preserve_literals
            if not preserve:
                for offset in range(start, index):
                    if masked[offset] != "\n":
                        masked[offset] = " "
            continue
        index += 1
    return "".join(masked)


def balanced_call_arguments(source: str, masked: str, open_index: int) -> tuple[str, int]:
    require(masked[open_index] == "(", "writer call has no opening parenthesis")
    depth = 1
    index = open_index + 1
    while index < len(masked):
        if masked[index] == "(":
            depth += 1
        elif masked[index] == ")":
            depth -= 1
            if depth == 0:
                return source[open_index + 1:index], index + 1
        index += 1
    raise RenderError("unterminated TypeScript writer call")


def runtime_writer_universe() -> list[dict[str, Any]]:
    roots = (ROOT / "apps", ROOT / "packages", ROOT / "supabase/functions")
    suffixes = {".ts", ".tsx", ".js", ".jsx"}
    rows: list[dict[str, Any]] = []
    dynamic_rows: list[str] = []
    static_pattern = re.compile(
        r"\.\s*from\s*\(\s*(['\"])(?P<table>"
        + "|".join(re.escape(table) for table in SNAPSHOT_TABLES)
        + r")\1\s*\)(?P<chain>[^;]{0,1600}?)"
          r"\.\s*(?P<operation>insert|upsert)\s*\(",
        re.I | re.S,
    )
    dynamic_pattern = re.compile(
        r"\.\s*from\s*\(\s*(?P<argument>[A-Za-z_$][A-Za-z0-9_$.]*)\s*\)"
        r"(?P<chain>[^;]{0,1600}?)\.\s*(?:insert|upsert)\s*\(",
        re.I | re.S,
    )
    for root in roots:
        for path in sorted(root.rglob("*")):
            if path.suffix not in suffixes or not path.is_file():
                continue
            relative = path.relative_to(ROOT).as_posix()
            if (
                "__tests__" in path.parts
                or "_tests" in path.parts
                or path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
            ):
                continue
            source = path.read_text(encoding="utf-8")
            if ".from" not in source or (".insert" not in source and ".upsert" not in source):
                continue
            static_candidate = re.search(
                r"\.\s*from\s*\(\s*(['\"])(?:"
                + "|".join(re.escape(table) for table in SNAPSHOT_TABLES)
                + r")\1",
                source,
                re.I,
            )
            dynamic_candidate = re.search(
                r"\.\s*from\s*\(\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*\)", source
            )
            if static_candidate is None and dynamic_candidate is None:
                continue
            masked = typescript_writer_mask(source)
            for match in dynamic_pattern.finditer(masked):
                dynamic_rows.append(
                    f"{relative}:{source.count(chr(10), 0, match.start()) + 1}:"
                    f"{match.group('argument')}"
                )
            for match in static_pattern.finditer(masked):
                open_index = match.end() - 1
                arguments, _ = balanced_call_arguments(source, masked, open_index)
                arguments_mask = typescript_writer_mask(arguments)
                rows.append({
                    "path": relative,
                    "line": source.count("\n", 0, match.start()) + 1,
                    "table": match.group("table").lower(),
                    "operation": match.group("operation").lower(),
                    "payload_has_studio_id": re.search(
                        r"(?<![A-Za-z0-9_$])studio_id\s*:", arguments_mask
                    ) is not None,
                    "arguments": re.sub(r"\s+", " ", arguments.strip())[:240],
                    "file_sha256": digest(path.read_bytes()),
                })
    require(not dynamic_rows, "dynamic runtime Supabase writers are not reviewed: " + ", ".join(dynamic_rows))
    actual_keys = [
        (row["path"], row["line"], row["table"], row["operation"])
        for row in rows
    ]
    expected_keys = [row[:4] for row in RUNTIME_WRITER_EXPECTATIONS]
    require(len(actual_keys) == len(set(actual_keys)), "runtime writer scanner returned duplicates")
    require(
        sorted(actual_keys) == sorted(expected_keys),
        "runtime snapshot-writer universe drifted; actual=" + repr(sorted(actual_keys)),
    )
    modes = {row[:4]: row[4] for row in RUNTIME_WRITER_EXPECTATIONS}
    for row in rows:
        key = (row["path"], row["line"], row["table"], row["operation"])
        mode = modes[key]
        if mode == "literal_studio_id":
            require(row["payload_has_studio_id"], f"{key}: literal writer omits studio_id")
        elif mode == "reviewed_insert_data":
            source = (ROOT / row["path"]).read_text(encoding="utf-8")
            require(
                row["arguments"] == "insertData"
                and source.count("studio_id: studioId") == 2
                and "const insertData =" in source,
                f"{key}: dynamic insertData studio branches drifted",
            )
        else:
            raise RenderError(f"{key}: unknown runtime writer mode {mode}")
        row["authority_mode"] = mode
        del row["arguments"]
    return sorted(rows, key=lambda row: (row["path"], row["line"]))


def balanced_typescript_object(
    source: str, masked: str, open_index: int
) -> tuple[str, str, int]:
    require(masked[open_index] == "{", "RPC argument object has no opening brace")
    depth = 1
    index = open_index + 1
    while index < len(masked):
        if masked[index] == "{":
            depth += 1
        elif masked[index] == "}":
            depth -= 1
            if depth == 0:
                return (
                    source[open_index:index + 1],
                    masked[open_index:index + 1],
                    index + 1,
                )
        index += 1
    raise RenderError("unterminated TypeScript RPC argument object")


def top_level_typescript_object_keys(masked_object: str) -> tuple[str, ...]:
    keys: list[str] = []
    depth = 0
    index = 0
    while index < len(masked_object):
        character = masked_object[index]
        if character == "{":
            depth += 1
            index += 1
            continue
        if character == "}":
            depth -= 1
            index += 1
            continue
        if depth == 1 and (character.isalpha() or character in "_$"):
            end = index + 1
            while end < len(masked_object) and (
                masked_object[end].isalnum() or masked_object[end] in "_$"
            ):
                end += 1
            colon = end
            while colon < len(masked_object) and masked_object[colon].isspace():
                colon += 1
            if colon < len(masked_object) and masked_object[colon] == "?":
                colon += 1
                while colon < len(masked_object) and masked_object[colon].isspace():
                    colon += 1
            if colon < len(masked_object) and masked_object[colon] == ":":
                keys.append(masked_object[index:end])
            index = end
            continue
        index += 1
    require(len(keys) == len(set(keys)), "TypeScript RPC argument object repeats a key")
    return tuple(sorted(keys))


def runtime_rpc_caller_universe() -> list[dict[str, Any]]:
    target_names = tuple(row[2] for row in RUNTIME_RPC_EXPECTATIONS)
    target_pattern = "|".join(re.escape(name) for name in target_names)
    call_pattern = re.compile(
        r"\.\s*rpc\s*\(\s*(['\"])(?P<name>" + target_pattern + r")\1\s*,\s*\{",
        re.S,
    )
    roots = (ROOT / "apps", ROOT / "packages", ROOT / "supabase/functions")
    rows: list[dict[str, Any]] = []
    for root in roots:
        for path in sorted(root.rglob("*")):
            if path.suffix not in {".ts", ".tsx", ".js", ".jsx"} or not path.is_file():
                continue
            if (
                "__tests__" in path.parts
                or "_tests" in path.parts
                or path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
            ):
                continue
            source = path.read_text(encoding="utf-8")
            if ".rpc" not in source or not any(name in source for name in target_names):
                continue
            masked = typescript_writer_mask(source, target_names)
            for match in call_pattern.finditer(masked):
                object_open = match.end() - 1
                object_source, masked_object, _ = balanced_typescript_object(
                    source, masked, object_open
                )
                if match.group("name") == "create_client_decision":
                    require(
                        "designer_client_id" in typescript_writer_mask(source),
                        f"{path}: decision caller does not carry an exact relationship",
                    )
                rows.append({
                    "path": path.relative_to(ROOT).as_posix(),
                    "line": source.count("\n", 0, match.start()) + 1,
                    "rpc": match.group("name"),
                    "argument_keys": top_level_typescript_object_keys(masked_object),
                    "authority_mode": (
                        "exact_relationship_payload"
                        if match.group("name") == "create_client_decision"
                        else "exact_named_arguments"
                    ),
                    "file_sha256": digest(path.read_bytes()),
                })
    actual = [
        (row["path"], row["line"], row["rpc"], row["argument_keys"])
        for row in rows
    ]
    expected = list(RUNTIME_RPC_EXPECTATIONS)
    require(len(actual) == len(set(actual)), "runtime RPC caller scanner returned duplicates")
    require(
        sorted(actual) == sorted(expected),
        "runtime exact-workspace RPC caller universe drifted; actual=" + repr(sorted(actual)),
    )
    return sorted(rows, key=lambda row: (row["path"], row["line"], row["rpc"]))


def runtime_workspace_contract() -> dict[str, Any]:
    def checked_source(path_value: str, needles: tuple[str, ...]) -> tuple[Path, str]:
        path = ROOT / path_value
        source = path.read_text(encoding="utf-8")
        for needle in needles:
            require(needle in source, f"{path_value}: workspace sentinel missing: {needle}")
        return path, source

    phase_path, phase_source = checked_source(
        "packages/supabase/src/hooks/use-phase-templates.ts",
        (
            "export function usePhaseTemplates(studioId: string | null)",
            "queryKey: ['phase-templates', studioId]",
            "query.or(`is_system.eq.true,studio_id.eq.${studioId}`)",
            "query.eq('is_system', true)",
        ),
    )
    margin_path, margin_source = checked_source(
        "apps/designer-portal/src/hooks/use-margin-notes.ts",
        (
            "designerClientId: string;",
            "designer_client_id: designerClientId",
        ),
    )
    escalation_start = margin_source.index("export function useEscalateNoteToDecision")
    escalation_end = margin_source.index("export function useEscalateNoteToScopeChange")
    escalation = margin_source[escalation_start:escalation_end]
    require(
        ".from('designer_clients')" not in escalation
        and ".from('projects')" not in escalation,
        "margin decision escalation reintroduced relationship inference",
    )

    extension_path, extension_source = checked_source(
        "apps/extension/src/components/DecisionTargetSelector.tsx",
        (
            ".eq('user_id', designerId)",
            ".eq('status', 'active')",
            ".neq('role', 'guest')",
            ".eq('organization.type', 'design_studio')",
            ".eq('organization.status', 'active')",
            "options.length === 1 && workspaceId !== options[0].id",
            ".eq('studio_id', workspaceId)",
            ".eq('designer_id', designerId)",
            ".neq('status', 'lead')",
            "projectsRelationshipId === designerClientId",
            "roomsProjectId === projectId",
        ),
    )
    require(
        ".limit(1)" not in extension_source,
        "extension workspace selection reintroduced first-row inference",
    )

    resolver_path, resolver_source = checked_source(
        "packages/supabase/src/hooks/use-clients.ts",
        ("export function useDesignerClientForClientUser(",),
    )
    resolver_start = resolver_source.index(
        "export function useDesignerClientForClientUser("
    )
    resolver_end = resolver_source.index("export function useClientStats", resolver_start)
    resolver = resolver_source[resolver_start:resolver_end]
    for needle in (
        ".eq('client_id', clientUserId)",
        ".eq('studio_id', studioId)",
        ".eq('designer_id', designerId)",
        ".neq('status', 'lead')",
        ".maybeSingle()",
    ):
        require(needle in resolver, f"exact relationship resolver drifted: {needle}")
    require(
        ".order(" not in resolver and ".limit(" not in resolver,
        "exact relationship resolver reintroduced recency/first-row inference",
    )

    picker_path, _ = checked_source(
        "apps/designer-portal/src/components/portal/client-picker.tsx",
        (
            "studioId: string | null;",
            "relationship.studio_id === studioId",
            "dc.studio_id !== studioId",
        ),
    )
    return {
        "phase_templates": {
            "path": phase_path.relative_to(ROOT).as_posix(),
            "file_sha256": digest(phase_path.read_bytes()),
            "mode": "system_or_exact_proposal_studio",
        },
        "margin_decision": {
            "path": margin_path.relative_to(ROOT).as_posix(),
            "file_sha256": digest(margin_path.read_bytes()),
            "mode": "carried_exact_relationship",
        },
        "extension_decision": {
            "path": extension_path.relative_to(ROOT).as_posix(),
            "file_sha256": digest(extension_path.read_bytes()),
            "mode": "one_or_explicit_active_workspace_exact_relationship",
        },
        "document_relationship_resolver": {
            "path": resolver_path.relative_to(ROOT).as_posix(),
            "file_sha256": digest(resolver_path.read_bytes()),
            "mode": "exact_studio_designer_client_non_lead",
        },
        "client_picker": {
            "path": picker_path.relative_to(ROOT).as_posix(),
            "file_sha256": digest(picker_path.read_bytes()),
            "mode": "internal_exact_studio_filter",
        },
    }


def generated_database_type_contract() -> dict[str, Any]:
    """Pin the generated public schema/RPC surface changed by 00488.

    The whole generated file may legitimately move when unrelated schema lands,
    so the contract records its hash as provenance but validates the exact
    snapshot fields and PostgREST named-argument objects semantically.
    """
    source = DATABASE_TYPES.read_text(encoding="utf-8")
    masked = typescript_writer_mask(source)

    def named_object(
        section_start: str,
        section_end: str,
        name: str,
    ) -> tuple[str, str]:
        public_start = source.index("  public: {")
        start = source.index(section_start, public_start)
        end = source.index(section_end, start)
        match = re.search(
            rf"(?m)^\s{{6}}{re.escape(name)}:\s*\{{",
            masked[start:end],
        )
        require(match is not None, f"generated database type omits {name}")
        object_open = start + match.end() - 1
        object_source, object_mask, _ = balanced_typescript_object(
            source, masked, object_open
        )
        return object_source, object_mask

    tables: list[dict[str, Any]] = []
    for table in SNAPSHOT_TABLES:
        table_source, table_mask = named_object("    Tables: {", "    Views: {", table)
        profiles: dict[str, tuple[str, ...]] = {}
        for shape, expected_declaration in (
            ("Row", "studio_id: string | null"),
            ("Insert", "studio_id?: string | null"),
            ("Update", "studio_id?: string | null"),
        ):
            shape_match = re.search(rf"(?m)^\s{{8}}{shape}:\s*\{{", table_mask)
            require(shape_match is not None, f"generated {table}.{shape} object is missing")
            shape_source, shape_mask, _ = balanced_typescript_object(
                table_source, table_mask, shape_match.end() - 1
            )
            require(
                expected_declaration in shape_source,
                f"generated {table}.{shape} studio_id type drifted",
            )
            profiles[shape.lower()] = top_level_typescript_object_keys(shape_mask)
        foreign_key = f'{table}_studio_id_fkey'
        require(
            f'foreignKeyName: "{foreign_key}"' in table_source
            and 'columns: ["studio_id"]' in table_source
            and 'referencedRelation: "organizations"' in table_source
            and 'referencedColumns: ["id"]' in table_source,
            f"generated {table} studio foreign-key type drifted",
        )
        tables.append({
            "table": table,
            "row_has_studio_id": "studio_id" in profiles["row"],
            "insert_has_studio_id": "studio_id" in profiles["insert"],
            "update_has_studio_id": "studio_id" in profiles["update"],
            "foreign_key": foreign_key,
        })

    functions: list[dict[str, Any]] = []
    for name, expected_keys in GENERATED_RPC_TYPE_EXPECTATIONS.items():
        function_source, function_mask = named_object(
            "    Functions: {", "    Enums: {", name
        )
        args_match = re.search(r"(?m)^\s{8}Args:\s*\{", function_mask)
        require(args_match is not None, f"generated {name}.Args object is missing")
        _, args_mask, _ = balanced_typescript_object(
            function_source, function_mask, args_match.end() - 1
        )
        actual_keys = top_level_typescript_object_keys(args_mask)
        require(
            actual_keys == tuple(sorted(expected_keys)),
            f"generated {name} named arguments drifted: {actual_keys}",
        )
        functions.append({"rpc": name, "argument_keys": actual_keys})

    public_start = source.index("  public: {")
    functions_start = source.index("    Functions: {", public_start)
    functions_end = source.index("    Enums: {", functions_start)
    functions_source = source[functions_start:functions_end]
    functions_mask = masked[functions_start:functions_end]
    require(
        re.search(
            r"(?m)^\s{6}_can_manage_invoice_owner:\s*\{",
            functions_mask,
        ) is None,
        "generated database types retained retired _can_manage_invoice_owner",
    )

    composite_returns: list[dict[str, Any]] = []
    for setof_match in re.finditer(
        r"(?m)^\s+SetofOptions:\s*\{", functions_mask
    ):
        setof_source, setof_mask, _ = balanced_typescript_object(
            functions_source, functions_mask, setof_match.end() - 1
        )
        target_match = re.search(
            r'(?m)^\s*to:\s*"(proposals|client_decisions)"\s*$',
            setof_mask,
        )
        if target_match is None:
            continue
        target = target_match.group(1)
        function_matches = list(re.finditer(
            r"(?m)^\s{6}([A-Za-z_$][A-Za-z0-9_$]*):",
            functions_mask[:setof_match.start()],
        ))
        require(function_matches, f"generated {target} composite return has no RPC")
        rpc = function_matches[-1].group(1)
        return_matches = list(re.finditer(
            r"(?m)^\s+Returns:\s*\{",
            functions_mask[:setof_match.start()],
        ))
        require(return_matches, f"generated {rpc} composite return object is missing")
        return_match = return_matches[-1]
        return_source, return_mask, return_end = balanced_typescript_object(
            functions_source, functions_mask, return_match.end() - 1
        )
        require(
            return_end <= setof_match.start()
            and functions_mask[return_end:setof_match.start()].strip() == "",
            f"generated {rpc} {target} SetofOptions is detached from Returns",
        )
        return_keys = top_level_typescript_object_keys(return_mask)
        require(
            "studio_id: string | null" in return_source
            and "studio_id" in return_keys,
            f"generated {rpc} {target} composite return omits studio_id",
        )
        composite_returns.append({
            "rpc": rpc,
            "target": target,
            "studio_id_type": "string | null",
            "setof_line": source.count(
                "\n", 0, functions_start + setof_match.start()
            ) + 1,
        })

    composite_counts = Counter(row["target"] for row in composite_returns)
    require(
        dict(composite_counts) == GENERATED_COMPOSITE_RETURN_EXPECTATIONS,
        f"generated snapshot composite return universe drifted: {dict(composite_counts)}",
    )

    return {
        "path": DATABASE_TYPES.relative_to(ROOT).as_posix(),
        "file_sha256": digest(DATABASE_TYPES.read_bytes()),
        "snapshot_tables": tables,
        "rpc_types": functions,
        "composite_return_shapes": composite_returns,
        "retired_rpc_types_absent": ["_can_manage_invoice_owner"],
    }


def sql_script_code_mask(source: str) -> str:
    """Mask SQL comments/data strings while keeping DO-body SQL visible."""
    masked = list(source)
    index = 0
    block_depth = 0
    while index < len(source):
        if block_depth:
            if source.startswith("/*", index):
                block_depth += 1
                masked[index:index + 2] = [" ", " "]
                index += 2
            elif source.startswith("*/", index):
                block_depth -= 1
                masked[index:index + 2] = [" ", " "]
                index += 2
            else:
                if masked[index] != "\n":
                    masked[index] = " "
                index += 1
            continue
        if source.startswith("--", index):
            end = source.find("\n", index + 2)
            end = len(source) if end < 0 else end
            for offset in range(index, end):
                masked[offset] = " "
            index = end
            continue
        if source.startswith("/*", index):
            block_depth = 1
            masked[index:index + 2] = [" ", " "]
            index += 2
            continue
        if source[index] == "'":
            escape_string = (
                index > 0
                and source[index - 1] in ("e", "E")
                and (
                    index == 1
                    or not sql_identifier_continuation(source[index - 2])
                )
            )
            start = index
            index += 1
            string_closed = False
            while index < len(source):
                if source[index] == "'":
                    if index + 1 < len(source) and source[index + 1] == "'":
                        index += 2
                        continue
                    index += 1
                    string_closed = True
                    break
                if escape_string and source[index] == "\\" and index + 1 < len(source):
                    index += 2
                    continue
                index += 1
            require(string_closed, "unterminated seed SQL string")
            for offset in range(start, index):
                if masked[offset] != "\n":
                    masked[offset] = " "
            continue
        index += 1
    require(block_depth == 0, "unterminated seed SQL block comment")
    return "".join(masked)


def configured_seed_writer_universe() -> list[dict[str, Any]]:
    config_path = ROOT / "supabase/config.toml"
    config_source = config_path.read_text(encoding="utf-8")
    seed_section = re.search(
        r"(?ms)^\[db\.seed\]\s*$\n(?P<body>.*?)(?=^\[|\Z)", config_source
    )
    require(seed_section is not None, "supabase config has no [db.seed] section")
    paths_setting = re.search(
        r"(?ms)^sql_paths\s*=\s*\[(?P<paths>.*?)\]\s*$",
        seed_section.group("body"),
    )
    require(paths_setting is not None, "supabase config has no explicit db.seed sql_paths")
    paths = re.findall(r"['\"]([^'\"]+)['\"]", paths_setting.group("paths"))
    rows: list[dict[str, Any]] = []
    insert_pattern = re.compile(
        r"(?i)(?<![A-Za-z0-9_])insert\s+into\s+"
        r"(?:public\s*\.\s*)?(?P<table>"
        + "|".join(re.escape(table) for table in SNAPSHOT_TABLES)
        + r")\s*\((?P<columns>[^)]*)\)",
        re.S,
    )
    for configured in paths:
        require("*" not in configured, "00488 seed writer gate requires explicit seed paths")
        path = (ROOT / "supabase" / configured.removeprefix("./")).resolve()
        require(path.is_relative_to(ROOT / "supabase/seed"), f"seed path escapes seed root: {path}")
        source = path.read_text(encoding="utf-8")
        masked = sql_script_code_mask(source)
        for match in insert_pattern.finditer(masked):
            columns = [
                column.strip().strip('"').lower()
                for column in match.group("columns").split(",")
            ]
            require(
                "studio_id" in columns,
                f"{path.relative_to(ROOT)}:{source.count(chr(10), 0, match.start()) + 1}: "
                f"configured seed {match.group('table')} writer omits studio_id",
            )
            rows.append({
                "path": path.relative_to(ROOT).as_posix(),
                "line": source.count("\n", 0, match.start()) + 1,
                "table": match.group("table").lower(),
                "columns": columns,
                "authority_mode": "explicit_seed_studio_column",
                "file_sha256": digest(path.read_bytes()),
            })
    require(len(rows) == 15, f"configured seed snapshot-writer universe drifted: {len(rows)}")
    return rows


def studio_expression(signature: str, helper: str, argument: str) -> str:
    overrides = ROUTINE_STUDIO_OVERRIDES.get(signature, {})
    if argument in overrides:
        return overrides[argument]
    stripped = argument.strip()
    if helper == "is_active_studio_member":
        return stripped
    if stripped == "designer_id":
        return "studio_id"
    if stripped.endswith(".designer_id"):
        return stripped[:-len("designer_id")] + "studio_id"
    if "designer_id" in stripped:
        return re.sub(r"\bdesigner_id\b", "studio_id", stripped)
    raise RenderError(f"{signature}: no exact studio expression for {helper}({argument})")


def routine_is_read_only(signature: str, fragment: str) -> bool:
    name = signature.split(".", 1)[1].split("(", 1)[0]
    if name.startswith(READ_PREFIXES):
        return True
    declaration = fragment.split("AS $", 1)[0].upper()
    return " STABLE" in declaration or " IMMUTABLE" in declaration


def transform_routine(row: dict[str, Any], extracted: dict[str, Any]) -> tuple[str, str]:
    signature = row["canonical_regprocedure"]
    fragment = extracted["fragment"]
    if signature == "public._can_manage_invoice_owner(uuid)":
        return "", "retired"
    if signature == "public.can_dispatch_proposal_send(uuid)":
        return "", "resource_signature_replaced_in_00488"

    # Retiring the generic invoice-owner capability also requires rewriting
    # every final caller that reached it transitively in the reviewed graph.
    for helper in ("_can_manage_invoice_owner", *FORBIDDEN_HELPERS):
        require(
            not dynamic_forbidden_call(fragment, helper),
            f"{signature}: dynamic SQL authority call cannot be rewritten safely: {helper}",
        )
    invoice_owner_calls = find_calls(fragment, "_can_manage_invoice_owner")
    if invoice_owner_calls:
        authority = (
            "public._can_read_studio_snapshot"
            if routine_is_read_only(signature, fragment)
            else "public._can_author_studio_snapshot"
        )
        for start, end, argument in sorted(invoice_owner_calls, reverse=True):
            studio = studio_expression(signature, "_can_manage_invoice_owner", argument)
            fragment = fragment[:start] + f"{authority}({studio}, {argument.strip()})" + fragment[end:]

    if row["dependency_kind"] != "direct":
        marker = re.search(rf"(?is)\bAS\s+({DOLLAR_TAG_PATTERN})", fragment)
        require(marker is not None, f"{signature}: transformed body marker missing")
        tag = marker.group(1)
        body_end = fragment.find(tag, marker.end())
        body = fragment[marker.end():body_end]
        return fragment, digest(body.encode("utf-8"))

    replacements: list[tuple[int, int, str]] = []
    expected = Counter(
        (dep["helper"], normalize_expression(dep["argument"]))
        for dep in row["helper_dependencies"]
    )
    seen: Counter[tuple[str, str]] = Counter()
    use_read = routine_is_read_only(signature, fragment)
    authority = "public._can_read_studio_snapshot" if use_read else "public._can_author_studio_snapshot"
    for helper in FORBIDDEN_HELPERS:
        for start, end, argument in find_calls(fragment, helper):
            key = (helper, normalize_expression(argument))
            if key not in expected:
                continue
            studio = studio_expression(signature, helper, argument)
            replacements.append((start, end, f"{authority}({studio}, {argument.strip()})"))
            seen[key] += 1
    missing = sorted(key for key in expected if seen[key] == 0)
    require(not missing, f"{signature}: helper calls missing from exact source: {missing}")
    for start, end, replacement in sorted(replacements, reverse=True):
        fragment = fragment[:start] + replacement + fragment[end:]
    for helper in FORBIDDEN_HELPERS:
        require(not find_calls(fragment, helper), f"{signature}: forbidden helper survived rewrite: {helper}")
    for source_text_value, replacement in ROUTINE_TEXT_REPLACEMENTS.get(signature, ()):
        require(
            fragment.count(source_text_value) == 1,
            f"{signature}: writer replacement source must occur exactly once",
        )
        fragment = fragment.replace(source_text_value, replacement, 1)
    fragment = re.sub(r"(?im)^CREATE\s+FUNCTION\b", "CREATE OR REPLACE FUNCTION", fragment, count=1)
    marker = re.search(rf"(?is)\bAS\s+({DOLLAR_TAG_PATTERN})", fragment)
    require(marker is not None, f"{signature}: transformed body marker missing")
    tag = marker.group(1)
    body_end = fragment.find(tag, marker.end())
    body = fragment[marker.end():body_end]
    return fragment, digest(body.encode("utf-8"))


def quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def statement_end(source: str, start: int) -> int:
    quote = False
    dollar: str | None = None
    index = start
    while index < len(source):
        if dollar:
            if source.startswith(dollar, index):
                index += len(dollar)
                dollar = None
                continue
        elif quote:
            if source[index] == "'":
                if index + 1 < len(source) and source[index + 1] == "'":
                    index += 2
                    continue
                quote = False
        else:
            if source[index] == "'":
                quote = True
            elif source[index] == "$" and (
                index == start
                or not sql_identifier_continuation(source[index - 1])
            ):
                tag = re.match(DOLLAR_TAG_PATTERN, source[index:])
                if tag:
                    dollar = tag.group(0)
                    index += len(dollar)
                    continue
            elif source[index] == ";":
                return index + 1
        index += 1
    raise RenderError("unterminated SQL statement")


def extract_policy(row: dict[str, Any]) -> str:
    _, source = source_text(row)
    line_offset = sum(len(line) for line in source.splitlines(keepends=True)[: max(0, row["source"]["line"] - 3)])
    name = row["policy"]
    pattern = re.compile(rf"(?im)^CREATE\s+POLICY\s+(?:{re.escape(quote_ident(name))}|{re.escape(name)})\s+ON\b")
    matches = [match for match in pattern.finditer(source) if match.start() >= line_offset]
    if not matches:
        matches = list(pattern.finditer(source))
    require(bool(matches), f"{row['record_id']}: source policy not found")
    match = min(matches, key=lambda item: abs(source.count("\n", 0, item.start()) + 1 - row["source"]["line"]))
    return source[match.start():statement_end(source, match.start())]


def transform_policy(row: dict[str, Any], statement: str, *, storage: bool = False) -> str:
    if row["dependency_kind"] != "direct":
        return statement
    operation = row["operation"]
    replacements: list[tuple[int, int, str]] = []
    expected = Counter((dep["helper"], normalize_expression(dep["argument"])) for dep in row["helper_dependencies"])
    seen: Counter[tuple[str, str]] = Counter()
    with_check = statement.upper().find("WITH CHECK")
    for helper in FORBIDDEN_HELPERS:
        for start, end, argument in find_calls(statement, helper):
            key = (helper, normalize_expression(argument))
            if key not in expected:
                continue
            studio = studio_expression(row["record_id"], helper, argument)
            is_author = operation in ("INSERT", "UPDATE", "DELETE")
            if operation == "ALL":
                # storage.objects FOR ALL USING also governs DELETE.  A read
                # capability in that leg would become a delete capability.
                is_author = storage or with_check < 0 or start >= with_check
            authority = "public._can_author_studio_snapshot" if is_author else "public._can_read_studio_snapshot"
            replacements.append((start, end, f"{authority}({studio}, {argument.strip()})"))
            seen[key] += 1
    missing = sorted(key for key in expected if seen[key] == 0)
    require(not missing, f"{row['record_id']}: source helper call not found: {missing}")
    for start, end, replacement in sorted(replacements, reverse=True):
        statement = statement[:start] + replacement + statement[end:]
    for helper in FORBIDDEN_HELPERS:
        require(not find_calls(statement, helper), f"{row['record_id']}: forbidden helper survived")
    return statement


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_nullable(value: str | None) -> str:
    return "NULL" if value is None else sql_literal(value)


def sql_text_array(values: list[str] | tuple[str, ...] | None) -> str:
    if values is None:
        return "NULL::text[]"
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(sql_literal(value) for value in values) + "]::text[]"


def balanced_parenthesized(source: str, open_index: int) -> tuple[str, int]:
    require(source[open_index] == "(", "expected opening parenthesis")
    masked = sql_code_mask(source, preserve_quoted_identifiers=False)
    depth = 1
    index = open_index + 1
    while index < len(source):
        char = masked[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return source[open_index:index + 1], index + 1
        index += 1
    raise RenderError("unterminated parenthesized policy expression")


def policy_clause(statement: str, keyword: str) -> str | None:
    masked = sql_code_mask(statement, preserve_quoted_identifiers=False)
    match = re.search(rf"(?is)\b{keyword}\s*\(", masked)
    if match is None:
        return None
    open_index = masked.find("(", match.start())
    expression, _ = balanced_parenthesized(statement, open_index)
    return expression


def unqualify_public_helper_calls(value: str, helper: str) -> str:
    """Remove public. only from real parsed calls to one exact helper."""
    for start, end, _ in reversed(find_calls(value, helper)):
        call = value[start:end]
        unqualified = re.sub(
            r'(?is)^(?:"public"|public)\s*\.\s*', "", call, count=1
        )
        value = value[:start] + unqualified + value[end:]
    return value


def extract_people_directory_query(source: str) -> str:
    match = re.search(
        r"(?is)CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.people_directory\b"
        r".*?\bAS\b",
        source,
    )
    require(match is not None, "people_directory view definition is missing")
    end = statement_end(source, match.end())
    return source[match.end():end - 1].strip()


def catalog_policy_text(value: str | None) -> str:
    """Return the exact pinned pg_get_expr bytes used by the policy contract."""
    if value is None:
        return "<null>"
    return value


def catalog_policy_frame(value: str | None) -> bytes:
    if value is None:
        return b"\x00"
    encoded = catalog_policy_text(value).encode("utf-8")
    return b"\x01" + len(encoded).to_bytes(8, "big", signed=True) + encoded


def normalize_trigger_definition(value: str) -> str:
    """Match the existing trigger-definition catalog comparison."""
    return re.sub(r"\s+", "", value).lower()


def policy_fingerprint(expressions: dict[str, str | None]) -> str:
    """Hash the pinned PG17 catalog deparse, not CREATE POLICY source text."""
    payload = (
        b"patina-csa-policy-v1\x00"
        + catalog_policy_frame(expressions["qual"])
        + catalog_policy_frame(expressions["with_check"])
    )
    return digest(payload)


def policy_catalog_wrapper_clause(statement: str, keyword: str) -> str | None:
    expression = policy_clause(statement, keyword)
    if expression is None:
        return None
    require(
        expression.startswith("(") and expression.endswith(")"),
        "policy catalog wrapper is malformed",
    )
    return expression[1:-1].strip()


def project_final_policy_catalog_expressions(
    row: dict[str, Any],
    source: dict[str, str | None],
) -> dict[str, str | None]:
    """Project the exact helper-node substitution over a catalog deparse.

    The surrounding expression is taken from a checked PG17 catalog snapshot,
    which already contains parser-added casts and grouping.  The only new
    nodes are two-UUID canonical helper calls, whose deparse is stable under
    the transaction's pinned ``pg_catalog, public`` search path.
    """
    operation = row["operation"]
    synthetic = (
        f"CREATE POLICY {quote_ident(row['policy'])} ON {row['relation']} "
        f"FOR {operation} TO authenticated"
    )
    if source["qual"] is not None:
        synthetic += f" USING ({source['qual']})"
    if source["with_check"] is not None:
        synthetic += f" WITH CHECK ({source['with_check']})"
    synthetic += ";"
    projected = transform_policy(
        row,
        synthetic,
        storage=row["relation"] == "storage.objects",
    )
    result = {
        "qual": policy_catalog_wrapper_clause(projected, "USING"),
        "with_check": policy_catalog_wrapper_clause(
            projected, r"WITH\s+CHECK"
        ),
    }
    # SET LOCAL search_path pins public as visible, so pg_get_expr emits these
    # newly introduced public helper identities without a schema qualifier.
    for key, value in result.items():
        if value is None:
            continue
        for helper in (
            "_can_read_studio_snapshot",
            "_can_author_studio_snapshot",
        ):
            value = unqualify_public_helper_calls(value, helper)
        result[key] = value
    return result


def ordinary_all_delete_guard(
    row: dict[str, Any],
    final_statement: str,
    final_catalog: dict[str, str | None],
) -> tuple[str, dict[str, Any]]:
    """Gate DELETE separately while preserving broad exact-studio reads.

    A permissive ``FOR ALL`` USING leg also governs DELETE. The reviewed
    replacement keeps that leg read-capable for exact active studio members,
    while this restrictive DELETE policy requires the revocation-safe author
    capability. INSERT/UPDATE are already author-gated by WITH CHECK.
    """
    require(row["operation"] == "ALL", "delete guard requires an ALL policy")
    require(
        row["relation"] != "storage.objects",
        "storage ALL policy uses an author-only replacement instead",
    )
    using_sql = policy_clause(final_statement, "USING")
    require(using_sql is not None, f"{row['record_id']}: ALL policy has no USING")
    require(
        using_sql.count("public._can_read_studio_snapshot") == 1,
        f"{row['record_id']}: ALL policy delete guard read call is not exact",
    )
    author_using_sql = using_sql.replace(
        "public._can_read_studio_snapshot",
        "public._can_author_studio_snapshot",
    )
    catalog_qual = final_catalog["qual"]
    require(
        catalog_qual is not None
        and catalog_qual.count("_can_read_studio_snapshot") == 1,
        f"{row['record_id']}: ALL policy catalog delete guard is not exact",
    )
    guard_catalog = {
        "qual": catalog_qual.replace(
            "_can_read_studio_snapshot", "_can_author_studio_snapshot"
        ),
        "with_check": None,
    }
    guard_name = "csa_delete_guard_" + digest(
        row["record_id"].encode("utf-8")
    )[:16]
    statement = (
        f"CREATE POLICY {quote_ident(guard_name)} ON {row['relation']} "
        f"AS RESTRICTIVE FOR DELETE TO {', '.join(row['roles'])} "
        f"USING {author_using_sql};"
    )
    manifest = {
        "record_id": row["record_id"] + ":delete_guard",
        "derived_from_record_id": row["record_id"],
        "relation": row["relation"],
        "policy": guard_name,
        "operation": "DELETE",
        "roles": row["roles"],
        "permissive": False,
        "final_statement_sha256": digest(statement.encode("utf-8")),
        "final_catalog_qual": guard_catalog["qual"],
        "final_catalog_with_check": None,
        "final_catalog_fingerprint": policy_fingerprint(guard_catalog),
        "final_helper_call_counts": {"_can_author_studio_snapshot": 1},
        "disposition": "restrictive_delete_author_guard",
    }
    return statement, manifest


def snapshot_mutation_guards() -> tuple[list[str], list[dict[str, Any]]]:
    """Close permissive exact-owner mutation legs on canonical roots.

    The reviewed helper policies are still replaced in place. These
    restrictive policies additionally compose with every surviving owner or
    client compatibility leg, so UPDATE/DELETE always takes the canonical
    revocation-safe author capability while SELECT remains unchanged.
    """
    relations = (
        ("public.proposals", "designer_id"),
        ("public.designer_clients", "designer_id"),
        ("public.leads", "designer_id"),
        ("public.client_decisions", "designer_id"),
        ("public.saved_vendors", "designer_id"),
        ("public.phase_templates", "designer_id"),
        ("public.projects", "designer_id"),
    )
    statements: list[str] = []
    manifests: list[dict[str, Any]] = []
    for relation, owner_column in relations:
        table_name = relation.split(".", 1)[1]
        catalog_expression = (
            f"_can_author_studio_snapshot(studio_id, {owner_column})"
        )
        source_expression = (
            f"public._can_author_studio_snapshot(studio_id, {owner_column})"
        )
        for operation in ("UPDATE", "DELETE"):
            policy_name = (
                f"csa_author_{operation.lower()}_{table_name}"
            )
            check_clause = (
                f" WITH CHECK ({source_expression})"
                if operation == "UPDATE" else ""
            )
            statement = (
                f"CREATE POLICY {quote_ident(policy_name)} ON {relation} "
                f"AS RESTRICTIVE FOR {operation} TO public "
                f"USING ({source_expression}){check_clause};"
            )
            catalog = {
                "qual": catalog_expression,
                "with_check": (
                    catalog_expression if operation == "UPDATE" else None
                ),
            }
            manifest = {
                "relation": relation,
                "policy": policy_name,
                "operation": operation,
                "roles": ["public"],
                "permissive": False,
                "owner_column": owner_column,
                "final_statement_sha256": digest(statement.encode("utf-8")),
                "final_catalog_qual": catalog["qual"],
                "final_catalog_with_check": catalog["with_check"],
                "final_catalog_fingerprint": policy_fingerprint(catalog),
                "final_helper_call_counts": {
                    "_can_author_studio_snapshot": (
                        2 if operation == "UPDATE" else 1
                    )
                },
                "disposition": "restrictive_canonical_mutation_guard",
            }
            statements.append(statement)
            manifests.append(manifest)
    require(len(manifests) == 14, "canonical mutation guard universe is not 14")
    return statements, manifests


def routine_values_sql(routines: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for row in routines:
        profile = row["profile"]
        source_config = row["source_profile"]["source_config"]
        final_sha = row["final_body_sha256"]
        if final_sha in ("retired", "resource_signature_replaced_in_00488"):
            final_sha = None
        rows.append("(" + ",".join([
            sql_literal(row["canonical_regprocedure"]),
            sql_literal(row["source_arguments_with_defaults"]),
            sql_literal(row["arguments_with_defaults"]),
            sql_literal(profile["owner"]),
            sql_literal(profile["language"]),
            sql_literal(profile["kind"]),
            "true" if profile["security_definer"] else "false",
            "true" if profile["leakproof"] else "false",
            "true" if profile["strict"] else "false",
            sql_literal(profile["parallel"]),
            sql_literal(profile["volatility"]),
            "true" if profile["returns_set"] else "false",
            sql_literal(profile["result"]),
            sql_text_array(source_config),
            sql_text_array(profile["final_config"]),
            sql_literal(row["source_body_sha256"]),
            sql_nullable(final_sha),
            sql_text_array(row["allowed_roles"]),
            "true" if row["disposition"] == "retired" else "false",
        ]) + ")")
    return ",\n      ".join(rows)


def profile(
    *,
    language: str,
    security_definer: bool,
    volatility: str,
    result: str,
    config: list[str],
    body_sha256: str,
    kind: str = "f",
    leakproof: bool = False,
    strict: bool = False,
    parallel: str = "u",
    returns_set: bool = False,
) -> dict[str, Any]:
    return {
        "owner": "postgres",
        "language": language,
        "kind": kind,
        "security_definer": security_definer,
        "leakproof": leakproof,
        "strict": strict,
        "parallel": parallel,
        "volatility": volatility,
        "returns_set": returns_set,
        "result": result,
        "config": config,
        "body_sha256": body_sha256,
    }


def composed_00485_manifest(
    profile_contract: dict[str, dict[str, Any]],
    final_00485: dict[str, dict[str, Any]],
    represented_signatures: set[str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for signature, fragment in final_00485.items():
        if signature in represented_signatures:
            continue
        profile_row = profile_contract.get(signature)
        if profile_row is None:
            if signature == "public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)":
                arguments = (
                    "p_project_id uuid, p_expected_designer_id uuid, "
                    "p_expected_client_id uuid, p_expected_studio_id uuid, "
                    "p_tax_rate numeric DEFAULT 0, "
                    "p_payment_terms_days integer DEFAULT 15, "
                    "p_memo text DEFAULT NULL::text, "
                    "p_internal_notes text DEFAULT NULL::text, "
                    "p_lines jsonb DEFAULT '[]'::jsonb"
                )
                allowed_roles = ["authenticated"]
            elif signature == "app_private.issue_invoice_for_actor(uuid,date,uuid)":
                arguments = "p_invoice_id uuid, p_due_date date, p_actor_id uuid"
                allowed_roles = []
            else:
                raise RenderError(f"{signature}: frozen 00485 profile is missing")
            final_profile = {
                "owner": "postgres",
                "language": "plpgsql",
                "kind": "f",
                "security_definer": True,
                "leakproof": False,
                "strict": False,
                "parallel": "u",
                "volatility": "v",
                "returns_set": False,
                "result": "invoices",
                "source_config": ["search_path=pg_catalog, public, pg_temp"],
                "final_config": ["search_path=pg_catalog, public, pg_temp"],
                "body_sha256": fragment["body_sha256"],
                "body_octets": len(fragment["body"].encode("utf-8")),
            }
            trigger_bindings: list[dict[str, Any]] = []
            caller_evidence: list[str] = []
        else:
            arguments = profile_row["arguments_with_defaults"]
            allowed_roles = profile_row["allowed_roles"]
            final_profile = dict(profile_row["profile"])
            final_profile["source_config"] = final_profile["final_config"]
            final_profile["body_sha256"] = fragment["body_sha256"]
            final_profile["body_octets"] = len(fragment["body"].encode("utf-8"))
            if signature in (
                "public.set_project_studio_id()",
                "public.set_invoice_studio_id()",
            ):
                final_profile["security_definer"] = False
            trigger_bindings = profile_row["bindings"]["triggers"]
            if signature == "public.set_project_studio_id()":
                trigger_bindings = [{
                    "schema": "public",
                    "relation": "projects",
                    "name": "set_project_studio_id",
                    "type": 23,
                    "enabled": "O",
                    "definition": (
                        "CREATE TRIGGER set_project_studio_id BEFORE INSERT OR UPDATE OF "
                        "id, studio_id, designer_id, client_id, proposal_id, created_by, "
                        "created_at ON public.projects FOR EACH ROW EXECUTE FUNCTION "
                        "public.set_project_studio_id()"
                    ),
                    "args_hex": "",
                }]
            elif signature == "public.set_invoice_studio_id()":
                trigger_bindings = [{
                    "schema": "public",
                    "relation": "invoices",
                    "name": "set_invoice_studio_id",
                    "type": 23,
                    "enabled": "O",
                    "definition": (
                        "CREATE TRIGGER set_invoice_studio_id BEFORE INSERT OR UPDATE OF "
                        "id, studio_id, designer_id, client_id, project_id, status, "
                        "invoice_number, issue_date, due_date, payment_terms_days, currency, "
                        "subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents, "
                        "memo, internal_notes, sent_at, paid_at, voided_at, void_reason, "
                        "stripe_checkout_session_id, reminder_count, last_reminder_at, "
                        "ar_flagged_at, ar_last_chased_at, created_at, updated_at ON "
                        "public.invoices FOR EACH ROW EXECUTE FUNCTION "
                        "public.set_invoice_studio_id()"
                    ),
                    "args_hex": "",
                }]
            caller_evidence = profile_row["evidence"]["references"]
        result.append({
            "record_id": "composed-00485-routine:" + signature,
            "canonical_regprocedure": signature,
            "dependency_kind": "frozen_composed_upstream",
            "source_body_sha256": fragment["body_sha256"],
            "final_body_sha256": fragment["body_sha256"],
            "source": {
                "path": str(FINAL_00485.relative_to(ROOT)),
                "file_sha256": FINAL_00485_SHA256,
                "commit": FINAL_00485_COMMIT,
                "line": fragment["line"],
            },
            "roles": allowed_roles,
            "allowed_roles": allowed_roles,
            "security_definer": final_profile["security_definer"],
            "source_arguments_with_defaults": arguments,
            "arguments_with_defaults": arguments,
            "source_profile": final_profile,
            "profile": final_profile,
            "trigger_bindings": trigger_bindings,
            "caller_evidence": caller_evidence,
            "source_authority_calls": helper_call_profile(
                fragment["fragment"], SOURCE_AUTHORITY_HELPERS
            ),
            "disposition": "preserved_frozen_composed_00485",
        })
    return result


def authority_surface_manifest(
    rendered_template: str,
    profile_contract: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    parsed = function_fragments(rendered_template)

    def body(name: str) -> tuple[str, int]:
        rows = [row for row in parsed if row["schema"] == "public" and row["name"] == name]
        require(len(rows) == 1, f"manual authority surface {name} is not unique")
        return rows[0]["body_sha256"], len(rows[0]["body"].encode("utf-8"))

    source_signatures = (
        "public.is_studio_comember(uuid)",
        "public.is_design_studio_comember(uuid)",
        "public._can_author_proposal(uuid)",
        "public.is_active_studio_member(uuid)",
        "public.claim_design_request(uuid)",
        "public.accept_design_request(uuid)",
        "public.open_project_direct(text,uuid,integer,integer,date,uuid)",
        "public.set_document_client(text,uuid,uuid)",
    )
    source_rows = {signature: profile_contract[signature] for signature in source_signatures}

    def composed_source(signature: str) -> dict[str, Any]:
        row = source_rows[signature]
        value = dict(row["profile"])
        value["config"] = value["final_config"]
        value["body_sha256"] = row["profile"]["body_sha256"]
        return value

    final_specs = {
        "public._can_read_studio_snapshot(uuid,uuid)": (
            "_can_read_studio_snapshot",
            "p_studio_id uuid, p_exact_owner uuid DEFAULT NULL::uuid",
            profile(language="sql", security_definer=True, volatility="s", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public._lock_designer_studio_authority(uuid,uuid)": (
            "_lock_designer_studio_authority",
            "p_studio_id uuid, p_designer_id uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            [],
        ),
        "public._can_author_studio_snapshot(uuid,uuid)": (
            "_can_author_studio_snapshot",
            "p_studio_id uuid, p_exact_owner uuid DEFAULT NULL::uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public.guard_canonical_studio_snapshot()": (
            "guard_canonical_studio_snapshot",
            "",
            profile(language="plpgsql", security_definer=True, volatility="v", result="trigger", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            [],
        ),
        "public._prepare_canonical_lead_claim(uuid,uuid)": (
            "_prepare_canonical_lead_claim",
            "p_lead_id uuid, p_studio_id uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="void", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            [],
        ),
        "public.claim_design_request(uuid,uuid)": (
            "claim_design_request",
            "p_lead_id uuid, p_studio_id uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="jsonb", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public.accept_design_request(uuid,uuid)": (
            "accept_design_request",
            "p_lead_id uuid, p_studio_id uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="jsonb", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public.is_studio_comember(uuid)": (
            "is_studio_comember",
            "p_owner uuid",
            profile(language="sql", security_definer=True, volatility="s", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public.is_design_studio_comember(uuid)": (
            "is_design_studio_comember",
            "p_owner uuid",
            profile(language="sql", security_definer=True, volatility="s", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public._can_author_proposal(uuid)": (
            "_can_author_proposal",
            "p_owner uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            [],
        ),
        "public.is_active_studio_member(uuid)": (
            "is_active_studio_member",
            "p_organization_id uuid",
            profile(language="sql", security_definer=True, volatility="s", result="boolean", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)": (
            "open_project_direct",
            "p_title text, p_studio_id uuid, p_designer_client_id uuid DEFAULT NULL::uuid, p_budget_min_cents integer DEFAULT NULL::integer, p_budget_max_cents integer DEFAULT NULL::integer, p_start_date date DEFAULT CURRENT_DATE, p_id uuid DEFAULT NULL::uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="uuid", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
        "public.set_document_client(text,uuid,uuid,uuid)": (
            "set_document_client",
            "p_engagement_kind text, p_target_id uuid, p_client_id uuid, p_designer_client_id uuid",
            profile(language="plpgsql", security_definer=True, volatility="v", result="void", config=["search_path=pg_catalog, public, pg_temp"], body_sha256=""),
            ["authenticated"],
        ),
    }
    result: list[dict[str, Any]] = []
    all_signatures = [
        "public._can_read_studio_snapshot(uuid,uuid)",
        "public._lock_designer_studio_authority(uuid,uuid)",
        "public._can_author_studio_snapshot(uuid,uuid)",
        "public.guard_canonical_studio_snapshot()",
        "public._prepare_canonical_lead_claim(uuid,uuid)",
        "public.claim_design_request(uuid)",
        "public.claim_design_request(uuid,uuid)",
        "public.accept_design_request(uuid)",
        "public.accept_design_request(uuid,uuid)",
        "public.is_studio_comember(uuid)",
        "public.is_design_studio_comember(uuid)",
        "public._can_author_proposal(uuid)",
        "public.is_active_studio_member(uuid)",
        "public.open_project_direct(text,uuid,integer,integer,date,uuid)",
        "public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)",
        "public.set_document_client(text,uuid,uuid)",
        "public.set_document_client(text,uuid,uuid,uuid)",
    ]
    for signature in all_signatures:
        final = final_specs.get(signature)
        final_state = None
        final_arguments = None
        final_roles: list[str] = []
        body_octets = 0
        if final is not None:
            function_name, final_arguments, final_state, final_roles = final
            final_state = dict(final_state)
            final_state["body_sha256"], body_octets = body(function_name)
        source = source_rows.get(signature)
        result.append({
            "canonical_regprocedure": signature,
            "source_exists": source is not None,
            "source_arguments_with_defaults": source["arguments_with_defaults"] if source else None,
            "source_profile": composed_source(signature) if source else None,
            "source_allowed_roles": source["allowed_roles"] if source else [],
            "final_exists": final is not None,
            "arguments_with_defaults": final_arguments,
            "profile": final_state,
            "allowed_roles": final_roles,
            "body_octets": body_octets,
            "disposition": "final" if final is not None else "retired_signature",
        })
    for final_signature, source_signature in (
        ("public._claim_design_request_00488_core(uuid)", "public.claim_design_request(uuid)"),
        ("public._accept_design_request_00488_core(uuid)", "public.accept_design_request(uuid)"),
    ):
        source = source_rows[source_signature]
        final_state = composed_source(source_signature)
        function_name = final_signature.split(".", 1)[1].split("(", 1)[0]
        final_state["body_sha256"], body_octets = body(function_name)
        result.append({
            "canonical_regprocedure": final_signature,
            "source_exists": False,
            "source_arguments_with_defaults": None,
            "source_profile": None,
            "source_allowed_roles": [],
            "final_exists": True,
            "arguments_with_defaults": source["arguments_with_defaults"],
            "profile": final_state,
            "allowed_roles": [],
            "body_octets": body_octets,
            "disposition": "renamed_zero_grant_compatibility_core",
        })
    return result


def surface_values_sql(surfaces: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for surface in surfaces:
        for state in ("source", "final"):
            exists = surface[f"{state}_exists"]
            value = surface["source_profile"] if state == "source" else surface["profile"]
            arguments = surface["source_arguments_with_defaults"] if state == "source" else surface["arguments_with_defaults"]
            roles = surface["source_allowed_roles"] if state == "source" else surface["allowed_roles"]
            rows.append("(" + ",".join([
                sql_literal(surface["canonical_regprocedure"]),
                sql_literal(state),
                "true" if exists else "false",
                sql_nullable(arguments),
                sql_nullable(value["owner"] if value else None),
                sql_nullable(value["language"] if value else None),
                sql_nullable(value["kind"] if value else None),
                "NULL::boolean" if value is None else ("true" if value["security_definer"] else "false"),
                "NULL::boolean" if value is None else ("true" if value["leakproof"] else "false"),
                "NULL::boolean" if value is None else ("true" if value["strict"] else "false"),
                sql_nullable(value["parallel"] if value else None),
                sql_nullable(value["volatility"] if value else None),
                "NULL::boolean" if value is None else ("true" if value["returns_set"] else "false"),
                sql_nullable(value["result"] if value else None),
                sql_text_array(value["config"] if value else None),
                sql_nullable(value["body_sha256"] if value else None),
                sql_text_array(roles),
            ]) + ")")
    return ",\n      ".join(rows)


def dynamic_routine_values_sql(rows: list[dict[str, Any]]) -> str:
    values: list[str] = []
    for row in rows:
        for state in ("source", "final"):
            routine_profile = (
                row["source_profile"] if state == "source" else row["profile"]
            )
            values.append("(" + ",".join([
                sql_literal(row["canonical_regprocedure"]),
                sql_literal(state),
                "true" if row[f"{state}_dynamic"] else "false",
                sql_literal(row["arguments_with_defaults"]),
                sql_literal(routine_profile["owner"]),
                sql_literal(routine_profile["language"]),
                sql_literal(routine_profile["kind"]),
                "true" if routine_profile["security_definer"] else "false",
                "true" if routine_profile["leakproof"] else "false",
                "true" if routine_profile["strict"] else "false",
                sql_literal(routine_profile["parallel"]),
                sql_literal(routine_profile["volatility"]),
                "true" if routine_profile["returns_set"] else "false",
                sql_literal(routine_profile["result"]),
                sql_text_array(routine_profile["config"]),
                sql_literal(routine_profile["body_sha256"]),
                sql_text_array(sorted(row["allowed_roles"])),
            ]) + ")")
    return ",\n      ".join(values)


def dynamic_routine_contract_sql(
    rows: list[dict[str, Any]], state_expression: str
) -> str:
    values = dynamic_routine_values_sql(rows)
    expected_names = sorted({
        row["canonical_regprocedure"].split(".", 1)[1].split("(", 1)[0]
        for row in rows
    })
    name_values = ",".join(sql_literal(name) for name in expected_names)
    return f"""
  IF EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {values}
    ), expected AS (
      SELECT * FROM states WHERE state_name = {state_expression}
    ), actual AS (
      SELECT expected.*, routine.oid, owner.rolname AS actual_owner,
             language.lanname AS actual_language,
             pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
             pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             routine.prokind, routine.prosecdef, routine.proleakproof,
             routine.proisstrict, routine.proparallel, routine.provolatile,
             routine.proretset, routine.proconfig
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR actual_owner IS DISTINCT FROM owner_name
       OR actual_language IS DISTINCT FROM language_name
       OR prokind IS DISTINCT FROM kind::"char"
       OR prosecdef IS DISTINCT FROM security_definer
       OR proleakproof IS DISTINCT FROM leakproof
       OR proisstrict IS DISTINCT FROM strict
       OR proparallel IS DISTINCT FROM parallel::"char"
       OR provolatile IS DISTINCT FROM volatility::"char"
       OR proretset IS DISTINCT FROM returns_set
       OR actual_result IS DISTINCT FROM result_type
       OR actual_arguments IS DISTINCT FROM arguments
       OR proconfig IS DISTINCT FROM config
       OR actual_body_sha256 IS DISTINCT FROM body_sha256
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {values}
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM states
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
      WHERE state_name = {state_expression}
    ), chosen AS (
      SELECT * FROM states WHERE state_name = {state_expression}
    ), actual AS (
      SELECT chosen.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
             grantor.rolname, acl.privilege_type, acl.is_grantable
      FROM chosen
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(chosen.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {values}
    ), expected AS (
      SELECT pg_catalog.to_regprocedure(signature) AS oid, body_sha256
      FROM states
      WHERE state_name = {state_expression} AND is_dynamic
    ), actual AS (
      SELECT routine.oid,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex')
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname IN ('public','app_private')
        AND pg_temp._00488_mask_sql(routine.prosrc, false)
          ~* '(^|[^a-z0-9_$])execute([^a-z0-9_$]|$)'
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) OR EXISTS (
    WITH states(
      signature, state_name, is_dynamic, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {values}
    ), expected AS (
      SELECT signature FROM states WHERE state_name = {state_expression}
    )
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN ({name_values})
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = routine.oid
      )
  ) THEN
    RAISE EXCEPTION
      '00488 reviewed dynamic routine profile/ACL/universe drifted';
  END IF;
"""


def dynamic_invoice_core_dependency_sql() -> str:
    return """
  IF EXISTS (
    WITH expected(caller_signature, call_count) AS (VALUES
      ('public.void_invoice(uuid,text)', 1)
    ), actual AS (
      SELECT caller.oid,
             pg_temp._00488_call_count(
               caller.prosrc, '_void_invoice_authorized_legacy_00397'
             ) AS call_count,
             pg_temp._00488_dynamic_mentions(
               caller.prosrc, '_void_invoice_authorized_legacy_00397'
             ) AS dynamic_call
      FROM pg_catalog.pg_proc AS caller
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = caller.pronamespace
      WHERE namespace.nspname IN ('public','app_private')
    )
    (SELECT pg_catalog.to_regprocedure(caller_signature), call_count FROM expected
     EXCEPT SELECT oid, call_count FROM actual
            WHERE call_count > 0 AND NOT dynamic_call)
    UNION ALL
    (SELECT oid, call_count FROM actual
     WHERE call_count > 0 OR dynamic_call
     EXCEPT SELECT pg_catalog.to_regprocedure(caller_signature), call_count FROM expected)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE pg_temp._00488_call_count(
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
        ), '_void_invoice_authorized_legacy_00397'
    ) > 0
  ) OR pg_temp._00488_call_count(
    pg_catalog.pg_get_viewdef(
      'public.people_directory'::pg_catalog.regclass, true
    ), '_void_invoice_authorized_legacy_00397'
  ) > 0 THEN
    RAISE EXCEPTION '00488 dynamic invoice core caller universe drifted';
  END IF;
"""


def source_function_sql(
    signature: str,
    fragment: str,
    config: list[str],
) -> str:
    require(len(config) == 1, f"{signature}: expected one source config")
    setting, value = config[0].split("=", 1)
    require(setting == "search_path", f"{signature}: unexpected source config")
    statement = re.sub(
        r"(?im)^CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\b",
        "CREATE OR REPLACE FUNCTION",
        fragment,
        count=1,
    )
    require(
        statement != fragment or re.search(
            r"(?im)^CREATE\s+OR\s+REPLACE\s+FUNCTION\b", fragment
        ) is not None,
        f"{signature}: source function header was not found",
    )
    return (
        statement
        + f"\nALTER FUNCTION {signature} RESET ALL;"
        + f"\nALTER FUNCTION {signature} SET {setting} = {value};"
        + f"\nALTER FUNCTION {signature} OWNER TO postgres;"
    )


def function_dcl_sql(signature: str, allowed_roles: list[str]) -> str:
    statements = [
        f"REVOKE EXECUTE ON FUNCTION {signature} "
        f"FROM PUBLIC, {', '.join(APP_ROLE_UNIVERSE)};"
    ]
    if allowed_roles:
        statements.append(
            f"GRANT EXECUTE ON FUNCTION {signature} TO {', '.join(allowed_roles)};"
        )
    return "\n".join(statements)


CANONICAL_HELPERS = (
    "_can_read_studio_snapshot",
    "_can_author_studio_snapshot",
    "_lock_designer_studio_authority",
    "_prepare_canonical_lead_claim",
)


def canonical_caller_manifest(
    rendered_template: str,
    routines: list[dict[str, Any]],
    surfaces: list[dict[str, Any]],
    policies: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    fragments = function_fragments(rendered_template)
    body_to_signatures: dict[str, list[str]] = {}
    for row in routines:
        if row["final_body_sha256"] in ("retired", "resource_signature_replaced_in_00488"):
            continue
        body_to_signatures.setdefault(row["final_body_sha256"], []).append(row["canonical_regprocedure"])
    for row in surfaces:
        if row["final_exists"]:
            body_to_signatures.setdefault(row["profile"]["body_sha256"], []).append(row["canonical_regprocedure"])

    routine_callers: list[dict[str, Any]] = []
    for fragment in fragments:
        candidates = body_to_signatures.get(fragment["body_sha256"], [])
        if not candidates:
            continue
        name_matches = [
            signature for signature in candidates
            if signature.split(".", 1)[1].split("(", 1)[0] == fragment["name"]
        ]
        require(len(name_matches) == 1, f"caller manifest body mapping is ambiguous for {fragment['name']}")
        signature = name_matches[0]
        for helper in CANONICAL_HELPERS:
            calls = find_calls(fragment["fragment"], helper)
            if calls:
                routine_callers.append({
                    "canonical_regprocedure": signature,
                    "helper": helper,
                    "call_count": len(calls),
                    "catalog_call_count": len(calls),
                })

    policy_callers: list[dict[str, Any]] = []
    for row in policies:
        for helper in CANONICAL_HELPERS:
            count = row.get("final_helper_call_counts", {}).get(helper, 0)
            if count:
                policy_callers.append({
                    "relation": row["relation"],
                    "policy": row["policy"],
                    "helper": helper,
                    "call_count": count,
                    "required_in_ordinary_phase": row["disposition"] != "platform_admin_handoff",
                })
    return {
        "routines": sorted(
            routine_callers,
            key=lambda row: (row["canonical_regprocedure"], row["helper"]),
        ),
        "policies": sorted(
            policy_callers,
            key=lambda row: (row["relation"], row["policy"], row["helper"]),
        ),
        "views": [{
            "relation": "public.people_directory",
            "helper": "_can_read_studio_snapshot",
            "call_count": 7,
        }],
    }


def canonical_lock_order_manifest(
    rendered_template: str,
    routines: list[dict[str, Any]],
    surfaces: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    snapshot_roots = (
        "projects",
        "proposals",
        "designer_clients",
        "leads",
        "client_decisions",
        "saved_vendors",
        "phase_templates",
    )
    root_pattern = "|".join(snapshot_roots)
    body_to_signatures: dict[str, list[str]] = {}
    for row in routines:
        if row["final_body_sha256"] in ("retired", "resource_signature_replaced_in_00488"):
            continue
        body_to_signatures.setdefault(row["final_body_sha256"], []).append(
            row["canonical_regprocedure"]
        )
    for row in surfaces:
        if row["final_exists"]:
            body_to_signatures.setdefault(row["profile"]["body_sha256"], []).append(
                row["canonical_regprocedure"]
            )

    result: list[dict[str, Any]] = []
    for fragment in function_fragments(rendered_template):
        candidates = body_to_signatures.get(fragment["body_sha256"], [])
        candidates = [
            signature for signature in candidates
            if signature.split(".", 1)[1].split("(", 1)[0] == fragment["name"]
        ]
        if not candidates:
            continue
        require(len(candidates) == 1, f"lock-order body mapping is ambiguous for {fragment['name']}")
        calls = sorted(
            call
            for helper in ("_can_author_studio_snapshot", "_lock_designer_studio_authority")
            for call in find_calls(fragment["fragment"], helper)
        )
        if not calls:
            continue
        first_authority = calls[0][0]
        masked = sql_code_mask(fragment["fragment"], function_body_only=True)
        locks = [
            match.start()
            for match in re.finditer(r"(?i)\bFOR\s+(?:KEY\s+)?(?:SHARE|UPDATE)\b", masked)
        ]
        snapshot_locks_before: set[str] = set()
        snapshot_locks_after: set[str] = set()
        for lock in re.finditer(
            r"(?i)\bFOR\s+(?:KEY\s+)?(?:SHARE|UPDATE)\b", masked
        ):
            statement_start = masked.rfind(";", 0, lock.start()) + 1
            statement = masked[statement_start:lock.end()]
            targets = {
                target.group(1).lower()
                for target in re.finditer(
                    rf"(?i)\b(?:FROM|JOIN)\s+(?:public\.)?({root_pattern})\b",
                    statement,
                )
            }
            if lock.start() < first_authority:
                snapshot_locks_before.update(targets)
            else:
                snapshot_locks_after.update(targets)
        snapshot_mutations_after = {
            mutation.group(1).lower()
            for mutation in re.finditer(
                rf"(?i)\b(?:UPDATE\s+(?:public\.)?|DELETE\s+FROM\s+(?:public\.)?)"
                rf"({root_pattern})\b",
                masked,
            )
            if mutation.start() > first_authority
        }
        signature = candidates[0]
        target_row_inherent = signature == "public.guard_client_decision_authority()"
        locks_before = sum(position < first_authority for position in locks)
        locks_after = sum(position > first_authority for position in locks)
        collision_retry_order = False
        if signature == (
            "public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)"
        ):
            lower_masked = masked.lower()
            exception_position = lower_masked.find(
                "exception when serialization_failure"
            )
            retry_position = lower_masked.find("if collision_retry then")
            retry_root_position = lower_masked.find("for share", retry_position)
            retry_authority_position = lower_masked.find(
                "_can_author_studio_snapshot", retry_root_position
            )
            collision_retry_order = (
                len(calls) == 3
                and exception_position > first_authority
                and retry_position > exception_position
                and retry_root_position > retry_position
                and retry_authority_position > retry_root_position
                and "collision_retry := true" in lower_masked
            )
            require(
                collision_retry_order,
                "open_project_direct collision retry does not release and reacquire root/authority order",
            )
        require(
            target_row_inherent
            or collision_retry_order
            or not locks_after
            or locks_before > 0,
            f"{signature}: canonical authority is acquired before a later root/child lock",
        )
        uncovered_snapshot_roots = (
            snapshot_locks_after | snapshot_mutations_after
        ) - snapshot_locks_before
        require(
            target_row_inherent or not uncovered_snapshot_roots,
            f"{signature}: snapshot root is locked/mutated after authority without "
            f"an earlier root lock: {sorted(uncovered_snapshot_roots)}",
        )
        result.append({
            "canonical_regprocedure": signature,
            "body_sha256": fragment["body_sha256"],
            "target_row_lock_inherent": target_row_inherent,
            "authority_call_count": len(calls),
            "explicit_locks_before_first_authority": locks_before,
            "explicit_locks_after_first_authority": locks_after,
            "snapshot_root_locks_before_first_authority": sorted(
                snapshot_locks_before
            ),
            "snapshot_root_locks_after_first_authority": sorted(
                snapshot_locks_after
            ),
            "snapshot_root_mutations_after_first_authority": sorted(
                snapshot_mutations_after
            ),
            "collision_retry_reacquires_root_first": collision_retry_order,
            "disposition": (
                "trigger_target_then_authority_then_children"
                if target_row_inherent
                else "subtransaction_release_then_root_relationship_authority_retry"
                if collision_retry_order
                else "root_before_authority_then_children"
                if locks_before
                else "authority_only_no_later_lock"
            ),
        })
    return sorted(result, key=lambda row: row["canonical_regprocedure"])


def routine_caller_values_sql(callers: dict[str, list[dict[str, Any]]]) -> str:
    return ",\n      ".join(
        "(" + ",".join([
            sql_literal(row["canonical_regprocedure"]),
            sql_literal(row["helper"]),
            str(row["call_count"]),
            str(row["catalog_call_count"]),
        ]) + ")"
        for row in callers["routines"]
    )


def policy_caller_values_sql(callers: dict[str, list[dict[str, Any]]]) -> str:
    return ",\n      ".join(
        "(" + ",".join([
            sql_literal(row["relation"]),
            sql_literal(row["policy"]),
            sql_literal(row["helper"]),
            str(row["call_count"]),
            "true" if row["required_in_ordinary_phase"] else "false",
        ]) + ")"
        for row in callers["policies"]
    )


def writer_values_sql() -> str:
    return ",\n      ".join(
        "(" + ",".join((sql_literal(signature), sql_literal(table), sql_literal(mode))) + ")"
        for signature, table, mode in SQL_WRITER_UNIVERSE
    )


def source_routine_caller_values_sql(routines: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for routine in routines:
        for helper, counts in routine.get("source_authority_calls", {}).items():
            rows.append("(" + ",".join([
                sql_literal(routine["canonical_regprocedure"]),
                sql_literal(helper),
                str(counts["lexical"]),
                str(counts["catalog"]),
            ]) + ")")
    return ",\n      ".join(rows)


def source_policy_caller_values_sql(policies: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for policy in policies:
        for helper, counts in policy.get("source_authority_calls", {}).items():
            rows.append("(" + ",".join([
                sql_literal(policy["relation"]),
                sql_literal(policy["policy"]),
                sql_literal(helper),
                str(counts["lexical"]),
                str(counts["catalog"]),
            ]) + ")")
    return ",\n      ".join(rows)


def source_view_authority_calls(document: dict[str, Any]) -> dict[str, dict[str, int]]:
    row = document["live_views"][0]
    _, source = source_text(row)
    pattern = re.compile(
        r"(?im)^CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.people_directory\b"
    )
    matches = list(pattern.finditer(source))
    require(matches, "people_directory source statement missing")
    line = row["source"]["line"]
    match = min(
        matches,
        key=lambda item: abs(source.count("\n", 0, item.start()) + 1 - line),
    )
    statement = source[match.start():statement_end(source, match.start())]
    return helper_call_profile(statement, SOURCE_AUTHORITY_HELPERS)


def policy_values_sql(policies: list[dict[str, Any]]) -> str:
    command = {"ALL": "*", "SELECT": "r", "INSERT": "a", "UPDATE": "w", "DELETE": "d"}
    rows = []
    for row in policies:
        rows.append("(" + ",".join([
            sql_literal(row["relation"]),
            sql_literal(row["policy"]),
            sql_literal(command[row["operation"]]),
            "true" if row["permissive"] else "false",
            sql_text_array(row["roles"]),
            sql_literal(row["source_catalog_fingerprint"]),
            sql_literal(row["final_catalog_fingerprint"]),
            "true" if row["disposition"] == "platform_admin_handoff" else "false",
        ]) + ")")
    return ",\n      ".join(rows)


def delete_guard_values_sql(guards: list[dict[str, Any]]) -> str:
    return ",\n      ".join(
        "(" + ",".join([
            sql_literal(row["relation"]),
            sql_literal(row["policy"]),
            sql_text_array(row["roles"]),
            sql_literal(row["final_catalog_fingerprint"]),
        ]) + ")"
        for row in guards
    )


def delete_guard_gate_sql(
    guards: list[dict[str, Any]],
    final_state_expression: str,
) -> str:
    require(len(guards) == 36, "ordinary ALL-policy delete guard universe is not 36")
    values = delete_guard_values_sql(guards)
    return f"""
  IF EXISTS (
    WITH expected(relation_name, policy_name, roles, fingerprint) AS (VALUES
      {values}
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid)
          AS actual_fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE (({final_state_expression}) AND (
         oid IS NULL
      OR polcmd <> 'd'::\"char\"
      OR polpermissive IS DISTINCT FROM false
      OR actual_roles IS DISTINCT FROM roles
      OR actual_fingerprint IS DISTINCT FROM fingerprint
    )) OR ((NOT ({final_state_expression})) AND oid IS NOT NULL)
  ) OR EXISTS (
    WITH expected(relation_name, policy_name) AS (VALUES
      {','.join('(' + sql_literal(row['relation']) + ',' + sql_literal(row['policy']) + ')' for row in guards)}
    )
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND pg_catalog.left(policy.polname, 17) = 'csa_delete_guard_'
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE expected.relation_name = namespace.nspname || '.' || relation.relname
          AND expected.policy_name = policy.polname
      )
  ) THEN
    RAISE EXCEPTION
      '00488 restrictive DELETE author-guard source/final universe drifted';
  END IF;
"""


def mutation_guard_values_sql(guards: list[dict[str, Any]]) -> str:
    command = {"UPDATE": "w", "DELETE": "d"}
    return ",\n      ".join(
        "(" + ",".join([
            sql_literal(row["relation"]),
            sql_literal(row["policy"]),
            sql_literal(command[row["operation"]]),
            sql_text_array(row["roles"]),
            sql_literal(row["final_catalog_fingerprint"]),
        ]) + ")"
        for row in guards
    )


def mutation_guard_gate_sql(
    guards: list[dict[str, Any]],
    final_state_expression: str,
) -> str:
    require(len(guards) == 14, "canonical mutation guard universe is not 14")
    values = mutation_guard_values_sql(guards)
    expected_pairs = ",".join(
        "(" + sql_literal(row["relation"]) + ","
        + sql_literal(row["policy"]) + ")"
        for row in guards
    )
    return f"""
  IF EXISTS (
    WITH expected(
      relation_name, policy_name, command, roles, fingerprint
    ) AS (VALUES
      {values}
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid)
          AS actual_fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE (({final_state_expression}) AND (
         oid IS NULL
      OR polcmd <> command::\"char\"
      OR polpermissive IS DISTINCT FROM false
      OR actual_roles IS DISTINCT FROM roles
      OR actual_fingerprint IS DISTINCT FROM fingerprint
    )) OR ((NOT ({final_state_expression})) AND oid IS NOT NULL)
  ) OR EXISTS (
    WITH expected(relation_name, policy_name) AS (VALUES
      {expected_pairs}
    )
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND pg_catalog.left(policy.polname, 11) = 'csa_author_'
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE expected.relation_name = namespace.nspname || '.' || relation.relname
          AND expected.policy_name = policy.polname
      )
  ) THEN
    RAISE EXCEPTION
      '00488 restrictive canonical mutation-guard source/final universe drifted';
  END IF;
"""


def affected_policy_universe(
    policies: list[dict[str, Any]],
    compatibility: list[dict[str, Any]],
    delete_guards: list[dict[str, Any]],
    mutation_guards: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in policies:
        if row["relation"] not in AFFECTED_AUTHORITY_RELATIONS:
            continue
        composed = dict(row)
        composed["source_present"] = True
        composed["final_present"] = True
        rows.append(composed)
    require(len(rows) == 14, "affected reviewed policy universe is not 14")
    rows.extend(compatibility)
    for row in (*delete_guards, *mutation_guards):
        if row["relation"] not in AFFECTED_AUTHORITY_RELATIONS:
            continue
        composed = dict(row)
        composed.update({
            "source_catalog_fingerprint": None,
            "source_present": False,
            "final_present": True,
        })
        rows.append(composed)
    keys = [(row["relation"], row["policy"]) for row in rows]
    require(
        len(rows) == len(set(keys)) == 49,
        "affected policy source/final universe is not 49 unique rows",
    )
    require(
        sum(row["source_present"] for row in rows) == 34,
        "affected policy source universe is not 34",
    )
    return sorted(rows, key=lambda row: (row["relation"], row["policy"]))


def affected_policy_gate_sql(
    policies: list[dict[str, Any]],
    final_state_expression: str,
) -> str:
    command = {
        "ALL": "*", "SELECT": "r", "INSERT": "a",
        "UPDATE": "w", "DELETE": "d",
    }
    values = ",\n      ".join(
        "(" + ",".join([
            sql_literal(row["relation"]),
            sql_literal(row["policy"]),
            sql_literal(command[row["operation"]]),
            "true" if row["permissive"] else "false",
            sql_text_array(row["roles"]),
            sql_nullable(row["source_catalog_fingerprint"]),
            sql_literal(row["final_catalog_fingerprint"]),
            "true" if row["source_present"] else "false",
            "true" if row["final_present"] else "false",
        ]) + ")"
        for row in policies
    )
    relations = ",".join(
        sql_literal(relation) for relation in AFFECTED_AUTHORITY_RELATIONS
    )
    return f"""
  IF EXISTS (
    WITH expected_all(
      relation_name, policy_name, command, permissive, roles,
      source_fingerprint, final_fingerprint, source_present, final_present
    ) AS (VALUES
      {values}
    ), expected AS (
      SELECT relation_name, policy_name, command, permissive, roles,
        CASE WHEN ({final_state_expression})
          THEN final_fingerprint ELSE source_fingerprint END AS fingerprint
      FROM expected_all
      WHERE CASE WHEN ({final_state_expression})
        THEN final_present ELSE source_present END
    ), actual AS (
      SELECT namespace.nspname || '.' || relation.relname AS relation_name,
        policy.polname AS policy_name,
        policy.polcmd::text AS command,
        policy.polpermissive AS permissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
      FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname || '.' || relation.relname IN ({relations})
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION
      '00488 affected snapshot/root policy tuple universe drifted';
  END IF;
"""


def reviewed_rls_relation_manifest(
    policies: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    relations = sorted({row["relation"] for row in policies})
    require(relations, "reviewed RLS relation universe is empty")
    return [
        {
            "relation": relation,
            "row_security_enabled": True,
            "force_row_security": False,
        }
        for relation in relations
    ]


def reviewed_rls_relation_gate_sql(
    policies: list[dict[str, Any]], label: str
) -> str:
    values = ",\n      ".join(
        "(" + ",".join((
            sql_literal(row["relation"]),
            "true" if row["row_security_enabled"] else "false",
            "true" if row["force_row_security"] else "false",
        )) + ")"
        for row in reviewed_rls_relation_manifest(policies)
    )
    return f"""
  IF EXISTS (
    WITH expected(
      relation_name, row_security_enabled, force_row_security
    ) AS (VALUES
      {values}
    ), actual AS (
      SELECT expected.*, relation.oid, relation.relrowsecurity,
             relation.relforcerowsecurity
      FROM expected
      LEFT JOIN pg_catalog.pg_class AS relation
        ON relation.oid = pg_catalog.to_regclass(expected.relation_name)
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR relrowsecurity IS DISTINCT FROM row_security_enabled
       OR relforcerowsecurity IS DISTINCT FROM force_row_security
  ) THEN
    RAISE EXCEPTION '00488 {label} reviewed relation RLS profile drifted';
  END IF;
"""


def trigger_values_sql(routines: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for routine in routines:
        for binding in routine["trigger_bindings"]:
            rows.append("(" + ",".join([
                sql_literal(binding["schema"]),
                sql_literal(binding["relation"]),
                sql_literal(binding["name"]),
                str(binding["type"]),
                sql_literal(binding["enabled"]),
                sql_literal(normalize_trigger_definition(binding["definition"])),
                sql_literal(binding["args_hex"]),
                sql_literal(routine["canonical_regprocedure"]),
            ]) + ")")
    return ",\n      ".join(rows)


def disposition_routine_values_sql(
    disposition_manifests: list[dict[str, Any]],
) -> str:
    return ",\n      ".join(
        "(" + sql_literal(row["canonical_regprocedure"]) + ","
        + sql_literal(row["final_body_sha256"]) + ")"
        for row in disposition_manifests
    )


def disposition_policy_values_sql(document: dict[str, Any]) -> str:
    command = {"ALL": "*", "SELECT": "r", "INSERT": "a", "UPDATE": "w", "DELETE": "d"}
    rows: list[str] = []
    for row in document["already_dispositioned"]["policies"]:
        pseudo = {
            "record_id": row["record_id"],
            "relation": row["relation"],
            "policy": row["replacement_policy"],
            "source": row["replacement_source"],
        }
        statement = extract_policy(pseudo)
        operation_match = re.search(r"(?is)\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b", statement)
        require(operation_match is not None, f"{row['record_id']}: replacement operation missing")
        role_match = re.search(
            r"(?is)\bTO\s+(.+?)(?=\s+(?:USING|WITH\s+CHECK)\b|\s*;)",
            statement,
        )
        require(role_match is not None, f"{row['record_id']}: replacement roles missing")
        roles = sorted(
            role.strip().strip('"')
            for role in role_match.group(1).split(",")
        )
        rows.append("(" + ",".join([
            sql_literal(row["relation"]),
            sql_literal(row["prior_policy"]),
            sql_literal(row["replacement_policy"]),
            sql_literal(command[operation_match.group(1).upper()]),
            "true",
            sql_text_array(roles),
            sql_nullable(policy_clause(statement, "USING")),
            sql_nullable(policy_clause(statement, r"WITH\s+CHECK")),
        ]) + ")")
    return ",\n      ".join(rows)


def snapshot_schema_preflight_sql() -> str:
    return """
  IF NOT final_state THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conname IN (
        'proposals_studio_id_fkey','designer_clients_studio_id_fkey',
        'leads_studio_id_fkey','client_decisions_studio_id_fkey',
        'saved_vendors_studio_id_fkey','phase_templates_studio_id_fkey'
      )
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'proposals_studio_id_idx','designer_clients_studio_id_idx',
          'leads_studio_id_idx','client_decisions_studio_id_idx',
          'saved_vendors_studio_id_idx','phase_templates_studio_id_idx',
          'idx_designer_clients_unique_profile_legacy_null_studio',
          'idx_designer_clients_unique_email_legacy_null_studio',
          'saved_vendors_studio_designer_vendor_key',
          'saved_vendors_designer_vendor_legacy_null_studio_key'
        )
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgname = 'guard_canonical_studio_snapshot'
    ) THEN
      RAISE EXCEPTION '00488 source snapshot schema contains partial final objects';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS index_row
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = index_row.relnamespace
      JOIN pg_catalog.pg_index AS index_meta ON index_meta.indexrelid = index_row.oid
      WHERE namespace.nspname = 'public'
        AND index_row.relname = 'idx_designer_clients_unique_profile'
        AND index_meta.indisunique
        AND index_meta.indisvalid
        AND index_meta.indexprs IS NULL
        AND index_meta.indpred IS NOT NULL
        AND (
          SELECT array_agg(attribute.attname ORDER BY key.ordinality)
          FROM pg_catalog.unnest(index_meta.indkey) WITH ORDINALITY AS key(attnum, ordinality)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = index_meta.indrelid AND attribute.attnum = key.attnum
        ) = ARRAY['designer_id','client_id']::name[]
        AND pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            index_meta.indpred, index_meta.indrelid
          )), '[[:space:]()]', '', 'g'
        ) LIKE '%client_idisnotnull%'
        AND pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            index_meta.indpred, index_meta.indrelid
          )), '[[:space:]()]', '', 'g'
        ) LIKE '%status<>''lead''%'
        AND pg_catalog.pg_get_expr(index_meta.indpred, index_meta.indrelid)
          !~* 'studio_id'
    ) THEN
      RAISE EXCEPTION '00488 source designer-client uniqueness drifted';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS index_row
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = index_row.relnamespace
      JOIN pg_catalog.pg_index AS index_meta ON index_meta.indexrelid = index_row.oid
      WHERE namespace.nspname = 'public'
        AND index_row.relname = 'idx_designer_clients_unique_email'
        AND index_meta.indisunique
        AND index_meta.indisvalid
        AND index_meta.indexprs IS NULL
        AND index_meta.indpred IS NOT NULL
        AND (
          SELECT array_agg(attribute.attname ORDER BY key.ordinality)
          FROM pg_catalog.unnest(index_meta.indkey) WITH ORDINALITY AS key(attnum, ordinality)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = index_meta.indrelid AND attribute.attnum = key.attnum
        ) = ARRAY['designer_id','client_email']::name[]
        AND pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            index_meta.indpred, index_meta.indrelid
          )), '[[:space:]()]', '', 'g'
        ) LIKE '%client_emailisnotnull%'
        AND pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(
            index_meta.indpred, index_meta.indrelid
          )), '[[:space:]()]', '', 'g'
        ) LIKE '%client_idisnull%'
        AND pg_catalog.pg_get_expr(index_meta.indpred, index_meta.indrelid)
          !~* 'studio_id'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
      WHERE constraint_row.conname = 'saved_vendors_designer_id_vendor_id_key'
        AND relation.oid = 'public.saved_vendors'::pg_catalog.regclass
        AND constraint_row.contype = 'u'
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND (
          SELECT array_agg(attribute.attname ORDER BY key.ordinality)
          FROM pg_catalog.unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinality)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
        ) = ARRAY['designer_id','vendor_id']::name[]
    ) THEN
      RAISE EXCEPTION '00488 source relationship/vendor uniqueness drifted';
    END IF;

    -- The broad compatibility checks above give a readable failure near the
    -- historical objects. This exact PG17 profile rejects same-name indexes
    -- whose predicate, table, access method, operator class, or collation was
    -- altered while retaining those broad tokens.
    IF EXISTS (
      WITH expected(
        index_name, keys, opclasses, collations, predicate
      ) AS (VALUES
        ('idx_designer_clients_unique_profile',
         ARRAY['designer_id','client_id']::name[],
         ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops']::text[],
         ARRAY['<none>','<none>']::text[],
         '((client_id IS NOT NULL) AND (status <> ''lead''::text))'),
        ('idx_designer_clients_unique_email',
         ARRAY['designer_id','client_email']::name[],
         ARRAY['pg_catalog.uuid_ops','pg_catalog.text_ops']::text[],
         ARRAY['<none>','pg_catalog.default']::text[],
         '((client_email IS NOT NULL) AND (client_id IS NULL))')
      )
      SELECT 1 FROM expected
      LEFT JOIN pg_catalog.pg_class AS index_row
        ON index_row.oid = pg_catalog.to_regclass(
          'public.' || expected.index_name
        )
      LEFT JOIN pg_catalog.pg_index AS index_meta
        ON index_meta.indexrelid = index_row.oid
      LEFT JOIN pg_catalog.pg_class AS table_row
        ON table_row.oid = index_meta.indrelid
      LEFT JOIN pg_catalog.pg_namespace AS table_namespace
        ON table_namespace.oid = table_row.relnamespace
      LEFT JOIN pg_catalog.pg_am AS access_method
        ON access_method.oid = index_row.relam
      WHERE index_meta.indexrelid IS NULL
         OR table_namespace.nspname IS DISTINCT FROM 'public'
         OR table_row.relname IS DISTINCT FROM 'designer_clients'
         OR index_row.relkind IS DISTINCT FROM 'i'
         OR access_method.amname IS DISTINCT FROM 'btree'
         OR index_row.reloptions IS NOT NULL
         OR NOT index_meta.indisunique
         OR index_meta.indisprimary
         OR index_meta.indisexclusion
         OR NOT index_meta.indimmediate
         OR index_meta.indisclustered
         OR NOT index_meta.indisvalid
         OR index_meta.indcheckxmin
         OR NOT index_meta.indisready
         OR NOT index_meta.indislive
         OR index_meta.indisreplident
         OR index_meta.indnullsnotdistinct
         OR index_meta.indexprs IS NOT NULL
         OR index_meta.indnatts <> pg_catalog.array_length(expected.keys, 1)
         OR index_meta.indnkeyatts <> pg_catalog.array_length(expected.keys, 1)
         OR (
           SELECT array_agg(attribute.attname ORDER BY key.ordinality)
           FROM pg_catalog.unnest(index_meta.indkey::smallint[])
                WITH ORDINALITY AS key(attnum, ordinality)
           JOIN pg_catalog.pg_attribute AS attribute
             ON attribute.attrelid = index_meta.indrelid
            AND attribute.attnum = key.attnum
         ) IS DISTINCT FROM expected.keys
         OR (
           SELECT pg_catalog.array_agg(
                    op_namespace.nspname || '.' || opclass.opcname
                    ORDER BY item.ordinality
                  )
           FROM pg_catalog.unnest(index_meta.indclass::oid[])
                WITH ORDINALITY AS item(opclass_oid, ordinality)
           JOIN pg_catalog.pg_opclass AS opclass
             ON opclass.oid = item.opclass_oid
           JOIN pg_catalog.pg_namespace AS op_namespace
             ON op_namespace.oid = opclass.opcnamespace
         ) IS DISTINCT FROM expected.opclasses
         OR (
           SELECT pg_catalog.array_agg(
                    CASE WHEN item.collation_oid = 0 THEN '<none>'
                         ELSE collation_namespace.nspname || '.' || collation.collname
                    END ORDER BY item.ordinality
                  )
           FROM pg_catalog.unnest(index_meta.indcollation::oid[])
                WITH ORDINALITY AS item(collation_oid, ordinality)
           LEFT JOIN pg_catalog.pg_collation AS collation
             ON collation.oid = item.collation_oid
           LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
             ON collation_namespace.oid = collation.collnamespace
         ) IS DISTINCT FROM expected.collations
         OR EXISTS (
           SELECT 1
           FROM pg_catalog.unnest(index_meta.indoption::smallint[])
                AS option(value)
           WHERE option.value <> 0
         )
         OR pg_catalog.pg_get_expr(index_meta.indpred, index_meta.indrelid)
              IS DISTINCT FROM expected.predicate
         OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_constraint AS index_constraint
           WHERE index_constraint.conindid = index_meta.indexrelid
         )
    ) THEN
      RAISE EXCEPTION
        '00488 exact source designer-client index profile drifted';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_class AS index_row
        ON index_row.oid = constraint_row.conindid
      JOIN pg_catalog.pg_index AS index_meta
        ON index_meta.indexrelid = index_row.oid
      JOIN pg_catalog.pg_am AS access_method
        ON access_method.oid = index_row.relam
      WHERE constraint_row.conname =
              'saved_vendors_designer_id_vendor_id_key'
        AND constraint_row.connamespace =
              'public'::pg_catalog.regnamespace
        AND relation.oid = 'public.saved_vendors'::pg_catalog.regclass
        AND constraint_row.contype = 'u'
        AND constraint_row.contypid = 0
        AND constraint_row.conparentid = 0
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.conislocal
        AND constraint_row.coninhcount = 0
        AND NOT constraint_row.connoinherit
        AND index_row.relname =
              'saved_vendors_designer_id_vendor_id_key'
        AND index_row.relkind = 'i'
        AND index_row.reloptions IS NULL
        AND access_method.amname = 'btree'
        AND index_meta.indrelid = relation.oid
        AND index_meta.indisunique
        AND NOT index_meta.indisprimary
        AND NOT index_meta.indisexclusion
        AND index_meta.indimmediate
        AND NOT index_meta.indisclustered
        AND index_meta.indisvalid
        AND NOT index_meta.indcheckxmin
        AND index_meta.indisready
        AND index_meta.indislive
        AND NOT index_meta.indisreplident
        AND NOT index_meta.indnullsnotdistinct
        AND index_meta.indnatts = 2
        AND index_meta.indnkeyatts = 2
        AND index_meta.indexprs IS NULL
        AND index_meta.indpred IS NULL
        AND (
          SELECT array_agg(attribute.attname ORDER BY key.ordinality)
          FROM pg_catalog.unnest(index_meta.indkey::smallint[])
               WITH ORDINALITY AS key(attnum, ordinality)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = relation.oid
           AND attribute.attnum = key.attnum
        ) = ARRAY['designer_id','vendor_id']::name[]
        AND (
          SELECT pg_catalog.array_agg(
                   op_namespace.nspname || '.' || opclass.opcname
                   ORDER BY item.ordinality
                 )
          FROM pg_catalog.unnest(index_meta.indclass::oid[])
               WITH ORDINALITY AS item(opclass_oid, ordinality)
          JOIN pg_catalog.pg_opclass AS opclass
            ON opclass.oid = item.opclass_oid
          JOIN pg_catalog.pg_namespace AS op_namespace
            ON op_namespace.oid = opclass.opcnamespace
        ) = ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops']::text[]
        AND (
          SELECT pg_catalog.array_agg(item.collation_oid ORDER BY item.ordinality)
          FROM pg_catalog.unnest(index_meta.indcollation::oid[])
               WITH ORDINALITY AS item(collation_oid, ordinality)
        ) = ARRAY[0::oid,0::oid]::oid[]
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(index_meta.indoption::smallint[])
               AS option(value)
          WHERE option.value <> 0
        )
        AND (
          SELECT array_agg(attribute.attname ORDER BY key.ordinality)
          FROM pg_catalog.unnest(constraint_row.conkey)
               WITH ORDINALITY AS key(attnum, ordinality)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = relation.oid
           AND attribute.attnum = key.attnum
        ) = ARRAY['designer_id','vendor_id']::name[]
    ) THEN
      RAISE EXCEPTION '00488 exact source saved-vendor uniqueness drifted';
    END IF;
  ELSE
    IF EXISTS (
      WITH expected(table_name) AS (VALUES
        ('proposals'),('designer_clients'),('leads'),('client_decisions'),
        ('saved_vendors'),('phase_templates')
      )
      SELECT 1
      FROM expected
      LEFT JOIN pg_catalog.pg_class AS relation
        ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
      LEFT JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attname = 'studio_id'
       AND NOT attribute.attisdropped
      WHERE attribute.attnum IS NULL
         OR attribute.atttypid <> 'uuid'::pg_catalog.regtype
         OR attribute.attnotnull
         OR attribute.atthasdef
    ) THEN
      RAISE EXCEPTION '00488 final snapshot column profile drifted';
    END IF;
  END IF;
"""


def snapshot_data_consistency_preflight_sql() -> str:
    return """
  -- Source has no snapshot columns.  Parse and execute these anti-joins only
  -- after the catalog has proved the complete final schema is present.
  IF final_state THEN
    EXECUTE $c00488_proposal_snapshot_preflight$
      SELECT EXISTS (
        SELECT 1
        FROM public.proposals AS proposal
        LEFT JOIN public.projects AS project ON project.id = proposal.project_id
        LEFT JOIN public.designer_clients AS relationship
          ON relationship.id = proposal.designer_client_id
        WHERE (proposal.project_id IS NOT NULL AND (
                 project.id IS NULL
                 OR proposal.studio_id IS DISTINCT FROM project.studio_id
               ))
           OR (proposal.designer_client_id IS NOT NULL AND (
                 relationship.id IS NULL
                 OR proposal.studio_id IS DISTINCT FROM relationship.studio_id
               ))
      )
    $c00488_proposal_snapshot_preflight$
    INTO snapshot_data_mismatch;
    IF snapshot_data_mismatch THEN
      RAISE EXCEPTION '00488 proposal project/relationship studio mismatch';
    END IF;

    EXECUTE $c00488_decision_snapshot_preflight$
      SELECT EXISTS (
        SELECT 1
        FROM public.client_decisions AS decision
        LEFT JOIN public.projects AS project ON project.id = decision.project_id
        LEFT JOIN public.designer_clients AS relationship
          ON relationship.id = decision.designer_client_id
        WHERE (decision.project_id IS NOT NULL AND (
                 project.id IS NULL
                 OR decision.studio_id IS DISTINCT FROM project.studio_id
               ))
           OR relationship.id IS NULL
           OR decision.studio_id IS DISTINCT FROM relationship.studio_id
      )
    $c00488_decision_snapshot_preflight$
    INTO snapshot_data_mismatch;
    IF snapshot_data_mismatch THEN
      RAISE EXCEPTION '00488 decision project/relationship studio mismatch';
    END IF;

    EXECUTE $c00488_relationship_snapshot_preflight$
      SELECT EXISTS (
        SELECT 1
        FROM public.designer_clients AS relationship
        JOIN public.leads AS lead ON lead.id = relationship.lead_id
        WHERE relationship.studio_id IS DISTINCT FROM lead.studio_id
      )
    $c00488_relationship_snapshot_preflight$
    INTO snapshot_data_mismatch;
    IF snapshot_data_mismatch THEN
      RAISE EXCEPTION '00488 relationship/lead studio mismatch';
    END IF;

    EXECUTE $c00488_phase_template_snapshot_preflight$
      SELECT EXISTS (
        SELECT 1
        FROM public.phase_templates AS template
        LEFT JOIN public.organizations AS studio ON studio.id = template.studio_id
        WHERE (template.is_system AND template.studio_id IS NOT NULL)
           OR (NOT template.is_system AND template.studio_id IS NOT NULL
               AND (template.designer_id IS NULL
                    OR studio.type IS DISTINCT FROM 'design_studio'))
      )
    $c00488_phase_template_snapshot_preflight$
    INTO snapshot_data_mismatch;
    IF snapshot_data_mismatch THEN
      RAISE EXCEPTION '00488 phase-template studio snapshot is invalid';
    END IF;
  END IF;
"""


def snapshot_schema_postflight_sql() -> str:
    return """
  IF EXISTS (
    WITH expected(table_name, constraint_name, index_name) AS (VALUES
      ('proposals','proposals_studio_id_fkey','proposals_studio_id_idx'),
      ('designer_clients','designer_clients_studio_id_fkey','designer_clients_studio_id_idx'),
      ('leads','leads_studio_id_fkey','leads_studio_id_idx'),
      ('client_decisions','client_decisions_studio_id_fkey','client_decisions_studio_id_idx'),
      ('saved_vendors','saved_vendors_studio_id_fkey','saved_vendors_studio_id_idx'),
      ('phase_templates','phase_templates_studio_id_fkey','phase_templates_studio_id_idx')
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.table_name)
    LEFT JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = 'studio_id' AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = relation.oid
     AND constraint_row.conname = expected.constraint_name
    LEFT JOIN pg_catalog.pg_class AS referenced_relation
      ON referenced_relation.oid = constraint_row.confrelid
    LEFT JOIN pg_catalog.pg_attribute AS referenced_attribute
      ON referenced_attribute.attrelid = referenced_relation.oid
     AND referenced_attribute.attname = 'id'
     AND NOT referenced_attribute.attisdropped
    LEFT JOIN pg_catalog.pg_class AS index_row
      ON index_row.oid = pg_catalog.to_regclass('public.' || expected.index_name)
    LEFT JOIN pg_catalog.pg_index AS index_meta
      ON index_meta.indexrelid = index_row.oid
    LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_row.relam
    WHERE attribute.attnum IS NULL
       OR attribute.atttypid <> 'uuid'::pg_catalog.regtype
       OR attribute.attnotnull OR attribute.atthasdef
       OR constraint_row.oid IS NULL
       OR constraint_row.connamespace <> 'public'::pg_catalog.regnamespace
       OR constraint_row.contype <> 'f'
       OR constraint_row.contypid <> 0
       OR NOT constraint_row.convalidated
       OR constraint_row.confrelid <> 'public.organizations'::pg_catalog.regclass
       OR constraint_row.conindid <>
            'public.organizations_pkey'::pg_catalog.regclass
       OR referenced_attribute.attnum IS NULL
       OR constraint_row.confkey
            <> ARRAY[referenced_attribute.attnum]::smallint[]
       OR constraint_row.confupdtype <> 'a'
       OR constraint_row.confdeltype <> 'r'
       OR constraint_row.confmatchtype <> 's'
       OR constraint_row.condeferrable
       OR constraint_row.condeferred
       OR NOT constraint_row.conislocal
       OR constraint_row.coninhcount <> 0
       OR constraint_row.connoinherit
       OR constraint_row.conparentid <> 0
       OR constraint_row.confdelsetcols IS NOT NULL
       OR constraint_row.conkey <> ARRAY[attribute.attnum]::smallint[]
       OR constraint_row.conpfeqop <> ARRAY[
            ('=(uuid,uuid)'::pg_catalog.regoperator)::oid
          ]::oid[]
       OR constraint_row.conppeqop <> ARRAY[
            ('=(uuid,uuid)'::pg_catalog.regoperator)::oid
          ]::oid[]
       OR constraint_row.conffeqop <> ARRAY[
            ('=(uuid,uuid)'::pg_catalog.regoperator)::oid
          ]::oid[]
       OR constraint_row.conexclop IS NOT NULL
       OR constraint_row.conbin IS NOT NULL
       OR index_meta.indexrelid IS NULL
       OR index_meta.indrelid IS DISTINCT FROM relation.oid
       OR index_row.relkind IS DISTINCT FROM 'i'
       OR access_method.amname IS DISTINCT FROM 'btree'
       OR index_row.reloptions IS NOT NULL
       OR index_meta.indisunique
       OR index_meta.indisprimary
       OR index_meta.indisexclusion
       OR NOT index_meta.indimmediate
       OR index_meta.indisclustered
       OR NOT index_meta.indisvalid
       OR index_meta.indcheckxmin
       OR NOT index_meta.indisready
       OR NOT index_meta.indislive
       OR index_meta.indisreplident
       OR index_meta.indnullsnotdistinct
       OR index_meta.indnatts <> 1
       OR index_meta.indnkeyatts <> 1
       OR index_meta.indpred IS NOT NULL OR index_meta.indexprs IS NOT NULL
       OR (
         SELECT array_agg(key.attnum ORDER BY key.ordinality)
         FROM pg_catalog.unnest(index_meta.indkey::smallint[])
              WITH ORDINALITY AS key(attnum, ordinality)
       ) IS DISTINCT FROM ARRAY[attribute.attnum]::smallint[]
       OR (
         SELECT pg_catalog.array_agg(
                  op_namespace.nspname || '.' || opclass.opcname
                  ORDER BY item.ordinality
                )
         FROM pg_catalog.unnest(index_meta.indclass::oid[])
              WITH ORDINALITY AS item(opclass_oid, ordinality)
         JOIN pg_catalog.pg_opclass AS opclass ON opclass.oid = item.opclass_oid
         JOIN pg_catalog.pg_namespace AS op_namespace
           ON op_namespace.oid = opclass.opcnamespace
       ) IS DISTINCT FROM ARRAY['pg_catalog.uuid_ops']::text[]
       OR (
         SELECT pg_catalog.array_agg(item.collation_oid ORDER BY item.ordinality)
         FROM pg_catalog.unnest(index_meta.indcollation::oid[])
              WITH ORDINALITY AS item(collation_oid, ordinality)
       ) IS DISTINCT FROM ARRAY[0::oid]::oid[]
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.unnest(index_meta.indoption::smallint[]) AS option(value)
         WHERE option.value <> 0
       )
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint AS index_constraint
         WHERE index_constraint.conindid = index_meta.indexrelid
       )
  ) THEN
    RAISE EXCEPTION '00488 final snapshot schema/FK/index profile failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND constraint_row.conname IN (
        'proposals_studio_id_fkey','designer_clients_studio_id_fkey',
        'leads_studio_id_fkey','client_decisions_studio_id_fkey',
        'saved_vendors_studio_id_fkey','phase_templates_studio_id_fkey'
      )
      AND (relation.relname, constraint_row.conname) NOT IN (
        ('proposals','proposals_studio_id_fkey'),
        ('designer_clients','designer_clients_studio_id_fkey'),
        ('leads','leads_studio_id_fkey'),
        ('client_decisions','client_decisions_studio_id_fkey'),
        ('saved_vendors','saved_vendors_studio_id_fkey'),
        ('phase_templates','phase_templates_studio_id_fkey')
      )
  ) THEN
    RAISE EXCEPTION '00488 snapshot FK reverse anti-join failed';
  END IF;

  IF EXISTS (
    WITH expected(relation_name) AS (VALUES
      ('proposals'),('designer_clients'),('leads'),('client_decisions'),
      ('saved_vendors'),('phase_templates')
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = relation.oid
     AND trigger_row.tgname = 'guard_canonical_studio_snapshot'
     AND NOT trigger_row.tgisinternal
    WHERE trigger_row.oid IS NULL
       OR trigger_row.tgtype <> 23
       OR trigger_row.tgenabled <> 'O'
       OR trigger_row.tgnargs <> 0
       OR trigger_row.tgargs <> ''::bytea
       OR trigger_row.tgqual IS NOT NULL
       OR trigger_row.tgattr <> ''::pg_catalog.int2vector
       OR trigger_row.tgconstraint <> 0
       OR trigger_row.tgconstrrelid <> 0
       OR trigger_row.tgdeferrable
       OR trigger_row.tginitdeferred
       OR trigger_row.tgparentid <> 0
       OR trigger_row.tgfoid <> 'public.guard_canonical_studio_snapshot()'::pg_catalog.regprocedure
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND (
        trigger_row.tgfoid =
          'public.guard_canonical_studio_snapshot()'::pg_catalog.regprocedure
        OR trigger_row.tgname = 'guard_canonical_studio_snapshot'
      )
      AND (
        namespace.nspname <> 'public'
        OR relation.relname NOT IN (
          'proposals','designer_clients','leads','client_decisions',
          'saved_vendors','phase_templates'
        )
        OR trigger_row.tgname <> 'guard_canonical_studio_snapshot'
        OR trigger_row.tgfoid <>
          'public.guard_canonical_studio_snapshot()'::pg_catalog.regprocedure
      )
  ) THEN
    RAISE EXCEPTION '00488 snapshot trigger bidirectional postflight failed';
  END IF;

  IF EXISTS (
    WITH expected(
      index_name, relation_name, keys, opclasses, collations, predicate
    ) AS (VALUES
      ('idx_designer_clients_unique_profile',
       'designer_clients',
       ARRAY['studio_id','designer_id','client_id']::name[],
       ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops','pg_catalog.uuid_ops']::text[],
       ARRAY['<none>','<none>','<none>']::text[],
       '((studio_id IS NOT NULL) AND (client_id IS NOT NULL) AND (status <> ''lead''::text))'),
      ('idx_designer_clients_unique_profile_legacy_null_studio',
       'designer_clients',
       ARRAY['designer_id','client_id']::name[],
       ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops']::text[],
       ARRAY['<none>','<none>']::text[],
       '((studio_id IS NULL) AND (client_id IS NOT NULL) AND (status <> ''lead''::text))'),
      ('idx_designer_clients_unique_email',
       'designer_clients',
       ARRAY['studio_id','designer_id','client_email']::name[],
       ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops','pg_catalog.text_ops']::text[],
       ARRAY['<none>','<none>','pg_catalog.default']::text[],
       '((studio_id IS NOT NULL) AND (client_email IS NOT NULL) AND (client_id IS NULL))'),
      ('idx_designer_clients_unique_email_legacy_null_studio',
       'designer_clients',
       ARRAY['designer_id','client_email']::name[],
       ARRAY['pg_catalog.uuid_ops','pg_catalog.text_ops']::text[],
       ARRAY['<none>','pg_catalog.default']::text[],
       '((studio_id IS NULL) AND (client_email IS NOT NULL) AND (client_id IS NULL))'),
      ('saved_vendors_studio_designer_vendor_key',
       'saved_vendors',
       ARRAY['studio_id','designer_id','vendor_id']::name[],
       ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops','pg_catalog.uuid_ops']::text[],
       ARRAY['<none>','<none>','<none>']::text[],
       '(studio_id IS NOT NULL)'),
      ('saved_vendors_designer_vendor_legacy_null_studio_key',
       'saved_vendors',
       ARRAY['designer_id','vendor_id']::name[],
       ARRAY['pg_catalog.uuid_ops','pg_catalog.uuid_ops']::text[],
       ARRAY['<none>','<none>']::text[],
       '(studio_id IS NULL)')
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_class AS index_row
      ON index_row.oid = pg_catalog.to_regclass('public.' || expected.index_name)
    LEFT JOIN pg_catalog.pg_index AS index_meta ON index_meta.indexrelid = index_row.oid
    LEFT JOIN pg_catalog.pg_class AS table_row ON table_row.oid = index_meta.indrelid
    LEFT JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_row.relnamespace
    LEFT JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_row.relam
    WHERE index_meta.indexrelid IS NULL
       OR table_namespace.nspname IS DISTINCT FROM 'public'
       OR table_row.relname IS DISTINCT FROM expected.relation_name
       OR index_row.relkind IS DISTINCT FROM 'i'
       OR access_method.amname IS DISTINCT FROM 'btree'
       OR index_row.reloptions IS NOT NULL
       OR NOT index_meta.indisunique
       OR index_meta.indisprimary
       OR index_meta.indisexclusion
       OR NOT index_meta.indimmediate
       OR index_meta.indisclustered
       OR NOT index_meta.indisvalid
       OR index_meta.indcheckxmin
       OR NOT index_meta.indisready
       OR NOT index_meta.indislive
       OR index_meta.indisreplident
       OR index_meta.indnullsnotdistinct
       OR index_meta.indexprs IS NOT NULL
       OR index_meta.indnatts <> pg_catalog.array_length(expected.keys, 1)
       OR index_meta.indnkeyatts <> pg_catalog.array_length(expected.keys, 1)
       OR (
         SELECT array_agg(attribute.attname ORDER BY key.ordinality)
         FROM pg_catalog.unnest(index_meta.indkey::smallint[])
              WITH ORDINALITY AS key(attnum, ordinality)
         JOIN pg_catalog.pg_attribute AS attribute
           ON attribute.attrelid = index_meta.indrelid AND attribute.attnum = key.attnum
       ) IS DISTINCT FROM expected.keys
       OR (
         SELECT pg_catalog.array_agg(
                  op_namespace.nspname || '.' || opclass.opcname
                  ORDER BY item.ordinality
                )
         FROM pg_catalog.unnest(index_meta.indclass::oid[])
              WITH ORDINALITY AS item(opclass_oid, ordinality)
         JOIN pg_catalog.pg_opclass AS opclass ON opclass.oid = item.opclass_oid
         JOIN pg_catalog.pg_namespace AS op_namespace
           ON op_namespace.oid = opclass.opcnamespace
       ) IS DISTINCT FROM expected.opclasses
       OR (
         SELECT pg_catalog.array_agg(
                  CASE WHEN item.collation_oid = 0 THEN '<none>'
                       ELSE collation_namespace.nspname || '.' || collation.collname
                  END ORDER BY item.ordinality
                )
         FROM pg_catalog.unnest(index_meta.indcollation::oid[])
              WITH ORDINALITY AS item(collation_oid, ordinality)
         LEFT JOIN pg_catalog.pg_collation AS collation
           ON collation.oid = item.collation_oid
         LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
           ON collation_namespace.oid = collation.collnamespace
       ) IS DISTINCT FROM expected.collations
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.unnest(index_meta.indoption::smallint[]) AS option(value)
         WHERE option.value <> 0
       )
       OR pg_catalog.pg_get_expr(index_meta.indpred, index_meta.indrelid)
            IS DISTINCT FROM expected.predicate
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
         WHERE constraint_row.conindid = index_meta.indexrelid
       )
  ) THEN
    RAISE EXCEPTION '00488 exact/legacy workspace uniqueness postflight failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.saved_vendors'::pg_catalog.regclass
      AND constraint_row.conname = 'saved_vendors_designer_id_vendor_id_key'
  ) THEN
    RAISE EXCEPTION '00488 legacy saved-vendor uniqueness survived';
  END IF;
"""


def storage_rollback_catalog_gate_sql(
    policies: list[dict[str, Any]],
    surfaces: list[dict[str, Any]],
    dynamic_routines: list[dict[str, Any]],
    *,
    required_state: str,
    include_lexer: bool,
) -> str:
    require(required_state in ("either", "source"), "invalid storage rollback state")
    require(len(policies) == 9, "storage rollback requires nine policies")
    policy_values = policy_values_sql(policies)
    helper_signatures = {
        "public._can_read_studio_snapshot(uuid,uuid)",
        "public._lock_designer_studio_authority(uuid,uuid)",
        "public._can_author_studio_snapshot(uuid,uuid)",
        "public.is_studio_comember(uuid)",
        "public.is_design_studio_comember(uuid)",
        "public._can_author_proposal(uuid)",
        "public.is_active_studio_member(uuid)",
    }
    helper_surfaces = [
        row for row in surfaces
        if row["canonical_regprocedure"] in helper_signatures
    ]
    require(len(helper_surfaces) == 7, "storage rollback helper surface is not exact")
    surface_values = surface_values_sql(helper_surfaces)
    source_policy_callers = source_policy_caller_values_sql(policies)
    required_guard = ""
    if required_state == "source":
        required_guard = """
  IF NOT source_state THEN
    RAISE EXCEPTION '00488 storage rollback expected exact source policies';
  END IF;
"""
    prefix = catalog_lexer_sql() if include_lexer else ""
    return prefix + f"""
DO $canonical_studio_storage_rollback_gate$
DECLARE
  source_state boolean;
  final_state boolean;
BEGIN
  IF NOT COALESCE((
    SELECT role_row.rolsuper
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user
  ), false) THEN
    RAISE EXCEPTION '00488 storage rollback requires a platform administrator';
  END IF;
{reviewed_rls_relation_gate_sql(policies, "storage rollback")}

{dynamic_routine_contract_sql(dynamic_routines, "'final'")}
{dynamic_invoice_core_dependency_sql()}

  WITH expected(
    relation_name, policy_name, command, permissive, roles,
    source_fingerprint, final_fingerprint, platform_handoff
  ) AS (VALUES
    {policy_values}
  ), actual AS (
    SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
      ARRAY(
        SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                    ELSE role_row.rolname::text END
        FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
        LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
        ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
      ) AS actual_roles,
      pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
    FROM expected
    LEFT JOIN pg_catalog.pg_policy AS policy
      ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
     AND policy.polname = expected.policy_name
  )
  SELECT
    COALESCE(bool_and(
      oid IS NOT NULL AND polcmd = command::"char"
      AND polpermissive IS NOT DISTINCT FROM permissive
      AND actual_roles IS NOT DISTINCT FROM roles
      AND fingerprint = source_fingerprint
    ), false),
    COALESCE(bool_and(
      oid IS NOT NULL AND polcmd = command::"char"
      AND polpermissive IS NOT DISTINCT FROM permissive
      AND actual_roles IS NOT DISTINCT FROM roles
      AND fingerprint = final_fingerprint
    ), false)
  INTO source_state, final_state
  FROM actual;

  IF source_state = final_state THEN
    RAISE EXCEPTION
      '00488 storage policies are neither one exact reviewed state nor uniquely classified';
  END IF;
{required_guard}

  IF EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), expected AS (
      SELECT *,
        signature IN (
          'public.is_studio_comember(uuid)',
          'public.is_design_studio_comember(uuid)',
          'public._can_author_proposal(uuid)',
          'public.is_active_studio_member(uuid)'
        ) AS compatibility
      FROM states
      WHERE state_name = 'final'
    ), actual AS (
      SELECT expected.*, routine.oid, owner.rolname AS actual_owner,
             language.lanname AS actual_language,
             pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
             pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             routine.prokind, routine.prosecdef, routine.proleakproof,
             routine.proisstrict, routine.proparallel, routine.provolatile,
             routine.proretset, routine.proconfig
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    )
    SELECT 1 FROM actual
    WHERE (compatibility AND final_state AND oid IS NOT NULL)
       OR ((NOT compatibility OR source_state) AND (
            oid IS NULL
         OR actual_owner IS DISTINCT FROM owner_name
         OR actual_language IS DISTINCT FROM language_name
         OR prokind IS DISTINCT FROM kind::"char"
         OR prosecdef IS DISTINCT FROM security_definer
         OR proleakproof IS DISTINCT FROM leakproof
         OR proisstrict IS DISTINCT FROM strict
         OR proparallel IS DISTINCT FROM parallel::"char"
         OR provolatile IS DISTINCT FROM volatility::"char"
         OR proretset IS DISTINCT FROM returns_set
         OR actual_result IS DISTINCT FROM result_type
         OR actual_arguments IS DISTINCT FROM arguments
         OR proconfig IS DISTINCT FROM config
         OR actual_body_sha256 IS DISTINCT FROM body_sha256
       ))
  ) OR EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), expected AS (
      SELECT * FROM states
      WHERE state_name = 'final'
        AND (source_state OR signature NOT IN (
          'public.is_studio_comember(uuid)',
          'public.is_design_studio_comember(uuid)',
          'public._can_author_proposal(uuid)',
          'public.is_active_studio_member(uuid)'
        ))
    )
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        '_can_read_studio_snapshot','_lock_designer_studio_authority',
        '_can_author_studio_snapshot','is_studio_comember',
        'is_design_studio_comember','_can_author_proposal',
        'is_active_studio_member'
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = routine.oid
      )
  ) THEN
    RAISE EXCEPTION '00488 storage rollback helper profile/overload gate failed';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), chosen AS (
      SELECT * FROM states
      WHERE state_name = 'final'
        AND (source_state OR signature NOT IN (
          'public.is_studio_comember(uuid)',
          'public.is_design_studio_comember(uuid)',
          'public._can_author_proposal(uuid)',
          'public.is_active_studio_member(uuid)'
        ))
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM chosen
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
    ), actual AS (
      SELECT chosen.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
             grantor.rolname AS grantor, acl.privilege_type, acl.is_grantable
      FROM chosen
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(chosen.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 storage rollback helper ACL/grantor gate failed';
  END IF;

  IF final_state AND (
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      CROSS JOIN pg_catalog.unnest(ARRAY[
        'is_studio_comember','is_design_studio_comember',
        '_can_author_proposal','is_active_studio_member'
      ]::text[]) AS helper(name)
      WHERE namespace.nspname IN ('public','app_private')
        AND (
          pg_temp._00488_call_count(routine.prosrc, helper.name) > 0
          OR pg_temp._00488_dynamic_mentions(routine.prosrc, helper.name)
        )
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS policy
      CROSS JOIN pg_catalog.unnest(ARRAY[
        'is_studio_comember','is_design_studio_comember',
        '_can_author_proposal','is_active_studio_member'
      ]::text[]) AS helper(name)
      WHERE pg_temp._00488_call_count(
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
          || ' ' || COALESCE(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
          ), helper.name
      ) > 0
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.unnest(ARRAY[
        'is_studio_comember','is_design_studio_comember',
        '_can_author_proposal','is_active_studio_member'
      ]::text[]) AS helper(name)
      WHERE pg_temp._00488_call_count(
        pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
        helper.name
      ) > 0
    )
  ) THEN
    RAISE EXCEPTION '00488 storage final legacy-helper caller closure failed';
  END IF;

  IF source_state AND (
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      CROSS JOIN pg_catalog.unnest(ARRAY[
        'is_studio_comember','is_design_studio_comember',
        '_can_author_proposal','is_active_studio_member'
      ]::text[]) AS helper(name)
      WHERE namespace.nspname IN ('public','app_private')
        AND (
          pg_temp._00488_call_count(routine.prosrc, helper.name) > 0
          OR pg_temp._00488_dynamic_mentions(routine.prosrc, helper.name)
        )
    ) OR EXISTS (
      WITH expected(
        relation_name, policy_name, helper_name,
        lexical_call_count, catalog_call_count
      ) AS (VALUES
        {source_policy_callers}
      ), helper(helper_name) AS (VALUES
        ('is_studio_comember'),('is_design_studio_comember'),
        ('_can_author_proposal'),('is_active_studio_member')
      ), actual AS (
        SELECT namespace.nspname || '.' || relation.relname AS relation_name,
               policy.polname AS policy_name, helper.helper_name,
               pg_temp._00488_call_count(
                 COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
                   || ' ' || COALESCE(
                     pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
                   ), helper.helper_name
               ) AS call_count
        FROM pg_catalog.pg_policy AS policy
        JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN helper
      )
      (SELECT relation_name, policy_name, helper_name, catalog_call_count FROM expected
       EXCEPT SELECT relation_name, policy_name, helper_name, call_count
       FROM actual WHERE call_count > 0)
      UNION ALL
      (SELECT relation_name, policy_name, helper_name, call_count
       FROM actual WHERE call_count > 0
       EXCEPT SELECT relation_name, policy_name, helper_name, catalog_call_count
       FROM expected)
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.unnest(ARRAY[
        'is_studio_comember','is_design_studio_comember',
        '_can_author_proposal','is_active_studio_member'
      ]::text[]) AS helper(name)
      WHERE pg_temp._00488_call_count(
        pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
        helper.name
      ) > 0
    )
  ) THEN
    RAISE EXCEPTION '00488 storage source legacy-helper caller universe failed';
  END IF;

  IF EXISTS (
    WITH expected(policy_name) AS (VALUES
      {','.join('(' + sql_literal(row['policy']) + ')' for row in policies)}
    )
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::pg_catalog.regclass
      AND (
        pg_temp._00488_call_count(
          COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
            || ' ' || COALESCE(
              pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
            ), '_can_read_studio_snapshot'
        ) > 0
        OR pg_temp._00488_call_count(
          COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
            || ' ' || COALESCE(
              pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
            ), '_can_author_studio_snapshot'
        ) > 0
      )
      AND (source_state OR NOT EXISTS (
        SELECT 1 FROM expected WHERE expected.policy_name = policy.polname
      ))
  ) THEN
    RAISE EXCEPTION '00488 storage canonical-helper reverse caller gate failed';
  END IF;
{snapshot_schema_postflight_sql()}
END;
$canonical_studio_storage_rollback_gate$;
"""


def storage_source_policy_sentinel_sql(policies: list[dict[str, Any]]) -> str:
    require(len(policies) == 9, "ordinary rollback requires nine storage policies")
    policy_values = policy_values_sql(policies)
    return f"""
DO $canonical_studio_storage_source_sentinel$
BEGIN
  IF EXISTS (
    WITH expected(
      relation_name, policy_name, command, permissive, roles,
      source_fingerprint, final_fingerprint, platform_handoff
    ) AS (VALUES
      {policy_values}
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR fingerprint <> source_fingerprint
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::pg_catalog.regclass
      AND (
        pg_temp._00488_call_count(
          COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
            || ' ' || COALESCE(
              pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
            ), '_can_read_studio_snapshot'
        ) > 0
        OR pg_temp._00488_call_count(
          COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
            || ' ' || COALESCE(
              pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
            ), '_can_author_studio_snapshot'
        ) > 0
      )
  ) THEN
    RAISE EXCEPTION
      '00488 ordinary rollback requires exact source storage policies first';
  END IF;
END;
$canonical_studio_storage_source_sentinel$;
"""


def catalog_lexer_sql() -> str:
    """Temporary catalog lexer used by both source and final gates.

    It mirrors ``sql_code_mask``: comments and data literals disappear,
    quoted identifiers remain quoted code, and unknown dynamic SQL fails
    closed for every protected authority/table token.
    """
    lexer = r"""
DO $c00488_policy_fingerprint_environment$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR current_setting('server_encoding') IS DISTINCT FROM 'UTF8'
     OR current_setting('standard_conforming_strings') IS DISTINCT FROM 'on'
     OR current_setting('quote_all_identifiers') IS DISTINCT FROM 'off'
  THEN
    RAISE EXCEPTION
      '00488 policy fingerprint environment must be PostgreSQL 17/UTF8 with pinned deparse settings';
  END IF;
END;
$c00488_policy_fingerprint_environment$;

CREATE OR REPLACE FUNCTION pg_temp._00488_mask_sql(
  p_source text,
  p_preserve_quoted_identifiers boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_mask_sql$
DECLARE
  cursor_position integer := 1;
  source_length integer := pg_catalog.char_length(COALESCE(p_source, ''));
  block_depth integer;
  dollar_tag text;
  dollar_candidate text;
  dollar_character text;
  dollar_position integer;
  dollar_valid boolean;
  close_offset integer;
  result text := '';
  character text;
  escape_string boolean;
  string_closed boolean;
BEGIN
  WHILE cursor_position <= source_length LOOP
    IF pg_catalog.substr(p_source, cursor_position, 2) = '--' THEN
      cursor_position := cursor_position + 2;
      WHILE cursor_position <= source_length
        AND pg_catalog.substr(p_source, cursor_position, 1) <> pg_catalog.chr(10)
      LOOP
        cursor_position := cursor_position + 1;
      END LOOP;
      result := result || ' ';
      CONTINUE;
    END IF;

    IF pg_catalog.substr(p_source, cursor_position, 2) = '/*' THEN
      block_depth := 1;
      cursor_position := cursor_position + 2;
      WHILE cursor_position <= source_length AND block_depth > 0 LOOP
        IF pg_catalog.substr(p_source, cursor_position, 2) = '/*' THEN
          block_depth := block_depth + 1;
          cursor_position := cursor_position + 2;
        ELSIF pg_catalog.substr(p_source, cursor_position, 2) = '*/' THEN
          block_depth := block_depth - 1;
          cursor_position := cursor_position + 2;
        ELSE
          cursor_position := cursor_position + 1;
        END IF;
      END LOOP;
      IF block_depth <> 0 THEN
        RAISE EXCEPTION '00488 catalog lexer found an unterminated block comment';
      END IF;
      result := result || ' ';
      CONTINUE;
    END IF;

    character := pg_catalog.substr(p_source, cursor_position, 1);
    IF character = '''' THEN
      escape_string := cursor_position > 1
        AND pg_catalog.lower(
          pg_catalog.substr(p_source, cursor_position - 1, 1)
        ) = 'e'
        AND (
          cursor_position = 2
          OR (
            pg_catalog.substr(p_source, cursor_position - 2, 1)
              !~ '[[:alnum:]_$]'
            AND COALESCE(pg_catalog.ascii(NULLIF(
                  pg_catalog.substr(p_source, cursor_position - 2, 1), ''
                )), 0) < 128
          )
        );
      string_closed := false;
      cursor_position := cursor_position + 1;
      WHILE cursor_position <= source_length LOOP
        character := pg_catalog.substr(p_source, cursor_position, 1);
        IF character = '''' THEN
          IF pg_catalog.substr(p_source, cursor_position + 1, 1) = '''' THEN
            cursor_position := cursor_position + 2;
          ELSE
            cursor_position := cursor_position + 1;
            string_closed := true;
            EXIT;
          END IF;
        ELSIF escape_string AND character = E'\\' THEN
          cursor_position := cursor_position + 2;
        ELSE
          cursor_position := cursor_position + 1;
        END IF;
      END LOOP;
      IF NOT string_closed THEN
        RAISE EXCEPTION '00488 catalog lexer found an unterminated string literal';
      END IF;
      result := result || ' ';
      CONTINUE;
    END IF;

    IF character = '$'
       AND (
         cursor_position = 1
         OR (
           pg_catalog.substr(p_source, cursor_position - 1, 1)
             !~ '[[:alnum:]_$]'
           AND COALESCE(pg_catalog.ascii(NULLIF(
                 pg_catalog.substr(p_source, cursor_position - 1, 1), ''
               )), 0) < 128
         )
       )
    THEN
      dollar_tag := NULL;
      close_offset := pg_catalog.strpos(
        pg_catalog.substr(p_source, cursor_position + 1), '$'
      );
      IF close_offset > 0 THEN
        dollar_candidate := pg_catalog.substr(
          p_source, cursor_position + 1, close_offset - 1
        );
        dollar_valid := dollar_candidate = '';
        IF dollar_candidate <> '' THEN
          dollar_character := pg_catalog.substr(dollar_candidate, 1, 1);
          dollar_valid := dollar_character ~ '[A-Za-z_]'
            OR pg_catalog.ascii(dollar_character) >= 128;
          dollar_position := 2;
          WHILE dollar_valid
            AND dollar_position <= pg_catalog.char_length(dollar_candidate)
          LOOP
            dollar_character := pg_catalog.substr(
              dollar_candidate, dollar_position, 1
            );
            dollar_valid := dollar_character ~ '[A-Za-z0-9_]'
              OR pg_catalog.ascii(dollar_character) >= 128;
            dollar_position := dollar_position + 1;
          END LOOP;
        END IF;
        IF dollar_valid THEN
          dollar_tag := '$' || dollar_candidate || '$';
        END IF;
      END IF;
      IF dollar_tag IS NOT NULL THEN
        close_offset := pg_catalog.strpos(
          pg_catalog.substr(
            p_source, cursor_position + pg_catalog.char_length(dollar_tag)
          ),
          dollar_tag
        );
        IF close_offset = 0 THEN
          RAISE EXCEPTION '00488 catalog lexer found an unterminated dollar literal';
        END IF;
        cursor_position := cursor_position
          + pg_catalog.char_length(dollar_tag)
          + close_offset - 1
          + pg_catalog.char_length(dollar_tag);
        result := result || ' ';
        CONTINUE;
      END IF;
    END IF;

    -- Unicode-escaped identifiers can encode a protected name without its
    -- literal spelling. No reviewed catalog object needs them, so fail closed.
    IF character = '"'
       AND cursor_position >= 3
       AND pg_catalog.lower(
             pg_catalog.substr(p_source, cursor_position - 2, 2)
           ) = 'u&'
       AND (
         cursor_position = 3
         OR pg_catalog.substr(p_source, cursor_position - 3, 1)
              !~ '[[:alnum:]_$]'
       )
    THEN
      RAISE EXCEPTION
        '00488 catalog lexer rejects Unicode-escaped quoted identifiers';
    END IF;

    -- Quoted identifiers are executable code for call/table attribution but
    -- are blanked for keyword recognition. This distinguishes a quoted
    -- "EXECUTE" identifier from the EXECUTE keyword in EXECUTE"sql".
    IF character = '"' THEN
      IF p_preserve_quoted_identifiers THEN
        result := result || '"';
      END IF;
      cursor_position := cursor_position + 1;
      string_closed := false;
      WHILE cursor_position <= source_length LOOP
        character := pg_catalog.substr(p_source, cursor_position, 1);
        IF character = '"' THEN
          IF pg_catalog.substr(p_source, cursor_position + 1, 1) = '"' THEN
            IF p_preserve_quoted_identifiers THEN
              result := result || '""';
            END IF;
            cursor_position := cursor_position + 2;
          ELSE
            IF p_preserve_quoted_identifiers THEN
              result := result || '"';
            END IF;
            cursor_position := cursor_position + 1;
            string_closed := true;
            EXIT;
          END IF;
        ELSE
          IF p_preserve_quoted_identifiers THEN
            result := result || character;
          END IF;
          cursor_position := cursor_position + 1;
        END IF;
      END LOOP;
      IF NOT string_closed THEN
        RAISE EXCEPTION '00488 catalog lexer found an unterminated quoted identifier';
      END IF;
      IF NOT p_preserve_quoted_identifiers THEN
        result := result || ' ';
      END IF;
      CONTINUE;
    END IF;

    result := result || character;
    cursor_position := cursor_position + 1;
  END LOOP;
  RETURN result;
END;
$c00488_mask_sql$;

CREATE OR REPLACE FUNCTION pg_temp._00488_policy_clause_frame(
  p_value text
)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $c00488_policy_clause_frame$
  SELECT pg_catalog.decode('01', 'hex')
    || pg_catalog.int8send(pg_catalog.octet_length(p_value)::bigint)
    || pg_catalog.convert_to(p_value, 'UTF8')
$c00488_policy_clause_frame$;

CREATE OR REPLACE FUNCTION pg_temp._00488_policy_fingerprint(
  p_relation text,
  p_qual_sql text,
  p_check_sql text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, pg_temp
AS $c00488_policy_fingerprint$
DECLARE
  relation_oid pg_catalog.regclass := pg_catalog.to_regclass(p_relation);
  relation_name text;
  probe_relation pg_catalog.regclass;
  probe_sql text;
  result text;
BEGIN
  IF relation_oid IS NULL THEN
    RAISE EXCEPTION '00488 policy probe relation is missing: %', p_relation;
  END IF;
  SELECT relation.relname INTO STRICT relation_name
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = relation_oid;
  IF pg_catalog.to_regclass(
       'pg_temp.' || pg_catalog.quote_ident(relation_name)
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION
      '00488 policy probe temp relation already exists: %', relation_name;
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE TEMP TABLE pg_temp.%I (LIKE %s)', relation_name, relation_oid
  );
  probe_sql := pg_catalog.format(
    'CREATE POLICY c00488_catalog_probe ON pg_temp.%I', relation_name
  );
  IF p_qual_sql IS NOT NULL THEN
    probe_sql := probe_sql || ' USING ' || p_qual_sql;
  END IF;
  IF p_check_sql IS NOT NULL THEN
    probe_sql := probe_sql || ' WITH CHECK ' || p_check_sql;
  END IF;
  EXECUTE probe_sql;
  probe_relation := pg_catalog.to_regclass(
    'pg_temp.' || pg_catalog.quote_ident(relation_name)
  );

  SELECT pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to('patina-csa-policy-v1', 'UTF8')
    || pg_catalog.decode('00', 'hex')
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    )
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    ),
    'sha256'
  ), 'hex') INTO STRICT result
  FROM pg_catalog.pg_policy AS policy
  WHERE policy.polrelid = probe_relation
    AND policy.polname = 'c00488_catalog_probe';

  EXECUTE pg_catalog.format('DROP TABLE pg_temp.%I', relation_name);
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  IF relation_name IS NOT NULL THEN
    EXECUTE pg_catalog.format(
      'DROP TABLE IF EXISTS pg_temp.%I', relation_name
    );
  END IF;
  RAISE;
END;
$c00488_policy_fingerprint$;

CREATE OR REPLACE FUNCTION pg_temp._00488_catalog_policy_fingerprint(
  p_policy oid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $c00488_catalog_policy_fingerprint$
  SELECT pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to('patina-csa-policy-v1', 'UTF8')
    || pg_catalog.decode('00', 'hex')
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    )
    || COALESCE(
      pg_temp._00488_policy_clause_frame(
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      ),
      pg_catalog.decode('00', 'hex')
    ),
    'sha256'
  ), 'hex')
  FROM pg_catalog.pg_policy AS policy
  WHERE policy.oid = p_policy
$c00488_catalog_policy_fingerprint$;

CREATE OR REPLACE FUNCTION pg_temp._00488_call_count(
  p_source text,
  p_helper text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_call_count$
  SELECT count(*)::integer
  FROM pg_catalog.regexp_matches(
    pg_temp._00488_mask_sql(p_source),
    '(^|[^a-z0-9_$])(?:"?public"?[[:space:]]*\.[[:space:]]*)?"?'
      || p_helper || '"?[[:space:]]*\(',
    'gi'
  )
$c00488_call_count$;

CREATE OR REPLACE FUNCTION pg_temp._00488_insert_count(
  p_source text,
  p_table text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_insert_count$
  SELECT count(*)::integer
  FROM pg_catalog.regexp_matches(
    pg_temp._00488_mask_sql(p_source),
    '(^|[^a-z0-9_$])insert[[:space:]]+into[[:space:]]+'
      || '(?:"?public"?[[:space:]]*\.[[:space:]]*)?"?'
      || p_table || '"?([^a-z0-9_$]|$)',
    'gi'
  )
$c00488_insert_count$;

CREATE OR REPLACE FUNCTION pg_temp._00488_dynamic_mentions(
  p_source text,
  p_token text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $c00488_dynamic_mentions$
  -- A dynamic statement can construct the target without spelling it in a
  -- literal. Unknown dynamic bodies therefore fail closed for every target.
  -- Five exact source hashes were independently reviewed; the global
  -- source/final dynamic-routine anti-join proves those hashes are attached
  -- only to their exact signatures before this exemption is useful.
  SELECT p_token IS NOT NULL
     AND pg_temp._00488_mask_sql(COALESCE(p_source, ''), false)
           ~* '(^|[^a-z0-9_$])execute([^a-z0-9_$]|$)'
     AND pg_catalog.encode(extensions.digest(
           pg_catalog.convert_to(COALESCE(p_source, ''), 'UTF8'), 'sha256'
         ), 'hex') NOT IN (@@REVIEWED_DYNAMIC_SOURCE_HASHES@@)
$c00488_dynamic_mentions$;

-- pg_proc.prosrc is not a complete representation for SQL-standard
-- BEGIN ATOMIC bodies. The reviewed source/final universe contains none, so
-- reject any such routine before relying on the prosrc lexical contracts.
DO $c00488_sql_body_universe$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND pg_catalog.pg_get_function_sqlbody(routine.oid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      '00488 found an unreviewed SQL-standard routine body outside prosrc';
  END IF;
END;
$c00488_sql_body_universe$;
"""
    return lexer.replace(
        "@@REVIEWED_DYNAMIC_SOURCE_HASHES@@",
        ",".join(sql_literal(value) for value in sorted(
            REVIEWED_DYNAMIC_SOURCE_BODY_SHA256
        )),
    )


def people_directory_profile_sql(state_expression: str) -> str:
    return f"""
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS view_row
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = view_row.relowner
    WHERE view_row.oid = 'public.people_directory'::pg_catalog.regclass
      AND (view_row.relkind <> 'v'
        OR owner.rolname <> 'postgres'
        OR COALESCE(view_row.reloptions, ARRAY[]::text[])
             IS DISTINCT FROM ARRAY['security_invoker=true']::text[])
  ) OR (
    SELECT array_agg(attribute.attname ORDER BY attribute.attnum)
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.people_directory'::pg_catalog.regclass
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
  ) IS DISTINCT FROM ARRAY[
    'person_id','role','display_name','email','phone','profile_id','project_id',
    'designer_id','status_raw','last_touch_at','meta','scope'
  ]::name[] THEN
    RAISE EXCEPTION '00488 people_directory owner/options/columns profile failed';
  END IF;

  IF EXISTS (
    WITH expected(grantee, grantor, privilege_type, is_grantable) AS (VALUES
      ('authenticated','postgres','SELECT',false)
    ), actual AS (
      SELECT CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
             grantor.rolname, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_class AS view_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        view_row.relacl, pg_catalog.acldefault('r', view_row.relowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE view_row.oid = 'public.people_directory'::pg_catalog.regclass
        AND acl.grantee <> view_row.relowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 people_directory ACL/grantor profile failed';
  END IF;

  IF {state_expression} = 'source' THEN
    IF pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         'is_studio_comember'
       ) <> 12
       OR pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         'is_active_studio_member'
       ) <> 1
       OR pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         '_can_read_studio_snapshot'
       ) <> 0
       OR pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         '_can_author_studio_snapshot'
       ) <> 0
    THEN
      RAISE EXCEPTION '00488 people_directory exact source dependency profile failed';
    END IF;
  ELSE
    IF pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         '_can_read_studio_snapshot'
       ) <> 7
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.unnest(ARRAY[
           '_can_author_proposal','is_active_studio_member',
           'is_design_studio_comember','is_studio_comember'
         ]::text[]) AS helper(name)
         WHERE pg_temp._00488_call_count(
           pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
           helper.name
         ) <> 0
       )
    THEN
      RAISE EXCEPTION '00488 people_directory exact final dependency profile failed';
    END IF;
  END IF;
"""


def composed_00485_dependency_sql() -> str:
    return """
  IF EXISTS (
    WITH expected(signature) AS (VALUES
      ('public._countersign_design_services_agreement_impl(uuid,text,jsonb)'),
      ('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'),
      ('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'),
      ('public._execute_trade_scope_authorized(uuid,text,uuid,text)'),
      ('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'),
      ('public.issue_trade_draw_invoice(uuid)')
    ), expected_oid AS (
      SELECT pg_catalog.to_regprocedure(signature) AS oid FROM expected
    ), actual AS (
      SELECT routine.oid
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname NOT LIKE 'pg_%'
        AND (
          pg_temp._00488_call_count(routine.prosrc, 'issue_invoice_for_actor') > 0
          OR pg_temp._00488_dynamic_mentions(routine.prosrc, 'issue_invoice_for_actor')
        )
    )
    (SELECT oid FROM expected_oid EXCEPT SELECT oid FROM actual)
    UNION ALL
    (SELECT oid FROM actual EXCEPT SELECT oid FROM expected_oid)
  ) THEN
    RAISE EXCEPTION '00488 frozen 00485 invoice-core caller universe drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname NOT LIKE 'pg_%'
      AND (
        pg_temp._00488_call_count(routine.prosrc, 'create_draft_invoice') > 0
        OR pg_temp._00488_dynamic_mentions(routine.prosrc, 'create_draft_invoice')
      )
  ) THEN
    RAISE EXCEPTION '00488 frozen 00485 draft-invoice database caller universe is not empty';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public' AND routine.proname = 'create_draft_invoice') <> 1
     OR (SELECT count(*) FROM pg_catalog.pg_proc AS routine
         JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
         WHERE namespace.nspname = 'app_private'
           AND routine.proname = 'issue_invoice_for_actor') <> 1
  THEN
    RAISE EXCEPTION '00488 frozen 00485 invoice overload universe drifted';
  END IF;

  IF EXISTS (
    WITH expected(signature, root_is_inherent) AS (VALUES
      ('public.set_project_studio_id()'::text, true),
      ('public.set_invoice_studio_id()'::text, false),
      ('public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'::text, false),
      ('app_private.issue_invoice_for_actor(uuid,date,uuid)'::text, false),
      ('public._countersign_design_services_agreement_impl(uuid,text,jsonb)'::text, false),
      ('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'::text, false),
      ('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'::text, false),
      ('public._execute_trade_scope_authorized(uuid,text,uuid,text)'::text, false),
      ('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'::text, false),
      ('public.issue_trade_draw_invoice(uuid)'::text, false)
    ), positions AS (
      SELECT expected.*,
        LEAST(
          NULLIF(position('FOR SHARE;' IN routine.prosrc), 0),
          NULLIF(position('FOR UPDATE;' IN routine.prosrc), 0)
        ) AS root_lock_position,
        position('PERFORM role.id' IN routine.prosrc) AS role_position,
        position('PERFORM user_role.id' IN routine.prosrc) AS user_role_position,
        LEAST(
          NULLIF(position('PERFORM membership.id' IN routine.prosrc), 0),
          NULLIF(position('PERFORM lead_membership.id' IN routine.prosrc), 0)
        ) AS membership_position,
        position('PERFORM studio.id' IN routine.prosrc) AS studio_position
      FROM expected
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    )
    SELECT 1 FROM positions
    WHERE role_position = 0 OR user_role_position = 0
       OR membership_position IS NULL OR studio_position = 0
       OR NOT (
         role_position < user_role_position
         AND user_role_position < membership_position
         AND membership_position < studio_position
       )
       OR (NOT root_is_inherent AND (
         root_lock_position IS NULL OR root_lock_position >= role_position
       ))
  ) THEN
    RAISE EXCEPTION '00488 frozen 00485 root/authority lock order drifted';
  END IF;
"""


def workspace_signature_dependency_sql(state_expression: str) -> str:
    """Pin database callers across every workspace-signature replacement.

    PostgreSQL catalog dependencies do not cover PL/pgSQL calls, so the
    checked lexer and dynamic-SQL rejection are the authoritative complement
    to the exact overload manifest.  The renamed claim cores must remain
    reachable only from their explicit-studio wrappers.
    """
    return f"""
  IF {state_expression} = 'source' THEN
    IF EXISTS (
      WITH target(name) AS (VALUES
        ('can_dispatch_proposal_send'),('open_project_direct'),
        ('set_document_client'),('claim_design_request'),
        ('accept_design_request')
      )
      SELECT 1
      FROM pg_catalog.pg_proc AS caller
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = caller.pronamespace
      CROSS JOIN target
      WHERE namespace.nspname IN ('public','app_private')
        AND caller.proname IS DISTINCT FROM target.name
        AND (
          pg_temp._00488_call_count(caller.prosrc, target.name) > 0
          OR pg_temp._00488_dynamic_mentions(caller.prosrc, target.name)
        )
    ) OR EXISTS (
      WITH target(name) AS (VALUES
        ('can_dispatch_proposal_send'),('open_project_direct'),
        ('set_document_client'),('claim_design_request'),
        ('accept_design_request')
      )
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      CROSS JOIN target
      WHERE pg_temp._00488_call_count(
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
          || ' ' || COALESCE(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
          ),
        target.name
      ) > 0
    ) OR EXISTS (
      WITH target(name) AS (VALUES
        ('can_dispatch_proposal_send'),('open_project_direct'),
        ('set_document_client'),('claim_design_request'),
        ('accept_design_request')
      )
      SELECT 1 FROM target
      WHERE pg_temp._00488_call_count(
        pg_catalog.pg_get_viewdef(
          'public.people_directory'::pg_catalog.regclass, true
        ), target.name
      ) > 0
    ) THEN
      RAISE EXCEPTION
        '00488 replaced workspace signature has an unreviewed source caller';
    END IF;
  ELSE
    IF EXISTS (
      WITH expected(caller_signature, callee_name, call_count) AS (VALUES
        ('public.claim_design_request(uuid,uuid)',
         '_claim_design_request_00488_core', 1),
        ('public.accept_design_request(uuid,uuid)',
         '_accept_design_request_00488_core', 1)
      ), callee(name) AS (VALUES
        ('_claim_design_request_00488_core'),
        ('_accept_design_request_00488_core')
      ), actual AS (
        SELECT caller.oid, callee.name,
               pg_temp._00488_call_count(caller.prosrc, callee.name) AS call_count,
               pg_temp._00488_dynamic_mentions(caller.prosrc, callee.name)
                 AS dynamic_call
        FROM pg_catalog.pg_proc AS caller
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = caller.pronamespace
        CROSS JOIN callee
        WHERE namespace.nspname IN ('public','app_private')
      )
      (SELECT pg_catalog.to_regprocedure(caller_signature), callee_name, call_count
       FROM expected
       EXCEPT
       SELECT oid, name, call_count FROM actual
       WHERE call_count > 0 AND NOT dynamic_call)
      UNION ALL
      (SELECT oid, name, call_count FROM actual
       WHERE call_count > 0 OR dynamic_call
       EXCEPT
       SELECT pg_catalog.to_regprocedure(caller_signature), callee_name, call_count
       FROM expected)
    ) OR EXISTS (
      WITH retired_name(name) AS (VALUES
        ('can_dispatch_proposal_send'),('open_project_direct'),
        ('set_document_client'),('claim_design_request'),
        ('accept_design_request')
      )
      SELECT 1
      FROM pg_catalog.pg_proc AS caller
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = caller.pronamespace
      CROSS JOIN retired_name
      WHERE namespace.nspname IN ('public','app_private')
        AND caller.proname IS DISTINCT FROM retired_name.name
        AND (
          pg_temp._00488_dynamic_mentions(caller.prosrc, retired_name.name)
          OR pg_temp._00488_call_count(caller.prosrc, retired_name.name) > 0
        )
    ) OR EXISTS (
      WITH target(name) AS (VALUES
        ('can_dispatch_proposal_send'),('open_project_direct'),
        ('set_document_client'),('claim_design_request'),
        ('accept_design_request'),('_claim_design_request_00488_core'),
        ('_accept_design_request_00488_core')
      )
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      CROSS JOIN target
      WHERE pg_temp._00488_call_count(
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
          || ' ' || COALESCE(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
          ), target.name
      ) > 0
    ) OR EXISTS (
      WITH target(name) AS (VALUES
        ('can_dispatch_proposal_send'),('open_project_direct'),
        ('set_document_client'),('claim_design_request'),
        ('accept_design_request'),('_claim_design_request_00488_core'),
        ('_accept_design_request_00488_core')
      )
      SELECT 1 FROM target
      WHERE pg_temp._00488_call_count(
        pg_catalog.pg_get_viewdef(
          'public.people_directory'::pg_catalog.regclass, true
        ), target.name
      ) > 0
    ) THEN
      RAISE EXCEPTION
        '00488 explicit workspace/core caller universe drifted';
    END IF;
  END IF;
"""


def canonical_lock_order_postflight_sql(
    lock_order_manifest: list[dict[str, Any]],
) -> str:
    values = ",\n      ".join(
        "(" + ",".join((
            sql_literal(row["canonical_regprocedure"]),
            sql_literal(row["body_sha256"]),
            str(row["authority_call_count"]),
            sql_text_array(row["snapshot_root_locks_before_first_authority"]),
            sql_text_array(row["snapshot_root_locks_after_first_authority"]),
            sql_text_array(row["snapshot_root_mutations_after_first_authority"]),
            "true" if row["target_row_lock_inherent"] else "false",
            "true" if row["collision_retry_reacquires_root_first"] else "false",
        )) + ")"
        for row in lock_order_manifest
    )
    return f"""
  IF EXISTS (
    WITH expected(
      signature, body_sha256, authority_call_count,
      snapshot_locks_before, snapshot_locks_after, snapshot_mutations_after,
      target_row_lock_inherent, collision_retry_reacquires_root_first
    ) AS (VALUES
      {values}
    ), actual AS (
      SELECT expected.*,
             routine.oid,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             pg_temp._00488_call_count(
               routine.prosrc, '_can_author_studio_snapshot'
             ) + pg_temp._00488_call_count(
               routine.prosrc, '_lock_designer_studio_authority'
             ) AS actual_authority_call_count
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL
       OR actual_body_sha256 IS DISTINCT FROM body_sha256
       OR actual_authority_call_count IS DISTINCT FROM authority_call_count
       OR (
         NOT target_row_lock_inherent
         AND NOT (
           snapshot_locks_after <@ snapshot_locks_before
           AND snapshot_mutations_after <@ snapshot_locks_before
         )
       )
  ) THEN
    RAISE EXCEPTION
      '00488 canonical root/authority order manifest or body drifted';
  END IF;

  IF EXISTS (
    WITH helper AS (
      SELECT pg_catalog.lower(pg_temp._00488_mask_sql(routine.prosrc)) AS source
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = pg_catalog.to_regprocedure(
        'public._lock_designer_studio_authority(uuid,uuid)'
      )
    ), positions AS (
      SELECT
        position('from public.roles as role_row' IN source) AS role_position,
        position('from public.user_roles as user_role' IN source) AS user_role_position,
        position('from public.organization_members as membership' IN source) AS membership_position,
        position('from public.organizations as studio' IN source) AS studio_position
      FROM helper
    )
    SELECT 1 FROM positions
    WHERE role_position = 0 OR user_role_position = 0
       OR membership_position = 0 OR studio_position = 0
       OR NOT (
         role_position < user_role_position
         AND user_role_position < membership_position
         AND membership_position < studio_position
       )
  ) THEN
    RAISE EXCEPTION '00488 canonical authority-tier lock order drifted';
  END IF;
"""


def preflight_sql(
    document: dict[str, Any],
    routines: list[dict[str, Any]],
    policies: list[dict[str, Any]],
    delete_guards: list[dict[str, Any]],
    mutation_guards: list[dict[str, Any]],
    affected_policies: list[dict[str, Any]],
    surfaces: list[dict[str, Any]],
    rendered_template: str,
    *,
    required_state: str = "either",
    dynamic_routines: list[dict[str, Any]],
) -> str:
    require(
        required_state in ("either", "source", "final"),
        f"unknown catalog preflight state {required_state}",
    )
    state_guard = ""
    if required_state == "source":
        state_guard = """
  IF final_state THEN
    RAISE EXCEPTION '00488 rollback expected the exact reviewed source state';
  END IF;
"""
    elif required_state == "final":
        state_guard = """
  IF NOT final_state THEN
    RAISE EXCEPTION '00488 rollback expected the exact reviewed final state';
  END IF;
"""
    routine_values = routine_values_sql(routines)
    policy_values = policy_values_sql(policies)
    delete_guard_check = delete_guard_gate_sql(delete_guards, "final_state")
    mutation_guard_check = mutation_guard_gate_sql(
        mutation_guards, "final_state"
    )
    affected_policy_check = affected_policy_gate_sql(
        affected_policies, "final_state"
    )
    trigger_values = trigger_values_sql(routines)
    disposition_values = disposition_routine_values_sql([
        row for row in routines if row["dependency_kind"] == "already_dispositioned"
    ])
    disposition_policy_values = disposition_policy_values_sql(document)
    surface_values = surface_values_sql(surfaces)
    source_routine_callers = source_routine_caller_values_sql(routines)
    source_policy_callers = source_policy_caller_values_sql(policies)
    source_view_calls = source_view_authority_calls(document)
    _, source_view_text = source_text(document["live_views"][0])
    source_view_query = extract_people_directory_query(source_view_text)
    final_view_query = extract_people_directory_query(rendered_template)
    writer_values = writer_values_sql()
    trigger_check = ""
    if trigger_values:
        trigger_check = f"""
  IF EXISTS (
    WITH expected(schema_name, relation_name, trigger_name, trigger_type,
                  enabled, definition, args_hex, signature) AS (VALUES
      {trigger_values}
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.nspname = expected.schema_name
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.relnamespace = namespace.oid
     AND relation.relname = expected.relation_name
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = relation.oid
     AND trigger_row.tgname = expected.trigger_name
     AND NOT trigger_row.tgisinternal
    WHERE trigger_row.oid IS NULL
       OR trigger_row.tgtype <> expected.trigger_type
       OR trigger_row.tgenabled <> expected.enabled
       OR pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.pg_get_triggerdef(trigger_row.oid)),
            '[[:space:]]', '', 'g'
          ) IS DISTINCT FROM expected.definition
       OR pg_catalog.encode(trigger_row.tgargs, 'hex') <> expected.args_hex
       OR trigger_row.tgfoid <> pg_catalog.to_regprocedure(expected.signature)
  ) OR EXISTS (
    WITH expected(schema_name, relation_name, trigger_name, trigger_type,
                  enabled, definition, args_hex, signature) AS (VALUES
      {trigger_values}
    )
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgfoid IN (
        SELECT pg_catalog.to_regprocedure(signature) FROM expected
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE expected.schema_name = namespace.nspname
          AND expected.relation_name = relation.relname
          AND expected.trigger_name = trigger_row.tgname
          AND expected.signature::pg_catalog.regprocedure = trigger_row.tgfoid
      )
  ) THEN
    RAISE EXCEPTION '00488 reviewed trigger bidirectional source/final preflight failed';
  END IF;
"""
    return catalog_lexer_sql() + f"""
CREATE OR REPLACE TEMP VIEW _00488_expected_people_directory_source AS
{source_view_query};

DO $canonical_studio_source_preflight$
DECLARE
  snapshot_column_count integer;
  final_state boolean;
  snapshot_data_mismatch boolean;
BEGIN
  IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION '00488 requires extensions.digest(bytea,text)';
  END IF;
{reviewed_rls_relation_gate_sql(policies, "source/final preflight")}

  -- All six snapshot columns are either wholly absent (source) or already
  -- exact (idempotent final).  A partial ad-hoc schema is never accepted.
  SELECT count(*) INTO snapshot_column_count
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'proposals','designer_clients','leads','client_decisions',
        'saved_vendors','phase_templates'
      )
      AND attribute.attname = 'studio_id'
      AND NOT attribute.attisdropped;
  IF snapshot_column_count NOT IN (0, 6) THEN
    RAISE EXCEPTION '00488 partial snapshot schema is not a reviewed source/final state';
  END IF;
  final_state := snapshot_column_count = 6;
{state_guard}
{dynamic_routine_contract_sql(dynamic_routines, "CASE WHEN final_state THEN 'final' ELSE 'source' END")}
{dynamic_invoice_core_dependency_sql()}
{snapshot_data_consistency_preflight_sql()}

  IF pg_catalog.to_regclass('public.people_directory') IS NULL THEN
    RAISE EXCEPTION '00488 reviewed people_directory source view is missing';
  END IF;
  IF final_state THEN
    EXECUTE $c00488_final_people_view$
      CREATE OR REPLACE TEMP VIEW _00488_expected_people_directory_final AS
      {final_view_query}
    $c00488_final_people_view$;
    IF pg_catalog.pg_get_viewdef(
         'public.people_directory'::pg_catalog.regclass, true
       ) IS DISTINCT FROM pg_catalog.pg_get_viewdef(
         pg_catalog.to_regclass('pg_temp._00488_expected_people_directory_final'), true
       )
    THEN
      RAISE EXCEPTION '00488 people_directory exact final definition preflight failed';
    END IF;
  ELSIF pg_catalog.pg_get_viewdef(
          'public.people_directory'::pg_catalog.regclass, true
        ) IS DISTINCT FROM pg_catalog.pg_get_viewdef(
          pg_catalog.to_regclass('pg_temp._00488_expected_people_directory_source'), true
        )
  THEN
    RAISE EXCEPTION '00488 people_directory exact source definition preflight failed';
  END IF;
{snapshot_schema_preflight_sql()}
  IF final_state THEN
{snapshot_schema_postflight_sql()}
  END IF;

  IF EXISTS (
    WITH expected(
      signature, source_arguments, final_arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, source_config, final_config, source_body_sha256,
      final_body_sha256, allowed_roles, retired
    ) AS (VALUES
      {routine_values}
    ), actual AS (
      SELECT expected.*, routine.oid, owner.rolname AS actual_owner,
             language.lanname AS actual_language,
             pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
             pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             routine.prokind, routine.prosecdef, routine.proleakproof,
             routine.proisstrict, routine.proparallel, routine.provolatile,
             routine.proretset, routine.proconfig
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    )
    SELECT 1 FROM actual
    WHERE (NOT final_state AND (
            oid IS NULL
         OR actual_owner IS DISTINCT FROM owner_name
         OR actual_language IS DISTINCT FROM language_name
         OR prokind IS DISTINCT FROM kind::"char"
         OR prosecdef IS DISTINCT FROM security_definer
         OR proleakproof IS DISTINCT FROM leakproof
         OR proisstrict IS DISTINCT FROM strict
         OR proparallel IS DISTINCT FROM parallel::"char"
         OR provolatile IS DISTINCT FROM volatility::"char"
         OR proretset IS DISTINCT FROM returns_set
         OR actual_result IS DISTINCT FROM result_type
         OR actual_body_sha256 IS DISTINCT FROM source_body_sha256
         OR actual_arguments IS DISTINCT FROM source_arguments
         OR proconfig IS DISTINCT FROM source_config
       )) OR (final_state AND (
            (retired AND oid IS NOT NULL)
         OR (NOT retired AND (
            oid IS NULL
         OR actual_owner IS DISTINCT FROM owner_name
         OR actual_language IS DISTINCT FROM language_name
         OR prokind IS DISTINCT FROM kind::"char"
         OR prosecdef IS DISTINCT FROM security_definer
         OR proleakproof IS DISTINCT FROM leakproof
         OR proisstrict IS DISTINCT FROM strict
         OR proparallel IS DISTINCT FROM parallel::"char"
         OR provolatile IS DISTINCT FROM volatility::"char"
         OR proretset IS DISTINCT FROM returns_set
         OR actual_result IS DISTINCT FROM result_type
         OR actual_body_sha256 IS DISTINCT FROM final_body_sha256
         OR actual_arguments IS DISTINCT FROM final_arguments
         OR proconfig IS DISTINCT FROM final_config
         ))
       ))
  ) THEN
    RAISE EXCEPTION '00488 reviewed routine source/final profile preflight failed';
  END IF;

  IF EXISTS (
    WITH routine_expected(
      signature, source_arguments, final_arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, source_config, final_config, source_body_sha256,
      final_body_sha256, allowed_roles, retired
    ) AS (VALUES
      {routine_values}
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM routine_expected
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
      WHERE (NOT final_state OR NOT retired)
    ), actual AS (
      SELECT routine_expected.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
             grantor.rolname AS grantor, acl.privilege_type, acl.is_grantable
      FROM routine_expected
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(routine_expected.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
        AND (NOT final_state OR NOT routine_expected.retired)
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 reviewed routine source/final ACL preflight failed';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), expected AS (
      SELECT * FROM states
      WHERE state_name = CASE WHEN final_state THEN 'final' ELSE 'source' END
    ), actual AS (
      SELECT expected.*, routine.oid, owner.rolname AS actual_owner,
             language.lanname AS actual_language,
             pg_catalog.pg_get_function_arguments(routine.oid) AS actual_arguments,
             pg_catalog.pg_get_function_result(routine.oid) AS actual_result,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex') AS actual_body_sha256,
             routine.prokind, routine.prosecdef, routine.proleakproof,
             routine.proisstrict, routine.proparallel, routine.provolatile,
             routine.proretset, routine.proconfig
      FROM expected
      LEFT JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
      LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    )
    SELECT 1 FROM actual
    WHERE (NOT should_exist AND oid IS NOT NULL)
       OR (should_exist AND (
            oid IS NULL
         OR actual_owner IS DISTINCT FROM owner_name
         OR actual_language IS DISTINCT FROM language_name
         OR prokind IS DISTINCT FROM kind::"char"
         OR prosecdef IS DISTINCT FROM security_definer
         OR proleakproof IS DISTINCT FROM leakproof
         OR proisstrict IS DISTINCT FROM strict
         OR proparallel IS DISTINCT FROM parallel::"char"
         OR provolatile IS DISTINCT FROM volatility::"char"
         OR proretset IS DISTINCT FROM returns_set
         OR actual_result IS DISTINCT FROM result_type
         OR actual_arguments IS DISTINCT FROM arguments
         OR proconfig IS DISTINCT FROM config
         OR actual_body_sha256 IS DISTINCT FROM body_sha256
       ))
  ) OR EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), expected AS (
      SELECT * FROM states
      WHERE state_name = CASE WHEN final_state THEN 'final' ELSE 'source' END
        AND should_exist
    )
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        '_can_read_studio_snapshot','_lock_designer_studio_authority',
        '_can_author_studio_snapshot','guard_canonical_studio_snapshot',
        'is_studio_comember','is_design_studio_comember','_can_author_proposal',
        'is_active_studio_member','_prepare_canonical_lead_claim',
        '_claim_design_request_00488_core','claim_design_request',
        '_accept_design_request_00488_core','accept_design_request',
        'open_project_direct','set_document_client'
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = routine.oid
      )
  ) THEN
    RAISE EXCEPTION '00488 manual authority surface profile/overload preflight failed';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), chosen AS (
      SELECT * FROM states
      WHERE state_name = CASE WHEN final_state THEN 'final' ELSE 'source' END
        AND should_exist
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM chosen
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
    ), actual AS (
      SELECT chosen.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
             grantor.rolname AS grantor, acl.privilege_type, acl.is_grantable
      FROM chosen
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(chosen.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 manual authority surface ACL preflight failed';
  END IF;

  IF NOT final_state THEN
    IF EXISTS (
      WITH expected(signature, helper_name, lexical_call_count, catalog_call_count) AS (VALUES
        {source_routine_callers}
      ), helper(helper_name) AS (VALUES
        ('_can_manage_invoice_owner'),('_can_author_proposal'),
        ('is_active_studio_member'),('is_design_studio_comember'),
        ('is_studio_comember')
      ), actual AS (
        SELECT routine.oid, helper.helper_name,
               pg_temp._00488_call_count(
                 routine.prosrc, helper.helper_name
               ) AS call_count,
               pg_temp._00488_dynamic_mentions(
                 routine.prosrc, helper.helper_name
               ) AS dynamic_call
        FROM pg_catalog.pg_proc AS routine
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
        CROSS JOIN helper
        WHERE namespace.nspname IN ('public','app_private')
      )
      (SELECT pg_catalog.to_regprocedure(signature), helper_name, catalog_call_count
       FROM expected
       EXCEPT SELECT oid, helper_name, call_count FROM actual
              WHERE call_count > 0 AND NOT dynamic_call)
      UNION ALL
      (SELECT oid, helper_name, call_count FROM actual
       WHERE (call_count > 0 OR dynamic_call)
       EXCEPT SELECT pg_catalog.to_regprocedure(signature), helper_name, catalog_call_count
       FROM expected)
    ) THEN
      RAISE EXCEPTION '00488 source routine caller universe drifted';
    END IF;

    IF EXISTS (
      WITH expected(
        relation_name, policy_name, helper_name, lexical_call_count, catalog_call_count
      ) AS (VALUES
        {source_policy_callers}
      ), helper(helper_name) AS (VALUES
        ('_can_manage_invoice_owner'),('_can_author_proposal'),
        ('is_active_studio_member'),('is_design_studio_comember'),
        ('is_studio_comember')
      ), actual AS (
        SELECT namespace.nspname || '.' || relation.relname AS relation_name,
               policy.polname AS policy_name, helper.helper_name,
               pg_temp._00488_call_count(
                 COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
                   || ' ' || COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
                 helper.helper_name
               ) AS call_count
        FROM pg_catalog.pg_policy AS policy
        JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN helper
      )
      (SELECT relation_name, policy_name, helper_name, catalog_call_count FROM expected
       EXCEPT SELECT relation_name, policy_name, helper_name, call_count
       FROM actual WHERE call_count > 0)
      UNION ALL
      (SELECT relation_name, policy_name, helper_name, call_count
       FROM actual WHERE call_count > 0
       EXCEPT SELECT relation_name, policy_name, helper_name, catalog_call_count FROM expected)
    ) THEN
      RAISE EXCEPTION '00488 source policy caller universe drifted';
    END IF;

    IF pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         'is_studio_comember'
       ) <> {source_view_calls.get('is_studio_comember', {}).get('catalog', 0)}
       OR pg_temp._00488_call_count(
         pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
         'is_active_studio_member'
       ) <> {source_view_calls.get('is_active_studio_member', {}).get('catalog', 0)}
    THEN
      RAISE EXCEPTION '00488 source view caller universe drifted';
    END IF;
  END IF;

  IF EXISTS (
    WITH expected(signature, table_name, authority_mode) AS (VALUES
      {writer_values}
    ), tables(table_name) AS (VALUES
      ('proposals'),('designer_clients'),('leads'),('client_decisions'),
      ('saved_vendors'),('phase_templates')
    ), actual AS (
      SELECT routine.oid, tables.table_name
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      CROSS JOIN tables
      WHERE namespace.nspname IN ('public','app_private')
        AND pg_temp._00488_insert_count(routine.prosrc, tables.table_name) > 0
        AND NOT pg_temp._00488_dynamic_mentions(routine.prosrc, tables.table_name)
    )
    (SELECT pg_catalog.to_regprocedure(signature) AS oid, table_name FROM expected
     EXCEPT SELECT oid, table_name FROM actual)
    UNION ALL
    (SELECT oid, table_name FROM actual
     EXCEPT SELECT pg_catalog.to_regprocedure(signature), table_name FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 live SQL snapshot-writer source/final universe drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    CROSS JOIN pg_catalog.unnest(ARRAY[
      'proposals','designer_clients','leads','client_decisions',
      'saved_vendors','phase_templates'
    ]::text[]) AS target(table_name)
    WHERE namespace.nspname IN ('public','app_private')
      AND pg_temp._00488_dynamic_mentions(routine.prosrc, target.table_name)
  ) THEN
    RAISE EXCEPTION '00488 dynamic snapshot-table writer is outside the reviewed universe';
  END IF;

  IF EXISTS (
    WITH expected(relation_name, policy_name, command, permissive, roles,
                  source_fingerprint, final_fingerprint, platform_handoff) AS (VALUES
      {policy_values}
    ), actual AS (
      SELECT expected.*, policy.oid,
        policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR (NOT final_state AND fingerprint <> source_fingerprint)
       OR (final_state AND NOT platform_handoff AND fingerprint <> final_fingerprint)
       OR (final_state AND platform_handoff
           AND fingerprint NOT IN (source_fingerprint, final_fingerprint))
  ) THEN
    RAISE EXCEPTION '00488 reviewed policy source/final preflight failed';
  END IF;
{delete_guard_check}
{mutation_guard_check}
{affected_policy_check}

  IF pg_catalog.to_regclass('public.people_directory') IS NULL THEN
    RAISE EXCEPTION '00488 reviewed people_directory source view is missing';
  END IF;
{people_directory_profile_sql("CASE WHEN final_state THEN 'final' ELSE 'source' END")}
{trigger_check}
  IF EXISTS (
    WITH expected(signature, body_sha256) AS (VALUES
      {disposition_values}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    WHERE routine.oid IS NULL OR pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
    ), 'hex') <> expected.body_sha256
  ) THEN
    RAISE EXCEPTION '00488 preserved 00485/00486 routine disposition drifted';
  END IF;

  IF EXISTS (
    WITH expected(
      relation_name, prior_policy, replacement_policy, command, permissive,
      roles, qual_sql, check_sql
    ) AS (VALUES
      {disposition_policy_values}
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_policy_fingerprint(
          expected.relation_name, expected.qual_sql, expected.check_sql
        ) AS expected_fingerprint,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid)
          AS actual_fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.replacement_policy
    )
    SELECT 1 FROM actual
    WHERE EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS prior
      WHERE prior.polrelid = pg_catalog.to_regclass(actual.relation_name)
        AND prior.polname = actual.prior_policy
    ) OR oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR actual_fingerprint IS DISTINCT FROM expected_fingerprint
  ) THEN
    RAISE EXCEPTION '00488 preserved 00486 policy disposition drifted';
  END IF;
{workspace_signature_dependency_sql("CASE WHEN final_state THEN 'final' ELSE 'source' END")}
{composed_00485_dependency_sql()}
END;
$canonical_studio_source_preflight$;"""


def postflight_sql(
    document: dict[str, Any],
    routines: list[dict[str, Any]],
    policies: list[dict[str, Any]],
    delete_guards: list[dict[str, Any]],
    mutation_guards: list[dict[str, Any]],
    affected_policies: list[dict[str, Any]],
    surfaces: list[dict[str, Any]],
    callers: dict[str, list[dict[str, Any]]],
    lock_order_manifest: list[dict[str, Any]],
    rendered_template: str,
    *,
    dynamic_routines: list[dict[str, Any]],
) -> str:
    routine_values = routine_values_sql(routines)
    policy_values = policy_values_sql(policies)
    delete_guard_check = delete_guard_gate_sql(delete_guards, "true")
    mutation_guard_check = mutation_guard_gate_sql(mutation_guards, "true")
    affected_policy_check = affected_policy_gate_sql(affected_policies, "true")
    disposition_values = disposition_routine_values_sql([
        row for row in routines if row["dependency_kind"] == "already_dispositioned"
    ])
    surface_values = surface_values_sql(surfaces)
    trigger_values = trigger_values_sql(routines)
    disposition_policy_values = disposition_policy_values_sql(document)
    routine_caller_values = routine_caller_values_sql(callers)
    policy_caller_values = policy_caller_values_sql(callers)
    writer_values = writer_values_sql()
    final_view_query = extract_people_directory_query(rendered_template)
    return f"""CREATE OR REPLACE TEMP VIEW _00488_expected_people_directory_postflight AS
{final_view_query};

DO $canonical_studio_final_postflight$
BEGIN
{reviewed_rls_relation_gate_sql(policies, "final postflight")}
{dynamic_routine_contract_sql(dynamic_routines, "'final'")}
{dynamic_invoice_core_dependency_sql()}
{snapshot_schema_postflight_sql()}
{people_directory_profile_sql("'final'")}

  IF pg_catalog.pg_get_viewdef(
       'public.people_directory'::pg_catalog.regclass, true
     ) IS DISTINCT FROM pg_catalog.pg_get_viewdef(
       pg_catalog.to_regclass('pg_temp._00488_expected_people_directory_postflight'), true
     )
  THEN
    RAISE EXCEPTION '00488 people_directory exact final definition postflight failed';
  END IF;

  IF EXISTS (
    WITH expected(schema_name, relation_name, trigger_name, trigger_type,
                  enabled, definition, args_hex, signature) AS (VALUES
      {trigger_values}
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.nspname = expected.schema_name
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.relnamespace = namespace.oid
     AND relation.relname = expected.relation_name
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = relation.oid
     AND trigger_row.tgname = expected.trigger_name
     AND NOT trigger_row.tgisinternal
    WHERE trigger_row.oid IS NULL
       OR trigger_row.tgtype <> expected.trigger_type
       OR trigger_row.tgenabled <> expected.enabled
       OR pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.pg_get_triggerdef(trigger_row.oid)),
            '[[:space:]]', '', 'g'
          ) IS DISTINCT FROM expected.definition
       OR pg_catalog.encode(trigger_row.tgargs, 'hex') <> expected.args_hex
       OR trigger_row.tgfoid <> pg_catalog.to_regprocedure(expected.signature)
  ) OR EXISTS (
    WITH expected(schema_name, relation_name, trigger_name, trigger_type,
                  enabled, definition, args_hex, signature) AS (VALUES
      {trigger_values}
    )
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgfoid IN (
        SELECT pg_catalog.to_regprocedure(signature) FROM expected
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE expected.schema_name = namespace.nspname
          AND expected.relation_name = relation.relname
          AND expected.trigger_name = trigger_row.tgname
          AND expected.signature::pg_catalog.regprocedure = trigger_row.tgfoid
      )
  ) THEN
    RAISE EXCEPTION '00488 reviewed trigger bidirectional postflight failed';
  END IF;

  IF EXISTS (
    WITH expected(
      signature, source_arguments, final_arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, source_config, final_config, source_body_sha256,
      final_body_sha256, allowed_roles, retired
    ) AS (VALUES
      {routine_values}
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    WHERE (retired AND routine.oid IS NOT NULL)
       OR (NOT retired AND (
            routine.oid IS NULL
         OR owner.rolname IS DISTINCT FROM owner_name
         OR language.lanname IS DISTINCT FROM language_name
         OR routine.prokind IS DISTINCT FROM kind::"char"
         OR routine.prosecdef IS DISTINCT FROM security_definer
         OR routine.proleakproof IS DISTINCT FROM leakproof
         OR routine.proisstrict IS DISTINCT FROM strict
         OR routine.proparallel IS DISTINCT FROM parallel::"char"
         OR routine.provolatile IS DISTINCT FROM volatility::"char"
         OR routine.proretset IS DISTINCT FROM returns_set
         OR pg_catalog.pg_get_function_arguments(routine.oid)
              IS DISTINCT FROM final_arguments
         OR pg_catalog.pg_get_function_result(routine.oid)
              IS DISTINCT FROM result_type
         OR routine.proconfig IS DISTINCT FROM final_config
         OR pg_catalog.encode(extensions.digest(
              pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
            ), 'hex') IS DISTINCT FROM final_body_sha256
       ))
  ) THEN
    RAISE EXCEPTION '00488 reviewed routine final profile/body postflight failed';
  END IF;

  -- Exact ACL equality: grantor and grant option are part of the contract,
  -- and the anti-join rejects every unnamed/extra app-role grant.
  IF EXISTS (
    WITH routine_expected(
      signature, source_arguments, final_arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, source_config, final_config, source_body_sha256,
      final_body_sha256, allowed_roles, retired
    ) AS (VALUES
      {routine_values}
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM routine_expected
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
      WHERE NOT retired
    ), actual AS (
      SELECT routine_expected.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
             grantor.rolname AS grantor, acl.privilege_type, acl.is_grantable
      FROM routine_expected
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(routine_expected.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 reviewed routine final ACL/grantor postflight failed';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), expected AS (
      SELECT * FROM states WHERE state_name = 'final'
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    WHERE (NOT should_exist AND routine.oid IS NOT NULL)
       OR (should_exist AND (
            routine.oid IS NULL
         OR owner.rolname IS DISTINCT FROM owner_name
         OR language.lanname IS DISTINCT FROM language_name
         OR routine.prokind IS DISTINCT FROM kind::"char"
         OR routine.prosecdef IS DISTINCT FROM security_definer
         OR routine.proleakproof IS DISTINCT FROM leakproof
         OR routine.proisstrict IS DISTINCT FROM strict
         OR routine.proparallel IS DISTINCT FROM parallel::"char"
         OR routine.provolatile IS DISTINCT FROM volatility::"char"
         OR routine.proretset IS DISTINCT FROM returns_set
         OR pg_catalog.pg_get_function_result(routine.oid) IS DISTINCT FROM result_type
         OR pg_catalog.pg_get_function_arguments(routine.oid) IS DISTINCT FROM arguments
         OR routine.proconfig IS DISTINCT FROM config
         OR pg_catalog.encode(extensions.digest(
              pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
            ), 'hex') IS DISTINCT FROM body_sha256
       ))
  ) OR EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), expected AS (
      SELECT * FROM states WHERE state_name = 'final' AND should_exist
    )
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        '_can_read_studio_snapshot','_lock_designer_studio_authority',
        '_can_author_studio_snapshot','guard_canonical_studio_snapshot',
        'is_studio_comember','is_design_studio_comember','_can_author_proposal',
        'is_active_studio_member','_prepare_canonical_lead_claim',
        '_claim_design_request_00488_core','claim_design_request',
        '_accept_design_request_00488_core','accept_design_request',
        'open_project_direct','set_document_client'
      )
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = routine.oid
      )
  ) THEN
    RAISE EXCEPTION '00488 manual authority surface profile/overload postflight failed';
  END IF;

  IF EXISTS (
    WITH states(
      signature, state_name, should_exist, arguments, owner_name, language_name,
      kind, security_definer, leakproof, strict, parallel, volatility,
      returns_set, result_type, config, body_sha256, allowed_roles
    ) AS (VALUES
      {surface_values}
    ), chosen AS (
      SELECT * FROM states WHERE state_name = 'final' AND should_exist
    ), expected AS (
      SELECT signature, role_name AS grantee, owner_name AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
      FROM chosen
      CROSS JOIN LATERAL pg_catalog.unnest(allowed_roles) AS role_name
    ), actual AS (
      SELECT chosen.signature,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
             grantor.rolname AS grantor, acl.privilege_type, acl.is_grantable
      FROM chosen
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = pg_catalog.to_regprocedure(chosen.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl, pg_catalog.acldefault('f', routine.proowner)
      )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 manual authority surface ACL/grantor postflight failed';
  END IF;

  IF EXISTS (
    WITH expected(relation_name, policy_name, command, permissive, roles,
                  source_fingerprint, final_fingerprint, platform_handoff) AS (VALUES
      {policy_values}
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR (NOT platform_handoff AND fingerprint <> final_fingerprint)
       OR (platform_handoff AND fingerprint NOT IN (source_fingerprint, final_fingerprint))
  ) THEN
    RAISE EXCEPTION '00488 reviewed policy final postflight failed';
  END IF;
{delete_guard_check}
{mutation_guard_check}
{affected_policy_check}

  IF EXISTS (
    WITH expected(signature, body_sha256) AS (VALUES
      {disposition_values}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    WHERE routine.oid IS NULL OR pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(routine.prosrc, 'UTF8'), 'sha256'
    ), 'hex') <> expected.body_sha256
  ) THEN
    RAISE EXCEPTION '00488 restored or changed a final 00485/00486 routine';
  END IF;

  IF EXISTS (
    WITH expected(
      relation_name, prior_policy, replacement_policy, command, permissive,
      roles, qual_sql, check_sql
    ) AS (VALUES
      {disposition_policy_values}
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_policy_fingerprint(
          expected.relation_name, expected.qual_sql, expected.check_sql
        ) AS expected_fingerprint,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid)
          AS actual_fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.replacement_policy
    )
    SELECT 1 FROM actual
    WHERE EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy AS old_policy
      WHERE old_policy.polrelid = pg_catalog.to_regclass(actual.relation_name)
        AND old_policy.polname = actual.prior_policy
    ) OR oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR actual_fingerprint IS DISTINCT FROM expected_fingerprint
  ) THEN
    RAISE EXCEPTION '00488 restored or changed a final 00485/00486 policy disposition';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = pg_catalog.to_regprocedure('public._can_manage_invoice_owner(uuid)')
  ) THEN
    RAISE EXCEPTION '00488 retired invoice owner helper still exists';
  END IF;

  IF EXISTS (
    WITH expected(signature, helper_name, lexical_call_count, catalog_call_count) AS (VALUES
      {routine_caller_values}
    ), helper(helper_name) AS (VALUES
      ('_can_read_studio_snapshot'),('_can_author_studio_snapshot'),
      ('_lock_designer_studio_authority'),('_prepare_canonical_lead_claim')
    ), actual AS (
      SELECT routine.oid, helper.helper_name,
             pg_temp._00488_call_count(
               routine.prosrc, helper.helper_name
             ) AS call_count,
             pg_temp._00488_dynamic_mentions(
               routine.prosrc, helper.helper_name
             ) AS dynamic_call
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      CROSS JOIN helper
      WHERE namespace.nspname IN ('public','app_private')
    )
    SELECT 1 FROM expected
    LEFT JOIN actual
      ON actual.oid = pg_catalog.to_regprocedure(expected.signature)
     AND actual.helper_name = expected.helper_name
    WHERE actual.call_count IS DISTINCT FROM expected.catalog_call_count
       OR actual.dynamic_call
  ) OR EXISTS (
    WITH expected(signature, helper_name, lexical_call_count, catalog_call_count) AS (VALUES
      {routine_caller_values}
    ), helper(helper_name) AS (VALUES
      ('_can_read_studio_snapshot'),('_can_author_studio_snapshot'),
      ('_lock_designer_studio_authority'),('_prepare_canonical_lead_claim')
    ), actual AS (
      SELECT routine.oid, helper.helper_name,
             pg_temp._00488_call_count(
               routine.prosrc, helper.helper_name
             ) AS call_count,
             pg_temp._00488_dynamic_mentions(
               routine.prosrc, helper.helper_name
             ) AS dynamic_call
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      CROSS JOIN helper
      WHERE namespace.nspname IN ('public','app_private')
    )
    SELECT 1 FROM actual
    WHERE (actual.call_count > 0 OR actual.dynamic_call)
      AND NOT EXISTS (
        SELECT 1 FROM expected
        WHERE pg_catalog.to_regprocedure(expected.signature) = actual.oid
          AND expected.helper_name = actual.helper_name
      )
  ) THEN
    RAISE EXCEPTION '00488 canonical routine caller bidirectional postflight failed';
  END IF;

  IF EXISTS (
    WITH expected(relation_name, policy_name, helper_name, call_count, required) AS (VALUES
      {policy_caller_values}
    ), actual AS (
      SELECT expected.*,
             pg_temp._00488_call_count(
               COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
                 || ' ' || COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
               expected.helper_name
             ) AS actual_count
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE required AND actual_count IS DISTINCT FROM call_count
  ) OR EXISTS (
    WITH expected(relation_name, policy_name, helper_name, call_count, required) AS (VALUES
      {policy_caller_values}
    ), helper(helper_name) AS (VALUES
      ('_can_read_studio_snapshot'),('_can_author_studio_snapshot'),
      ('_lock_designer_studio_authority'),('_prepare_canonical_lead_claim')
    ), actual AS (
      SELECT namespace.nspname || '.' || relation.relname AS relation_name,
             policy.polname AS policy_name, helper.helper_name
      FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN helper
      WHERE pg_temp._00488_call_count(
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
          || ' ' || COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        helper.helper_name
      ) > 0
    )
    SELECT 1 FROM actual
    WHERE NOT EXISTS (
      SELECT 1 FROM expected
      WHERE expected.relation_name = actual.relation_name
        AND expected.policy_name = actual.policy_name
        AND expected.helper_name = actual.helper_name
    )
  ) THEN
    RAISE EXCEPTION '00488 canonical policy caller bidirectional postflight failed';
  END IF;

  IF EXISTS (
    WITH expected(signature, table_name, authority_mode) AS (VALUES
      {writer_values}
    ), tables(table_name) AS (VALUES
      ('proposals'),('designer_clients'),('leads'),('client_decisions'),
      ('saved_vendors'),('phase_templates')
    ), actual AS (
      SELECT routine.oid, tables.table_name
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      CROSS JOIN tables
      WHERE namespace.nspname IN ('public','app_private')
        AND pg_temp._00488_insert_count(routine.prosrc, tables.table_name) > 0
        AND NOT pg_temp._00488_dynamic_mentions(routine.prosrc, tables.table_name)
    )
    (SELECT pg_catalog.to_regprocedure(signature) AS oid, table_name FROM expected
     EXCEPT SELECT oid, table_name FROM actual)
    UNION ALL
    (SELECT oid, table_name FROM actual
     EXCEPT SELECT pg_catalog.to_regprocedure(signature), table_name FROM expected)
  ) THEN
    RAISE EXCEPTION '00488 live SQL snapshot-writer universe drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    CROSS JOIN pg_catalog.unnest(ARRAY[
      'proposals','designer_clients','leads','client_decisions',
      'saved_vendors','phase_templates'
    ]::text[]) AS target(table_name)
    WHERE namespace.nspname IN ('public','app_private')
      AND pg_temp._00488_dynamic_mentions(routine.prosrc, target.table_name)
  ) THEN
    RAISE EXCEPTION '00488 dynamic snapshot-table writer survived final state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS caller
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = caller.pronamespace
    CROSS JOIN pg_catalog.unnest(ARRAY[
      '_can_manage_invoice_owner','_can_author_proposal',
      'is_active_studio_member','is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE namespace.nspname IN ('public', 'app_private')
      AND caller.proname NOT IN (
        'is_studio_comember','is_design_studio_comember',
        '_can_author_proposal','is_active_studio_member'
      )
      AND (
        pg_temp._00488_call_count(caller.prosrc, forbidden.helper_name) > 0
        OR pg_temp._00488_dynamic_mentions(caller.prosrc, forbidden.helper_name)
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN pg_catalog.unnest(ARRAY[
      '_can_manage_invoice_owner','_can_author_proposal',
      'is_active_studio_member','is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE namespace.nspname <> 'storage'
      AND pg_temp._00488_call_count(
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
          || COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        forbidden.helper_name
      ) > 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      '_can_manage_invoice_owner','_can_author_proposal',
      'is_active_studio_member','is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE pg_temp._00488_call_count(
      pg_catalog.pg_get_viewdef('public.people_directory'::pg_catalog.regclass, true),
      forbidden.helper_name
    ) > 0
  )
  THEN
    RAISE EXCEPTION '00488 forbidden legacy authority caller survived outside reserved storage';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND pg_temp._00488_mask_sql(routine.prosrc)
        ~* '(_primary_studio_for[[:space:]]*\\(|profiles?\\.is_designer|membership\\.created_at[[:space:]]+(asc|desc))'
      AND routine.oid IN (
        SELECT pg_catalog.to_regprocedure(expected.signature)
        FROM (VALUES
          {', '.join('(' + sql_literal(row['canonical_regprocedure']) + ')' for row in routines if row['disposition'] not in ('retired', 'preserved_00485_00486'))}
        ) AS expected(signature)
      )
  ) THEN
    RAISE EXCEPTION '00488 reviewed routine retained a heuristic authority token';
  END IF;
{canonical_lock_order_postflight_sql(lock_order_manifest)}
{workspace_signature_dependency_sql("'final'")}
{composed_00485_dependency_sql()}
END;
$canonical_studio_final_postflight$;"""


def render_outputs(document: dict[str, Any]) -> dict[Path, bytes]:
    policy_catalog_sources = load_policy_catalog_expressions(document)
    affected_policy_compatibility = load_affected_policy_compatibility()
    runtime_writers = runtime_writer_universe()
    runtime_rpc_callers = runtime_rpc_caller_universe()
    workspace_contract = runtime_workspace_contract()
    generated_type_contract = generated_database_type_contract()
    seed_writers = configured_seed_writer_universe()
    sql_regressions = sql_regression_contract()
    profile_contract = load_routine_profiles()
    profile_contract.update(MANUAL_WRITER_PROFILES)
    final_00485 = load_final_00485_fragments()
    disposition_manifests = disposition_routine_manifests(
        document, profile_contract, final_00485
    )
    reviewed_signatures = {
        row["canonical_regprocedure"] for row in document["live_routines"]
    } | {
        row["canonical_regprocedure"]
        for row in document["already_dispositioned"]["routines"]
    }
    composed_upstream_manifest = composed_00485_manifest(
        profile_contract, final_00485, reviewed_signatures
    )
    source_fragments: dict[str, str] = {}
    (
        dynamic_invoice_source,
        dynamic_invoice_final_sql,
        dynamic_invoice_manifest,
    ) = dynamic_invoice_core_disposition(profile_contract)
    source_fragments[DYNAMIC_INVOICE_CORE] = dynamic_invoice_source
    dynamic_routines = reviewed_dynamic_routine_contract(
        profile_contract, dynamic_invoice_manifest
    )
    extra_writer_sql: list[str] = []
    extra_writer_manifest: list[dict[str, Any]] = []
    for signature in EXTRA_WRITER_REPLACEMENTS:
        profile_row = profile_contract.get(signature)
        require(profile_row is not None, f"{signature}: missing extra-writer profile")
        extracted = extract_profile_function(profile_row)
        source_fragments[signature] = extracted["fragment"]
        final_sql, final_body_sha = transform_extra_writer(profile_row, extracted)
        final_config = profile_row["profile"]["final_config"]
        require(isinstance(final_config, list) and len(final_config) == 1, f"{signature}: expected one final config")
        setting, value = final_config[0].split("=", 1)
        require(setting == "search_path", f"{signature}: unexpected final config")
        extra_writer_sql.append(
            final_sql + f"\nALTER FUNCTION {signature} SET search_path = {value};"
        )
        source_profile = dict(profile_row["profile"])
        source_profile["pre_00484_config"] = source_profile.get("source_config")
        source_profile["source_config"] = final_config
        final_profile = dict(profile_row["profile"])
        final_profile["body_sha256"] = final_body_sha
        final_profile["body_octets"] = len(function_fragments(final_sql)[0]["body"].encode("utf-8"))
        extra_writer_manifest.append({
            "record_id": "writer-routine:" + signature,
            "canonical_regprocedure": signature,
            "dependency_kind": "snapshot_writer",
            "source_body_sha256": profile_row["profile"]["body_sha256"],
            "final_body_sha256": final_body_sha,
            "source": profile_row["source_definition"],
            "roles": profile_row["allowed_roles"],
            "allowed_roles": profile_row["allowed_roles"],
            "security_definer": profile_row["profile"]["security_definer"],
            "source_arguments_with_defaults": profile_row["arguments_with_defaults"],
            "arguments_with_defaults": profile_row["arguments_with_defaults"],
            "source_profile": source_profile,
            "profile": final_profile,
            "trigger_bindings": [],
            "caller_evidence": profile_row["evidence"]["references"],
            "source_authority_calls": helper_call_profile(
                extracted["fragment"], SOURCE_AUTHORITY_HELPERS
            ),
            "disposition": "explicit_snapshot_writer_rewrite",
        })
    for signature in PRESERVED_WRITER_SIGNATURES:
        profile_row = profile_contract.get(signature)
        require(profile_row is not None, f"{signature}: preserved-writer profile missing")
        extracted = extract_profile_function(profile_row)
        source_fragments[signature] = extracted["fragment"]
        final_profile = dict(profile_row["profile"])
        final_profile["source_config"] = final_profile["final_config"]
        final_profile["body_octets"] = len(extracted["body"].encode("utf-8"))
        extra_writer_manifest.append({
            "record_id": "writer-routine:" + signature,
            "canonical_regprocedure": signature,
            "dependency_kind": "snapshot_writer",
            "source_body_sha256": extracted["body_sha256"],
            "final_body_sha256": extracted["body_sha256"],
            "source": profile_row["source_definition"],
            "roles": profile_row["allowed_roles"],
            "allowed_roles": profile_row["allowed_roles"],
            "security_definer": profile_row["profile"]["security_definer"],
            "source_arguments_with_defaults": profile_row["arguments_with_defaults"],
            "arguments_with_defaults": profile_row["arguments_with_defaults"],
            "source_profile": final_profile,
            "profile": final_profile,
            "trigger_bindings": profile_row["bindings"]["triggers"],
            "caller_evidence": profile_row["evidence"]["references"],
            "source_authority_calls": helper_call_profile(
                extracted["fragment"], SOURCE_AUTHORITY_HELPERS
            ),
            "disposition": "exact_parent_writer_preserved",
        })

    routines_sql: list[str] = []
    routine_manifest: list[dict[str, Any]] = []
    for row in document["live_routines"]:
        signature = row["canonical_regprocedure"]
        reviewed_extracted = extract_function(row)
        extracted = final_00485.get(signature, reviewed_extracted)
        source_fragments[signature] = extracted["fragment"]
        if signature in final_00485:
            require(
                not any(find_calls(extracted["fragment"], helper) for helper in SOURCE_AUTHORITY_HELPERS),
                f"{signature}: frozen 00485 body retained a legacy authority helper",
            )
            final_sql, final_body_sha = extracted["fragment"], extracted["body_sha256"]
        else:
            final_sql, final_body_sha = transform_routine(row, extracted)
        profile_row = profile_contract.get(row["canonical_regprocedure"])
        require(profile_row is not None, f"{row['canonical_regprocedure']}: missing exact profile contract")
        if final_sql:
            final_config = profile_row["profile"]["final_config"]
            require(isinstance(final_config, list) and len(final_config) == 1, f"{row['canonical_regprocedure']}: expected one final config")
            setting, value = final_config[0].split("=", 1)
            require(setting == "search_path", f"{row['canonical_regprocedure']}: unexpected final config")
            routines_sql.append(
                final_sql
                + f"\nALTER FUNCTION {row['canonical_regprocedure']} SET search_path = {value};"
            )
        profile = dict(profile_row["profile"])
        profile["body_sha256"] = final_body_sha
        if final_sql:
            final_extracted = function_fragments(final_sql)
            require(len(final_extracted) == 1, f"{row['canonical_regprocedure']}: final body extraction failed")
            profile["body_octets"] = len(final_extracted[0]["body"].encode("utf-8"))
        else:
            profile["body_octets"] = 0
        source_profile = dict(profile_row["profile"])
        source_profile["pre_00484_config"] = source_profile.get("source_config")
        source_profile["source_config"] = source_profile["final_config"]
        if signature in final_00485:
            source_profile["body_sha256"] = extracted["body_sha256"]
            source_profile["body_octets"] = len(extracted["body"].encode("utf-8"))
        source_descriptor = row["source"]
        if signature in final_00485:
            source_descriptor = {
                "path": str(FINAL_00485.relative_to(ROOT)),
                "file_sha256": FINAL_00485_SHA256,
                "commit": FINAL_00485_COMMIT,
                "line": extracted["line"],
            }
        routine_manifest.append({
            "record_id": row["record_id"],
            "canonical_regprocedure": row["canonical_regprocedure"],
            "dependency_kind": row["dependency_kind"],
            "review_source_body_sha256": row["body_sha256"],
            "source_body_sha256": extracted["body_sha256"],
            "final_body_sha256": final_body_sha,
            "source": source_descriptor,
            "roles": profile_row["allowed_roles"] if signature in final_00485 else row["roles"],
            "allowed_roles": (
                profile_row["allowed_roles"]
                if signature in final_00485
                else [role for role in row["roles"] if role in APP_ROLE_UNIVERSE]
            ),
            "security_definer": row["security_definer"],
            "source_arguments_with_defaults": profile_row["arguments_with_defaults"],
            "arguments_with_defaults": profile_row["arguments_with_defaults"],
            "source_profile": source_profile,
            "profile": profile,
            "trigger_bindings": row["trigger_bindings"],
            "caller_evidence": row["runtime_evidence"],
            "source_authority_calls": helper_call_profile(
                extracted["fragment"], SOURCE_AUTHORITY_HELPERS
            ),
            "disposition": (
                "retired"
                if row["canonical_regprocedure"] == "public._can_manage_invoice_owner(uuid)"
                else "resource_signature_replaced_in_00488"
                if row["canonical_regprocedure"] == "public.can_dispatch_proposal_send(uuid)"
                else "preserved_frozen_composed_00485"
                if signature in final_00485
                else "exact_anchor_rewrite"
            ),
        })

    policies_sql: list[str] = []
    policy_manifest: list[dict[str, Any]] = []
    delete_guard_manifest: list[dict[str, Any]] = []
    mutation_guard_statements, mutation_guard_manifest = (
        snapshot_mutation_guards()
    )
    storage_rows: list[tuple[dict[str, Any], str, str]] = []
    source_policy_statements: dict[str, str] = {}
    for row in document["live_policies"]:
        source_statement = extract_policy(row)
        source_policy_statements[row["record_id"]] = source_statement
        final_statement = transform_policy(row, source_statement, storage=row["relation"] == "storage.objects")
        catalog_key = f"{row['relation']}:{row['policy']}"
        source_catalog = policy_catalog_sources[catalog_key]
        final_catalog = project_final_policy_catalog_expressions(
            row, source_catalog
        )
        source_catalog_calls = helper_call_profile(
            " ".join(
                value for value in source_catalog.values() if value is not None
            ),
            SOURCE_AUTHORITY_HELPERS,
        )
        require(
            source_catalog_calls
            == helper_call_profile(source_statement, SOURCE_AUTHORITY_HELPERS),
            f"{row['record_id']}: catalog/source helper profile drifted",
        )
        manifest_row = {
            "record_id": row["record_id"],
            "relation": row["relation"],
            "policy": row["policy"],
            "operation": row["operation"],
            "roles": row["roles"],
            "permissive": row["policy_mode"] == "PERMISSIVE",
            "source_statement_sha256": digest(source_statement.encode("utf-8")),
            "final_statement_sha256": digest(final_statement.encode("utf-8")),
            "source_catalog_qual": source_catalog["qual"],
            "source_catalog_with_check": source_catalog["with_check"],
            "final_catalog_qual": final_catalog["qual"],
            "final_catalog_with_check": final_catalog["with_check"],
            "source_catalog_fingerprint": policy_fingerprint(source_catalog),
            "final_catalog_fingerprint": policy_fingerprint(final_catalog),
            "source": row["source"],
            "dependency_kind": row["dependency_kind"],
            "disposition": "platform_admin_handoff" if row["relation"] == "storage.objects" else "dropped_and_recreated_exact",
            "final_helper_call_counts": {
                helper: len(find_calls(final_statement, helper))
                for helper in CANONICAL_HELPERS
                if find_calls(final_statement, helper)
            },
            "source_authority_calls": helper_call_profile(
                source_statement, SOURCE_AUTHORITY_HELPERS
            ),
        }
        policy_manifest.append(manifest_row)
        if row["relation"] == "storage.objects":
            storage_rows.append((row, source_statement, final_statement))
            continue
        policy_replacement = (
            f"DROP POLICY IF EXISTS {quote_ident(row['policy'])} "
            f"ON {row['relation']};\n{final_statement}"
        )
        if row["operation"] == "ALL":
            guard_statement, guard_manifest = ordinary_all_delete_guard(
                row, final_statement, final_catalog
            )
            delete_guard_manifest.append(guard_manifest)
            policy_replacement = (
                f"DROP POLICY IF EXISTS {quote_ident(guard_manifest['policy'])} "
                f"ON {row['relation']};\n"
                + policy_replacement
                + "\n"
                + guard_statement
            )
        policies_sql.append(policy_replacement)
    require(
        len(delete_guard_manifest) == 36,
        "ordinary ALL-policy delete guard universe is not 36",
    )
    affected_policy_manifest = affected_policy_universe(
        policy_manifest,
        affected_policy_compatibility,
        delete_guard_manifest,
        mutation_guard_manifest,
    )
    policies_sql.extend(
        f"DROP POLICY IF EXISTS {quote_ident(row['policy'])} "
        f"ON {row['relation']};\n{statement}"
        for row, statement in zip(
            mutation_guard_manifest, mutation_guard_statements
        )
    )

    template = (ROOT / "supabase/acl/00488_canonical_studio_authority_template.sql").read_text(encoding="utf-8")
    template = template.replace(
        "-- @@GENERATED_COMPATIBILITY_CORES@@",
        "\n\n".join(compatibility_core_sql(profile_contract)),
    )
    template = template.replace(
        "-- @@GENERATED_DYNAMIC_INVOICE_CORE@@",
        dynamic_invoice_final_sql,
    )
    template = template.replace("-- @@GENERATED_WRITER_ROUTINES@@", "\n\n".join(extra_writer_sql))
    template = template.replace("-- @@GENERATED_ROUTINES@@", "\n\n".join(routines_sql))
    template = template.replace("-- @@GENERATED_POLICIES@@", "\n\n".join(policies_sql))
    dcl: list[str] = []
    dcl_signatures: set[str] = set()
    for row in (
        *routine_manifest,
        *extra_writer_manifest,
        dynamic_invoice_manifest,
        *disposition_manifests,
        *composed_upstream_manifest,
    ):
        signature = row["canonical_regprocedure"]
        if signature in dcl_signatures or row["disposition"] in (
            "retired",
            "resource_signature_replaced_in_00488",
        ):
            continue
        dcl_signatures.add(signature)
        dcl.append(
            f"REVOKE EXECUTE ON FUNCTION {signature} FROM PUBLIC, {', '.join(APP_ROLE_UNIVERSE)};"
        )
        grants = row["allowed_roles"]
        if grants:
            dcl.append(
                f"GRANT EXECUTE ON FUNCTION {signature} TO {', '.join(grants)};"
            )
    template = template.replace("-- @@GENERATED_DCL@@", "\n".join(dcl))

    rendered_functions = function_fragments(template)
    for manifest_row in routine_manifest:
        if manifest_row["canonical_regprocedure"] != "public.can_dispatch_proposal_send(uuid)":
            continue
        matches = [
            item for item in rendered_functions
            if item["schema"] == "public" and item["name"] == "can_dispatch_proposal_send"
        ]
        require(len(matches) == 1, "manual proposal dispatch body is not unique")
        manifest_row["final_body_sha256"] = matches[0]["body_sha256"]
        manifest_row["arguments_with_defaults"] = "p_proposal_id uuid"
        manifest_row["profile"]["body_sha256"] = matches[0]["body_sha256"]
        manifest_row["profile"]["body_octets"] = len(matches[0]["body"].encode("utf-8"))

    authority_surfaces = authority_surface_manifest(template, profile_contract)
    all_routine_profiles = [
        *routine_manifest,
        *extra_writer_manifest,
        dynamic_invoice_manifest,
        *disposition_manifests,
        *composed_upstream_manifest,
    ]
    caller_manifest = canonical_caller_manifest(
        template,
        all_routine_profiles,
        authority_surfaces,
        [
            *policy_manifest,
            *delete_guard_manifest,
            *mutation_guard_manifest,
        ],
    )
    lock_order_manifest = canonical_lock_order_manifest(
        template, all_routine_profiles, authority_surfaces
    )

    template = template.replace(
        "-- @@GENERATED_PREFLIGHT@@",
        preflight_sql(
            document,
            all_routine_profiles,
            policy_manifest,
            delete_guard_manifest,
            mutation_guard_manifest,
            affected_policy_manifest,
            authority_surfaces,
            template,
            dynamic_routines=dynamic_routines,
        ),
    )
    template = template.replace(
        "-- @@GENERATED_POSTFLIGHT@@",
        postflight_sql(
            document,
            all_routine_profiles,
            policy_manifest,
            delete_guard_manifest,
            mutation_guard_manifest,
            affected_policy_manifest,
            authority_surfaces,
            caller_manifest,
            lock_order_manifest,
            template,
            dynamic_routines=dynamic_routines,
        ),
    )
    require("@@GENERATED_" not in template, "unfilled generated migration marker")
    rendered_functions = function_fragments(template)

    source_surface_by_signature = {
        row["canonical_regprocedure"]: row
        for row in authority_surfaces
        if row["source_exists"]
    }
    for signature in source_surface_by_signature:
        profile_row = profile_contract.get(signature)
        require(profile_row is not None, f"{signature}: source surface profile missing")
        source_fragments[signature] = extract_rollback_source_surface(profile_row)[
            "fragment"
        ]

    changed_profiles = [
        row for row in all_routine_profiles
        if row["source_body_sha256"] != row["final_body_sha256"]
    ]
    require(len(changed_profiles) == 121, "rollback routine delta is not exactly 121")
    changed_by_signature = {
        row["canonical_regprocedure"]: row for row in changed_profiles
    }
    require(
        len(changed_by_signature) == len(changed_profiles),
        "rollback routine delta contains duplicate signatures",
    )

    rollback_order: list[tuple[str, str, list[str], list[str]]] = []
    invoice_helper = "public._can_manage_invoice_owner(uuid)"
    invoice_row = changed_by_signature.pop(invoice_helper)
    rollback_order.append((
        invoice_helper,
        source_fragments[invoice_helper],
        invoice_row["source_profile"]["source_config"],
        invoice_row["allowed_roles"],
    ))
    compatibility_signatures = (
        "public.is_studio_comember(uuid)",
        "public.is_design_studio_comember(uuid)",
        "public._can_author_proposal(uuid)",
        "public.is_active_studio_member(uuid)",
    )
    for signature in compatibility_signatures:
        surface = source_surface_by_signature[signature]
        rollback_order.append((
            signature,
            source_fragments[signature],
            surface["source_profile"]["config"],
            surface["source_allowed_roles"],
        ))
    for row in changed_profiles:
        signature = row["canonical_regprocedure"]
        if signature == invoice_helper:
            continue
        rollback_order.append((
            signature,
            source_fragments[signature],
            row["source_profile"]["source_config"],
            row["allowed_roles"],
        ))
    source_only_signatures = (
        "public.claim_design_request(uuid)",
        "public.accept_design_request(uuid)",
        "public.open_project_direct(text,uuid,integer,integer,date,uuid)",
        "public.set_document_client(text,uuid,uuid)",
    )
    for signature in source_only_signatures:
        surface = source_surface_by_signature[signature]
        rollback_order.append((
            signature,
            source_fragments[signature],
            surface["source_profile"]["config"],
            surface["source_allowed_roles"],
        ))
    require(len(rollback_order) == 129, "rollback source routine set is not exactly 129")
    rollback_source_routines = "\n\n".join(
        source_function_sql(signature, fragment, config)
        for signature, fragment, config, _ in rollback_order
    )
    rollback_source_dcl = "\n".join(
        function_dcl_sql(signature, roles)
        for signature, _, _, roles in rollback_order
    )

    source_view_path, source_view_text = source_text(document["live_views"][0])
    require(source_view_path.exists(), "source people_directory file disappeared")
    rollback_source_view = (
        "CREATE OR REPLACE VIEW public.people_directory\n"
        "WITH (security_invoker = true) AS\n"
        + extract_people_directory_query(source_view_text)
        + ";"
    )

    changed_ordinary_policies = [
        row for row in policy_manifest
        if row["relation"] != "storage.objects"
        and row["source_catalog_fingerprint"] != row["final_catalog_fingerprint"]
    ]
    require(
        len(changed_ordinary_policies) == 136,
        "rollback ordinary policy delta is not exactly 136",
    )
    delete_guard_by_record = {
        row["derived_from_record_id"]: row for row in delete_guard_manifest
    }
    rollback_policy_parts: list[str] = []
    rollback_policy_parts.extend(
        f"DROP POLICY {quote_ident(row['policy'])} ON {row['relation']};"
        for row in mutation_guard_manifest
    )
    for row in changed_ordinary_policies:
        guard = delete_guard_by_record.get(row["record_id"])
        if guard is not None:
            rollback_policy_parts.append(
                f"DROP POLICY {quote_ident(guard['policy'])} "
                f"ON {row['relation']};"
            )
        rollback_policy_parts.append(
            f"DROP POLICY {quote_ident(row['policy'])} ON {row['relation']};\n"
            + source_policy_statements[row["record_id"]]
        )
    rollback_source_policies = "\n\n".join(rollback_policy_parts)

    storage_policy_contract = [
        row for row in policy_manifest
        if row["disposition"] == "platform_admin_handoff"
    ]
    require(len(storage_policy_contract) == 9, "storage rollback policy set is not nine")
    rollback_source_storage_policies = "\n\n".join(
        f"DROP POLICY {quote_ident(row['policy'])} ON {row['relation']};\n"
        + source_policy_statements[row["record_id"]]
        for row in storage_policy_contract
    )

    final_fragment_by_name = {
        row["name"]: row["fragment"] for row in function_fragments(template)
        if row["schema"] == "public"
    }
    final_surface_by_signature = {
        row["canonical_regprocedure"]: row for row in authority_surfaces
        if row["final_exists"]
    }
    storage_compatibility_sql: list[str] = []
    storage_compatibility_dcl: list[str] = []
    for signature in compatibility_signatures:
        function_name = signature.split(".", 1)[1].split("(", 1)[0]
        surface = final_surface_by_signature[signature]
        fragment = final_fragment_by_name.get(function_name)
        require(fragment is not None, f"{signature}: final compatibility body missing")
        storage_compatibility_sql.append(
            source_function_sql(signature, fragment, surface["profile"]["config"])
        )
        storage_compatibility_dcl.append(
            function_dcl_sql(signature, surface["allowed_roles"])
        )

    rollback_template = ROLLBACK_TEMPLATE.read_text(encoding="utf-8")
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_FINAL_PREFLIGHT@@",
        preflight_sql(
            document,
            all_routine_profiles,
            policy_manifest,
            delete_guard_manifest,
            mutation_guard_manifest,
            affected_policy_manifest,
            authority_surfaces,
            template,
            required_state="final",
            dynamic_routines=dynamic_routines,
        ),
    )
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_STORAGE_SOURCE_SENTINEL@@",
        storage_source_policy_sentinel_sql(storage_policy_contract),
    )
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_SOURCE_ROUTINES@@", rollback_source_routines
    )
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_SOURCE_VIEW@@", rollback_source_view
    )
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_SOURCE_POLICIES@@", rollback_source_policies
    )
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_SOURCE_DCL@@", rollback_source_dcl
    )
    rollback_template = rollback_template.replace(
        "-- @@GENERATED_SOURCE_POSTFLIGHT@@",
        preflight_sql(
            document,
            all_routine_profiles,
            policy_manifest,
            delete_guard_manifest,
            mutation_guard_manifest,
            affected_policy_manifest,
            authority_surfaces,
            template,
            required_state="source",
            dynamic_routines=dynamic_routines,
        ),
    )
    require(
        "@@GENERATED_" not in rollback_template,
        "unfilled generated ordinary rollback marker",
    )
    rollback_bytes = rollback_template.encode("utf-8")

    storage_rollback_template = STORAGE_ROLLBACK_TEMPLATE.read_text(encoding="utf-8")
    storage_rollback_template = storage_rollback_template.replace(
        "-- @@GENERATED_STORAGE_ROLLBACK_PREFLIGHT@@",
        storage_rollback_catalog_gate_sql(
            storage_policy_contract,
            authority_surfaces,
            dynamic_routines,
            required_state="either",
            include_lexer=True,
        ),
    )
    storage_rollback_template = storage_rollback_template.replace(
        "-- @@GENERATED_FINAL_COMPATIBILITY_HELPERS@@",
        "\n\n".join(storage_compatibility_sql),
    )
    storage_rollback_template = storage_rollback_template.replace(
        "-- @@GENERATED_FINAL_COMPATIBILITY_DCL@@",
        "\n".join(storage_compatibility_dcl),
    )
    storage_rollback_template = storage_rollback_template.replace(
        "-- @@GENERATED_SOURCE_STORAGE_POLICIES@@",
        rollback_source_storage_policies,
    )
    storage_rollback_template = storage_rollback_template.replace(
        "-- @@GENERATED_STORAGE_ROLLBACK_POSTFLIGHT@@",
        storage_rollback_catalog_gate_sql(
            storage_policy_contract,
            authority_surfaces,
            dynamic_routines,
            required_state="source",
            include_lexer=False,
        ),
    )
    require(
        "@@GENERATED_" not in storage_rollback_template,
        "unfilled generated storage rollback marker",
    )
    storage_rollback_bytes = storage_rollback_template.encode("utf-8")

    contract_rows = [
        *(row["record_id"] for row in routine_manifest),
        *(row["record_id"] for row in policy_manifest),
        document["live_views"][0]["record_id"],
        *(row["record_id"] for key in ("routines", "policies") for row in document["already_dispositioned"][key]),
    ]
    require(len(contract_rows) == len(set(contract_rows)) == 378, "rendered contract lost or duplicated reviewed rows")
    contract = {
        "schema_version": 1,
        "artifact_kind": "canonical_studio_authority_static_contract",
        "review_input": {"path": str(REVIEW.relative_to(ROOT)), "sha256": REVIEW_SHA256},
        "findings_input": {"path": str(FINDINGS.relative_to(ROOT)), "sha256": FINDINGS_SHA256},
        "policy_catalog_sources": [
            {
                "path": str(PUBLIC_POLICY_CATALOG_SNAPSHOT.relative_to(ROOT)),
                "sha256": PUBLIC_POLICY_CATALOG_SNAPSHOT_SHA256,
                "reviewed_rows_used": 169,
            },
            {
                "path": str(STORAGE_POLICY_CATALOG_SNAPSHOT.relative_to(ROOT)),
                "sha256": STORAGE_POLICY_CATALOG_SNAPSHOT_SHA256,
                "reviewed_rows_used": 9,
            },
            {
                "kind": "exact_composed_source_projection",
                "reviewed_rows_used": 15,
                "search_path": ["pg_catalog", "public"],
            },
        ],
        "policy_fingerprint_contract": {
            "server_major": 17,
            "server_encoding": "UTF8",
            "pg_get_expr_arguments": 2,
            "pretty_mode": "default_indent",
            "search_path": ["pg_catalog", "public"],
            "quote_all_identifiers": False,
            "standard_conforming_strings": True,
            "framing": "patina-csa-policy-v1:null-tag-or-present-tag-int8be-octets",
        },
        "counts": document["validated_counts"],
        "record_ids": sorted(contract_rows),
        "profile_source": {
            "artifact": "composed_00484_public_security_definer_contract",
            "sha256": PUBLIC_ROUTINE_CONTRACT_SHA256,
        },
        "composed_00485_source": {
            "path": str(FINAL_00485.relative_to(ROOT)),
            "commit": FINAL_00485_COMMIT,
            "sha256": FINAL_00485_SHA256,
            "routine_count": len(FINAL_00485_ROUTINES),
        },
        "schema_snapshots": [
            {"column": "public.proposals.studio_id", "type": "uuid", "nullable": True, "default": None, "foreign_key": "public.organizations(id)", "immutability_trigger": "guard_canonical_studio_snapshot"},
            {"column": "public.designer_clients.studio_id", "type": "uuid", "nullable": True, "default": None, "foreign_key": "public.organizations(id)", "immutability_trigger": "guard_canonical_studio_snapshot"},
            {"column": "public.leads.studio_id", "type": "uuid", "nullable": True, "default": None, "foreign_key": "public.organizations(id)", "immutability_trigger": "guard_canonical_studio_snapshot"},
            {"column": "public.client_decisions.studio_id", "type": "uuid", "nullable": True, "default": None, "foreign_key": "public.organizations(id)", "immutability_trigger": "guard_canonical_studio_snapshot"},
            {"column": "public.saved_vendors.studio_id", "type": "uuid", "nullable": True, "default": None, "foreign_key": "public.organizations(id)", "immutability_trigger": "guard_canonical_studio_snapshot"},
            {"column": "public.phase_templates.studio_id", "type": "uuid", "nullable": True, "default": None, "foreign_key": "public.organizations(id)", "immutability_trigger": "guard_canonical_studio_snapshot"},
        ],
        "routines": routine_manifest,
        "writer_routines": extra_writer_manifest,
        "dynamic_routine_dispositions": [dynamic_invoice_manifest],
        "reviewed_dynamic_routines": dynamic_routines,
        "reviewed_sql_standard_body_universe": {
            "schemas": ["public", "app_private"],
            "expected_count": 0,
            "disposition": "fail_closed_before_prosrc_lexical_contract",
        },
        "dispositioned_routine_profiles": disposition_manifests,
        "composed_upstream_routines": composed_upstream_manifest,
        "authority_surfaces": authority_surfaces,
        "canonical_callers": caller_manifest,
        "canonical_lock_order": lock_order_manifest,
        "sql_writer_universe": [
            {"canonical_regprocedure": signature, "table": table, "authority_mode": mode}
            for signature, table, mode in SQL_WRITER_UNIVERSE
        ],
        "runtime_writer_universe": runtime_writers,
        "runtime_rpc_caller_universe": runtime_rpc_callers,
        "runtime_workspace_contract": workspace_contract,
        "generated_database_type_contract": generated_type_contract,
        "configured_seed_writer_universe": seed_writers,
        "sql_regression_contract": sql_regressions,
        "row_level_security_relations": reviewed_rls_relation_manifest(
            policy_manifest
        ),
        "policies": policy_manifest,
        "ordinary_delete_guards": delete_guard_manifest,
        "canonical_mutation_guards": mutation_guard_manifest,
        "affected_policy_compatibility": affected_policy_compatibility,
        "affected_policy_source_final_universe": affected_policy_manifest,
        "views": [{
            "record_id": document["live_views"][0]["record_id"],
            "relation": "public.people_directory",
            "disposition": "branchwise_exact_anchor_rewrite",
            "security_invoker": True,
            "source": document["live_views"][0]["source"],
            "caller_evidence": document["live_views"][0]["runtime_evidence"],
            "definition_sha256": digest(
                template[
                    template.index("CREATE OR REPLACE VIEW public.people_directory"):
                    template.index("-- ── Every ordinary permissive leg")
                ].encode("utf-8")
            ),
        }],
        "explicit_workspace_contracts": [
            {
                "canonical_regprocedure": "public.claim_design_request(uuid,uuid)",
                "arguments_with_defaults": "p_lead_id uuid, p_studio_id uuid",
                "allowed_roles": ["authenticated"],
                "retired_signature": "public.claim_design_request(uuid)",
                "caller_evidence": [
                    "packages/supabase/src/hooks/use-design-requests.ts:171",
                    "apps/designer-portal/src/components/document/open-requests-strip.tsx",
                ],
            },
            {
                "canonical_regprocedure": "public.accept_design_request(uuid,uuid)",
                "arguments_with_defaults": "p_lead_id uuid, p_studio_id uuid",
                "allowed_roles": ["authenticated"],
                "retired_signature": "public.accept_design_request(uuid)",
                "caller_evidence": [
                    "packages/supabase/src/hooks/use-design-requests.ts:261",
                    "apps/designer-portal/src/components/document/triage-bar.tsx",
                ],
            },
            {
                "canonical_regprocedure": "public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)",
                "arguments_with_defaults": "p_title text, p_studio_id uuid, p_designer_client_id uuid DEFAULT NULL, p_budget_min_cents integer DEFAULT NULL, p_budget_max_cents integer DEFAULT NULL, p_start_date date DEFAULT CURRENT_DATE, p_id uuid DEFAULT NULL",
                "allowed_roles": ["authenticated"],
                "profile": {
                    "owner": "postgres",
                    "language": "plpgsql",
                    "kind": "f",
                    "security_definer": True,
                    "leakproof": False,
                    "strict": False,
                    "parallel": "u",
                    "volatility": "v",
                    "returns_set": False,
                    "result": "uuid",
                    "final_config": ["search_path=pg_catalog, public, pg_temp"],
                    "body_sha256": next(item["body_sha256"] for item in rendered_functions if item["schema"] == "public" and item["name"] == "open_project_direct"),
                    "body_octets": len(next(item["body"] for item in rendered_functions if item["schema"] == "public" and item["name"] == "open_project_direct").encode("utf-8")),
                },
                "retired_signature": "public.open_project_direct(text,uuid,integer,integer,date,uuid)",
                "caller_evidence": next(
                    row["runtime_evidence"]
                    for row in document["provisional_00484_exact_studio_context"]
                    if row["canonical_regprocedure"].startswith("public.open_project_direct(")
                ),
            },
            {
                "canonical_regprocedure": "public.set_document_client(text,uuid,uuid,uuid)",
                "arguments_with_defaults": "p_engagement_kind text, p_target_id uuid, p_client_id uuid, p_designer_client_id uuid",
                "allowed_roles": ["authenticated"],
                "retired_signature": "public.set_document_client(text,uuid,uuid)",
                "caller_evidence": [
                    "apps/designer-portal/src/hooks/use-attach-client.ts:30",
                    "apps/designer-portal/src/components/document/overlays/household-sheet.tsx",
                    "apps/designer-portal/src/components/document/overlays/send-sheet.tsx",
                    "apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx",
                ],
            },
        ],
        "snapshot_triggers": [
            {
                "schema": "public",
                "relation": relation,
                "name": "guard_canonical_studio_snapshot",
                "timing": "BEFORE",
                "events": ["INSERT", "UPDATE"],
                "function": "public.guard_canonical_studio_snapshot()",
            }
            for relation in (
                "proposals", "designer_clients", "leads", "client_decisions",
                "saved_vendors", "phase_templates"
            )
        ],
        "rollback_contract": {
            "execution_order": [
                str(STORAGE_ROLLBACK_SQL.relative_to(ROOT)),
                str(ROLLBACK_SQL.relative_to(ROOT)),
            ],
            "ordinary_source_routine_count": len(rollback_order),
            "ordinary_source_policy_count": len(changed_ordinary_policies),
            "final_only_delete_guard_count": len(delete_guard_manifest),
            "final_only_mutation_guard_count": len(mutation_guard_manifest),
            "storage_source_policy_count": len(storage_policy_contract),
            "final_only_surface_count": sum(
                row["final_exists"] and not row["source_exists"]
                for row in authority_surfaces
            ),
            "requires_zero_non_null_snapshots": True,
            "collapsed_source_keys": [
                "public.designer_clients(designer_id,client_id) WHERE client_id IS NOT NULL AND status <> 'lead'",
                "public.designer_clients(designer_id,client_email) WHERE client_email IS NOT NULL AND client_id IS NULL",
                "public.saved_vendors(designer_id,vendor_id)",
            ],
        },
        "already_dispositioned": document["already_dispositioned"],
    }
    migration_bytes = template.encode("utf-8")

    storage_manifest_rows: list[dict[str, Any]] = []
    storage_sql_parts: list[str] = []
    policy_manifest_by_id = {row["record_id"]: row for row in policy_manifest}
    for row, source_statement, final_statement in storage_rows:
        catalog_manifest = policy_manifest_by_id[row["record_id"]]
        storage_manifest_rows.append({
            "record_id": row["record_id"],
            "policy": row["policy"],
            "operation": row["operation"],
            "source": row["source"],
            "source_statement_sha256": digest(source_statement.encode("utf-8")),
            "final_statement_sha256": digest(final_statement.encode("utf-8")),
            "source_catalog_qual": catalog_manifest["source_catalog_qual"],
            "source_catalog_with_check":
                catalog_manifest["source_catalog_with_check"],
            "final_catalog_qual": catalog_manifest["final_catalog_qual"],
            "final_catalog_with_check":
                catalog_manifest["final_catalog_with_check"],
            "source_catalog_fingerprint":
                catalog_manifest["source_catalog_fingerprint"],
            "final_catalog_fingerprint":
                catalog_manifest["final_catalog_fingerprint"],
            "roles": row["roles"],
            "permissive": row["policy_mode"] == "PERMISSIVE",
        })
        storage_sql_parts.append(
            f"DROP POLICY IF EXISTS {quote_ident(row['policy'])} ON storage.objects;\n{final_statement}"
        )
    storage_manifest = {
        "schema_version": 1,
        "artifact_kind": "platform_admin_storage_policy_handoff",
        "ordinary_migration": str(MIGRATION.relative_to(ROOT)),
        "review_input_sha256": REVIEW_SHA256,
        "expected_policy_count": 9,
        "policy_fingerprint_contract": contract[
            "policy_fingerprint_contract"
        ],
        "row_level_security_relations": reviewed_rls_relation_manifest(
            storage_policy_contract
        ),
        "policies": storage_manifest_rows,
        "reviewed_final_dynamic_routines": [
            {
                "canonical_regprocedure": row["canonical_regprocedure"],
                "body_sha256": row["profile"]["body_sha256"],
            }
            for row in dynamic_routines
            if row["final_dynamic"]
        ],
        "reviewed_sql_standard_body_universe": {
            "schemas": ["public", "app_private"],
            "expected_count": 0,
            "disposition": "fail_closed_before_prosrc_lexical_contract",
        },
    }
    storage_template = (ROOT / "supabase/acl/00488_canonical_studio_storage_template.sql").read_text(encoding="utf-8")
    storage_template = storage_template.replace(
        "-- @@GENERATED_CATALOG_LEXER@@", catalog_lexer_sql()
    )
    storage_template = storage_template.replace(
        "-- @@GENERATED_DYNAMIC_ROUTINE_FINAL_GATE@@",
        (
            dynamic_routine_contract_sql(dynamic_routines, "'final'")
            + dynamic_invoice_core_dependency_sql()
        ).strip(),
    )
    storage_policy_contract = [
        row for row in policy_manifest if row["disposition"] == "platform_admin_handoff"
    ]
    storage_template = storage_template.replace(
        "-- @@GENERATED_STORAGE_RLS_GATE@@",
        reviewed_rls_relation_gate_sql(
            storage_policy_contract, "storage forward"
        ).strip(),
    )
    storage_template = storage_template.replace(
        "-- @@GENERATED_STORAGE_POLICY_VALUES@@",
        policy_values_sql(storage_policy_contract),
    )
    storage_template = storage_template.replace("-- @@GENERATED_STORAGE_POLICIES@@", "\n\n".join(storage_sql_parts))
    require("@@GENERATED_" not in storage_template, "unfilled storage artifact marker")
    storage_sql_bytes = storage_template.encode("utf-8")
    storage_manifest["artifact"] = {
        "path": str(STORAGE_SQL.relative_to(ROOT)),
        "sha256": digest(storage_sql_bytes),
    }
    storage_manifest["rollback_artifact"] = {
        "path": str(STORAGE_ROLLBACK_SQL.relative_to(ROOT)),
        "sha256": digest(storage_rollback_bytes),
    }
    storage_manifest_bytes = (
        json.dumps(storage_manifest, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    contract["generated_outputs"] = {
        "migration": {
            "path": str(MIGRATION.relative_to(ROOT)),
            "sha256": digest(migration_bytes),
        },
        "ordinary_rollback": {
            "path": str(ROLLBACK_SQL.relative_to(ROOT)),
            "sha256": digest(rollback_bytes),
        },
        "storage": {
            "path": str(STORAGE_SQL.relative_to(ROOT)),
            "sha256": digest(storage_sql_bytes),
        },
        "storage_rollback": {
            "path": str(STORAGE_ROLLBACK_SQL.relative_to(ROOT)),
            "sha256": digest(storage_rollback_bytes),
        },
        "storage_manifest": {
            "path": str(STORAGE_MANIFEST.relative_to(ROOT)),
            "sha256": digest(storage_manifest_bytes),
        },
    }
    contract_bytes = (json.dumps(contract, indent=2, sort_keys=True) + "\n").encode(
        "utf-8"
    )
    outputs = {
        MIGRATION: migration_bytes,
        ROLLBACK_SQL: rollback_bytes,
        CONTRACT: contract_bytes,
        STORAGE_SQL: storage_sql_bytes,
        STORAGE_ROLLBACK_SQL: storage_rollback_bytes,
        STORAGE_MANIFEST: storage_manifest_bytes,
    }
    validate_rendered_outputs(outputs)
    return outputs


def check_outputs(outputs: dict[Path, bytes]) -> None:
    mismatches: list[str] = []
    for path, expected in outputs.items():
        try:
            display_path = path.relative_to(ROOT)
        except ValueError:
            display_path = path
        if not path.exists():
            mismatches.append(f"missing {display_path}")
            continue
        actual = path.read_bytes()
        if actual != expected:
            mismatches.append(
                f"stale {display_path} "
                f"(actual {digest(actual)}, expected {digest(expected)})"
            )
    require(not mismatches, "; ".join(mismatches))


def validate_rendered_outputs(outputs: dict[Path, bytes]) -> None:
    migration = outputs[MIGRATION].decode("utf-8")
    contract = json.loads(outputs[CONTRACT])
    storage = outputs[STORAGE_SQL].decode("utf-8")
    rollback = outputs[ROLLBACK_SQL].decode("utf-8")
    storage_rollback = outputs[STORAGE_ROLLBACK_SQL].decode("utf-8")
    storage_manifest = json.loads(outputs[STORAGE_MANIFEST])
    require(migration.startswith("-- ═") and "\nBEGIN;\n" in migration[:1200], "migration must start with a transaction")
    preflight = migration.index("DO $canonical_studio_source_preflight$")
    first_mutation = min(
        migration.index("ALTER TABLE public.proposals ADD COLUMN"),
        migration.index("CREATE OR REPLACE FUNCTION public._can_read_studio_snapshot"),
    )
    require(preflight < first_mutation, "source preflight must precede every persistent mutation")
    require(
        migration.index("$c00488_proposal_snapshot_preflight$") < first_mutation,
        "final-state snapshot data anti-join must precede every persistent mutation",
    )
    for message in (
        "00488 proposal project/relationship studio mismatch",
        "00488 decision project/relationship studio mismatch",
        "00488 relationship/lead studio mismatch",
        "00488 phase-template studio snapshot is invalid",
    ):
        require(message in migration[:first_mutation], f"missing early snapshot invariant: {message}")
    require(migration.rstrip().endswith("COMMIT;"), "migration transaction is not closed")
    require(
        rollback.startswith("-- ═")
        and "\nBEGIN;\n" in rollback[:1200]
        and rollback.rstrip().endswith("COMMIT;"),
        "ordinary rollback transaction is not closed",
    )
    require(
        storage_rollback.startswith("-- ═")
        and "\nBEGIN;\n" in storage_rollback[:1200]
        and storage_rollback.rstrip().endswith("COMMIT;"),
        "storage rollback transaction is not closed",
    )
    sql_outputs = (migration, storage, rollback, storage_rollback)
    require(
        all("@@GENERATED_" not in payload for payload in sql_outputs),
        "generated marker survived",
    )
    require(
        all(re.search(r"\$[0-9][A-Za-z0-9_]*\$", payload) is None
            for payload in sql_outputs),
        "generated SQL contains an invalid digit-leading dollar tag",
    )
    require(
        all(b"/Users/" not in payload for payload in outputs.values()),
        "generated output contains an absolute workstation path",
    )
    require("_00488_unique_live_designer_studio" not in migration, "membership-derived historical backfill survived")
    backfill = migration[
        migration.index("-- Historical NULL snapshots"):
        migration.index("-- ── Exact membership and revocation-safe")
    ]
    require("organization_members" not in backfill, "historical snapshot backfill references current membership")
    guard = migration[
        migration.index("CREATE OR REPLACE FUNCTION public.guard_canonical_studio_snapshot"):
        migration.index("REVOKE EXECUTE ON FUNCTION public.guard_canonical_studio_snapshot")
    ]
    require("auth.role()" not in guard, "snapshot guard uses JWT role text as DB authority")
    require("current_setting('role', true)" in guard, "snapshot guard does not bind active DB role")
    require(guard.count("CREATE OR REPLACE FUNCTION public.guard_canonical_studio_snapshot") == 1, "snapshot guard header duplicated")
    open_project = migration[
        migration.index("CREATE OR REPLACE FUNCTION public.open_project_direct"):
        migration.index("-- A client profile is not an authority capability")
    ]
    require(open_project.count("p_designer_client_id uuid") == 1, "open-project relationship parameter duplicated")
    require("p_client_id uuid" not in open_project, "open-project old client-profile contract survived")
    require(
        migration.count("DROP POLICY IF EXISTS ") == 234,
        "ordinary reviewed-policy plus authority-guard replacement count is not 234",
    )
    require(storage.count("DROP POLICY IF EXISTS ") == 9, "storage policy replacement count is not nine")
    require(len(contract["record_ids"]) == len(set(contract["record_ids"])) == 378, "rendered reviewed ledger is not exactly 378 unique IDs")
    require(len(contract["routines"]) == 166, "rendered reviewed routine ledger is not 166")
    require(len(contract["policies"]) == 193, "rendered reviewed policy ledger is not 193")
    require(
        len(contract["ordinary_delete_guards"]) == 36
        and all(
            not row["permissive"] and row["operation"] == "DELETE"
            for row in contract["ordinary_delete_guards"]
        ),
        "rendered restrictive DELETE author-guard ledger is not exact",
    )
    require(
        len(contract["canonical_mutation_guards"]) == 14
        and all(
            not row["permissive"]
            and row["operation"] in ("UPDATE", "DELETE")
            for row in contract["canonical_mutation_guards"]
        ),
        "rendered restrictive canonical mutation-guard ledger is not exact",
    )
    require(
        len(contract["affected_policy_compatibility"]) == 20
        and len(contract["affected_policy_source_final_universe"]) == 49
        and sum(
            row["source_present"]
            for row in contract["affected_policy_source_final_universe"]
        ) == 34,
        "rendered affected policy source/final universe is not exact",
    )
    require(
        migration.count("AS RESTRICTIVE FOR DELETE TO authenticated") == 36
        and migration.count("AS RESTRICTIVE FOR DELETE TO public") == 7
        and migration.count("AS RESTRICTIVE FOR UPDATE TO public") == 7,
        "rendered restrictive mutation policy statements are incomplete",
    )
    require(
        len(contract["schema_snapshots"]) == 6
        and len({row["column"] for row in contract["schema_snapshots"]}) == 6,
        "rendered canonical snapshot schema ledger is not six unique columns",
    )
    require(
        len(contract["row_level_security_relations"]) == 116
        and {
            row["relation"]
            for row in contract["row_level_security_relations"]
        } == {row["relation"] for row in contract["policies"]}
        and all(
            row["row_security_enabled"] and not row["force_row_security"]
            for row in contract["row_level_security_relations"]
        ),
        "rendered reviewed RLS relation profile is not 116 exact relations",
    )
    require(
        storage.count("storage forward reviewed relation RLS profile drifted")
        == 2
        and storage_manifest["row_level_security_relations"] == [{
            "relation": "storage.objects",
            "row_security_enabled": True,
            "force_row_security": False,
        }],
        "standalone storage artifact lost its exact RLS relation profile",
    )
    require(
        [row["reviewed_rows_used"] for row in contract["policy_catalog_sources"]]
        == [169, 9, 15],
        "rendered policy catalog provenance does not account for 193 rows",
    )
    require(
        contract["policy_fingerprint_contract"] == {
            "server_major": 17,
            "server_encoding": "UTF8",
            "pg_get_expr_arguments": 2,
            "pretty_mode": "default_indent",
            "search_path": ["pg_catalog", "public"],
            "quote_all_identifiers": False,
            "standard_conforming_strings": True,
            "framing": "patina-csa-policy-v1:null-tag-or-present-tag-int8be-octets",
        },
        "policy fingerprint environment/framing contract is not exact",
    )
    require(sum(row["disposition"] == "platform_admin_handoff" for row in contract["policies"]) == 9, "storage handoff ledger is not nine")
    require(len(contract["already_dispositioned"]["routines"]) == 14, "routine disposition ledger is not 14")
    require(len(contract["already_dispositioned"]["policies"]) == 4, "policy disposition ledger is not four")
    require(len(contract["sql_writer_universe"]) == 11, "SQL writer universe is not exact")
    require(len(contract["runtime_writer_universe"]) == 9, "runtime writer universe is not exact")
    require(len(contract["runtime_rpc_caller_universe"]) == 12, "runtime RPC caller universe is not exact")
    require(
        len(contract["generated_database_type_contract"]["snapshot_tables"]) == 6
        and len(contract["generated_database_type_contract"]["rpc_types"]) == 13
        and len(
            contract["generated_database_type_contract"]["composite_return_shapes"]
        ) == 22
        and contract["generated_database_type_contract"]["retired_rpc_types_absent"]
        == ["_can_manage_invoice_owner"],
        "generated database type contract is not exact",
    )
    require(
        Counter(
            row["target"]
            for row in contract["generated_database_type_contract"][
                "composite_return_shapes"
            ]
        ) == Counter(GENERATED_COMPOSITE_RETURN_EXPECTATIONS),
        "generated database composite return contract is not exact",
    )
    require(
        len(contract["runtime_workspace_contract"]) == 5,
        "runtime workspace contract is not exact",
    )
    require(
        contract["reviewed_sql_standard_body_universe"] == {
            "schemas": ["public", "app_private"],
            "expected_count": 0,
            "disposition": "fail_closed_before_prosrc_lexical_contract",
        },
        "SQL-standard body universe contract is not exact",
    )
    require(len(contract["configured_seed_writer_universe"]) == 15, "configured seed writer universe is not exact")
    require(
        len(contract["sql_regression_contract"]) == 2,
        "SQL regression contract is not exact",
    )
    require(
        contract["rollback_contract"] == {
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
        "focused rollback contract is not exact",
    )
    relative_outputs = {
        str(path.relative_to(ROOT)): payload for path, payload in outputs.items()
    }
    require(
        set(contract["generated_outputs"]) == {
            "migration", "ordinary_rollback", "storage", "storage_manifest",
            "storage_rollback",
        },
        "generated output ledger is not exact",
    )
    for artifact in contract["generated_outputs"].values():
        require(
            artifact["path"] in relative_outputs
            and digest(relative_outputs[artifact["path"]]) == artifact["sha256"],
            f"generated output hash drifted: {artifact['path']}",
        )
    require(
        storage_manifest["rollback_artifact"] == {
            "path": str(STORAGE_ROLLBACK_SQL.relative_to(ROOT)),
            "sha256": digest(outputs[STORAGE_ROLLBACK_SQL]),
        },
        "storage rollback manifest entry is not exact",
    )
    require(
        storage_manifest["reviewed_sql_standard_body_universe"]
        == contract["reviewed_sql_standard_body_universe"],
        "storage SQL-standard body universe entry is not exact",
    )
    full_revoke = "PUBLIC, anon, authenticated, service_role, dashboard_user, agent_reader, agent_writer, edge_catalog_reader, edge_rls_user"
    require(full_revoke in migration, "full application-role revoke universe is missing")
    require(
        "pg_temp._00488_call_count" in migration
        and "pg_temp._00488_dynamic_mentions" in migration
        and "forbidden legacy authority caller survived" in migration,
        "lexical/dynamic forbidden-helper caller anti-join is missing",
    )
    require(
        "dollar_candidate" in migration
        and "ascii(dollar_character) >= 128" in migration
        and "rejects Unicode-escaped quoted identifiers" in migration
        and "pg_get_function_sqlbody" in migration
        and "unreviewed SQL-standard routine body outside prosrc" in migration,
        "catalog lexer Unicode/SQL-standard-body closure is missing",
    )
    require(
        "pg_catalog.chr(0)" not in migration
        and "pg_temp._00488_catalog_policy_fingerprint" in migration
        and "pg_catalog.decode('00', 'hex')" in migration,
        "catalog policy fingerprints are not PostgreSQL-safe exact bytea frames",
    )
    require("source_or_final_sentinel" in storage and "storage_final_sentinel" in storage, "storage source/final sentinels are missing")
    require("_can_author_studio_snapshot(pr.studio_id, pr.designer_id)" in storage, "storage FOR ALL mutation leg is not author-gated")

    rollback_preflight = rollback.index("DO $canonical_studio_source_preflight$")
    rollback_first_mutation = rollback.index(
        "CREATE OR REPLACE FUNCTION public._can_manage_invoice_owner"
    )
    require(
        rollback_preflight < rollback_first_mutation,
        "ordinary rollback preflight must precede every persistent mutation",
    )
    require(
        "00488 rollback expected the exact reviewed final state" in
        rollback[:rollback_first_mutation]
        and "00488 ordinary rollback requires exact source storage policies first"
        in rollback[:rollback_first_mutation],
        "ordinary rollback final/storage source sentinels are missing",
    )
    require(
        rollback.rfind("00488 rollback expected the exact reviewed source state")
        > rollback.index("DROP FUNCTION public._lock_designer_studio_authority"),
        "ordinary rollback source postflight is missing or misplaced",
    )
    source_routines = rollback[
        rollback.index("-- Re-emit only bodies"):
        rollback.index("-- Restore the exact source security-invoker view")
    ]
    require(
        source_routines.count("CREATE OR REPLACE FUNCTION ") == 129,
        "ordinary rollback source routine set is not exactly 129",
    )
    source_dcl = rollback[
        rollback.index("-- Exact source ACLs for every re-emitted"):
        rollback.index("-- Re-run the complete hash/profile/ACL")
    ]
    require(
        source_dcl.count("REVOKE EXECUTE ON FUNCTION ") == 129,
        "ordinary rollback source DCL set is not exactly 129",
    )
    require(
        rollback.count("DROP POLICY ") == 186
        and "DROP POLICY IF EXISTS " not in rollback,
        "ordinary rollback policy set is not 136 source restores plus 50 guard drops",
    )
    require(
        storage_rollback.count("DROP POLICY ") == 9
        and "DROP POLICY IF EXISTS " not in storage_rollback,
        "storage rollback source policy set is not exactly nine fail-closed replacements",
    )
    for table_name in (
        "proposals", "designer_clients", "leads", "client_decisions",
        "saved_vendors", "phase_templates",
    ):
        require(
            f"SELECT 1 FROM public.{table_name} WHERE studio_id IS NOT NULL"
            in rollback[:rollback_first_mutation],
            f"ordinary rollback data-loss gate omits {table_name}",
        )
        require(
            f"ALTER TABLE public.{table_name} DROP COLUMN studio_id;" in rollback,
            f"ordinary rollback does not remove exact final column for {table_name}",
        )
    for conflict in (
        "designer/client rows collide in source uniqueness",
        "designer/email rows collide in source uniqueness",
        "saved-vendor rows collide in source uniqueness",
    ):
        require(conflict in rollback[:rollback_first_mutation], f"missing rollback conflict gate: {conflict}")
    for payload, label in (
        (rollback, "ordinary rollback"),
        (storage_rollback, "storage rollback"),
    ):
        require(
            re.search(
                r"(?is)\bDROP\b[^;]*\bCASCADE\b",
                sql_code_mask(payload),
            ) is None,
            f"{label} contains a cascading drop",
        )

    storage_gate = storage_rollback.index(
        "DO $canonical_studio_storage_rollback_gate$"
    )
    storage_first_mutation = storage_rollback.index("SET LOCAL ROLE postgres;")
    require(
        storage_gate < storage_first_mutation,
        "storage rollback preflight must precede every persistent mutation",
    )
    require(
        storage_rollback.rfind("00488 storage rollback expected exact source policies")
        > storage_rollback.rfind("DROP POLICY "),
        "storage rollback exact source postflight is missing or misplaced",
    )
    compatibility_section = storage_rollback[
        storage_first_mutation:storage_rollback.index("RESET ROLE;")
    ]
    require(
        compatibility_section.count("CREATE OR REPLACE FUNCTION ") == 4
        and compatibility_section.count("REVOKE EXECUTE ON FUNCTION ") == 4,
        "storage rollback compatibility helper/DCL set is not exactly four",
    )
    require(
        storage_rollback.index("RESET ROLE;")
        < storage_rollback.index("DROP POLICY "),
        "storage rollback does not restore helper identities before source policies",
    )


def atomic_write_outputs(outputs: dict[Path, bytes]) -> None:
    staged: dict[Path, Path] = {}
    originals: dict[Path, bytes | None] = {}
    replaced: list[Path] = []
    try:
        for path, payload in outputs.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            originals[path] = path.read_bytes() if path.exists() else None
            file_descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
            )
            temporary = Path(temporary_name)
            staged[path] = temporary
            with os.fdopen(file_descriptor, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
        for path, temporary in staged.items():
            os.replace(temporary, path)
            replaced.append(path)
        for directory in {path.parent for path in outputs}:
            directory_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    except Exception:
        for path in reversed(replaced):
            original = originals[path]
            if original is None:
                path.unlink(missing_ok=True)
                continue
            file_descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{path.name}.rollback.", suffix=".tmp", dir=path.parent
            )
            with os.fdopen(file_descriptor, "wb") as handle:
                handle.write(original)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, path)
        raise
    finally:
        for temporary in staged.values():
            temporary.unlink(missing_ok=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render or verify the hash-pinned 00488 canonical studio contract"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="verify checked outputs byte-for-byte without writing")
    mode.add_argument("--write", action="store_true", help="validate every input/output, then atomically replace checked outputs")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    arguments = parse_args(argv)
    try:
        outputs = render_outputs(load_review())
        if arguments.check:
            check_outputs(outputs)
        else:
            atomic_write_outputs(outputs)
    except (OSError, KeyError, TypeError, ValueError, RenderError) as error:
        print(f"render-canonical-studio-authority: {error}", file=sys.stderr)
        return 1
    verb = "verified" if arguments.check else "rendered"
    print(f"{verb} 378-row canonical studio authority contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
