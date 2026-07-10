/**
 * Legacy Help Center · Article (Sprint 3 E5) — retired help-desk Wave 1.
 * Redirects to `/help/[surfaceKey]`, preserving the (URL-encoded) surface-key
 * param. Decode-then-encode keeps the segment single either way Next hands it
 * to us (`decodeURIComponent` is a no-op on an already-decoded key — surface
 * keys carry no `%`).
 */

import { redirect } from 'next/navigation';

function normalizeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export default async function LegacyHelpArticleRedirect({
  params,
}: {
  params: Promise<{ surfaceKey: string }>;
}) {
  const { surfaceKey } = await params;
  redirect(`/help/${encodeURIComponent(normalizeSegment(surfaceKey))}`);
}
