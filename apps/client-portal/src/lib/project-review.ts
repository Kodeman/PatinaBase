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
  mediaAssetIds: string[];
}

export interface ClientProjectReviewBundle {
  projectId: string;
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
const REVIEW_STATUSES = ['published', 'superseded', 'finalized'] as const;

export interface ClientReviewMediaUrl {
  assetId: string;
  signedUrl: string;
}

export function reviewVerdictFromLabel(label: 'Looks good' | 'Needs a change' | 'Ask a question'): ClientReviewVerdict {
  return label === 'Looks good' ? 'approved' : label === 'Needs a change' ? 'rejected' : 'comment';
}

export function adaptClientProjectReviewBundle(value: unknown): ClientProjectReviewBundle | null {
  const root = record(value);
  const edition = record(first(root, 'edition'));
  const project = record(first(root, 'project'));
  const editionId = text(first(edition, 'id', 'editionId', 'edition_id'));
  const projectId = text(first(project, 'id', 'projectId', 'project_id'));
  if (!editionId) return null;
  if (!projectId) return null;
  const rawStatus = first(edition, 'status');
  if (!REVIEW_STATUSES.includes(rawStatus as (typeof REVIEW_STATUSES)[number])) return null;
  const rawItems = first(root, 'items', 'reviewItems', 'review_items');
  const items = Array.isArray(rawItems) ? rawItems.map((entry) => {
    const row = record(entry);
    const id = text(row.id);
    if (!id) return null;
    const snapshot = record(first(row, 'snapshot'));
    const room = record(first(snapshot, 'room'));
    const clientFields = record(first(snapshot, 'clientFields', 'client_fields'));
    const rawFeedback = first(row, 'feedback');
    const latestFeedback = Array.isArray(rawFeedback) && rawFeedback.length > 0
      ? record(rawFeedback[rawFeedback.length - 1])
      : {};
    const verdict = first(latestFeedback, 'verdict');
    const rawMedia = first(snapshot, 'media');
    const mediaAssetIds = Array.isArray(rawMedia)
      ? rawMedia.map((entry) => text(first(record(entry), 'id', 'assetId', 'asset_id'))).filter(Boolean)
      : [];
    return {
      id,
      name: text(first(snapshot, 'name'), 'Selection'),
      roomName: text(first(room, 'name'), text(first(snapshot, 'assignmentScope', 'assignment_scope'), 'Throughout')),
      imageUrl: null,
      clientPriceCents: nullableNumber(first(snapshot, 'clientLineTotalCents', 'client_line_total_cents', 'clientUnitPriceCents', 'client_unit_price_cents')),
      currency: text(first(clientFields, 'currency'), 'USD'),
      verdict: verdict === 'approved' || verdict === 'rejected' || verdict === 'comment' ? verdict : null,
      comment: nullableText(first(latestFeedback, 'body', 'comment')),
      mediaAssetIds,
    } as ClientProjectReviewItem;
  }).filter((item): item is ClientProjectReviewItem => item !== null) : [];
  return {
    projectId,
    editionId,
    publishedAt: nullableText(first(edition, 'publishedAt', 'published_at')),
    status: rawStatus as ClientProjectReviewBundle['status'],
    items,
  };
}

export function applyClientReviewMediaUrls(
  bundle: ClientProjectReviewBundle,
  urls: ClientReviewMediaUrl[],
): ClientProjectReviewBundle {
  const byAsset = new Map(urls.map((entry) => [entry.assetId, entry.signedUrl]));
  return {
    ...bundle,
    items: bundle.items.map((item) => ({
      ...item,
      imageUrl: item.mediaAssetIds.map((assetId) => byAsset.get(assetId)).find(Boolean) ?? null,
    })),
  };
}
