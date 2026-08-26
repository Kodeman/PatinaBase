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
  usePlanRoom: () => ({
    data: { sheets: [], issues: [], prints: [], proposals: [] },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
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
});
