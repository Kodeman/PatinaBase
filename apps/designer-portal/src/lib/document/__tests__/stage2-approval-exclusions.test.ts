import { excludeProjectApprovalsFromMargin } from '../stage2-approval-exclusions';

describe('Stage-2 generic-surface exclusions', () => {
  it('removes only exact Stage-2 decision ids and preserves legacy history and tasks', () => {
    const rows = [
      { kind: 'decision', item_id: 'stage-2' },
      { kind: 'decision', item_id: 'legacy' },
      { kind: 'message', item_id: 'stage-2' },
    ];
    const coordination = [
      { id: 'stage-2', approval_contract: 'project_artifact_v1' },
      { id: 'legacy', approval_contract: null },
    ];

    expect(
      excludeProjectApprovalsFromMargin(rows as any, coordination as any),
    ).toEqual([rows[1], rows[2]]);
  });
});
