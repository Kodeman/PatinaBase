import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskLedger, DeskLedgerLine, RosterLine } from '@/lib/document/desk-roster-derivation';
import { DeskLedgerRow, actLanding } from './desk-ledger-row';
import { DeskRoster } from './desk-roster';

const mockMutate = jest.fn();
jest.mock('@patina/supabase', () => ({
  useSetNeedState: () => ({ mutate: mockMutate, isPending: false }),
}));

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

  it('sets the name on its stage’s 2 px tick, and prints no custody word (US-28 S3)', () => {
    const { container } = render(<DeskLedgerRow line={line({ custody: 'With Anneke' })} />);
    const nameCell = container.querySelector('[data-ledger-cell="name"]')!;
    expect(nameCell).toHaveClass('tick', 'st-discovery');
    expect(nameCell).toHaveTextContent(/^Reinhardt lake house$/);
    expect(within(nameCell as HTMLElement).getByRole('link', { name: 'Reinhardt lake house' })).toHaveAttribute(
      'href',
      '/doc/reinhardt',
    );
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

describe('DeskLedgerRow — standing (US-28 S3 change 2)', () => {
  const need = { needKind: 'po_unacknowledged', needKey: 'po_unacknowledged:po-1', needText: 'Fabric samples, not yet opened' } as const;
  const actCell = (container: HTMLElement) => container.querySelector('[data-ledger-cell="act"]')!;

  beforeEach(() => mockMutate.mockReset());

  it('a row with others reads “waiting on {who} since {day}”, with no act', () => {
    const { container } = render(
      <DeskLedgerRow line={line(need)} standing="others" waiting={{ who: 'Mae Halloran', since: '2026-10-06' }} />,
    );
    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      /^Fabric samples, not yet opened · waiting on Mae Halloran$/,
    );
    expect(container.querySelector('[data-ledger-cell="value"]')).toHaveTextContent(/^Since Tue 6 Oct$/);
    expect(actCell(container).childElementCount).toBe(0);
  });

  it('a row coming back reads “Back {day}”, with no act', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line(need)}
        standing="back"
        back={{ until: '2026-10-16', reason: 'waiting on the Chens’ bench decision' }}
      />,
    );
    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      'Fabric samples, not yet opened · waiting on the Chens’ bench decision',
    );
    expect(container.querySelector('[data-ledger-cell="value"]')).toHaveTextContent(/^Back Fri 16 Oct$/);
    expect(actCell(container).childElementCount).toBe(0);
  });

  it('a row settled today prints muted, in place, and carries no act', () => {
    const at = new Date(2026, 9, 12, 14, 40).toISOString();
    const { container } = render(
      <DeskLedgerRow
        line={line({ ...need, needKind: 'new_lead', needText: 'Replied' })}
        standing="settled"
        settled={{ kind: 'acted', at, who: 'Ainsley Moore' }}
      />,
    );
    const row = container.querySelector('[data-ledger-row]')!;
    expect(row).toHaveClass('lrow', 'settled');
    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      /^Replied · waiting on Ainsley Moore since 2:40$/,
    );
    expect(actCell(container).childElementCount).toBe(0);
  });

  it('her own “Not today”, settled today, offers Undo, which clears the state row', async () => {
    const at = new Date(2026, 9, 12, 16, 15).toISOString();
    const { container } = render(
      <DeskLedgerRow
        line={line({ ...need, projectId: 'p-reinhardt' })}
        standing="settled"
        settled={{ kind: 'not_today', at, until: '2026-10-13' }}
      />,
    );
    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      /^Not today · 4:15 · back Tue 13 Oct$/,
    );
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Undo — Reinhardt lake house' }));
    });
    expect(mockMutate).toHaveBeenCalledWith(
      { needKey: 'po_unacknowledged:po-1', engagementId: 'p-reinhardt', action: 'clear' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('says so in the row when Undo did not save', async () => {
    mockMutate.mockImplementation((_vars, options) => options?.onError?.(new Error('refused')));
    render(
      <DeskLedgerRow
        line={line(need)}
        standing="settled"
        settled={{ kind: 'set_aside', at: new Date().toISOString(), until: '2026-10-16' }}
      />,
    );
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /^Undo — / }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Undo did not save. Try again.');
  });

  describe('after Undo lands (R6)', () => {
    const ledgerOf = (ledgerLine: DeskLedgerLine): DeskLedger => ({
      sections: [{ key: 'mine', label: null, groups: [{ key: 'yours', label: 'Also yours', lines: [ledgerLine] }] }],
      notChecked: null,
    });
    const settledToday = { kind: 'not_today' as const, at: new Date(2026, 9, 12, 16, 15).toISOString(), until: '2026-10-13' };
    const undo = async () => {
      await act(async () => {
        await userEvent.setup().click(screen.getByRole('button', { name: 'Undo — Reinhardt lake house' }));
      });
    };

    it('moves focus to the restored row’s act, and the ledger’s status says “Undone.”', async () => {
      const row = line({ ...need, projectId: 'p-reinhardt', act: { label: 'Chase the maker', href: '/doc/reinhardt' } });
      const { rerender } = render(
        <DeskRoster ledger={ledgerOf({ line: row, standing: 'settled', settled: settledToday, waiting: null, back: null })} />,
      );
      await undo();
      // The clear lands: the row reads open again, in its place.
      rerender(<DeskRoster ledger={ledgerOf({ line: row, standing: 'yours', settled: null, waiting: null, back: null })} />);
      expect(screen.queryByRole('button', { name: /^Undo — / })).toBeNull();
      expect(screen.getByRole('link', { name: 'Chase the maker — Reinhardt lake house' })).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent(/^Reinhardt lake house: Undone\.$/);
    });

    it('moves focus to the row’s name where the restored row prints no act', async () => {
      const row = line({ ...need, projectId: 'p-reinhardt' });
      const jordan = { userId: 'u-jordan', name: 'Jordan', mine: false };
      const { rerender } = render(
        <DeskRoster
          ledger={ledgerOf({ line: row, standing: 'settled', settled: settledToday, waiting: null, back: null })}
          holderOf={() => jordan}
        />,
      );
      await undo();
      rerender(
        <DeskRoster
          ledger={ledgerOf({ line: row, standing: 'yours', settled: null, waiting: null, back: null })}
          holderOf={() => jordan}
        />,
      );
      expect(screen.getByRole('link', { name: 'Reinhardt lake house' })).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent(/^Reinhardt lake house: Undone\.$/);
    });

    it('a refused Undo keeps the row settled, says so, and announces nothing', async () => {
      mockMutate.mockImplementation((_vars, options) => options?.onError?.(new Error('refused')));
      const ledger = ledgerOf({ line: line(need), standing: 'settled', settled: settledToday, waiting: null, back: null });
      const { rerender } = render(<DeskRoster ledger={ledger} />);
      await undo();
      rerender(<DeskRoster ledger={ledger} />);
      expect(screen.getByRole('button', { name: 'Undo — Reinhardt lake house' })).toHaveFocus();
      expect(screen.getByRole('alert')).toHaveTextContent('Undo did not save. Try again.');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
  });

  it('a teammate’s settled deferral offers her no Undo', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line(need)}
        standing="settled"
        settled={{ kind: 'not_today', at: new Date().toISOString(), until: '2026-10-13', by: 'u-jordan' }}
      />,
    );
    expect(actCell(container).childElementCount).toBe(0);
  });

  it('a row she does not carry prints whose move it is, with no act', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ ...need, act: { label: 'Chase the maker', href: '/doc/reinhardt' } })}
        standing="yours"
        holder={{ userId: 'u-jordan', name: 'Jordan', mine: false }}
      />,
    );
    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      /^Fabric samples, not yet opened The move is Jordan’s.$/,
    );
    expect(actCell(container).childElementCount).toBe(0);
  });

  it('a row she carries keeps its one act', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ ...need, act: { label: 'Chase the maker', href: '/doc/reinhardt' } })}
        standing="yours"
        holder={{ userId: 'me', name: 'Leah', mine: true }}
      />,
    );
    expect(within(actCell(container) as HTMLElement).getByRole('link', { name: 'Chase the maker — Reinhardt lake house' }))
      .toBeInTheDocument();
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
