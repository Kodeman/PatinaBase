/**
 * Desk folder card (spec v1.1 §7, §10; prototype v0.3 .folder recipe).
 * Depth = flat stacked sheets + value contrast — never shadows (D4).
 * Picking up = following the link to /doc/[engagement_id] (Slice 2).
 */

import Link from 'next/link';
import type { DeskFolder } from '@/lib/document/desk-derivation';
import { fillStateForDesk } from '@/lib/document/fill-state';
import { Stamp } from './stamp';
import { StrataMark } from './strata-mark';

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

/** Tab text = client surname (R1: tab carries the family name). */
function surname(clientName: string): string {
  const parts = clientName.trim().split(/\s+/);
  return parts[parts.length - 1] || clientName;
}

export function FolderCard({ folder }: { folder: DeskFolder }) {
  const { row, need } = folder;
  const phase = prettyPhase(row.current_phase);
  const stageLine = phase
    ? `${SECTION_LABEL[row.active_section]} · ${phase}`
    : SECTION_LABEL[row.active_section];

  return (
    <Link
      href={`/doc/${row.engagement_id}`}
      className="group relative mt-[14px] block rounded-[3px_6px_6px_6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      aria-label={`${row.title} — ${need.text}`}
    >
      {/* Flat stacked edges (D4): two offset solid sheets, no blur, ever. */}
      <div
        aria-hidden
        className="absolute bottom-[-5px] left-[5px] right-[-5px] top-[5px] rounded-[4px_7px_7px_7px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-3)]"
      />
      <div
        aria-hidden
        className="absolute bottom-[-2.5px] left-[2.5px] right-[-2.5px] top-[2.5px] rounded-[4px_7px_7px_7px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]"
      />

      {/* Folder tab — the mark answers "how far" (R15 fill-state) */}
      <div className="absolute -top-[14px] left-[18px] z-[2] flex items-center gap-1.5 rounded-t-[5px] border border-b-0 border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-3.5 pb-[3px] pt-[4px] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        <StrataMark size="sm" fill={fillStateForDesk(row)} />
        {surname(row.client_name)}
      </div>

      {/* Paper face */}
      <div
        className={`relative z-[1] overflow-hidden rounded-[3px_6px_6px_6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-5 py-[1.15rem] transition-transform duration-[180ms] ease-out motion-safe:group-hover:-translate-y-[3px] ${
          need.urgent
            ? 'outline outline-[1.5px] outline-offset-[-1.5px] outline-[rgba(232,197,71,0.55)]'
            : ''
        }`}
      >
        {/* Paper grain — threshold of perception */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,115,85,0.012) 3px, rgba(139,115,85,0.012) 4px)',
          }}
        />
        <h3 className="font-heading text-[1.05rem] font-medium text-[var(--color-charcoal)]">
          {row.title}
        </h3>
        <p className="mb-2.5 mt-0.5 text-[11px] text-[var(--text-muted)]">{stageLine}</p>
        <div className="flex items-start justify-between gap-3 border-t border-[var(--color-pearl)] pt-2.5">
          <p className="flex-1 text-[12px] leading-relaxed text-[var(--text-body)]">{need.text}</p>
          <Stamp label={need.stamp.label} color={need.stamp.color} ink={need.stamp.ink} />
        </div>
      </div>
    </Link>
  );
}
