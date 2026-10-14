import { fireEvent, render, screen } from '@testing-library/react';
import { ResolveSignoff } from '../resolve-signoff';

const mockResolve = jest.fn();
const mockNudge = jest.fn();

jest.mock('@patina/supabase', () => ({
  useResolveCoordinationItem: () => ({ mutate: mockResolve, isPending: false }),
  useNudgeCoordinationItem: () => ({ mutate: mockNudge, isPending: false }),
}));

jest.mock('../../open-item-sheet', () => ({
  ButtonRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  QuietConfirm: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResolveButton: ({ actionKey: _actionKey, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { actionKey?: string }) => (
    <button {...props}>{children}</button>
  ),
  ResolveQuestion: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  ResolveShell: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

describe('ResolveSignoff failure feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an inline alert when recording approval fails', () => {
    mockResolve.mockImplementation((_input, options) => options.onError());
    render(
      <ResolveSignoff
        item={{ id: 'item-1', options: [] } as any}
        projectId="project-1"
        onResolved={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Record their approval →' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t complete the sign-off action. Try again.',
    );
  });
});
