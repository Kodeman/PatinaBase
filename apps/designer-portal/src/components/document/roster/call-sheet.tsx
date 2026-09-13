'use client';

/**
 * THE CALL SHEET (direction §3.4, SPEC §5.4) — "not a tab; an instrument on the
 * letterhead, and a sheet that opens over the document you were already
 * reading."
 *
 * A 760px DocSheet. At its head: the three acts (From the rolodex first,
 * because after month two the person you want is already yours), the site
 * access card folded to ONE LINE with an inline way in (R-U), and the vitals,
 * whose first number counts THE WINDOW — who is on site this week — not
 * everyone the job has ever listed.
 *
 * Beneath it, six bands: Studio side, Client side, on the job this week, on the
 * job later, Bidding, Done. Build & supply is retired.
 *
 * PRINT prints the sheet and nothing else: a scoped @media print block hides
 * every body child that doesn't contain this sheet's region, then flattens the
 * overlay so the paper is the page. The same trick invoice-folio.tsx uses.
 *
 * NO FLAG. `call-sheet` is retired (rulings §6): the sheet is live for every
 * studio.
 */

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import {
  useOrganizations,
  usePeopleDirectory,
  useProjectConsentOrg,
} from '@patina/supabase';
import {
  callSheetVitalsLine,
  type CallSheetRow,
} from '@/lib/document/roster-derivation';
import { directoryRolodexOrgId } from '@/lib/document/people-derivation';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { AddPersonSheet } from '../people/directory/add-person-sheet';
import { RolodexPicker } from './rolodex-picker';
import { RosterGroups } from './roster-groups';
import { SiteAccessCard, useSiteAccessSummary } from './site-access-card';
import { useCallSheetRoster } from './use-call-sheet-roster';

const PRINT_CSS = `@media print {
  body > *:not(:has([data-call-sheet-region])) { display: none !important; }
  [data-doc-sheet-layer] { position: static !important; overflow: visible !important; padding: 0 !important; }
  [data-testid='doc-sheet-backdrop'] { display: none !important; }
  [data-doc-sheet-panel] { position: static !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; }
  .call-sheet-no-print { display: none !important; }
}`;

/** document:open-call-sheet's optional mode: 'picker' opens straight to the
 *  rolodex picker, 'add' opens it already in its add-a-person state, 'sheet'
 *  (the default) just opens the roster list. Exported so every dispatcher
 *  (kickoff band, letterhead instrument, ⌘K, the page listener) shares one
 *  literal union. */
export type CallSheetOpenMode = 'sheet' | 'picker' | 'add';

export function CallSheet({
  open,
  onClose,
  projectId,
  projectTitle,
  projectAddress,
  clientName,
  clientProfileId,
  onOpenSeat,
  openMode = 'sheet',
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  projectAddress?: string | null;
  clientName?: string | null;
  /** The document's `client_profile_id` — with `clientName`, the client row
   *  that leads CLIENT SIDE when no seat already claims them. */
  clientProfileId?: string | null;
  /** The chevron's destination — the caller mounts the person. */
  onOpenSeat?: (row: CallSheetRow) => void;
  /** See {@link CallSheetOpenMode}. */
  openMode?: CallSheetOpenMode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStartsInAdd, setPickerStartsInAdd] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  // QA-2 — "New person" is the ADD sheet (kind switch, contact rule, consent,
  // authority), a different sheet from "From the rolodex". It used to open the
  // picker's inline form, so the Call Sheet had no way to reach direction
  // §3.5's sheet at all.
  const [addOpen, setAddOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  /**
   * CR11-10 — THE CALL SHEET'S ONE ANNOUNCER.
   *
   * SPEC §7 #3 asks for exactly one live region per screen. The confirmation
   * band, every roster row's own send note and the picker's refusal were three.
   * The band and the note are paper now; this standing sr-only line — always
   * mounted, so a change to its text is announced — says all of them, and the
   * refusal stays a `role="alert"` in the picker.
   */
  const [announcement, setAnnouncement] = useState("");

  const { projection, authorityBySeat, isLoading } = useCallSheetRoster(projectId, {
    client: { name: clientName, profileId: clientProfileId ?? null, projectId },
    enabled: open,
  });
  const { data: consentOrg } = useProjectConsentOrg(open ? projectId : null);
  // The studio that holds the BOOK, for the Add sheet's firm list and its
  // membership-role read — the same fold the Room and the picker use, never
  // `orgs.find(o => o.type === 'design_studio')` over an unordered read. Which
  // studio may hold a new CARD is a different question, and the Add sheet asks
  // the project's own record for it (CR5-1).
  const { data: orgs } = useOrganizations();
  const { data: directory } = usePeopleDirectory();
  const bookOrgId = useMemo(() => {
    const sorted = [...(orgs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const memberOrgId =
      sorted.find((o) => o.type === 'design_studio')?.id ?? sorted[0]?.id ?? null;
    return directoryRolodexOrgId(directory ?? []) ?? memberOrgId;
  }, [orgs, directory]);
  const accessLine = useSiteAccessSummary(
    open ? projectId : null,
    projection.rows,
    authorityBySeat,
  );

  const vitals = useMemo(() => callSheetVitalsLine(projection), [projection]);
  const empty = !isLoading && projection.rows.length === 0;

  // A doorway can pre-address the picker instead of landing on the roster list
  // first. Keyed on [open, openMode] rather than a closed→open transition ref:
  // the kickoff band's doorways are unreachable once the sheet's own backdrop
  // is up, so re-firing on an already-open sheet never happens in practice.
  useEffect(() => {
    if (!open || openMode === 'sheet') return;
    setAdded(null);
    setPickerStartsInAdd(openMode === 'add');
    setPickerOpen(true);
  }, [open, openMode]);

  const openPicker = (startsInAdd: boolean) => {
    setAdded(null);
    setPickerStartsInAdd(startsInAdd);
    setPickerOpen(true);
  };

  return (
    <>
      <DocSheet open={open} onClose={onClose} title="Call sheet" icon={Users} wide>
        <style>{PRINT_CSS}</style>
        <div data-call-sheet-region>
          <p className="font-heading text-[1.05rem] italic leading-snug text-[var(--color-charcoal)]">
            Call sheet · {projectTitle}
          </p>

          {/* R-U — the site access card, folded to one line at the head, with
              an inline way in. Leah's third task is one click from here. */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {accessLine && (
              <p data-site-access-line className="text-[0.78rem] text-[var(--color-charcoal)]">
                {accessLine}
              </p>
            )}
            <button
              type="button"
              onClick={() => setAccessOpen(true)}
              className="call-sheet-no-print inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-charcoal)] underline decoration-[var(--color-clay)] underline-offset-4"
            >
              Open the site access card
            </button>
          </div>

          <p
            data-call-sheet-vitals
            className="mt-2 font-mono text-[11px] tracking-[0.06em] text-[var(--color-aged-oak)]"
          >
            {vitals}
          </p>

          <DocumentActionGroup
            surfaceKey="call-sheet"
            regionKey="call-sheet-actions"
            className="call-sheet-no-print mt-4 border-b border-[var(--color-pearl)] pb-4"
            aria-label="Call sheet actions"
          >
            <DocumentAction
              actionKey="open-rolodex-picker"
              variant="primary"
              onClick={() => openPicker(false)}
            >
              From the rolodex
            </DocumentAction>
            <DocumentAction
              actionKey="add-new-person"
              variant="secondary"
              onClick={() => {
                setAdded(null);
                setAddOpen(true);
              }}
            >
              New person
            </DocumentAction>
            <DocumentAction
              actionKey="print-call-sheet"
              variant="tertiary"
              onClick={() => window.print()}
            >
              Print
            </DocumentAction>
          </DocumentActionGroup>

          {added && (
            <p
              data-call-sheet-added
              className="call-sheet-no-print mt-4 border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2.5 text-[0.74rem] text-[#6f8268]"
            >
              {added}
            </p>
          )}

          <p
            role="status"
            aria-live="polite"
            data-call-sheet-announcer
            className="sr-only"
          >
            {announcement}
          </p>

          {isLoading && (
            <p className="py-8 text-center text-[0.74rem] text-[var(--color-aged-oak)]">
              Reading the call sheet…
            </p>
          )}

          {empty && (
            <div className="mt-6 border-t border-[var(--color-pearl)] pt-6">
              <p className="text-[0.8rem] text-[var(--color-aged-oak)]">
                – No one is on the call sheet yet.
              </p>
              <button
                type="button"
                onClick={() => openPicker(false)}
                className="call-sheet-no-print mt-2 inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-charcoal)] underline decoration-[var(--color-clay)] underline-offset-4"
              >
                Add the first name
              </button>
            </div>
          )}

          {!isLoading && !empty && (
            <div className="mt-5">
              <RosterGroups
                projection={projection}
                authorityBySeat={authorityBySeat}
                consentOrg={consentOrg}
                projectName={projectTitle}
                onOpenSeat={onOpenSeat}
                onAnnounce={setAnnouncement}
              />
            </div>
          )}
        </div>
      </DocSheet>

      <SiteAccessCard
        open={accessOpen}
        onClose={() => setAccessOpen(false)}
        projectId={projectId}
        projectTitle={projectTitle}
        projectAddress={projectAddress}
        projection={projection}
        authorityBySeat={authorityBySeat}
        onOpenSeat={onOpenSeat}
      />

      <RolodexPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        startInAdd={pickerStartsInAdd}
        onAdded={(name) => {
          setAdded(`${name} is on the call sheet.`);
          setAnnouncement(`${name} is on the call sheet.`);
        }}
      />

      {/* QA-2 — the Add/Edit sheet itself, opened on this job. */}
      <AddPersonSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        organizationId={bookOrgId}
        initialProjectId={projectId}
        onAdded={(message) => {
          setAdded(message);
          setAnnouncement(message);
          setAddOpen(false);
        }}
      />
    </>
  );
}
