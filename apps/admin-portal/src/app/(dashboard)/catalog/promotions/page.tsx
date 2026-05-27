'use client';

import Link from 'next/link';
import { ArrowUpRight, Layers } from 'lucide-react';
import { PageHeader, Section, EmptyState } from '@/components/portal';

/**
 * Layer 1 → 2 → 3 promotion flow — deferral stub.
 *
 * Sprint 3 / Wave 3.3 IE2 (Path C).
 *
 * The PRD §12 Phase 3 lists "Layer 1 → Layer 2 promotion flow" and
 * "Layer 2 → Layer 3 nomination flow" as v1 deliverables. Recon during
 * Wave 3.3 confirmed the full implementation requires schema work
 * (studios + studio_members tables, products.layer column, RLS rewrite,
 * promotion audit log, vendor nominations) far beyond a Sprint 3 slice.
 *
 * See: docs/follow-ups/layer-promotion-v1.1.md
 *      docs/prds/patina-three-layer-catalog-engineering-handoff.md
 *      docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md
 *        §5 "Layer promotion scope clarification" (lines 740–746)
 *
 * This stub exists so the PRD §12 bullet has a discoverable surface in
 * the admin portal that points to the deferral plan, rather than being
 * a silent omission.
 */
export default function CatalogPromotionsPage() {
  return (
    <div>
      <PageHeader
        title="Layer Promotion"
        accent="Coming in v1.1"
        description="Personal → Studio → Patina Catalog promotion flow. Deferred from procurement-workspace v1 — the full implementation requires schema groundwork (studios, studio_members, products.layer, RLS replacement, promotion audit log, vendor nominations) that's larger than the Sprint 3 W3.3 slice."
      />

      <Section className="mt-10">
        <EmptyState label="Deferred">
          <div className="mt-4 max-w-xl space-y-4 text-left">
            <p className="type-body text-[var(--text-muted)]">
              The designer-facing halves of Layer 1 and Layer 2 already
              ship in v1 through other surfaces — Layer 1 captures via
              the Chrome extension and iOS capture flows, and the
              operational Layer 1 → Layer 2 transition via{' '}
              <code className="font-mono text-xs">useAssignProductToFfeSlot</code>{' '}
              (Sprint 3 Wave 3.3 IE1, capture-to-slot).
            </p>
            <p className="type-body text-[var(--text-muted)]">
              The admin-portal curation surface (studio library promotion
              review, Patina Catalog nomination queue) lands in v1.1 once
              the studios &amp; studio_members tables and the layer-aware
              RLS rewrite are in place.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Link
                href="https://github.com/Kodeman/patina-merged/blob/main/docs/follow-ups/layer-promotion-v1.1.md"
                className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-wide text-[var(--color-aged-oak)] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowUpRight className="h-3 w-3" />
                docs/follow-ups/layer-promotion-v1.1.md
              </Link>
              <Link
                href="https://github.com/Kodeman/patina-merged/blob/main/docs/prds/patina-three-layer-catalog-engineering-handoff.md"
                className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-wide text-[var(--color-aged-oak)] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Layers className="h-3 w-3" />
                Three-layer engineering handoff (authoritative spec)
              </Link>
            </div>
          </div>
        </EmptyState>
      </Section>
    </div>
  );
}
