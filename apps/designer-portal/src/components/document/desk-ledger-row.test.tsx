import { render } from '@testing-library/react';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DeskLedgerRow } from './desk-ledger-row';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function line(over: Partial<RosterLine> = {}): RosterLine {
  return {
    engagementId: 'reinhardt',
    name: 'Reinhardt lake house',
    stage: 'discovery',
    designerId: null,
    state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
    overdueText: null,
    mark: null,
    needKind: null,
    overdue: { isOverdue: false, days: 0 },
    jobHref: '/doc/reinhardt',
    act: { label: 'Open the job', href: '/doc/reinhardt' },
    client: 'Reinhardt',
    custody: 'At rest',
    needOwner: null,
    dueOn: null,
    valueText: null,
    needText: null,
    motionText: null,
    projectId: null,
    ...over,
  };
}

describe('DeskLedgerRow — the at-rest row', () => {
  it('prints the five cells in the ledger’s own column order', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const cells = Array.from(
      container.querySelectorAll('[data-ledger-cell]'),
    ).map((el) => el.getAttribute('data-ledger-cell'));

    expect(cells).toEqual(['mark', 'name', 'sentence', 'value', 'act']);
  });

  it('wears the at-rest ring, never a filled mark', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const mark = container.querySelector('[data-roster-mark]')!;

    expect(mark.getAttribute('data-mark-tone')).toBeNull();
    expect(mark.getAttribute('data-mark-color')).toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the custody word and the person · phase run under the name', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const nameCell = container.querySelector('[data-ledger-cell="name"]')!;

    expect(nameCell).toHaveTextContent('At rest');
    expect(nameCell).toHaveTextContent('Reinhardt lake house');
    expect(nameCell).toHaveTextContent('Site Visit');
  });

  it('prints the in-motion sentence where the job has one', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ motionText: 'With client since 4 Aug' })}
        tone="discovery"
      />,
    );

    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      'With client since 4 Aug',
    );
  });

  it('says nothing needs your hand where the job is not in motion', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      'Nothing needs your hand.',
    );
  });

  it('prints the in-motion date in the value column, tabular (D8)', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ motionText: 'With client since 4 Aug', valueText: '4 Aug' })}
        tone="discovery"
      />,
    );
    const value = container.querySelector('[data-ledger-cell="value"]')!;

    expect(value).toHaveTextContent('4 Aug');
    expect(value.className).toContain('tabular-nums');
  });

  it('renders an empty value cell rather than dropping the column', () => {
    // The column is the grid that makes a ledger a ledger: figures line up
    // down the page only if the cell is always there.
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-ledger-cell="value"]')!.textContent).toBe('');
  });

  it('names the job on the act, and writes no shadow anywhere', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-action-key^="roster-"]')).toHaveAttribute(
      'aria-label',
      'Open the job — Reinhardt lake house',
    );
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
    }
  });

  it('lands the day’s line’s anchor on the row', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('#roster-line-reinhardt')).not.toBeNull();
  });
});
