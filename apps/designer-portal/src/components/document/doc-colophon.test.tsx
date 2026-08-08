import { fireEvent, render, screen } from '@testing-library/react';
import { DocColophon } from './doc-colophon';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutate: jest.fn(), variables: null }),
  useQuery: () => ({ data: 'Middle Studio' }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
}));

jest.mock('./command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('./document-action', () => ({
  DocumentAction: ({
    actionKey,
    children,
    onClick,
  }: {
    actionKey: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-action-key={actionKey} onClick={onClick}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DocumentActionRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('DocColophon team doorway', () => {
  it('opens the canonical Call Sheet picker instead of a separate studio-member form', () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);

    render(
      <DocColophon
        projectId="project-1"
        designerId="designer-1"
        projectStatus="active"
        isPaused={false}
        handsOnTheWork={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Team…' }));

    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ mode: 'picker' });
    expect(screen.queryByLabelText('Member email')).not.toBeInTheDocument();

    window.removeEventListener('document:open-call-sheet', opened);
  });
});
