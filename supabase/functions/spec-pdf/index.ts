// Supabase Edge Function: spec-pdf
//
// Schedule & Boards Wave 2 (S6). Renders specification-sheet PDFs — either a
// single-item Specification sheet or a whole-project Specification schedule —
// from a proposal (pre-sale) or a project (post-sale). CLIENT-facing money
// only: trade price, markup, and margin are never loaded into the render model
// (the model types in _shared/spec-pdf.ts have no field for them), so a share
// can't leak the studio's cost basis.
//
// Auth mirrors po-send: the caller is resolved from the Authorization header
// (a service-role client carrying the caller's JWT → auth.getUser), and a
// separate service-role `admin` client does the loads. Not-found and not-owned
// BOTH collapse to a 404 so foreign proposal/project/item ids aren't confirmed.
//
// Body: { kind: 'item' | 'document' | 'board' | 'board-composition', proposalId?, projectId?,
//         itemId?, boardId?, visibility?: SpecVisibility }
//   · exactly one of proposalId / projectId is required
//   · kind 'item' additionally requires itemId
//   · kind 'board' additionally requires boardId (a section-grouped tile grid;
//     client price only, never trade — same structural money invariant)
//   · kind 'board-composition' requires boardId and renders persisted geometry
//     on one landscape Letter page; like every PDF kind it is exact-owner-only
// Returns: 200 application/pdf (attachment), or the JSON error idiom.

// deno-lint-ignore-file no-explicit-any no-import-prefix

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildBoardCompositionModel,
  buildBoardModel,
  buildItemModel,
  buildScheduleModel,
  computeRecordPct,
  fmtDate,
  renderBoardCompositionPdf,
  renderBoardPdf,
  renderSpecItemPdf,
  renderSpecSchedulePdf,
  type SpecBoardCompositionModel,
  type SpecBoardCompositionPinInput,
  type SpecBoardModel,
  type SpecBoardTileInput,
  type SpecItemInput,
  type SpecItemModel,
  type SpecLineInput,
  type SpecScheduleModel,
  type SpecVisibility,
} from '../_shared/spec-pdf.ts';
import { resolveStudioIdentity, studioDisplayName } from '../_shared/studio-identity.ts';
import { canCallerUseOwner, ownedBoardOrNull, parseSpecPdfBody } from './core.ts';
import { hydrateCompositionImages } from './image-loader.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Resolve the caller from the Authorization header (po-send idiom). */
async function getCallerUser(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

// ─── Normalization helpers ───────────────────────────────────────────────────

/** Pre-sale lead bucket from lead_time_weeks (kept intentionally simple). */
function leadBucketLabel(weeks: number | null): string | null {
  if (weeks == null) return null;
  if (weeks <= 0) return 'In stock';
  if (weeks <= 4) return '2–4 wks';
  if (weeks <= 8) return '6–8 wks';
  if (weeks <= 12) return '10–12 wks';
  if (weeks <= 16) return '14–16 wks';
  if (weeks <= 24) return '20–24 wks';
  return `${weeks} wks`;
}

function normItemType(v: unknown): 'fixed' | 'allowance' | 'tbd' {
  return v === 'allowance' || v === 'tbd' ? v : 'fixed';
}

/** A single line normalized to one shape regardless of pre/post-sale source. */
interface NormItem {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  quantity: number;
  leadLabel: string | null;
  clientUnitCents: number | null;
  lineTotalCents: number | null;
  supplierName: string | null;
  itemType: 'fixed' | 'allowance' | 'tbd';
  productId: string | null;
  customFields: Record<string, unknown> | null;
  description: string | null; // item-level (pre-sale only)
  notes: string | null;
  roomName: string | null;
  roomSort: number;
  itemSort: number;
}

/** Map spec_field_defs (ordered) + a line's custom_fields → non-empty rows. */
function mapCustomFields(
  defs: { field_key: string; name: string }[],
  values: Record<string, unknown> | null,
): { label: string; value: string }[] {
  const cf = values ?? {};
  const out: { label: string; value: string }[] = [];
  for (const def of defs) {
    const raw = cf[def.field_key];
    if (raw == null) continue;
    const value = String(raw);
    if (value.trim() === '') continue;
    out.push({ label: def.name, value });
  }
  return out;
}

/** Group normalized lines into room sections; no-room lines → 'Unassigned' LAST. */
function groupSections(
  items: NormItem[],
  toLine: (n: NormItem) => SpecLineInput,
): { roomName: string; lines: SpecLineInput[] }[] {
  const UNASSIGNED = 'Unassigned';
  const buckets = new Map<string, { sortOrder: number; items: NormItem[] }>();
  for (const n of items) {
    const key = n.roomName ?? UNASSIGNED;
    if (!buckets.has(key)) {
      buckets.set(key, {
        sortOrder: n.roomName ? n.roomSort : Number.POSITIVE_INFINITY,
        items: [],
      });
    }
    buckets.get(key)!.items.push(n);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([roomName, b]) => ({
      roomName,
      lines: b.items.sort((x, y) => x.itemSort - y.itemSort).map(toLine),
    }));
}

/** Filename-safe fragment for the doc_code / item id path segment. */
function safeFilePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
    'document';
}

/** Lowercase dashed slug for the owner-name filename fragment. */
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document'
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

type Prepared =
  | {
    kind: 'document';
    model: SpecScheduleModel;
    header: {
      studioName: string;
      projectName: string;
      title: string;
      studioLogoUrl?: string;
    };
    filename: string;
  }
  | { kind: 'item'; model: SpecItemModel; filename: string }
  | {
    kind: 'board';
    model: SpecBoardModel;
    header: { studioName: string; projectName: string; studioLogoUrl?: string };
    filename: string;
  }
  | {
    kind: 'board-composition';
    model: SpecBoardCompositionModel;
    filename: string;
  };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const parsed = parseSpecPdfBody(rawBody);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  const { kind, proposalId, projectId, itemId, boardId, visibility } = parsed.payload;

  const caller = await getCallerUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const isProposal = proposalId != null;

  let prepared: Prepared;
  try {
    // ── Owner: proposal (pre-sale) or project (post-sale) ──────────────────
    // 404-collapse: missing OR not-owned both return the same not_found.
    let ownerId: string;
    let ownerName: string;
    let designerId: string;
    if (isProposal) {
      const { data, error } = await admin
        .from('proposals')
        .select('id, designer_id, title')
        .eq('id', proposalId!)
        .maybeSingle();
      if (error) throw error;
      const owner = data as any;
      if (!owner) {
        return json({ error: 'not_found' }, 404);
      }
      ownerId = owner.id;
      ownerName = (owner.title as string | null)?.trim() || 'Proposal';
      designerId = owner.designer_id;
    } else {
      const { data, error } = await admin
        .from('projects')
        .select('id, designer_id, name')
        .eq('id', projectId!)
        .maybeSingle();
      if (error) throw error;
      const owner = data as any;
      if (!owner) {
        return json({ error: 'not_found' }, 404);
      }
      ownerId = owner.id;
      ownerName = (owner.name as string | null)?.trim() || 'Project';
      designerId = owner.designer_id;
    }

    if (!canCallerUseOwner(kind, caller.id, designerId)) {
      return json({ error: 'not_found' }, 404);
    }

    // ── Studio identity (header) — canonical resolver (Designer Studios) ────
    // Post-sale docs have a project (projectId path is deterministic for
    // multi-studio designers); pre-sale proposals have no project yet →
    // designerId path. The designer profile stays the name fallback for the
    // degenerate case (resolver returned no name). logoUrl is non-null only for
    // a real studio org → no logo renders exactly as before.
    const { data: designerProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', designerId)
      .maybeSingle();
    const identity = await resolveStudioIdentity(
      admin,
      isProposal ? { designerId } : { projectId: ownerId },
    );
    const studioName = studioDisplayName(
      identity,
      (designerProfile as any)?.full_name?.trim() || 'Patina Designer',
    );
    const studioLogoUrl = identity?.logoUrl ?? undefined;

    if (kind === 'board') {
      // ── Board export (B3) — the board must belong to the owner (404-collapse).
      // A section-grouped tile grid. Client price rides only on product/capture
      // pins under `pricing`; a board snapshot never carries a trade cost, so
      // the money-never-trade invariant holds structurally.
      const { data: boardRow, error: boardErr } = await admin
        .from('proposal_boards')
        .select(
          'id, name, sections, proposal_id, project_id, proposal_board_items(id, type, image_url, content, data, z_index)',
        )
        .eq('id', boardId!)
        .order('z_index', {
          ascending: true,
          referencedTable: 'proposal_board_items',
        })
        .maybeSingle();
      if (boardErr) throw boardErr;
      const board = boardRow as any;
      const boardOwnerId = isProposal ? board?.proposal_id : board?.project_id;
      if (!board || boardOwnerId !== ownerId) {
        return json({ error: 'not_found' }, 404);
      }

      const sections = ((board.sections ?? []) as any[])
        .filter((s) => s && s.id != null)
        .map((s) => ({ id: String(s.id), name: String(s.name ?? 'Section') }));

      const tiles: SpecBoardTileInput[] = ((board.proposal_board_items ?? []) as any[]).map(
        (it) => {
          const data = (it.data ?? {}) as Record<string, any>;
          const swatches = Array.isArray(data.swatches)
            ? (data.swatches as any[]).map((sw) => String(sw?.hex ?? sw ?? ''))
              .filter(Boolean)
            : [];
          return {
            type: String(it.type),
            name: typeof data.name === 'string' ? data.name : null,
            imageUrl: it.image_url ??
              (typeof data.image_url === 'string' ? data.image_url : null),
            note: it.content ?? null,
            swatches,
            priceCents: typeof data.price_cents === 'number' ? data.price_cents : null,
            sectionId: typeof data.section_id === 'string' ? data.section_id : null,
          };
        },
      );

      const model = buildBoardModel(
        {
          studioName,
          projectName: ownerName,
          boardName: (board.name as string)?.trim() || 'Board',
          sections,
          tiles,
        },
        visibility,
      );
      prepared = {
        kind: 'board',
        model,
        header: { studioName, projectName: ownerName, studioLogoUrl },
        filename: `board-${slug((board.name as string) || (board.id as string))}.pdf`,
      };
    } else if (kind === 'board-composition') {
      const { data: boardRow, error: boardError } = await admin
        .from('proposal_boards')
        .select(
          'id, name, sections, proposal_id, project_id, canvas_width, canvas_height, background_color, proposal_board_items(id, type, x, y, width, height, z_index, rotation, image_url, content, data)',
        )
        .eq('id', boardId!)
        .order('z_index', {
          ascending: true,
          referencedTable: 'proposal_board_items',
        })
        .maybeSingle();
      if (boardError) throw boardError;
      const board = ownedBoardOrNull(boardRow as any, ownerId, isProposal);
      if (!board) return json({ error: 'not_found' }, 404);

      const imageSources = ((board.proposal_board_items ?? []) as any[]).map(
        (item) => {
          const data = (item.data ?? {}) as Record<string, any>;
          return {
            item,
            data,
            imageUrl: item.image_url ??
              (typeof data.image_url === 'string' ? data.image_url : null) ??
              (typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null) ??
              (typeof data.original_image_url === 'string' ? data.original_image_url : null),
          };
        },
      );
      const hydrated = await hydrateCompositionImages(imageSources);
      const pins: SpecBoardCompositionPinInput[] = hydrated.map(
        ({ item, data, imageDataUrl, imageRequested }) => ({
          id: typeof item.id === 'string' ? item.id : undefined,
          type: item.type,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          resolvedHeight: data.resolved_height ?? null,
          zIndex: item.z_index,
          rotation: item.rotation,
          imageDataUrl,
          imageRequested,
          name: typeof data.name === 'string' ? data.name : null,
          vendorName: typeof data.vendor_name === 'string' ? data.vendor_name : null,
          note: typeof item.content === 'string' ? item.content : null,
          swatches: Array.isArray(data.swatches)
            ? data.swatches.map((swatch: any) => String(swatch?.hex ?? swatch ?? '')).filter(
              Boolean,
            )
            : [],
          priceCents: typeof data.price_cents === 'number' ? data.price_cents : null,
          sectionId: typeof data.section_id === 'string' ? data.section_id : null,
        }),
      );
      const sections = ((board.sections ?? []) as any[])
        .filter((section) => section && section.id != null)
        .map((section) => ({
          id: String(section.id),
          name: String(section.name ?? 'Section'),
          color: typeof section.color === 'string' ? section.color : null,
        }));
      const model = buildBoardCompositionModel(
        {
          studioName,
          projectName: ownerName,
          boardName: (board.name as string)?.trim() || 'Board',
          canvasWidth: board.canvas_width,
          canvasHeight: board.canvas_height,
          backgroundColor: board.background_color,
          sections,
          pins,
        },
        visibility as SpecVisibility,
      );
      prepared = {
        kind: 'board-composition',
        model,
        filename: `board-composition-${slug((board.name as string) || (board.id as string))}.pdf`,
      };
    } else {
      // ── spec_field_defs (custom schedule columns), ordered ─────────────────
      const { data: defsData, error: defsError } = await admin
        .from('spec_field_defs')
        .select('field_key, name, sort_order')
        .eq(isProposal ? 'proposal_id' : 'project_id', ownerId)
        .order('sort_order', { ascending: true });
      if (defsError) throw defsError;
      const defs = (defsData ?? []) as {
        field_key: string;
        name: string;
        sort_order: number;
      }[];

      // ── Line items → normalized shape ──────────────────────────────────────
      let items: NormItem[];
      if (isProposal) {
        const { data, error } = await admin
          .from('proposal_items')
          .select(
            `
          id, name, doc_code, ffe_category, scope_room_id, quantity,
          unit_sell_price, line_total_cents, lead_time_weeks, custom_fields,
          product_id, vendor_name, item_type, position, notes, description,
          room:proposal_scope_rooms!scope_room_id(name, sort_order)
        `,
          )
          .eq('proposal_id', ownerId)
          .order('position', { ascending: true });
        if (error) throw error;
        items = ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          code: r.doc_code ?? null,
          name: r.name,
          category: r.ffe_category ?? null,
          quantity: r.quantity ?? 1,
          leadLabel: leadBucketLabel(r.lead_time_weeks ?? null),
          clientUnitCents: r.unit_sell_price ?? null,
          lineTotalCents: r.line_total_cents ?? null,
          supplierName: r.vendor_name ?? null,
          itemType: normItemType(r.item_type),
          productId: r.product_id ?? null,
          customFields: r.custom_fields ?? null,
          description: r.description ?? null,
          notes: r.notes ?? null,
          roomName: r.room?.name ?? null,
          roomSort: r.room?.sort_order ?? Number.POSITIVE_INFINITY,
          itemSort: r.position ?? 0,
        }));
      } else {
        const { data, error } = await admin
          .from('project_ffe_items')
          .select(
            `
          id, name, doc_code, ffe_category, project_room_id, quantity,
          unit_price_cents, line_total_cents, custom_fields, product_id,
          vendor_name, item_type, eta, sort_order, notes,
          room:project_rooms!project_room_id(name, sort_order)
        `,
          )
          .eq('project_id', ownerId)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        items = ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          code: r.doc_code ?? null,
          name: r.name,
          category: r.ffe_category ?? null,
          quantity: r.quantity ?? 1,
          leadLabel: r.eta ? fmtDate(r.eta) : null,
          clientUnitCents: r.unit_price_cents ?? null,
          lineTotalCents: r.line_total_cents ?? null,
          supplierName: r.vendor_name ?? null,
          itemType: normItemType(r.item_type),
          productId: r.product_id ?? null,
          customFields: r.custom_fields ?? null,
          description: null,
          notes: r.notes ?? null,
          roomName: r.room?.name ?? null,
          roomSort: r.room?.sort_order ?? Number.POSITIVE_INFINITY,
          itemSort: r.sort_order ?? 0,
        }));
      }

      // ── Products + teaching counts (for record-completeness / verified) ────
      const productIds = [
        ...new Set(items.map((n) => n.productId).filter(Boolean)),
      ] as string[];
      const products = new Map<string, any>();
      const styleCounts = new Map<string, number>();
      if (productIds.length > 0) {
        const { data: prodData, error: prodError } = await admin
          .from('products')
          .select(
            'id, name, description, brand, dimensions, materials, price_retail, price_trade, images, source_url, captured_by',
          )
          .in('id', productIds);
        if (prodError) throw prodError;
        for (const p of (prodData ?? []) as any[]) products.set(p.id, p);

        const { data: styleData, error: styleError } = await admin
          .from('product_styles')
          .select('product_id')
          .in('product_id', productIds);
        if (styleError) throw styleError;
        for (const s of (styleData ?? []) as any[]) {
          styleCounts.set(
            s.product_id,
            (styleCounts.get(s.product_id) ?? 0) + 1,
          );
        }
      }

      const recordPctFor = (productId: string | null): number | null =>
        productId
          ? computeRecordPct(
            products.get(productId) ?? null,
            styleCounts.get(productId) ?? 0,
          )
          : null;

      if (kind === 'document') {
        const toLine = (n: NormItem): SpecLineInput => ({
          code: n.code,
          name: n.name,
          quantity: n.quantity,
          leadLabel: n.leadLabel,
          clientUnitCents: n.clientUnitCents,
          lineTotalCents: n.lineTotalCents,
          supplierName: n.supplierName,
          itemType: n.itemType,
          recordVerified: recordPctFor(n.productId) === 100,
        });
        const sections = groupSections(items, toLine);
        const model = buildScheduleModel(sections, visibility);
        prepared = {
          kind: 'document',
          model,
          header: {
            studioName,
            projectName: ownerName,
            title: 'Specification',
            studioLogoUrl,
          },
          filename: `schedule-${slug(ownerName || ownerId)}.pdf`,
        };
      } else {
        // ── Single item — must belong to the owner (else 404-collapse) ───────
        const item = items.find((n) => n.id === itemId);
        if (!item) {
          return json({ error: 'not_found' }, 404);
        }
        const product = item.productId ? products.get(item.productId) ?? null : null;

        // Resolve captured_by → a display name.
        let capturedBy: string | null = null;
        if (product?.captured_by) {
          const { data: capProfile } = await admin
            .from('profiles')
            .select('full_name, email')
            .eq('id', product.captured_by)
            .maybeSingle();
          capturedBy = (capProfile as any)?.full_name?.trim() ||
            (capProfile as any)?.email || null;
        }

        // specs = the line's description (pre-sale) or the product's, + notes.
        const description = item.description ?? product?.description ?? null;
        const specs = [description, item.notes]
          .filter((s) => s != null && String(s).trim() !== '')
          .join('\n\n') || null;

        const input: SpecItemInput = {
          studioName,
          studioLogoUrl,
          projectName: ownerName,
          name: item.name,
          code: item.code,
          category: item.category,
          roomName: item.roomName,
          quantity: item.quantity,
          leadLabel: item.leadLabel,
          itemType: item.itemType,
          specs,
          customFields: mapCustomFields(defs, item.customFields),
          sourceUrl: product?.source_url ?? null,
          capturedBy,
          recordPct: recordPctFor(item.productId),
          brand: product?.brand ?? null,
          imageUrls: (product?.images ?? []) as string[],
          clientUnitCents: item.clientUnitCents,
        };
        const model = buildItemModel(input, visibility);
        prepared = {
          kind: 'item',
          model,
          filename: `spec-${safeFilePart(item.code || itemId!)}.pdf`,
        };
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('spec-pdf: lookup failed', detail);
    return json({ error: 'lookup_failed', detail }, 500);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = prepared.kind === 'document'
      ? await renderSpecSchedulePdf(prepared.model, prepared.header)
      : prepared.kind === 'board'
      ? await renderBoardPdf(prepared.model, prepared.header)
      : prepared.kind === 'board-composition'
      ? await renderBoardCompositionPdf(prepared.model)
      : await renderSpecItemPdf(prepared.model);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('spec-pdf: PDF render failed', detail);
    return json({ error: 'render_failed', detail }, 500);
  }

  const responseHeaders: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${prepared.filename}"`,
  };
  if (prepared.kind === 'board-composition') {
    responseHeaders['Access-Control-Expose-Headers'] =
      'X-Patina-Pdf-Warnings, X-Patina-Pdf-Warning-Metadata';
    responseHeaders['X-Patina-Pdf-Warnings'] = prepared.model.warnings.join(',') || 'none';
    responseHeaders['X-Patina-Pdf-Warning-Metadata'] = encodeURIComponent(
      JSON.stringify(prepared.model.warningMetadata),
    );
  }
  return new Response(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: responseHeaders,
  });
});
