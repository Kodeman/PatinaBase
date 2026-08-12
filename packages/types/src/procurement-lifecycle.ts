/**
 * The procurement lifecycle — ONE contract, TWO rails (ruling R7, WP4 Track 1).
 *
 * Fifteen numbered steps and three gates are RENDERING GRAMMAR over read models
 * that already exist. Decision №8 is deliberately left open: nothing here is a
 * stored product object, no step has a table, no transition has a migration.
 * This module defines the vocabulary and the shape of a reading; the two rail
 * mappers answer it from whatever evidence their rail actually carries.
 *
 * Rail B (studio procurement — `purchase_orders` and friends) maps in
 * `apps/designer-portal/src/lib/document/procurement-lifecycle.ts`.
 * Rail A (Patina fulfilment — `fulfillment_*`) maps below, because both the
 * admin portal and the designer portal must read the same fifteen words.
 *
 * The lexicon is ACTOR-NEUTRAL by ruling (§7, folio 14, decision №7 open):
 * every step name describes what happened to the WORK, never who bought,
 * funded, or owned it. "Cleared to produce" not "Authorized"; "Released to
 * maker" not "PO issued". Internal enum values and PO entity names keep their
 * own vocabulary — this is what the glass says, not what the database calls it.
 */

export const PROCUREMENT_LIFECYCLE_STEP_KEYS = [
  'cleared_to_produce',
  'released_to_maker',
  'acknowledged',
  'awaiting_inputs',
  'released',
  'in_production',
  'ready_to_ship',
  'in_transit',
  'received_inspect',
  'accepted_or_issue',
  'stored',
  'install_released',
  'installed',
  'punch_service',
  'closed',
] as const;

export type ProcurementLifecycleStepKey =
  (typeof PROCUREMENT_LIFECYCLE_STEP_KEYS)[number];

export interface ProcurementLifecycleStep {
  key: ProcurementLifecycleStepKey;
  /** 1-based position on the trail — the number the designer reads. */
  ordinal: number;
  /** Rendered verbatim. Actor-neutral; do not paraphrase at a call site. */
  label: string;
}

export const PROCUREMENT_LIFECYCLE_STEPS = [
  { key: 'cleared_to_produce', ordinal: 1, label: 'Cleared to produce' },
  { key: 'released_to_maker', ordinal: 2, label: 'Released to maker' },
  { key: 'acknowledged', ordinal: 3, label: 'Acknowledged' },
  { key: 'awaiting_inputs', ordinal: 4, label: 'Awaiting inputs' },
  { key: 'released', ordinal: 5, label: 'Released' },
  { key: 'in_production', ordinal: 6, label: 'In production' },
  { key: 'ready_to_ship', ordinal: 7, label: 'Ready to ship' },
  { key: 'in_transit', ordinal: 8, label: 'In transit' },
  { key: 'received_inspect', ordinal: 9, label: 'Received / inspect' },
  { key: 'accepted_or_issue', ordinal: 10, label: 'Accepted or issue' },
  { key: 'stored', ordinal: 11, label: 'Stored' },
  { key: 'install_released', ordinal: 12, label: 'Install released' },
  { key: 'installed', ordinal: 13, label: 'Installed' },
  { key: 'punch_service', ordinal: 14, label: 'Punch / service' },
  { key: 'closed', ordinal: 15, label: 'Closed' },
] as const satisfies readonly ProcurementLifecycleStep[];

export const PROCUREMENT_LIFECYCLE_GATE_KEYS = [
  'complete_to_produce',
  'received_and_dispositioned',
  'warehouse_and_site_ready',
] as const;

export type ProcurementLifecycleGateKey =
  (typeof PROCUREMENT_LIFECYCLE_GATE_KEYS)[number];

export interface ProcurementLifecycleGate {
  key: ProcurementLifecycleGateKey;
  label: string;
  /**
   * The gate interrupts the trail immediately AFTER this step ordinal. A gate
   * is a stop, so it is drawn across the run rather than beside it (M7).
   */
  afterStep: number;
}

export const PROCUREMENT_LIFECYCLE_GATES = [
  {
    key: 'complete_to_produce',
    label: 'Complete to produce',
    afterStep: 4,
  },
  {
    key: 'received_and_dispositioned',
    label: 'Received and dispositioned',
    afterStep: 9,
  },
  {
    key: 'warehouse_and_site_ready',
    label: 'Warehouse + site ready',
    afterStep: 11,
  },
] as const satisfies readonly ProcurementLifecycleGate[];

/**
 * A step's reading.
 *
 * - `settled`   — evidence exists that this step happened.
 * - `live`      — the latest evidenced non-terminal position. Exactly ONE step
 *                 in a reading may be live.
 * - `future`    — not reached yet. Rendered outlined and empty: the future is
 *                 visible so the designer knows what is coming, and unstamped
 *                 so nothing about it can be mistaken for something that
 *                 happened.
 * - `no-record` — the trail has moved PAST this step, but the rail carries no
 *                 fact that could evidence it. Distinct from `future` on
 *                 purpose: "we never recorded this" is not "this has not
 *                 happened yet", and neither is ever rendered as if it had.
 */
export type ProcurementStepState = 'settled' | 'live' | 'future' | 'no-record';

/**
 * A gate's reading.
 *
 * - `settled`         — the trail REACHED the gate and every term is satisfied.
 *                       Terms met at a position the trail has not arrived at
 *                       is not a seal; that reads `unreached`.
 * - `open`            — the trail is standing AT the gate with a term
 *                       outstanding. This is the ONLY reading that stops.
 * - `unreached`       — the trail has not arrived yet.
 * - `passed-unsealed` — the work moved BEYOND the gate without its terms ever
 *                       being evidenced. Renders quiet: finished work must
 *                       never be drawn as stopped, and a seal that was never
 *                       recorded must never be drawn as given.
 * - `no-record`       — the trail is past the gate and the rail carries nothing
 *                       that could bear on it at all.
 */
export type ProcurementGateState =
  | 'settled'
  | 'open'
  | 'unreached'
  | 'passed-unsealed'
  | 'no-record';

/**
 * Why a reading says what it says. `source` names the actual column or table
 * the fact came from (e.g. `purchase_orders.sent_at`) so a reading can always
 * be argued with. Absent evidence is absent, never defaulted to "now".
 */
export interface ProcurementLifecycleEvidence {
  /** The date the fact carries, as the rail stores it (ISO date or timestamp). */
  at: string;
  /** The column or table that carried it. */
  source: string;
}

export interface ProcurementStepReading {
  key: ProcurementLifecycleStepKey;
  ordinal: number;
  state: ProcurementStepState;
  evidence?: ProcurementLifecycleEvidence;
}

export interface ProcurementGateReading {
  key: ProcurementLifecycleGateKey;
  state: ProcurementGateState;
  afterStep: number;
  /**
   * What is outstanding, when the gate is open — named from the unmet term of
   * the predicate, never invented. Rendered after the gate name at ledger
   * density ("Complete to produce · awaiting acknowledgment").
   */
  qualifier?: string;
  /**
   * False when this rail holds no fact that could EVER seal the gate, whatever
   * position the work reaches. Such a gate is drawn (its emptiness is the
   * honest report) but is never named as somewhere the work is heading —
   * promising a stop that will never come is its own small lie.
   */
  sealable?: boolean;
}

/**
 * Which rail produced this reading. `studio` = the designer's own procurement
 * (purchase orders, receiving, claims). `patina` = the Patina fulfilment
 * ledger. The tag exists so a surface can say which book it is reading from;
 * it never changes the vocabulary, which is the whole point of one contract.
 */
export type ProcurementRail = 'studio' | 'patina';

export interface ProcurementLifecycleReading {
  rail: ProcurementRail;
  /** All fifteen, in order — the future is part of the reading. */
  steps: ProcurementStepReading[];
  /** All three, in order. */
  gates: ProcurementGateReading[];
}

/** Ordinal of a step key, 1-based. */
export function procurementStepOrdinal(
  key: ProcurementLifecycleStepKey,
): number {
  return PROCUREMENT_LIFECYCLE_STEP_KEYS.indexOf(key) + 1;
}

/** The rendered label for a step key. */
export function procurementStepLabel(key: ProcurementLifecycleStepKey): string {
  return PROCUREMENT_LIFECYCLE_STEPS[procurementStepOrdinal(key) - 1].label;
}

/** The step a reading is currently at, or null when nothing is live. */
export function liveStep(
  reading: ProcurementLifecycleReading,
): ProcurementStepReading | null {
  return reading.steps.find((s) => s.state === 'live') ?? null;
}

/**
 * The next gate AHEAD OF the work — what the ledger's "Next gate" column reads.
 *
 * "Next" is a position, not a to-do list. A gate the work has already gone past
 * is not next, however it ended up (settled, passed-unsealed, or no-record), so
 * the search starts at the live step and looks forward. A gate the rail can
 * never seal (`no-record`) is not a destination either and is skipped — naming
 * it would promise a stop that will never come.
 *
 * When nothing remains ahead, the column renders "—" rather than reaching
 * backwards for something to say.
 */
export function nextGate(
  reading: ProcurementLifecycleReading,
): ProcurementGateReading | null {
  const liveOrdinal = liveStep(reading)?.ordinal ?? 0;
  return (
    reading.gates.find(
      (g) =>
        g.afterStep >= liveOrdinal &&
        g.state !== 'settled' &&
        g.state !== 'no-record' &&
        g.sealable !== false,
    ) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a rail mapper produces before the trail is assembled: the evidence it
 * found, keyed by step. A step absent from the map has no evidence on that
 * rail — the assembler decides whether that reads `future` or `no-record`
 * based on where the trail actually got to.
 */
export type ProcurementEvidenceMap = Partial<
  Record<ProcurementLifecycleStepKey, ProcurementLifecycleEvidence>
>;

/** A gate predicate's answer, as a rail mapper computes it. */
export interface ProcurementGatePredicate {
  /** True when every term is satisfied. */
  settled: boolean;
  /**
   * True when the rail carries NO fact bearing on this gate at all. Such a
   * gate never reads settled or open — past the gate it reads `no-record`.
   */
  noRecord?: boolean;
  /** The unmet term, for the open reading. */
  qualifier?: string;
  /**
   * True when an outstanding term is a LIVE condition that stops the work
   * wherever the trail nominally stands — an unresolved claim, a short
   * receipt, an inspection never logged. Such a gate reads `open` even once
   * the trail's position is past it, because the stop is real and current.
   *
   * Without this, a gate is judged by position alone: terms that were simply
   * never recorded, on work that has since moved on, read `passed-unsealed`
   * and stay quiet. An unacknowledged PO under an installed credenza is a
   * missing signature, not a blockage, and must not be drawn as one.
   */
  holdsOpen?: boolean;
}

export type ProcurementGatePredicates = Record<
  ProcurementLifecycleGateKey,
  ProcurementGatePredicate
>;

/**
 * Assemble the reading shared by both rails.
 *
 * The one-live-step invariant lives here, so neither rail can break it: the
 * live step is the HIGHEST-ordinal evidenced step, and it is live unless it is
 * terminal (step 15, Closed), in which case it settles and nothing is live.
 * Everything below the live step that lacks evidence reads `no-record`;
 * everything above it reads `future`.
 */
export function assembleProcurementReading(
  rail: ProcurementRail,
  evidence: ProcurementEvidenceMap,
  gates: ProcurementGatePredicates,
): ProcurementLifecycleReading {
  const evidencedOrdinals = PROCUREMENT_LIFECYCLE_STEPS.filter(
    (s) => evidence[s.key] !== undefined,
  ).map((s) => s.ordinal);

  const highest = evidencedOrdinals.length ? Math.max(...evidencedOrdinals) : 0;
  const terminal = highest === PROCUREMENT_LIFECYCLE_STEPS.length;
  // Nothing is live on an unevidenced line, and nothing is live once the trail
  // has closed — "live" means work is in hand.
  const liveOrdinal = highest === 0 || terminal ? 0 : highest;

  const steps: ProcurementStepReading[] = PROCUREMENT_LIFECYCLE_STEPS.map(
    (step) => {
      const found = evidence[step.key];
      if (found) {
        return {
          key: step.key,
          ordinal: step.ordinal,
          state: step.ordinal === liveOrdinal ? 'live' : 'settled',
          evidence: found,
        };
      }
      return {
        key: step.key,
        ordinal: step.ordinal,
        // Past the trail's position with nothing behind it = no record. The
        // step is NOT claimed and NOT presented as pending.
        state: step.ordinal < highest ? 'no-record' : 'future',
      };
    },
  );

  const gateReadings: ProcurementGateReading[] =
    PROCUREMENT_LIFECYCLE_GATES.map((gate) => {
      const predicate = gates[gate.key];
      // `arrived` = standing at the gate or beyond. `passed` = moved beyond it.
      const arrived = highest >= gate.afterStep;
      const passed = highest > gate.afterStep;

      if (predicate.noRecord) {
        return {
          key: gate.key,
          state: passed ? 'no-record' : 'unreached',
          afterStep: gate.afterStep,
          sealable: false,
        };
      }
      // Terms satisfied at a position the trail has NOT reached is not a seal.
      // A gate seals by being arrived at with its terms met, in that order.
      if (!arrived) {
        return { key: gate.key, state: 'unreached', afterStep: gate.afterStep };
      }
      if (predicate.settled) {
        return { key: gate.key, state: 'settled', afterStep: gate.afterStep };
      }
      // Terms outstanding. If the work has already moved beyond the gate and
      // nothing live is holding it, the seal was never recorded and never will
      // be — but it is emphatically not a stop, so it reads quiet, not open.
      if (passed && !predicate.holdsOpen) {
        return {
          key: gate.key,
          state: 'passed-unsealed',
          afterStep: gate.afterStep,
        };
      }
      return {
        key: gate.key,
        state: 'open',
        afterStep: gate.afterStep,
        ...(predicate.qualifier ? { qualifier: predicate.qualifier } : {}),
      };
    });

  return { rail, steps, gates: gateReadings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail A — the Patina fulfilment ledger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ordered `fulfillment_order_items.line_state` chain (00350). This is the
 * rail's vocabulary; the fifteen steps are the reading. They are NOT the same
 * list and the mapping below is deliberately partial — Rail A carries no fact
 * for steps 01, 04, 05, 07, 11, 12, 13 or 14.
 *
 * `cancelled` is a NINTH allowed value and is deliberately absent here: it is
 * terminal but off-trail, so it evidences no step and takes no position in the
 * order. Nothing on a cancelled line reads — see `deriveFulfillmentLifecycle`.
 */
export const FULFILLMENT_LINE_STATES = [
  'intake',
  'split',
  'transmitted',
  'acknowledged',
  'in_production',
  'shipped',
  'delivered',
  'settled',
] as const;

export type FulfillmentLineState = (typeof FULFILLMENT_LINE_STATES)[number];

/**
 * Which step each line_state evidences. `intake` and `split` are the rail's own
 * bookkeeping before anything reaches a maker — they evidence no lifecycle step
 * and must not be drawn as one.
 */
export const FULFILLMENT_STATE_TO_STEP: Partial<
  Record<FulfillmentLineState, ProcurementLifecycleStepKey>
> = {
  transmitted: 'released_to_maker',
  acknowledged: 'acknowledged',
  in_production: 'in_production',
  shipped: 'in_transit',
  delivered: 'received_inspect',
  settled: 'closed',
};

export interface FulfillmentShipmentInput {
  /** `fulfillment_shipments.shipped_at` — evidences step 08. */
  shipped_at?: string | null;
  /** `fulfillment_shipments.delivered_at` — evidences step 09. */
  delivered_at?: string | null;
}

export interface FulfillmentExceptionInput {
  /** `fulfillment_exceptions.status` — 'open' | 'pending_leah' | 'resolved'. */
  status?: string | null;
  /** `fulfillment_exceptions.type` — damage, delay, backorder, … */
  type?: string | null;
  /** `fulfillment_exceptions.opened_at`. */
  opened_at?: string | null;
}

export interface FulfillmentLineInput {
  /** `fulfillment_order_items.line_state`. */
  line_state: string;
  /**
   * `fulfillment_order_items.line_state_entered_at` — the ONLY date the item
   * row carries. It dates the CURRENT state and nothing earlier.
   */
  line_state_entered_at?: string | null;
  shipments?: FulfillmentShipmentInput[] | null;
  exceptions?: FulfillmentExceptionInput[] | null;
}

const FULFILLMENT_STATE_INDEX = new Map<string, number>(
  FULFILLMENT_LINE_STATES.map((s, i) => [s, i]),
);

/** An exception counts as open until it is resolved. */
const RESOLVED_EXCEPTION_STATUS = 'resolved';

/**
 * Rail A reading — `fulfillment_order_items` onto the same fifteen steps.
 *
 * The chain is ORDERED, so reaching `shipped` means `transmitted`,
 * `acknowledged` and `in_production` also happened. Those earlier steps settle
 * WITHOUT an evidence date rather than borrowing one they do not have — the
 * item row carries exactly one date (`line_state_entered_at`) and it belongs to
 * the current state alone.
 */
export function deriveFulfillmentLifecycle(
  line: FulfillmentLineInput,
): ProcurementLifecycleReading {
  const index = FULFILLMENT_STATE_INDEX.get(line.line_state);
  const evidence: ProcurementEvidenceMap = {};

  // A cancelled line is fully OFF-TRAIL. 00350's chain cancels before shipping,
  // so any shipment or exception hanging off it is moot bookkeeping, not a
  // reading — drawing a backorder on a cancelled line would report a problem
  // nobody has. Nothing evidences anything.
  if (line.line_state === 'cancelled') {
    return assembleProcurementReading(
      'patina',
      {},
      {
        complete_to_produce: { settled: false, noRecord: true },
        received_and_dispositioned: { settled: false, noRecord: true },
        warehouse_and_site_ready: { settled: false, noRecord: true },
      },
    );
  }

  if (index !== undefined) {
    // Every state at or below the current one has been passed through.
    for (const [state, position] of FULFILLMENT_STATE_INDEX) {
      if (position > index) continue;
      const step = FULFILLMENT_STATE_TO_STEP[state as FulfillmentLineState];
      if (!step) continue;
      evidence[step] = {
        // Only the current state can be dated; earlier ones settle undated.
        at: position === index ? (line.line_state_entered_at ?? '') : '',
        source: `fulfillment_order_items.line_state=${state}`,
      };
    }
  }

  const shipments = line.shipments ?? [];
  const shipped = shipments.find((s) => s.shipped_at);
  if (shipped?.shipped_at) {
    evidence.in_transit = {
      at: shipped.shipped_at,
      source: 'fulfillment_shipments.shipped_at',
    };
  }
  const delivered = shipments.find((s) => s.delivered_at);
  if (delivered?.delivered_at) {
    evidence.received_inspect = {
      at: delivered.delivered_at,
      source: 'fulfillment_shipments.delivered_at',
    };
  }

  // An exception is the rail's ONLY reading of step 10 — it is the issue half
  // of "Accepted or issue". Acceptance itself has no Rail A fact, so a line
  // with no exception never claims acceptance.
  const openExceptions = (line.exceptions ?? []).filter(
    (e) => e.status !== RESOLVED_EXCEPTION_STATUS,
  );
  // Earliest open exception — the issue that has been waiting longest is the
  // one the date should report.
  const firstOpen = [...openExceptions].sort((a, b) =>
    (a.opened_at ?? '').localeCompare(b.opened_at ?? ''),
  )[0];
  if (firstOpen) {
    evidence.accepted_or_issue = {
      at: firstOpen.opened_at ?? '',
      source: `fulfillment_exceptions${firstOpen.type ? `.${firstOpen.type}` : ''}`,
    };
  }

  const reachedDelivered =
    index !== undefined &&
    index >= (FULFILLMENT_STATE_INDEX.get('delivered') as number);

  return assembleProcurementReading('patina', evidence, {
    // Rail A carries no inputs-complete fact. Once the line is past step 04 the
    // gate reads no-record rather than pretending to have been passed.
    complete_to_produce: { settled: false, noRecord: true },
    received_and_dispositioned: {
      settled: reachedDelivered && openExceptions.length === 0,
      // An unresolved exception is a live stop, even though it evidences step
      // 10 and so puts the trail's position past this gate.
      holdsOpen: openExceptions.length > 0,
      qualifier: openExceptions.length ? 'open exception' : 'awaiting receipt',
    },
    // No warehouse or site-readiness fact exists on either rail today (№8).
    warehouse_and_site_ready: { settled: false, noRecord: true },
  });
}
