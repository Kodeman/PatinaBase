'use client';

/**
 * The Call Sheet (slide 11) — "not a tab; an instrument on the letterhead, and
 * a sheet that opens over the document you were already reading."
 *
 * A 760px DocSheet: the project's whole roster in three groups, each headed by
 * the descending three-rule device (SectionEyebrow) that does all the
 * sectioning — no boxes, no tabs, no accordions. Above them the vitals line,
 * and the action row whose PRIMARY is FROM THE ROLODEX, not NEW PERSON,
 * "because after month two the person you want is already yours" (mnote 2).
 *
 * PRINT prints the sheet and nothing else: a scoped @media print block hides
 * every body child that doesn't contain this sheet's region, then flattens the
 * overlay so the paper is the page. The same trick invoice-folio.tsx uses.
 *
 * Flag-gated on `call-sheet` at this consumer (never in the registry).
 * The chevron's destination — the existing PartyProfileSheet — is the caller's
 * to mount: the sheet forwards `onOpenProfile` rather than stacking a second
 * overlay of its own.
 */

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useProjectRoster, type ProjectRosterRow } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  flattenRoster,
  groupRoster,
  vitalsLine,
  type RosterGroup,
} from '@/lib/document/roster-derivation';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { RosterRow } from './roster-row';
import { RolodexPicker } from './rolodex-picker';

const PRINT_CSS = `@media print {
  body > *:not(:has([data-call-sheet-region])) { display: none !important; }
  [data-doc-sheet-layer] { position: static !important; overflow: visible !important; padding: 0 !important; }
  [data-testid='doc-sheet-backdrop'] { display: none !important; }
  [data-doc-sheet-panel] { position: static !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; }
  .call-sheet-no-print { display: none !important; }
}`;

const GROUP_LABEL: Record<RosterGroup, string> = {
  studioSide: 'Studio side',
  clientSide: 'Client side',
  buildSupply: 'Build & supply',
};

function RosterGroupSection({
  group,
  rows,
  expandedId,
  onToggle,
  onOpenProfile,
}: {
  group: RosterGroup;
  rows: ProjectRosterRow[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onOpenProfile?: (row: ProjectRosterRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-6 first:mt-0">
      <SectionEyebrow count={rows.length}>{GROUP_LABEL[group]}</SectionEyebrow>
      <ul className="border-t border-[var(--color-pearl)]">
        {rows.map((row) => (
          <RosterRow
            key={row.roster_id ?? `${row.source}-${row.display_name}`}
            row={row}
            group={group}
            expanded={expandedId === row.roster_id}
            onToggle={() => onToggle(row.roster_id ?? '')}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </ul>
    </section>
  );
}

/** document:open-call-sheet's optional mode (FIX 2 — kickoff/instrument open
 *  modes): 'picker' opens straight to the rolodex picker, 'add' opens it
 *  already in its add-a-person state, 'sheet' (the default) just opens the
 *  roster list. Exported so every dispatcher (kickoff-band, letterhead
 *  instrument, ⌘K, the page listener) shares one literal union. */
export type CallSheetOpenMode = 'sheet' | 'picker' | 'add';

export function CallSheet({
  open,
  onClose,
  projectId,
  projectTitle,
  clientName,
  clientProfileId,
  onOpenProfile,
  openMode = 'sheet',
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  clientName?: string | null;
  /** The document's `client_profile_id` — with `clientName`, the synthetic
   *  client row that leads the CLIENT SIDE group (Wave 5). */
  clientProfileId?: string | null;
  /** The chevron's destination — the caller mounts PartyProfileSheet. */
  onOpenProfile?: (row: ProjectRosterRow) => void;
  /** See {@link CallSheetOpenMode}. The sheet still opens underneath a
   *  'picker'/'add' pre-address — putting the picker back lands on the full
   *  roster, same as opening the picker from inside the sheet does. */
  openMode?: CallSheetOpenMode;
}) {
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const { data: rows, isLoading } = useProjectRoster(open ? projectId : null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStartsInAdd, setPickerStartsInAdd] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const roster = useMemo(() => rows ?? [], [rows]);
  // The project's own client (Wave 5). `v_project_roster` has no client
  // branch, so the document hands their identity down and groupRoster
  // prepends a synthetic row — unless a party row already claims them.
  const groups = useMemo(
    () =>
      groupRoster(roster, {
        name: clientName,
        profileId: clientProfileId ?? null,
        projectId,
      }),
    [roster, clientName, clientProfileId, projectId],
  );
  // The vitals count what the sheet SHOWS — the synthetic client included, so
  // the mono line and the groups beneath it can never disagree.
  const shown = useMemo(() => flattenRoster(groups), [groups]);
  const vitals = useMemo(() => vitalsLine(shown), [shown]);
  const empty = !isLoading && shown.length === 0;

  // FIX 2 — a doorway can pre-address the picker instead of landing on the
  // roster list first. Inlined (not via openPicker below) so this hook still
  // runs unconditionally, before the flag's early return. Keyed on
  // [open, openMode] rather than a closed→open transition ref: the kickoff
  // band's doorways are unreachable once the sheet's own backdrop is up, so
  // re-firing on an already-open sheet never happens in practice, and this
  // form also fires correctly the first time openMode arrives already 'true'
  // (e.g. a test mounting straight into an open+pre-addressed sheet).
  useEffect(() => {
    if (!open || openMode === 'sheet') return;
    setAdded(null);
    setPickerStartsInAdd(openMode === 'add');
    setPickerOpen(true);
  }, [open, openMode]);

  if (!callSheetOn) return null;

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
            Everyone on {projectTitle}, and how to reach them.
          </p>
          {clientName && (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
              {clientName}
            </p>
          )}
          <p
            data-call-sheet-vitals
            className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
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
              onClick={() => openPicker(true)}
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
              role="status"
              className="call-sheet-no-print mt-4 border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2.5 text-[0.74rem] text-[#6f8268]"
            >
              {added}
            </p>
          )}

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
              {(['studioSide', 'clientSide', 'buildSupply'] as RosterGroup[]).map(
                (group) => (
                  <RosterGroupSection
                    key={group}
                    group={group}
                    rows={groups[group]}
                    expandedId={expandedId}
                    onToggle={(id) =>
                      setExpandedId((cur) => (cur === id ? null : id))
                    }
                    onOpenProfile={onOpenProfile}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </DocSheet>

      <RolodexPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId}
        startInAdd={pickerStartsInAdd}
        onAdded={(name) => setAdded(`${name} is on the call sheet.`)}
      />
    </>
  );
}
