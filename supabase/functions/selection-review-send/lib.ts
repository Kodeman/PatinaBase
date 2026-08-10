const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSendRequest(value: unknown): { editionId: string } | null {
  const editionId = value && typeof value === "object" ? (value as Record<string, unknown>).editionId : null;
  return typeof editionId === "string" && UUID.test(editionId.trim()) ? { editionId: editionId.trim().toLowerCase() } : null;
}

export const deliveryIdempotencyKey = (editionId: string) => `selection-review-send:${editionId}`;

export type PreparedDelivery = {
  attemptId: string;
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
  const outcome = row.outcome;
  const email = typeof recipient.email === "string" && recipient.email.trim() ? recipient.email.trim() : null;
  const title = typeof review.title === "string" && review.title.trim() ? review.title.trim() : "Selection review";
  const reviewPath = typeof review.reviewPath === "string" ? review.reviewPath : "";
  if (
    !UUID.test(attemptId) || !UUID.test(projectId) || editionId !== expectedEditionId ||
    reviewPath !== `/projects/${projectId}/reviews/${editionId}` ||
    (outcome !== "claimed" && outcome !== "already_sent" && outcome !== "in_progress")
  ) return null;
  if ((outcome === "claimed") !== (row.claimed === true) || (outcome === "claimed" && !email)) return null;
  return { attemptId, outcome, claimed: row.claimed === true, email, title, reviewPath };
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
