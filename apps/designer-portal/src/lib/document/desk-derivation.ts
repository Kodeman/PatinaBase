/**
 * Desk derivation — spec v1.1 §7, rulings R1/R2.
 *
 * Pure functions from `document_state` rows (migration 00191) to the Desk's
 * two populations: needs-your-hand folders (each with exactly ONE need line —
 * "the one thing") and in-motion chips (never actionable).
 *
 * Deliberately dependency-free: no stages.ts import (it pulls
 * @patina/help-system, the Jest ESM trap), no design-system imports. Stamp
 * colors are CSS-var strings resolved by the portal's globals.css tokens.
 *
 * Thresholds (R10 — Leah-calibrated, Middlewest-authoritative; spec v1.2 §7):
 *   hesitating = sent ≥1 day unopened OR opened ≥2 days unsigned;
 *   lead urgency = deadline inside 24h. Precision watch at Session 02;
 *   per-studio settings when studio #2 onboards.
 */

export type EngagementKind = 'project' | 'proposal' | 'lead' | 'relationship';

export type SectionKey =
  | 'brief'
  | 'discovery'
  | 'direction'
  | 'proposal'
  | 'project'
  | 'install'
  | 'care';

export interface DocumentStateRow {
  engagement_kind: EngagementKind;
  engagement_id: string;
  project_id: string | null;
  proposal_id: string | null;
  lead_id: string | null;
  designer_id: string | null;
  client_profile_id: string | null;
  client_name: string;
  title: string;
  project_status: string | null;
  current_phase: string | null;
  active_section: SectionKey;
  is_paused: boolean;
  is_archived: boolean;
  proposal_status: string | null;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  lead_response_deadline: string | null;
  lead_status: string | null;
  overdue_decision_count: number;
  earliest_overdue_due: string | null;
  awaiting_inspection_count: number;
  blocked_item_count: number;
  in_flight_count: number;
  installed_count: number;
  item_count: number;
  updated_at: string;
  /** R7 (00192): open damage claims on this project's POs. */
  open_claim_count: number;
  open_claim_po: string | null;
  /** D5 (00195): current-week draft pulses (rise on the Desk Friday). */
  unsent_pulse_count: number;
  pulse_week_of: string | null;
}

export type NeedKind =
  | 'overdue_decision'
  | 'proposal_signed'
  | 'damage_claim'
  | 'proposal_declined'
  | 'proposal_expired'
  | 'new_lead'
  | 'hesitating_proposal'
  | 'awaiting_inspection'
  | 'pulse_due';

export interface NeedLine {
  kind: NeedKind;
  text: string;
  /** `color` is the stamp border; `ink` (optional) darkens the text for
   *  contrast on paper, per the prototype's stamp treatment. */
  stamp: { label: string; color: string; ink?: string };
  urgent: boolean;
}

export interface DeskFolder {
  row: DocumentStateRow;
  need: NeedLine;
}

export interface MotionChip {
  row: DocumentStateRow;
  text: string;
}

const DAY_MS = 86_400_000;
const HESITATION_UNOPENED_DAYS = 1;
const HESITATION_UNSIGNED_DAYS = 2;
const LEAD_URGENT_WINDOW_MS = 24 * 3_600_000;
const MAX_MOTION_CHIPS = 6;

/** Severity rank — lower sorts first within the needs stack. */
const NEED_RANK: Record<NeedKind, number> = {
  overdue_decision: 0,
  proposal_signed: 1,
  damage_claim: 2,
  proposal_declined: 3,
  proposal_expired: 4,
  new_lead: 5,
  hesitating_proposal: 6,
  awaiting_inspection: 7,
  pulse_due: 8,
};

/** Prototype stamp palette (v0.3 is the look authority): borders use brand
 *  vars; warm-toned stamps darken their text ink for contrast on paper.
 *  Golden Hour is reserved for the urgent folder outline, never stamp text. */
const STAMP = {
  due: { color: 'var(--color-terracotta)', ink: '#C4836F' },
  terracotta: { color: 'var(--color-terracotta)', ink: '#C4836F' },
  clay: { color: 'var(--color-clay)', ink: '#A8895E' },
  dustyBlue: { color: 'var(--color-dusty-blue)' },
  sage: { color: 'var(--color-sage)', ink: '#85947C' },
} as const;

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));

const daysBetween = (earlierIso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(earlierIso).getTime()) / DAY_MS);

/** Words that mean "we don't actually know the client" — the view's
 *  fallbacks and seed-account role nouns. The tab never wears them (R16). */
const ROLE_NOUNS = new Set(['client', 'user']);

/** Folder-tab text (R1: the family name; R16 fallback: when no surname
 *  resolves, the first word of the document title — never a role noun). */
export function folderTab(row: Pick<DocumentStateRow, 'client_name' | 'title'>): string {
  const parts = (row.client_name ?? '').trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  if (last && !ROLE_NOUNS.has(last.toLowerCase())) return last;
  const firstOfTitle = (row.title ?? '').trim().split(/\s+/)[0];
  return firstOfTitle || last || '—';
}

/** The ONE thing this engagement needs from the designer today, or null. */
export function deriveNeed(row: DocumentStateRow, now: Date): NeedLine | null {
  if (row.is_archived || row.is_paused) return null;

  if (row.overdue_decision_count > 0) {
    const oldest = row.earliest_overdue_due ? ` — oldest due ${fmtDay(row.earliest_overdue_due)}` : '';
    const n = row.overdue_decision_count;
    return {
      kind: 'overdue_decision',
      text: n === 1 ? `1 decision overdue${oldest}` : `${n} decisions overdue${oldest}`,
      stamp: { label: 'DECISION DUE', ...STAMP.due },
      urgent: true,
    };
  }

  if (row.engagement_kind === 'proposal') {
    // Signed but no project row yet (DECISIONS.md I7): the signing moment
    // is waiting on the designer's hand — activation opens the project.
    if (row.proposal_status === 'accepted') {
      return {
        kind: 'proposal_signed',
        text: 'Signed — open the project',
        stamp: { label: 'SIGNED', ...STAMP.sage },
        urgent: false,
      };
    }
    if (row.proposal_status === 'declined') {
      return {
        kind: 'proposal_declined',
        text: 'Proposal declined — follow up',
        stamp: { label: 'DECLINED', ...STAMP.terracotta },
        urgent: false,
      };
    }
    if (row.proposal_status === 'expired') {
      return {
        kind: 'proposal_expired',
        text: 'Proposal expired — revise or follow up',
        stamp: { label: 'EXPIRED', ...STAMP.terracotta },
        urgent: false,
      };
    }
    if (row.proposal_status === 'sent' && row.proposal_sent_at && !row.proposal_viewed_at) {
      const days = daysBetween(row.proposal_sent_at, now);
      if (days >= HESITATION_UNOPENED_DAYS) {
        return {
          kind: 'hesitating_proposal',
          text: `Sent ${fmtDay(row.proposal_sent_at)} — not yet opened`,
          stamp: { label: 'SENT', ...STAMP.dustyBlue },
          urgent: false,
        };
      }
    }
    if (row.proposal_status === 'viewed' && row.proposal_viewed_at) {
      const days = daysBetween(row.proposal_viewed_at, now);
      if (days >= HESITATION_UNSIGNED_DAYS) {
        return {
          kind: 'hesitating_proposal',
          text: `Opened ${fmtDay(row.proposal_viewed_at)} — no signature yet`,
          stamp: { label: 'VIEWED', ...STAMP.dustyBlue },
          urgent: false,
        };
      }
    }
    return null;
  }

  if (row.engagement_kind === 'lead') {
    const deadline = row.lead_response_deadline;
    const msLeft = deadline ? new Date(deadline).getTime() - now.getTime() : null;
    const closing = msLeft !== null && msLeft < LEAD_URGENT_WINDOW_MS;
    const text =
      deadline === null
        ? 'New lead — respond'
        : msLeft! < 0
          ? 'Response window passed — reply anyway'
          : closing
            ? `Respond by ${fmtDay(deadline)} — closing soon`
            : `New lead — respond by ${fmtDay(deadline)}`;
    return {
      kind: 'new_lead',
      text,
      stamp: { label: 'NEW LEAD', ...STAMP.clay },
      urgent: closing,
    };
  }

  // R7: claims surface at the grain where they are true — the PO. The line
  // stamp stays suppressed until per-item attribution exists (Slice 4).
  if (row.open_claim_count > 0) {
    const n = row.open_claim_count;
    return {
      kind: 'damage_claim',
      text:
        n === 1
          ? `${row.open_claim_po ?? 'A delivery'} has an open damage claim`
          : `${n} open damage claims — review receiving`,
      stamp: { label: 'CLAIM OPEN', ...STAMP.terracotta },
      urgent: false,
    };
  }

  if (row.awaiting_inspection_count > 0) {
    const n = row.awaiting_inspection_count;
    return {
      kind: 'awaiting_inspection',
      text:
        n === 1
          ? '1 piece delivered — awaiting inspection'
          : `${n} pieces delivered — awaiting inspection`,
      stamp: { label: 'DELIVERED', ...STAMP.sage },
      urgent: false,
    };
  }

  // D5: Friday unsent Pulses rise on the Desk — never earlier in the week.
  if (row.unsent_pulse_count > 0 && row.pulse_week_of) {
    const monday = new Date(`${row.pulse_week_of}T00:00:00`);
    const friday = monday.getTime() + 4 * DAY_MS;
    if (now.getTime() >= friday) {
      return {
        kind: 'pulse_due',
        text: 'Friday Pulse drafted — review & send',
        stamp: { label: 'PULSE', ...STAMP.sage },
        urgent: false,
      };
    }
  }

  return null;
}

/** One quiet line for an engagement progressing without the designer. */
export function deriveMotion(row: DocumentStateRow, now: Date): string | null {
  if (row.is_archived) return null;
  if (row.is_paused) return 'Paused';

  if (row.engagement_kind === 'proposal') {
    if (row.proposal_status === 'draft') return 'Proposal drafting';
    if (row.proposal_status === 'sent' || row.proposal_status === 'viewed') {
      const since = row.proposal_sent_at ? ` since ${fmtDay(row.proposal_sent_at)}` : '';
      return `With client${since}`;
    }
    return null;
  }

  if (row.engagement_kind === 'relationship') return 'In discovery';

  if (row.in_flight_count > 0) {
    const n = row.in_flight_count;
    return n === 1 ? '1 piece on the way' : `${n} pieces on the way`;
  }

  return null;
}

function needSortKey(folder: DeskFolder): [number, number, number] {
  const { row, need } = folder;
  const date =
    need.kind === 'overdue_decision' && row.earliest_overdue_due
      ? new Date(row.earliest_overdue_due).getTime()
      : need.kind === 'new_lead' && row.lead_response_deadline
        ? new Date(row.lead_response_deadline).getTime()
        : need.kind === 'hesitating_proposal' && row.proposal_sent_at
          ? new Date(row.proposal_sent_at).getTime()
          : new Date(row.updated_at).getTime();
  return [need.urgent ? 0 : 1, NEED_RANK[need.kind], date];
}

/** Split rows into the needs-your-hand stack and the in-motion chips. */
export function partitionDesk(
  rows: DocumentStateRow[],
  now: Date,
): { folders: DeskFolder[]; chips: MotionChip[] } {
  const folders: DeskFolder[] = [];
  const chips: MotionChip[] = [];

  for (const row of rows) {
    if (row.is_archived) continue;
    const need = deriveNeed(row, now);
    if (need) {
      folders.push({ row, need });
      continue;
    }
    const motion = deriveMotion(row, now);
    if (motion) chips.push({ row, text: motion });
  }

  folders.sort((a, b) => {
    const ka = needSortKey(a);
    const kb = needSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });

  return { folders, chips: chips.slice(0, MAX_MOTION_CHIPS) };
}
