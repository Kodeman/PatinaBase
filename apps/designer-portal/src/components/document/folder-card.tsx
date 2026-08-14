'use client';

/**
 * Desk folio card (Desk light restyle).
 *
 * The "job document you can pick up": a status-colored folder tab over a white
 * paper face, with two tinted sheets stacked behind for depth. Picking up =
 * following the link to /doc/[engagement_id], or — for a need whose act isn't
 * "open the document" (R36, the overdue-invoice need) — opening that Drawer
 * ledger. The paper offsets carry the depth without a shadow or hover lift.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { folderTab, type DeskFolder } from '@/lib/document/desk-derivation';
import { documentEvents } from '@/lib/analytics/document-events';
import { StatusChip } from './status-chip';
import { openLedger } from './command-bar';
import { TriageBar } from './triage-bar';
import { DocumentAction, DocumentActionGroup } from './document-action';

export const DESK_FOLIO_PREVIEW_LIMIT = 4;

const SECTION_LABEL: Record<string, string> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

function prettyPhase(phase: string | null): string | null {
  if (!phase) return null;
  return phase
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function NeedsYourHandFolios({
  folders,
}: {
  folders: readonly DeskFolder[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [mountedFolderIds, setMountedFolderIds] = useState(
    () =>
      new Set(
        folders
          .slice(0, DESK_FOLIO_PREVIEW_LIMIT)
          .map((folder) => folder.row.engagement_id),
      ),
  );
  const hasOverflow = folders.length > DESK_FOLIO_PREVIEW_LIMIT;
  const foldedCount = Math.max(0, folders.length - DESK_FOLIO_PREVIEW_LIMIT);
  const foldedUrgentCount = folders
    .slice(DESK_FOLIO_PREVIEW_LIMIT)
    .filter((folder) => folder.need.urgent).length;

  // Keep any folio that has genuinely been in reach mounted after it folds.
  // This preserves card-local mutation and telemetry state without mounting
  // never-seen actions behind the initial fold.
  useEffect(() => {
    const visibleIds = folders
      .slice(0, DESK_FOLIO_PREVIEW_LIMIT)
      .map((folder) => folder.row.engagement_id);
    setMountedFolderIds((current) => {
      if (visibleIds.every((id) => current.has(id))) return current;
      return new Set([...current, ...visibleIds]);
    });
  }, [folders]);

  return (
    <>
      <div
        id="needs-your-hand-folios"
        className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2"
      >
        {folders.map((folder, index) => {
          const visible = expanded || index < DESK_FOLIO_PREVIEW_LIMIT;
          const mounted =
            visible || mountedFolderIds.has(folder.row.engagement_id);
          if (!mounted) return null;
          return (
            <div
              key={folder.row.engagement_id}
              hidden={!visible}
              data-tour-anchor={index === 0 ? 'desk-folio' : undefined}
            >
              <FolderCard folder={folder} visible={visible} />
            </div>
          );
        })}
      </div>

      {hasOverflow && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--border-subtle)] pt-2">
          <p
            className="doc-type-meta uppercase tracking-[0.08em]"
            aria-live="polite"
          >
            {expanded
              ? `All ${folders.length} folios in reach`
              : `${DESK_FOLIO_PREVIEW_LIMIT} in reach · ${foldedCount} folded below${
                  foldedUrgentCount > 0
                    ? ` · ${foldedUrgentCount} time-sensitive`
                    : ''
                }`}
          </p>
          <DocumentActionGroup
            surfaceKey="desk"
            regionKey="needs-your-hand"
            aria-label="Needs your hand display"
          >
            <DocumentAction
              actionKey={expanded ? 'fold-folios' : 'reveal-folios'}
              variant="tertiary"
              aria-expanded={expanded}
              aria-controls="needs-your-hand-folios"
              trailing={expanded ? '↑' : '↓'}
              onClick={() => {
                if (!expanded) {
                  setMountedFolderIds(
                    new Set(folders.map((folder) => folder.row.engagement_id)),
                  );
                }
                setExpanded((value) => !value);
              }}
            >
              {expanded
                ? 'Fold to four'
                : `Reveal ${foldedCount} more ${foldedCount === 1 ? 'folio' : 'folios'}`}
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </>
  );
}

export function FolderCard({
  folder,
  visible = true,
}: {
  folder: DeskFolder;
  visible?: boolean;
}) {
  const { row, need } = folder;
  const section = SECTION_LABEL[row.active_section] ?? row.active_section;
  const phase = prettyPhase(row.current_phase);
  const stageLine = phase ? `${section} · ${phase}` : section;
  const tabLabel = `${folderTab(row)} · ${section}`;
  const shown = useRef(false);

  useEffect(() => {
    if (!visible || !need.actionLabel || shown.current) return;
    shown.current = true;
    documentEvents.actionShown({
      surface_key: 'desk',
      region_key: 'needs-your-hand',
      action_key: need.kind,
      variant: 'primary',
      presentation: 'inline',
    });
  }, [need.actionLabel, need.kind, visible]);

  const selectFolioAction = () => {
    if (!need.actionLabel) return;
    if (need.ledger) {
      // R36: for the one NeedKind whose act is a Drawer ledger, the card
      // body is a plain doc-open — NOT the act (that's the inner "Send
      // reminder" control's own onClick, below). A distinct, non-act-named
      // key so this can never be mistaken for the dunning act itself.
      documentEvents.actionSelected({
        surface_key: 'desk',
        region_key: 'needs-your-hand',
        action_key: 'open_document',
        variant: 'primary',
        presentation: 'inline',
      });
      return;
    }
    documentEvents.actionSelected({
      surface_key: 'desk',
      region_key: 'needs-your-hand',
      action_key: need.kind,
      variant: 'primary',
      presentation: 'inline',
    });
  };

  // R36: the overdue-invoice need still opens the Accounts book onto
  // Receivables (where the dunning act lives) rather than the document — but
  // the card itself always routes to the doc now (A1); the ledger act is the
  // explicit inner "Send reminder" control in FolderFace.
  //
  // The pick-up Link is a full-bleed sibling BEHIND the face, not a wrapper
  // AROUND it — a <button>/TriageBar descendant of an <a> is invalid
  // interactive-in-interactive nesting (HTML5 content model; browsers don't
  // auto-correct it and React doesn't warn). It renders first, so it's first
  // in DOM/tab order; FolderFace's content is pointer-events-none above it,
  // except its own interactive controls, which opt back in with
  // pointer-events-auto so clicks land on them instead of falling through.
  return (
    <div className="group relative mt-[26px] w-full">
      <Link
        href={need.deepLink ?? `/doc/${row.engagement_id}`}
        onClick={selectFolioAction}
        aria-label={`${row.title} — ${need.text}`}
        data-action-key={need.actionLabel ? need.kind : undefined}
        data-action-variant={need.actionLabel ? 'primary' : undefined}
        data-action-region={need.actionLabel ? 'needs-your-hand' : undefined}
        className="absolute inset-0 block cursor-grab rounded-[0_8px_8px_8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] active:cursor-grabbing"
      />
      <FolderFace folder={folder} stageLine={stageLine} tabLabel={tabLabel} />
    </div>
  );
}

function FolderFace({
  folder,
  stageLine,
  tabLabel,
}: {
  folder: DeskFolder;
  stageLine: string;
  tabLabel: string;
}) {
  const { row, need } = folder;
  return (
    <>
      {/* Two tinted sheets behind the face — the other pages in the folder.
          Nudged down/right so the folio reads as a stack (depth, not shadow).
          pointer-events-none: purely decorative, and — since the pick-up
          Link is now a sibling behind this face, not an ancestor — a click
          here must fall through to it, not be silently swallowed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--doc-sheet-back)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--doc-sheet-front)]"
      />

      {/* The document face — offset paper sheets provide quiet, physical
          depth. pointer-events-none for the same reason as the sheets above:
          every click here should fall through to the pick-up Link EXCEPT
          the face's own interactive controls, which opt back in below with
          pointer-events-auto. */}
      <div className="relative pointer-events-none">
        {/* Folder tab — status color carries the state; type does the rest. */}
        <div
          className="absolute -top-[26px] left-0 flex h-[26px] items-center rounded-t-[7px] px-3.5 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-white"
          style={{ background: need.stamp.color }}
        >
          {tabLabel}
        </div>

        {/* Paper face */}
        <div
          className={`rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-7 ${
            need.urgent
              ? 'outline outline-[1.5px] outline-offset-[-1.5px] outline-[rgba(232,197,71,0.6)]'
              : ''
          }`}
        >
          <h3 className="font-heading text-[1.6rem] font-medium leading-tight text-[var(--text-primary)]">
            {row.title}
          </h3>
          <p className="doc-type-meta mt-1">{stageLine}</p>
          {/* R106 §3: the parked-ceremony card's held-draft preview. Renders
              ONLY for that one NeedKind — every other folder face stays
              byte-identical (the flag-off safety net at this layer). */}
          {need.kind === 'ceremony_pending' && need.sub && (
            <p className="mt-2 font-heading text-[14px] italic leading-snug text-[var(--text-body)]">
              {need.sub}
            </p>
          )}
          <div className="mt-4 flex items-start justify-between gap-3 border-t border-[var(--border-default)] pt-3.5">
            <p className="doc-type-body flex-1">{need.text}</p>
            <StatusChip label={need.stamp.label} color={need.stamp.color} />
          </div>
          {/* R61/R65: a lead is the one need whose act is a triage, not a pick-up
              — for a new lead AND for a nurtured lead whose reconnect is now due.
              pointer-events-auto opts this control back in over the
              pointer-events-none face (the pick-up Link sits behind, as a
              sibling — not an ancestor — of this whole card, so there's no
              enclosing <a> left for the bar's own guard() to have to stop).
              Shape C always carries lead_id. */}
          {(need.kind === 'new_lead' || need.kind === 'reconnect_due') &&
            row.lead_id && (
              <div className="pointer-events-auto relative">
                <TriageBar
                  leadId={row.lead_id}
                  variant="desk"
                  arrivalEligible={Boolean(row.client_profile_id)}
                />
              </div>
            )}
          {need.actionLabel &&
            (need.ledger ? (
              // R36: the one NeedKind (overdue_invoice) whose act isn't the
              // card's own pick-up — an explicit inner control, not the whole
              // card, so the card surface can route to the doc (A1). A
              // SIBLING of the pick-up Link (never a descendant — nesting a
              // <button> inside an <a> is invalid HTML5 content model), so
              // preventDefault+stopPropagation below is defensive (no click
              // could reach the Link's own handler regardless) rather than
              // load-bearing. pointer-events-auto opts back in over the
              // pointer-events-none face. Fires its own actionSelected with
              // the real act's key — the card body's own click fires a
              // separate, non-act-named 'open_document' key instead
              // (selectFolioAction above).
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  documentEvents.actionSelected({
                    surface_key: 'desk',
                    region_key: 'needs-your-hand',
                    action_key: need.kind,
                    variant: 'primary',
                    presentation: 'inline',
                  });
                  openLedger(need.ledger!.name, need.ledger!.context);
                }}
                aria-label={`${need.actionLabel} — ${row.title}`}
                className="pointer-events-auto relative mt-4 flex min-h-11 w-full items-center justify-between gap-3 border-t border-[var(--color-pearl)] pt-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
              >
                <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                  {need.actionLabel}
                </span>
                <span
                  aria-hidden
                  className="text-[14px] text-[var(--color-clay)]"
                >
                  →
                </span>
              </button>
            ) : (
              <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-[var(--color-pearl)] pt-3">
                <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                  {need.actionLabel}
                </span>
                <span
                  aria-hidden
                  className="text-[14px] text-[var(--color-clay)]"
                >
                  →
                </span>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
