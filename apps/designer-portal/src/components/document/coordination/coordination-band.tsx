'use client';

/**
 * CoordinationBand — the orchestrator of Track 5 (Project Coordination · the
 * ball-in-court), mounted ABOVE <FFESection> in the document's project section.
 *
 * It is the ONE place that:
 *   · resolves designer_clients.id from the client's auth uid (clientUserId) via
 *     useDesignerClientForClientUser — exactly the work-block.tsx pattern (the
 *     project carries client_id as a raw auth uid; a coordination INSERT needs
 *     the designer_clients.id FK or it fails RLS). designerClientId stays null
 *     until the resolver returns; create surfaces gate on it.
 *   · reads the live data: useCoordinationItems / useCourtSummary (a select over
 *     the same items query — no second fetch) / useSectionTasks / useProjectParties,
 *     and subscribes ONCE via useCoordinationRealtime.
 *   · owns the band-LOCAL sheet state (openItemId | 'composer' | null) — NEVER a
 *     route, tab, or split view (D1). The document stays mounted beneath; the
 *     OpenItemSheet + ItemComposer render as DocSheet overlays at the band root.
 *
 * The resolve/create cascade is the hooks' own optimistic pass + invalidation
 * (one-act-many-surfaces, §5): onResolved/onCreated just close the sheet — the
 * surfaces re-read themselves. No toast (R51); panels confirm inline. Zero
 * shadows (D4): depth is the section head's value contrast + the StrataMiniRule.
 */

import { useMemo, useState } from 'react';
import {
  useCoordinationItems,
  useCourtSummary,
  useProjectParties,
  useProjectFFEItems,
  useProjectPhases,
  useCoordinationRealtime,
  useDesignerClientForClientUser,
} from '@patina/supabase';
import { useSectionTasks } from '@/hooks/use-section-work';
import { groupByCourt } from '@/lib/document/coordination-derivation';
import { StrataMiniRule } from '../strata-mini-rule';
import { DocSheet } from '../overlays/doc-sheet';
import { CourtBar } from './court-bar';
import { CourtGroup, courtAnchorId } from './court-group';
import { CoordinationWork } from './coordination-work';
import { OpenItemSheet } from './open-item-sheet';
import { ItemComposer, toComposerFfeItems, toComposerPhases } from './item-composer';
import type { Court } from '@patina/supabase';

// ── coordination-band.tsx (orchestrator; owns ALL sheet-open LOCAL state) ──
export interface CoordinationBandProps {
  projectId: string;
  /** The client's AUTH user id (profiles.id) — row.client_profile_id. The band
   *  feeds this to useDesignerClientForClientUser to produce designerClientId. */
  clientUserId: string | null;
  clientName: string;
}

/** The band's sheet state: an item id (its OpenItemSheet), the composer, or none. */
type SheetState = { kind: 'item'; id: string } | { kind: 'composer' } | null;

export function CoordinationBand({
  projectId,
  clientUserId,
  clientName,
}: CoordinationBandProps) {
  // ── designer_clients.id resolution (work-block.tsx pattern) ──
  // The project's client_id is a raw auth uid; coordination create paths need the
  // designer_clients.id FK or the INSERT trips RLS. null until the resolver lands.
  const { data: designerClient } = useDesignerClientForClientUser(clientUserId ?? '');
  const designerClientId = designerClient?.id ?? null;

  // ── live data (one items query; court summary is a select over it) ──
  const { data: items } = useCoordinationItems(projectId);
  const { data: summary } = useCourtSummary(projectId);
  const { data: parties } = useProjectParties(projectId);
  const { data: tasks } = useSectionTasks(projectId);
  // R55: the composer's FF&E-line gate + phase-link pickers.
  const { data: ffeRows } = useProjectFFEItems(projectId);
  const { data: phaseRows } = useProjectPhases(projectId);
  // Subscribe ONCE for the whole band — the rows above re-read on its invalidation.
  useCoordinationRealtime(projectId);

  const allItems = useMemo(() => items ?? [], [items]);
  const allTasks = useMemo(() => tasks ?? [], [tasks]);
  const allParties = useMemo(() => parties ?? [], [parties]);
  const courtSummary = useMemo(() => summary ?? [], [summary]);
  const composerFfe = useMemo(
    () => toComposerFfeItems(ffeRows),
    [ffeRows],
  );
  const composerPhases = useMemo(() => toComposerPhases(phaseRows), [phaseRows]);

  // The open items, grouped by court (designer-first, empties dropped, due-sorted).
  const groups = useMemo(() => groupByCourt(allItems), [allItems]);

  // ── band-LOCAL sheet state — never a route/tab (D1) ──
  const [sheet, setSheet] = useState<SheetState>(null);

  const openItem = (id: string) => setSheet({ kind: 'item', id });
  const openComposer = () => setSheet({ kind: 'composer' });
  const closeSheet = () => setSheet(null);

  // The item currently in the OpenItemSheet (resolved fresh from the live query so
  // the sheet always reads the latest row after an optimistic update).
  const activeItem = useMemo(
    () => (sheet?.kind === 'item' ? allItems.find((i) => i.id === sheet.id) ?? null : null),
    [sheet, allItems],
  );

  // Smooth-scroll a court bar pill to its group's anchor.
  const jumpCourt = (court: Court) => {
    if (typeof document === 'undefined') return;
    document
      .getElementById(courtAnchorId(court))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="document-decision-controls" tabIndex={-1} aria-label="Project coordination" className="mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]">
      {/* The band head — a quiet Playfair label over the StrataMiniRule (the
          canonical separator), not a card. Depth = value contrast, no shadow. */}
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          Coordination
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          the ball-in-court
        </span>
      </div>
      <StrataMiniRule className="mt-1.5" />

      {/* The ball-in-court summary + "+ New open item" (gated on a resolved
          designerClientId — the composer cannot create without it). */}
      <CourtBar
        projectId={projectId}
        summary={courtSummary}
        onNewItem={designerClientId ? openComposer : () => undefined}
        onJumpCourt={jumpCourt}
      />

      {/* One section per court that carries open items (designer-first). */}
      {groups.map((group) => (
        <CourtGroup
          key={group.court}
          court={group.court}
          items={group.items}
          tasks={allTasks}
          onOpenItem={openItem}
          parties={allParties}
          clientName={clientName}
        />
      ))}

      {/* The work + the dependency web — a blocked ⊘ tick opens its blocker's sheet. */}
      <CoordinationWork projectId={projectId} items={allItems} onOpenItem={openItem} />

      {/* ── Overlays — DocSheet children at the band root so the document stays
          mounted beneath (D1). `open` is band-local state, never a route. ── */}
      <DocSheet
        open={sheet?.kind === 'item' && Boolean(activeItem)}
        onClose={closeSheet}
        title={activeItem ? `Open item — ${activeItem.title}` : 'Open item'}
      >
        {activeItem && (
          <OpenItemSheet
            item={activeItem}
            tasks={allTasks}
            parties={allParties}
            projectId={projectId}
            designerClientId={designerClientId ?? ''}
            clientName={clientName}
            onClose={closeSheet}
          />
        )}
      </DocSheet>

      <DocSheet
        open={sheet?.kind === 'composer' && Boolean(designerClientId)}
        onClose={closeSheet}
        title="New open item"
      >
        {sheet?.kind === 'composer' && designerClientId && (
          <ItemComposer
            projectId={projectId}
            designerClientId={designerClientId}
            tasks={allTasks}
            ffeItems={composerFfe}
            phases={composerPhases}
            parties={allParties}
            onClose={closeSheet}
            onCreated={closeSheet}
          />
        )}
      </DocSheet>
    </section>
  );
}
