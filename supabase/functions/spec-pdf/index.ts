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
// Body: { kind: 'item' | 'document' | 'board', proposalId?, projectId?,
//         itemId?, boardId?, visibility?: SpecVisibility }
//   · exactly one of proposalId / projectId is required
//   · kind 'item' additionally requires itemId
//   · kind 'board' additionally requires boardId (a section-grouped tile grid;
//     client price only, never trade — same structural money invariant)
// Returns: 200 application/pdf (attachment), or the JSON error idiom.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildBoardModel,
  buildItemModel,
  buildScheduleModel,
  computeRecordPct,
  fmtDate,
  renderBoardPdf,
  renderSpecItemPdf,
  renderSpecSchedulePdf,
  type SpecBoardModel,
  type SpecBoardTileInput,
  type SpecItemInput,
  type SpecItemModel,
  type SpecLineInput,
  type SpecScheduleModel,
  type SpecVisibility,
} from '../_shared/spec-pdf.ts';

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

// ─── Body parsing ────────────────────────────────────────────────────────────

interface SpecPdfPayload {
  kind: 'item' | 'document' | 'board';
  proposalId: string | null;
  projectId: string | null;
  itemId: string | null;
  boardId: string | null;
  visibility: SpecVisibility;
}

function parseBody(
  raw: unknown,
): { ok: true; payload: SpecPdfPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_body' };
  const b = raw as Record<string, unknown>;

  const kind = b.kind;
  if (kind !== 'item' && kind !== 'document' && kind !== 'board') {
    return { ok: false, error: 'invalid_kind' };
  }

  const proposalId = typeof b.proposalId === 'string' && b.proposalId ? b.proposalId : null;
  const projectId = typeof b.projectId === 'string' && b.projectId ? b.projectId : null;
  // EXACTLY one owner.
  if ((proposalId && projectId) || (!proposalId && !projectId)) {
    return { ok: false, error: 'exactly_one_owner_required' };
  }

  const itemId = typeof b.itemId === 'string' && b.itemId ? b.itemId : null;
  if (kind === 'item' && !itemId) return { ok: false, error: 'item_id_required' };

  const boardId = typeof b.boardId === 'string' && b.boardId ? b.boardId : null;
  if (kind === 'board' && !boardId) return { ok: false, error: 'board_id_required' };

  const visibility =
    b.visibility && typeof b.visibility === 'object'
      ? (b.visibility as SpecVisibility)
      : {};

  return { ok: true, payload: { kind, proposalId, projectId, itemId, boardId, visibility } };
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
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
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
      header: { studioName: string; projectName: string; title: string };
      filename: string;
    }
  | { kind: 'item'; model: SpecItemModel; filename: string }
  | {
      kind: 'board';
      model: SpecBoardModel;
      header: { studioName: string; projectName: string };
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
  const parsed = parseBody(rawBody);
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
      if (!owner || owner.designer_id !== caller.id) {
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
      if (!owner || owner.designer_id !== caller.id) {
        return json({ error: 'not_found' }, 404);
      }
      ownerId = owner.id;
      ownerName = (owner.name as string | null)?.trim() || 'Project';
      designerId = owner.designer_id;
    }

    // ── Studio name (header) — designer profile ────────────────────────────
    const { data: designerProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', designerId)
      .maybeSingle();
    const studioName = (designerProfile as any)?.full_name?.trim() || 'Patina Designer';

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
        .order('z_index', { ascending: true, referencedTable: 'proposal_board_items' })
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

      const tiles: SpecBoardTileInput[] = ((board.proposal_board_items ?? []) as any[]).map((it) => {
        const data = (it.data ?? {}) as Record<string, any>;
        const swatches = Array.isArray(data.swatches)
          ? (data.swatches as any[]).map((sw) => String(sw?.hex ?? sw ?? '')).filter(Boolean)
          : [];
        return {
          type: String(it.type),
          name: typeof data.name === 'string' ? data.name : null,
          imageUrl: it.image_url ?? (typeof data.image_url === 'string' ? data.image_url : null),
          note: it.content ?? null,
          swatches,
          priceCents: typeof data.price_cents === 'number' ? data.price_cents : null,
          sectionId: typeof data.section_id === 'string' ? data.section_id : null,
        };
      });

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
        header: { studioName, projectName: ownerName },
        filename: `board-${slug((board.name as string) || (board.id as string))}.pdf`,
      };
    } else {
    // ── spec_field_defs (custom schedule columns), ordered ─────────────────
    const { data: defsData, error: defsError } = await admin
      .from('spec_field_defs')
      .select('field_key, name, sort_order')
      .eq(isProposal ? 'proposal_id' : 'project_id', ownerId)
      .order('sort_order', { ascending: true });
    if (defsError) throw defsError;
    const defs = (defsData ?? []) as { field_key: string; name: string; sort_order: number }[];

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
    const productIds = [...new Set(items.map((n) => n.productId).filter(Boolean))] as string[];
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
        styleCounts.set(s.product_id, (styleCounts.get(s.product_id) ?? 0) + 1);
      }
    }

    const recordPctFor = (productId: string | null): number | null =>
      productId
        ? computeRecordPct(products.get(productId) ?? null, styleCounts.get(productId) ?? 0)
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
        header: { studioName, projectName: ownerName, title: 'Specification' },
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
        capturedBy =
          (capProfile as any)?.full_name?.trim() || (capProfile as any)?.email || null;
      }

      // specs = the line's description (pre-sale) or the product's, + notes.
      const description = item.description ?? product?.description ?? null;
      const specs =
        [description, item.notes]
          .filter((s) => s != null && String(s).trim() !== '')
          .join('\n\n') || null;

      const input: SpecItemInput = {
        studioName,
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
    pdfBytes =
      prepared.kind === 'document'
        ? await renderSpecSchedulePdf(prepared.model, prepared.header)
        : prepared.kind === 'board'
          ? await renderBoardPdf(prepared.model, prepared.header)
          : await renderSpecItemPdf(prepared.model);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('spec-pdf: PDF render failed', detail);
    return json({ error: 'render_failed', detail }, 500);
  }

  return new Response(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${prepared.filename}"`,
    },
  });
});
