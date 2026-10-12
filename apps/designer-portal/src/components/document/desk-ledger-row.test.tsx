import { render } from '@testing-library/react';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DeskLedgerRow, actLanding } from './desk-ledger-row';

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
    state: 'Reinhardt · Site Visit · quiet · no current alert',
    personLine: 'Reinhardt · Site Visit',
    overdueText: null,
    mark: null,
    needKind: null,
    overdue: { isOverdue: false, days: 0 },
    jobHref: '/doc/reinhardt',
    act: { label: 'Open the job', href: '/doc/reinhardt' },
    client: 'Reinhardt',
    custody: 'No current alert',
    needOwner: null,
    dueOn: null,
    valueText: null,
    needText: null,
    motionText: null,
    projectId: null,
    ...over,
  };
}

describe('DeskLedgerRow — the roster line (US-25 slice 4)', () => {
  it('prints the five cells in the line’s own column order', () => {
    const { container } = render(<DeskLedgerRow line={line()} />);
    const cells = Array.from(container.querySelectorAll('[data-ledger-cell]')).map((el) =>
      el.getAttribute('data-ledger-cell'),
    );
    expect(cells).toEqual(['name', 'phase', 'sentence', 'value', 'act']);
  });

  it('prints the phase as an ink word, never a plate or a mark (Q7)', () => {
    const { container } = render(<DeskLedgerRow line={line()} />);
    expect(container.querySelector('[data-ledger-cell="phase"]')).toHaveTextContent('Discovery');
    expect(container.querySelector('[data-roster-mark]')).toBeNull();
    expect(container.querySelector('[data-stage-tab]')).toBeNull();
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('carries the custody word under the name', () => {
    const { container } = render(<DeskLedgerRow line={line({ custody: 'With Anneke' })} />);
    const nameCell = container.querySelector('[data-ledger-cell="name"]')!;
    expect(nameCell).toHaveTextContent('Reinhardt lake house');
    expect(nameCell).toHaveTextContent('With Anneke');
  });

  it('prints the head need’s sentence, its overdue form first', () => {
    const { container, rerender } = render(
      <DeskLedgerRow
        line={line({ needKind: 'overdue_invoice', needText: 'Invoice 1042 is overdue' })}
      />,
    );
    const sentence = () => container.querySelector('[data-ledger-cell="sentence"]');
    expect(sentence()).toHaveTextContent('Invoice 1042 is overdue');
    rerender(
      <DeskLedgerRow
        line={line({
          needKind: 'overdue_invoice',
          needText: 'Invoice 1042 is overdue',
          overdueText: 'Overdue 6 days — Invoice 1042 is overdue',
        })}
      />,
    );
    expect(sentence()).toHaveTextContent('Overdue 6 days — Invoice 1042 is overdue');
  });

  it('prints the in-motion sentence at rest, else the honest at-rest words', () => {
    const { container, rerender } = render(
      <DeskLedgerRow line={line({ motionText: 'With client since 4 Aug' })} />,
    );
    const sentence = () => container.querySelector('[data-ledger-cell="sentence"]');
    expect(sentence()).toHaveTextContent('With client since 4 Aug');
    rerender(<DeskLedgerRow line={line()} />);
    expect(sentence()).toHaveTextContent('No current alert');
    rerender(<DeskLedgerRow line={line({ notChecked: 'Not checked: invoices.' })} />);
    expect(sentence()).toHaveTextContent('Not checked: invoices.');
  });

  it('prints the date in the value column, tabular, and keeps the cell when empty (D8)', () => {
    const { container, rerender } = render(<DeskLedgerRow line={line({ valueText: '4 Aug' })} />);
    const value = () => container.querySelector('[data-ledger-cell="value"]')!;
    expect(value()).toHaveTextContent('4 Aug');
    expect(value().className).toContain('tabular-nums');
    rerender(<DeskLedgerRow line={line()} />);
    expect(value().textContent).toBe('');
  });

  it('names the job on the act, and writes no shadow anywhere', () => {
    const { container } = render(<DeskLedgerRow line={line()} />);
    expect(container.querySelector('[data-action-key^="roster-"]')).toHaveAttribute(
      'aria-label',
      'Open the job — Reinhardt lake house',
    );
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
    }
  });

  // SQ-784 R1 — the act track is a fixed width (globals.css .desk-ledger-row)
  // and a need's act can run past it; the house rule is wrap, never clip.
  it('lets a long act wrap inside its track, on a link act and a ledger act alike', () => {
    const { container, rerender } = render(
      <DeskLedgerRow
        line={line({
          needKind: 'ceremony_pending',
          act: { label: 'Continue the introduction', href: '/doc/reinhardt' },
        })}
      />,
    );
    const act = () => container.querySelector('[data-ledger-cell="act"] [data-action-key^="roster-"]')!;
    expect(act()).toHaveTextContent('Continue the introduction');
    expect(act().className).toContain('whitespace-normal');
    expect(act().className).not.toContain('whitespace-nowrap');
    rerender(
      <DeskLedgerRow
        line={line({
          needKind: 'overdue_invoice',
          act: { label: 'Send reminder', href: '/doc/reinhardt', ledger: { name: 'accounts', context: {} } },
        })}
      />,
    );
    expect(act().tagName).toBe('BUTTON');
    expect(act().className).toContain('whitespace-normal');
    expect(act().className).not.toContain('whitespace-nowrap');
  });

  it('lands a return on the line’s own anchor', () => {
    const { container } = render(<DeskLedgerRow line={line()} />);
    expect(container.querySelector('#roster-line-reinhardt')).not.toBeNull();
  });
});

describe('actLanding — where a line’s act lands on the paper (R-DM21 A)', () => {
  it('lands a need act that opens the job on its stage’s section', () => {
    expect(
      actLanding(line({ needKind: 'hesitating_proposal', stage: 'proposal', act: { label: 'Follow up', href: '/doc/reinhardt' } })),
    ).toEqual({ kind: 'section', sectionKey: 'proposal' });
  });

  it('carries no landing for a ledger act or an act into another room', () => {
    expect(
      actLanding(
        line({
          needKind: 'overdue_invoice',
          act: { label: 'Send reminder', href: '/doc/reinhardt', ledger: { name: 'accounts', context: {} } },
        }),
      ),
    ).toBeNull();
    expect(
      actLanding(line({ needKind: 'new_lead', act: { label: 'Respond', href: '/leads/1' } })),
    ).toBeNull();
  });
});
