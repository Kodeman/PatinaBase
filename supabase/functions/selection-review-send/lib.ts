const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSendRequest(value: unknown): { editionId: string } | null {
  const editionId = value && typeof value === "object" ? (value as Record<string, unknown>).editionId : null;
  return typeof editionId === "string" && UUID.test(editionId.trim()) ? { editionId: editionId.trim().toLowerCase() } : null;
}

export const deliveryIdempotencyKey = (editionId: string) => `selection-review-send:${editionId}`;

export type PreparedDelivery = {
  attemptId: string;
  editionId: string;
  projectId: string;
  clientId: string;
  status: "pending" | "sent";
  outcome: "claimed" | "already_sent" | "in_progress";
  claimed: boolean;
  email: string | null;
  title: string;
  reviewPath: string;
};

export function parsePreparedDelivery(value: unknown, expectedEditionId: string): PreparedDelivery | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const recipient = row.recipient && typeof row.recipient === "object" ? row.recipient as Record<string, unknown> : {};
  const review = row.review && typeof row.review === "object" ? row.review as Record<string, unknown> : {};
  const attemptId = typeof row.attemptId === "string" ? row.attemptId.toLowerCase() : "";
  const editionId = typeof row.editionId === "string" ? row.editionId.toLowerCase() : "";
  const projectId = typeof row.projectId === "string" ? row.projectId.toLowerCase() : "";
  const clientId = typeof recipient.clientId === "string" ? recipient.clientId.toLowerCase() : "";
  const status = row.status;
  const outcome = row.outcome;
  const email = typeof recipient.email === "string" && recipient.email.trim() ? recipient.email.trim() : null;
  const title = typeof review.title === "string" && review.title.trim() ? review.title.trim() : "Selection review";
  const reviewPath = typeof review.reviewPath === "string" ? review.reviewPath : "";
  if (
    !UUID.test(attemptId) || !UUID.test(projectId) || !UUID.test(clientId) || editionId !== expectedEditionId ||
    reviewPath !== `/projects/${projectId}/reviews/${editionId}` ||
    (outcome !== "claimed" && outcome !== "already_sent" && outcome !== "in_progress") ||
    (outcome === "already_sent" ? status !== "sent" : status !== "pending")
  ) return null;
  if ((outcome === "claimed") !== (row.claimed === true) || !email) return null;
  return { attemptId, editionId, projectId, clientId, status: status as "pending" | "sent", outcome, claimed: row.claimed === true, email, title, reviewPath };
}

export const prepareDeliveryArgs = (editionId: string, actorId: string) => ({
  p_edition_id: editionId,
  p_actor_id: actorId,
  p_idempotency_key: deliveryIdempotencyKey(editionId),
});

export const markDeliveryArgs = (
  attemptId: string,
  actorId: string,
  providerMessageId: string | null,
  errorCode: string | null,
) => ({
  p_attempt_id: attemptId,
  p_actor_id: actorId,
  p_provider_message_id: providerMessageId,
  p_error_code: errorCode,
});

export function parseMarkedDelivery(
  value: unknown,
  delivery: PreparedDelivery,
  providerMessageId: string | null,
  errorCode: string | null,
): { attemptId: string; status: "sent" | "failed"; providerMessageId: string | null; reused: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const attemptId = typeof row.attemptId === "string" ? row.attemptId.toLowerCase() : "";
  const editionId = typeof row.editionId === "string" ? row.editionId.toLowerCase() : "";
  const projectId = typeof row.projectId === "string" ? row.projectId.toLowerCase() : "";
  const returnedProviderId = typeof row.providerMessageId === "string" && row.providerMessageId.trim()
    ? row.providerMessageId.trim()
    : null;
  const expectedStatus = errorCode ? "failed" : "sent";
  if (
    attemptId !== delivery.attemptId || editionId !== delivery.editionId || projectId !== delivery.projectId ||
    row.status !== expectedStatus || typeof row.reused !== "boolean" ||
    (expectedStatus === "sent" ? returnedProviderId !== providerMessageId : returnedProviderId !== null)
  ) return null;
  return { attemptId, status: expectedStatus, providerMessageId: returnedProviderId, reused: row.reused };
}

export function reviewUrl(reviewPath: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:") return null;
    const url = new URL(reviewPath, base);
    return url.origin === base.origin ? url.toString() : null;
  } catch {
    return null;
  }
}
