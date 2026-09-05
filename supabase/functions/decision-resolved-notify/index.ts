// Supabase Edge Function: decision-resolved-notify
//
// Invoked by the AFTER UPDATE trigger on client_decisions (migration 00174)
// when a decision transitions INTO 'responded' — i.e. the client picks an
// option (useSelectDecisionOption) or the designer overrides on their behalf
// (useApplyDecisionOverride).
//
// Decision Framework Wave 2 follow-up · Notifications micro-PR (T2 flag).
//
// The IN-APP resolved row already lands synchronously from the spine RPC
// notify_decision_resolved() (called by those hooks). This function adds the
// EMAIL leg to the owning DESIGNER, routed through the shared notification
// center chokepoint (deliverDecisionNotification → sendCompliantEmail:
// suppression, per-recipient rate cap, RFC-8058 unsubscribe headers,
// notification_log, preference + quiet-hours checks). The shared helper's
// in-app RPC call is idempotent (00173 ON CONFLICT DO NOTHING), so the in-app
// row written by the hook is a no-op here, and the notification_log dedupe keeps
// the email one-per-(decision, kind) across any retries.
//
// Mirrors expire-decisions/index.ts: service-role client, _shared import,
// JSON response.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  deliverDecisionNotification,
  deliverDecisionReceipt,
  resolveDecisionSignature,
} from "../_shared/decision-notify.ts";
import {
  type EmbeddedApprovalArtifact,
  type EmbeddedAuthoritySnapshot,
  resolveApprovalArtifactCitation,
  resolveFrozenLeadRecipient,
} from "../_shared/project-approval-notification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ResolvedDecision {
  id: string;
  title: string;
  due_date: string | null;
  designer_id: string | null;
  project_id: string | null;
  answer: string | null;
  approval_contract: string | null;
  approval_artifact:
    | EmbeddedApprovalArtifact
    | EmbeddedApprovalArtifact[]
    | null;
  authority_snapshot:
    | EmbeddedAuthoritySnapshot
    | EmbeddedAuthoritySnapshot[]
    | null;
  designer: {
    id: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
}

Deno.serve(async (req: Request) => {
  let decisionId: string | undefined;
  try {
    const body = await req.json();
    decisionId = body?.decision_id;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
    });
  }
  if (!decisionId) {
    return new Response(JSON.stringify({ error: "decision_id_required" }), {
      status: 400,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Look up the decision + the owning designer's profile (full_name + email).
  // client_decisions.designer_id is NOT NULL (00064), but the join is defensive.
  const { data, error } = await supabase
    .from("client_decisions")
    .select(`
      id, title, due_date, designer_id, project_id, answer, approval_contract,
      approval_artifact:project_approval_artifacts(
        source_kind, source_version, artifact_hash, artifact_title, created_at, why
      ),
      authority_snapshot:project_decision_authority_snapshots(
        decision_lead_id,
        decision_lead:profiles!decision_lead_id(id, full_name, email)
      ),
      designer:profiles!designer_id(id, full_name, email)
    `)
    .eq("id", decisionId)
    .single();

  if (error || !data) {
    console.error("decision-resolved-notify: lookup failed", decisionId, error);
    return new Response(JSON.stringify({ error: "decision_not_found" }), {
      status: 404,
    });
  }

  const decision = data as unknown as ResolvedDecision;
  const recipientUserId = decision.designer?.id ?? decision.designer_id ?? null;
  const recipientEmail = decision.designer?.email ?? null;
  const recipientName = decision.designer?.full_name ?? null;
  const artifact = decision.approval_contract === "project_artifact_v1"
    ? resolveApprovalArtifactCitation(decision.approval_artifact)
    : null;
  if (decision.approval_contract === "project_artifact_v1" && !artifact) {
    console.error(
      "decision-resolved-notify: Stage-2 artifact evidence incomplete",
      decision.id,
    );
    return new Response(
      JSON.stringify({ error: "approval_artifact_not_found" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // deliverDecisionNotification: idempotent in-app RPC (no-op since the hook
  // already wrote the row) + the resolved EMAIL via the compliance chokepoint.
  const result = await deliverDecisionNotification(
    supabase,
    "decision_resolved",
    {
      id: decision.id,
      title: decision.title,
      dueDate: decision.due_date,
      artifact,
    },
    { userId: recipientUserId, email: recipientEmail, name: recipientName },
  );

  if (
    result.emailSkipped && result.reason && result.reason !== "already_sent"
  ) {
    console.warn(
      "decision-resolved-notify: email skipped",
      decision.id,
      result.reason,
    );
  }

  // ── P-20. The client's receipt ─────────────────────────────────────────
  //
  // The bell row and the push envelope are already written, synchronously,
  // inside _respond_project_approval_checked (00569). This is the email leg,
  // and it exists only for a Stage-2 approval: a legacy option choice has no
  // frozen lead to address and no released work to name.
  //
  // The consequence clause reads the names the response froze into its own
  // immutable `responded` receipt — the update that released those pieces
  // cleared the link they could otherwise be found through.
  let receipt: { sent: boolean; skipped: boolean; reason: string | null } = {
    sent: false,
    skipped: true,
    reason: "not_stage2",
  };
  const frozenRecipient = artifact
    ? resolveFrozenLeadRecipient(decision.authority_snapshot)
    : null;
  if (artifact && frozenRecipient) {
    const { data: actionReceipt } = await supabase
      .from("project_approval_action_receipts")
      .select("result")
      .eq("decision_id", decision.id)
      .eq("action_kind", "responded")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const frozen = (actionReceipt?.result ?? {}) as Record<string, unknown>;
    const releasedItems = Array.isArray(frozen.releasedItemNames)
      ? (frozen.releasedItemNames as unknown[]).filter(
        (name): name is string => typeof name === "string",
      )
      : [];

    const clientSignature = await resolveDecisionSignature(supabase, {
      projectId: decision.project_id,
      designerId: decision.designer_id,
    });
    const receiptResult = await deliverDecisionReceipt(
      supabase,
      {
        id: decision.id,
        title: decision.title,
        dueDate: decision.due_date,
        artifact,
        outcome: decision.answer,
        releasedItems,
      },
      frozenRecipient,
      clientSignature,
    );
    receipt = {
      sent: receiptResult.emailSent,
      skipped: receiptResult.emailSkipped,
      reason: receiptResult.reason ?? null,
    };
    if (receipt.skipped && receipt.reason && receipt.reason !== "already_sent") {
      console.warn(
        "decision-resolved-notify: receipt skipped",
        decision.id,
        receipt.reason,
      );
    }
  }

  return new Response(
    JSON.stringify({
      decision_id: decision.id,
      in_app_ok: result.inAppOk,
      email_sent: result.emailSent,
      email_skipped: result.emailSkipped,
      reason: result.reason ?? null,
      receipt_sent: receipt.sent,
      receipt_skipped: receipt.skipped,
      receipt_reason: receipt.reason,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
