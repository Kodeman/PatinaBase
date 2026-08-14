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

  it('reports an empty head with nothing to fold', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHead({ actions: [] });
    expect(spy.mock.calls.some((call) => /neither a ledger entry/.test(String(call[0])))).toBe(true);
    spy.mockRestore();
  });
});
