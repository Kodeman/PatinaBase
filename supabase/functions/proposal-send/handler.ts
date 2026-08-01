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

export interface ProposalSendRow {
  id: string;
  title: string;
  status: string;
  sent_at: string | null;
  personal_message: string | null;
  cc_email: string | null;
  valid_until: string | null;
  total_amount: number | null;
  client_id: string | null;
  designer_client_id: string | null;
  designer_id: string | null;
  project_id: string | null;
  designer: { full_name: string | null; email: string | null } | null;
  client: { full_name: string | null; email: string | null } | null;
}

export interface DispatchClaim {
  claimed: boolean;
  duplicate: boolean;
  inFlight: boolean;
  claimToken?: string;
  notificationLogId: string;
  attemptCount: number;
}

export interface ProposalSenderIdentity {
  designerName: string;
  senderName: string;
  studioName?: string;
  studioLogoUrl?: string;
}

export interface ProposalEmail {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  userId: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

export interface ProposalSendGateway {
  loadProposal(proposalId: string): Promise<ProposalSendRow | null>;
  isActiveStudioComember(ownerId: string): Promise<boolean>;
  claimDispatch(proposalId: string, sentAt: string): Promise<DispatchClaim>;
  resolveSender(proposal: ProposalSendRow): Promise<ProposalSenderIdentity>;
  ensureInAppNotification(
    proposal: ProposalSendRow,
    notificationLogId: string,
  ): Promise<void>;
  sendEmail(email: ProposalEmail): Promise<{
    success: boolean;
    suppressed?: boolean;
    id?: string;
    error?: string;
  }>;
  completeDispatch(input: {
    proposalId: string;
    sentAt: string;
    claimToken: string;
    succeeded: boolean;
    providerId?: string;
    error?: string;
  }): Promise<void>;
}

export interface ProposalSendDependencies {
  authenticate(authorization: string): Promise<{ userId: string } | null>;
  createGateway(authorization: string): ProposalSendGateway;
  clientPortalUrl: string;
}

interface ProposalSendRequest {
  proposalId: string;
  sentAt: string;
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
  const proposalId = (body as Record<string, unknown>).proposalId;
  const sentAt = (body as Record<string, unknown>).sentAt;
  if (
    typeof proposalId !== "string" ||
    proposalId.trim() === "" ||
    typeof sentAt !== "string" ||
    sentAt.trim() === ""
  ) {
    return null;
  }
  return { proposalId: proposalId.trim(), sentAt: sentAt.trim() };
}

function renderProposalEmail(
  proposal: ProposalSendRow,
  identity: ProposalSenderIdentity,
  clientPortalUrl: string,
): ProposalEmail {
  const recipient = proposal.client?.email;
  if (!recipient || !proposal.client_id || !proposal.sent_at) {
    throw new Error("proposal recipient or send instance is missing");
  }

  const clientName = proposal.client?.full_name ?? "there";
  const link = `${clientPortalUrl}/proposals/${proposal.id}`;
  const totalLine = proposal.total_amount
    ? paragraph(
      `<strong>Investment:</strong> ${formatCurrency(proposal.total_amount)}`,
    )
    : "";
  const expiryLine = proposal.valid_until
    ? muted(`<em>Please review by ${formatDate(proposal.valid_until)}.</em>`)
    : "";
  const personalBlock = proposal.personal_message
    ? callout(escapeHtml(proposal.personal_message))
    : "";
  const subject =
    `${identity.senderName} sent you a proposal: "${proposal.title}"`;
  const html = renderBrandedShell({
    title: subject,
    preview: `${identity.designerName} has prepared a design proposal for you.`,
    eyebrow: "Proposal",
    studioName: identity.studioName,
    studioLogoUrl: identity.studioLogoUrl,
    body: [
      heading("Your proposal is ready"),
      paragraph(`Hi ${escapeHtml(clientName)},`),
      paragraph(
        `${
          escapeHtml(identity.designerName)
        } has prepared a design proposal for you: <strong>${
          escapeHtml(
            proposal.title,
          )
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

  return {
    to: recipient,
    cc: proposal.cc_email ?? undefined,
    subject,
    html,
    userId: proposal.client_id,
    idempotencyKey: `proposal-send/${proposal.id}/${proposal.sent_at}`,
    metadata: {
      proposal_id: proposal.id,
      sent_at: proposal.sent_at,
      subject: "Proposal ready for your review",
      message: proposal.title,
      deep_link: `/proposals/${proposal.id}`,
    },
  };
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
      return json({ error: "proposalId_and_sentAt_required" }, 400);
    }

    // The service-role gateway is constructed only after JWT validation.
    const gateway = deps.createGateway(authorization);
    let proposal: ProposalSendRow | null;
    try {
      proposal = await gateway.loadProposal(payload.proposalId);
    } catch (error) {
      console.error("proposal-send: proposal lookup failed", error);
      return json({ error: "proposal_lookup_failed" }, 503);
    }
    if (!proposal) return json({ error: "proposal_not_found" }, 404);

    const canManage = proposal.designer_id === caller.userId ||
      (!!proposal.designer_id &&
        (await gateway.isActiveStudioComember(proposal.designer_id)));
    if (!canManage) return json({ error: "not_authorized" }, 403);

    if (proposal.status !== "sent" || !proposal.sent_at) {
      return json({ error: "proposal_not_sent" }, 409);
    }
    if (proposal.sent_at !== payload.sentAt) {
      return json({ error: "proposal_send_instance_changed" }, 409);
    }
    if (!proposal.client_id || !proposal.client?.email) {
      return json({ error: "no_recipient" }, 422);
    }

    let claim: DispatchClaim;
    try {
      claim = await gateway.claimDispatch(proposal.id, payload.sentAt);
    } catch (error) {
      console.error("proposal-send: dispatch claim failed", error);
      return json({ error: "dispatch_claim_failed" }, 503);
    }

    if (!claim.claimed) {
      return json({
        ok: true,
        duplicate: true,
        in_flight: claim.inFlight,
        attempt_count: claim.attemptCount,
      });
    }
    if (!claim.claimToken || !claim.notificationLogId) {
      return json({ error: "dispatch_claim_invalid" }, 503);
    }

    const complete = async (
      succeeded: boolean,
      providerId?: string,
      error?: string,
    ) => {
      await gateway.completeDispatch({
        proposalId: proposal.id,
        sentAt: payload.sentAt,
        claimToken: claim.claimToken as string,
        succeeded,
        providerId,
        error,
      });
    };

    try {
      await gateway.ensureInAppNotification(proposal, claim.notificationLogId);
      const identity = await gateway.resolveSender(proposal);
      const email = renderProposalEmail(
        proposal,
        identity,
        deps.clientPortalUrl,
      );
      const result = await gateway.sendEmail(email);

      if (!result.success && !result.suppressed) {
        await complete(false, undefined, result.error ?? "send_failed");
        return json({ error: "send_failed", detail: result.error }, 502);
      }

      await complete(true, result.id);
      return json({
        ok: true,
        duplicate: false,
        suppressed: result.suppressed ?? false,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "send_failed";
      console.error("proposal-send: dispatch failed", error);
      try {
        await complete(false, undefined, detail);
      } catch (completionError) {
        console.error(
          "proposal-send: failed to release dispatch claim",
          completionError,
        );
      }
      return json({ error: "send_failed", detail }, 502);
    }
  };
}
