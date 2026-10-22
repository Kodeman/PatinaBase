import 'server-only';

import { createServerClient } from '@patina/supabase/server';

import { editionHero, editorialRpc, plateScope, readClientEditorial } from '@/hooks/use-client-editorial';
import { heroPreloadSources, type HeroPreloadSource } from '@/lib/editorial/crop';
import type { ClientProjectEditorial } from '@/lib/editorial/types';

/**
 * The House Issue's plate read, on the server, under the signed-in client's
 * session (00842/00846 guard it to the project's client): the approved edition
 * when there is one, else the Phase 1 envelope. Null on any failure: a picture
 * never blocks the page, and the page never sees an error from here.
 */
export async function fetchClientEditorial(projectId: string): Promise<ClientProjectEditorial | null> {
  try {
    return await readClientEditorial(editorialRpc(await createServerClient()), projectId);
  } catch {
    return null;
  }
}

/** Rollout authority precedes acquisition; off never enters either reader. */
export function fetchEnabledClientEditorial(projectId: string, enabled: boolean): Promise<ClientProjectEditorial | null> {
  return enabled ? fetchClientEditorial(projectId) : Promise.resolve(null);
}

export type HeroPreload = HeroPreloadSource;

/**
 * The hero's `<link rel="preload" as="image">` attributes, one per art-directed
 * source: the crops and `sizes` `HeroPlate` draws, from the same `heroPicture`,
 * under the same plate scope.
 */
export function heroPreloads(editorial: ClientProjectEditorial | null): HeroPreload[] {
  const hero = editorial ? editionHero(editorial) : null;
  if (!editorial || !hero) return [];
  return heroPreloadSources(plateScope(editorial), hero);
}
