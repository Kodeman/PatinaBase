/**
 * Legacy Help Center · Topic (Sprint 3 E5) — retired help-desk Wave 1.
 * Redirects to `/help/topic/[prefix]`, preserving the (URL-encoded) prefix
 * param. Decode-then-encode keeps the segment single either way Next hands it
 * to us (`decodeURIComponent` is a no-op on an already-decoded prefix —
 * surface keys carry no `%`).
 */

import { redirect } from 'next/navigation';

function normalizeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export default async function LegacyHelpTopicRedirect({
  params,
}: {
  params: Promise<{ prefix: string }>;
}) {
  const { prefix } = await params;
  redirect(`/help/topic/${encodeURIComponent(normalizeSegment(prefix))}`);
}
