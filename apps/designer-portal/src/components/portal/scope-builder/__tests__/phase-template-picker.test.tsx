import { act, fireEvent, render, screen } from '@testing-library/react';
import { PhaseTemplatePicker } from '../phase-template-picker';

const applyTemplateMutateAsync = jest.fn();
const mockUsePhaseTemplates = jest.fn(() => ({
  data: [template],
  isLoading: false,
  isError: false,
}));

const template = {
  id: 'template-1',
  slug: 'classic_5_phase',
  label: 'Classic Five',
  description: 'A five phase template',
  is_system: true,
  designer_id: null,
  phases: [],
  created_at: '2026-07-31T12:00:00.000Z',
  updated_at: '2026-07-31T12:00:00.000Z',
};

jest.mock('@patina/supabase', () => ({
  usePhaseTemplates: (studioId: string | null) => mockUsePhaseTemplates(studioId),
  useApplyPhaseTemplate: () => ({
    mutateAsync: applyTemplateMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('@patina/design-system', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/controls', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

describe('PhaseTemplatePicker request receipts', () => {
  beforeEach(() => {
    applyTemplateMutateAsync.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses one request UUID after a failed response', async () => {
    applyTemplateMutateAsync
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(['phase-1']);
    const onOpenChange = jest.fn();
    render(
      <PhaseTemplatePicker
        proposalId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        studioId="studio-a"
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await Promise.resolve();
    });
    const firstRequestId = applyTemplateMutateAsync.mock.calls[0][0].requestId;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await Promise.resolve();
    });

    expect(applyTemplateMutateAsync).toHaveBeenCalledTimes(2);
    expect(applyTemplateMutateAsync.mock.calls[1][0].requestId).toBe(firstRequestId);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not carry a failed request receipt into another proposal', async () => {
    applyTemplateMutateAsync
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(['phase-2']);
    const onOpenChange = jest.fn();
    const view = render(
      <PhaseTemplatePicker
        proposalId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        studioId="studio-a"
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await Promise.resolve();
    });
    const firstRequestId = applyTemplateMutateAsync.mock.calls[0][0].requestId;

    view.rerender(
      <PhaseTemplatePicker
        proposalId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        studioId="studio-b"
        open
        onOpenChange={onOpenChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await Promise.resolve();
    });

    expect(applyTemplateMutateAsync.mock.calls[1][0]).toEqual({
      proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      templateSlug: 'classic_5_phase',
      requestId: expect.any(String),
    });
    expect(applyTemplateMutateAsync.mock.calls[1][0].requestId).not.toBe(firstRequestId);
    expect(mockUsePhaseTemplates).toHaveBeenLastCalledWith('studio-b');
  });
});
