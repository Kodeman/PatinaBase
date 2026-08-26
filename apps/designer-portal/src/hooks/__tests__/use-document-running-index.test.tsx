import { act, fireEvent, render, screen } from '@testing-library/react';
import { useDocumentRunningIndex } from '../use-document-running-index';
import {
  DOCUMENT_INDEX_KEYS,
  UNFOLD_REGION_EVENT,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

function Probe({
  keys = DOCUMENT_INDEX_KEYS,
}: {
  keys?: readonly DocumentIndexKey[];
}) {
  const { activeKey, jump } = useDocumentRunningIndex(keys, 'proj-1');
  return (
    <div>
      <span data-testid="active">{activeKey ?? 'none'}</span>
      <button type="button" onClick={() => jump('money')}>
        jump
      </button>
    </div>
  );
}

describe('useDocumentRunningIndex', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom has no scroller; the jump's rAF work must still be allowed to run.
    Element.prototype.scrollIntoView = jest.fn();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function mountRegions(keys: readonly DocumentIndexKey[] = DOCUMENT_INDEX_KEYS) {
    const host = document.createElement('div');
    for (const key of keys) {
      const section = document.createElement('section');
      section.setAttribute('data-index-region', key);
      host.appendChild(section);
    }
    document.body.appendChild(host);
    return host;
  }

  it('asks a region to unfold before it jumps — the index never lands on a seam', () => {
    mountRegions();
    const seen: DocumentIndexKey[] = [];
    const listener = (e: Event) => {
      const region = (e as CustomEvent<{ region?: DocumentIndexKey }>).detail
        ?.region;
      if (region) seen.push(region);
    };
    window.addEventListener(UNFOLD_REGION_EVENT, listener);

    render(<Probe />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });

    expect(seen).toEqual(['money']);
    window.removeEventListener(UNFOLD_REGION_EVENT, listener);
  });

  it('commits the reading line to the jump target rather than walking there', () => {
    mountRegions();
    render(<Probe />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');

    // The lock lapses with the scroll; the last region then owns the foot of
    // the paper, which is where a jump to it leaves the reader.
    act(() => {
      jest.advanceTimersByTime(1000);
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');
  });

  // C11 — the page hands the index the regions THIS spread mounts, but a
  // spread can still name a region whose root never appears (the install
  // spread's FF&E ledger prints no region root, and a pinned Worktable
  // composition can put a different section on the paper). The reading line
  // must stay on what the DOM actually answers for.
  it('never lands the reading line on a region the spread did not mount', () => {
    const installKeys: DocumentIndexKey[] = ['approvals', 'schedule', 'ffe'];
    mountRegions(['approvals']);
    render(<Probe keys={installKeys} />);

    act(() => {
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });

    // jsdom's document has no height, so the foot-of-the-paper branch decides
    // this: unguarded it would hand the line to 'ffe', the last KEY, whose
    // root is nowhere on the page.
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');
  });

  it('marks nothing at all while no region root has mounted', () => {
    render(<Probe keys={['approvals', 'schedule', 'ffe']} />);

    act(() => {
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByTestId('active')).toHaveTextContent('none');
  });
});
