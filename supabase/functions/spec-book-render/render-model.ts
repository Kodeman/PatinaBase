// Pure, database-free normalization for immutable Spec Book revision snapshots.
//
// Security boundary: every non-internal audience is constructed from an
// explicit allow-list. Unknown snapshot fields are dropped rather than copied.
// The internal edition intentionally receives the complete frozen item.

export const SPEC_BOOK_AUDIENCES = [
  "client",
  "vendor",
  "installer",
  "internal",
  "care",
] as const;

export type SpecBookAudience = (typeof SPEC_BOOK_AUDIENCES)[number];
export type SpecBookIssueType = "full" | "replacement" | "addendum";

export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_RENDER_ITEMS = 500;
export const MAX_MEDIA_PER_ITEM = 8;
export const MAX_RENDER_MEDIA = 1_000;

type JsonRecord = Record<string, unknown>;

export interface FrozenSnapshot {
  contractVersion: number;
  book: JsonRecord;
  project: JsonRecord;
  template: JsonRecord;
  chapters: JsonRecord[];
  items: JsonRecord[];
  allowances: JsonRecord[];
  tbd: JsonRecord[];
  audiences: string[];
  issue: JsonRecord;
}

export interface RenderMedia {
  url?: string;
  storageBucket?: string;
  storagePath?: string;
  alt?: string;
  caption?: string;
}

export interface AudienceConfigurationSelection {
  group: string;
  value: string;
}

export interface AudienceConfigurationComponent {
  name: string;
  quantity: number;
}

/**
 * Client-safe projection of a frozen furniture-configuration snapshot.
 *
 * Labels only. Every pricing key (retail/trade/deltas), the snapshot hash, the
 * lock timestamp, vendor SKUs, and the vendor-operational COM fields (mill,
 * ship-to, sidemark, yardage) are deliberately absent — a client edition must
 * read as "what was chosen", never as "what it costs us" or "how it ships".
 */
export interface AudienceConfigurationSummary {
  selections: AudienceConfigurationSelection[];
  variantName?: string;
  components?: AudienceConfigurationComponent[];
  dimensions?: Record<string, string | number | boolean>;
  comFabric?: string;
}

export interface AudienceItem {
  id: string;
  chapterId: string | null;
  roomId: string | null;
  slotId: string | null;
  documentCode: string | null;
  name: string;
  kind: "fixed" | "allowance" | "tbd";
  category: string | null;
  roomName: string | null;
  quantity: number | null;
  selection: Record<string, unknown>;
  configuration?: AudienceConfigurationSummary;
  media: RenderMedia[];
  notes: Record<string, string>;
  commercial: Record<string, unknown>;
  vendor: Record<string, unknown>;
  contentHash: string;
  raw?: JsonRecord;
}

export interface RenderChapter {
  id: string;
  projectRoomId: string | null;
  name: string;
  position: number;
}

export interface AddendumChange {
  id: string;
  documentCode: string | null;
  name: string;
  kind: "added" | "changed" | "removed";
}

export interface AudienceRenderModel {
  contractVersion: 1;
  audience: SpecBookAudience;
  editionLabel: string;
  book: {
    id: string | null;
    title: string;
  };
  project: {
    id: string;
    name: string;
    clientName: string | null;
  };
  template: {
    name: string | null;
    version: string | number | null;
    branding: {
      studioName: string | null;
      logoUrl: string | null;
      primaryColor: string | null;
      accentColor: string | null;
    };
    page: {
      size: string;
      margin: number;
    };
  };
  issue: {
    type: SpecBookIssueType;
    reason: string | null;
    baseRevisionId: string | null;
    createdAt: string;
    revisionNumber: number;
  };
  chapters: RenderChapter[];
  items: AudienceItem[];
  allowances: AudienceItem[];
  tbd: AudienceItem[];
  changes: AddendumChange[];
}

export interface RevisionRenderContext {
  revisionNumber: number;
  createdAt: string;
  issueType?: SpecBookIssueType;
}

const FIELD_ALIASES: Record<string, string[]> = {
  sku: ["sku", "selectedSku", "selected_sku", "vendorSku", "vendor_sku"],
  finish: ["finish", "selectedFinish", "selected_finish"],
  material: ["material", "materials", "selectedMaterial", "selected_material"],
  colorFabric: [
    "colorFabric",
    "color_fabric",
    "color",
    "fabric",
    "selectedColorFabric",
    "selected_color_fabric",
  ],
  dimensions: ["dimensions", "selectedDimensions", "selected_dimensions"],
  exactLocation: ["exactLocation", "exact_location", "location"],
  care: ["care", "careInstructions", "care_instructions"],
  warranty: ["warranty", "warrantyDetails", "warranty_details"],
  leadTime: ["leadTime", "lead_time", "leadTimeWeeks", "lead_time_weeks"],
};

const FORBIDDEN_NON_INTERNAL_KEY_PARTS = [
  "trade",
  "markup",
  "margin",
  "private",
  "internalcontact",
  "internal_contact",
  "procurement",
];

const DEFAULT_AUDIENCE_ALLOW: Record<SpecBookAudience, string[]> = {
  client: [
    "identity",
    "selection",
    "configuration",
    "dimensions",
    "quantity",
    "selectedMedia",
    "clientPrice",
    "clientNotes",
    "care",
    "warranty",
  ],
  vendor: [
    "identity",
    "selection",
    "dimensions",
    "quantity",
    "selectedMedia",
    "vendorNotes",
  ],
  installer: [
    "identity",
    "location",
    "selection",
    "dimensions",
    "quantity",
    "selectedMedia",
    "installNotes",
  ],
  internal: ["*"],
  care: ["identity", "selectedMedia", "care", "warranty"],
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstValue(record: JsonRecord, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null) {
      return record[alias];
    }
  }
  return undefined;
}

function nestedField(item: JsonRecord, aliases: string[]): unknown {
  const direct = firstValue(item, aliases);
  if (direct !== undefined) return direct;
  for (
    const containerName of ["selection", "resolved", "fields", "spec", "notes"]
  ) {
    const container = item[containerName];
    if (!isRecord(container)) continue;
    const nested = firstValue(container, aliases);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function safeResolvedValue(
  value: unknown,
  includeProvenance: boolean,
): unknown {
  if (!isRecord(value)) return canonicalClone(value);
  const out: JsonRecord = {};
  if ("value" in value) out.value = canonicalClone(value.value);
  if (typeof value.na === "boolean") out.na = value.na;
  const naReason = stringValue(value.naReason ?? value.na_reason);
  if (naReason) out.naReason = naReason;
  if (includeProvenance) {
    for (
      const key of [
        "source",
        "sourceUpdatedAt",
        "source_updated_at",
        "verifiedAt",
        "verified_at",
      ]
    ) {
      if (value[key] !== undefined) out[key] = canonicalClone(value[key]);
    }
  }
  return out;
}

function itemId(item: JsonRecord): string {
  return (
    stringValue(item.id) ??
      stringValue(item.ffeItemId) ??
      stringValue(item.ffe_item_id) ??
      ""
  );
}

function itemCode(item: JsonRecord): string | null {
  return stringValue(
    item.documentCode ?? item.document_code ?? item.docCode ?? item.doc_code ??
      item.code,
  );
}

function itemName(item: JsonRecord): string {
  return stringValue(item.name ?? item.productName ?? item.product_name) ??
    "Untitled selection";
}

function itemKind(item: JsonRecord): "fixed" | "allowance" | "tbd" {
  const value = stringValue(item.kind ?? item.itemType ?? item.item_type);
  return value === "allowance" || value === "tbd" ? value : "fixed";
}

function itemPosition(item: JsonRecord): number {
  return numberValue(item.position ?? item.sortOrder ?? item.sort_order) ??
    Number.NaN;
}

function itemRoom(item: JsonRecord): JsonRecord {
  return isRecord(item.room) ? item.room : {};
}

function itemRoomId(item: JsonRecord): string | null {
  const room = itemRoom(item);
  return stringValue(
    item.roomId ?? item.room_id ?? room.id,
  );
}

function itemChapterId(
  item: JsonRecord,
  chapters: RenderChapter[],
): string | null {
  const direct = stringValue(item.chapterId ?? item.chapter_id);
  if (direct) return direct;
  const roomId = itemRoomId(item);
  return roomId
    ? chapters.find((chapter) => chapter.projectRoomId === roomId)?.id ?? null
    : null;
}

function itemVisibleToAudience(
  item: JsonRecord,
  audience: SpecBookAudience,
): boolean {
  const requested = item.audiences ?? item.includedAudiences ??
    item.included_audiences;
  if (Array.isArray(requested)) {
    return requested.some((entry) => entry === audience);
  }
  const visibility = item.audienceVisibility ?? item.audience_visibility ??
    item.visibility;
  if (isRecord(visibility) && typeof visibility[audience] === "boolean") {
    return visibility[audience] === true;
  }
  if (
    (itemKind(item) === "allowance" || itemKind(item) === "tbd") &&
    audience !== "client" && audience !== "internal"
  ) {
    return false;
  }
  return true;
}

function mediaIdentity(media: RenderMedia): string {
  if (media.storagePath) {
    return `${media.storageBucket ?? "project-documents"}:${media.storagePath}`;
  }
  return media.url ?? "";
}

function normalizeMedia(value: unknown): RenderMedia[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RenderMedia[] = [];
  for (const entry of value) {
    let media: RenderMedia | null = null;
    if (typeof entry === "string" && entry.trim()) {
      media = { url: entry.trim() };
    } else if (isRecord(entry)) {
      const url = stringValue(entry.url ?? entry.imageUrl ?? entry.image_url);
      const storagePath = stringValue(
        entry.storagePath ?? entry.storage_path ?? entry.path,
      );
      if (url || storagePath) {
        media = {
          ...(url ? { url } : {}),
          ...(storagePath ? { storagePath } : {}),
          ...(stringValue(
              entry.storageBucket ?? entry.storage_bucket ?? entry.bucket,
            )
            ? {
              storageBucket: stringValue(
                entry.storageBucket ?? entry.storage_bucket ?? entry.bucket,
              )!,
            }
            : {}),
          ...(stringValue(entry.alt ?? entry.altText ?? entry.alt_text)
            ? {
              alt: stringValue(entry.alt ?? entry.altText ?? entry.alt_text)!,
            }
            : {}),
          ...(stringValue(entry.caption)
            ? { caption: stringValue(entry.caption)! }
            : {}),
        };
      }
    }
    if (!media) continue;
    const identity = mediaIdentity(media);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    out.push(media);
    if (out.length >= MAX_MEDIA_PER_ITEM) break;
  }
  return out;
}

function configurationSnapshot(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const snapshot = value.snapshot ?? value.configuration_snapshot;
  return isRecord(snapshot) ? snapshot : null;
}

function safeDimensionEntries(
  value: unknown,
): Record<string, string | number | boolean> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Defence in depth: a stray dimension key carrying a forbidden part would
    // otherwise fail the whole render closed in assertAudienceModelPrivacy.
    const compact = key.toLowerCase().replace(/[-\s_]/g, "");
    if (
      FORBIDDEN_NON_INTERNAL_KEY_PARTS.some((part) => compact.includes(part))
    ) {
      continue;
    }
    if (
      typeof entry === "string" || typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      if (typeof entry === "string" && !entry.trim()) continue;
      out[key] = typeof entry === "string" ? entry.trim() : entry;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Build the client-safe configuration summary from a frozen configuration
 * envelope (`{id, snapshot, snapshotHash, lockedAt}`, 00403).
 *
 * Only selection labels, the variant name, component names/quantities, resolved
 * dimensions, and the COM fabric name are read. Because nothing price-derived
 * is copied, a configuration whose pricing alone moved produces an identical
 * summary — and therefore an unchanged client contentHash.
 */
function clientConfigurationSummary(
  value: unknown,
): AudienceConfigurationSummary | null {
  const snapshot = configurationSnapshot(value);
  if (!snapshot) return null;

  const selections: AudienceConfigurationSelection[] = [];
  if (Array.isArray(snapshot.selections)) {
    for (const entry of snapshot.selections) {
      if (!isRecord(entry)) continue;
      const group = stringValue(
        entry.groupName ?? entry.group_name ?? entry.groupCode ??
          entry.group_code,
      );
      const label = stringValue(
        entry.valueLabel ?? entry.value_label ?? entry.valueCode ??
          entry.value_code,
      );
      if (!group || !label) continue;
      selections.push({ group, value: label });
    }
  }

  const variant = isRecord(snapshot.variant) ? snapshot.variant : null;
  const variantName = variant ? stringValue(variant.name) : null;

  const components: AudienceConfigurationComponent[] = [];
  if (Array.isArray(snapshot.components)) {
    for (const entry of snapshot.components) {
      if (!isRecord(entry)) continue;
      const name = stringValue(entry.name);
      if (!name) continue;
      components.push({
        name,
        quantity: Math.max(1, Math.round(numberValue(entry.quantity) ?? 1)),
      });
    }
  }

  const dimensions = safeDimensionEntries(
    snapshot.dimensions ?? snapshot.resolvedDimensions ??
      snapshot.resolved_dimensions,
  );

  const com = isRecord(snapshot.comDetails)
    ? snapshot.comDetails
    : isRecord(snapshot.com_details)
    ? snapshot.com_details
    : null;
  const comFabric = com ? stringValue(com.fabricName ?? com.fabric_name) : null;

  if (
    !selections.length && !variantName && !components.length && !dimensions &&
    !comFabric
  ) {
    return null;
  }

  return {
    selections,
    ...(variantName ? { variantName } : {}),
    ...(components.length ? { components } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(comFabric ? { comFabric } : {}),
  };
}

function note(item: JsonRecord, aliases: string[]): string | null {
  const direct = firstValue(item, aliases);
  if (direct !== undefined) return stringValue(direct);
  return isRecord(item.notes)
    ? stringValue(firstValue(item.notes, aliases))
    : null;
}

function buildSafeItem(
  item: JsonRecord,
  audience: SpecBookAudience,
  chapters: RenderChapter[],
  allow: ReadonlySet<string>,
): AudienceItem {
  const includeProvenance = audience === "internal";
  const allows = (token: string) => allow.has("*") || allow.has(token);
  const selection: Record<string, unknown> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const token = field === "dimensions"
      ? "dimensions"
      : field === "exactLocation"
      ? "location"
      : field === "care" || field === "warranty"
      ? field
      : "selection";
    if (!allows(token)) continue;
    const value = nestedField(item, aliases);
    if (value !== undefined && value !== null && value !== "") {
      selection[field] = safeResolvedValue(value, includeProvenance);
    }
  }

  const notes: Record<string, string> = {};
  const publicNotes = note(item, ["publicNotes", "public_notes", "notes"]);
  const clientNotes = note(item, ["clientNotes", "client_notes", "client"]);
  const vendorNotes = note(item, [
    "vendorNotes",
    "vendor_notes",
    "approvedVendorNotes",
    "trade",
  ]);
  const installNotes = note(item, ["installNotes", "install_notes", "install"]);
  const privateNotes = note(item, [
    "privateNotes",
    "private_notes",
    "internalNotes",
    "internal_notes",
    "private",
  ]);
  const procurement = note(item, [
    "procurementCommentary",
    "procurement_commentary",
    "procurement",
  ]);

  if (publicNotes && allows("publicNotes")) notes.public = publicNotes;
  if (audience === "client" && clientNotes && allows("clientNotes")) {
    notes.client = clientNotes;
  }
  if (audience === "vendor" && vendorNotes && allows("vendorNotes")) {
    notes.vendor = vendorNotes;
  }
  if (audience === "installer" && installNotes && allows("installNotes")) {
    notes.install = installNotes;
  }
  if (audience === "internal") {
    if (clientNotes) notes.client = clientNotes;
    if (vendorNotes) notes.vendor = vendorNotes;
    if (installNotes) notes.install = installNotes;
    if (privateNotes) notes.private = privateNotes;
    if (procurement) notes.procurement = procurement;
  }

  const commercial: Record<string, unknown> = {};
  const pricing = isRecord(item.pricing) ? item.pricing : item;
  if (
    (audience === "client" && allows("clientPrice")) || audience === "internal"
  ) {
    const clientPrice = firstValue(pricing, [
      "clientPriceCents",
      "client_price_cents",
      "unitPriceCents",
      "unit_price_cents",
    ]);
    if (numberValue(clientPrice) !== null) {
      commercial.clientPriceCents = clientPrice;
    }
  }
  if (audience === "internal") {
    for (
      const key of [
        "tradePriceCents",
        "trade_price_cents",
        "markup",
        "markupPercent",
        "markup_percent",
        "margin",
      ]
    ) {
      if (pricing[key] !== undefined) {
        commercial[key] = canonicalClone(pricing[key]);
      }
    }
  }

  const vendor: Record<string, unknown> = {};
  const vendorSource = isRecord(item.vendor) ? item.vendor : item;
  if (audience === "vendor" || audience === "internal") {
    const vendorName = stringValue(
      vendorSource.name ?? vendorSource.vendorName ?? vendorSource.vendor_name,
    );
    const vendorSku = stringValue(
      vendorSource.sku ?? vendorSource.vendorSku ?? vendorSource.vendor_sku,
    );
    if (vendorName) vendor.name = vendorName;
    if (vendorSku) vendor.sku = vendorSku;
  }
  if (audience === "internal") {
    for (
      const key of [
        "vendorContact",
        "vendor_contact",
        "internalVendorContact",
        "internal_vendor_contact",
        "internalContact",
      ]
    ) {
      if (vendorSource[key] !== undefined) {
        vendor[key] = canonicalClone(vendorSource[key]);
      }
    }
  }

  const room = itemRoom(item);
  const normalized: AudienceItem = {
    id: itemId(item),
    chapterId: itemChapterId(item, chapters),
    roomId: itemRoomId(item),
    slotId: stringValue(item.slotId ?? item.slot_id),
    documentCode: itemCode(item),
    name: itemName(item),
    kind: itemKind(item),
    category: stringValue(
      item.category ?? item.ffeCategory ?? item.ffe_category,
    ),
    roomName: stringValue(item.roomName ?? item.room_name ?? room.name),
    quantity: allows("quantity")
      ? Math.max(0, numberValue(item.quantity) ?? 1)
      : null,
    selection,
    media: allows("selectedMedia")
      ? normalizeMedia(
        item.selectedMedia ?? item.selected_media ?? item.media ?? item.images,
      )
      : [],
    notes,
    commercial,
    vendor,
    contentHash: stringValue(item.contentHash ?? item.content_hash) ?? "",
  };
  // Only the client edition carries the configuration summary; the internal
  // edition already has the whole envelope in `raw`, and vendor/installer/care
  // hold no token for it at all.
  if (audience === "client" && allows("configuration")) {
    const configuration = clientConfigurationSummary(item.configuration);
    if (configuration) normalized.configuration = configuration;
  }
  if (audience === "internal") {
    normalized.raw = canonicalClone(item) as JsonRecord;
  }
  return normalized;
}

async function audienceItemHash(
  item: JsonRecord,
  audience: SpecBookAudience,
  chapters: RenderChapter[],
  allow: ReadonlySet<string>,
): Promise<string> {
  if (audience === "internal") return await rawItemHash(item);
  const safeItem = buildSafeItem(item, audience, chapters, allow);
  safeItem.contentHash = "";
  return await sha256Hex(canonicalStringify(safeItem));
}

async function buildAudienceItem(
  item: JsonRecord,
  audience: SpecBookAudience,
  chapters: RenderChapter[],
  allow: ReadonlySet<string>,
): Promise<AudienceItem> {
  const normalized = buildSafeItem(item, audience, chapters, allow);
  normalized.contentHash = await audienceItemHash(
    item,
    audience,
    chapters,
    allow,
  );
  return normalized;
}

function normalizeChapters(chapters: JsonRecord[]): RenderChapter[] {
  return chapters
    .map((chapter) => ({
      id: stringValue(chapter.id ?? chapter.roomId ?? chapter.room_id) ?? "",
      projectRoomId: stringValue(
        chapter.projectRoomId ?? chapter.project_room_id ?? chapter.roomId ??
          chapter.room_id,
      ),
      name: stringValue(
        chapter.name ?? chapter.title ?? chapter.roomName ??
          chapter.room_name,
      ) ??
        "Untitled room",
      position: numberValue(
        chapter.position ?? chapter.sortOrder ?? chapter.sort_order,
      ) ?? 0,
    }))
    .sort((a, b) =>
      a.position - b.position || a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
}

function sortedRawItems(
  snapshot: FrozenSnapshot,
  chapters: RenderChapter[],
): JsonRecord[] {
  const chapterPositions = new Map(
    chapters.map((chapter) => [chapter.id, chapter.position]),
  );
  return snapshot.items.map((item, index) => ({ item, index })).sort((a, b) => {
    const aChapter =
      chapterPositions.get(itemChapterId(a.item, chapters) ?? "") ??
        Number.MAX_SAFE_INTEGER;
    const bChapter =
      chapterPositions.get(itemChapterId(b.item, chapters) ?? "") ??
        Number.MAX_SAFE_INTEGER;
    const aPosition = itemPosition(a.item);
    const bPosition = itemPosition(b.item);
    return aChapter - bChapter ||
      (Number.isFinite(aPosition) && Number.isFinite(bPosition)
        ? aPosition - bPosition
        : a.index - b.index) ||
      itemId(a.item).localeCompare(itemId(b.item));
  }).map(({ item }) => item);
}

function audienceAllowTokens(
  template: JsonRecord,
  audience: SpecBookAudience,
): ReadonlySet<string> {
  const profiles = isRecord(template.audienceProfiles)
    ? template.audienceProfiles
    : isRecord(template.audience_profiles)
    ? template.audience_profiles
    : {};
  const profile = isRecord(profiles[audience]) ? profiles[audience] : {};
  const explicit = Array.isArray(profile.allow)
    ? profile.allow.filter((entry): entry is string =>
      typeof entry === "string"
    )
    : null;
  const allow = new Set(explicit ?? DEFAULT_AUDIENCE_ALLOW[audience]);
  // `configuration` post-dates every frozen template profile (00380 seeded the
  // system template with a fixed client allow-list, and revisions freeze the
  // template row verbatim). The summary is nothing but selection labels, so a
  // profile that already grants the client `selection` grants the summary too.
  // Every other audience — and a client profile that withholds `selection` —
  // stays closed unless a profile names the token itself.
  if (explicit && audience === "client" && allow.has("selection")) {
    allow.add("configuration");
  }
  return allow;
}

function rawItemHash(item: JsonRecord): Promise<string> {
  const provided = stringValue(item.contentHash ?? item.content_hash);
  return provided
    ? Promise.resolve(provided)
    : sha256Hex(canonicalStringify(item));
}

async function diffItems(
  current: JsonRecord[],
  base: JsonRecord[],
  currentHash: (item: JsonRecord) => Promise<string> = rawItemHash,
  baseHash: (item: JsonRecord) => Promise<string> = rawItemHash,
): Promise<{ includedIds: Set<string>; changes: AddendumChange[] }> {
  const currentById = new Map(current.map((item) => [itemId(item), item]));
  const baseById = new Map(base.map((item) => [itemId(item), item]));
  const includedIds = new Set<string>();
  const changes: AddendumChange[] = [];

  for (const item of current) {
    const id = itemId(item);
    const before = baseById.get(id);
    if (!before) {
      includedIds.add(id);
      changes.push({
        id,
        documentCode: itemCode(item),
        name: itemName(item),
        kind: "added",
      });
      continue;
    }
    if (await currentHash(item) !== await baseHash(before)) {
      includedIds.add(id);
      changes.push({
        id,
        documentCode: itemCode(item),
        name: itemName(item),
        kind: "changed",
      });
    }
  }
  for (const item of base) {
    const id = itemId(item);
    if (!currentById.has(id)) {
      changes.push({
        id,
        documentCode: itemCode(item),
        name: itemName(item),
        kind: "removed",
      });
    }
  }
  changes.sort((a, b) =>
    (a.documentCode ?? "").localeCompare(b.documentCode ?? "") ||
    a.id.localeCompare(b.id)
  );
  return { includedIds, changes };
}

function parseSnapshot(raw: unknown): FrozenSnapshot {
  if (!isRecord(raw)) {
    throw new RenderModelError(
      "invalid_snapshot",
      "Snapshot must be an object",
    );
  }
  const bytes = new TextEncoder().encode(JSON.stringify(raw)).byteLength;
  if (bytes > MAX_SNAPSHOT_BYTES) {
    throw new RenderModelError(
      "snapshot_too_large",
      `Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`,
    );
  }
  if (raw.contractVersion !== 1) {
    throw new RenderModelError(
      "unsupported_contract",
      "Only snapshot contractVersion 1 is supported",
    );
  }
  for (const key of ["book", "project", "template", "issue"]) {
    if (!isRecord(raw[key])) {
      throw new RenderModelError(
        "invalid_snapshot",
        `Snapshot ${key} must be an object`,
      );
    }
  }
  for (const key of ["chapters", "items", "allowances", "tbd", "audiences"]) {
    if (!Array.isArray(raw[key])) {
      throw new RenderModelError(
        "invalid_snapshot",
        `Snapshot ${key} must be an array`,
      );
    }
  }
  for (const key of ["chapters", "items", "allowances", "tbd"]) {
    if (!(raw[key] as unknown[]).every(isRecord)) {
      throw new RenderModelError(
        "invalid_snapshot",
        `Snapshot ${key} entries must be objects`,
      );
    }
  }
  if (
    !(raw.audiences as unknown[]).every((entry) => typeof entry === "string")
  ) {
    throw new RenderModelError(
      "invalid_snapshot",
      "Snapshot audiences entries must be strings",
    );
  }
  const itemCount = (raw.items as unknown[]).length +
    (raw.allowances as unknown[]).length +
    (raw.tbd as unknown[]).length;
  if (itemCount > MAX_RENDER_ITEMS) {
    throw new RenderModelError(
      "book_too_large",
      `Spec Book exceeds ${MAX_RENDER_ITEMS} entries`,
    );
  }
  return raw as unknown as FrozenSnapshot;
}

export async function buildAudienceRenderModel(
  rawSnapshot: unknown,
  audience: SpecBookAudience,
  context: RevisionRenderContext,
  rawBaseSnapshot?: unknown,
): Promise<AudienceRenderModel> {
  if (!SPEC_BOOK_AUDIENCES.includes(audience)) {
    throw new RenderModelError(
      "invalid_audience",
      `Unsupported audience: ${audience}`,
    );
  }
  const snapshot = parseSnapshot(rawSnapshot);
  if (!snapshot.audiences.includes(audience)) {
    throw new RenderModelError(
      "audience_not_requested",
      `${audience} was not frozen for this issue`,
    );
  }
  const chapters = normalizeChapters(snapshot.chapters);
  const allow = audienceAllowTokens(snapshot.template, audience);
  const sorted = sortedRawItems(snapshot, chapters).filter((item) =>
    itemVisibleToAudience(item, audience)
  );
  const visibleAllowances = snapshot.allowances.filter((item) =>
    itemVisibleToAudience(item, audience)
  );
  const visibleTbd = snapshot.tbd.filter((item) =>
    itemVisibleToAudience(item, audience)
  );
  const issueType = context.issueType ??
    (stringValue(snapshot.issue.type) as SpecBookIssueType | null) ??
    "full";
  if (!["full", "replacement", "addendum"].includes(issueType)) {
    throw new RenderModelError(
      "invalid_issue_type",
      `Unsupported issue type: ${issueType}`,
    );
  }

  let included = sorted;
  let includedAllowances = visibleAllowances;
  let includedTbd = visibleTbd;
  let changes: AddendumChange[] = [];
  if (issueType === "addendum") {
    if (!rawBaseSnapshot) {
      throw new RenderModelError(
        "base_revision_required",
        "Addenda require a frozen base revision",
      );
    }
    const baseSnapshot = parseSnapshot(rawBaseSnapshot);
    const baseChapters = normalizeChapters(baseSnapshot.chapters);
    const baseAllow = audienceAllowTokens(baseSnapshot.template, audience);
    const baseItems = sortedRawItems(baseSnapshot, baseChapters).filter((
      item,
    ) => itemVisibleToAudience(item, audience));
    const baseAllowances = baseSnapshot.allowances.filter((item) =>
      itemVisibleToAudience(item, audience)
    );
    const baseTbd = baseSnapshot.tbd.filter((item) =>
      itemVisibleToAudience(item, audience)
    );
    const currentHash = (item: JsonRecord) =>
      audienceItemHash(item, audience, chapters, allow);
    const baseHash = (item: JsonRecord) =>
      audienceItemHash(item, audience, baseChapters, baseAllow);
    const itemDiff = await diffItems(sorted, baseItems, currentHash, baseHash);
    const allowanceDiff = await diffItems(
      visibleAllowances,
      baseAllowances,
      currentHash,
      baseHash,
    );
    const tbdDiff = await diffItems(
      visibleTbd,
      baseTbd,
      currentHash,
      baseHash,
    );
    included = sorted.filter((item) => itemDiff.includedIds.has(itemId(item)));
    includedAllowances = visibleAllowances.filter((item) =>
      allowanceDiff.includedIds.has(itemId(item))
    );
    includedTbd = visibleTbd.filter((item) =>
      tbdDiff.includedIds.has(itemId(item))
    );
    changes = [
      ...itemDiff.changes,
      ...allowanceDiff.changes,
      ...tbdDiff.changes,
    ]
      .sort((a, b) =>
        (a.documentCode ?? "").localeCompare(b.documentCode ?? "") ||
        a.id.localeCompare(b.id)
      );
  }

  const [items, allowances, tbd] = await Promise.all([
    Promise.all(
      included.map((item) =>
        buildAudienceItem(item, audience, chapters, allow)
      ),
    ),
    Promise.all(
      includedAllowances.map((item) =>
        buildAudienceItem(item, audience, chapters, allow)
      ),
    ),
    Promise.all(
      includedTbd.map((item) =>
        buildAudienceItem(item, audience, chapters, allow)
      ),
    ),
  ]);
  const mediaCount = [...items, ...allowances, ...tbd]
    .reduce((total, item) => total + item.media.length, 0);
  if (mediaCount > MAX_RENDER_MEDIA) {
    throw new RenderModelError(
      "book_too_large",
      `Spec Book exceeds ${MAX_RENDER_MEDIA} media entries`,
    );
  }

  const projectId = stringValue(
    snapshot.project.id ?? snapshot.project.projectId ??
      snapshot.project.project_id,
  );
  if (!projectId) {
    throw new RenderModelError(
      "invalid_snapshot",
      "Snapshot project id is required",
    );
  }

  const templateBranding = isRecord(snapshot.template.branding)
    ? snapshot.template.branding
    : {};
  const templatePage = isRecord(snapshot.template.page)
    ? snapshot.template.page
    : {};
  const layoutSettings = isRecord(snapshot.template.layoutSettings)
    ? snapshot.template.layoutSettings
    : isRecord(snapshot.template.layout_settings)
    ? snapshot.template.layout_settings
    : {};
  const marginInches = numberValue(
    layoutSettings.marginInches ?? layoutSettings.margin_inches,
  );
  const model: AudienceRenderModel = {
    contractVersion: 1,
    audience,
    editionLabel: `${audience[0].toUpperCase()}${audience.slice(1)} Edition`,
    book: {
      id: stringValue(snapshot.book.id),
      title: stringValue(snapshot.book.title) ?? "Specification Book",
    },
    project: {
      id: projectId,
      name: stringValue(snapshot.project.name) ?? "Project",
      clientName: audience === "internal" || audience === "client"
        ? stringValue(
          snapshot.project.clientName ?? snapshot.project.client_name,
        )
        : null,
    },
    template: {
      name: stringValue(snapshot.template.name),
      version: typeof snapshot.template.version === "string" ||
          typeof snapshot.template.version === "number"
        ? snapshot.template.version
        : null,
      branding: {
        studioName: stringValue(
          templateBranding.studioName ?? templateBranding.studio_name ??
            snapshot.book.studioName,
        ),
        logoUrl: stringValue(
          templateBranding.logoUrl ?? templateBranding.logo_url,
        ),
        primaryColor: stringValue(
          templateBranding.primaryColor ?? templateBranding.primary_color,
        ),
        accentColor: stringValue(
          templateBranding.accentColor ?? templateBranding.accent_color,
        ),
      },
      page: {
        size: (
          stringValue(
            templatePage.size ?? layoutSettings.paper ??
              layoutSettings.pageSize,
          ) ?? "LETTER"
        ).toUpperCase(),
        margin: Math.min(
          96,
          Math.max(
            24,
            numberValue(templatePage.margin) ??
              (marginInches === null ? 48 : marginInches * 72),
          ),
        ),
      },
    },
    issue: {
      type: issueType,
      reason: stringValue(snapshot.issue.reason),
      baseRevisionId: stringValue(
        snapshot.issue.baseRevisionId ?? snapshot.issue.base_revision_id,
      ),
      createdAt: context.createdAt,
      revisionNumber: context.revisionNumber,
    },
    chapters,
    items,
    allowances,
    tbd,
    changes,
  };
  assertAudienceModelPrivacy(model);
  return model;
}

export function assertAudienceModelPrivacy(model: AudienceRenderModel): void {
  if (model.audience === "internal") return;
  const scan = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => scan(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const compact = key.toLowerCase().replace(/[-\s]/g, "");
      const layoutMargin = path === "model.template.page" &&
        compact === "margin";
      if (
        !layoutMargin &&
        FORBIDDEN_NON_INTERNAL_KEY_PARTS.some((part) => compact.includes(part))
      ) {
        throw new RenderModelError(
          "privacy_violation",
          `Forbidden field at ${path}.${key}`,
        );
      }
      scan(child, `${path}.${key}`);
    }
  };
  scan(model, "model");
}

export function canonicalClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalClone(entry)) as T;
  }
  if (isRecord(value)) {
    const out: JsonRecord = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalClone(value[key]);
    }
    return out as T;
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalClone(value));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const digestInput = Uint8Array.from(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", digestInput.buffer),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function renderMediaIdentity(media: RenderMedia): string {
  return mediaIdentity(media);
}

export class RenderModelError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RenderModelError";
  }
}
