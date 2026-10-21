import 'server-only';

import { createServerClient } from '@patina/supabase/server';

import { parseClientEditorial } from '@/hooks/use-client-editorial';
import { PHONE_MEDIA, SIZES } from '@/lib/editorial/crop';
import { rankHero } from '@/lib/editorial/rank';
import type { ClientProjectEditorial, EditorialAsset, PlateCropKey } from '@/lib/editorial/types';
import { plateSrcSet } from '@/lib/plates';

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

export interface HeroPreload {
  imageSrcSet: string;
  imageSizes: string;
  media?: string;
}

/*
 * The same sources `HeroPlate` draws (hero-plate.tsx `preloadLink`, pinned
 * equal by house-issue.test.tsx). Restated here because hero-plate.tsx is a
 * client module: a server page calling its export would get a client reference.
 */
function heroSources(asset: EditorialAsset): Array<{ cropKey: PlateCropKey; media?: string }> {
  if (!asset.crops.wide) return [{ cropKey: 'cover_phone' }];
  if (!asset.crops.cover_phone) return [{ cropKey: 'wide' }];
  return [
    { cropKey: 'cover_phone', media: PHONE_MEDIA },
    { cropKey: 'wide', media: '(min-width: 601px)' },
  ];
}

/** The hero's `<link rel="preload" as="image">` attributes, one per art-directed source. */
export function heroPreloads(editorial: ClientProjectEditorial | null): HeroPreload[] {
  const hero = editorial ? rankHero(editorial) : null;
  if (!editorial || !hero) return [];
  return heroSources(hero).flatMap(({ cropKey, media }) => {
    const widths = hero.crops[cropKey]?.widths ?? [];
    if (widths.length === 0) return [];
    const imageSrcSet = plateSrcSet(editorial.project.id, hero.sha256, cropKey, [...widths].sort((a, b) => a - b), 'avif');
    return [{ imageSrcSet, imageSizes: SIZES.bleed, ...(media ? { media } : {}) }];
  });
}
