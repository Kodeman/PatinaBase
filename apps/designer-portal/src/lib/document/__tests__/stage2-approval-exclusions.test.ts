import { render, screen } from '@testing-library/react';
import {
  classifyMarginItems,
  excludeProjectApprovalsFromMargin,
  legacyCoordinationDrafts,
  MarginDecisionClassificationNotice,
} from '../stage2-approval-exclusions';

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

  it('keeps an actual Stage-2 draft out of the legacy draft editor', () => {
    const stage2Draft = {
      id: 'stage-2-draft',
      status: 'draft',
      coordination_kind: 'signoff',
      approval_contract: 'project_artifact_v1',
    };
    const legacyDraft = {
      id: 'legacy-draft',
      status: 'draft',
      coordination_kind: 'signoff',
      approval_contract: null,
    };

    expect(legacyCoordinationDrafts([stage2Draft, legacyDraft] as any)).toEqual(
      [legacyDraft],
    );
  });

  it.each(['loading', 'error'] as const)(
    'fails closed for margin decisions while classification is %s',
    (state) => {
      const decision = { kind: 'decision', item_id: 'stage-2' };
      const message = { kind: 'message', item_id: 'message-1' };

      expect(
        classifyMarginItems([decision, message] as any, [], state),
      ).toEqual({
        items: [message],
        decisionState: state,
        withheldDecisionCount: 1,
      });
    },
  );

  it('shows verified legacy decisions only after classification succeeds', () => {
    const stage2 = { kind: 'decision', item_id: 'stage-2' };
    const legacy = { kind: 'decision', item_id: 'legacy' };
    const coordination = [
      { id: 'stage-2', approval_contract: 'project_artifact_v1' },
      { id: 'legacy', approval_contract: null },
    ];

    expect(
      classifyMarginItems(
        [stage2, legacy] as any,
        coordination as any,
        'ready',
      ),
    ).toEqual({
      items: [legacy],
      decisionState: 'ready',
      withheldDecisionCount: 0,
    });
  });

  it.each([
    ['loading', 'status'],
    ['error', 'alert'],
  ] as const)(
    'announces the shared %s state used by desktop and mobile',
    (state, role) => {
      render(MarginDecisionClassificationNotice({ state }));
      expect(screen.getByRole(role)).toBeVisible();
    },
  );
});
