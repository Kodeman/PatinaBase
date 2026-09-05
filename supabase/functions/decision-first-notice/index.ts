// Supabase Edge Function: decision-first-notice
//
// The letter that says an approval exists. Invoked by the AFTER INSERT OR
// UPDATE trigger on client_decisions (migration 00568) at the moment a
// decision enters the client's court — the publish path itself
// (publish_client_decision, 00464) and the project-approval send.
//
// P-02: the publish path and the 48-hour reminder path used to be the same
// letter. They are two now. This one announces ("Leah sent the kitchen plan set
// for your approval."); decision-reminders returns to one already announced
// ("Thursday: the kitchen plan set."). Both are kind decision_required — no
// enum was widened — and the notification_log dedupe keys on the register so
// neither swallows the other.
//
// The IN-APP row already lands synchronously from _enqueue_decision_notification
// (00466) and the bell/push row from notify_client_decision_raised (00534).
// deliverDecisionNotification's own in-app RPC call is idempotent, so this
// function adds only the EMAIL leg, routed through the shared chokepoint
// (suppression, rate cap, RFC-8058 headers, notification_log, preferences).
//
// Mirrors decision-resolved-notify (service-role client, decision_id body,
// JSON response) with decision-reminders' client recipient + Stage-2 evidence
// resolution.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  deliverDecisionNotification,
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

interface RaisedDecision {
  id: string;
  title: string;
  status: string;
  court: string | null;
  due_date: string | null;
  sent_at: string | null;
  designer_id: string | null;
  project_id: string | null;
  approval_contract: string | null;
  designer_client: {
    client_id: string | null;
    client_email: string | null;
    client_name: string | null;
    client: {
      id: string | null;
      full_name: string | null;
      email: string | null;
    } | null;
  } | null;
  approval_artifact:
    | EmbeddedApprovalArtifact
    | EmbeddedApprovalArtifact[]
    | null;
  authority_snapshot:
    | EmbeddedAuthoritySnapshot
    | EmbeddedAuthoritySnapshot[]
    | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  let decisionId: string | undefined;
  try {
    const body = await req.json();
    decisionId = body?.decision_id;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!decisionId) return json({ error: "decision_id_required" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("client_decisions")
    .select(`
      id, title, status, court, due_date, sent_at, designer_id, project_id,
      approval_contract,
      designer_client:designer_clients(
        client_id,
        client_email,
        client_name,
        client:profiles!client_id(id, full_name, email)
      ),
      approval_artifact:project_approval_artifacts(
        source_kind, source_version, artifact_hash, artifact_title, created_at
      ),
      authority_snapshot:project_decision_authority_snapshots(
        decision_lead_id,
        decision_lead:profiles!decision_lead_id(id, full_name, email)
      )
    `)
    .eq("id", decisionId)
    .single();

  if (error || !data) {
    console.error("decision-first-notice: lookup failed", decisionId, error);
    return json({ error: "decision_not_found" }, 404);
  }

  const decision = data as unknown as RaisedDecision;

  // The trigger fires on the transition; by the time this runs the decision may
  // already have been answered or withdrawn. Only a live ask gets a letter.
  if (decision.status !== "pending" || decision.court !== "client") {
    return json({ decision_id: decision.id, skipped: "not_pending" });
  }

  const isStage2 = decision.approval_contract === "project_artifact_v1";
  const artifact = isStage2
    ? resolveApprovalArtifactCitation(decision.approval_artifact)
    : null;
  const frozenRecipient = isStage2
    ? resolveFrozenLeadRecipient(decision.authority_snapshot)
    : null;
  if (isStage2 && (!artifact || !frozenRecipient)) {
    console.error(
      "decision-first-notice: Stage-2 evidence incomplete; delivery denied",
      decision.id,
    );
    return json({ error: "approval_evidence_incomplete" }, 409);
  }

  const dc = decision.designer_client;
  const recipient = isStage2 ? frozenRecipient! : {
    // Legacy compatibility, mirroring decision-reminders: prefer the signed-up
    // client, retain the direct-contact fallback for relationships with no
    // auth profile.
    userId: dc?.client?.id ?? dc?.client_id ?? null,
    email: dc?.client?.email ?? dc?.client_email ?? null,
    name: dc?.client?.full_name ?? dc?.client_name ?? null,
  };

  // Who signs the letter (R7).
  const signature = await resolveDecisionSignature(supabase, {
    projectId: decision.project_id,
    designerId: decision.designer_id,
  });

  const result = await deliverDecisionNotification(
    supabase,
    "decision_required",
    {
      id: decision.id,
      title: decision.title,
      dueDate: decision.due_date,
      artifact,
      sentAt: decision.sent_at,
      notice: "first",
    },
    recipient,
    signature,
  );

  if (result.emailSkipped && result.reason && result.reason !== "already_sent") {
    console.warn(
      "decision-first-notice: email skipped",
      decision.id,
      result.reason,
    );
  }

  return json({
    decision_id: decision.id,
    in_app_ok: result.inAppOk,
    email_sent: result.emailSent,
    email_skipped: result.emailSkipped,
    reason: result.reason ?? null,
  });
});
