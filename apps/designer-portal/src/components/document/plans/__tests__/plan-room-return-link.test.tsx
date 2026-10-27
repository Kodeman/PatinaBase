/**
 * SP-14/F100 — the two shelf leaves' return links must agree with each other
 * on the FULL project name. The spec book's half is pinned in
 * spec-books/spec-book-workspace.test.tsx; this is the plan room's half, so a
 * later `document_state` revision cannot silently re-open the finding on one
 * leaf while the other stays right.
 */
import { render, screen } from '@testing-library/react';

let mockResolution: unknown;

jest.mock('@patina/supabase', () => ({
  useProjectRooms: () => ({ data: [] }),
  usePlanRoom: () => ({
    data: { sheets: [], issues: [], prints: [], proposals: [] },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  usePlanRoomComposition: () => ({ data: undefined, isError: false }),
}));

jest.mock('@/hooks/use-paper-renderer', () => ({
  usePaperRenderer: () => ({ renderer: 'legacy' }),
}));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({ data: mockResolution, isLoading: false }),
}));

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));

jest.mock('@/lib/analytics/plan-room-events', () => ({
  planRoomEvents: { opened: jest.fn(), sheetOpened: jest.fn() },
}));

jest.mock('@/lib/plans/model', () => ({
  deriveHolders: () => [],
}));

jest.mock('../light-table', () => ({ LightTable: () => null }));
jest.mock('../plan-confirm-strip', () => ({ PlanConfirmStrip: () => null }));
jest.mock('../plan-issue-ceremony', () => ({ PlanIssueCeremony: () => null }));
jest.mock('../plan-room-set', () => ({ PlanRoomSet: () => null }));
jest.mock('../plan-sheet-detail', () => ({ PlanSheetDetail: () => null }));

import { PlanRoomWorkspace } from '../plan-room-workspace';

describe('SP-14/F100 — the plan room leaf returns by the full project name', () => {
  it('names the project as document_state titles it, not the folder tab', () => {
    mockResolution = {
      kind: 'engagement',
      row: {
        engagement_kind: 'project',
        engagement_id: 'eng-1',
        project_id: 'proj-1',
        title: 'Olsen Lake House',
      },
    };

    render(<PlanRoomWorkspace routeId="eng-1" />);

    const back = screen.getByRole('link', { name: '← Olsen Lake House' });
    expect(back).toHaveAttribute('href', '/doc/eng-1');
  });

  it('SQ-877 N6 — the head is the house Header line, not the old sticky band', () => {
    mockResolution = {
      kind: 'engagement',
      row: {
        engagement_kind: 'project',
        engagement_id: 'eng-1',
        project_id: 'proj-1',
        title: 'Olsen Lake House',
      },
    };

    const { container } = render(<PlanRoomWorkspace routeId="eng-1" />);

    const head = container.querySelector('[data-plan-room-header-line]');
    expect(head).toHaveClass('hline');
    expect(head?.className).not.toMatch(/sticky/);
    expect(head?.nextElementSibling).toHaveClass('rule-strong');
    // The head shares the body's measure: the views' own `px-4 md:px-8`.
    expect(head?.parentElement).toHaveClass('px-4', 'md:px-8');
    const title = screen.getByRole('heading', { level: 1, name: 'Drawing sets' });
    expect(title).toHaveClass('t-d2');
    expect(title.className).not.toMatch(/truncate/);
    expect(head).toContainElement(screen.getByRole('link', { name: '← Olsen Lake House' }));
  });
});
