'use client';

/**
 * Desk folio card (Desk light restyle).
 *
 * The "job document you can pick up": a status-colored folder tab over a white
 * paper face, with two tinted sheets stacked behind for depth. Picking up =
 * following the link to /doc/[engagement_id], or — for a need whose act isn't
 * "open the document" (R36, the overdue-invoice need) — opening that Drawer
 * ledger. The pickup lift + drop-shadow live in globals.css (`.folio-face`),
 * gated to no-preference motion, so the D4 shadow-ban lint stays enforced in
 * TSX everywhere else.
 */

import Link from 'next/link';
import { folderTab, type DeskFolder } from '@/lib/document/desk-derivation';
import { StatusChip } from './status-chip';
import { openLedger } from './command-bar';
import { TriageBar } from './triage-bar';

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

export function FolderCard({ folder }: { folder: DeskFolder }) {
  const { row, need } = folder;
  const section = SECTION_LABEL[row.active_section] ?? row.active_section;
  const phase = prettyPhase(row.current_phase);
  const stageLine = phase ? `${section} · ${phase}` : section;
  const tabLabel = `${folderTab(row)} · ${section}`;

  // R36: the overdue-invoice need opens the Accounts book onto Receivables
  // (where the dunning act lives), not the document. Same paper face either way.
  const cardClassName =
    'group relative mt-[26px] block w-full cursor-grab rounded-[0_8px_8px_8px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] active:cursor-grabbing';
  const inner = <FolderFace folder={folder} stageLine={stageLine} tabLabel={tabLabel} />;

  if (need.ledger) {
    return (
      <button
        type="button"
        onClick={() => openLedger(need.ledger!.name, need.ledger!.context)}
        className={cardClassName}
        aria-label={`${row.title} — ${need.text}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={need.deepLink ?? `/doc/${row.engagement_id}`}
      className={cardClassName}
      aria-label={`${row.title} — ${need.text}`}
    >
      {inner}
    </Link>
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
          Nudged down/right so the folio reads as a stack (depth, not shadow). */}
      <div
        aria-hidden
        className="absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--doc-sheet-back)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--doc-sheet-front)]"
      />

      {/* The document that lifts on pickup — tab + face together. */}
      <div className="folio-face relative">
        {/* Folder tab — status color carries the state; type does the rest. */}
        <div
          className="absolute -top-[26px] left-0 flex h-[26px] items-center rounded-t-[7px] px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
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
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{stageLine}</p>
          {/* R106 §3: the parked-ceremony card's held-draft preview. Renders
              ONLY for that one NeedKind — every other folder face stays
              byte-identical (the flag-off safety net at this layer). */}
          {need.kind === 'ceremony_pending' && need.sub && (
            <p className="mt-2 font-heading text-[14px] italic leading-snug text-[var(--text-body)]">
              {need.sub}
            </p>
          )}
          <div className="mt-4 flex items-start justify-between gap-3 border-t border-[var(--border-default)] pt-3.5">
            <p className="flex-1 text-[13px] leading-relaxed text-[var(--text-body)]">
              {need.text}
            </p>
            <StatusChip label={need.stamp.label} color={need.stamp.color} />
          </div>
          {/* R61/R65: a lead is the one need whose act is a triage, not a pick-up
              — for a new lead AND for a nurtured lead whose reconnect is now due.
              The bar's buttons stopPropagation so they never trip the card's
              link (D1). Shape C always carries lead_id. */}
          {(need.kind === 'new_lead' || need.kind === 'reconnect_due') && row.lead_id && (
            <TriageBar leadId={row.lead_id} variant="desk" />
          )}
        </div>
      </div>
    </>
  );
}
