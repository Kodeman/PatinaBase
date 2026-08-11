// Supabase Edge Function: decision-reminders
//
// Runs daily (scheduled by pg_cron in migration 00092). Finds pending
// decisions whose due_date is within the next 48 hours and that have not
// yet been reminded, then routes a reminder through the NOTIFICATION CENTER
// — the in-app spine RPC (notify_decision_required, idempotent) plus an
// email via the shared sendCompliantEmail chokepoint (suppression, rate cap,
// RFC-8058 unsubscribe headers, notification_log, preference checks) — instead
// of talking straight to Resend.
//
// Decision Framework Wave 2 · Territory T2 · PT-D-2-T2-1 / PT-D-2-T2-2.
//
// reminder_sent_at is still stamped on success so the 48h-window query stays
// the primary dedupe; deliverDecisionNotification adds a second layer (the
// idempotent in-app RPC + a notification_log lookup) so a same-day re-run does
// not double-send even before the stamp lands.
//
// SMS escalation (PRD line 120 final clause) is intentionally deferred
// pending Twilio integration.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deliverDecisionNotification } from "../_shared/decision-notify.ts";
import {
  type EmbeddedApprovalArtifact,
  type EmbeddedAuthoritySnapshot,
  resolveApprovalArtifactCitation,
  resolveFrozenLeadRecipient,
} from "../_shared/project-approval-notification.ts";
import {
  resolveStudioIdentity,
  studioCobrand,
} from "../_shared/studio-identity.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface DecisionWithClient {
  id: string;
  title: string;
  due_date: string;
  reminder_sent_at: string | null;
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

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const horizon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("client_decisions")
    .select(`
      id, title, due_date, reminder_sent_at, designer_id, project_id,
      approval_contract,
      designer_client:designer_clients(
        client_id,
        client_email,
        client_name,
        client:profiles!client_id(id, full_name, email)
      ),
      approval_artifact:project_approval_artifacts(
        source_kind, source_version, artifact_hash, artifact_title
      ),
      authority_snapshot:project_decision_authority_snapshots(
        decision_lead_id,
        decision_lead:profiles!decision_lead_id(id, full_name, email)
      )
    `)
    .eq("status", "pending")
    .is("reminder_sent_at", null)
    .not("due_date", "is", null)
    .gte("due_date", now)
    .lte("due_date", horizon);

  if (error) {
    console.error("decision-reminders: query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  const decisions = (data ?? []) as unknown as DecisionWithClient[];
  let sent = 0;
  let inAppOnly = 0;
  let skipped = 0;

  for (const d of decisions) {
    const isStage2 = d.approval_contract === "project_artifact_v1";
    const artifact = isStage2
      ? resolveApprovalArtifactCitation(d.approval_artifact)
      : null;
    const frozenRecipient = isStage2
      ? resolveFrozenLeadRecipient(d.authority_snapshot)
      : null;
    const dc = d.designer_client;
    const recipient = isStage2 ? frozenRecipient : {
      // Legacy compatibility: prefer the signed-up client and retain the
      // direct-contact fallback for relationships without an auth profile.
      userId: dc?.client?.id ?? dc?.client_id ?? null,
      email: dc?.client?.email ?? dc?.client_email ?? null,
      name: dc?.client?.full_name ?? dc?.client_name ?? null,
    };
    if (isStage2 && (!artifact || !recipient)) {
      skipped++;
      console.error(
        "decision-reminders: Stage-2 evidence incomplete; delivery denied",
        d.id,
      );
      continue;
    }

    // Studio co-brand (Designer Studios): prefer a linked project's studio,
    // else the decision's designer's primary studio.
    const identity = await resolveStudioIdentity(supabase, {
      projectId: d.project_id,
      designerId: d.designer_id,
    });

    const result = await deliverDecisionNotification(
      supabase,
      "decision_required",
      { id: d.id, title: d.title, dueDate: d.due_date, artifact },
      recipient!,
      studioCobrand(identity),
    );

    const stampDelivery = async () => {
      if (isStage2) {
        return await supabase.rpc("stamp_project_approval_reminder_delivery", {
          p_decision_id: d.id,
          p_decision_lead_id: recipient!.userId,
        });
      }
      return await supabase
        .from("client_decisions")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", d.id);
    };

    if (result.emailSent) {
      sent++;
      // Stamp reminder_sent_at so the 48h-window query won't re-pick this row.
      const { error: updateErr } = await stampDelivery();
      if (updateErr) {
        console.error("decision-reminders: failed to stamp", d.id, updateErr);
      }
    } else if (
      result.inAppOk &&
      (!recipient?.email || result.reason === "cadence_digest")
    ) {
      // Delivered in-app only — either no email target, or the client is on the
      // daily digest (the notification-digest cron will batch the email). Stamp
      // so the 48h-window query doesn't re-pick this row every run.
      inAppOnly++;
      const { error: updateErr } = await stampDelivery();
      if (updateErr) {
        console.error("decision-reminders: failed to stamp", d.id, updateErr);
      }
    } else {
      // Suppressed / preference-gated / quiet-hours / already-sent — leave the
      // row unstamped so a later run can retry once the gate clears, but log.
      skipped++;
      if (result.reason && result.reason !== "quiet_hours") {
        console.warn("decision-reminders: skipped", d.id, result.reason);
      }
    }
  }

  return new Response(
    JSON.stringify({ scanned: decisions.length, sent, inAppOnly, skipped }),
    { headers: { "Content-Type": "application/json" } },
  );
});
