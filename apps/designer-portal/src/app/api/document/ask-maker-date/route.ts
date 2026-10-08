import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';
import {
  MAKER_NOTE_KINDS,
  isMakerNoteKind,
  lineMakerRecord,
  standingMakerAsk,
  type LineMakerSource,
  type MakerNoteKind,
} from '@/lib/document/install-reading';

/**
 * /api/document/ask-maker-date — "Ask the maker for a date" (US-19 D6, R37)
 * and "Follow up with the maker" (FR4 520-2, FR5 530-3).
 *
 * POST holds ONE `procurement_drafts` row (kind `maker_eta_request`, or
 * `maker_follow_up` when the body says so) in `awaiting_review` and stops
 * there. One maker note stands per line across both kinds (00728). It shows in the DraftReview of the line's
 * own Movement cell (511-R6) and in the Desk's drafts list, and a studio member
 * sends or discards it there through `procurement-draft-send`. Nothing is emailed and nothing reaches the maker
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
 * The address is the one on the record the printed maker names (R7), or none.
 */

const DEFAULT_KIND: MakerNoteKind = 'maker_eta_request';
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 506-3 / FR5 530-3: the refusal while a live note stands for the line,
 *  named by the kind of the note that stands. */
const HELD_ERROR: Record<MakerNoteKind, string> = {
  maker_eta_request: 'A date request for this line is already drafted.',
  maker_follow_up: 'A note to the maker for this line is already drafted.',
};

interface HoldRequestBody {
  projectId?: unknown;
  ffeItemId?: unknown;
  kind?: unknown;
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
  kind?: string | null;
  status: string;
  created_at: string;
  sent_at?: string | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const sameName = (a: string | null | undefined, b: string) =>
  a?.trim().toLowerCase() === b.toLowerCase();

/** 409 with the note that stands, its reason by that note's kind (530-3). */
const conflict = (draft: DraftRow | null) =>
  NextResponse.json(
    { error: HELD_ERROR[isMakerNoteKind(draft?.kind) ? draft.kind : DEFAULT_KIND], draft },
    { status: 409 },
  );

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
  // FR5 530-3: the sheet names the note's kind; a body that names none holds
  // a date request, as every caller before 00728 did.
  if (input.kind !== undefined && !isMakerNoteKind(input.kind as string)) {
    return badRequest('kind must be maker_eta_request or maker_follow_up');
  }
  const kind: MakerNoteKind = (input.kind as MakerNoteKind | undefined) ?? DEFAULT_KIND;
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
  const maker = lineMakerRecord(line);
  if (!maker) {
    return NextResponse.json({ error: 'No maker is recorded on this line.' }, { status: 422 });
  }

  const readNotes = async () =>
    session
      .from('procurement_drafts')
      .select('*')
      .in('kind', [...MAKER_NOTE_KINDS])
      .eq('ffe_item_id', line.id)
      .order('created_at', { ascending: false });

  const { data: notes, error: notesError } = await readNotes();
  if (notesError) {
    console.error('[ask-maker-date] held notes read failed', notesError);
    return serverError('Could not read the held notes just now.');
  }
  // F1/F2 as amended by 506-3: a held or sending draft stands until it is
  // sent or discarded, a sent one for the studio day it went. A Discard
  // releases the day. The sheet opens the draft that stands. FR5 530-3: a
  // note of either maker kind stands against both.
  const standing = standingMakerAsk((notes ?? []) as DraftRow[], new Date());
  if (standing) return conflict(standing);

  const po = line.purchase_order;
  let studioId = line.project?.studio_id ?? null;
  if (!studioId && line.project?.designer_id) {
    // purchase_order_studio_id's fallback: the project owner's primary studio.
    const { data: primary } = await adminClient.rpc('_primary_studio_for', {
      p_user: line.project.designer_id,
    });
    studioId = (primary as string | null) ?? null;
  }

  // R7: the maker the line prints wins. Its address carries the note only
  // while it is that same record's; otherwise the draft holds no address and
  // its Send waits on one (506-2). The line's vendor is read back through the
  // caller's session, so a vendor renamed since never takes the note.
  let vendorId = maker.vendorId;
  if (vendorId) {
    let recordName: string | null | undefined;
    if (po?.vendor_id === vendorId) {
      recordName = po.vendor?.name;
    } else {
      const { data: vendor, error: vendorError } = await session
        .from('vendors')
        .select('name')
        .eq('id', vendorId)
        .maybeSingle();
      if (vendorError) {
        console.error('[ask-maker-date] maker record read failed', vendorError);
        return serverError('Could not hold that note just now.');
      }
      recordName = (vendor as { name?: string | null } | null)?.name ?? null;
    }
    if (!sameName(recordName, maker.name)) vendorId = null;
  }
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
      kind,
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
      return conflict(standingMakerAsk((again ?? []) as DraftRow[], new Date()));
    }
    console.error('[ask-maker-date] hold failed', error);
    return serverError('Could not hold that note just now.');
  }

  return NextResponse.json({ draft });
}
