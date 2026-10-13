// Supabase Edge Function: expire-decisions
//
// Manual trigger (or cron-invoked) variant of the SQL job in 00092.
// Useful for ad-hoc backfills and as a safety net if pg_cron is paused.
//
// Two responsibilities (Decision Framework Wave 2 · Territory T2 · PT-D-2-T2-2):
//
//   1. OVERDUE-ON-LAPSE — for every still-pending decision whose due_date has
//      passed, fire decision_overdue through the notification center: the
//      frozen spine RPC notify_decision_overdue (idempotent in-app row) plus an
//      email via the shared chokepoint, respecting preferences. The
//      (decision_id, kind) unique index + a notification_log lookup keep this
//      idempotent across re-runs, so a decision is announced overdue exactly
//      once even though it stays pending across multiple daily runs.
//
//   2. EXPIRE — calls the row-locked, service-role-only lifecycle authority for
//      pending decisions whose due_date passed more than 7 days ago.
//
// Ordering note: overdue notifications are sent BEFORE the expire UPDATE so a
// decision that crosses the 7-day cutoff on the same run still gets its single
// overdue notice while it is observably "overdue" rather than already expired.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderDecisionEmail } from "../_shared/decision-notify.ts";
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

interface OverdueDecision {
  id: string;
  title: string;
  due_date: string;
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

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ─── 1. OVERDUE-ON-LAPSE notifications ──────────────────────────────────
  // Every pending decision whose due_date is now in the past has lapsed.
  // deliverDecisionNotification is idempotent, so re-running is safe.
  const { data: overdueRows, error: overdueErr } = await supabase
    .from("client_decisions")
    .select(`
      id, title, due_date, sent_at, designer_id, project_id, approval_contract,
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
    .not("due_date", "is", null)
    .lt("due_date", now);

  let overdueNotified = 0;
  if (overdueErr) {
    console.error("expire-decisions: overdue query failed", overdueErr);
  } else {
    const overdue = (overdueRows ?? []) as unknown as OverdueDecision[];
    for (const d of overdue) {
      const isStage2 = d.approval_contract === "project_artifact_v1";
      const artifact = isStage2
        ? resolveApprovalArtifactCitation(d.approval_artifact)
        : null;
      const frozenRecipient = isStage2
        ? resolveFrozenLeadRecipient(d.authority_snapshot)
        : null;
      const dc = d.designer_client;
      const recipient = isStage2 ? frozenRecipient : {
        userId: dc?.client?.id ?? dc?.client_id ?? null,
        email: dc?.client?.email ?? dc?.client_email ?? null,
        name: dc?.client?.full_name ?? dc?.client_name ?? null,
      };
      if (isStage2 && (!artifact || !recipient)) {
        console.error(
          "expire-decisions: Stage-2 evidence incomplete; overdue delivery denied",
          d.id,
        );
        continue;
      }

      if (!recipient?.email) continue;
      const { data: preferences } = recipient.userId
        ? await supabase.from("notification_preferences")
          .select("channels_email, type_project_milestone, timezone")
          .eq("user_id", recipient.userId)
          .maybeSingle()
        : { data: null };
      if (preferences?.channels_email === false || preferences?.type_project_milestone === false) continue;

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

      const rendered = renderDecisionEmail("decision_overdue", recipient!.name ?? "", {
        id: d.id,
        title: d.title,
        dueDate: d.due_date,
        artifact,
        sentAt: d.sent_at,
      }, signature, { timeZone: preferences?.timezone ?? undefined });
      const mode = await supabase.rpc("studio_outbound_mode", {
        p_studio: identity!.studioId!, p_kind: "decision_overdue",
      });
      const rollout = await supabase.rpc("outbound_review_active", {
        p_studio: identity!.studioId!,
      });
      const overdueDate = new Date().toISOString().slice(0, 10);
      const { data: draftId, error: composeError } = await supabase.rpc("compose_outbound_draft", {
        p_kind: "decision_overdue",
        p_org: identity!.studioId!,
        p_project: d.project_id,
        p_channel: "email",
        p_recipient_kind: "client",
        p_to: { client_id: recipient!.userId, address: recipient!.email },
        p_subject: rendered.subject,
        p_body: rendered.html.replace(/<\/(p|div|h[1-6]|li)>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim(),
        p_payload: {
          recipient_id: recipient!.userId,
          recipient_name: recipient!.name,
          designer_id: d.designer_id,
          title: d.title,
          due_date: d.due_date,
          sent_at: d.sent_at,
          artifact,
        },
        p_ref_type: "client_decision",
        p_ref_id: d.id,
        p_dedupe_key: `decision:${d.id}:decision_overdue:${overdueDate}`,
        p_due_at: now,
        p_expires_at: null,
        p_composed_by: "system",
      });
      if (composeError || !draftId) {
        console.error("expire-decisions: overdue draft composition failed", d.id, composeError);
        continue;
      }

      const scheduled = mode.data === "scheduled" || rollout.data !== true;
      if (scheduled) {
        // Scheduled mode retains the historical 8am-local, non-Sunday window.
        // A designer's explicit Send click is intentionally allowed at any hour.
        const local = new Intl.DateTimeFormat("en-US", {
          timeZone: preferences?.timezone?.trim() || "America/New_York", weekday: "short", hour: "numeric", hour12: false,
        }).formatToParts(new Date());
        const weekday = local.find((part) => part.type === "weekday")?.value;
        const hour = Number(local.find((part) => part.type === "hour")?.value);
        if (weekday === "Sun" || hour < 8) continue;
        const result = await sendOutboundDraft(supabase, draftId as string, {
          kind: "studio_schedule", studioId: identity!.studioId!, outboundKind: "decision_overdue",
        });
        if (result.ok) overdueNotified++;
      }

    }
  }

  // ─── 2. EXPIRE decisions past the 7-day grace ───────────────────────────
  const { data, error } = await supabase.rpc("expire_due_client_decisions", {
    p_cutoff: cutoff,
  });

  if (error) {
    console.error("expire-decisions: failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(
    JSON.stringify({
      overdue_notified: overdueNotified,
      expired: (data ?? []).length,
      ids: (data ?? []).map((d: { id: string }) => d.id),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
