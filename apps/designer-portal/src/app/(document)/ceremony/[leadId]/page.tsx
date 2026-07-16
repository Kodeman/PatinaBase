'use client';

/**
 * The Match Ceremony route (Arrival Arc, R106 §2) — /ceremony/[leadId].
 * A document-class surface, full bleed under the (document) group (D12): the
 * DocumentGate, drawer, and ⌘K come from the group layout; the surface itself
 * owns the whole sheet. Flag-gated (`arrival-arc`) and ownership-gated inside
 * CeremonySurface — either failing quietly redirects to /doc/{leadId}.
 */

import { use } from 'react';
import { CeremonySurface } from '@/components/document/ceremony/ceremony-surface';

export default function CeremonyPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = use(params);
  return <CeremonySurface leadId={leadId} />;
}
