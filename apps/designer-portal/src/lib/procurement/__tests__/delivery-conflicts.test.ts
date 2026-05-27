/**
 * Unit tests for `detectDeliveryConflicts` (Wave 2.3 CB1).
 *
 * Spec: `docs/handoffs/procurement-workspace-wave-2.1-architect-dossier.md` §2.
 *
 * We mock the @patina/supabase type by importing it as type-only and building
 * minimal DeliveryEvent objects with just the fields the helper reads. The
 * helper never touches the network or Supabase client, so no module mocking
 * is required here.
 */
import type { DeliveryEvent } from '@patina/supabase';
import {
  detectDeliveryConflicts,
  OVERLAP_WINDOW_DAYS,
  DRIFT_BUFFER_DAYS,
} from '../delivery-conflicts';

// ─── Fixture helpers ────────────────────────────────────────────────────────

/**
 * Build a synthetic DeliveryEvent. Defaults match a typical delivery_expected
 * row coming out of the `delivery_events` view (migration 00150). Override
 * any field via the partial argument.
 */
function makeEvent(overrides: Partial<DeliveryEvent> & {
  event_id: string;
  project_id: string;
  event_date: string;
  event_type: DeliveryEvent['event_type'];
}): DeliveryEvent {
  return {
    purchase_order_id: null,
    vendor_id: null,
    vendor_name: null,
    po_status: null,
    delivered_date: null,
    ffe_item_count: null,
    line_total_cents: null,
    inspection_id: null,
    inspection_outcome: null,
    phase_key: null,
    project_name: 'Test Project',
    ...overrides,
  };
}

function makeDelivery(
  id: string,
  projectId: string,
  date: string,
  overrides: Partial<DeliveryEvent> = {},
): DeliveryEvent {
  return makeEvent({
    event_id: id,
    project_id: projectId,
    event_date: date,
    event_type: 'delivery_expected',
    purchase_order_id: id,
    vendor_id: 'vendor-' + id,
    vendor_name: 'Vendor ' + id,
    po_status: 'in_production',
    ffe_item_count: 1,
    line_total_cents: 100_000,
    ...overrides,
  });
}

function makeInstall(
  id: string,
  projectId: string,
  date: string,
  overrides: Partial<DeliveryEvent> = {},
): DeliveryEvent {
  return makeEvent({
    event_id: id,
    project_id: projectId,
    event_date: date,
    event_type: 'install_milestone',
    phase_key: 'install',
    ...overrides,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('detectDeliveryConflicts', () => {
  // Sanity-check the tuning knobs so a future tweak to the constants
  // surfaces in CI rather than silently changing all the cases below.
  it('exposes the documented tuning constants', () => {
    expect(OVERLAP_WINDOW_DAYS).toBe(7);
    expect(DRIFT_BUFFER_DAYS).toBe(14);
  });

  it('returns an empty array for empty input', () => {
    expect(detectDeliveryConflicts([])).toEqual([]);
  });

  it('flags two deliveries 3 days apart for the same project as an overlap', () => {
    const events = [
      makeDelivery('d1', 'proj-a', '2026-06-10', {
        project_name: 'Chen Residence',
      }),
      makeDelivery('d2', 'proj-a', '2026-06-13', {
        project_name: 'Chen Residence',
      }),
    ];
    const conflicts = detectDeliveryConflicts(events);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('overlap');
    expect(conflicts[0].projectId).toBe('proj-a');
    expect(conflicts[0].projectName).toBe('Chen Residence');
    expect(conflicts[0].eventA.event_id).toBe('d1');
    expect(conflicts[0].eventB.event_id).toBe('d2');
    expect(conflicts[0].suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT flag deliveries 10 days apart (above OVERLAP_WINDOW_DAYS=7)', () => {
    const events = [
      makeDelivery('d1', 'proj-a', '2026-06-10'),
      makeDelivery('d2', 'proj-a', '2026-06-20'),
    ];
    // 10 days apart > 7 → not an overlap. No installs → no late/drift either.
    expect(detectDeliveryConflicts(events)).toEqual([]);
  });

  it('flags a delivery after the install milestone as late_arrival', () => {
    const events = [
      makeInstall('i1', 'proj-a', '2026-06-05', {
        project_name: 'Whitfield',
      }),
      makeDelivery('d1', 'proj-a', '2026-06-10', {
        project_name: 'Whitfield',
        vendor_name: 'Apparatus',
      }),
    ];
    const conflicts = detectDeliveryConflicts(events);
    const late = conflicts.filter((c) => c.type === 'late_arrival');
    expect(late).toHaveLength(1);
    expect(late[0].eventA.event_id).toBe('i1'); // install is anchor
    expect(late[0].eventB.event_id).toBe('d1');
    expect(late[0].message).toContain('Apparatus');
    expect(late[0].suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('flags a delivery 10 days before the install as drift (within DRIFT_BUFFER=14)', () => {
    const events = [
      makeDelivery('d1', 'proj-a', '2026-06-05', {
        project_name: 'Olsen Lake',
        vendor_name: 'Woodward',
      }),
      makeInstall('i1', 'proj-a', '2026-06-15', {
        project_name: 'Olsen Lake',
      }),
    ];
    const conflicts = detectDeliveryConflicts(events);
    const drift = conflicts.filter((c) => c.type === 'drift');
    expect(drift).toHaveLength(1);
    expect(drift[0].eventA.event_id).toBe('i1');
    expect(drift[0].eventB.event_id).toBe('d1');
    expect(drift[0].message).toContain('10 days');
  });

  it('treats projects independently — 2 projects with 3-day overlaps each → 2 overlaps total', () => {
    const events = [
      // Project A — 3 days apart
      makeDelivery('d1', 'proj-a', '2026-06-10', { project_name: 'Project A' }),
      makeDelivery('d2', 'proj-a', '2026-06-13', { project_name: 'Project A' }),
      // Project B — also 3 days apart
      makeDelivery('d3', 'proj-b', '2026-06-11', { project_name: 'Project B' }),
      makeDelivery('d4', 'proj-b', '2026-06-14', { project_name: 'Project B' }),
    ];
    const conflicts = detectDeliveryConflicts(events);
    const overlaps = conflicts.filter((c) => c.type === 'overlap');
    expect(overlaps).toHaveLength(2);
    // Both overlaps are scoped to their respective projects (no cross-project pair).
    const projectIds = overlaps.map((c) => c.projectId).sort();
    expect(projectIds).toEqual(['proj-a', 'proj-b']);
    for (const c of overlaps) {
      expect(c.eventA.project_id).toBe(c.eventB.project_id);
    }
  });

  // ─── Extra guards (above the 6-test minimum) ──────────────────────────

  it('does NOT cross-flag overlaps across different projects', () => {
    // Two deliveries 2 days apart but in different projects → 0 conflicts.
    const events = [
      makeDelivery('d1', 'proj-a', '2026-06-10'),
      makeDelivery('d2', 'proj-b', '2026-06-12'),
    ];
    expect(detectDeliveryConflicts(events)).toEqual([]);
  });

  it('sorts output by eventA.event_date ascending', () => {
    // Two overlaps in two projects with different start dates.
    const events = [
      makeDelivery('d3', 'proj-b', '2026-06-20'),
      makeDelivery('d4', 'proj-b', '2026-06-23'),
      makeDelivery('d1', 'proj-a', '2026-06-10'),
      makeDelivery('d2', 'proj-a', '2026-06-13'),
    ];
    const conflicts = detectDeliveryConflicts(events);
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].eventA.event_date).toBe('2026-06-10');
    expect(conflicts[1].eventA.event_date).toBe('2026-06-20');
  });

  it('does not double-flag a late_arrival as drift', () => {
    // Delivery lands 5 days AFTER install → should be late_arrival only,
    // not also flagged as drift (the late message is more actionable).
    const events = [
      makeInstall('i1', 'proj-a', '2026-06-10'),
      makeDelivery('d1', 'proj-a', '2026-06-15'),
    ];
    const conflicts = detectDeliveryConflicts(events);
    const late = conflicts.filter((c) => c.type === 'late_arrival');
    const drift = conflicts.filter((c) => c.type === 'drift');
    expect(late).toHaveLength(1);
    expect(drift).toHaveLength(0);
  });

  it('ignores events with a null event_date', () => {
    const events = [
      // A row without a date can never conflict.
      makeDelivery('d1', 'proj-a', '2026-06-10'),
      makeDelivery('d2', 'proj-a', '2026-06-12', { event_date: null as unknown as string }),
    ];
    // d2 has null event_date → only d1 remains → 0 conflicts.
    expect(detectDeliveryConflicts(events)).toEqual([]);
  });
});
