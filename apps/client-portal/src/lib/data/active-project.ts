import 'server-only';

import { createServerClient } from '@patina/supabase/server';

import { env } from '../env';
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
