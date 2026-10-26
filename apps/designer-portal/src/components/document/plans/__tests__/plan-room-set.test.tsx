import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PlanRoomBundle } from '@patina/supabase';
import { PlanRoomSet } from '../plan-room-set';

jest.mock('@patina/supabase', () => ({
  useProjectRoster: () => ({ data: [] }),
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockRead() }) }),
    }),
    storage: { from: () => ({ createSignedUrl: () => mockSign() }) },
  }),
  useReissuePlanTransmittalLink: () => ({ mutateAsync: jest.fn() }),
  useRevokePlanTransmittalLink: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const mockRead = jest.fn();
const mockSign = jest.fn();

const EMPTY: PlanRoomBundle = {
  sheets: [],
  prints: [],
  batches: [],
  issues: [],
  issuePrints: [],
  transmittals: [],
  tokens: [],
};

it('says an empty drawing set with the one empty state and its act inline', () => {
  const choose = jest.fn();
  render(
    <PlanRoomSet
      projectId="project-1"
      bundle={EMPTY}
      onOpenSheet={jest.fn()}
      onIssue={jest.fn()}
      onChooseFile={choose}
    />,
  );

  // US-28 walk-fix: the one EmptyState (chrome-p5), not the dashed box.
  const empty = screen.getByRole('region', { name: 'Plans' });
  expect(empty).toHaveAttribute('data-empty-state');
  expect(empty).toHaveTextContent(
    'No plans yet. Bring in a drawing set to begin.',
  );
  expect(screen.queryByText('Start the current drawing set')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Bring in a drawing set' }),
  );
  expect(choose).toHaveBeenCalledTimes(1);
});

function PlanIssueHistory({ bundle }: { bundle: PlanRoomBundle }) {
  return (
    <PlanRoomSet
      projectId="project-1"
      bundle={bundle}
      onOpenSheet={jest.fn()}
      onIssue={jest.fn()}
      onChooseFile={jest.fn()}
    />
  );
}
const historyBundle = (): PlanRoomBundle => ({
  ...EMPTY,
  sheets: [
    {
      id: 'sheet',
      sheet_number: 'A-1',
      title: 'New live title',
      current_print_id: 'print-a',
      state: 'shared',
    },
  ] as PlanRoomBundle['sheets'],
  prints: [
    {
      id: 'print-a',
      sheet_id: 'sheet',
      project_document_id: 'doc-a',
      print_number: 1,
      rev_letter: 'A',
      sha256: 'hash-a',
      created_at: '2026-10-01T12:00:00Z',
    },
  ] as PlanRoomBundle['prints'],
  issues: [
    {
      id: 'issue',
      issue_number: 1,
      name: 'For building',
      issued_at: '2026-10-02T12:00:00Z',
      set_checksum: 'frozen-set',
    },
  ] as PlanRoomBundle['issues'],
  issuePrints: [
    {
      id: 'snapshot',
      issue_id: 'issue',
      print_id: 'print-a',
      sheet_id: 'sheet',
      sheet_number: 'A-1',
      sheet_title: 'Frozen title',
      rev_letter: 'A',
      sha256: 'hash-a',
    },
  ] as PlanRoomBundle['issuePrints'],
  transmittals: [
    {
      id: 'sent',
      issue_id: 'issue',
      party_display_name: 'Fictional builder',
      sent_at: '2026-10-02T12:00:00Z',
    },
  ] as PlanRoomBundle['transmittals'],
  tokens: [
    {
      id: 'token',
      transmittal_id: 'sent',
      first_opened_at: '2026-10-03T12:00:00Z',
    },
  ] as PlanRoomBundle['tokens'],
});

it('retains frozen print identity, hash, content and recipient holdings when current advances', () => {
  const original = historyBundle();
  const before = JSON.stringify(original);
  const { rerender } = render(<PlanIssueHistory bundle={original} />);
  fireEvent.click(screen.getByText(/Issue 1 · For building/));
  expect(screen.getByText('Issued · also current')).toBeInTheDocument();
  const advanced = {
    ...original,
    sheets: original.sheets.map((sheet) => ({
      ...sheet,
      current_print_id: 'print-b',
    })),
    prints: [
      ...original.prints,
      {
        ...original.prints[0],
        id: 'print-b',
        rev_letter: 'B',
        sha256: 'hash-b',
        print_number: 2,
      },
    ],
  };
  rerender(<PlanIssueHistory bundle={advanced} />);
  const row = document.querySelector(
    '[data-issued-print-id="print-a"]',
  ) as HTMLElement;
  expect(row).toHaveTextContent('A-1 · Frozen title · Rev A');
  expect(row).toHaveTextContent('SHA-256 hash-a');
  expect(row).toHaveTextContent('Issued · not current / superseded');
  expect(row).not.toHaveTextContent('New live title');
  expect(
    screen.getByRole('list', { name: 'Recipients of this issue' }),
  ).toHaveTextContent('Fictional builder · sent');
  expect(
    screen.getByText(/link opened.*receipt not confirmed/),
  ).toBeInTheDocument();
  expect(JSON.stringify(original)).toBe(before);
  expect(advanced.issuePrints).toBe(original.issuePrints);
  expect(advanced.transmittals).toBe(original.transmittals);
});

it('opens each issue’s own frozen title when two issues reuse the same print', async () => {
  const original = historyBundle();
  const bundle: PlanRoomBundle = {
    ...original,
    issues: [
      ...original.issues,
      {
        ...original.issues[0],
        id: 'issue-2',
        issue_number: 2,
        issued_at: '2026-10-04T12:00:00Z',
      },
    ],
    issuePrints: [
      ...original.issuePrints,
      {
        ...original.issuePrints[0],
        id: 'snapshot-2',
        issue_id: 'issue-2',
        sheet_title: 'Later frozen title',
      },
    ],
  };
  const before = JSON.stringify(bundle);
  mockRead.mockReset().mockResolvedValue({
    data: { storage_path: 'private/issued-a.pdf' },
  });
  mockSign.mockReset().mockResolvedValue({
    data: { signedUrl: 'https://local.test/issued-a' },
  });
  render(<PlanIssueHistory bundle={bundle} />);

  for (const [issueNumber, title, otherTitle] of [
    [2, 'Later frozen title', 'Frozen title'],
    [1, 'Frozen title', 'Later frozen title'],
  ] as const) {
    const summary = screen.getByText(
      new RegExp(`Issue ${issueNumber} · For building`),
    );
    fireEvent.click(summary);
    const issue = summary.closest('details')!;
    fireEvent.click(
      within(issue).getByRole('button', { name: 'Open issued print' }),
    );
    const viewer = within(screen.getByRole('dialog'));
    expect(
      viewer.getByText(new RegExp(`^${title} · filed`)),
    ).toBeInTheDocument();
    expect(
      viewer.queryByText(new RegExp(`^${otherTitle} · filed`)),
    ).toBeNull();
    expect(await viewer.findByTitle('A-1 · Rev A')).toHaveAttribute(
      'src',
      'https://local.test/issued-a',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockSign).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(bundle)).toBe(before);
});

it('fetches exact issued bytes only on demand and retries without refiling', async () => {
  mockRead
    .mockReset()
    .mockResolvedValueOnce({ data: null })
    .mockResolvedValue({ data: { storage_path: 'private/issued-a.pdf' } });
  mockSign
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: 'https://local.test/issued-a' } });
  render(<PlanIssueHistory bundle={historyBundle()} />);
  expect(mockRead).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText(/Issue 1 · For building/));
  fireEvent.click(screen.getByRole('button', { name: 'Open issued print' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry opening print' }),
  );
  const frame = await screen.findByTitle('A-1 · Rev A');
  expect(frame).toHaveAttribute('src', 'https://local.test/issued-a');
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockSign).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByText(/SHA-256 hash-a/),
  ).toBeInTheDocument();
});
