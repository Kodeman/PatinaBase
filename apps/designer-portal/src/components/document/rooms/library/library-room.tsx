'use client';

/**
 * The Library Room (R32 / R39) — the first tenant of the reusable Rooms shell.
 * The librarian stands on top (R38); one omnibox finds or asks, and one shelf
 * lens at a time reads the real catalog (My / Studio / Patina);
 * capture lands raw, promote and nominate move pieces between shelves; teaching
 * happens in place (inline Quick Tags / the Deep Analysis paper sheet); the foot
 * compresses teaching to one quiet line. No mock data, nothing gamified.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useLayerCounts,
  useTeachingQueue,
  useValidationQueue,
  useOrganizations,
  createBrowserClient,
  type LayerProductLayer,
} from '@patina/supabase';
import { RoomShell } from '../room-shell';
import { LibrarianBar } from './librarian-bar';
import { LibraryShelf } from './library-shelf';
import { LibraryToolbar } from './library-toolbar';
import { LibraryFoot } from './library-foot';
import { CaptureSheet } from './capture-sheet';
import { ImportSheet } from './import-sheet';
import { DeepAnalysisSheet } from './deep-analysis-sheet';
import { PromoteToStudioModal } from '@/components/products/promotion/promote-to-studio-modal';
import { NominateToCatalogModal } from '@/components/products/nomination/nominate-to-catalog-modal';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import {
  DocumentAction,
  DocumentActionGroup,
} from '../../document-action';
import { useMobilePrimaryAction } from '../../mobile/mobile-shell';

const SHELF_COPY: Record<LayerProductLayer, { name: string; meta: string }> = {
  personal: {
    name: 'My Library',
    meta: 'raw captures · from the extension, photos, paste',
  },
  studio: {
    name: 'Studio Library',
    meta: 'proven · promoted from captures',
  },
  catalog: {
    name: 'Patina Catalog',
    meta: 'maker pieces · order through Patina · nominate a maker',
  },
};

export function LibraryRoom() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.library); // R89 — scope help to the Library room
  const router = useRouter();
  const { data: counts } = useLayerCounts();
  const { data: queue } = useTeachingQueue();
  const { data: validationQueue } = useValidationQueue();
  const { data: orgs } = useOrganizations();

  // R40: authoring a new piece walks into the Composing Page (a nested Room);
  // RoomShell's backTo returns it here. (No rememberRoomOrigin — it no-ops on a
  // Room path; the stashed origin still holds the surface before the Library.)
  const enterCompose = () => {
    router.push('/compose');
  };

  const studioId = useMemo(() => {
    const first = (
      (orgs ?? []) as unknown as Array<Record<string, unknown>>
    )[0];
    return (first?.organization_id as string) ?? (first?.id as string) ?? null;
  }, [orgs]);

  const teachingIds = useMemo(() => {
    const rows = (queue ?? []) as Array<Record<string, unknown>>;
    return new Set(
      rows
        .map((r) => (r.product_id ?? r.id) as string | undefined)
        .filter(Boolean) as string[],
    );
  }, [queue]);

  // The validation queue (status='needs_validation') is a DISTINCT set from the
  // teaching queue — these pieces have a read awaiting a second eye (R88).
  const validationIds = useMemo(() => {
    const rows = (validationQueue ?? []) as Array<Record<string, unknown>>;
    return new Set(
      rows
        .map((r) => (r.product_id ?? r.id) as string | undefined)
        .filter(Boolean) as string[],
    );
  }, [validationQueue]);

  const total = counts
    ? counts.personal + counts.studio + counts.catalog
    : null;

  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerProductLayer>('personal');
  const [deep, setDeep] = useState<{ id: string; name: string } | null>(null);
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [nominateVendorId, setNominateVendorId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useMobilePrimaryAction({
    actionKey: 'capture-piece',
    surfaceKey: 'library',
    regionKey: 'room-head',
    label: 'Capture',
    target: { kind: 'press', onPress: () => setCaptureOpen(true) },
  });

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
      const vendorId =
        (data as { vendor_id?: string } | null)?.vendor_id ?? null;
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
        <DocumentActionGroup
          surfaceKey="library"
          regionKey="room-head"
          aria-label="Library actions"
        >
          <DocumentAction
            actionKey="capture-piece"
            variant="primary"
            leading="⊕"
            onClick={() => setCaptureOpen(true)}
          >
            Capture
          </DocumentAction>
        </DocumentActionGroup>
      }
    >
      <div className="mx-auto max-w-[1240px]">
        <LibrarianBar
          onPlaced={(pieceName, whereName) =>
            setToast(
              `Placed “${pieceName}” into ${whereName} — via the Engine.`,
            )
          }
        />

        <LibraryToolbar
          activeLayer={activeLayer}
          counts={counts ?? null}
          onLayerChange={setActiveLayer}
          onCompose={enterCompose}
          onImport={() => setImportOpen(true)}
        />

        <div className="px-6 sm:px-9">
          <LibraryShelf
            key={activeLayer}
            id="library-shelf-panel"
            labelledBy={`library-lens-${activeLayer}`}
            layer={activeLayer}
            name={SHELF_COPY[activeLayer].name}
            meta={SHELF_COPY[activeLayer].meta}
            teachingIds={teachingIds}
            validationIds={validationIds}
            onDeep={(id, name) => setDeep({ id, name })}
            onPromote={activeLayer === 'personal' ? (id) => setPromoteId(id) : undefined}
            onNominate={
              activeLayer === 'studio' ? (id) => void handleNominate(id) : undefined
            }
          />
        </div>

        <LibraryFoot />
      </div>

      {/* Capture — a paper sheet over the Room. */}
      <CaptureSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCaptured={(name) =>
          setToast(`Captured → My Library. “${name}” is on your shelf, raw.`)
        }
      />

      {/* Import… — bring a maker's spreadsheet onto My Library, raw (R88). */}
      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(count) =>
          setToast(
            `${count} piece${count === 1 ? '' : 's'} landed in My Library — raw, ready to teach.`,
          )
        }
      />

      {/* Deep analysis — a paper sheet over the Room. */}
      {deep && (
        <DeepAnalysisSheet
          productId={deep.id}
          productName={deep.name}
          onClose={() => setDeep(null)}
          onSaved={() =>
            setToast(`Taught — “${deep.name}” is mapped. Your eye, learned.`)
          }
        />
      )}

      {/* Promote (personal → studio) and Nominate (studio → catalog) reuse the
          proven flows, re-skinned as paper RoomSheets over the Room (R41 F4). */}
      <PromoteToStudioModal
        open={promoteId !== null}
        productId={promoteId}
        asSheet
        onClose={() => setPromoteId(null)}
        onSuccess={() =>
          setToast(
            'Promoted to the Studio Library — proven, and shared with the studio.',
          )
        }
      />
      <NominateToCatalogModal
        open={nominateVendorId !== null}
        vendorId={nominateVendorId}
        studioId={studioId}
        asSheet
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
