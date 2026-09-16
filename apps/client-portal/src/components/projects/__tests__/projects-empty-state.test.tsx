/**
 * The two acts the mat carries for the pages that have no mat under them
 * (`/` with no house, and the letterbox-only front door).
 *
 * The way out is called "Sign out" (R141). It was "Leave the house" here long
 * after the mat itself was renamed — a second name for the same door, on the
 * one surface a homeowner reaches before she has a house at all.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `@patina/help-system`'s barrel pulls `@portabletext/react`, which ships ESM
// only and throws a SyntaxError under this jest transform. The CMS probe is
// `ProjectsEmptyState`'s boundary, not this file's.
jest.mock('@patina/help-system', () => ({
  __esModule: true,
  EmptyState: () => <div data-testid="cms-empty-state" />,
  useHelpContent: () => ({ data: null, isLoading: false }),
  SurfaceKeys: {
    ClientPortal: { Projects: { Empty: { NoProjects: 'no-projects' } } },
  },
}));

jest.mock('@/hooks/use-auth', () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

// The details sheet is a dialog with its own suite; this file is about the
// two acts and the words on them.
jest.mock('@/components/threshold/details-sheet', () => ({
  __esModule: true,
  DetailsSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="details-sheet" /> : null,
}));

import { useAuth } from '@/hooks/use-auth';

import { EmptyStateActs } from '../ProjectsEmptyState';

const authHook = useAuth as jest.Mock;

describe('EmptyStateActs — the way to your details and the way out', () => {
  const signOut = jest.fn();

  beforeEach(() => {
    signOut.mockReset();
    authHook.mockReturnValue({ signOut });
  });

  it('calls the way out "Sign out", never "Leave the house"', () => {
    render(<EmptyStateActs />);

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText('Leave the house')).not.toBeInTheDocument();
  });

  it('signs out when the act is taken — the page has no other exit', async () => {
    const user = userEvent.setup();
    render(<EmptyStateActs />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('opens the details sheet from the other act', async () => {
    const user = userEvent.setup();
    render(<EmptyStateActs />);

    expect(screen.queryByTestId('details-sheet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Your details' }));

    expect(screen.getByTestId('details-sheet')).toBeInTheDocument();
  });
});
