/**
 * LedgerFrontMatter (help-desk Wave 1) — the optional `?` doorway after the
 * stat caption: renders only when `helpKey` is passed, and clicking it
 * dispatches the openHelp event with source 'front-matter' + the key.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { dueToMakers, LedgerFrontMatter } from './ledger-front-matter';
import { DOCUMENT_HELP_EVENT, type OpenHelpEventDetail } from '@/lib/help-system/open-help';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

const STATS = [{ label: 'logged', value: '3h 20m' }];

describe('LedgerFrontMatter helpKey doorway', () => {
  it('renders no ? without a helpKey', () => {
    render(<LedgerFrontMatter caption="utilization" stats={STATS} />);
    expect(screen.queryByRole('button', { name: 'About this ledger' })).not.toBeInTheDocument();
  });

  it('renders the quiet ? and opens help scoped to the key with source front-matter', () => {
    const onOpenHelp = jest.fn();
    const listener = (e: Event) => onOpenHelp((e as CustomEvent<OpenHelpEventDetail>).detail);
    window.addEventListener(DOCUMENT_HELP_EVENT, listener);

    render(
      <LedgerFrontMatter
        caption="utilization"
        stats={STATS}
        helpKey={DOCUMENT_SURFACE_KEYS.hours}
      />,
    );

    const glyph = screen.getByRole('button', { name: 'About this ledger' });
    expect(glyph).toHaveTextContent('?');
    fireEvent.click(glyph);

    expect(onOpenHelp).toHaveBeenCalledWith({
      source: 'front-matter',
      surfaceKey: DOCUMENT_SURFACE_KEYS.hours,
    });
    window.removeEventListener(DOCUMENT_HELP_EVENT, listener);
  });

  it('still renders nothing at all with zero stats (the band yields, ? included)', () => {
    const { container } = render(
      <LedgerFrontMatter caption="throughput" stats={[]} helpKey={DOCUMENT_SURFACE_KEYS.orders} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('dueToMakers · the bill-run front matter (C-11, V11)', () => {
  it('totals the due rows across the orders that carry one', () => {
    expect(
      dueToMakers([
        { payments: [{ state: 'due', amount_cents: 441_000 }] },
        {
          payments: [
            { state: 'paid', amount_cents: 300_000 },
            { state: 'due', amount_cents: 210_000 },
          ],
        },
        { payments: [{ state: 'due', amount_cents: 291_000 }] },
        {
          payments: [
            { state: 'due', amount_cents: 100_000 },
            { state: 'due', amount_cents: 100_000 },
          ],
        },
        // Not yet due, already paid, or no schedule: not in the total, not counted.
        { payments: [{ state: 'pending', amount_cents: 999_900 }] },
        { payments: [{ state: 'paid', amount_cents: 50_000 }] },
        { payments: null },
      ]),
    ).toEqual([{ value: '$11,420', label: 'across 4 orders' }]);
  });

  it('reads one order in the singular', () => {
    expect(dueToMakers([{ payments: [{ state: 'due', amount_cents: 814_000 }] }])).toEqual([
      { value: '$8,140', label: 'across 1 order' },
    ]);
  });

  it('says nothing when nothing is due', () => {
    expect(dueToMakers([{ payments: [{ state: 'pending', amount_cents: 1000 }] }])).toEqual([]);
    expect(dueToMakers([])).toEqual([]);
  });

  it('renders as one front-matter line over the rows', () => {
    render(
      <LedgerFrontMatter
        caption="due to makers this week"
        stats={dueToMakers([{ payments: [{ state: 'due', amount_cents: 1_142_000 }] }])}
      />,
    );
    expect(screen.getByText('due to makers this week')).toBeInTheDocument();
    expect(screen.getByText('$11,420')).toBeInTheDocument();
    expect(screen.getByText('across 1 order')).toBeInTheDocument();
  });
});
