import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import type { NeedKind } from '@/lib/document/desk-derivation';
import { deriveLensBand, type LensStandingItem } from '@/lib/document/lens-band-derivation';
import { StandingSheet } from '../standing-sheet';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const item = (
  key: string,
  eyebrow: string,
  sentence: string,
  actLabel: string | null,
  tier: LensStandingItem['tier'],
): LensStandingItem => ({
  key,
  eyebrow,
  sentence,
  act: actLabel ? { label: actLabel, onAct: jest.fn() } : null,
  tier,
  days: null,
  standingSince: null,
});

const FOUR: LensStandingItem[] = [
  item('a', 'OVERDUE 6D', 'Primary bedroom approval', 'Send a reminder', 'overdue'),
  item('b', 'OVERDUE 3D', 'Living room fabric', 'Choose the fabric', 'overdue'),
  item('c', 'CLAIM OPEN', 'Carrier window, brass-and-oak console', 'Review the claim', 'damage'),
  item('d', 'NO ACK', 'PO-2026-0418 unanswered, Sturdy Oak', 'Follow up with the maker', 'po-silence'),
];

describe('StandingSheet (OD-6 / L-11)', () => {
  it('titles itself with the whole count, and marks the panel a standing sheet', () => {
    render(<StandingSheet open onClose={jest.fn()} items={FOUR} />);
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-doc-sheet-kind', 'standing');
    expect(panel).toHaveAccessibleName('Standing · 4');
  });

  it('lists EVERY standing exception with its own kind, sentence and act', () => {
    render(<StandingSheet open onClose={jest.fn()} items={FOUR} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.getAttribute('data-standing-tier'))).toEqual([
      'overdue',
      'overdue',
      'damage',
      'po-silence',
    ]);
    FOUR.forEach((entry, index) => {
      const row = within(rows[index]);
      expect(row.getByText(entry.eyebrow)).toBeInTheDocument();
      expect(row.getByText(entry.sentence)).toBeInTheDocument();
      expect(
        row.getByRole('button', { name: entry.act!.label }),
      ).toBeInTheDocument();
    });
  });

  it('prints a row that opens nothing without an act, and never drops it', () => {
    const items = [...FOUR, item('e', 'STUCK', '2 unspecified', null, 'po-silence')];
    render(<StandingSheet open onClose={jest.fn()} items={items} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('2 unspecified')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 5');
  });

  it('fires the row act the band handed it', () => {
    render(<StandingSheet open onClose={jest.fn()} items={FOUR} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose the fabric' }));
    expect(FOUR[1].act!.onAct).toHaveBeenCalledTimes(1);
  });

  it('puts itself back on Escape', () => {
    const onClose = jest.fn();
    render(<StandingSheet open onClose={onClose} items={FOUR} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── W3-F8 — with nothing standing there is no list to rule off ──────────
  it('renders no exceptions list, and no rule over the inputs, when none stand', () => {
    const { container } = render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={[]}
        inputs={[
          {
            key: '0:Working budget',
            eyebrow: 'BUDGET',
            sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
            act: null,
          },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-standing-row]')).toHaveLength(0);
    const heading = screen.getByText('INPUT NEEDED · 1');
    expect(heading.className).not.toMatch(/border-t|mt-4|pt-3/);
    // Exactly one list: the inputs'.
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  it('keeps the rule over the inputs while something stands', () => {
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={FOUR}
        inputs={[
          {
            key: '0:Working budget',
            eyebrow: 'BUDGET',
            sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
            act: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('INPUT NEEDED · 1').className).toMatch(/border-t/);
  });

  // FR1 F14 / R20 — the Direction's collapsed row: one sentence, one act, and
  // no kind word of its own under the section's heading.
  it('prints the proposal’s collapsed input row with one act and no empty eyebrow', () => {
    const onAct = jest.fn();
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={[]}
        inputs={[
          {
            key: 'proposal-inputs',
            eyebrow: '',
            sentence: 'The proposal needs 8 inputs',
            act: { key: 'write-the-proposal', label: 'Write the proposal', onAct },
          },
        ]}
      />,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAccessibleName('Standing · 1');
    const rows = panel.querySelectorAll('[data-standing-input-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll('p')).toHaveLength(1);
    expect(panel).not.toHaveTextContent(/blocks|Client proposal/);
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Write the proposal' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('D10 — files setup under a clay SETUP eyebrow at the foot, counted, never terracotta', () => {
    const onAct = jest.fn();
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={FOUR}
        inputs={[
          {
            key: '0:Working budget',
            eyebrow: 'BUDGET',
            sentence: 'Working budget · Client · blocks Direction',
            act: null,
          },
        ]}
        setup={[
          {
            key: 'setup:no_client_linked',
            setup: 'no_client_linked',
            sentence: 'No client linked',
            act: { key: 'setup:no_client_linked', label: 'Link a client', onAct },
            opensSheet: true,
          },
        ]}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 6');
    const heading = screen.getByText('SETUP');
    expect(heading).toHaveClass('text-[var(--color-clay-ink)]');
    expect(heading.className).toMatch(/border-t/);
    // At the foot: after the inputs' heading in document order.
    const inputs = screen.getByText('INPUT NEEDED · 1');
    expect(
      inputs.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const row = document.querySelector('[data-standing-setup-row]') as HTMLElement;
    expect(row).toHaveTextContent('No client linked');
    expect(row.innerHTML).not.toMatch(/terracotta/);
    fireEvent.click(within(row).getByRole('button', { name: 'Link a client' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('D10 — a setup act that lands on the paper puts the sheet back before it runs', async () => {
    const onAct = jest.fn();
    const onClose = jest.fn();
    render(
      <StandingSheet
        open
        onClose={onClose}
        items={[]}
        setup={[
          {
            key: 'setup:target_date_unset',
            setup: 'target_date_unset',
            sentence: 'No target date set',
            act: { key: 'setup:target_date_unset', label: 'Set dates', onAct },
            opensSheet: false,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set dates' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Not yet: the sheet's door takes focus a frame after the close.
    expect(onAct).not.toHaveBeenCalled();
    await waitFor(() => expect(onAct).toHaveBeenCalledTimes(1));
  });

  it('mounts nothing while closed', () => {
    const triggerRef = createRef<HTMLElement>();
    render(
      <StandingSheet
        open={false}
        onClose={jest.fn()}
        items={FOUR}
        triggerRef={triggerRef}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('StandingSheet · one voice (US-19 FR2)', () => {
  const pay: LensStandingItem = {
    ...item('pay', 'PAYMENT DUE', 'Balance to Woodward & Sons', 'Record the payment', 'overdue'),
    needKind: 'payment_due',
    sense: 'past',
    distance: -9,
  };
  const claim: LensStandingItem = {
    ...item('claim', 'CLAIM OPEN', 'Console arrived cracked', 'File the claim', 'damage'),
    needKind: 'damage_claim',
  };
  const silence: LensStandingItem = {
    ...item('po', 'NO ACK', 'PO-2026-0418 unanswered', 'Follow up with the maker', 'po-silence'),
    needKind: 'po_unacknowledged',
  };

  it('F2-6 — titles itself with the door’s count, not every row', () => {
    render(
      <StandingSheet open onClose={jest.fn()} items={[pay, claim, silence]} grouped count={2} nextKey="pay" />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 2');
  });

  it('F2-6 — stands Next’s row first in its group, under a NEXT eyebrow', () => {
    render(
      <StandingSheet open onClose={jest.fn()} items={[claim, silence]} grouped count={1} nextKey="po" />,
    );
    const rows = Array.from(
      document.querySelectorAll('[data-standing-group="needs-you"] [data-standing-row]'),
    );
    expect(rows[0]).toHaveAttribute('data-standing-next');
    expect(rows[0]).toHaveTextContent('PO-2026-0418 unanswered');
    expect(within(rows[0] as HTMLElement).getByText('NEXT')).toHaveAttribute(
      'data-standing-next-eyebrow',
    );
    expect(rows[1]).not.toHaveAttribute('data-standing-next');
    expect(screen.getAllByText('NEXT')).toHaveLength(1);
  });

  it('498-k — scores only the four named acts; every other act is plain', () => {
    render(<StandingSheet open onClose={jest.fn()} items={[pay, claim, silence]} grouped />);
    const variant = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('data-action-variant');
    expect(variant('File the claim')).toBe('primary');
    expect(variant('Record the payment')).toBe('secondary');
    expect(variant('Follow up with the maker')).toBe('secondary');
  });

  it('keeps every act plain and the whole count while the flag is off', () => {
    render(<StandingSheet open onClose={jest.fn()} items={[pay, claim, silence]} nextKey="pay" />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 3');
    expect(screen.getByRole('button', { name: 'File the claim' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
    expect(screen.queryByText('NEXT')).toBeNull();
  });

  // FR3 512-5 / F3-24 — a row wears one stamp.
  it('F3-24 — `NEXT` replaces the kind eyebrow on Next’s row; the others keep theirs', () => {
    render(
      <StandingSheet open onClose={jest.fn()} items={[pay, claim]} grouped count={1} nextKey="pay" />,
    );
    const next = document.querySelector('[data-standing-next]') as HTMLElement;
    expect(within(next).getByText('NEXT')).toHaveAttribute('data-standing-next-eyebrow');
    expect(within(next).queryByText('PAYMENT DUE')).toBeNull();
    expect(screen.queryByText('PAYMENT DUE')).toBeNull();
    expect(screen.getByText('CLAIM OPEN')).toBeInTheDocument();
  });

  it('F3-24 — off, the kind eyebrow stays', () => {
    render(<StandingSheet open onClose={jest.fn()} items={[pay, claim]} nextKey="pay" />);
    expect(screen.getByText('PAYMENT DUE')).toBeInTheDocument();
  });

  // FR3 F3-9 — one need, one row: on Halloran the sheet's rows behind Next are
  // exactly the door's count.
  it('F3-9 — the rows behind Next equal the door (Halloran)', () => {
    const red = (key: string, kind: NeedKind, text: string, actionLabel: string) => ({
      key,
      kind,
      text,
      actionLabel,
      onAct: jest.fn(),
      urgent: false,
      dueOn: null,
    });
    const { voice } = deriveLensBand({
      spreadKind: 'project',
      ticket: [
        {
          key: 'pieces',
          label: 'Pieces',
          value: '1 line',
          emphasis: null,
          door: { kind: 'none' },
          exception: {
            rank: 'piece-stuck',
            phrase: 'NA-2026-077 unanswered, 6 days',
            standingSince: '2026-10-01',
          },
        },
      ],
      needs: [
        { ...red('po-0', 'po_unacknowledged', 'NA-2026-077 sent — no acknowledgment', 'Follow up with the maker'), owner: 'maker' },
        red('sched-0', 'schedule_unconfigured', 'Name the phases for this project', 'Open the schedule'),
      ],
      guide: null,
      tier: 'full',
      now: new Date('2026-10-07T12:00:00'),
      household: 'Client User',
      jobName: 'Halloran House',
      stageWord: 'Project',
      stageIndex: null,
      installDate: null,
      moneyFigure: null,
      proposalInvestment: null,
      sentDate: null,
      ownAct: null,
      landOn: jest.fn(),
      setup: [
        { kind: 'no_client_linked', onAct: jest.fn() },
        { kind: 'target_date_unset', onAct: jest.fn() },
        { kind: 'budget_band_unset', onAct: jest.fn() },
      ],
    });
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={voice.standing}
        inputs={voice.inputs}
        setup={voice.setup}
        grouped
        count={voice.standingCount}
        nextKey={voice.next?.rowKey ?? null}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 4');
    expect(screen.getAllByText(/NA-2026-077/)).toHaveLength(1);
    const behind = document.querySelectorAll(
      '[data-standing-row]:not([data-standing-next]), [data-standing-input-row], [data-standing-setup-row]:not([data-standing-next])',
    );
    expect(behind).toHaveLength(voice.standingCount);
  });
});
