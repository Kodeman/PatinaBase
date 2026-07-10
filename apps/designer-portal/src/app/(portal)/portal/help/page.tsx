/**
 * Legacy Help Center (Sprint 3 E5) — retired help-desk Wave 1.
 * The Help Center re-homed to `/help` (R89); this route survives only so old
 * links and bookmarks keep landing somewhere real.
 */

import { redirect } from 'next/navigation';

export default function LegacyHelpCenterRedirect() {
  redirect('/help');
}
