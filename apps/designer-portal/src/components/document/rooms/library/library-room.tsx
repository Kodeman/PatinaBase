'use client';

/**
 * The Library Room (R32 / R39) — the first tenant of the reusable Rooms shell.
 * The librarian stands on top (R38, ask deferred to Slice 3); three shelves
 * separated by Strata rules read the real catalog (My / Studio / Patina);
 * capture lands raw, promote and nominate move pieces between shelves; teaching
 * happens in place (inline Quick Tags / the Deep Analysis paper sheet); the foot
 * compresses teaching to one quiet line. No mock data, nothing gamified.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useLayerCounts,
  useTeachingQueue,
  useOrganizations,
  createBrowserClient,
} from '@patina/supabase';
import { RoomShell } from '../room-shell';
import { LibrarianBar } from './librarian-bar';
import { LibraryShelf } from './library-shelf';
import { LibraryFoot } from './library-foot';
import { CaptureSheet } from './capture-sheet';
import { DeepAnalysisSheet } from './deep-analysis-sheet';
import { PromoteToStudioModal } from '@/components/products/promotion/promote-to-studio-modal';
import { NominateToCatalogModal } from '@/components/products/nomination/nominate-to-catalog-modal';

export function LibraryRoom() {
  const { data: counts } = useLayerCounts();
  const { data: queue } = useTeachingQueue();
  const { data: orgs } = useOrganizations();

  const studioId = useMemo(() => {
    const first = ((orgs ?? []) as unknown as Array<Record<string, unknown>>)[0];
    return (first?.organization_id as string) ?? (first?.id as string) ?? null;
  }, [orgs]);

  const teachingIds = useMemo(() => {
    const rows = (queue ?? []) as Array<Record<string, unknown>>;
    return new Set(
      rows.map((r) => (r.product_id ?? r.id) as string | undefined).filter(Boolean) as string[],
    );
  }, [queue]);

  const total = counts ? counts.personal + counts.studio + counts.catalog : null;

  const [captureOpen, setCaptureOpen] = useState(false);
  const [deep, setDeep] = useState<{ id: string; name: string } | null>(null);
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [nominateVendorId, setNominateVendorId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleNominate = async (productId: string) => {
    if (!studioId) {
      setToast('Nominating a maker needs a studio on file.');
      return;
    }
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('products')
        .select('vendor_id')
        .eq('id', productId)
        .maybeSingle();
      const vendorId = (data as { vendor_id?: string } | null)?.vendor_id ?? null;
      if (!vendorId) {
        setToast('This piece has no maker on file to nominate.');
        return;
      }
      setNominateVendorId(vendorId);
    } catch {
      setToast('Could not open the nomination just now.');
    }
  };

  return (
    <RoomShell
      title="The Library"
      count={total != null ? `${total} pieces` : undefined}
      action={
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-[5px] bg-[var(--color-charcoal)] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-off-white)] transition-opacity hover:opacity-85"
        >
          <span aria-hidden>⊕</span> Capture
        </button>
      }
    >
      <div className="mx-auto max-w-[1240px]">
        <LibrarianBar />

        <div className="px-6 sm:px-9">
          <LibraryShelf
            layer="personal"
            name="My Library"
            meta="raw captures · from the extension, photos, paste"
            teachingIds={teachingIds}
            onDeep={(id, name) => setDeep({ id, name })}
            onPromote={(id) => setPromoteId(id)}
            actions={
              <button
                type="button"
                onClick={() => setCaptureOpen(true)}
                className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)] hover:text-[var(--color-aged-oak)]"
              >
                + Capture
              </button>
            }
          />

          <LibraryShelf
            layer="studio"
            name="Studio Library"
            meta="proven · promoted from captures"
            teachingIds={teachingIds}
            onDeep={(id, name) => setDeep({ id, name })}
            onNominate={(id) => void handleNominate(id)}
          />

          <LibraryShelf
            layer="catalog"
            name="Patina Catalog"
            meta="maker pieces · order through Patina · nominate a maker"
            teachingIds={teachingIds}
            onDeep={(id, name) => setDeep({ id, name })}
          />
        </div>

        <LibraryFoot />
      </div>

      {/* Capture — a paper sheet over the Room. */}
      <CaptureSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCaptured={(name) => setToast(`Captured → My Library. “${name}” is on your shelf, raw.`)}
      />

      {/* Deep analysis — a paper sheet over the Room. */}
      {deep && (
        <DeepAnalysisSheet
          productId={deep.id}
          productName={deep.name}
          onClose={() => setDeep(null)}
          onSaved={() => setToast(`Taught — “${deep.name}” is mapped. Your eye, learned.`)}
        />
      )}

      {/* Promote (personal → studio) and Nominate (studio → catalog) reuse the
          proven flows; a doc-grammar re-skin of these forms is a follow-up. */}
      <PromoteToStudioModal
        open={promoteId !== null}
        productId={promoteId}
        onClose={() => setPromoteId(null)}
        onSuccess={() => setToast('Promoted to the Studio Library — proven, and shared with the studio.')}
      />
      <NominateToCatalogModal
        open={nominateVendorId !== null}
        vendorId={nominateVendorId}
        studioId={studioId}
        onClose={() => setNominateVendorId(null)}
        onSubmitted={() => setToast('Maker nominated to the Patina Catalog.')}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[72px] left-1/2 z-[65] -translate-x-1/2 rounded-[8px] border border-[rgba(196,165,123,0.3)] bg-[var(--color-charcoal)] px-4 py-2.5 text-[0.74rem] text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {toast}
        </div>
      )}
    </RoomShell>
  );
}
