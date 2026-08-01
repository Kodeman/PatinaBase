// Supabase Edge Function: proposal-send
//
// Business state is committed by the guarded send_proposal RPC first. This
// boundary validates the caller again, verifies that exact sent instance, then
// claims a durable dispatch row before sending through sendCompliantEmail.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import {
  resolveStudioIdentity,
  studioCobrand,
  studioDisplayName,
} from "../_shared/studio-identity.ts";
import {
  createProposalSendHandler,
  type DispatchClaim,
  type ProposalEmail,
  type ProposalSendGateway,
  type ProposalSendRow,
} from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") ??
  "https://client.patina.cloud";

function bearerToken(authorization: string): string | null {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function authenticate(
  authorization: string,
): Promise<{ userId: string } | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

function createGateway(authorization: string): ProposalSendGateway {
  // Called only after authenticate() succeeds in the request handler.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  return {
    async loadProposal(proposalId: string): Promise<ProposalSendRow | null> {
      const { data, error } = await admin
        .from("proposals")
        .select(
          `
          id, title, status, sent_at, personal_message, cc_email, valid_until,
          total_amount, client_id, designer_client_id, designer_id, project_id,
          designer:profiles!designer_id(full_name, email),
          client:profiles!client_id(full_name, email)
        `,
        )
        .eq("id", proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ProposalSendRow | null) ?? null;
    },

    async isActiveStudioComember(ownerId: string): Promise<boolean> {
      const { data, error } = await caller.rpc("can_dispatch_proposal_send", {
        p_owner: ownerId,
      });
      if (error) {
        console.error("proposal-send: studio authorization failed", error);
        return false;
      }
      return data === true;
    },

    async claimDispatch(
      proposalId: string,
      sentAt: string,
    ): Promise<DispatchClaim> {
      const { data, error } = await admin.rpc("claim_proposal_send_dispatch", {
        p_proposal_id: proposalId,
        p_sent_at: sentAt,
        p_stale_after_seconds: 300,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("proposal-send: malformed dispatch claim");
      }
      const claim = data as Record<string, unknown>;
      if (
        typeof claim.claimed !== "boolean" ||
        typeof claim.notification_log_id !== "string"
      ) {
        throw new Error("proposal-send: incomplete dispatch claim");
      }
      return {
        claimed: claim.claimed === true,
        duplicate: claim.duplicate === true,
        inFlight: claim.in_flight === true,
        claimToken: typeof claim.claim_token === "string"
          ? claim.claim_token
          : undefined,
        notificationLogId: String(claim.notification_log_id),
        attemptCount: Number(claim.attempt_count ?? 1),
      };
    },

    async resolveSender(proposal: ProposalSendRow) {
      const identity = await resolveStudioIdentity(admin, {
        projectId: proposal.project_id,
        designerId: proposal.designer_id,
      });
      const designerName = proposal.designer?.full_name ?? identity?.name ??
        "Your designer";
      const cobrand = studioCobrand(identity);
      return {
        designerName,
        senderName: studioDisplayName(identity, designerName),
        studioName: cobrand.studioName,
        studioLogoUrl: cobrand.studioLogoUrl,
      };
    },

    async ensureInAppNotification(
      proposal: ProposalSendRow,
      notificationLogId: string,
    ): Promise<void> {
      const { error } = await admin.from("notification_log").upsert(
        {
          id: notificationLogId,
          user_id: proposal.client_id,
          type: "proposal_sent",
          channel: "in_app",
          status: "delivered",
          template_id: "proposal-sent",
          metadata: {
            proposal_id: proposal.id,
            sent_at: proposal.sent_at,
            subject: "Proposal ready for your review",
            message: proposal.title,
            deep_link: `/proposals/${proposal.id}`,
          },
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },

    async sendEmail(email: ProposalEmail) {
      return await sendCompliantEmail(admin, {
        to: email.to,
        cc: email.cc,
        subject: email.subject,
        html: email.html,
        userId: email.userId,
        notificationType: "proposal_sent",
        category: "operational",
        templateId: "proposal-sent",
        metadata: email.metadata,
        idempotencyKey: email.idempotencyKey,
      });
    },

    async completeDispatch(input) {
      const { error } = await admin.rpc("complete_proposal_send_dispatch", {
        p_proposal_id: input.proposalId,
        p_sent_at: input.sentAt,
        p_claim_token: input.claimToken,
        p_succeeded: input.succeeded,
        p_provider_id: input.providerId ?? null,
        p_error: input.error ?? null,
      });
      if (error) throw error;
    },
  };
}

const handler = createProposalSendHandler({
  authenticate,
  createGateway,
  clientPortalUrl: CLIENT_PORTAL_URL,
});

Deno.serve(handler);
