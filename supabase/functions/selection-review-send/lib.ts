const UUIDISH = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export function parseSendRequest(value: unknown): { editionId: string } | null {
  const editionId = value && typeof value === "object" ? (value as Record<string, unknown>).editionId : null;
  return typeof editionId === "string" && UUIDISH.test(editionId.trim()) ? { editionId: editionId.trim() } : null;
}
export const deliveryIdempotencyKey = (editionId: string) => `selection-review-send:${editionId}`;
