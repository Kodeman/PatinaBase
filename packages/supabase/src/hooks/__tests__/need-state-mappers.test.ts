import { describe, expect, it } from 'vitest';
import { mapNeedStateRows } from '../use-need-states';
import { mapProjectLeadRows } from '../use-project-leads';

describe('mapNeedStateRows', () => {
  it('maps database fields into NeedState values keyed by need key', () => {
    expect(mapNeedStateRows([{
      need_key: 'order:one',
      project_id: 'project-one',
      deferred_until: '2026-10-12',
      acted_at: null,
      waiting_on: null,
      set_aside_until: null,
      set_aside_reason: null,
    }])).toEqual(new Map([['order:one', {
      needKey: 'order:one',
      projectId: 'project-one',
      deferredUntil: '2026-10-12',
      actedAt: null,
      waitingOn: null,
      setAsideUntil: null,
      setAsideReason: null,
    }]]));
  });
});

describe('mapProjectLeadRows', () => {
  it('selects the active lead and most recently assigned previous lead', () => {
    const result = mapProjectLeadRows([
      { project_id: 'p1', user_id: 'current', role: 'lead_designer', assigned_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', removed_at: null, user: { full_name: 'Current Lead' } },
      { project_id: 'p1', user_id: 'old', role: 'previous_lead', assigned_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', removed_at: null, user: { full_name: 'Old Lead' } },
      { project_id: 'p1', user_id: 'newer-old', role: 'previous_lead', assigned_at: '2026-09-15T00:00:00Z', updated_at: '2026-09-15T00:00:00Z', removed_at: null, user: { full_name: 'Recent Previous Lead' } },
      { project_id: 'p2', user_id: 'removed', role: 'lead_designer', assigned_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', removed_at: '2026-10-02T00:00:00Z', user: { full_name: 'Removed Lead' } },
    ]);

    expect(result.get('p1')).toEqual({
      leadUserId: 'current',
      leadName: 'Current Lead',
      previousLeadUserId: 'newer-old',
      previousLeadName: 'Recent Previous Lead',
      assignedAt: '2026-10-01T00:00:00Z',
    });
    expect(result.has('p2')).toBe(false);
  });

  it('reports the latest distinct previous lead after repeated hand-offs', () => {
    const result = mapProjectLeadRows([
      { project_id: 'p1', user_id: 'B', role: 'lead_designer', assigned_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-05T00:00:00Z', removed_at: null, user: { full_name: 'Lead B' } },
      { project_id: 'p1', user_id: 'B', role: 'previous_lead', assigned_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z', removed_at: null, user: { full_name: 'Previous B' } },
      { project_id: 'p1', user_id: 'A', role: 'previous_lead', assigned_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:00:00Z', removed_at: null, user: { full_name: 'Previous A' } },
    ]);

    expect(result.get('p1')).toEqual({
      leadUserId: 'B',
      leadName: 'Lead B',
      previousLeadUserId: 'A',
      previousLeadName: 'Previous A',
      assignedAt: '2026-10-05T00:00:00Z',
    });
  });
});
