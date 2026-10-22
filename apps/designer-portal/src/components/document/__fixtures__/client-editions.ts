/**
 * list_client_editions rows exactly as the SQL builds them — keys copied from
 * SQ-1590's 00845_client_edition_rpcs.sql (585281bb6, list_client_editions,
 * lines 1231–1293) and the composition the compose function writes (story
 * seq 34: {sourceHash, voice, hero{assetId,why}, held, chapters, doorstep,
 * notice}; images crop_key 'none'). Each image also carries the three keys
 * SQ-1659 adds to list_client_editions: `ground` (the asset's, as planCrops
 * reads it), `attributionKind` (the reader's frozen kind; here the source kind
 * unless a test says otherwise) and `sourceTable` (the same request row's
 * source_ref->>'table'). Tests feed these through the hook's own
 * `normalizeClientEditions`, so a drift between the SQL and the hook shows.
 */

type Row = Record<string, unknown>;

/** 00843's enqueue table for each request kind. */
const SOURCE_TABLE: Record<string, string> = {
  upload: 'project_ffe_item_images',
  maker: 'project_ffe_item_images',
  concept: 'project_rooms',
  scan: 'room_scan_images',
  board: 'project_boards',
};

export function imageRow(assetId: string, over: Row = {}): Row {
  const sourceKind = (over.sourceKind as string | undefined) ?? 'upload';
  return {
    ground: 'scene',
    attributionKind: sourceKind,
    sourceTable: SOURCE_TABLE[sourceKind] ?? null,
    assetId,
    plateRole: 'held',
    cropKey: 'none',
    rank: 1,
    chapterKey: 'room-living',
    alt: `Picture ${assetId}`,
    captionWhat: `What ${assetId}`,
    captionWhose: 'Birchwood Studio',
    captionWhen: 'October',
    sourceKind: 'upload',
    sourceUrl: `project-item-images/${assetId}.jpg`,
    width: 2000,
    height: 1250,
    focal: null,
    subjectBox: null,
    focalOrigin: null,
    ...over,
  };
}

export const CHAPTERS = [
  { key: 'room-living', headline: 'The living room', standing: 'The sofa leaves the workshop on Friday.' },
];

export function composition(heroAssetId: string | null, over: Row = {}): Row {
  return {
    sourceHash: 'a'.repeat(64),
    voice: 'model',
    hero: heroAssetId ? { assetId: heroAssetId, why: 'The finished room.' } : null,
    held: [],
    chapters: CHAPTERS,
    doorstep: { standing: 'Nothing waits on you this week.' },
    notice: 'Maren has a new issue for you.',
    ...over,
  };
}

export function editionRow(over: Row = {}): Row {
  const row: Row = {
    id: 'e',
    seq: 1,
    status: 'approved',
    kind: 'full',
    autoPublished: false,
    held: false,
    approvedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: '2026-10-21T12:00:00+00:00',
    supersededAt: null,
    supersededBy: null,
    frozenAt: null,
    promptVersion: 'e1',
    composition: composition(null),
    overrides: {},
    images: [],
    ...over,
  };
  // The SQL repeats the composition's hero and headlines at the top level.
  const built = row.composition as { hero?: unknown; chapters?: Array<{ key: string; headline: string }> };
  return {
    hero: built?.hero ?? null,
    headlines: (built?.chapters ?? []).map(({ key, headline }) => ({ key, headline })),
    ...row,
  };
}

/** The whole RPC result: `{showMakers, editions}` newest first. */
export const listEnvelope = (editions: Row[], showMakers = false) => ({ showMakers, editions });

// ── The set most tests read ──────────────────────────────────────────────────

export const PENDING_ROW = editionRow({
  id: 'e-5',
  seq: 5,
  status: 'awaiting_review',
  createdAt: '2026-10-22T08:00:00+00:00',
  composition: composition('a-hero'),
  images: [
    imageRow('a-hero', { plateRole: 'hero', rank: 0, chapterKey: 'cover', focal: [0.5, 0.45] }),
    imageRow('a-room', { sourceKind: 'scan', sourceUrl: 'scans/u-1/s-1/room.jpg' }),
    imageRow('a-concept', { sourceKind: 'concept', sourceUrl: 'p-1/r-1/render.png' }),
  ],
});

export const CURRENT_ROW = editionRow({
  id: 'e-4',
  seq: 4,
  status: 'approved',
  approvedAt: '2026-10-21T12:00:00+00:00',
  reviewedAt: '2026-10-21T12:00:00+00:00',
  reviewedBy: { id: 'u-maren', name: 'Maren Holt' },
  composition: composition('a-old'),
  images: [
    imageRow('a-old', { plateRole: 'hero', rank: 0, chapterKey: 'cover' }),
    imageRow('a-room', { sourceKind: 'scan', sourceUrl: 'scans/u-1/s-1/room.jpg' }),
  ],
});

export const EARLIER_ROW = editionRow({
  id: 'e-3',
  seq: 3,
  status: 'superseded',
  kind: 'plates_only',
  autoPublished: true,
  approvedAt: '2026-10-20T12:00:00+00:00',
  supersededAt: '2026-10-21T12:00:00+00:00',
  supersededBy: 'e-4',
});
