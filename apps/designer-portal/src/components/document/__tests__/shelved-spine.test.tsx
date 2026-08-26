/**
 * The spine after B1's subtraction: one block, the running index, and nothing
 * else. The rooms and the shelves are the ticket's rows on the paper now, so
 * the two blocks that used to stand here are gone — `spine-rooms-block.tsx`
 * and `spine-shelves-block.tsx` are both deleted (B2). What survives of the
 * shelves is the Finalize table's one row, `The client's copy`, until the
 * ticket mounts on the proposal spread and its ninth row carries it.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { useRoomLens, RoomLensProvider } from '../room-lens-context';
import { SpineRunningIndex } from '../spine-running-index';
import { FinalizeShelf } from '../worktable/finalize-shelf';
import { DocSpineShelvedBlocks } from '../spine-shelved-blocks';
import {
  PROJECT_PAPER_ORDER,
  paperRegionsForSection,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

/** The block's reads; none of them is this file's subject except where the
 *  ladder's live rung is what a test is checking. */
const mockInvoiceRows: unknown[] = [];
const mockPurchaseOrderRows: unknown[] = [];
/** Neither of these two reads carries an `enabled` gate, so the only way to
 *  withhold them on a spread that prints no money row is not to mount the
 *  component that calls them. Counted, so that stays true. */
const mockLadderReads = { purchaseOrders: 0, invoices: 0 };
jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return {
    __esModule: true,
    useProjectFFEItems: () => ({ data: [] }),
    useProjectInvoices: () => {
      mockLadderReads.invoices += 1;
      return { isLoading: false, error: null, data: mockInvoiceRows };
    },
    usePurchaseOrders: () => {
      mockLadderReads.purchaseOrders += 1;
      return { isLoading: false, error: null, data: mockPurchaseOrderRows };
    },
    computeArAging: actual.computeArAging,
    invoiceDaysOverdue: actual.invoiceDaysOverdue,
  };
});
jest.mock('@/hooks/use-commercial-documents', () => ({
  __esModule: true,
  useProjectBillingAuthority: () => ({
    isLoading: false,
    error: null,
    data: { authorizedCents: 0 },
  }),
  useWorkingBudget: () => ({ isLoading: false, error: null, data: null }),
  useProjectInstruments: () => ({ isLoading: false, error: null, data: [] }),
  useTradeScopes: () => ({ isLoading: false, error: null, data: [] }),
}));

const mockRunningIndexCalls: DocumentIndexKey[][] = [];
jest.mock('@/hooks/use-document-running-index', () => ({
  __esModule: true,
  useDocumentRunningIndex: (keys: readonly DocumentIndexKey[]) => {
    mockRunningIndexCalls.push([...keys]);
    return { activeKey: null, jump: jest.fn() };
  },
}));

const VALUES: Record<DocumentIndexKey, string> = {
  schedule: 'Week 1 of 14',
  approvals: '3 in the log',
  ffe: '10 pieces · 5 rooms',
  money: '$24,000 owed',
};

/** Built FROM the canonical order, so this fixture cannot quietly go on
 *  asserting a reading order the paper has stopped having. */
const entries = PROJECT_PAPER_ORDER.map((region) => ({
  key: region.key,
  label: region.label,
  value: VALUES[region.key],
}));

describe('the running index', () => {
  it('marks exactly one entry current and jumps from any of them', () => {
    const onJump = jest.fn();
    render(
      <SpineRunningIndex entries={entries} activeKey="ffe" onJump={onJump} />,
    );

    expect(
      screen.getByRole('button', { name: /Pieces/ }),
    ).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Schedule/ })).toHaveAttribute(
      'aria-current',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: /Money/ }));
    expect(onJump).toHaveBeenCalledWith('money');
  });

  it('prints its lines in the paper order — approvals above the ledger, as the DOM mounts them', () => {
    render(
      <SpineRunningIndex entries={entries} activeKey={null} onJump={jest.fn()} />,
    );
    expect(
      screen
        .getAllByRole('button')
        .map((b) => b.querySelector('span')?.textContent),
    ).toEqual([
      'Client approvals',
      'Schedule',
      'Pieces',
      'Money',
    ]);
  });

  it('is named "On this paper" — the product’s own metaphor, and no longer the ticket’s word', () => {
    render(
      <SpineRunningIndex entries={entries} activeKey={null} onJump={jest.fn()} />,
    );
    expect(screen.getByText('On this paper')).toBeInTheDocument();
    expect(screen.queryByText('In this document')).not.toBeInTheDocument();
  });
});

describe('the room lens', () => {
  function Probe() {
    const { heldRoomId, toggleRoom } = useRoomLens();
    return (
      <button type="button" onClick={() => toggleRoom('r1')}>
        {heldRoomId ?? 'none'}
      </button>
    );
  }

  it('holds one room and lets go of it on a second press', () => {
    render(
      <RoomLensProvider>
        <Probe />
      </RoomLensProvider>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('none');
    fireEvent.click(button);
    expect(button).toHaveTextContent('r1');
    fireEvent.click(button);
    expect(button).toHaveTextContent('none');
  });

  it('holds nothing at all outside a provider rather than throwing', () => {
    render(<Probe />);
    expect(screen.getByRole('button')).toHaveTextContent('none');
  });
});

describe('the Finalize table’s one row — `The client’s copy`', () => {
  it('declares expansion, because the row opens a leaf', () => {
    render(<FinalizeShelf openShelf="clientcopy" onToggleShelf={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: /The client’s copy/ }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('names the trigger so the leaf can hand focus back', () => {
    render(<FinalizeShelf openShelf={null} onToggleShelf={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: /The client’s copy/ }),
    ).toHaveAttribute('data-shelf-trigger', 'clientcopy');
  });

  it('points aria-controls at the leaf only while the leaf is on the page', () => {
    const { rerender } = render(
      <FinalizeShelf openShelf={null} onToggleShelf={jest.fn()} />,
    );
    // A closed leaf renders nothing — naming its id would offer a jump into a
    // void.
    expect(
      screen.getByRole('button', { name: /The client’s copy/ }),
    ).not.toHaveAttribute('aria-controls');

    rerender(<FinalizeShelf openShelf="clientcopy" onToggleShelf={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: /The client’s copy/ }),
    ).toHaveAttribute('aria-controls', 'doc-shelf-leaf');
  });

  it('heads no group: one row is not a shelf-full', () => {
    render(<FinalizeShelf openShelf={null} onToggleShelf={jest.fn()} />);
    expect(screen.queryByText('The shelves')).not.toBeInTheDocument();
  });

  it('reaches the copy when pressed', () => {
    const onToggle = jest.fn();
    render(<FinalizeShelf openShelf={null} onToggleShelf={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /The client’s copy/ }));
    expect(onToggle).toHaveBeenCalledWith('clientcopy');
  });
});

describe('paperRegionsForSection', () => {
  it('gives the Project spread all four regions, in the paper order', () => {
    expect(paperRegionsForSection('project').map((r) => r.key)).toEqual([
      'approvals',
      'schedule',
      'ffe',
      'money',
    ]);
  });

  it('drops the money and schedule regions on install and on care — neither spread mounts either', () => {
    // MoneyRegion and ScheduleSpine — the only `data-index-region="money"` and
    // `="schedule"` roots — both mount inside page.tsx's
    // `spreadSection === 'project'` branch, so a row for either on these
    // spreads would be a jump target with nothing behind it.
    for (const section of ['install', 'care'] as const) {
      expect(paperRegionsForSection(section).map((r) => r.key)).toEqual([
        'approvals',
        'ffe',
      ]);
    }
  });

  it('names no Project region on the spreads before the work starts', () => {
    for (const section of [
      'brief',
      'discovery',
      'direction',
      'proposal',
    ] as const) {
      expect(paperRegionsForSection(section)).toEqual([]);
    }
  });

  it('can never state an order the canonical paper order does not print', () => {
    const canonical = PROJECT_PAPER_ORDER.map((r) => r.key);
    for (const section of ['project', 'install', 'care'] as const) {
      const subset = paperRegionsForSection(section).map((r) => r.key);
      expect(subset).toEqual(canonical.filter((key) => subset.includes(key)));
    }
  });
});

describe('the spine’s one block', () => {
  const props = {
    projectId: 'proj-1',
    rooms: [],
    scheduleValue: 'Week 1 of 14',
    approvalsValue: '3 in the log',
  } as const;

  beforeEach(() => {
    mockRunningIndexCalls.length = 0;
  });

  const indexRows = () =>
    Array.from(
      screen
        .getByRole('group', { name: 'On this paper' })
        .querySelectorAll('button'),
    );

  it('renders On this paper and nothing else — no rooms block, no shelves block', () => {
    const { container } = render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('project')}
      />,
    );
    expect(screen.getByText('On this paper')).toBeInTheDocument();
    // The two headings the spine used to grow beneath the index.
    expect(screen.queryByText('Rooms')).not.toBeInTheDocument();
    expect(screen.queryByText('The shelves')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Take a room in hand · nothing hides'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-shelf-trigger]')).toBeNull();
    // Every button left in the spine's block belongs to the index itself.
    expect(container.querySelectorAll('button')).toHaveLength(
      indexRows().length,
    );
  });

  it('prints one index line per region the spread mounts — four on project', () => {
    render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('project')}
      />,
    );
    expect(indexRows()).toHaveLength(4);
  });

  it('prints two on install and on care — no line for the money or schedule region', () => {
    for (const section of ['install', 'care'] as const) {
      const { unmount } = render(
        <DocSpineShelvedBlocks
          {...props}
          regions={paperRegionsForSection(section)}
        />,
      );
      const rows = indexRows().map((b) => b.querySelector('span')?.textContent);
      expect(rows).toHaveLength(2);
      expect(rows).not.toContain('Money');
      expect(rows).not.toContain('Schedule');
      unmount();
    }
  });

  it('offers the reading line only the keys the spread mounts', () => {
    render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('install')}
      />,
    );
    expect(mockRunningIndexCalls[0]).toEqual(['approvals', 'ffe']);
  });

  it('reports the live money rung instead of the one empty tier (F09/F61)', () => {
    mockInvoiceRows.length = 0;
    mockInvoiceRows.push({
      id: 'inv-1',
      invoice_number: '2026-114',
      status: 'sent',
      due_date: '2020-01-01',
      total_cents: 1_750_000,
      amount_paid_cents: 0,
      ar_flagged_at: null,
    });
    render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('project')}
      />,
    );
    const moneyRow = screen.getByRole('button', { name: /Money/ });
    expect(moneyRow).toHaveTextContent('$17,500 owed');
    mockInvoiceRows.length = 0;
  });

  it('reaches the undrawn deposit rather than reporting $0 moved (F61)', () => {
    // The live failure on the Chen residence: nothing owed, nothing ordered,
    // $10,090 paid out and a $16,330 deposit standing undrawn. `Moved` clamps
    // at zero — a FIGURE — so the index stopped there and printed "$0 moved"
    // beside real money the region itself opened unfolded to show.
    mockPurchaseOrderRows.length = 0;
    mockPurchaseOrderRows.push({
      id: 'po-1',
      po_number: 'PO-2026-0418',
      payments: [
        { id: 'a', state: 'paid', kind: 'deposit', amount_cents: 1_009_000, label: null },
        { id: 'b', state: 'due', kind: 'deposit', amount_cents: 1_633_000, label: '50% at release' },
      ],
    });
    render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('project')}
      />,
    );

    const moneyRow = screen.getByRole('button', { name: /Money/ });
    expect(moneyRow).toHaveTextContent('$16,330 not drawn');
    expect(moneyRow).not.toHaveTextContent('$0 moved');
    mockPurchaseOrderRows.length = 0;
  });

  it('pays for no money read on a spread that prints no money row', () => {
    // The four commercial hooks were already gated on `printsMoneyRow`; these
    // two take no `enabled`, so the gate has to be a conditional MOUNT.
    mockLadderReads.purchaseOrders = 0;
    mockLadderReads.invoices = 0;

    for (const section of ['install', 'care'] as const) {
      const { unmount } = render(
        <DocSpineShelvedBlocks
          {...props}
          regions={paperRegionsForSection(section)}
        />,
      );
      unmount();
    }
    expect(mockLadderReads).toEqual({ purchaseOrders: 0, invoices: 0 });

    render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('project')}
      />,
    );
    expect(mockLadderReads.purchaseOrders).toBeGreaterThan(0);
    expect(mockLadderReads.invoices).toBeGreaterThan(0);
  });
});
