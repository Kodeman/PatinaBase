import { act, render, screen } from '@testing-library/react';
import {
  useRegionFold,
  type RegionDensity,
  type UseRegionFoldArgs,
} from '../use-region-fold';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { regionFolded: jest.fn() },
}));

import { documentEvents } from '@/lib/analytics/document-events';

const events = documentEvents as unknown as {
  regionFolded: jest.Mock;
};

function Probe(props: UseRegionFoldArgs) {
  const { folded, density, cause, toggle, setFolded } = useRegionFold(props);
  return (
    <div>
      <span data-testid="state">{folded ? 'folded' : 'open'}</span>
      <span data-testid="density">{density}</span>
      <span data-testid="cause">{cause ?? '—'}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
      <button type="button" onClick={() => setFolded(true)}>
        fold
      </button>
      <button type="button" onClick={() => setFolded(false)}>
        open
      </button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;
const density = () => screen.getByTestId('density').textContent;
const cause = () => screen.getByTestId('cause').textContent;
const KEY = 'patina:doc-fold:doc-1:schedule';
const RULE_KEY = 'patina:doc-fold:doc-1:schedule-rule';

beforeEach(() => {
  window.localStorage.clear();
  events.regionFolded.mockClear();
});

describe('useRegionFold', () => {
  // R127/OD-10 — was: a derived default folded the region shut. Now, on a STOP
  // key, the same default only QUIETS it: the region stands open, printing head
  // + count line + one leader. Only the designer can shut a stop, so a region
  // she never touched prints no cause either.
  it('quiets a stop key on its derived default instead of folding it', () => {
    render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('open');
    expect(density()).toBe('quiet');
    expect(cause()).toBe('—');
  });

  // The other half of OD-10: the three keys with no [data-index-region] root
  // keep I136's derived-default fold, and are always `full` when open.
  it('keeps the derived-default fold on a non-stop key', () => {
    render(<Probe docId="doc-1" region="schedule-rule" defaultFolded={true} />);
    expect(state()).toBe('folded');
    expect(density()).toBe('full');
    expect(cause()).toBe('—');
  });

  it('prints CLOSED BY YOU only once the designer has folded it herself', () => {
    render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(cause()).toBe('—');

    act(() => {
      screen.getByRole('button', { name: 'fold' }).click();
    });
    expect(state()).toBe('folded');
    expect(cause()).toBe('CLOSED BY YOU');

    // And an explicit OPEN is a choice too, but not a cause — nothing is shut.
    act(() => {
      screen.getByRole('button', { name: 'open' }).click();
    });
    expect(cause()).toBe('—');
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

  // Unchanged mechanic, read out in the new vocabulary: on a stop key the
  // latched default no longer lands on `folded`, it lands on `density`.
  it('latches a settling default only while no choice exists', () => {
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={null} />,
    );
    expect(density()).toBe('full');
    rerender(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(density()).toBe('quiet');
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

  // Same mechanic as before, now observed on `density` (the stop key's landing
  // place for a derived default) rather than on `folded`.
  it('releases the latched default when the document changes', () => {
    const { rerender } = render(
      <Probe docId="doc-1" region="schedule" defaultFolded={true} />,
    );
    expect(density()).toBe('quiet');

    // The next document's own default has not settled yet — the previous
    // document's answer must not stand in for it.
    rerender(<Probe docId="doc-2" region="schedule" defaultFolded={null} />);
    expect(density()).toBe('full');

    rerender(<Probe docId="doc-2" region="schedule" defaultFolded={true} />);
    expect(density()).toBe('quiet');
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
    // A throwing store reads as "no choice", so the derived default governs —
    // on a stop key that is `quiet`, not `folded` — and the fold the designer
    // then makes takes effect in memory even though it cannot be written down.
    render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(state()).toBe('open');
    expect(density()).toBe('quiet');
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(state()).toBe('folded');
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
    // The stop key's derived default is `quiet`; the remembered OPEN in storage
    // is `full`. Same assertion as before — the first render must be the
    // default, the settled one the remembered choice — read off density.
    window.localStorage.setItem(KEY, '0');
    const firstRenders: RegionDensity[] = [];
    function Recorder(props: UseRegionFoldArgs) {
      const { density: d } = useRegionFold(props);
      firstRenders.push(d);
      return null;
    }
    render(<Recorder docId="doc-1" region="schedule" defaultFolded={true} />);
    expect(firstRenders[0]).toBe('quiet');
    expect(firstRenders[firstRenders.length - 1]).toBe('full');
  });

  it('renders the default with no document to key on', () => {
    render(<Probe docId={null} region="schedule" defaultFolded={true} />);
    expect(state()).toBe('open');
    expect(density()).toBe('quiet');
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(state()).toBe('folded');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  // R127 — the fourth voice. The lens reads where the reader is and says only
  // how much to print; it is the lowest voice, it is never written down, and
  // it can never reach `folded`.
  describe('the position voice', () => {
    it('moves a stop between quiet and full without touching storage', () => {
      const { rerender } = render(
        <Probe docId="doc-1" region="schedule" defaultFolded={true} />,
      );
      expect(density()).toBe('quiet');

      rerender(
        <Probe
          docId="doc-1"
          region="schedule"
          defaultFolded={true}
          positionDensity="full"
        />,
      );
      expect(density()).toBe('full');
      expect(state()).toBe('open');

      rerender(
        <Probe
          docId="doc-1"
          region="schedule"
          defaultFolded={true}
          positionDensity="quiet"
        />,
      );
      expect(density()).toBe('quiet');
      expect(state()).toBe('open');

      // Nothing the lens said was remembered, and nothing it said was reported
      // as a choice the designer made.
      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(events.regionFolded).not.toHaveBeenCalled();
    });

    it('never reaches folded, whatever the derived default says', () => {
      for (const spoken of ['full', 'quiet'] as const) {
        for (const derived of [true, false, null]) {
          const { unmount } = render(
            <Probe
              docId="doc-1"
              region="schedule"
              defaultFolded={derived}
              positionDensity={spoken}
            />,
          );
          expect(state()).toBe('open');
          expect(density()).toBe(spoken);
          unmount();
        }
      }
    });

    it('is outranked by the designer’s own choice, both ways', () => {
      // She shut it: the lens asking for `full` does not reopen it.
      window.localStorage.setItem(KEY, '1');
      const shut = render(
        <Probe
          docId="doc-1"
          region="schedule"
          defaultFolded={false}
          positionDensity="full"
        />,
      );
      expect(state()).toBe('folded');
      expect(cause()).toBe('CLOSED BY YOU');
      shut.unmount();

      // She opened it: the lens asking for `quiet` does not shrink it back.
      window.localStorage.setItem(KEY, '0');
      render(
        <Probe
          docId="doc-1"
          region="schedule"
          defaultFolded={true}
          positionDensity="quiet"
        />,
      );
      expect(state()).toBe('open');
      expect(density()).toBe('full');
    });

    it('says nothing at all on a key with no root to observe', () => {
      render(
        <Probe
          docId="doc-1"
          region="schedule-rule"
          defaultFolded={true}
          positionDensity="quiet"
        />,
      );
      expect(state()).toBe('folded');
      expect(density()).toBe('full');
      expect(window.localStorage.getItem(RULE_KEY)).toBeNull();
    });
  });
});
