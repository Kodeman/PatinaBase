import { render, screen } from '@testing-library/react';
import { RegionHead, type RegionLedgerEntry } from '../region-head';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const ledger: RegionLedgerEntry[] = [
  { key: 'lead-act', label: 'Approve', onClick: jest.fn() },
  { key: 'second-act', label: 'Revise', onClick: jest.fn() },
  { key: 'third-act', label: 'Withdraw', variant: 'danger', onClick: jest.fn() },
  { key: 'fourth-act', label: 'History', variant: 'tertiary', href: '/x' },
];

function renderHead(props: Partial<Parameters<typeof RegionHead>[0]> = {}) {
  return render(
    <RegionHead
      headingId="region-approvals-heading"
      name="Approvals"
      status="Two decisions waiting"
      surfaceKey="document"
      regionKey="approvals"
      actions={ledger}
      {...props}
    />,
  );
}

describe('RegionHead', () => {
  it('inks the leading ledger entry and leaves the rest their declared variant', () => {
    renderHead();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute(
      'data-action-variant',
      'inked',
    );
    expect(screen.getByRole('button', { name: 'Revise' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveAttribute(
      'data-action-variant',
      'danger',
    );
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'data-action-variant',
      'tertiary',
    );
  });

  it('prints the region name at the Life Review’s 24px, over its eyebrow', () => {
    const { container } = renderHead({ eyebrow: 'The job · project' });
    const heading = screen.getByRole('heading', { name: 'Approvals' });
    expect(heading).toHaveClass(
      'font-heading',
      'text-[24px]',
      'text-[var(--text-primary)]',
    );
    const eyebrow = container.querySelector('p')!;
    expect(eyebrow).toHaveTextContent('The job · project');
    expect(eyebrow).toHaveClass(
      'font-mono',
      'text-[11px]',
      'uppercase',
      'text-[var(--text-muted)]',
    );
  });

  it('names the region on a focusable heading', () => {
    renderHead();
    const heading = screen.getByRole('heading', { name: 'Approvals' });
    expect(heading).toHaveAttribute('id', 'region-approvals-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('renders no fold toggle without a body id', () => {
    renderHead();
    expect(
      screen.queryByRole('button', { name: /fold/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the fold toggle expanded and pointed at the body', () => {
    const onFold = jest.fn();
    renderHead({ bodyId: 'region-approvals-body', onFold });
    const fold = screen.getByRole('button', { name: 'Fold ↑' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(fold).toHaveAttribute('aria-controls', 'region-approvals-body');
    expect(fold).toHaveAttribute('data-action-variant', 'tertiary');
  });

  it('keeps the fold when the ledger is empty', () => {
    const onFold = jest.fn();
    renderHead({
      actions: [],
      bodyId: 'region-approvals-body',
      onFold,
    });
    expect(screen.getByRole('button', { name: 'Fold ↑' })).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(0);
    expect(
      document.querySelectorAll('[role="group"] [data-action-key]'),
    ).toHaveLength(1);
  });

  it('stacks the heading above its ledger below 1180 (F28)', () => {
    renderHead();
    const head = document.querySelector('[data-region-head="approvals"]');
    // The two-track grid — the one that put the inked leader over the heading
    // at 390 — is now gated behind 1180; below it the head is one column.
    expect(head).toHaveClass('grid-cols-1');
    expect(head).toHaveClass('min-[1180px]:grid-cols-[minmax(20rem,1fr)_auto]');
    expect(head).not.toHaveClass('grid-cols-[minmax(20rem,1fr)_auto]');
    expect(
      document.querySelector('[role="group"][data-action-region="approvals"]'),
    ).toHaveClass('justify-start', 'min-[1180px]:justify-end');
  });

  // B5 — jsdom lays nothing out, so the fix is asserted as the tracks the
  // browser is handed. Under the Pieces ledger at 1440 the `auto` column took
  // its max-content and the status broke one word per line; the left track's
  // floor caps that column, and the ledger wraps on its own `flex-wrap`.
  it('floors the status track under a four-act ledger so the ACTS wrap, not the words', () => {
    renderHead({
      status: 'the FF&E schedule, by room · 5 groups · 62 lines',
      actions: [
        { key: 'file-claim', label: 'File the claim', onClick: jest.fn() },
        { key: 'add-line', label: 'Add a line', onClick: jest.fn() },
        { key: 'bill', label: 'Bill 62 uninvoiced lines →', onClick: jest.fn() },
        { key: 'spec', label: 'Spec the 4 unspecified →', onClick: jest.fn() },
      ],
      bodyId: 'region-approvals-body',
      onFold: jest.fn(),
    });
    const head = document.querySelector('[data-region-head="approvals"]')!;
    expect(head).toHaveClass('min-[1180px]:grid-cols-[minmax(20rem,1fr)_auto]');
    expect(head).not.toHaveClass('min-[1180px]:grid-cols-[1fr_auto]');

    const group = document.querySelector(
      '[role="group"][data-action-region="approvals"]',
    )!;
    // Five acts on the ledger, and the ledger is the thing that wraps.
    expect(group.querySelectorAll('[data-action-key]')).toHaveLength(5);
    expect(group).toHaveClass('flex-wrap');
    // The status keeps its own track and still never truncates.
    expect(
      screen.getByText('the FF&E schedule, by room · 5 groups · 62 lines'),
    ).not.toHaveClass('truncate');
  });

  // jsdom evaluates no media queries, so "at every width" is asserted
  // structurally rather than by resizing: the ledger's action region rides ONE
  // element, that element carries the whole contract unconditionally, and
  // nothing on the path from the head to it is gated on a breakpoint — the
  // only width-conditional classes are layout (grid tracks, justification).
  it('keeps the ledger action region at <1180 and >=1180 alike', () => {
    renderHead();
    const head = document.querySelector('[data-region-head="approvals"]')!;
    const group = document.querySelector(
      '[role="group"][data-action-region="approvals"]',
    )!;

    // The three attributes the contract is made of, on the queried element.
    expect(group).toHaveAttribute('role', 'group');
    expect(group).toHaveAttribute('data-action-region', 'approvals');
    expect(group).toHaveAttribute('aria-label', 'Approvals actions');
    expect(group).toContainElement(
      screen.getByRole('button', { name: 'Approve' }),
    );

    // <1180 — the stacked head. >=1180 — the two-track grid. Same element.
    expect(head).toHaveClass('grid-cols-1');
    expect(group).toHaveClass('justify-start');
    expect(head).toHaveClass('min-[1180px]:grid-cols-[minmax(20rem,1fr)_auto]');
    expect(group).toHaveClass('min-[1180px]:justify-end');

    // No class on either the head or the ledger removes the region at a width.
    for (const element of [head, group]) {
      expect(
        Array.from(element.classList).filter((name) =>
          /(?:^|:)hidden$/.test(name),
        ),
      ).toEqual([]);
    }
  });

  it('names the ledger after the region even when the head only folds', () => {
    renderHead({
      actions: [],
      bodyId: 'region-approvals-body',
      onFold: jest.fn(),
    });
    expect(
      document.querySelector('[role="group"][data-action-region="approvals"]'),
    ).toHaveAttribute('aria-label', 'Approvals actions');
  });

  it('wraps a long status instead of truncating it (F87)', () => {
    const status =
      'Client approvals — 2 awaiting · the Vandersteens · sent Tuesday, August 25';
    renderHead({ status });
    expect(screen.getByText(status)).not.toHaveClass('truncate');
  });

  it('prints the worst two exceptions and drops a third whole', () => {
    renderHead({
      status: 'the FF&E schedule, by room · 3 groups · 12 lines',
      exceptions: ['1 open damage claim', '2 unspecified', '3 uninvoiced'],
    });
    expect(screen.getByText(/1 open damage claim/)).toBeInTheDocument();
    expect(screen.getByText(/2 unspecified/)).toBeInTheDocument();
    // Dropped whole, never abbreviated.
    expect(screen.queryByText(/3 uninvoiced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/…/)).not.toBeInTheDocument();
  });

  it('prints no second line when the region carries no exception', () => {
    renderHead({ status: 'the FF&E schedule, by room · 1 group · 2 lines' });
    expect(
      document.querySelectorAll('.text-\\[12\\.5px\\]'),
    ).toHaveLength(1);
  });

  it('reports an empty head with nothing to fold', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHead({ actions: [] });
    expect(spy.mock.calls.some((call) => /neither a ledger entry/.test(String(call[0])))).toBe(true);
    spy.mockRestore();
  });

  // W3-L4 — `allowNoActs` silences the guard for a head that is neither
  // foldable nor ledgered by construction (a ratified state), while leaving
  // the guard on everywhere else.
  it('silences the empty-head guard when allowNoActs is set', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHead({ actions: [], allowNoActs: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
