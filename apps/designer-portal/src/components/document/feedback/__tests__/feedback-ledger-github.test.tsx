import { render, screen } from '@testing-library/react';
import { FeedbackLedger } from '../feedback-ledger';

/**
 * The GitHub hint on a ledger row (00558): a filed bug carries its issue link,
 * a failed one says so — plainly for a tester, verbatim only for the triager —
 * and a plain note carries no hint at all.
 */

type Row = Record<string, unknown>;

let mockNotes: Row[] = [];
let mockSuperAdmin = false;

jest.mock('@patina/supabase', () => ({
  useFeedback: () => ({ data: mockNotes, isLoading: false }),
  useUnseenShipped: () => ({ data: [] }),
  useMarkFeedbackSeen: () => ({ mutate: jest.fn() }),
  useIsSuperAdmin: () => ({ isSuperAdmin: mockSuperAdmin }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

function row(overrides: Row = {}): Row {
  return {
    id: 'f1',
    created_at: new Date().toISOString(),
    created_by: 'me',
    bucket: 'not_working',
    note: 'Totals go blank',
    weight: 'high',
    status: 'noted',
    report_kind: 'bug',
    github_issue_number: null,
    github_issue_url: null,
    github_issue_error: null,
    ...overrides,
  };
}

describe('FeedbackLedger — GitHub issue hints', () => {
  beforeEach(() => {
    mockSuperAdmin = false;
    mockNotes = [];
  });

  it('links the issue on a filed bug', () => {
    mockNotes = [
      row({ github_issue_number: 12, github_issue_url: 'https://github.com/o/r/issues/12' }),
    ];
    render(<FeedbackLedger compact />);

    const link = screen.getByRole('link', { name: /GitHub #12/ });
    expect(link).toHaveAttribute('href', 'https://github.com/o/r/issues/12');
  });

  it('keeps the raw failure reason to the triager', () => {
    mockNotes = [row({ github_issue_error: 'github 422' })];
    render(<FeedbackLedger compact />);

    expect(screen.getByText(/Couldn’t file the GitHub issue/)).toBeInTheDocument();
    expect(screen.queryByText(/github 422/)).not.toBeInTheDocument();
  });

  it('prints the raw failure reason for a super admin', () => {
    mockSuperAdmin = true;
    mockNotes = [row({ github_issue_error: 'github 422' })];
    render(<FeedbackLedger compact />);

    expect(screen.getByText(/Issue not filed — github 422/)).toBeInTheDocument();
  });

  it('says a fresh bug of the author’s own is being filed', () => {
    mockNotes = [row()];
    render(<FeedbackLedger compact />);

    expect(screen.getByText(/Filing the issue/)).toBeInTheDocument();
  });

  it('never claims someone else’s bug is being filed', () => {
    mockNotes = [row({ created_by: 'someone-else' })];
    render(<FeedbackLedger compact />);

    expect(screen.queryByText(/Filing the issue/)).not.toBeInTheDocument();
    expect(screen.getByText(/Issue not filed yet/)).toBeInTheDocument();
  });

  it('carries no hint at all on a plain note', () => {
    mockNotes = [row({ report_kind: 'note', note: 'A small delight' })];
    render(<FeedbackLedger compact />);

    expect(screen.getByText('A small delight')).toBeInTheDocument();
    expect(
      screen.queryByText(/Issue not filed|Filing the issue|GitHub #/),
    ).not.toBeInTheDocument();
  });
});
