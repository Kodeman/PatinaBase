import type { BoardsBlockBoard } from '@patina/design-system';
import type { ShareVisibility } from '@patina/utils';

type UnknownRecord = Record<string, unknown>;

/**
 * Explicit service-role projections for the unauthenticated share surface.
 * Keep these allowlists beside the serializer: a wildcard here would move every
 * selected column across the React Server Component boundary.
 */
export const GUEST_PROPOSAL_SELECT =
  'title,created_at,total_amount,version,client:profiles!client_id(full_name),items:proposal_items(name,image_url,quantity,line_total_cents,vendor_name,item_type,lead_time_weeks,position,client_product_snapshot)';
export const GUEST_SECTION_SELECT = 'title,type,body,metadata';
export const GUEST_PAYMENT_MILESTONE_SELECT =
  'label,percentage,amount_cents,trigger_condition';
export const GUEST_PHASE_SELECT = 'name,duration_weeks';
export const GUEST_EXCLUSION_SELECT = 'description,category';
export const GUEST_SCOPE_ROOM_SELECT = 'name,room_type,budget_cents';
export const GUEST_SCOPE_ROOM_PRIVATE_SELECT = 'name,room_type';
export const GUEST_BOARD_SELECT =
  'name,canvas_width,canvas_height,background_color,proposal_board_items(type,x,y,width,height,z_index,rotation,image_url,content,data)';

export interface GuestProposalDocumentItem {
  id: string;
  name: string;
  image_url: string | null;
  quantity: number;
  item_type?: string;
  line_total_cents?: number;
  vendor_name?: string | null;
  lead_time_weeks?: number | null;
  product?: {
    id: string;
    name: string;
    images: string[] | null;
    brand?: string | null;
    source_url?: string | null;
    /** Prevents client code from inferring completeness from omitted raw fields. */
    record_completeness_hidden: true;
  };
}

export interface GuestProposalDocumentBundle {
  proposal: {
    id: 'shared-proposal';
    designer_id: 'shared-studio';
    status: 'sent';
    title: string;
    created_at: string;
    total_amount: number;
    version: number;
    client_visibility_tier: null;
    client: { full_name: string | null } | null;
    items: GuestProposalDocumentItem[];
  };
  sections: Array<{
    id: string;
    title: string;
    type: string;
    body: string | null;
    metadata: Record<string, unknown>;
  }>;
  paymentMilestones: Array<{
    label: string;
    percentage: number | null;
    amount_cents: number | null;
    trigger_condition: string | null;
  }>;
  phases: Array<{ name: string; duration_weeks: number | null }>;
  exclusions: Array<{ description: string; category: string | null }>;
  scopeRooms: Array<{
    name: string;
    room_type: string | null;
    budget_cents?: number | null;
  }>;
  resolvedBoards: BoardsBlockBoard[];
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function sanitizeSectionMetadata(type: string, value: unknown): Record<string, unknown> {
  const source = record(value);

  if (type === 'concept') {
    const moodBoardUrls = stringArray(source.mood_board_urls) ?? [];
    const colorPalette = records(source.color_palette)
      .map((swatch) => nullableText(swatch.hex))
      .filter((hex): hex is string => hex !== null)
      .map((hex) => ({ hex }));
    return {
      ...(moodBoardUrls.length > 0 ? { mood_board_urls: moodBoardUrls } : {}),
      ...(colorPalette.length > 0 ? { color_palette: colorPalette } : {}),
    };
  }

  if (type === 'space_plan') {
    const floorPlanUrl = nullableText(source.floor_plan_url);
    return floorPlanUrl ? { floor_plan_url: floorPlanUrl } : {};
  }

  return {};
}

function sanitizeGuestProduct(
  value: unknown,
  visibility: ShareVisibility,
  index: number,
): GuestProposalDocumentItem['product'] | undefined {
  const snapshot = record(value);
  const name = nullableText(snapshot.name);
  const images = stringArray(snapshot.images);
  const brand = visibility.supplierIdentity ? nullableText(snapshot.brand) : null;
  const sourceUrl = visibility.sourceUrls ? nullableText(snapshot.source_url) : null;

  if (!name && !images?.length && !brand && !sourceUrl) return undefined;

  return {
    id: `shared-product-${index}`,
    name: name ?? '',
    images,
    ...(visibility.supplierIdentity ? { brand } : {}),
    ...(visibility.sourceUrls ? { source_url: sourceUrl } : {}),
    record_completeness_hidden: true,
  };
}

function sanitizeBoardData(
  type: string,
  value: unknown,
  visibility: ShareVisibility,
): Record<string, unknown> | undefined {
  const source = record(value);

  if (type === 'product' || type === 'capture') {
    const name = nullableText(source.name);
    const imageUrl = nullableText(source.image_url);
    const priceCents = visibility.pricing ? nullableNumber(source.price_cents) : null;
    const vendorName = visibility.supplierIdentity
      ? nullableText(source.vendor_name)
      : null;
    const leadTimeWeeks = visibility.leadTimes
      ? nullableNumber(source.lead_time_weeks)
      : null;
    const sourceUrl = visibility.sourceUrls ? nullableText(source.source_url) : null;

    return {
      ...(name ? { name } : {}),
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(visibility.pricing && priceCents !== null ? { price_cents: priceCents } : {}),
      ...(visibility.supplierIdentity && vendorName ? { vendor_name: vendorName } : {}),
      ...(visibility.leadTimes && leadTimeWeeks !== null
        ? { lead_time_weeks: leadTimeWeeks }
        : {}),
      ...(visibility.sourceUrls && sourceUrl ? { source_url: sourceUrl } : {}),
    };
  }

  if (type === 'room_scan') {
    const name = nullableText(source.name);
    const roomType = nullableText(source.room_type);
    return {
      ...(name ? { name } : {}),
      ...(roomType ? { room_type: roomType } : {}),
    };
  }

  if (type === 'palette') {
    const name = nullableText(source.name);
    const swatches = records(source.swatches)
      .map((swatch) => {
        const hex = nullableText(swatch.hex);
        if (!hex) return null;
        const swatchName = nullableText(swatch.name);
        const role = nullableText(swatch.role);
        return {
          hex,
          ...(swatchName ? { name: swatchName } : {}),
          ...(role ? { role } : {}),
        };
      })
      .filter((swatch): swatch is NonNullable<typeof swatch> => swatch !== null);
    return {
      ...(name ? { name } : {}),
      ...(swatches.length > 0 ? { swatches } : {}),
    };
  }

  return undefined;
}

function sanitizeBoards(
  boardRows: unknown,
  visibility: ShareVisibility,
): BoardsBlockBoard[] {
  if (!visibility.itemDetails) return [];

  return records(boardRows).map((board, boardIndex) => {
    const items = records(board.proposal_board_items)
      .map((item, itemIndex) => {
        const type = text(item.type);
        if (!['product', 'capture', 'image', 'room_scan', 'palette', 'note'].includes(type)) {
          return null;
        }

        const data = sanitizeBoardData(type, item.data, visibility);
        return {
          id: `shared-board-${boardIndex}-item-${itemIndex}`,
          type,
          x: typeof item.x === 'string' ? item.x : number(item.x),
          y: typeof item.y === 'string' ? item.y : number(item.y),
          width: typeof item.width === 'string' ? item.width : number(item.width),
          height:
            item.height === null
              ? null
              : typeof item.height === 'string'
                ? item.height
                : number(item.height),
          z_index: nullableNumber(item.z_index),
          rotation:
            typeof item.rotation === 'string' ? item.rotation : nullableNumber(item.rotation),
          image_url: nullableText(item.image_url),
          content: type === 'note' ? nullableText(item.content) : null,
          ...(data ? { data } : {}),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      id: `shared-board-${boardIndex}`,
      name: text(board.name, 'Board'),
      canvas_width: number(board.canvas_width, 1200),
      canvas_height: number(board.canvas_height, 800),
      background_color: text(board.background_color, '#ffffff'),
      items,
    };
  });
}

/**
 * Converts privileged database rows into the only object allowed to cross the
 * guest server-to-client boundary. Every returned key is intentional, and
 * visibility-disabled values are absent rather than merely hidden by CSS.
 */
export function buildGuestProposalDocumentBundle({
  proposal: proposalValue,
  sections: sectionRows,
  paymentMilestones: paymentRows,
  phases: phaseRows,
  exclusions: exclusionRows,
  scopeRooms: scopeRoomRows,
  boards: boardRows,
  visibility,
}: {
  proposal: unknown;
  sections: unknown;
  paymentMilestones: unknown;
  phases: unknown;
  exclusions: unknown;
  scopeRooms: unknown;
  boards: unknown;
  visibility: ShareVisibility;
}): GuestProposalDocumentBundle {
  const proposal = record(proposalValue);
  const client = record(proposal.client);
  const fullName = nullableText(client.full_name);

  const items: GuestProposalDocumentItem[] = visibility.itemDetails
    ? records(proposal.items)
        .filter((item) => item.item_type !== 'tbd')
        .sort((left, right) => number(left.position) - number(right.position))
        .map((item, index) => {
          const snapshot = record(item.client_product_snapshot);
          const snapshotBrand = nullableText(snapshot.brand);
          const vendorName = nullableText(item.vendor_name) ?? snapshotBrand;
          const product = sanitizeGuestProduct(snapshot, visibility, index);

          return {
            id: `shared-item-${index}`,
            name: text(item.name, text(snapshot.name, 'Item')),
            image_url: nullableText(item.image_url),
            quantity: number(item.quantity, 1),
            ...(typeof item.item_type === 'string' ? { item_type: item.item_type } : {}),
            ...(visibility.pricing
              ? { line_total_cents: number(item.line_total_cents) }
              : {}),
            ...(visibility.supplierIdentity ? { vendor_name: vendorName } : {}),
            ...(visibility.leadTimes
              ? { lead_time_weeks: nullableNumber(item.lead_time_weeks) }
              : {}),
            ...(product ? { product } : {}),
          };
        })
    : [];

  const sections = records(sectionRows).map((section, index) => {
    const type = text(section.type);
    const body = type === 'investment' || type === 'timeline' ? null : nullableText(section.body);
    return {
      id: `shared-section-${index}`,
      title: text(section.title),
      type,
      body,
      metadata: sanitizeSectionMetadata(type, section.metadata),
    };
  });

  return {
    proposal: {
      id: 'shared-proposal',
      designer_id: 'shared-studio',
      status: 'sent',
      title: text(proposal.title, 'Proposal'),
      created_at: text(proposal.created_at, new Date(0).toISOString()),
      total_amount: number(proposal.total_amount),
      version: number(proposal.version, 1),
      client_visibility_tier: null,
      client: fullName ? { full_name: fullName } : null,
      items,
    },
    sections,
    paymentMilestones: visibility.paymentSchedule
      ? records(paymentRows).map((milestone) => ({
          label: text(milestone.label),
          percentage: nullableNumber(milestone.percentage),
          amount_cents: nullableNumber(milestone.amount_cents),
          trigger_condition: nullableText(milestone.trigger_condition),
        }))
      : [],
    phases: records(phaseRows).map((phase) => ({
      name: text(phase.name),
      duration_weeks: nullableNumber(phase.duration_weeks),
    })),
    exclusions: records(exclusionRows).map((exclusion) => ({
      description: text(exclusion.description),
      category: nullableText(exclusion.category),
    })),
    scopeRooms: records(scopeRoomRows).map((room) => ({
      name: text(room.name),
      room_type: nullableText(room.room_type),
      ...(visibility.roomBudgets
        ? { budget_cents: nullableNumber(room.budget_cents) }
        : {}),
    })),
    resolvedBoards: sanitizeBoards(boardRows, visibility),
  };
}
