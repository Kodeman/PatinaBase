import type {
  ClientDecision,
  ClientDecisionOption,
  DecisionType,
  BlockingStatus,
  DecisionStatus,
} from '../../hooks/use-decisions';

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  // Stable, non-cryptographic UUIDs derived from the counter so query keys
  // and DOM data-attrs are predictable across test runs.
  const seq = counter.toString(16).padStart(12, '0');
  return `${prefix}0000-0000-0000-0000-${seq}`;
}

/** Reset the counter — call in `beforeEach` if you need deterministic IDs. */
export function resetDecisionFactoryCounter(): void {
  counter = 0;
}

export function makeDecisionOption(
  overrides: Partial<ClientDecisionOption> = {},
): ClientDecisionOption {
  return {
    id: nextId('a'),
    decision_id: overrides.decision_id ?? nextId('b'),
    name: 'Option A',
    image_url: null,
    product_id: null,
    designer_note: null,
    is_recommended: false,
    selected: false,
    client_note: null,
    sort_order: 0,
    price: null,
    quantity: 1,
    cost_delta_cents: null,
    lead_time_days_delta: null,
    // Mirrors the table defaults: `approves` is NOT NULL DEFAULT false (00202);
    // the configuration-provenance pair is nullable and only set when the
    // option is built from a saved product configuration (00413).
    approves: false,
    configuration_id: null,
    selection_snapshot: null,
    created_at: new Date('2026-04-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

export function makeDecision(
  overrides: Partial<ClientDecision> = {},
): ClientDecision {
  const now = new Date('2026-04-01T00:00:00Z').toISOString();
  return {
    id: nextId('c'),
    designer_client_id: nextId('d'),
    designer_id: nextId('e'),
    studio_id: null,
    project_id: nextId('f'),
    title: 'Test Decision',
    context: null,
    due_date: null,
    linked_phase: null,
    phase_id: null,
    decision_type: 'product' as DecisionType,
    blocking_status: 'non_blocking' as BlockingStatus,
    linked_proposal_id: null,
    recommended_option_id: null,
    status: 'pending' as DecisionStatus,
    sent_at: now,
    responded_at: null,
    viewed_at: null,
    selected_by: null,
    reminder_sent_at: null,
    created_at: now,
    updated_at: now,
    options: [],
    ...overrides,
  };
}

export function makeDecisionWithOptions(
  overrides: Partial<ClientDecision> = {},
  optionOverrides: Partial<ClientDecisionOption>[] = [{}, {}],
): ClientDecision {
  const decision = makeDecision(overrides);
  decision.options = optionOverrides.map((opt, i) =>
    makeDecisionOption({ decision_id: decision.id, sort_order: i, ...opt }),
  );
  return decision;
}
