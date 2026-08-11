import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MarginRail } from '../margin-rail';

let mockCoordinationQuery: {
  data: Array<Record<string, unknown>> | undefined;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
};

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({
    data: [
      {
        kind: 'decision',
        item_id: 'stage-2',
        project_id: 'project-1',
        proposal_id: null,
        anchor_kind: 'letterhead',
        anchor_id: null,
        state: 'pending',
        title: 'Stage-2 approval',
        detail: '',
        ts: '2026-08-11T12:00:00.000Z',
        payload: {},
      },
      {
        kind: 'message',
        item_id: 'message-1',
        project_id: 'project-1',
        proposal_id: null,
        anchor_kind: 'letterhead',
        anchor_id: null,
        state: 'open',
        title: 'Client message',
        detail: '',
        ts: '2026-08-11T12:00:00.000Z',
        payload: {},
      },
    ],
    isLoading: false,
  }),
}));

jest.mock('@patina/supabase', () => ({
  useCoordinationItems: () => mockCoordinationQuery,
  useProjectFFEItems: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useProjectPhases: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  isProjectArtifactApproval: (item: { approval_contract?: string | null }) =>
    item.approval_contract === 'project_artifact_v1',
}));

jest.mock('@/hooks/use-section-work', () => ({
  useSectionTasks: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-project-file-change-notifications', () => ({
  useProjectFileChangeNotifications: () => ({ data: [] }),
  useMarkProjectFileChangeRead: () => jest.fn(),
}));

jest.mock('../margin-item', () => ({
  MarginItem: ({ row, children }: { row: { title: string }; children: ReactNode }) => (
    <div>
      <span>{row.title}</span>
      {children}
    </div>
  ),
}));

jest.mock('../margin-bodies', () => ({
  MarginItemBody: ({ row }: { row: { title: string } }) => (
    <span>Body: {row.title}</span>
  ),
}));

jest.mock('../margin-note', () => ({
  MarginNote: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('desktop Stage-2 margin classification', () => {
  it.each([
    ['loading', { isLoading: true }, 'status'],
    ['error', { isError: true }, 'alert'],
  ] as const)(
    'withholds decision bodies, preserves messages, and announces %s',
    (_state, queryState, role) => {
      mockCoordinationQuery = { data: undefined, ...queryState };

      render(
        <MarginRail
          projectId="project-1"
          proposalId={null}
          clientName="Client"
          onHoverLine={jest.fn()}
        />,
      );

      expect(screen.getByRole(role)).toBeVisible();
      expect(screen.queryByText('Stage-2 approval')).not.toBeInTheDocument();
      expect(screen.queryByText('Body: Stage-2 approval')).not.toBeInTheDocument();
      expect(screen.getByText('Client message')).toBeVisible();
      expect(screen.getByText('Body: Client message')).toBeVisible();
    },
  );
});
