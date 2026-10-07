import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';
import { lineMaker, type LineMakerSource } from '@/lib/document/install-reading';

/**
 * /api/document/ask-maker-date — "Ask the maker for a date" (US-19 D6, R37).
 *
 * POST holds ONE `procurement_drafts` row (kind `maker_eta_request`) in
 * `awaiting_review` and stops there. It lands on the line's PO, where the
 * PO's DraftReview and the Desk's drafts list already read procurement drafts,
 * and a studio member sends or discards it there through
 * `procurement-draft-send`. Nothing is emailed and nothing reaches the maker
 * from here (AGENTS.md: drafts land `awaiting_review`).
 *
 * Access is proven through the caller's OWN RLS: the line is read back through
 * the caller's session client (`project_ffe_items` reads under
 * `can_buy_for_project`), and a caller who cannot read it is refused. The
 * existing notes are read the same way, under `procurement_drafts`' own
 * `can_buy_for_project` policy, which is also the only reader of held notes
 * (F4: read authority = write authority). Only then does the service-role
 * client resolve the maker's address and insert the row: `procurement_drafts`
 * grants INSERT to service_role only. service_role never reaches the browser.
 *
 * The maker, the PO and the address come from the record, never the request.
 */

const KIND = 'maker_eta_request';
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A draft still on its way: held for review, or claimed by a send. */
const OPEN = ['awaiting_review', 'sending'];
const HELD_ERROR = 'A note for this piece is already held for review.';
/** No studio stores a time zone yet; the studio clock is Chicago's (F6). */
const STUDIO_TIME_ZONE = 'America/Chicago';

interface HoldRequestBody {
  projectId?: unknown;
  ffeItemId?: unknown;
  subject?: unknown;
  body?: unknown;
}

interface LineRow extends LineMakerSource {
  id: string;
  project_id: string;
  vendor_id: string | null;
  purchase_order_id: string | null;
  purchase_order: {
    id: string;
    vendor_id: string | null;
    vendor?: { name?: string | null } | null;
  } | null;
  project: { studio_id: string | null; designer_id?: string | null } | null;
}

interface DraftRow {
  status: string;
  created_at: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const STUDIO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const studioDay = (at: Date) => STUDIO_DAY.format(at);

const conflict = (error: string, draft: unknown) =>
  NextResponse.json({ error, draft }, { status: 409 });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { user, adminClient } = auth;

  let input: HoldRequestBody;
  try {
    input = ((await request.json()) ?? {}) as HoldRequestBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  const projectId = text(input.projectId);
  const ffeItemId = text(input.ffeItemId);
  if (!UUID.test(projectId) || !UUID.test(ffeItemId)) {
    return badRequest('projectId and ffeItemId are required');
  }
  const subject = text(input.subject);
  const body = text(input.body);
  if (!subject || !body) return badRequest('The note needs a subject and a body');
  if (subject.length > SUBJECT_MAX || body.length > BODY_MAX) {
    return badRequest('The note is too long');
  }

  // The caller's own session, under RLS. Reading the line back IS the proof
  // that the caller buys for this project.
  const session = await createServerClient();
  const { data, error: lineError } = await session
    .from('project_ffe_items')
    .select(
      'id, project_id, vendor_id, vendor_name, purchase_order_id, product:products!product_id(brand), purchase_order:purchase_orders!purchase_order_id(id, vendor_id, vendor:vendors!purchase_orders_vendor_id_fkey(name)), project:projects!project_id(studio_id, designer_id)',
    )
    .eq('id', ffeItemId)
    .eq('project_id', projectId)
    .is('removed_at', null)
    .maybeSingle();

  if (lineError) {
    console.error('[ask-maker-date] line read failed', lineError);
    return serverError('Could not read that piece just now.');
  }
  const line = data as LineRow | null;
  if (!line) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // R37/R42: the same selector the row and the sheet print.
  if (!lineMaker(line)) {
    return NextResponse.json({ error: 'No maker is recorded on this line.' }, { status: 422 });
  }

  const readNotes = async () =>
    session
      .from('procurement_drafts')
      .select('*')
      .eq('kind', KIND)
      .eq('ffe_item_id', line.id)
      .order('created_at', { ascending: false });

  const { data: notes, error: notesError } = await readNotes();
  if (notesError) {
    console.error('[ask-maker-date] held notes read failed', notesError);
    return serverError('Could not read the held notes just now.');
  }
  const rows = (notes ?? []) as DraftRow[];
  // F2: one open note per piece; the sheet opens the one already held.
  const open = rows.find((row) => OPEN.includes(row.status));
  if (open) return conflict(HELD_ERROR, open);
  // F1/F6: one note per piece per studio day. A note already sent or
  // discarded today is reported, never re-held over.
  const today = studioDay(new Date());
  const earlier = rows.find((row) => studioDay(new Date(row.created_at)) === today);
  if (earlier) {
    return conflict(`A note for this piece was already ${earlier.status} today.`, earlier);
  }

  const po = line.purchase_order;
  let studioId = line.project?.studio_id ?? null;
  if (!studioId && line.project?.designer_id) {
    // purchase_order_studio_id's fallback: the project owner's primary studio.
    const { data: primary } = await adminClient.rpc('_primary_studio_for', {
      p_user: line.project.designer_id,
    });
    studioId = (primary as string | null) ?? null;
  }

  // The PO's vendor first, as po-send addresses it; else the line's own.
  const vendorId = po?.vendor_id ?? line.vendor_id;
  let toEmail: string | null = null;
  if (studioId && vendorId) {
    const { data: email, error: emailError } = await adminClient.rpc(
      '_procurement_vendor_email',
      { p_org: studioId, p_vendor: vendorId },
    );
    if (emailError) {
      console.error('[ask-maker-date] maker address read failed', emailError);
      return serverError('Could not hold that note just now.');
    }
    toEmail = (email as string | null) ?? null;
  }

  const { data: draft, error } = await adminClient
    .from('procurement_drafts')
    .insert({
      organization_id: studioId,
      project_id: line.project_id,
      kind: KIND,
      // A draft, and only a draft. DraftReview's Send is the send gate.
      status: 'awaiting_review',
      purchase_order_id: po?.id ?? line.purchase_order_id ?? null,
      ffe_item_id: line.id,
      to_email: toEmail,
      subject,
      body,
      composed_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    // Two presses at once: the one-open-note index refused the second.
    if ((error as { code?: string }).code === '23505') {
      const { data: again } = await readNotes();
      const held = ((again ?? []) as DraftRow[]).find((row) => OPEN.includes(row.status));
      return conflict(HELD_ERROR, held ?? null);
    }
    console.error('[ask-maker-date] hold failed', error);
    return serverError('Could not hold that note just now.');
  }

  return NextResponse.json({ draft });
}
