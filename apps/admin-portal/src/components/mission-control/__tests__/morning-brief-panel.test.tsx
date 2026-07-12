import { render, screen, fireEvent } from '@testing-library/react';
import { MorningBriefPanel } from '@/components/mission-control/morning-brief-panel';
import type { DailyBrief } from '@/services/morning-brief';

const mockMutateAsync = jest.fn();
const mockToast = jest.fn();

jest.mock('@/hooks/use-morning-brief', () => ({
  useMorningBrief: jest.fn(),
  useRegenerateBrief: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useMorningBrief } from '@/hooks/use-morning-brief';

const mockUseMorningBrief = useMorningBrief as jest.Mock;

const SAMPLE_BRIEF: DailyBrief = {
  brief_date: '2026-07-12',
  generated_at: '2026-07-12T17:05:09.000Z',
  email_sent_at: '2026-07-12T17:05:09.622Z',
  content: {
    brief_date: '2026-07-12',
    queue: [
      { status: 'awaiting_review', task_count: 10, oldest_created_at: '2026-07-09T16:38:59.000Z' },
    ],
    runs_yesterday: [
      {
        source: 'agent_task',
        name: 'job:morning_brief',
        status: 'done',
        started_at: '2026-07-11T20:38:59.000Z',
        duration_ms: 0,
        error: null,
        cost_usd: null,
      },
    ],
    exceptions: {
      stale: [{ id: 's1', summary: 'Concierge order review — PO #10428 freight quote', age_hours: 24.4 }],
      failed: [{ id: 'f1', summary: 'Catalog normalize — Meridian feed', last_error: 'Upstream feed 502' }],
      intake_errors: [{ id: 'i1', summary: 'Intake error — malformed header in Ops Inbox/vendor/' }],
    },
    todays_three: [
      { id: 't1', summary: 'Brand review — Aldercrest Woodworks', priority: 1, assignee: 'kody' },
    ],
  },
};

describe('MorningBriefPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing while loading', () => {
    mockUseMorningBrief.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<MorningBriefPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no brief exists', () => {
    mockUseMorningBrief.mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<MorningBriefPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the header, sections, and Regenerate action when a brief exists', () => {
    mockUseMorningBrief.mockReturnValue({ data: SAMPLE_BRIEF, isLoading: false });
    render(<MorningBriefPanel />);

    expect(screen.getByTestId('morning-brief-panel')).toBeInTheDocument();
    expect(screen.getByText('Morning Brief — 2026-07-12')).toBeInTheDocument();
    expect(screen.getByTestId('morning-brief-regenerate')).toHaveTextContent('Regenerate');
    expect(screen.getByText(/Brand review — Aldercrest Woodworks/)).toBeInTheDocument();
    expect(screen.getByText(/Catalog normalize — Meridian feed/)).toBeInTheDocument();
  });

  it('collapses the body on toggle click', () => {
    mockUseMorningBrief.mockReturnValue({ data: SAMPLE_BRIEF, isLoading: false });
    render(<MorningBriefPanel />);

    expect(screen.getByTestId('morning-brief-body')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('morning-brief-toggle'));
    expect(screen.queryByTestId('morning-brief-body')).not.toBeInTheDocument();
  });
});
