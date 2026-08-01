import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';

import { useProjectV2 } from '@patina/supabase';
import ClientScopeChangeNewPage from '../page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  COMPLETED_PROJECT_SCOPE_CHANGE_ERROR:
    'This project is complete and no longer accepts change requests.',
  useCreateClientScopeChangeRequest: () => ({ mutateAsync: jest.fn() }),
  useProjectV2: jest.fn(),
}));

jest.mock('@patina/design-system', () => ({
  ChangeRequestForm: () => <div data-testid="change-request-form">Change request form</div>,
}));

const mockUseProjectV2 = useProjectV2 as jest.Mock;

async function renderPage() {
  const params = Promise.resolve({ projectId: 'project-1' });
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <ClientScopeChangeNewPage params={params} />
      </Suspense>,
    );
    await params;
  });
}

describe('ClientScopeChangeNewPage completed-project guard', () => {
  it.each(['completed', 'archived'])(
    'blocks the direct route for a %s project',
    async (status) => {
      mockUseProjectV2.mockReturnValue({
        data: { id: 'project-1', status },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      await renderPage();

      expect(await screen.findByText(/this project.s scope is closed/i)).toBeInTheDocument();
      expect(screen.queryByTestId('change-request-form')).not.toBeInTheDocument();
      expect(screen.getByText(/no longer accepts change requests/i)).toBeInTheDocument();
    },
  );

  it('renders the form for an active project', async () => {
    mockUseProjectV2.mockReturnValue({
      data: { id: 'project-1', status: 'active' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    await renderPage();

    expect(await screen.findByTestId('change-request-form')).toBeInTheDocument();
  });
});
