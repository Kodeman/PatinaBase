import {
  callout,
  ctaButton,
  escapeHtml,
  heading,
  muted,
  paragraph,
  renderBrandedShell,
  spacer,
} from "../_shared/branded-email.ts";

export const proposalSendCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export type ProposalDeliveryState =
  | "pending"
  | "in_flight"
  | "delivered"
  | "suppressed"
  | "failed"
  | "ambiguous";

export interface ProposalSendInstance {
  id: string;
  proposalId: string;
  sentAt: string;
  designerId: string;
  clientId: string;
  deliveryState: ProposalDeliveryState;
  attemptCount: number;
}

export interface ProposalSendSnapshot {
  id: string;
  proposalId: string;
  sentAt: string;
  designerId: string;
  clientId: string;
  projectId?: string;
  proposalTitle: string;
  personalMessage?: string;
  ccEmail?: string;
  validUntil?: string;
  totalAmount?: number;
  recipientEmail: string;
  recipientName?: string;
  designerName: string;
  senderName: string;
  studioName?: string;
  studioLogoUrl?: string;
  clientPortalPath: string;
}

export interface PersistedProviderRequest {
  body: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  idempotencyKey: string;
  dryRun: boolean;
}

export interface DispatchClaim {
  claimed: boolean;
  deliveryState: ProposalDeliveryState;
  claimToken?: string;
  attemptCount: number;
  retryDeadline?: string;
  retryExhausted?: boolean;
  lastError?: string;
  providerId?: string;
  dispatch?: ProposalSendSnapshot;
  request?: PersistedProviderRequest;
  idempotencyKey?: string;
}

export type ProviderResult =
  | { state: "delivered"; id?: string }
  | { state: "failed"; error: string }
  | { state: "ambiguous"; error: string };

export interface ProposalSendGateway {
  loadExactInstance(input: {
    dispatchId: string;
    proposalId: string;
    sentAt: string;
  }): Promise<ProposalSendInstance>;
  isActiveStudioComember(ownerId: string): Promise<boolean>;
  claimDispatch(input: {
    dispatchId: string;
    proposalId: string;
    sentAt: string;
  }): Promise<DispatchClaim>;
  prepareRequest(input: {
    dispatch: ProposalSendSnapshot;
    html: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<
    | { state: "ready"; request: PersistedProviderRequest }
    | { state: "suppressed"; reason: string }
  >;
  persistRequest(input: {
    dispatchId: string;
    claimToken: string;
    request: PersistedProviderRequest;
  }): Promise<PersistedProviderRequest>;
  beginProviderAttempt(input: {
    dispatchId: string;
    claimToken: string;
  }): Promise<{ attemptCount: number; retryDeadline: string }>;
  sendPrepared(request: PersistedProviderRequest): Promise<ProviderResult>;
  completeDispatch(input: {
    dispatchId: string;
    claimToken: string;
    deliveryState: "delivered" | "failed" | "ambiguous";
    providerId?: string;
    error?: string;
  }): Promise<{
    deliveryState: ProposalDeliveryState;
    attemptCount: number;
    retryDeadline?: string;
    lastError?: string;
  }>;
  suppressDispatch(input: {
    dispatchId: string;
    claimToken: string;
    reason: string;
  }): Promise<void>;
  releaseDispatch(input: {
    dispatchId: string;
    claimToken: string;
    error: string;
  }): Promise<void>;
  syncEmailLog(dispatchId: string): Promise<void>;
  syncInAppLog(dispatchId: string): Promise<void>;
}

export interface ProposalSendDependencies {
  authenticate(authorization: string): Promise<{ userId: string } | null>;
  createGateway(authorization: string): ProposalSendGateway;
  clientPortalUrl: string;
}

interface ProposalSendRequest {
  proposalId: string;
  sentAt: string;
  dispatchId: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...proposalSendCorsHeaders, "Content-Type": "application/json" },
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function parseRequestBody(body: unknown): ProposalSendRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (
    typeof record.proposalId !== "string" || !record.proposalId.trim() ||
    typeof record.sentAt !== "string" || !record.sentAt.trim() ||
    typeof record.dispatchId !== "string" || !record.dispatchId.trim()
  ) {
    return null;
  }
  return {
    proposalId: record.proposalId.trim(),
    sentAt: record.sentAt.trim(),
    dispatchId: record.dispatchId.trim(),
  };
}

function renderProposalEmail(
  dispatch: ProposalSendSnapshot,
  clientPortalUrl: string,
): { subject: string; html: string } {
  const clientName = dispatch.recipientName ?? "there";
  const link = `${
    clientPortalUrl.replace(/\/$/, "")
  }${dispatch.clientPortalPath}`;
  const totalLine = dispatch.totalAmount
    ? paragraph(
      `<strong>Investment:</strong> ${formatCurrency(dispatch.totalAmount)}`,
    )
    : "";
  const expiryLine = dispatch.validUntil
    ? muted(`<em>Please review by ${formatDate(dispatch.validUntil)}.</em>`)
    : "";
  const personalBlock = dispatch.personalMessage
    ? callout(escapeHtml(dispatch.personalMessage))
    : "";
  const subject =
    `${dispatch.senderName} sent you a proposal: "${dispatch.proposalTitle}"`;
  const html = renderBrandedShell({
    title: subject,
    preview: `${dispatch.designerName} has prepared a design proposal for you.`,
    eyebrow: "Proposal",
    studioName: dispatch.studioName,
    studioLogoUrl: dispatch.studioLogoUrl,
    body: [
      heading("Your proposal is ready"),
      paragraph(`Hi ${escapeHtml(clientName)},`),
      paragraph(
        `${
          escapeHtml(dispatch.designerName)
        } has prepared a design proposal for you: <strong>${
          escapeHtml(dispatch.proposalTitle)
        }</strong>.`,
      ),
      personalBlock,
      totalLine,
      expiryLine,
      spacer(10),
      ctaButton(link, "Review proposal", "ink"),
      spacer(),
      muted(`If the button doesn&rsquo;t work, copy this link:<br>${link}`),
      muted("— Patina"),
    ].join(""),
  });
  return { subject, html };
}

function deliveryResponse(
  state: ProposalDeliveryState,
  options: {
    attemptCount?: number;
    retryExhausted?: boolean;
    detail?: string;
  } = {},
): Response {
  const retryable = state === "pending" || state === "in_flight" ||
    ((state === "failed" || state === "ambiguous") &&
      !options.retryExhausted && (options.attemptCount ?? 0) < 3);
  return json({
    ok: state === "delivered",
    delivery_state: state,
    attempt_count: options.attemptCount ?? 0,
    retryable,
    retry_exhausted: options.retryExhausted ?? false,
    detail: options.detail,
  });
}

async function reconcileLogs(
  gateway: ProposalSendGateway,
  dispatchId: string,
): Promise<void> {
  const results = await Promise.allSettled([
    gateway.syncEmailLog(dispatchId),
    gateway.syncInAppLog(dispatchId),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        "proposal-send: isolated notification log failure",
        result.reason,
      );
    }
  }
}

export function createProposalSendHandler(deps: ProposalSendDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: proposalSendCorsHeaders });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const authorization = req.headers.get("authorization") ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return json({ error: "not_authenticated" }, 401);
    }
    const caller = await deps.authenticate(authorization).catch(() => null);
    if (!caller) return json({ error: "not_authenticated" }, 401);

    let payload: ProposalSendRequest | null;
    try {
      payload = parseRequestBody(await req.json());
    } catch {
      return json({ error: "invalid_body" }, 400);
    }
    if (!payload) {
      return json({ error: "proposalId_sentAt_and_dispatchId_required" }, 400);
    }

    // No service-role capability exists before verified JWT + complete tuple.
    const gateway = deps.createGateway(authorization);
    let instance: ProposalSendInstance;
    try {
      instance = await gateway.loadExactInstance(payload);
    } catch (error) {
      console.error("proposal-send: exact instance lookup failed", error);
      return json({ error: "proposal_send_instance_mismatch" }, 409);
    }

    const canManage = instance.designerId === caller.userId ||
      await gateway.isActiveStudioComember(instance.designerId);
    if (!canManage) return json({ error: "not_authorized" }, 403);

    let claim: DispatchClaim;
    try {
      claim = await gateway.claimDispatch(payload);
    } catch (error) {
      console.error("proposal-send: dispatch claim failed", error);
      return json({ error: "dispatch_claim_failed" }, 503);
    }

    if (!claim.claimed) {
      await reconcileLogs(gateway, payload.dispatchId);
      return deliveryResponse(claim.deliveryState, {
        attemptCount: claim.attemptCount,
        retryExhausted: claim.retryExhausted,
        detail: claim.lastError,
      });
    }
    if (!claim.claimToken || !claim.dispatch || !claim.idempotencyKey) {
      return json({ error: "dispatch_claim_invalid" }, 503);
    }

    let request = claim.request;
    if (!request) {
      try {
        const rendered = renderProposalEmail(
          claim.dispatch,
          deps.clientPortalUrl,
        );
        const prepared = await gateway.prepareRequest({
          dispatch: claim.dispatch,
          html: rendered.html,
          subject: rendered.subject,
          idempotencyKey: claim.idempotencyKey,
        });
        if (prepared.state === "suppressed") {
          await gateway.suppressDispatch({
            dispatchId: payload.dispatchId,
            claimToken: claim.claimToken,
            reason: prepared.reason,
          });
          await reconcileLogs(gateway, payload.dispatchId);
          return deliveryResponse("suppressed", { detail: prepared.reason });
        }
        request = await gateway.persistRequest({
          dispatchId: payload.dispatchId,
          claimToken: claim.claimToken,
          request: prepared.request,
        });
      } catch (error) {
        const detail = error instanceof Error
          ? error.message
          : "pre_provider_failure";
        console.error("proposal-send: fail-closed preparation", error);
        try {
          await gateway.releaseDispatch({
            dispatchId: payload.dispatchId,
            claimToken: claim.claimToken,
            error: detail,
          });
        } catch (releaseError) {
          console.error(
            "proposal-send: failed to release pre-provider lease",
            releaseError,
          );
        }
        await reconcileLogs(gateway, payload.dispatchId);
        return deliveryResponse("pending", { detail });
      }
    }

    let lastAmbiguousError = "provider delivery is ambiguous";
    let attemptCount = claim.attemptCount;
    while (attemptCount < 3) {
      try {
        const attempt = await gateway.beginProviderAttempt({
          dispatchId: payload.dispatchId,
          claimToken: claim.claimToken,
        });
        attemptCount = attempt.attemptCount;
      } catch (error) {
        lastAmbiguousError = error instanceof Error
          ? error.message
          : "provider attempt could not start";
        // No provider call has happened in this invocation. Prefer releasing
        // the claim back to pending. If the begin RPC committed but its reply
        // was lost, release rejects on provider_started_at and we conservatively
        // fall through to ambiguous under the same claim/idempotency key.
        try {
          await gateway.releaseDispatch({
            dispatchId: payload.dispatchId,
            claimToken: claim.claimToken,
            error: lastAmbiguousError,
          });
          await reconcileLogs(gateway, payload.dispatchId);
          return deliveryResponse("pending", {
            attemptCount,
            detail: lastAmbiguousError,
          });
        } catch (releaseError) {
          console.error(
            "proposal-send: provider-start failure could not release lease",
            releaseError,
          );
          break;
        }
      }

      const provider = await gateway.sendPrepared(request);
      if (provider.state === "delivered") {
        const completed = await gateway.completeDispatch({
          dispatchId: payload.dispatchId,
          claimToken: claim.claimToken,
          deliveryState: "delivered",
          providerId: provider.id,
        });
        await reconcileLogs(gateway, payload.dispatchId);
        return deliveryResponse("delivered", {
          attemptCount: completed.attemptCount,
        });
      }
      if (provider.state === "failed") {
        const completed = await gateway.completeDispatch({
          dispatchId: payload.dispatchId,
          claimToken: claim.claimToken,
          deliveryState: "failed",
          error: provider.error,
        });
        await reconcileLogs(gateway, payload.dispatchId);
        return deliveryResponse("failed", {
          attemptCount: completed.attemptCount,
          detail: completed.lastError,
        });
      }
      lastAmbiguousError = provider.error;
      // Ambiguous provider uploads alone are retried immediately. Three 6s
      // uploads fit comfortably inside the 30s lease and reuse exact bytes/key.
    }

    try {
      const completed = await gateway.completeDispatch({
        dispatchId: payload.dispatchId,
        claimToken: claim.claimToken,
        deliveryState: "ambiguous",
        error: lastAmbiguousError,
      });
      await reconcileLogs(gateway, payload.dispatchId);
      return deliveryResponse("ambiguous", {
        attemptCount: completed.attemptCount,
        retryExhausted: completed.attemptCount >= 3,
        detail: completed.lastError,
      });
    } catch (error) {
      console.error(
        "proposal-send: ambiguous completion lost its lease",
        error,
      );
      await reconcileLogs(gateway, payload.dispatchId);
      return deliveryResponse("ambiguous", {
        attemptCount,
        retryExhausted: attemptCount >= 3,
        detail: lastAmbiguousError,
      });
    }
  };
}
