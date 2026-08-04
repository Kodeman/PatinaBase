// Supabase Edge Function: proposal-send
//
// The business send and immutable outbox row already exist before this edge
// boundary runs. This function authenticates, reauthorizes the captured owner,
// claims the exact nonce/timestamp tuple, and uploads only persisted bytes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkEmailSuppression,
  prepareCompliantEmail,
  sendPreparedResendRequest,
} from "../_shared/send-email.ts";
import {
  createProposalSendHandler,
  type DispatchClaim,
  type PersistedProviderRequest,
  type ProposalDeliveryState,
  type ProposalSendGateway,
  type ProposalSendInstance,
  type ProposalSendSnapshot,
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

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`proposal-send: malformed ${label}`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
): string {
  if (typeof value[key] !== "string" || !String(value[key]).trim()) {
    throw new Error(`proposal-send: ${key} missing`);
  }
  return String(value[key]);
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof value[key] === "string" ? String(value[key]) : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value as string[]
    : undefined;
}

function mapInstance(value: unknown): ProposalSendInstance {
  const row = record(value, "dispatch instance");
  return {
    id: requiredString(row, "id"),
    proposalId: requiredString(row, "proposal_id"),
    sentAt: requiredString(row, "sent_at"),
    designerId: requiredString(row, "designer_id"),
    clientId: requiredString(row, "client_id"),
    deliveryState: requiredString(
      row,
      "delivery_state",
    ) as ProposalDeliveryState,
    attemptCount: Number(row.attempt_count ?? 0),
  };
}

function mapSnapshot(value: unknown): ProposalSendSnapshot {
  const row = record(value, "dispatch snapshot");
  return {
    id: requiredString(row, "id"),
    proposalId: requiredString(row, "proposal_id"),
    sentAt: requiredString(row, "sent_at"),
    designerId: requiredString(row, "designer_id"),
    clientId: requiredString(row, "client_id"),
    projectId: optionalString(row, "project_id"),
    proposalTitle: requiredString(row, "proposal_title"),
    documentKind: optionalString(row, "document_kind") as
      | ProposalSendSnapshot["documentKind"]
      | undefined,
    personalMessage: optionalString(row, "personal_message"),
    ccEmail: optionalString(row, "cc_email"),
    validUntil: optionalString(row, "valid_until"),
    totalAmount: typeof row.total_amount === "number"
      ? row.total_amount
      : undefined,
    recipientEmail: requiredString(row, "recipient_email"),
    recipientName: optionalString(row, "recipient_name"),
    designerName: requiredString(row, "designer_name"),
    senderName: requiredString(row, "sender_name"),
    studioName: optionalString(row, "studio_name"),
    studioLogoUrl: optionalString(row, "studio_logo_url"),
    clientPortalPath: requiredString(row, "client_portal_path"),
  };
}

function mapPersistedRequest(
  row: Record<string, unknown>,
  prefix = "provider_",
): PersistedProviderRequest | undefined {
  const bodyKey = prefix === "provider_" ? "provider_request_body" : "body";
  const keyKey = prefix === "provider_"
    ? "provider_idempotency_key"
    : "idempotency_key";
  if (typeof row[bodyKey] !== "string") return undefined;
  const to = stringArray(row[`${prefix}to`]);
  if (!to?.length) {
    throw new Error("proposal-send: persisted recipient missing");
  }
  return {
    body: requiredString(row, bodyKey),
    from: requiredString(row, `${prefix}from`),
    to,
    cc: stringArray(row[`${prefix}cc`]),
    subject: requiredString(row, `${prefix}subject`),
    idempotencyKey: requiredString(row, keyKey),
    dryRun:
      row[prefix === "provider_" ? "provider_dry_run" : "dry_run"] === true,
  };
}

function mapClaim(value: unknown): DispatchClaim {
  const row = record(value, "dispatch claim");
  const idempotencyKey = optionalString(row, "provider_idempotency_key");
  return {
    claimed: row.claimed === true,
    deliveryState: requiredString(
      row,
      "delivery_state",
    ) as ProposalDeliveryState,
    claimToken: optionalString(row, "claim_token"),
    attemptCount: Number(row.attempt_count ?? 0),
    previousDeliveryState: optionalString(
      row,
      "previous_delivery_state",
    ) as DispatchClaim["previousDeliveryState"],
    retryDeadline: optionalString(row, "retry_deadline"),
    retryExhausted: row.retry_exhausted === true,
    lastError: optionalString(row, "last_error"),
    providerId: optionalString(row, "provider_id"),
    dispatch: row.dispatch ? mapSnapshot(row.dispatch) : undefined,
    request: mapPersistedRequest(row),
    idempotencyKey,
  };
}

function mapDispatchResult(value: unknown) {
  const row = record(value, "dispatch result");
  return {
    deliveryState: requiredString(
      row,
      "delivery_state",
    ) as ProposalDeliveryState,
    attemptCount: Number(row.attempt_count ?? 0),
    retryDeadline: optionalString(row, "retry_deadline"),
    retryExhausted: row.retry_exhausted === true,
    lastError: optionalString(row, "last_error"),
  };
}

function createGateway(authorization: string): ProposalSendGateway {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  return {
    async loadExactInstance(input) {
      const { data, error } = await admin.rpc("read_proposal_send_dispatch", {
        p_dispatch_id: input.dispatchId,
        p_proposal_id: input.proposalId,
        p_sent_at: input.sentAt,
      });
      if (error) throw error;
      return mapInstance(data);
    },

    async isActiveStudioComember(ownerId) {
      const { data, error } = await caller.rpc("can_dispatch_proposal_send", {
        p_owner: ownerId,
      });
      if (error) {
        console.error("proposal-send: studio authorization failed", error);
        return false;
      }
      return data === true;
    },

    async claimDispatch(input) {
      const { data, error } = await admin.rpc("claim_proposal_send_dispatch", {
        p_dispatch_id: input.dispatchId,
        p_proposal_id: input.proposalId,
        p_sent_at: input.sentAt,
        p_lease_seconds: 30,
      });
      if (error) throw error;
      const claim = mapClaim(data);
      if (claim.dispatch && !claim.dispatch.documentKind) {
        const { data: proposal, error: proposalError } = await admin
          .from('proposals')
          .select('document_kind')
          .eq('id', claim.dispatch.proposalId)
          .maybeSingle();
        if (proposalError) throw proposalError;
        claim.dispatch.documentKind = proposal?.document_kind as
          | ProposalSendSnapshot['documentKind']
          | undefined;
      }
      return claim;
    },

    async prepareRequest(input) {
      const result = await prepareCompliantEmail(admin, {
        to: input.dispatch.recipientEmail,
        cc: input.dispatch.ccEmail,
        subject: input.subject,
        html: input.html,
        userId: input.dispatch.clientId,
        notificationType: "proposal_sent",
        category: "operational",
        templateId: "proposal-sent",
        metadata: {
          proposal_id: input.dispatch.proposalId,
          dispatch_id: input.dispatch.id,
          sent_at: input.dispatch.sentAt,
          deep_link: input.dispatch.clientPortalPath,
        },
        idempotencyKey: input.idempotencyKey,
        failClosedPolicyReads: true,
        skipLog: true,
      });
      if (result.state === "suppressed") return result;
      return {
        state: "ready" as const,
        request: {
          ...result.request,
          idempotencyKey: input.idempotencyKey,
        },
      };
    },

    async checkReplaySuppression(clientId) {
      return await checkEmailSuppression(admin, clientId, {
        failClosed: true,
      });
    },

    async persistRequest(input) {
      const { data, error } = await admin.rpc("persist_proposal_send_request", {
        p_dispatch_id: input.dispatchId,
        p_claim_token: input.claimToken,
        p_request_body: input.request.body,
        p_from: input.request.from,
        p_to: input.request.to,
        p_cc: input.request.cc ?? null,
        p_subject: input.request.subject,
        p_dry_run: input.request.dryRun,
      });
      if (error) throw error;
      const mapped = mapPersistedRequest(record(data, "persisted request"), "");
      if (!mapped) throw new Error("proposal-send: request was not persisted");
      return mapped;
    },

    async beginProviderAttempt(input) {
      const { data, error } = await admin.rpc(
        "begin_proposal_send_provider_attempt",
        {
          p_dispatch_id: input.dispatchId,
          p_claim_token: input.claimToken,
        },
      );
      if (error) throw error;
      const row = record(data, "provider attempt");
      return {
        attemptCount: Number(row.attempt_count),
        retryDeadline: requiredString(row, "retry_deadline"),
      };
    },

    async sendPrepared(request) {
      return await sendPreparedResendRequest(request, { timeoutMs: 6_000 });
    },

    async completeDispatch(input) {
      const { data, error } = await admin.rpc(
        "complete_proposal_send_dispatch",
        {
          p_dispatch_id: input.dispatchId,
          p_claim_token: input.claimToken,
          p_delivery_state: input.deliveryState,
          p_provider_id: input.providerId ?? null,
          p_error: input.error ?? null,
        },
      );
      if (error) throw error;
      return mapDispatchResult(data);
    },

    async suppressDispatch(input) {
      const { data, error } = await admin.rpc(
        "suppress_proposal_send_dispatch",
        {
          p_dispatch_id: input.dispatchId,
          p_claim_token: input.claimToken,
          p_reason: input.reason,
        },
      );
      if (error) throw error;
      return mapDispatchResult(data);
    },

    async releaseDispatch(input) {
      const { data, error } = await admin.rpc(
        "release_proposal_send_dispatch",
        {
          p_dispatch_id: input.dispatchId,
          p_claim_token: input.claimToken,
          p_error: input.error,
        },
      );
      if (error) throw error;
      return mapDispatchResult(data);
    },

    async syncEmailLog(dispatchId) {
      const { error } = await admin.rpc("sync_proposal_send_email_log", {
        p_dispatch_id: dispatchId,
      });
      if (error) throw error;
    },

    async syncInAppLog(dispatchId) {
      const { error } = await admin.rpc("sync_proposal_send_in_app_log", {
        p_dispatch_id: dispatchId,
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
