/** Client-safe adapters for immutable FF&E review editions.
 *
 * These values intentionally accept only the published RPC projection. They
 * do not model working selections, trade cost, markup, notes, or storage
 * paths. A verdict is a preference signal; it is never an authorization.
 */
export type ClientReviewVerdict = 'approved' | 'rejected' | 'comment';

export interface ClientProjectReviewItem {
  id: string;
  name: string;
  roomName: string;
  imageUrl: string | null;
  clientPriceCents: number | null;
  currency: string;
  verdict: ClientReviewVerdict | null;
  comment: string | null;
}

export interface ClientProjectReviewBundle {
  editionId: string;
  publishedAt: string | null;
  status: 'published' | 'superseded' | 'finalized';
  items: ClientProjectReviewItem[];
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const nullableText = (value: unknown) => typeof value === 'string' && value ? value : null;
const nullableNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const first = (value: Record<string, unknown>, ...keys: string[]) => keys.map((key) => value[key]).find((item) => item !== undefined);

export function reviewVerdictFromLabel(label: 'Looks good' | 'Needs a change' | 'Ask a question'): ClientReviewVerdict {
  return label === 'Looks good' ? 'approved' : label === 'Needs a change' ? 'rejected' : 'comment';
}

export function adaptClientProjectReviewBundle(value: unknown): ClientProjectReviewBundle | null {
  const root = record(value);
  const editionId = text(first(root, 'editionId', 'edition_id', 'id'));
  if (!editionId) return null;
  const rawItems = first(root, 'items', 'reviewItems', 'review_items');
  const items = Array.isArray(rawItems) ? rawItems.map((entry) => {
    const row = record(entry);
    const id = text(row.id);
    if (!id) return null;
    const verdict = first(row, 'verdict');
    return {
      id,
      name: text(first(row, 'name', 'itemName', 'item_name'), 'Selection'),
      roomName: text(first(row, 'roomName', 'room_name'), 'Throughout'),
      imageUrl: nullableText(first(row, 'imageUrl', 'image_url')),
      clientPriceCents: nullableNumber(first(row, 'clientPriceCents', 'client_price_cents')),
      currency: text(first(row, 'currency'), 'USD'),
      verdict: verdict === 'approved' || verdict === 'rejected' || verdict === 'comment' ? verdict : null,
      comment: nullableText(first(row, 'comment')),
    } satisfies ClientProjectReviewItem;
  }).filter((item): item is ClientProjectReviewItem => item !== null) : [];
  const status = first(root, 'status');
  return {
    editionId,
    publishedAt: nullableText(first(root, 'publishedAt', 'published_at')),
    status: status === 'superseded' || status === 'finalized' ? status : 'published',
    items,
  };
}
