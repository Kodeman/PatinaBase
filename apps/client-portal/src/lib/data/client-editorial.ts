import 'server-only';

import { createServerClient } from '@patina/supabase/server';

import { parseClientEditorial } from '@/hooks/use-client-editorial';
import { heroPreloadSources, type HeroPreloadSource } from '@/lib/editorial/crop';
import { rankHero } from '@/lib/editorial/rank';
import type { ClientProjectEditorial } from '@/lib/editorial/types';

/**
 * The House Issue's plate read, on the server, under the signed-in client's
 * session (00842 guards it to the project's client). Null on any failure: a
 * picture never blocks the page, and the page never sees an error from here.
 */
export async function fetchClientEditorial(projectId: string): Promise<ClientProjectEditorial | null> {
  try {
    const supabase = (await createServerClient()) as any;
    const { data, error } = await supabase.rpc('get_client_project_editorial', {
      p_project_id: projectId,
    });
    if (error) return null;
    return parseClientEditorial(data);
  } catch {
    return null;
  }
}

/** Rollout authority precedes acquisition; off never enters the reader. */
export function fetchEnabledClientEditorial(projectId: string, enabled: boolean): Promise<ClientProjectEditorial | null> {
  return enabled ? fetchClientEditorial(projectId) : Promise.resolve(null);
}

export type HeroPreload = HeroPreloadSource;

/**
 * The hero's `<link rel="preload" as="image">` attributes, one per art-directed
 * source: the crops and `sizes` `HeroPlate` draws, from the same `heroPicture`.
 */
export function heroPreloads(editorial: ClientProjectEditorial | null): HeroPreload[] {
  const hero = editorial ? rankHero(editorial) : null;
  if (!editorial || !hero) return [];
  return heroPreloadSources(editorial.project.id, hero);
}
