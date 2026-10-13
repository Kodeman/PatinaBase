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
// P-02: this is the RETURNING letter. The announcing one is decision-first-
// notice, fired at publish by the trigger in 00568. Both are decision_required;
// the log dedupe keys on the register, so this letter still lands after that
// one.
//
// SMS escalation (PRD line 120 final clause) is intentionally deferred
// pending Twilio integration.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeReminderCadence,
  renderDecisionEmail,
} from "../_shared/decision-notify.ts";
import { sendOutboundDraft } from "../_shared/outbound-send.ts";
import {
  type EmbeddedApprovalArtifact,
  type EmbeddedAuthoritySnapshot,
  resolveApprovalArtifactCitation,
  resolveFrozenLeadRecipient,
} from "../_shared/project-approval-notification.ts";
import { resolveDecisionSignature } from "../_shared/decision-notify.ts";
import { resolveStudioIdentity } from "../_shared/studio-identity.ts";

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
  sent_at: string | null;
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
      id, title, due_date, reminder_sent_at, sent_at, designer_id, project_id,
      approval_contract,
      designer_client:designer_clients(
        client_id,
        client_email,
        client_name,
        client:profiles!client_id(id, full_name, email)
      ),
      approval_artifact:project_approval_artifacts(
        source_kind, source_version, artifact_hash, artifact_title, created_at, why,
        why_author_name
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

    // Who signs the letter (R7): the studio's brand for the byline, the
    // designer's given name and city for the sign-off.
    const identity = await resolveStudioIdentity(supabase, {
      projectId: d.project_id,
      designerId: d.designer_id,
    });
    const signature = await resolveDecisionSignature(supabase, {
      projectId: d.project_id,
      designerId: d.designer_id,
    });

    // This cron fires 48 hours before the due date, which is days or weeks
    // after the studio pressed send: it returns to an approval already made
    // and never announces one. ALWAYS the reminder register — only the
    // publish-time producer (decision-first-notice, fired by 00568's trigger)
    // speaks the announcing one, so an approval already in flight at deploy
    // never hears "sent" late.
    const { data: preferences } = recipient?.userId
      ? await supabase.from("notification_preferences")
        .select("reminder_cadence, channels_email, type_project_milestone, timezone")
        .eq("user_id", recipient.userId)
        .maybeSingle()
      : { data: null };
    // Batched cadences belong to B3c's digest, never this per-decision composer.
    if (
      recipient?.userId &&
      normalizeReminderCadence((preferences as { reminder_cadence?: string | null } | null)?.reminder_cadence) !== "right_away"
    ) {
      skipped++;
      continue;
    }
    if (preferences?.channels_email === false || preferences?.type_project_milestone === false || !recipient?.email) {
      skipped++;
      continue;
    }

    const rendered = renderDecisionEmail("decision_required", recipient.name ?? "", {
      id: d.id,
      title: d.title,
      dueDate: d.due_date,
      artifact,
      sentAt: d.sent_at,
      notice: "reminder",
    }, signature, { timeZone: preferences?.timezone ?? undefined });
    const mode = await supabase.rpc("studio_outbound_mode", {
      p_studio: identity!.studioId!, p_kind: "decision_reminder",
    });
    const rollout = await supabase.rpc("outbound_review_active", {
      p_studio: identity!.studioId!,
    });
    const { data: draftId, error: composeError } = await supabase.rpc("compose_outbound_draft", {
      p_kind: "decision_reminder",
      p_org: identity!.studioId!,
      p_project: d.project_id,
      p_channel: "email",
      p_recipient_kind: "client",
      p_to: { client_id: recipient.userId, address: recipient.email },
      p_subject: rendered.subject,
      p_body: rendered.html.replace(/<\/(p|div|h[1-6]|li)>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim(),
      p_payload: {
        project_approval: isStage2,
        recipient_id: recipient.userId,
        recipient_name: recipient.name,
        designer_id: d.designer_id,
        title: d.title,
        due_date: d.due_date,
        sent_at: d.sent_at,
        artifact,
      },
      p_ref_type: "client_decision",
      p_ref_id: d.id,
      p_dedupe_key: `decision:${d.id}:decision_reminder:1`,
      p_due_at: now,
      p_expires_at: d.due_date,
      p_composed_by: "system",
    });
    if (composeError || !draftId) {
      skipped++;
      console.error("decision-reminders: draft composition failed", d.id, composeError);
      continue;
    }

    const scheduled = (mode.data === "scheduled" || rollout.data !== true);
    if (scheduled) {
      // Scheduled mode keeps the historical 8am-local, non-Sunday window. A
      // designer's explicit Send click is intentionally allowed at any hour.
      const local = new Intl.DateTimeFormat("en-US", {
        timeZone: preferences?.timezone?.trim() || "America/New_York",
        weekday: "short", hour: "numeric", hour12: false,
      }).formatToParts(new Date());
      const weekday = local.find((part) => part.type === "weekday")?.value;
      const hour = Number(local.find((part) => part.type === "hour")?.value);
      if (weekday === "Sun" || hour < 8) {
        skipped++;
        continue;
      }
      const result = await sendOutboundDraft(supabase, draftId as string, {
        kind: "studio_schedule", studioId: identity!.studioId!, outboundKind: "decision_reminder",
      });
      if (result.ok) sent++;
      else skipped++;
    } else {
      // Review mode leaves the composed email in the studio's outbox.
      skipped++;
    }
  }

  return new Response(
    JSON.stringify({ scanned: decisions.length, sent, inAppOnly, skipped }),
    { headers: { "Content-Type": "application/json" } },
  );
});
