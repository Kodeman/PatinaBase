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
  /** True where the gate's next act is the studio's own. */
  studioLane: boolean;
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
 * The one expected response a household actually owes. Every other approval
 * response in the projection is studio work.
 */
const CLIENT_OWNED_RESPONSE = 'select_approval_outcome';

/**
 * Who the gate sits with.
 *
 * For an approval this reads `expectedResponse` — who must ACT — rather than
 * the projection's `recipient`. The two disagree on one real state: a draft
 * whose confirmations are incomplete is addressed to the client
 * (`recipient = 'client'`, 00442) while the act it is waiting on is the
 * studio's own artifact-review confirmation. Attributing that lane to the
 * household would have the margin claim "With Marta" for work Marta cannot do.
 * Correcting `recipient` itself belongs to the projection, which is out of
 * scope here — this is the reader's override, not a new fact.
 *
 * A site party carries its own snapshot label; a client recipient carries none,
 * so the document's client name stands in rather than a bare role noun.
 */
function laneFor(
  handoff: ProjectContextualHandoff,
  clientName: string | null,
): string {
  const withClient = clientName ? `With ${clientName}` : 'With the client';
  if (handoff.sourceKind === 'project_approval') {
    return handoff.expectedResponse === CLIENT_OWNED_RESPONSE
      ? withClient
      : 'With the studio';
  }
  const recipient = handoff.responsibility.recipient;
  if (recipient.label) return `With ${recipient.label}`;
  if (recipient.kind === 'client') return withClient;
  if (recipient.kind === 'studio') return 'With the studio';
  return 'With the site party';
}

/** True where the gate's next act belongs to the studio itself. */
function isStudioLane(handoff: ProjectContextualHandoff): boolean {
  return (
    handoff.sourceKind === 'project_approval' &&
    handoff.expectedResponse !== CLIENT_OWNED_RESPONSE
  );
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
 * One gate, one act, one verb. Each of nudge / approve / redo / close maps onto
 * exactly one lifecycle mutation; `open` hands the act to the approval
 * ceremony, which owns publishing and outcome selection.
 *
 * The margin prints the verb alone and the guide prints the verb plus its
 * object, so the two scales can never name the same act differently — the
 * margin cannot say "Open" while the guide says "Nudge".
 */
export function gateActVerb(kind: GateActKind, sourceState: string): string {
  switch (kind) {
    case 'nudge':
      return 'Nudge';
    case 'approve':
      return 'Review';
    case 'redo':
      return 'Redo';
    case 'close':
      return 'Close';
    default:
      if (sourceState === 'ready_to_publish') return 'Publish';
      if (sourceState === 'review_required') return 'Review';
      return 'Open';
  }
}

function actKindFor(handoff: ProjectContextualHandoff): GateActKind | null {
  if (handoff.sourceKind === 'project_approval') {
    return handoff.sourceState === 'response_required' ? 'nudge' : 'open';
  }
  switch (handoff.sourceState) {
    case 'awaiting_consent':
      return null;
    case 'completed':
      return 'close';
    case 'delivered':
      return 'approve';
    default:
      return 'nudge';
  }
}

function actFor(handoff: ProjectContextualHandoff): GateAct | null {
  const kind = actKindFor(handoff);
  if (!kind) return null;
  return { kind, label: gateActVerb(kind, handoff.sourceState) };
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
    studioLane: isStudioLane(handoff),
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
  if (elapsed) {
    // A studio-owned gate has no other party to name; saying "the studio's
    // approval has waited" would address the reader in the third person.
    return gate.studioLane
      ? `${sentence(gate.terms)} has waited ${elapsed}.`
      : `${party}'s ${gate.terms} has waited ${elapsed}.`;
  }
  switch (gate.sourceState) {
    // Confirmations are complete and publishing is the studio's own next act —
    // the projection addresses this state to the studio, not the household.
    case 'ready_to_publish':
      return `${sentence(gate.terms)} is ready to publish.`;
    case 'review_required':
      return `${sentence(gate.terms)} is waiting on its review confirmation.`;
    case 'changes_requested':
      return `${sentence(gate.terms)} came back with changes requested.`;
    case 'needs_discussion':
      return `${sentence(gate.terms)} is held for discussion.`;
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

/** The act label the guide offers: the margin's verb plus its object, so the
 *  two scales always name the same act with the same word. */
export function gateActionLabel(gate: WorkflowGate): string {
  if (!gate.act) return 'Review now';
  const verb = gateActVerb(gate.act.kind, gate.sourceState);
  switch (gate.act.kind) {
    case 'nudge':
      return `${verb} ${gatePartyName(gate)}`;
    case 'approve':
      return `${verb} the ${gate.terms}`;
    case 'close':
      return `${verb} the ${gate.terms}`;
    default:
      return `${verb} the ${gate.terms}`;
  }
}

/**
 * Studio Pulse's one aggregate sentence (Ruling VI) — the shape of the week in
 * a single line, so a designer can read it and stop. It states the gates and
 * nothing else: no badge, no per-population tally, no second act.
 */
export function studioPulseGateSentence(input: {
  overdueCount: number;
  onTheWayCount: number;
}): string {
  const { overdueCount, onTheWayCount } = input;
  // "On the way" is the Desk's own word for an in-flight piece (deriveMotion).
  // "In production" would claim a fabrication state the read model never says.
  const onTheWay = `${onTheWayCount} ${onTheWayCount === 1 ? 'piece is' : 'pieces are'} on the way`;
  const overdue = `${overdueCount} ${overdueCount === 1 ? 'decision is' : 'decisions are'} overdue`;
  if (overdueCount === 0 && onTheWayCount === 0) {
    return 'Nothing is overdue, and nothing is on the way.';
  }
  if (overdueCount === 0) return `${sentence(onTheWay)}.`;
  if (onTheWayCount === 0) return `${sentence(overdue)}.`;
  return `${sentence(overdue)}, and ${onTheWay}.`;
}
