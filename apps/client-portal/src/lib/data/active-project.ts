import 'server-only';

import { createServerClient } from '@patina/supabase/server';

import { env } from '../env';
import { adoptedHouseId } from '../threshold/adopted-house';
import { pickActiveProjectId, type HouseActivity } from '../threshold/active-project';

/* ── The house `/` opens on ─────────────────────────────────────────────────
   `/` is a protected route: middleware sends a visitor with no session to
   sign-in and a wrong-portal role to the interstitial before this module runs
   at all. So an empty project list here means one thing only — a signed-in
   client with no house yet — and this file never has to tell a missing
   session from a missing project. It asks the auth server nothing on the
   common paths.

   Three clocks decide which house a multi-house client lands in. If any of
   them cannot be read the freshest known house stands: never an error, never
   a guess dressed as a fact. ─────────────────────────────────────────────── */

export async function resolveActiveHouse(projectIds: string[]): Promise<string | null> {
  if (projectIds.length === 0) return null;

  // `fetchClientProjects` orders by `updated_at` descending, so the first id
  // is already the freshest house by the project's own clock — the answer to
  // fall back on whenever the other two clocks cannot be read.
  const freshest = projectIds[0];
  if (projectIds.length === 1 || env.useProjectFixtures) return freshest;

  try {
    const supabase = (await createServerClient()) as any;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return freshest;

    const [projects, notes, invoices] = await Promise.all([
      // Scoped by owner as well as by id — every other fetcher in
      // `lib/data/projects.ts` carries this predicate, and RLS should not be
      // the only thing standing between this read and another client's row.
      supabase.from('projects').select('id, updated_at').eq('client_id', user.id).in('id', projectIds),
      supabase.from('project_notes').select('project_id, sent_at').in('project_id', projectIds),
      supabase.from('invoices').select('project_id, updated_at').in('project_id', projectIds),
    ]);

    if (projects?.error || notes?.error || invoices?.error) return freshest;

    const movements = new Map<string, (string | null | undefined)[]>(
      projectIds.map((id) => [id, []]),
    );
    const record = (projectId: unknown, movedAt: unknown) => {
      if (typeof projectId !== 'string') return;
      movements.get(projectId)?.push(typeof movedAt === 'string' ? movedAt : null);
    };

    for (const row of (projects?.data ?? []) as any[]) record(row?.id, row?.updated_at);
    for (const row of (notes?.data ?? []) as any[]) record(row?.project_id, row?.sent_at);
    for (const row of (invoices?.data ?? []) as any[]) record(row?.project_id, row?.updated_at);

    const houses: HouseActivity[] = projectIds.map((projectId) => ({
      projectId,
      movedAt: movements.get(projectId) ?? [],
    }));

    return pickActiveProjectId(houses);
  } catch {
    return freshest;
  }
}

/* ── The house an instrument names ──────────────────────────────────────────
   `/invoices/<id>`, `/proposals/<id>` and `/decisions/<id>` are still emitted
   on purpose — the Patina iOS app claims all three in its `applinks:`
   entitlement — so they fold to `/` for everyone without the app. `/` on its
   own opens the house that moved LAST, which for a client with two houses is
   the wrong letterbox, the wrong door and the wrong doorstep: the money, the
   signature and the approval path, landing silently in someone else's room.
   The fold carries the entity id, and this resolves the house it belongs to
   before the active-house clocks are consulted.

   It never guesses: an id that resolves to nothing, or to a project outside
   the client's own list, returns null and the active house stands.

   A STUDIO INVOICE names no house at all (ruling S1), so there is nothing for
   the house rule to match and the letter would land in the last-moved house,
   whose letterbox is not holding it. It resolves instead to the adopted house
   — the lowest project id the client can open, the same rule the house itself
   applies to money with no house — which is where the letter actually
   stands. ────────────────────────────────────────────────────────────────── */

export async function resolveHouseForInstrument(
  projectIds: string[],
  instrument: {
    invoiceId?: string | null;
    proposalId?: string | null;
    decisionId?: string | null;
  },
): Promise<string | null> {
  const { invoiceId, proposalId, decisionId } = instrument;
  if (!invoiceId && !proposalId && !decisionId) return null;
  if (env.useProjectFixtures) return null;
  if (projectIds.length === 0) return null;
  // One house cannot disagree with itself, so nothing needs reading for it —
  // EXCEPT an invoice, which may be a studio invoice belonging to no house.
  // That case is answered by the adopted-house rule below, not by the
  // active-house clocks, so the read has to happen either way.
  if (projectIds.length < 2 && !invoiceId) return null;

  const owns = (projectId: unknown): string | null =>
    typeof projectId === 'string' && projectIds.includes(projectId)
      ? projectId
      : null;

  try {
    const supabase = (await createServerClient()) as any;

    if (invoiceId) {
      // A studio invoice has no project to be scoped by, so the read cannot
      // carry `.in('project_id', …)` any more. `owns` still refuses a house
      // outside the client's own list, and the studio branch below checks the
      // household the letter names — RLS is not the only thing standing
      // between this read and another client's row either way.
      const { data, error } = await supabase
        .from('invoices')
        .select('project_id, client_id')
        .eq('id', invoiceId)
        .maybeSingle();
      if (error || !data) return null;
      if (data.project_id) return owns(data.project_id);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || data.client_id !== user.id) return null;
      return adoptedHouseId(projectIds);
    }

    if (proposalId) {
      // `list_client_proposals` is the same client-safe read the door itself
      // runs; there is no client-readable proposals table to select from.
      const { data, error } = await supabase.rpc('list_client_proposals');
      if (error || !Array.isArray(data)) return null;
      const match = data.find((row: any) => row?.id === proposalId);
      return match ? owns(match.project_id) : null;
    }

    // An approval reaches the doorstep by one of two paths, and the read has
    // to try both: a Stage-2 approval is deliberately outside the client read
    // model (`client_decisions` RLS excludes `project_artifact_v1`), so its
    // house comes from the same sanitized list the doorstep itself is built
    // from; a legacy option choice is an ordinary row this client can select.
    const { data: reviews, error: reviewsError } = await supabase.rpc(
      'list_my_project_decision_reviews',
    );
    if (!reviewsError && Array.isArray(reviews)) {
      const review = reviews.find((row: any) => row?.decisionId === decisionId);
      if (review) return owns(review.projectId);
    }

    // Scoped to the client's own projects as well as by id, for the same
    // reason the invoice read is: RLS is not the only thing that should stand
    // between this read and another client's row.
    const { data, error } = await supabase
      .from('client_decisions')
      .select('project_id')
      .eq('id', decisionId)
      .in('project_id', projectIds)
      .maybeSingle();
    if (!error && data) return owns(data.project_id);
    return null;
  } catch {
    return null;
  }
}
