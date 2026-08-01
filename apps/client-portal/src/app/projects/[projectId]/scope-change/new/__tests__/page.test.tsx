import { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useProjectV2 } from '@patina/supabase';
import ClientScopeChangeNewPage from '../page';

const mockPush = jest.fn();
const mockMutateAsync = jest.fn();
const mockUseCreateClientScopeChangeRequest = jest.fn();
const mockRandomUUID = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  COMPLETED_PROJECT_SCOPE_CHANGE_ERROR:
    'This project is complete and no longer accepts change requests.',
  useCreateClientScopeChangeRequest: () => mockUseCreateClientScopeChangeRequest(),
  useProjectV2: jest.fn(),
}));

jest.mock('@patina/design-system', () => ({
  ChangeRequestForm: ({
    mode,
    isSubmitting,
    onSubmit,
    onCancel,
  }: {
    mode?: string;
    isSubmitting?: boolean;
    onSubmit: (data: {
      category: 'other';
      priority: 'medium';
      title: string;
      description: string;
      attachments: File[];
    }) => void;
    onCancel?: () => void;
  }) => {
    const submit = (title: string, description: string) =>
      onSubmit({
        category: 'other',
        priority: 'medium',
        title,
        description,
        attachments: [],
      });

    return (
      <div data-testid="change-request-form" data-mode={mode} aria-busy={isSubmitting}>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => submit('  Add a lamp  ', '  One reading lamp beside the chair.  ')}
        >
          Submit original intent
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => submit('Add two lamps', 'One reading lamp beside each chair.')}
        >
          Submit changed intent
        </button>
        <button type="button" disabled={isSubmitting} onClick={onCancel}>
          Cancel form
        </button>
      </div>
    );
  },
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

function mockActiveProject() {
  mockUseProjectV2.mockReturnValue({
    data: { id: 'project-1', status: 'active' },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
}

describe('ClientScopeChangeNewPage', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockMutateAsync.mockReset();
    mockUseCreateClientScopeChangeRequest.mockReset();
    mockUseCreateClientScopeChangeRequest.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockRandomUUID.mockReset();
    mockRandomUUID.mockReturnValue('11111111-1111-4111-8111-111111111111');
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: mockRandomUUID,
    });
  });

  it.each(['completed', 'archived'])('blocks the direct route for a %s project', async (status) => {
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
  });

  it('uses the supported-fields basic form', async () => {
    mockActiveProject();

    await renderPage();

    expect(await screen.findByTestId('change-request-form')).toHaveAttribute('data-mode', 'basic');
  });

  it('keeps one UUID stable for an unknown failure retry and trims the payload', async () => {
    mockActiveProject();
    mockMutateAsync
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ id: 'request-1' });

    await renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Submit original intent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');

    fireEvent.click(screen.getByRole('button', { name: 'Submit original intent' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));

    expect(mockMutateAsync.mock.calls[0][0]).toEqual({
      projectId: 'project-1',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      title: 'Add a lamp',
      description: 'One reading lamp beside the chair.',
    });
    expect(mockMutateAsync.mock.calls[1][0]).toEqual(mockMutateAsync.mock.calls[0][0]);
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });

  it('allocates a new UUID when the user submits a changed intent after failure', async () => {
    mockActiveProject();
    mockRandomUUID
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    mockMutateAsync.mockRejectedValue(new Error('Still offline'));

    await renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Submit original intent' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Submit changed intent' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));

    expect(mockMutateAsync.mock.calls[0][0].idempotencyKey).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(mockMutateAsync.mock.calls[1][0].idempotencyKey).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('closes the same-tick double-submit window before React Query rerenders', async () => {
    mockActiveProject();
    let resolveMutation: ((value: { id: string }) => void) | undefined;
    mockMutateAsync.mockImplementation(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    await renderPage();

    const submit = await screen.findByRole('button', {
      name: 'Submit original intent',
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveMutation?.({ id: 'request-1' });
    });
    expect(await screen.findByText(/your change request was sent/i)).toBeInTheDocument();
  });

  it('disables the form, removes the cancel link, and announces pending work', async () => {
    mockActiveProject();
    mockUseCreateClientScopeChangeRequest.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });

    await renderPage();

    expect(await screen.findByTestId('change-request-form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Submit original intent' })).toBeDisabled();
    expect(screen.queryByText(/cancel and return/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sending your change request');
  });
});
