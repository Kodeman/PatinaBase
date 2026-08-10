/**
 * Spine section derivation — spec v1.1 §4, rulings R1 + D12.
 *
 * Pure function from the engagement's document_state row (00191) + lineage
 * metadata to the seven spine sections, each with state and an honest
 * sub-label. Shared by the spine rail and the settled bars. Sub-labels only
 * claim dates the data actually carries; otherwise they say 'Settled' or '—'.
 */

import type { DocumentStateRow, SectionKey } from './desk-derivation';
import { fmtDay } from './format';

export type SectionState = 'settled' | 'active' | 'future' | 'unrecorded';

export interface SpineSection {
  key: SectionKey;
  label: string;
  state: SectionState;
  sub: string;
}

/**
 * Lineage = the proposal carrying Brief→Proposal history (R1): the activating
 * proposal for signed projects, the live chain proposal pre-signing. null =
 * manual project (sections ghost) or lead/relationship (no proposal yet).
 */
export interface SectionLineage {
  createdAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  status: string | null;
  version: number | null;
}

export interface SectionFacts {
  row: DocumentStateRow;
  lineage: SectionLineage | null;
  projectStartDate: string | null;
  installStartDate: string | null;
}

const ORDER: SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'care',
];

const LABEL: Record<SectionKey, string> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

const WEEK_MS = 7 * 86_400_000;

function prettyPhase(phase: string | null): string {
  if (!phase) return '';
  return phase
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function settledSub(key: SectionKey, f: SectionFacts): string {
  const { lineage } = f;
  switch (key) {
    case 'discovery':
      return lineage?.createdAt ? `Settled · ${fmtDay(lineage.createdAt)}` : 'Settled';
    case 'direction':
      return lineage?.sentAt ? `Settled · ${fmtDay(lineage.sentAt)}` : 'Settled';
    case 'proposal':
      return lineage?.signedAt ? `Signed · ${fmtDay(lineage.signedAt)}` : 'Signed';
    default:
      return 'Settled';
  }
}

function activeSub(key: SectionKey, f: SectionFacts, now: Date): string {
  const { row, lineage, projectStartDate } = f;
  switch (key) {
    case 'brief':
      return row.lead_response_deadline
        ? `Respond by ${fmtDay(row.lead_response_deadline)}`
        : 'New';
    case 'discovery':
      return 'In discovery';
    case 'direction':
      return 'Drafting';
    case 'proposal': {
      const status = row.proposal_status ?? lineage?.status;
      if (status === 'accepted')
        return lineage?.signedAt ? `Signed · ${fmtDay(lineage.signedAt)}` : 'Signed';
      if (status === 'declined') return 'Declined';
      if (status === 'expired') return 'Expired';
      return 'Awaiting signature';
    }
    case 'project': {
      if (!projectStartDate) return 'Active';
      const week = Math.max(
        1,
        Math.floor((now.getTime() - new Date(projectStartDate).getTime()) / WEEK_MS) + 1,
      );
      return `Active · Week ${week}`;
    }
    case 'install':
      return prettyPhase(row.current_phase) || 'Install';
    case 'care':
      return 'Ongoing';
  }
}

function futureSub(key: SectionKey, f: SectionFacts): string {
  if (key === 'install' && f.installStartDate) return fmtDay(f.installStartDate);
  return '—';
}

/** The seven spine sections for one engagement. */
export function deriveSections(f: SectionFacts, now: Date): SpineSection[] {
  const activeIdx = ORDER.indexOf(f.row.active_section);
  // Manual projects (signed shape, no proposal lineage) ghost Brief→Proposal (R1).
  const ghostPast = f.row.engagement_kind === 'project' && f.lineage === null;

  return ORDER.map((key, idx) => {
    let state: SectionState = idx < activeIdx ? 'settled' : idx === activeIdx ? 'active' : 'future';
    if (ghostPast && idx < 4 && state === 'settled') state = 'unrecorded';

    const sub =
      state === 'settled'
        ? settledSub(key, f)
        : state === 'active'
          ? activeSub(key, f, now)
          : state === 'unrecorded'
            ? 'Not recorded'
            : futureSub(key, f);

    return { key, label: LABEL[key], state, sub };
  });
}
