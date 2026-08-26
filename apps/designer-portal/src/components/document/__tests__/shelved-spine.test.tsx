import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRoomLens, RoomLensProvider } from '../room-lens-context';
import { SpineRunningIndex } from '../spine-running-index';
import { SpineRoomsBlock } from '../spine-rooms-block';
import { SpineShelvesBlock } from '../spine-shelves-block';
import { DocSpineShelvedBlocks } from '../spine-shelved-blocks';
import { ShelfPanel } from '../shelves/shelf-panel';
import { requestShelfClose } from '@/lib/document/shelves';
import {
  PROJECT_PAPER_ORDER,
  paperRegionsForSection,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

/** The blocks' four reads; none of them is this file's subject. */
jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useProjectFFEItems: () => ({ data: [] }),
  useProjectBoards: () => ({ data: [] }),
  useProjectOwnedBoards: () => ({ data: [] }),
  usePlanRoom: () => ({ data: { sheets: [] } }),
}));
jest.mock('@/hooks/use-commercial-documents', () => ({
  __esModule: true,
  useProjectBillingAuthority: () => ({
    isLoading: false,
    error: null,
    data: { authorizedCents: 0 },
  }),
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
  money: '$24,000 authority',
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
      screen.getByRole('button', { name: /Project · FF&E/ }),
    ).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Schedule/ })).toHaveAttribute(
      'aria-current',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: /Design authority/ }));
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
      'Project · FF&E',
      'Design authority',
    ]);
  });

  it('takes the "In this document" name the presence line used to carry', () => {
    render(
      <SpineRunningIndex entries={entries} activeKey={null} onJump={jest.fn()} />,
    );
    expect(screen.getByText('In this document')).toBeInTheDocument();
  });
});

describe('the rooms block', () => {
  const rooms = [
    { id: 'r1', name: 'Kitchen', stateWord: 'Underway' },
    { id: 'r2', name: 'Entry', stateWord: 'Not started' },
  ];

  it('presses the held room and keeps its state word beside the hold', () => {
    render(
      <SpineRoomsBlock
        rooms={rooms}
        heldRoomId="r1"
        onToggleRoom={jest.fn()}
      />,
    );
    const kitchen = screen.getByRole('button', { name: /Kitchen/ });
    expect(kitchen).toHaveAttribute('aria-pressed', 'true');
    expect(kitchen).toHaveTextContent('In hand');
    expect(kitchen).toHaveTextContent('Underway');
    expect(screen.getByRole('button', { name: /Entry/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('asks its room to be taken in hand', () => {
    const onToggleRoom = jest.fn();
    render(
      <SpineRoomsBlock
        rooms={rooms}
        heldRoomId={null}
        onToggleRoom={onToggleRoom}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Entry/ }));
    expect(onToggleRoom).toHaveBeenCalledWith('r2');
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

describe('the shelves block', () => {
  const statuses = {
    planroom: '4 sheets',
    specbook: '10 specified · by room',
    moodboards: '3 boards',
    callsheet: '3 on the roster',
    knowledge: 'Studio library',
  };

  it('declares expansion on the leaf shelves only', () => {
    render(
      <SpineShelvesBlock
        openShelf="specbook"
        statuses={statuses}
        callSheetEnabled
        onToggleShelf={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Spec book/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: /Plan room/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // The call sheet is a doorway to the roster sheet, not a leaf — it must not
    // promise a panel it never opens here.
    expect(
      screen.getByRole('button', { name: /Call sheet/ }),
    ).not.toHaveAttribute('aria-expanded');
  });

  it('names every shelf trigger so the leaf can hand focus back', () => {
    render(
      <SpineShelvesBlock
        openShelf={null}
        statuses={statuses}
        callSheetEnabled
        onToggleShelf={jest.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Mood boards/ }),
    ).toHaveAttribute('data-shelf-trigger', 'moodboards');
  });

  it('points aria-controls at the leaf only while the leaf is on the page', () => {
    const { rerender } = render(
      <SpineShelvesBlock
        openShelf={null}
        statuses={statuses}
        callSheetEnabled
        onToggleShelf={jest.fn()}
      />,
    );
    // A closed leaf renders nothing — naming its id would offer a jump into a
    // void.
    expect(
      screen.getByRole('button', { name: /Spec book/ }),
    ).not.toHaveAttribute('aria-controls');

    rerender(
      <SpineShelvesBlock
        openShelf="specbook"
        statuses={statuses}
        callSheetEnabled
        onToggleShelf={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Spec book/ })).toHaveAttribute(
      'aria-controls',
      'doc-shelf-leaf',
    );
  });
});

describe('the shelf leaf', () => {
  function Harness({ open }: { open: boolean }) {
    return (
      <>
        <button type="button" data-shelf-trigger="specbook">
          Spec book
        </button>
        <ShelfPanel
          openShelf={open ? 'specbook' : null}
          onClose={jest.fn()}
        >
          <p>leaf body</p>
        </ShelfPanel>
      </>
    );
  }

  it('renders nothing while no shelf is pulled out', () => {
    render(<Harness open={false} />);
    expect(screen.queryByText('leaf body')).not.toBeInTheDocument();
  });

  it('is a region, not a dialog — the paper behind stays live', () => {
    render(<Harness open />);
    const leaf = screen.getByRole('region', { name: 'Spec book shelf' });
    expect(leaf).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes focus to its close word on open', () => {
    render(<Harness open />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /Close/ }),
    );
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="planroom" onClose={onClose}>
        <p>leaf body</p>
      </ShelfPanel>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('stands down from Escape while a sheet is open over it', () => {
    const onClose = jest.fn();
    render(
      <>
        <div role="dialog" aria-label="A sheet" />
        <ShelfPanel openShelf="planroom" onClose={onClose}>
          <p>leaf body</p>
        </ShelfPanel>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when a leaf asks to be put away', () => {
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="moodboards" onClose={onClose}>
        <p>leaf body</p>
      </ShelfPanel>,
    );
    act(() => {
      requestShelfClose();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('hands focus back to the shelf row it came from', () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Spec book' }),
    );
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

  it('drops the money region on install and on care — neither spread mounts it', () => {
    for (const section of ['install', 'care'] as const) {
      expect(paperRegionsForSection(section).map((r) => r.key)).toEqual([
        'approvals',
        'schedule',
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

describe('the shelved blocks', () => {
  const props = {
    projectId: 'proj-1',
    rooms: [],
    scheduleValue: 'Week 1 of 14',
    approvalsValue: '3 in the log',
    rosterCount: 0,
    callSheetEnabled: false,
    openShelf: null,
    onToggleShelf: jest.fn(),
  } as const;

  beforeEach(() => {
    mockRunningIndexCalls.length = 0;
  });

  const indexRows = () =>
    Array.from(
      screen
        .getByRole('group', { name: 'In this document' })
        .querySelectorAll('button'),
    );

  it('prints one index line per region the spread mounts — four on project', () => {
    render(
      <DocSpineShelvedBlocks
        {...props}
        regions={paperRegionsForSection('project')}
      />,
    );
    expect(indexRows()).toHaveLength(4);
  });

  it('prints three on install and on care — no line for the money region', () => {
    for (const section of ['install', 'care'] as const) {
      const { unmount } = render(
        <DocSpineShelvedBlocks
          {...props}
          regions={paperRegionsForSection(section)}
        />,
      );
      const rows = indexRows().map((b) => b.querySelector('span')?.textContent);
      expect(rows).toHaveLength(3);
      expect(rows).not.toContain('Design authority');
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
    expect(mockRunningIndexCalls[0]).toEqual(['approvals', 'schedule', 'ffe']);
  });
});
