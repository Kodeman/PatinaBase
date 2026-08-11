/**
 * The gate — the one thing the margin, the guide, and the Desk all key to
 * (ratified Rulings III, V, and VI).
 *
 * A gate is a party, a set of terms, a due moment, and exactly one act. It is
 * derived from the 00442/00443 contextual-handoffs projection, which is kept
 * whole: this module reads that read model and never re-resolves sender,
 * recipient, owner, or provenance for itself.
 *
 * Designer-facing copy carries no checksum, no "Exact phase / Source domain"
 * attribution, and no escalation boolean. Stage provenance survives as
 * microtext. Commercial language stays actor-neutral: the terms describe the
 * evidence a gate is waiting on, never who buys, holds funds, or owns goods.
 */

import type { ProjectContextualHandoff } from '@patina/supabase';
import { RESIDENTIAL_WORKFLOW_STAGES } from '@patina/types';

import {
  deriveOverdue,
  overdueElapsedPhrase,
  type OverdueCondition,
} from './overdue-condition';
import type { SectionKey } from './desk-derivation';

/** The four named acts, each mapping 1:1 onto one lifecycle mutation. `open`
 *  carries no mutation of its own — it hands the act to the surface that owns
 *  it (the approval ceremony), which is why it is named apart from the four. */
export type GateActKind = 'nudge' | 'approve' | 'redo' | 'close' | 'open';

export interface GateAct {
  kind: GateActKind;
  label: string;
}

export interface WorkflowGate {
  /** Stable identity: the projection's source kind + id. */
  id: string;
  sourceKind: ProjectContextualHandoff['sourceKind'];
  sourceId: string;
  sourceState: string;
  projectId: string;
  /** The canonical stage key this gate is keyed by (Ruling V). Null where the
   *  projection could not classify the phase; the gate still stands. */
  canonicalStageKey: string | null;
  /** Lane attribution — "With Marta", "With Hale Joinery". */
  lane: string;
  /** The need line: what this gate is waiting on, in one phrase. */
  terms: string;
  /** Stage provenance, demoted to microtext. */
  provenance: string;
  dueAt: string | null;
  overdue: OverdueCondition;
  act: GateAct | null;
}

/** The anchor a gate's act publishes in the margin. The guide's action names
 *  this id rather than inventing a surface of its own (DECISIONS I110). */
export function handoffAnchorId(sourceId: string): string {
  return `document-handoff-${sourceId}`;
}

const STAGE_TITLES = new Map<string, string>(
  RESIDENTIAL_WORKFLOW_STAGES.map((stage) => [
    stage.key,
    `Stage ${stage.number} · ${stage.title}`,
  ]),
);

function sentence(value: string): string {
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function trackLabel(track: string | null): string | null {
  if (!track) return null;
  return track === 'ffe' ? 'FF&E' : sentence(track).toLowerCase();
}

/** The single stage vocabulary: the canonical titles, never a local map. */
export function gateStageLabel(
  canonicalStageKey: string | null,
): string | null {
  if (!canonicalStageKey) return null;
  return STAGE_TITLES.get(canonicalStageKey) ?? sentence(canonicalStageKey);
}

/**
 * Who the gate sits with. The projection labels a site party from its own
 * snapshot; a client recipient carries no label there, so the document's own
 * client name stands in rather than a bare role noun.
 */
function laneFor(
  handoff: ProjectContextualHandoff,
  clientName: string | null,
): string {
  const recipient = handoff.responsibility.recipient;
  if (recipient.label) return `With ${recipient.label}`;
  if (recipient.kind === 'client') {
    return clientName ? `With ${clientName}` : 'With the client';
  }
  if (recipient.kind === 'studio') return 'With the studio';
  return 'With the site party';
}

/** The gate's terms — the noun phrase naming what it is waiting on. Kept a
 *  noun so the sentence, the margin line, and the act can all compose it. */
function termsFor(handoff: ProjectContextualHandoff): string {
  if (handoff.sourceKind === 'project_approval') {
    return `${handoff.artifact.title} approval`;
  }
  if (handoff.sourceState === 'delivered') return 'delivery';
  if (
    handoff.sourceState === 'awaiting_consent' ||
    handoff.sourceState === 'completed'
  ) {
    return 'Site Request';
  }
  return sentence(handoff.expectedResponse).toLowerCase();
}

/** Stage provenance as microtext. Item counts survive; escalation booleans and
 *  the artifact checksum do not. */
function provenanceFor(handoff: ProjectContextualHandoff): string {
  const parts: string[] = [];
  const stage = gateStageLabel(handoff.canonicalStageKey);
  if (stage) parts.push(stage);
  const track = trackLabel(handoff.workflowTrack);
  if (track) parts.push(track);
  if (handoff.sourceKind === 'project_approval') {
    parts.push(`edition ${handoff.artifact.version}`);
  } else {
    const count = handoff.artifact.itemCount;
    parts.push(`${count} ${count === 1 ? 'item' : 'items'}`);
  }
  return parts.join(' · ');
}

/**
 * The one act. Each of nudge / approve / redo / close maps onto exactly one
 * lifecycle mutation; `open` hands the act to the approval ceremony, which owns
 * publishing and outcome selection. A gate waiting on a party's consent offers
 * no studio act at all — there is nothing the studio may do to it.
 */
function actFor(handoff: ProjectContextualHandoff): GateAct | null {
  if (handoff.sourceKind === 'project_approval') {
    switch (handoff.sourceState) {
      case 'response_required':
        return { kind: 'nudge', label: 'Nudge' };
      case 'ready_to_publish':
        return { kind: 'open', label: 'Publish' };
      case 'review_required':
        return { kind: 'open', label: 'Review' };
      default:
        return { kind: 'open', label: 'Open' };
    }
  }
  switch (handoff.sourceState) {
    case 'awaiting_consent':
      return null;
    case 'completed':
      return { kind: 'close', label: 'Close' };
    case 'delivered':
      return { kind: 'approve', label: 'Review' };
    default:
      return { kind: 'nudge', label: 'Open' };
  }
}

export function deriveGate(
  handoff: ProjectContextualHandoff,
  now: Date,
  clientName: string | null,
): WorkflowGate {
  return {
    id: `${handoff.sourceKind}-${handoff.sourceId}`,
    sourceKind: handoff.sourceKind,
    sourceId: handoff.sourceId,
    sourceState: handoff.sourceState,
    projectId: handoff.projectId,
    canonicalStageKey: handoff.canonicalStageKey,
    lane: laneFor(handoff, clientName),
    terms: termsFor(handoff),
    provenance: provenanceFor(handoff),
    dueAt: handoff.dueAt,
    overdue: deriveOverdue(handoff.dueAt, now, handoff.isOverdue),
    act: actFor(handoff),
  };
}

/** Every gate on a project, overdue first, then by due moment. The projection
 *  already orders by due date; the overdue tier is the Ruling IV re-sort applied
 *  to the same single derivation the stamp and the sentence read. */
export function deriveGates(
  handoffs: readonly ProjectContextualHandoff[] | undefined,
  now: Date,
  clientName: string | null,
): WorkflowGate[] {
  return (handoffs ?? [])
    .map((handoff) => deriveGate(handoff, now, clientName))
    .sort((a, b) => {
      const tier = Number(!a.overdue.isOverdue) - Number(!b.overdue.isOverdue);
      if (tier !== 0) return tier;
      const da = a.dueAt
        ? new Date(a.dueAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const db = b.dueAt
        ? new Date(b.dueAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      return da - db || a.id.localeCompare(b.id);
    });
}

/** The nearest open gate — the one the guide speaks for. A gate with no act is
 *  not open to the studio, so it never becomes the guide's subject. */
export function nearestOpenGate(
  gates: readonly WorkflowGate[],
): WorkflowGate | null {
  return gates.find((gate) => gate.act !== null) ?? null;
}

// ── The gate rendered as a sentence ────────────────────────────────────────

/** The guide headline and the Desk need line are the same sentence, because
 *  they are the same gate read at two scales (Rulings V and VI). */
export function gateSentence(gate: WorkflowGate): string {
  const elapsed = overdueElapsedPhrase(gate.overdue);
  const party = gatePartyName(gate);
  // Overdue changes the sentence's tense: from what is pending to how long it
  // has been pending. That is the whole of Ruling IV's second rendering.
  if (elapsed) return `${party}'s ${gate.terms} has waited ${elapsed}.`;
  switch (gate.sourceState) {
    case 'ready_to_publish':
      return `${gate.terms} is ready for ${party}.`;
    case 'review_required':
      return `${gate.terms} is waiting on its review confirmation.`;
    case 'changes_requested':
      return `${gate.terms} came back with changes requested.`;
    case 'needs_discussion':
      return `${gate.terms} is held for discussion.`;
    case 'delivered':
      return `The ${gate.terms} from ${party} is ready to review.`;
    case 'completed':
      return `The ${gate.terms} with ${party} is ready to close.`;
    case 'awaiting_consent':
      return `The ${gate.terms} is waiting on ${party}'s consent.`;
    default:
      return `${sentence(gate.terms)} is with ${party}.`;
  }
}

/** The party the gate sits with, without the lane's leading preposition. */
export function gatePartyName(gate: WorkflowGate): string {
  return gate.lane.replace(/^With /, '');
}

/** The act label the guide offers, named for what it does. */
export function gateActionLabel(gate: WorkflowGate): string {
  switch (gate.act?.kind) {
    case 'nudge':
      return `Nudge ${gatePartyName(gate)}`;
    case 'approve':
      return 'Review the delivery';
    case 'close':
      return 'Close the request';
    case 'open':
      return gate.sourceState === 'ready_to_publish'
        ? `Publish the ${gate.terms}`
        : 'Open the approval';
    default:
      return 'Review now';
  }
}

// ── The Desk's side of the same rule ───────────────────────────────────────

const SECTION_TERMS: Record<SectionKey, string> = {
  brief: 'brief',
  discovery: 'discovery',
  direction: 'Direction approval',
  proposal: 'proposal',
  project: 'project approval',
  install: 'install approval',
  care: 'closeout approval',
};

/**
 * A Desk folio's need line keyed to its nearest open gate. The Desk reads
 * `document_state`, which carries no canonical stage key, so the gate's terms
 * come from the document's own section — the same vocabulary the folio tab
 * already wears. Returns null where the folio's need is not a gate, and the
 * need keeps its own line.
 */
export function deskGateSentence(input: {
  clientName: string;
  activeSection: SectionKey;
  overdue: OverdueCondition;
}): string | null {
  const elapsed = overdueElapsedPhrase(input.overdue);
  if (!elapsed) return null;
  const terms = SECTION_TERMS[input.activeSection];
  return `${input.clientName}'s ${terms} has waited ${elapsed}.`;
}

/**
 * Studio Pulse's one aggregate sentence (Ruling VI) — the shape of the week in
 * a single line, so a designer can read it and stop. It states the gates and
 * nothing else: no badge, no per-population tally, no second act.
 */
export function studioPulseGateSentence(input: {
  folderCount: number;
  overdueCount: number;
  inProductionCount: number;
}): string {
  const { folderCount, overdueCount, inProductionCount } = input;
  if (folderCount === 0 && inProductionCount === 0) {
    return 'Nothing is waiting on the studio.';
  }
  const clauses: string[] = [];
  if (folderCount > 0) {
    clauses.push(
      `${folderCount} ${folderCount === 1 ? 'folio needs' : 'folios need'} your hand`,
    );
    if (overdueCount > 0) clauses.push(`${overdueCount} overdue`);
  }
  if (inProductionCount > 0) {
    clauses.push(
      `${inProductionCount} ${inProductionCount === 1 ? 'piece is' : 'pieces are'} in production`,
    );
  }
  return `${clauses.join(', ')}.`;
}
