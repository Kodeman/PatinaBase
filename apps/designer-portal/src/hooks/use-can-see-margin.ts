'use client';

import { useCanSeeStudioMargin } from '@patina/supabase';
import { useInternalTimeStudio } from '@/hooks/use-viewer-studio';

/**
 * Whether the viewer may see margin, markup and trade cost in the studio she
 * works in (R1, R-PB6). Everyone in the studio by default; owners and admins
 * only when the studio restricts it. The server (`can_see_studio_margin`)
 * decides from her seat. The studio is her active non-guest design studio,
 * following the studio choice the other studio surfaces follow.
 *
 * False until the server answers, so a restricted figure never flashes.
 */
export function useCanSeeMargin(): boolean {
  const { studio } = useInternalTimeStudio();
  const { data } = useCanSeeStudioMargin(studio?.id);
  return data === true;
}
