import 'server-only';

import { createServerClient } from '@patina/supabase/server';

import { env } from '../env';
import { pickActiveProjectId, type HouseActivity } from '../threshold/active-project';

/* ── The house `/` opens on ─────────────────────────────────────────────────
   `fetchClientProjects` already answers [] both for a client with no houses
   and for a visitor with no session, so `/` — which middleware treats as a
   public path — needs the two told apart before it decides between the empty
   state and the sign-in page. A non-empty list is itself proof of a session
   (the list is filtered by `client_id = auth.uid()`), so the extra auth read
   only happens on the empty answer.

   Three clocks decide which house a multi-house client lands in. If any of
   them cannot be read the freshest known house stands: never an error, never
   a guess dressed as a fact. ─────────────────────────────────────────────── */

export type ActiveHouse =
  | { status: 'signed-out' }
  | { status: 'ok'; activeProjectId: string | null };

async function hasClientSession(): Promise<boolean> {
  if (env.useProjectFixtures) return true;

  try {
    const supabase = (await createServerClient()) as any;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export async function resolveActiveHouse(projectIds: string[]): Promise<ActiveHouse> {
  if (projectIds.length === 0) {
    return (await hasClientSession())
      ? { status: 'ok', activeProjectId: null }
      : { status: 'signed-out' };
  }

  const freshest: ActiveHouse = { status: 'ok', activeProjectId: projectIds[0] };
  if (projectIds.length === 1 || env.useProjectFixtures) return freshest;

  try {
    const supabase = (await createServerClient()) as any;
    const [projects, notes, invoices] = await Promise.all([
      supabase.from('projects').select('id, updated_at').in('id', projectIds),
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

    return { status: 'ok', activeProjectId: pickActiveProjectId(houses) };
  } catch {
    return freshest;
  }
}
