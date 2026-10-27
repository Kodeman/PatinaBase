/**
 * SQ-2201 F3 — the drawing room's composition links (00871) are round-8
 * presentation. The legacy renderer never enables their read and never shows
 * them; the native plan-room bundle stays the only read legacy depends on.
 */
import { render } from '@testing-library/react';

let mockRenderer: 'pending' | 'legacy' | 'round8' = 'legacy';
const mockComposition = jest.fn();
const mockSetProps = jest.fn();
const composition = {
  sheetRooms: [{ sheet_id: 'sheet-a', project_room_id: 'room-a' }],
  sheetPackages: [],
  packages: [],
};

jest.mock('@patina/supabase', () => ({
  useProjectRooms: () => ({ data: [] }),
  usePlanRoom: () => ({
    data: { sheets: [], issues: [], prints: [], issuePrints: [], transmittals: [], tokens: [], batches: [] },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  usePlanRoomComposition: (projectId: string, options: { enabled?: boolean }) =>
    mockComposition(projectId, options),
}));
jest.mock('@/hooks/use-paper-renderer', () => ({
  usePaperRenderer: () => ({ renderer: mockRenderer }),
}));
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    data: {
      kind: 'engagement',
      row: { engagement_kind: 'project', engagement_id: 'eng-1', project_id: 'proj-1', title: 'Olsen' },
    },
    isLoading: false,
  }),
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({ useDocumentSurface: jest.fn() }));
jest.mock('@/lib/analytics/plan-room-events', () => ({
  planRoomEvents: { opened: jest.fn(), sheetOpened: jest.fn() },
}));
jest.mock('@/lib/plans/model', () => ({ deriveHolders: () => [] }));
jest.mock('../light-table', () => ({ LightTable: () => null }));
jest.mock('../plan-confirm-strip', () => ({ PlanConfirmStrip: () => null }));
jest.mock('../plan-issue-ceremony', () => ({ PlanIssueCeremony: () => null }));
jest.mock('../plan-sheet-detail', () => ({ PlanSheetDetail: () => null }));
jest.mock('../plan-room-set', () => ({
  PlanRoomSet: (props: unknown) => {
    mockSetProps(props);
    return null;
  },
}));

import { PlanRoomWorkspace } from '../plan-room-workspace';

beforeEach(() => {
  mockComposition.mockReset();
  mockComposition.mockReturnValue({ data: composition, isError: false });
  mockSetProps.mockReset();
});

it.each(['legacy', 'pending'] as const)(
  'never enables the composition read or passes composition under the %s renderer',
  (renderer) => {
    mockRenderer = renderer;
    render(<PlanRoomWorkspace routeId="eng-1" />);
    expect(mockComposition).toHaveBeenCalled();
    for (const [, options] of mockComposition.mock.calls) {
      expect(options).toEqual({ enabled: false });
    }
    expect(mockSetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ composition: undefined }),
    );
  },
);

it('enables the composition read and passes it to the set under round 8', () => {
  mockRenderer = 'round8';
  render(<PlanRoomWorkspace routeId="eng-1" />);
  expect(mockComposition).toHaveBeenLastCalledWith('proj-1', { enabled: true });
  expect(mockSetProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ composition }),
  );
});

it('names a failed composition read under round 8 without hiding the drawings', () => {
  mockRenderer = 'round8';
  mockComposition.mockReturnValue({ data: undefined, isError: true });
  const { getByRole } = render(<PlanRoomWorkspace routeId="eng-1" />);
  expect(getByRole('alert')).toHaveTextContent('Drawing rooms and packages could not be read');
  expect(mockSetProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ composition: undefined, bundle: expect.anything() }),
  );
});
