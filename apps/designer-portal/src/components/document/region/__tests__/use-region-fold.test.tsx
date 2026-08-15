import { act, render, screen } from '@testing-library/react';
import { useRegionFold, type UseRegionFoldArgs } from '../use-region-fold';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { regionFolded: jest.fn() },
}));

import { documentEvents } from '@/lib/analytics/document-events';

const events = documentEvents as unknown as {
  regionFolded: jest.Mock;
};

function Probe(props: UseRegionFoldArgs) {
  const { folded, toggle, setFolded } = useRegionFold(props);
  return (
    <div>
      <span data-testid="state">{folded ? 'folded' : 'open'}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
      <button type="button" onClick={() => setFolded(true)}>
        fold
      </button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;
const KEY = 'patina:doc-fold:doc-1:schedule';

beforeEach(() => {
  window.localStorage.clear();
  events.regionFolded.mockClear();
});

describe('useRegionFold', () => {
  it('applies the derived default when no choice has been made', () => {
    render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('folded');
  });

  it('persists a toggle under the document/region key and reports it', () => {
    render(<Probe docId="doc-1" region="schedule" defaultFolded={false} />);
    expect(state()).toBe('open');
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(state()).toBe('folded');
    expect(window.localStorage.getItem(KEY)).toBe('1');
    expect(events.regionFolded).toHaveBeenCalledWith({
      region: 'schedule',
      folded: true,
    });
  });

  it('reads a remembered choice back on mount', () => {
    window.localStorage.setItem(KEY, '0');
    render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('open');
  });

  it('keeps an explicit choice when a default arrives late', () => {
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={null} />,
    );
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(state()).toBe('folded');
    rerender(<Probe docId="doc-1" region="schedule" defaultFolded={false} />);
    expect(state()).toBe('folded');

    // and the reverse: an opened region is not yanked shut by a late default
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    rerender(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('open');
  });

  it('latches a settling default only while no choice exists', () => {
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={null} />,
    );
    expect(state()).toBe('open');
    rerender(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('folded');
  });

  it('lets forceOpen override both the choice and the default', () => {
    window.localStorage.setItem(KEY, '1');
    render(
      <Probe
        docId="doc-1"
        region="schedule"
        defaultFolded={true}
        forceOpen
      />,
    );
    expect(state()).toBe('open');
  });

  it('records nothing for a fold gesture no one can see under forceOpen', () => {
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={false} forceOpen />,
    );
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    act(() => {
      screen.getByRole('button', { name: 'fold' }).click();
    });

    expect(state()).toBe('open');
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(events.regionFolded).not.toHaveBeenCalled();

    // And once the force lapses the region reads its own default again, not a
    // fold the designer never watched happen.
    rerender(<Probe docId="doc-1" region="schedule" defaultFolded={false} />);
    expect(state()).toBe('open');
  });

  it('keeps the drafting strip\'s fold apart from the ledger schedule\'s', () => {
    // Both are mounted at once on a project document; one storage key between
    // them would fold each with the other's choice.
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={false} />,
    );
    act(() => {
      screen.getByRole('button', { name: 'fold' }).click();
    });
    expect(window.localStorage.getItem(KEY)).toBe('1');

    rerender(
      <Probe docId="doc-1" region="schedule-rule" defaultFolded={false} />,
    );
    expect(state()).toBe('open');
    expect(
      window.localStorage.getItem('patina:doc-fold:doc-1:schedule-rule'),
    ).toBeNull();

    act(() => {
      screen.getByRole('button', { name: 'fold' }).click();
    });
    expect(
      window.localStorage.getItem('patina:doc-fold:doc-1:schedule-rule'),
    ).toBe('1');
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  it('releases the latched default when the document changes', () => {
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={true} />,
    );
    expect(state()).toBe('folded');

    // The next document's own default has not settled yet — the previous
    // document's answer must not stand in for it.
    rerender(<Probe docId="doc-2" region="schedule" defaultFolded={null} />);
    expect(state()).toBe('open');

    rerender(<Probe docId="doc-2" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('folded');
  });

  it('degrades gracefully when storage throws', () => {
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('folded');
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(state()).toBe('open');
    getItem.mockRestore();
    setItem.mockRestore();
  });

  // The remembered choice is read in an effect, never during render, so the
  // server's markup is always the derived default — which is what makes the
  // first client render agree with what React hydrated.
  // The remembered choice is read in an effect, never during render — that is
  // what makes the markup a server produced (which has no storage to read) and
  // the client's first render agree. So the FIRST render must show the derived
  // default even when storage already holds the opposite answer.
  it('shows the derived default on its first render, before storage is read', () => {
    window.localStorage.setItem(KEY, '0');
    const firstRenders: boolean[] = [];
    function Recorder(props: UseRegionFoldArgs) {
      const { folded } = useRegionFold(props);
      firstRenders.push(folded);
      return null;
    }
    render(<Recorder docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(firstRenders[0]).toBe(true);
    expect(firstRenders[firstRenders.length - 1]).toBe(false);
  });

  it('renders the default with no document to key on', () => {
    render(<Probe docId={null} region="schedule" defaultFolded={true} />);
    expect(state()).toBe('folded');
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(state()).toBe('open');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
